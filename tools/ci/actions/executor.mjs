#!/usr/bin/env node
// @doc Token-free task execution bound to an exact controller lease and source tree.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { coverageDigest, computePlanDigest, bundleId } from './coverage.mjs';

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const IDENTITY = ['runId', 'runAttempt', 'taskId', 'sourceSha', 'planDigest'];
const allowedEnv = new Set(['APEX_WORKERS', 'APEX_FAIL_ON_FLAKY', 'APEX_GL', 'LIBGL_ALWAYS_SOFTWARE',
  'APEX_CIRCUITS', 'APEX_VM_PAGE', 'APEX_VM_PAGE_GROUP', 'APEX_CIRCUIT_SHARD', 'APEX_GLOBAL_TIMEOUT_MIN',
  'APEX_REQUIRE_LINT_BINS', 'APEX_DOCS_FIGURES_ADVISORY', 'APEX_RATCHET_ABSOLUTE', 'APEX_PORT', 'APEX_REUSE_SERVER']);
for (const key of ['APEX_DESKTOP_SOFT_GL', 'APEX_DESKTOP_NO_SANDBOX', 'CSC_IDENTITY_AUTO_DISCOVERY']) allowedEnv.add(key);

function checkedEnv(values = {}) {
  for (const [key, value] of Object.entries(values)) {
    if (!allowedEnv.has(key) || typeof value !== 'string' || /[\0\r\n]/.test(value)) throw new Error(`unsupported task environment ${key}`);
  }
  if (values.APEX_WORKERS && values.APEX_WORKERS !== '1') throw new Error('browser tasks must use exactly one worker');
  return values;
}

