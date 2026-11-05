// @doc Complete coverage and bounded draft admission cannot manufacture a full green.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { planCoverage, bundleTasks, verifyCoverage, computePlanDigest } from '../../tools/ci/actions/coverage.mjs';
import { diagnosticTasks } from '../../tools/ci/actions/diagnostic-executor.mjs';
import { buildDiagnosticRequest } from '../../tools/ci/actions/diagnostics.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const plan = files => planCoverage({ root: ROOT, since: 'HEAD', files });

test('large UI selection keeps every complete candidate instead of soft budget drops', async () => {
  const result = await plan(['js/ui/hud.js']);
  const ids = result.requiredCoverage.filter(id => id.startsWith('browser:tests/specs/hud-layout.spec.js'));
  assert.ok(ids.length >= 4, 'HUD pieces remain individually accounted');
  assert.equal(result.complete, true);
  assert.equal(result.deferredCoverage.length, 0);
  assert.ok(result.tasks.some(t => t.kind === 'staged'));
  assert.ok(result.tasks.some(t => t.kind === 'node'));
  assert.ok(result.tasks.every(t => t.planDigest === result.digest));
  assert.equal(computePlanDigest(result), result.digest);
  assert.ok(result.tasks.filter(t => t.kind === 'browser').every(t => t.commands[0].argv.includes('--workers=1')));
  assert.ok(result.tasks.filter(t => t.kind === 'browser').every(t => t.commands[0].argv.includes('--with-twinned')), 'source-local twin registry cannot silently replace planned browser coverage');
  assert.ok(result.tasks.filter(t => t.kind === 'browser' && t.suite.startsWith('tests/specs/')).every(t => t.commands[0].argv.includes('--timeout=180000')), 'selected failure bound matches its timeout-aware sharder');
  assert.ok(result.tasks.find(t => t.suite === 'smoke').commands[0].argv.includes('--timeout=900000'));
});

test('draft admission is bounded after all split/slow pools and keeps deferrals explicit', async () => {
  const result = await planCoverage({ root: ROOT, since: 'HEAD', files: ['js/ui/hud.js'], mode: 'draft' });
  const admitted = bundleTasks(result);
  const allBundles = [...admitted.bundles, ...admitted.deferredBundles];
  assert.ok(allBundles.every(b => b.prerequisites.every(id => allBundles.some(other => other.id === id))), 'bundle prerequisites use bundle IDs');
  const browser = admitted.bundles.filter(b => b.tasks.some(t => ['browser', 'renderer', 'staged'].includes(t.kind)));
  assert.ok(browser.length <= 2);
  assert.ok(admitted.browserRunnerSeconds <= 720);
  assert.ok(admitted.deferredCoverage.length > 0);
  assert.equal(admitted.complete, false);
  assert.deepEqual(new Set([...admitted.admittedCoverage, ...admitted.deferredCoverage]), new Set(result.requiredCoverage));
  for (const task of result.tasks.filter(t => t.kind === 'guard' || t.kind === 'lint')) {
    assert.ok(admitted.bundles.some(b => b.tasks.some(t => t.id === task.id)), 'light required floor cannot be bundled away with deferred node work');
  }
  result.mode = 'ready';
  assert.equal(bundleTasks(result).deferredCoverage.length, 0, 'ready admits every required task');
});

test('unknown mixed changes fall back to exhaustive browser/node/Metal/XR coverage', async () => {
  const result = await plan(['js/ui/hud.js', 'unrouted-new-runtime.xyz']);
  assert.equal(result.reason, 'complete-fallback');
  for (const kind of ['guard', 'lint', 'browser', 'node', 'renderer', 'staged']) assert.ok(result.tasks.some(t => t.kind === kind), kind);
  assert.ok(result.requiredCoverage.some(id => id.startsWith('xr:')));
  assert.ok(result.requiredCoverage.some(id => id === 'metal:adapter-census'));
  assert.ok(result.requiredCoverage.some(id => id.startsWith('browser-substitution:')));
  assert.ok(result.requiredCoverage.includes('browser:tests/specs/physics-characterization.spec.js'));
});

test('docs do not invent browser work; unavailable base cannot turn that into an empty complete plan', async () => {
  const docs = await plan(['docs/TESTING.md']);
  assert.ok(docs.tasks.every(t => t.kind === 'guard' || t.kind === 'lint'));
  const missing = await planCoverage({ root: ROOT, since: 'missing-comparison-ref', files: ['docs/TESTING.md'] });
  assert.equal(missing.reason, 'complete-fallback');
  assert.ok(missing.tasks.some(t => t.kind === 'browser'));
});

