#!/usr/bin/env node
// @doc Complete affected-test coverage, separate from bounded runner admission.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(import.meta.url);
const VERSION = 1;
const SHA = /^[a-f0-9]{40,64}$/;
const MODES = new Set(['draft', 'ready', 'train', 'nightly', 'manual']);
const unique = xs => [...new Set(xs)];
export const coverageDigest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function computePlanDigest(plan) {
  const { digest, coverageDigest: ignored, ...body } = plan;
  return coverageDigest({ ...body, tasks: body.tasks.map(({ planDigest, ...task }) => task) });
}
export const bundleId = (planDigest, tasks) => `bundle-${coverageDigest({ planDigest, tasks: tasks.map(t => t.id) }).slice(0, 20)}`;
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();

/** Always use a separate trusted process: legacy AST helpers have module-local
 * roots. Never import or execute JavaScript from the source checkout to plan it. */
export async function planCoverage(options = {}) {
  const root = fs.realpathSync(options.root || process.cwd());
  if (!path.isAbsolute(options.root || root) || !fs.statSync(root).isDirectory()) throw new Error('source root must be an absolute existing directory');
  const result = spawnSync(process.execPath, [HERE, '--internal-plan'], {
    input: JSON.stringify({ ...options, root }), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, APEX_CI_SOURCE_ROOT: root },
  });
  if (result.status !== 0) throw new Error(`coverage planning failed: ${result.stderr || result.error || result.status}`);
  return JSON.parse(result.stdout);
}