export function validateCommand(command) {
  if (!command || !['node', 'npm'].includes(command.command) || !Array.isArray(command.argv) || command.argv.length === 0) throw new Error('unsupported task command');
  for (const arg of command.argv) {
    if (typeof arg !== 'string' || !arg || /[\0\r\n]/.test(arg) || arg.split(/[\\/]/).includes('..')) throw new Error('unsafe task argument');
  }
  if (command.command === 'npm') {
    const allowed = [['run', 'gen:check'], ['--prefix', 'desktop', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'],
      ...['pack:test', 'fuses:read'].map(script => ['--prefix', 'desktop', 'run', script]),
      ['--prefix', 'desktop', 'run', 'test:electron', '--', '--workers=1', '--retries=0']];
    if (!allowed.some(argv => JSON.stringify(command.argv) === JSON.stringify(argv))) throw new Error('unsupported npm script');
  } else {
    if (command.argv.some(arg => /^(--eval(?:=|$)|--print(?:=|$)|--require(?:=|$)|--import(?:=|$)|--loader(?:=|$)|-[epr]$)/.test(arg))) throw new Error('inline code and loader arguments are forbidden');
    const entry = command.argv.find(arg => !arg.startsWith('-'));
    const electronInstaller = command.argv.length === 1 && entry === 'desktop/node_modules/electron/install.js';
    if (!entry || (!electronInstaller && !/^(tools\/|tests\/(unit|specs)\/)[a-zA-Z0-9_./-]+\.(mjs|cjs|js)$/.test(entry))) throw new Error('task must execute an explicit repository script');
    if (command.argv.some(arg => /^--workers(?:=|$)/.test(arg) && arg !== '--workers=1')) throw new Error('browser tasks must use exactly one worker');
  }
  checkedEnv(command.env);
  return command;
}

/** Child code gets no Actions token, OIDC endpoint, cloud key or parent NODE_OPTIONS.
 * Commands receive an explicit environment, not a denylist over all secrets. */
export function executionEnv(task, supplied = {}) {
  const env = {};
  for (const key of ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'TEMP', 'TMP', 'TMPDIR', 'DISPLAY', 'XDG_RUNTIME_DIR',
    'PLAYWRIGHT_BROWSERS_PATH', 'LD_LIBRARY_PATH', 'DYLD_LIBRARY_PATH', 'SSL_CERT_FILE', 'SSL_CERT_DIR']) {
    const value = supplied[key] ?? process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return { ...env, CI: 'true', NODE_ENV: 'test', ...checkedEnv(task.env), APEX_WORKERS: '1',
    APEX_FAIL_ON_FLAKY: '1', APEX_GLOBAL_TIMEOUT_MIN: String(task.timeoutMinutes || 60) };
}

/** npm.cmd cannot be spawned without a shell on Windows. Invoke the npm CLI
 * installed beside the trusted Node executable with Node directly instead. */
export function commandInvocation(command, argv, { platform = process.platform, execPath = process.execPath, exists = fs.existsSync } = {}) {
  if (command === 'node') return { command: execPath, argv };
  if (command === 'npm' && platform === 'win32') {
    const cli = path.join(path.dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (!exists(cli)) throw new Error('trusted Node installation has no npm CLI');
    return { command: execPath, argv: [cli, ...argv] };
  }
  return { command, argv };
}

export async function runCommand(command, argv, { cwd, env, timeoutMs }) {
  return await new Promise(resolve => {
    let stdout = '', stderr = '', timedOut = false, error = null;
    const invocation = commandInvocation(command, argv);
    const child = spawn(invocation.command, invocation.argv, { cwd, env, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    const stop = signal => { try { if (process.platform === 'win32') child.kill(signal); else process.kill(-child.pid, signal); } catch { /* already exited */ } };
    const interrupt = () => stop('SIGTERM');
    process.once('SIGTERM', interrupt); process.once('SIGINT', interrupt);
    const timer = setTimeout(() => { timedOut = true; stop('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', chunk => { process.stdout.write(chunk); stdout = (stdout + chunk).slice(-4 * 1024 * 1024); });
    child.stderr.on('data', chunk => { process.stderr.write(chunk); stderr = (stderr + chunk).slice(-1024 * 1024); });
    child.on('error', err => { error = err.message; });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer); process.off('SIGTERM', interrupt); process.off('SIGINT', interrupt);
      resolve({ exitCode: exitCode ?? 1, signal, timedOut, error, stdout, stderr });
    });
  });
}

/** Setup is per claimed bundle, never per atomic test task. All commands run
 * without credentials and npm lifecycle hooks; setup failure earns no coverage. */
export async function setupBundle(bundle, { sourceRoot, run = runCommand, env = {}, platform = process.platform } = {}) {
  const childEnv = executionEnv({ env: {} }, env);
  const commands = [
    ['npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund']],
    ['node', ['tools/gen/ensure-built.mjs']],
  ];
  const browser = bundle.tasks.some(t => t.environment?.browser);
  const needsDisplay = browser && (bundle.environment?.backend === 'llvmpipe' || bundle.tasks.some(t => t.environment?.browser === 'electron'));
  if (browser) commands.push(['node', ['node_modules/playwright/cli.js', 'install', ...(platform === 'linux' ? ['--with-deps'] : []), 'chromium']]);
  if (bundle.tasks.some(t => t.environment?.lintBins)) commands.push(['bash', ['tools/env/install-lint-bins.sh']]);
  if (needsDisplay && platform === 'linux') {
    const opts = ['-o', 'Acquire::Retries=3', '-o', 'Acquire::http::Timeout=30', '-o', 'Acquire::https::Timeout=30', '-o', 'DPkg::Lock::Timeout=60'];
    commands.push(['sudo', ['timeout', '120', 'apt-get', 'update', '-qq', ...opts]],
      ['sudo', ['timeout', '180', 'apt-get', 'install', '-y', '-qq', '--no-install-recommends', 'mesa-utils', 'libgl1-mesa-dri', 'libegl1', 'libgles2', 'xvfb', ...opts]]);
  }
  for (const [command, argv] of commands) {
    const result = await run(command, argv, { cwd: sourceRoot, env: childEnv, timeoutMs: 300_000 });
    if ((result.exitCode ?? result.code) !== 0 || result.signal || result.timedOut || result.error) throw new Error(`bundle setup failed (${command} ${argv[0]}): ${result.error || result.signal || result.exitCode || result.code}`);
  }
  if (browser && bundle.environment?.backend === 'metal') {
    fs.mkdirSync(path.join(sourceRoot, 'artifacts'), { recursive: true });
    const result = await run('node', ['tools/gfx/gpu-census.mjs', '--json', 'artifacts/executor-metal-census.json'], { cwd: sourceRoot, env: childEnv, timeoutMs: 300_000 });
    if ((result.exitCode ?? result.code) !== 0 || result.signal || result.error) throw new Error('Metal adapter census failed');
    const census = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'artifacts/executor-metal-census.json'), 'utf8'));
    if (census.anyHardware !== true) throw new Error('Metal task requires a measured hardware adapter on this runner');
  }
  let display = null;
  if (needsDisplay && platform === 'linux') {
    display = spawn('Xvfb', [':99', '-screen', '0', '1280x800x24'], { cwd: sourceRoot, env: childEnv, shell: false, stdio: 'ignore' });
    let failed = null; display.on('error', error => { failed = error; });
    for (let i = 0; i < 50 && !fs.existsSync('/tmp/.X11-unix/X99') && !failed && display.exitCode === null; i++) await new Promise(resolve => setTimeout(resolve, 100));
    if (failed || display.exitCode !== null || !fs.existsSync('/tmp/.X11-unix/X99')) { display.kill('SIGTERM'); throw new Error('bundle Xvfb did not become ready'); }
    childEnv.DISPLAY = ':99';
  }
  return { env: childEnv, cleanup: () => { if (display) display.kill('SIGTERM'); } };
}