test('desktop machinery adds required Linux packaging and Electron coverage while game-only edits do not', async () => {
  const desktop = await plan(['desktop/main.js']);
  const task = desktop.tasks.find(t => t.kind === 'desktop');
  assert.ok(task, 'pack smoke is required coverage rather than an independent advisory experiment');
  assert.equal(task.runner, 'ubuntu-latest'); assert.equal(task.timeoutMinutes, 35);
  assert.equal(task.expectedSeconds, 360); assert.equal(task.setupSeconds, 180);
  assert.deepEqual(task.commands.map(c => c.argv), [
    ['--prefix', 'desktop', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'],
    ['desktop/node_modules/electron/install.js'],
    ['--prefix', 'desktop', 'run', 'pack:test'],
    ['--prefix', 'desktop', 'run', 'fuses:read'],
    ['--prefix', 'desktop', 'run', 'test:electron', '--', '--workers=1', '--retries=0'],
  ]);
  assert.ok(task.coverageIds.every(id => desktop.requiredCoverage.includes(id)));
  const descriptor = buildDiagnosticRequest('desktop.yml', {}, { source_sha: desktop.sourceSha, event_name: 'workflow_dispatch' });
  const manual = diagnosticTasks(descriptor, { sourceRoot: ROOT, sourceSha: desktop.sourceSha, treeSha: desktop.treeSha });
  assert.equal(manual.length, 6, 'three platform smokes and three manual installer tasks remain available');
  assert.ok(manual.every(t => t.commands.some(c => c.argv[0] === 'desktop/node_modules/electron/install.js')), 'every ignore-scripts desktop install explicitly downloads its required Electron binary');
  assert.equal(verifyCoverage(desktop, []).ok, false, 'PR validation cannot clear before its pack completes');
  const stage = await plan(['tools/desktop/stage.mjs']);
  assert.ok(stage.tasks.some(t => t.kind === 'desktop'));
  const game = await plan(['js/ui/hud.js']);
  assert.equal(game.tasks.some(t => t.kind === 'desktop'), false, 'ordinary game changes do not spend Electron runners');

  const synthetic = { ...desktop, mode: 'draft', tasks: [task, ...[1, 2].map(i => ({ ...task, id: `browser-${i}`, kind: 'browser',
    coverageIds: [`browser-${i}`], environment: { node: '22', backend: 'llvmpipe', browser: 'chromium' } }))] };
  synthetic.requiredCoverage = synthetic.tasks.flatMap(t => t.coverageIds);
  const admission = bundleTasks(synthetic);
  const expensive = admission.bundles.filter(b => b.tasks.some(t => ['desktop', 'browser'].includes(t.kind)));
  assert.ok(expensive.some(b => b.kind === 'desktop'));
  assert.ok(expensive.length <= 2); assert.ok(expensive.reduce((sum, b) => sum + b.totalSeconds, 0) <= 720,
    'desktop work is charged against the same draft browser/setup budget');
  assert.ok(admission.deferredCoverage.length > 0);
});

test('receipts must prove exact source, base, tree, environment and every required piece', async () => {
  const result = await plan(['docs/TESTING.md']);
  const receipts = result.tasks.map(t => ({ taskId: t.id, sourceSha: result.sourceSha, baseSha: result.baseSha,
    treeSha: result.treeSha, planDigest: result.digest, environment: t.environment, coverageIds: [...t.coverageIds],
    status: 'success', complete: true, exitCode: 0 }));
  assert.equal(verifyCoverage(result, receipts).ok, true);
  assert.equal(verifyCoverage(result, receipts.slice(1)).ok, false);
  for (const patch of [{ complete: false }, { status: 'failure' }, { exitCode: 1 }, { sourceSha: '0'.repeat(40) },
    { baseSha: '0'.repeat(40) }, { treeSha: '0'.repeat(40) }, { planDigest: 'stale' }, { environment: { backend: 'other' } }, { coverageIds: [] }]) {
    assert.equal(verifyCoverage(result, [{ ...receipts[0], ...patch }, ...receipts.slice(1)]).ok, false, JSON.stringify(patch));
  }
  result.tasks[0].commands[0].argv.push('--changed');
  assert.equal(verifyCoverage(result, receipts).ok, false, 'altered plan cannot reuse valid receipts');
});

test('planning isolated source roots never changes process cwd or executes source package scripts', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-root-'));
  try {
    fs.mkdirSync(path.join(dir, 'tests'));
    fs.symlinkSync(path.join(ROOT, 'tests/specs'), path.join(dir, 'tests/specs'), 'dir');
    fs.symlinkSync(path.join(ROOT, 'tests/unit'), path.join(dir, 'tests/unit'), 'dir');
    fs.mkdirSync(path.join(dir, 'js'));
    for (const name of fs.readdirSync(path.join(ROOT, 'js'))) fs.symlinkSync(path.join(ROOT, 'js', name), path.join(dir, 'js', name));
    const uncoveredDirectory = ['js', `uncovered_${path.basename(dir).replace(/[^a-zA-Z0-9]/g, '_')}`].join('/');
    const uncoveredModule = `${uncoveredDirectory}/module.js`;
    fs.mkdirSync(path.join(dir, uncoveredDirectory));
    fs.writeFileSync(path.join(dir, uncoveredModule), 'window.CapacityUncovered = {};');
    fs.mkdirSync(path.join(dir, 'tools'));
    fs.symlinkSync(path.join(ROOT, 'tools/lib'), path.join(dir, 'tools/lib'), 'dir');
    const marker = path.join(dir, 'manifest-was-executed');
    fs.writeFileSync(path.join(dir, 'tools/manifest.cjs'), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'unexpected');\n${fs.readFileSync(path.join(ROOT, 'tools/manifest.cjs'), 'utf8')}`);
    fs.copyFileSync(path.join(ROOT, 'tests/groups.json'), path.join(dir, 'tests/groups.json'));
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json')));
    pkg.scripts['gen:check'] = 'throw package scripts must not execute in planner';
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
    execFileSync('git', ['init', '-q', dir]);
    execFileSync('git', ['-C', dir, 'add', '.']);
    execFileSync('git', ['-C', dir, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'source fixture']);
    const cwd = process.cwd();
    const [one, two] = await Promise.all([planCoverage({ root: dir, since: 'HEAD', files: ['docs/TESTING.md'] }), plan(['docs/TESTING.md'])]);
    assert.notEqual(one.sourceSha, two.sourceSha);
    assert.equal(process.cwd(), cwd);
    assert.equal(one.tasks.length, two.tasks.length);
    assert.equal(fs.existsSync(marker), false, 'source manifest is parsed as data, never required');
    await assert.rejects(planCoverage({ root: dir, since: 'HEAD', files: [uncoveredModule] }), /no module-specific coverage/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