async function buildPlan({ root, since, mode = 'ready', files, sourceSha, baseSha, treeSha, requestId = '', env = {} }) {
  if (!MODES.has(mode)) throw new Error(`unknown coverage mode ${mode}`);
  const [selector, budget, twins, routing, geometry] = await Promise.all([
    import('../select-specs.mjs'), import('../select-budget.mjs'), import('../twinned-specs.mjs'),
    import('../pick-tests.mjs'), import('../geometry-paths.mjs'),
  ]);
  const head = git(root, ['rev-parse', 'HEAD']);
  sourceSha ||= head;
  if (!SHA.test(sourceSha) || sourceSha !== head) throw new Error('source SHA must name the checked out HEAD');
  treeSha ||= git(root, ['rev-parse', 'HEAD^{tree}']);
  if (!SHA.test(treeSha) || treeSha !== git(root, ['rev-parse', 'HEAD^{tree}'])) throw new Error('source tree mismatch');
  let unknownBase = false;
  try { baseSha ||= git(root, ['rev-parse', '--verify', `${since}^{commit}`]); }
  catch { unknownBase = true; baseSha = ''; }
  if (baseSha && !SHA.test(baseSha)) throw new Error('invalid base SHA');
  if (!Array.isArray(files)) {
    if (unknownBase) files = git(root, ['ls-files', '-z']).split('\0').filter(Boolean);
    else {
      const { changedPaths } = await import('../../lib/changed-files.mjs');
      files = changedPaths([baseSha, sourceSha], { cwd: root });
    }
  }
  if (files.some(f => typeof f !== 'string' || f.startsWith('/') || f.split('/').includes('..') || /[\0\r\n]/.test(f))) throw new Error('unsafe changed path');
  const groups = JSON.parse(fs.readFileSync(path.join(root, 'tests/groups.json'), 'utf8'));
  const scripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
  const selected = selector.select(baseSha || undefined, 10, { files });
  if (selected.coverageGaps?.length) throw new Error(`affected source has no module-specific coverage: ${selected.coverageGaps.map(g => g.dir).join(', ')}`);
  const broad = unknownBase || ['infra', 'unmatched'].includes(selected.reason) || ['nightly', 'manual'].includes(mode);
  const docs = !broad && selected.reason === 'docs';
  const tasks = [];
  const add = (kind, suite, commands, ids, extra = {}) => {
    const id = `${kind}-${coverageDigest({ suite, ids, commands }).slice(0, 16)}`;
    const task = { id, kind, suite, runner: 'ubuntu-latest', specs: [], expectedSeconds: 120,
      setupSeconds: 120, prerequisites: [], coverageIds: unique(ids), sourceSha, treeSha, baseSha,
      requestId, commands, environment: { node: '22', backend: 'node' }, ...extra };
    task.argv = commands[0]?.argv || [];
    tasks.push(task);
    return task;
  };
  const node = (...args) => ({ command: 'node', argv: args });
  const test = (paths, flags = []) => node('--test', '--test-timeout=900000', ...flags, ...paths);
  const guards = [];
  for (let i = 1; i <= 4; i++) guards.push(add('guard', `tooling-${i}`, [
    node('tools/ci/tooling-fast.mjs', '--jobs=4', `--shard=${i}/4`, '--bail'),
  ], [`guard:tooling:${i}/4`], { expectedSeconds: 240 }));
  const checks = [node('tools/ci/test-coverage-audit.mjs'), node('tools/ci/ci-coverage.mjs'),
    node('tools/check/ratchets.mjs', ...(baseSha ? ['--base', baseSha] : []))];
  // The generator's npm alias is the stable interface; resolve only its fixed
  // executable rather than evaluating an arbitrary package script.
  checks.push({ command: 'npm', argv: ['run', 'gen:check'] });
  if (baseSha && ['draft', 'ready'].includes(mode)) checks.push(node('tools/check/tolerance-diff.mjs', '--base', baseSha));
  add('guard', 'structural-contracts', checks, ['guard:audit', 'guard:coverage', 'guard:ratchets', 'guard:generated', ...(baseSha && ['draft', 'ready'].includes(mode) ? ['guard:tolerances'] : [])]);
  add('lint', 'workflow-and-shaders', [node('tools/check/workflow-lint.mjs'), node('tools/check/shader-validate.mjs'),
    test(['tests/unit/workflow-lint.test.mjs', 'tests/unit/shader-validate.test.mjs'])], ['lint:workflow', 'lint:shader', 'lint:planted-defects'],
  { environment: { node: '22', backend: 'node', lintBins: true }, env: { APEX_REQUIRE_LINT_BINS: '1' } });

  const browserCandidates = broad
    ? fs.readdirSync(path.join(root, 'tests/specs')).filter(f => f.endsWith('.spec.js')).map(f => ({ file: `tests/specs/${f}`, rank: 3 }))
    : selected.candidateSpecs;
  const browser = [];
  const coveredTwins = [];
  const exclusions = [];
  const { loadQuarantine } = await import('../../../tests/helpers/flaky-policy.mjs');
  const quarantine = loadQuarantine(path.join(root, 'tests/data/flaky-quarantine.json'));
  for (const candidate of browserCandidates) {
    const file = candidate.file;
    if (selector.MANUAL_OPT_IN_SPECS.has(file)) {
      exclusions.push({ id: `browser:${file}`, reason: 'explicit manual opt-in; separate environment/project, outside automatic required coverage' });
      continue;
    }
    if (twins.TWINNED[file] || twins.ADAPTED[file]) {
      if (twins.TWINNED[file]) {
        const browserCount = budget.declaredTests(file), nodeCount = budget.declaredTests(twins.TWINNED[file]);
        if (!Number.isInteger(browserCount) || browserCount < 1 || browserCount !== nodeCount) throw new Error(`VM twin assertion-count drift: ${file} (${browserCount}) vs ${twins.TWINNED[file]} (${nodeCount})`);
      }
      coveredTwins.push(file); continue;
    }
    if (selector.FIXED_GATE_SPECS.has(file)) continue;
    const count = budget.declaredTests(file);
    if (!Number.isInteger(count) || count < 1) throw new Error(`unreadable or empty required spec: ${file}`);
    browser.push({ ...candidate, tests: count, sec: Math.max(1, Math.ceil(count * budget.specSecPerTest(file).sec)), ownTimeoutSec: selector.maxDeclaredTimeout(file) / 1000 });
  }
  const requiredGuards = tasks.filter(t => t.kind === 'guard' || t.kind === 'lint').map(t => t.id);
  const addBrowser = (suite, specs, extra = {}) => {
    // A planned browser ID must execute in Chromium even if the source's own
    // twin registry changes. VM substitutions were already planned explicitly.
    const flags = ['--with-twinned', '--workers=1', `--retries=${extra.retries || 0}`, '--max-failures=3', `--timeout=${extra.perTestTimeoutMillis || 180000}`, ...(extra.flags || [])];
    const task = add(extra.kind || 'browser', suite, [node('tools/ci/run-playwright.mjs', ...specs, ...flags)],
      extra.coverageIds || specs.map(f => `browser:${f}`), {
        specs, expectedSeconds: extra.expectedSeconds || 240, setupSeconds: 180,
        prerequisites: requiredGuards, environment: { node: '22', backend: 'llvmpipe', browser: 'chromium' },
        env: { APEX_WORKERS: '1', APEX_FAIL_ON_FLAKY: '1', APEX_GL: 'llvmpipe', LIBGL_ALWAYS_SOFTWARE: '1', APEX_CIRCUITS: (selected.circuits || []).join(',') }, ...extra,
      });
    delete task.flags;
    return task;
  };
  // Reuse the old AST and timeout-aware sharder, but feed its COMPLETE input.
  // No fit(), overflow, spill or dropped pool is an admission boundary here.
  for (const row of browser.sort((a, b) => a.rank - b.rank || a.file.localeCompare(b.file))) {
    const pieces = selector.shards({ selected: [row], oversize: [], overflow: [], overBudgetRun: [], spill: [], circuits: selected.circuits || [] }, budget.timings(), quarantine);
    for (const piece of pieces) addBrowser(row.file, [row.file], {
      expectedSeconds: piece.sec, timeoutMinutes: piece.timeout, retries: piece.retries || 0,
      flags: piece.shard ? [`--shard=${piece.shard}`] : [],
      coverageIds: [`browser:${row.file}${piece.shard ? `#${piece.shard}` : ''}`],
      environment: { node: '22', backend: row.file.includes('menu-baseline') ? 'swiftshader' : 'llvmpipe', browser: 'chromium' },
      priority: row.rank, env: { APEX_WORKERS: '1', APEX_FAIL_ON_FLAKY: '1', APEX_GL: row.file.includes('menu-baseline') ? '' : 'llvmpipe', LIBGL_ALWAYS_SOFTWARE: '1', APEX_CIRCUITS: (selected.circuits || []).join(',') },
    });
  }

  if (!docs) {
    const names = new Set([...routing.pick(files).keys()]);
    // Derive node ownership from the source's generated manifest. Unknown
    // paths and shared harness/infra changes conservatively run all node groups.
    const allNode = broad || files.some(f => /^(tests\/helpers\/|tools\/lib\/|tests\/groups\.json$)/.test(f));
    const wanted = Object.entries(groups.groups).filter(([name, group]) => group.kind === 'node'
      && name !== 'test:docs-guards' && name !== 'test:tooling-fast'
      && (allNode || names.has(name.slice(5)) || group.files?.some(f => files.includes(f))));
    // Domain routing names browser groups; preserve their VM counterparts and
    // topical riders using the established node-plan mapping.
    const { SCOPED, ALWAYS_ON_TOPICAL } = await import('../node-plan.mjs');
    const extraNames = new Set(ALWAYS_ON_TOPICAL);
    for (const [script, needs] of Object.entries(SCOPED)) if (!needs || needs.some(n => names.has(n))) extraNames.add(script);
    for (const [name, group] of Object.entries(groups.groups)) if (group.kind === 'node' && extraNames.has(name) && !wanted.some(([n]) => n === name)) wanted.push([name, group]);
    const seenNode = new Set();
    const isolated = new Set(groups.isolatedFiles || []);
    for (const [name, group] of wanted) {
      const paths = group.files.filter(f => !seenNode.has(f));
      for (const f of paths) seenNode.add(f);
      if (!paths.length) continue;
      const phases = paths.filter(f => isolated.has(f)).map(f => [f]);
      if (paths.some(f => !isolated.has(f))) phases.push(paths.filter(f => !isolated.has(f)));
      add('node', name, phases.map(p => test(p, group.flags || [])), paths.map(f => `node:${f}`), { expectedSeconds: 300 });
    }
    // Every browser substitution has an explicit execution owner even when a
    // node routing table is stale. Hand twins run only once across node groups.
    for (const spec of coveredTwins) {
      const twin = twins.TWINNED[spec];
      const owner = twin && tasks.find(t => t.coverageIds.includes(`node:${twin}`));
      if (owner) owner.coverageIds.push(`browser-substitution:${spec}`);
      else if (twin) add('node', twin, [test([twin])], [`node:${twin}`, `browser-substitution:${spec}`]);
      else add('node', spec, [{ ...test([spec]), env: { APEX_VM_PAGE: '1' } }], [`browser-substitution:${spec}`], { expectedSeconds: 300 });
    }
    const sweepFiles = groups.groups['test:sweeps']?.files || [];
    const fleet = broad || files.some(f => geometry.GEOMETRY_PATHS.test(f) || sweepFiles.includes(f));
    const sweeps = fleet ? sweepFiles : geometry.targetedSuites(files, sweepFiles);
    const notRun = sweeps.filter(f => !seenNode.has(f));
    if (notRun.length) add('node', 'geometry', [test(notRun, ['--test-concurrency=1'])], notRun.map(f => `node:${f}`), { expectedSeconds: 540, env: { APEX_CIRCUITS: (selected.circuits || []).join(',') } });
    if (broad || files.some(f => new RegExp(geometry.PARTS_ERE()).test(f) || f === 'tests/unit/parts-visual-distinctness.test.mjs')) {
      const f = 'tests/unit/parts-visual-distinctness.test.mjs';
      if (!tasks.some(t => t.coverageIds.includes(`node:${f}`))) add('node', 'parts-census', [test([f])], [`node:${f}`]);
    }
    addBrowser('smoke', ['tests/specs/smoke.spec.js'], { perTestTimeoutMillis: 900000 });
    if (broad || coveredTwins.length || files.some(f => /^(js\/(physics\/|game\.js)|tests\/data\/physics-baseline\.json|tests\/specs\/physics-characterization)/.test(f))) addBrowser('physics-characterization', ['tests/specs/physics-characterization.spec.js'], { expectedSeconds: 600, perTestTimeoutMillis: 240000 });
    // Stage is an executor-owned operation: validate minification/stamp, serve
    // only _site, and boot it. It never borrows the checkout-root server.
    add('staged', 'staged-boot', [], ['staged:minified-stamped-boot'], { expectedSeconds: 300, setupSeconds: 180, prerequisites: requiredGuards,
      environment: { node: '22', backend: 'llvmpipe', browser: 'chromium' }, env: { APEX_WORKERS: '1', APEX_FAIL_ON_FLAKY: '1', APEX_GL: 'llvmpipe', LIBGL_ALWAYS_SOFTWARE: '1' } });
    const gfx = routingSpecs(scripts['test:gfx']);
    if (broad || files.some(f => /^(js\/(render\/|lighting\/)|playwright(\.gpu)?\.config\.js$|tests\/helpers\/)/.test(f) || gfx.includes(f))) {
      const census = add('renderer', 'metal-adapter-census', [node('tools/gfx/gpu-census.mjs', '--json', 'artifacts/census-macos.json')], ['metal:adapter-census'], { runner: 'macos-latest', setupSeconds: 180,
        prerequisites: requiredGuards, environment: { node: '22', backend: 'metal', browser: 'chromium' } });
      for (const spec of gfx) addBrowser('renderer-metal', [spec], { kind: 'renderer', runner: 'macos-latest', flags: ['--config=playwright.gpu.config.js'], prerequisites: [...requiredGuards, census.id],
        expectedSeconds: Math.max(30, Math.ceil((budget.declaredTests(spec) || 1) * budget.specSecPerTest(spec).sec)), perTestTimeoutMillis: 600000,
        coverageIds: [`metal:${spec}`], environment: { node: '22', backend: 'metal', browser: 'chromium' }, env: { APEX_WORKERS: '1', APEX_FAIL_ON_FLAKY: '1' } });
    }
    if (broad || files.some(f => /^(js\/xr\/|js\/render\/(renderer-boot\.js|glx\/glx\.js|three\/tlx\.js)$|tools\/manifest\.cjs$|tests\/specs\/(vr-emulated|xr-plan)\.spec\.js$|tests\/helpers\/iwer-install\.mjs$|tests\/vendor\/iwer-|playwright\.config\.js$)/.test(f))) {
      const specs = routingSpecs(scripts['test:xr']);
      addBrowser('xr', specs, { flags: ['--project=xr-emulated'], perTestTimeoutMillis: 600000, coverageIds: specs.map(f => `xr:${f}`) });
    }
    if (broad || files.some(f => /^(desktop\/|tools\/desktop\/|\.github\/workflows\/desktop\.yml$)/.test(f))) {
      add('desktop', 'desktop-pack-smoke', [
        { command: 'npm', argv: ['--prefix', 'desktop', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'] },
        node('desktop/node_modules/electron/install.js'),
        ...['pack:test', 'fuses:read', 'test:electron'].map(script => ({ command: 'npm', argv: ['--prefix', 'desktop', 'run', script, ...(script === 'test:electron' ? ['--', '--workers=1', '--retries=0'] : [])] })),
      ], ['desktop:electron-install', 'desktop:pack-smoke', 'desktop:fuses', 'desktop:electron'], {
        expectedSeconds: 360, setupSeconds: 180, timeoutMinutes: 35, prerequisites: requiredGuards,
        environment: { node: '22', backend: 'swiftshader', browser: 'electron' },
        env: { APEX_DESKTOP_SOFT_GL: '1', APEX_DESKTOP_NO_SANDBOX: '1', CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
      });
    }
  }
  for (const task of tasks) if (task.kind === 'node') task.prerequisites = [...requiredGuards];
  const plan = { version: VERSION, mode, sourceSha, treeSha, baseSha, requestId, reason: broad ? 'complete-fallback' : selected.reason,
    unknownBase, files, exclusions, requiredCoverage: unique(tasks.flatMap(t => t.coverageIds)), tasks, deferredCoverage: [], complete: true };
  plan.digest = computePlanDigest(plan);
  for (const task of tasks) task.planDigest = plan.digest;
  plan.coverageDigest = plan.digest;
  return plan;
}

function routingSpecs(script = '') {
  return unique(String(script).match(/tests\/specs\/[a-zA-Z0-9_*.-]+\.spec\.js/g) || []);
}

/** Bundle complete tasks, then apply early-feedback admission to final bundles.
 * Deferred IDs remain required; partial success can never clear a full gate. */
export function bundleTasks(plan, { targetSeconds = 360, draftMaxBundles = 2, draftMaxSeconds = 720 } = {}) {
  if (!(targetSeconds > 0) || !Number.isFinite(targetSeconds)) throw new Error('invalid targetSeconds');
  const bundles = [];
  for (const task of plan.tasks) {
    const key = JSON.stringify([task.kind, task.runner, task.environment, task.prerequisites]);
    let bundle = bundles.find(b => b.key === key && b.expectedSeconds + task.expectedSeconds <= targetSeconds);
    if (!bundle) {
      bundle = { id: `bundle-${bundles.length + 1}`, key, runner: task.runner, kind: task.kind, environment: task.environment,
        tasks: [], coverageIds: [], prerequisites: task.prerequisites || [], expectedSeconds: 0, setupSeconds: task.setupSeconds || 0,
        sourceSha: plan.sourceSha, treeSha: plan.treeSha, baseSha: plan.baseSha, planDigest: plan.digest };
      bundles.push(bundle);
    }
    bundle.tasks.push(task); bundle.coverageIds.push(...task.coverageIds); bundle.expectedSeconds += task.expectedSeconds;
    bundle.setupSeconds = Math.max(bundle.setupSeconds, task.setupSeconds || 0);
  }
  for (const bundle of bundles) bundle.id = bundleId(plan.digest, bundle.tasks);
  const admitted = [], deferred = []; let browserJobs = 0, browserSeconds = 0;
  const ownerBundle = new Map(bundles.flatMap(b => b.tasks.map(t => [t.id, b.id])));
  for (const bundle of bundles) {
    delete bundle.key;
    bundle.coverageIds = unique(bundle.coverageIds);
    bundle.prerequisites = unique(bundle.prerequisites.map(id => ownerBundle.get(id) || id)).filter(id => id !== bundle.id);
    bundle.totalSeconds = bundle.expectedSeconds + bundle.setupSeconds;
    const browser = bundle.tasks.some(t => ['browser', 'renderer', 'staged', 'xr', 'desktop'].includes(t.kind));
    const fullOnly = bundle.tasks.some(t => ['node', 'renderer', 'staged'].includes(t.kind));
    if (plan.mode === 'draft' && (fullOnly || (browser && (browserJobs >= draftMaxBundles || browserSeconds + bundle.totalSeconds > draftMaxSeconds)))) {
      deferred.push(bundle); continue;
    }
    if (browser) { browserJobs++; browserSeconds += bundle.totalSeconds; }
    admitted.push(bundle);
  }
  return { bundles: admitted, deferredBundles: deferred, requiredCoverage: [...plan.requiredCoverage],
    admittedCoverage: unique(admitted.flatMap(b => b.coverageIds)), deferredCoverage: unique(deferred.flatMap(b => b.coverageIds)),
    complete: deferred.length === 0, expectedRunnerSeconds: admitted.reduce((n, b) => n + b.totalSeconds, 0), browserRunnerSeconds: browserSeconds };
}

export function verifyCoverage(plan, receipts) {
  if (computePlanDigest(plan) !== plan.digest) return { ok: false, complete: false, missing: [...plan.requiredCoverage], failed: [], reason: 'coverage plan digest mismatch' };
  const flatten = rs => rs.flatMap(r => r.subreceipts ? (r.complete && r.status === 'success' ? flatten(r.subreceipts) : []) : [r]);
  receipts = flatten(receipts);
  const valid = [], failed = [];
  for (const task of plan.tasks) {
    const receipt = receipts.find(r => r.taskId === task.id && r.sourceSha === plan.sourceSha && r.baseSha === plan.baseSha
      && r.treeSha === plan.treeSha && r.planDigest === plan.digest && JSON.stringify(r.environment) === JSON.stringify(task.environment)
      && r.complete === true && r.status === 'success' && r.exitCode === 0
      && task.coverageIds.every(id => r.coverageIds?.includes(id)));
    if (receipt) valid.push(...task.coverageIds); else failed.push(task.id);
  }
  const covered = new Set(valid), missing = plan.requiredCoverage.filter(id => !covered.has(id));
  return { ok: !missing.length && !failed.length, complete: !missing.length && !failed.length, missing, failed,
    reason: missing.length || failed.length ? 'required coverage has no valid complete receipt' : 'all required coverage completed' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === HERE && process.argv.includes('--internal-plan')) {
  let input = ''; for await (const chunk of process.stdin) input += chunk;
  try { process.stdout.write(JSON.stringify(await buildPlan(JSON.parse(input)))); }
  catch (error) { console.error(error.stack); process.exitCode = 1; }
}