function assertIdentity(task, plan, claim, owner) {
  if (computePlanDigest(plan) !== plan.digest) throw new Error('coverage plan digest mismatch');
  for (const field of IDENTITY) {
    if (!own(claim || {}, field) || !own(owner || {}, field) || String(claim[field]) !== String(owner[field])) throw new Error(`lease ownership mismatch: ${field}`);
  }
  if (!String(claim.runId).match(/^\d+$/) || !String(claim.runAttempt).match(/^[1-9]\d*$/)) throw new Error('invalid run identity');
  if (task.id !== claim.taskId || task.sourceSha !== claim.sourceSha || plan.sourceSha !== claim.sourceSha
      || plan.digest !== claim.planDigest || task.planDigest !== plan.digest) throw new Error('task/source/plan identity mismatch');
  const expected = plan.tasks.find(t => t.id === task.id);
  if (!expected || coverageDigest(expected) !== coverageDigest(task)) throw new Error('task differs from the admitted plan');
  if (task.treeSha !== plan.treeSha || task.baseSha !== plan.baseSha || task.requestId !== plan.requestId) throw new Error('task tree/base/request mismatch');
  if (task.coverageIds.length === 0 || !task.coverageIds.every(id => plan.requiredCoverage.includes(id))) throw new Error('task coverage is absent from plan');
  checkedEnv(task.env);
  for (const command of task.commands || []) validateCommand(command);
  if (!task.commands?.length && task.kind !== 'staged') throw new Error('empty task commands');
}

async function stagedCommands(task, { sourceRoot, env, run, timeoutMs }) {
  const stage = await run('node', ['tools/desktop/stage.mjs', '--out', '_site'], { cwd: sourceRoot, env, timeoutMs });
  if (stage.exitCode !== 0) return stage;
  let output;
  try { output = JSON.parse(stage.stdout); } catch { return { exitCode: 1, error: 'stage output is not JSON' }; }
  if (!(output.minified?.files > 0)) return { exitCode: 1, error: 'stage did not minify the site' };
  const stamp = await run('node', ['tools/desktop/stage.mjs', '--out', '_site', '--stamp-only', '--sha', task.sourceSha], { cwd: sourceRoot, env, timeoutMs });
  if (stamp.exitCode !== 0) return stamp;
  const html = fs.readFileSync(path.join(sourceRoot, '_site/index.html'), 'utf8');
  if (!html.includes(`<meta name="apex-sha" content="${task.sourceSha}">`)) return { exitCode: 1, error: 'staged SHA stamp mismatch' };
  const siteRoot = fs.realpathSync(path.join(sourceRoot, '_site'));
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
  const server = createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const requested = path.resolve(siteRoot, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
      const file = fs.realpathSync(requested);
      if (!file.startsWith(`${siteRoot}${path.sep}`) || !fs.statSync(file).isFile()) { response.writeHead(403); response.end(); return; }
      response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      fs.createReadStream(file).pipe(response);
    } catch { response.writeHead(404); response.end(); }
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = String(server.address().port);
    return await run('node', ['tools/ci/run-playwright.mjs', 'tests/specs/smoke.spec.js', '--with-twinned', '--workers=1', '--retries=0', '--timeout=900000'], {
      cwd: sourceRoot, timeoutMs, env: { ...env, APEX_PORT: port, APEX_REUSE_SERVER: '1' },
    });
  } finally { server.closeAllConnections(); server.close(); }
}

export async function executeTask({ task, plan, sourceRoot, claim, owner, run = runCommand, env = {}, verifySource = true, now = () => new Date().toISOString() }) {
  const startedAt = now();
  const receipt = { version: 1, taskId: task?.id, requestId: task?.requestId, sourceSha: task?.sourceSha,
    treeSha: task?.treeSha, baseSha: task?.baseSha, planDigest: plan?.digest, environment: task?.environment,
    coverageIds: [], runId: String(claim?.runId || ''), runAttempt: Number(claim?.runAttempt || 0), startedAt,
    status: 'incomplete', complete: false, exitCode: null, commandsCompleted: 0,
    runtime: { node: process.versions.node, platform: process.platform, arch: process.arch } };
  try {
    assertIdentity(task, plan, claim, owner);
    if (run === runCommand && task.environment?.node !== process.versions.node.split('.')[0]) throw new Error('Node runtime does not match the planned environment');
    sourceRoot = fs.realpathSync(sourceRoot);
    if (verifySource) {
      const resolve = ref => execFileSync('git', ['rev-parse', ref], { cwd: sourceRoot, encoding: 'utf8' }).trim();
      if (resolve('HEAD') !== task.sourceSha || resolve('HEAD^{tree}') !== task.treeSha) throw new Error('checkout does not match leased source tree');
    }
    const childEnv = executionEnv(task, env);
    const timeoutMs = Math.max(60_000, (task.timeoutMinutes || 60) * 60_000);
    if (task.kind === 'staged') {
      const result = await stagedCommands(task, { sourceRoot, env: childEnv, run, timeoutMs });
      if (result.exitCode !== 0) { receipt.exitCode = result.exitCode ?? 1; receipt.error = result.error || result.signal || 'staged boot failed'; receipt.status = 'failure'; }
      else receipt.commandsCompleted = 3;
    } else {
      const deadline = Date.now() + timeoutMs;
      for (const command of task.commands) {
      // Each command gets a fresh explicit environment. No command can mutate
      // a following command's environment through GITHUB_ENV/BASH_ENV files.
      const remaining = task.kind === 'desktop' ? deadline - Date.now() : timeoutMs;
      if (remaining <= 0) { receipt.status = 'failure'; receipt.exitCode = 1; receipt.error = 'desktop validation exhausted its whole-task deadline'; break; }
      const result = await run(command.command, command.argv, { cwd: sourceRoot, env: { ...childEnv, ...checkedEnv(command.env) }, timeoutMs: remaining });
      if ((result.exitCode ?? result.code) !== 0 || result.signal || result.timedOut || result.error) {
        receipt.exitCode = result.exitCode ?? result.code ?? 1; receipt.error = result.error || result.signal || 'task command failed'; receipt.status = 'failure'; break;
      }
      receipt.commandsCompleted++;
      }
    }
    if (receipt.status !== 'failure') {
      receipt.exitCode = 0; receipt.status = 'success'; receipt.complete = true; receipt.coverageIds = [...task.coverageIds];
    }
  } catch (error) { receipt.error = error.message; }
  receipt.completedAt = now();
  receipt.digest = coverageDigest(receipt);
  return receipt;
}

export async function executeBundle({ bundle, plan, sourceRoot, claim, owner, run = runCommand, setup = setupBundle, env = {}, verifySource = true, now = () => new Date().toISOString() }) {
  const receipt = { version: 1, taskId: bundle?.id, requestId: plan?.requestId, sourceSha: plan?.sourceSha,
    treeSha: plan?.treeSha, baseSha: plan?.baseSha, planDigest: plan?.digest, environment: bundle?.environment,
    coverageIds: [], runId: String(claim?.runId || ''), runAttempt: Number(claim?.runAttempt || 0),
    startedAt: now(), status: 'incomplete', complete: false, exitCode: null, subreceipts: [],
    runtime: { node: process.versions.node, platform: process.platform, arch: process.arch } };
  let cleanup = () => {};
  try {
    for (const field of IDENTITY) if (!own(claim || {}, field) || !own(owner || {}, field) || String(claim[field]) !== String(owner[field])) throw new Error(`lease ownership mismatch: ${field}`);
    if (claim.taskId !== bundle.id || claim.planDigest !== plan.digest || claim.sourceSha !== plan.sourceSha) throw new Error('bundle lease identity mismatch');
    if (run === runCommand && bundle.environment?.node !== process.versions.node.split('.')[0]) throw new Error('Node runtime does not match the planned environment');
    if (bundle.sourceSha !== plan.sourceSha || bundle.treeSha !== plan.treeSha || bundle.baseSha !== plan.baseSha || bundle.planDigest !== plan.digest) throw new Error('bundle source identity mismatch');
    if (!bundle.tasks?.length || new Set(bundle.tasks.map(t => t.id)).size !== bundle.tasks.length) throw new Error('empty or duplicate bundle tasks');
    if (bundleId(plan.digest, bundle.tasks) !== bundle.id) throw new Error('bundle membership digest mismatch');
    const expectedIds = [...new Set(bundle.tasks.flatMap(t => t.coverageIds))].sort();
    if (JSON.stringify(expectedIds) !== JSON.stringify([...new Set(bundle.coverageIds)].sort())) throw new Error('bundle coverage mismatch');
    for (const task of bundle.tasks) {
      const atomicClaim = { ...claim, taskId: task.id };
      assertIdentity(task, plan, atomicClaim, { ...owner, taskId: task.id });
      if (task.runner !== bundle.runner || JSON.stringify(task.environment) !== JSON.stringify(bundle.environment)) throw new Error('incompatible bundle environment');
    }
    sourceRoot = fs.realpathSync(sourceRoot);
    if (verifySource) {
      const resolve = ref => execFileSync('git', ['rev-parse', ref], { cwd: sourceRoot, encoding: 'utf8' }).trim();
      if (resolve('HEAD') !== plan.sourceSha || resolve('HEAD^{tree}') !== plan.treeSha) throw new Error('checkout does not match leased source tree');
    }
    const prepared = await setup(bundle, { sourceRoot, run, env });
    cleanup = prepared?.cleanup || cleanup;
    for (const task of bundle.tasks) {
      const child = await executeTask({ task, plan, sourceRoot, claim: { ...claim, taskId: task.id }, owner: { ...owner, taskId: task.id },
        run, env: { ...env, ...(prepared?.env || {}) }, verifySource, now });
      receipt.subreceipts.push(child);
      if (!child.complete) { receipt.status = child.status; receipt.error = child.error; receipt.exitCode = child.exitCode; break; }
    }
    if (receipt.subreceipts.length === bundle.tasks.length && receipt.subreceipts.every(r => r.complete)) {
      receipt.status = 'success'; receipt.complete = true; receipt.exitCode = 0; receipt.coverageIds = expectedIds;
    }
  } catch (error) { receipt.error = error.message; }
  finally { cleanup(); }
  receipt.completedAt = now(); receipt.digest = coverageDigest(receipt);
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) { console.error('usage: executor.mjs <task-input.json> <receipt.json>'); process.exitCode = 2; }
  else {
    try {
      const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
      const receipt = await (input.bundle ? executeBundle(input) : executeTask(input));
      fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
      if (!receipt.complete) process.exitCode = 1;
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
