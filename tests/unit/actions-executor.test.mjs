// @doc Claimed task identity and token-free argv execution fail closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { executeTask, executeBundle, executionEnv, validateCommand, commandInvocation } from '../../tools/ci/actions/executor.mjs';
import { computePlanDigest, bundleTasks, verifyCoverage } from '../../tools/ci/actions/coverage.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function fixture() {
  const task = { id: 'node-fixture', kind: 'node', suite: 'fixture', runner: 'ubuntu-latest',
    sourceSha: 'a'.repeat(40), treeSha: 'b'.repeat(40), baseSha: 'c'.repeat(40), requestId: 'request-1',
    coverageIds: ['node:tests/unit/actions-executor.test.mjs'], environment: { node: '22', backend: 'node' },
    commands: [{ command: 'node', argv: ['--test', 'tests/unit/actions-executor.test.mjs'] }], env: {} };
  const plan = { version: 1, sourceSha: task.sourceSha, treeSha: task.treeSha, baseSha: task.baseSha,
    requestId: task.requestId, requiredCoverage: task.coverageIds, tasks: [task] };
  plan.digest = computePlanDigest(plan); task.planDigest = plan.digest;
  const claim = { runId: '123', runAttempt: 2, taskId: task.id, sourceSha: task.sourceSha, planDigest: plan.digest };
  return { task, plan, claim, owner: { ...claim }, sourceRoot: root, verifySource: false };
}

test('valid owner executes argv without a shell and emits exact complete coverage receipt', async () => {
  const input = fixture(); let calls = 0;
  const receipt = await executeTask({ ...input, env: { GITHUB_TOKEN: 'secret', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'secret', NODE_OPTIONS: '--require evil', PATH: '/bin' },
    run: async (command, argv, options) => {
      calls++; assert.equal(command, 'node'); assert.deepEqual(argv, input.task.commands[0].argv);
      assert.equal(options.cwd, root); assert.equal(options.env.APEX_WORKERS, '1');
      assert.equal(options.env.GITHUB_TOKEN, undefined); assert.equal(options.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, undefined);
      assert.equal(options.env.NODE_OPTIONS, undefined); return { exitCode: 0 };
    } });
  assert.equal(calls, 1); assert.equal(receipt.status, 'success'); assert.equal(receipt.complete, true);
  assert.deepEqual(receipt.coverageIds, input.task.coverageIds);
  assert.equal(receipt.runAttempt, 2); assert.equal(receipt.planDigest, input.plan.digest);
});

test('Windows npm execution uses trusted node npm-cli rather than a command shell', () => {
  const result = commandInvocation('npm', ['run', 'pack:test'], { platform: 'win32', execPath: '/trusted node/node.exe', exists: () => true });
  assert.equal(result.command, '/trusted node/node.exe');
  assert.deepEqual(result.argv, [path.join('/trusted node', 'node_modules', 'npm', 'bin', 'npm-cli.js'), 'run', 'pack:test']);
  assert.throws(() => commandInvocation('npm', ['ci'], { platform: 'win32', execPath: '/node.exe', exists: () => false }), /trusted Node/);
});

test('stale or wrong owner never starts a process', async () => {
  for (const field of ['runId', 'runAttempt', 'taskId', 'sourceSha', 'planDigest']) {
    const input = fixture(); input.owner[field] = 'different';
    const receipt = await executeTask({ ...input, run: async () => { assert.fail('must not execute stale lease'); } });
    assert.equal(receipt.status, 'incomplete'); assert.equal(receipt.complete, false); assert.deepEqual(receipt.coverageIds, []);
    assert.match(receipt.error, /ownership mismatch/);
  }
});

test('tampered command, plan or actual checkout cannot acquire coverage credit', async () => {
  const input = fixture(); input.task.commands[0].argv.push('tests/unit/actions-store.test.mjs');
  let result = await executeTask({ ...input, run: async () => { assert.fail('tampered plan'); } });
  assert.match(result.error, /digest mismatch/);
  result = await executeTask({ ...fixture(), verifySource: true, run: async () => { assert.fail('wrong checkout'); } });
  assert.match(result.error, /checkout does not match/);
});

test('first failure stops remaining commands and incomplete execution never reports coverage', async () => {
  const input = fixture(); input.task.commands.push({ command: 'node', argv: ['--test', 'tests/unit/actions-coverage.test.mjs'] });
  input.plan.digest = computePlanDigest(input.plan); input.task.planDigest = input.plan.digest;
  input.claim.planDigest = input.owner.planDigest = input.plan.digest;
  let calls = 0;
  const receipt = await executeTask({ ...input, run: async () => { calls++; return { exitCode: 1 }; } });
  assert.equal(calls, 1); assert.equal(receipt.complete, false); assert.equal(receipt.status, 'failure');
  assert.deepEqual(receipt.coverageIds, []);
});

test('invalid executables, inline code, traversal, loader flags and browser worker inflation are rejected', () => {
  for (const command of [
    { command: 'bash', argv: ['-c', 'echo success'] }, { command: 'node', argv: ['-e', 'process.exit(0)'] },
    { command: 'node', argv: [['tools', '..', 'evil.mjs'].join('/')] }, { command: 'node', argv: ['--import=evil', 'tools/ci/run-playwright.mjs'] },
    { command: 'node', argv: ['tools/ci/run-playwright.mjs', '--workers=2'] }, { command: 'npm', argv: ['run', 'arbitrary'] },
    { command: 'npm', argv: ['--prefix', 'desktop', 'run', 'dist:linux'] },
    { command: 'npm', argv: ['--prefix', 'other', 'run', 'pack:test'] },
    { command: 'npm', argv: ['--prefix', 'desktop', 'run', 'test:electron', '--', '--workers=2', '--retries=1'] },
  ]) assert.throws(() => validateCommand(command));
  assert.equal(validateCommand({ command: 'node', argv: ['tools/ci/run-playwright.mjs', 'tests/specs/smoke.spec.js', '--workers=1'] }).command, 'node');
  assert.throws(() => executionEnv({ env: { GITHUB_ENV: 'arbitrary' } }));
});

test('required desktop smoke installs Electron explicitly and executes the exact read-only pack chain', async () => {
  const input = fixture(); input.task.kind = 'desktop'; input.task.timeoutMinutes = 35;
  input.task.env = { APEX_DESKTOP_SOFT_GL: '1', APEX_DESKTOP_NO_SANDBOX: '1', CSC_IDENTITY_AUTO_DISCOVERY: 'false' };
  input.task.commands = [
    { command: 'npm', argv: ['--prefix', 'desktop', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'] },
    { command: 'node', argv: ['desktop/node_modules/electron/install.js'] },
    ...['pack:test', 'fuses:read', 'test:electron'].map(script => ({ command: 'npm', argv: ['--prefix', 'desktop', 'run', script, ...(script === 'test:electron' ? ['--', '--workers=1', '--retries=0'] : [])] })),
  ];
  input.plan.digest = computePlanDigest(input.plan); input.task.planDigest = input.plan.digest;
  input.claim.planDigest = input.owner.planDigest = input.plan.digest;
  const calls = [];
  const receipt = await executeTask({ ...input, env: { GH_TOKEN: 'secret', GITHUB_TOKEN: 'secret' }, run: async (command, argv, options) => {
    calls.push({ command, argv }); assert.equal(options.env.GH_TOKEN, undefined); assert.equal(options.env.GITHUB_TOKEN, undefined);
    assert.equal(options.env.APEX_DESKTOP_NO_SANDBOX, '1'); assert.ok(options.timeoutMs > 0 && options.timeoutMs <= 35 * 60_000);
    return { exitCode: 0 };
  } });
  assert.equal(receipt.complete, true); assert.deepEqual(calls, input.task.commands);
  let count = 0;
  const failed = await executeTask({ ...input, run: async () => ({ exitCode: ++count === 2 ? 1 : 0 }) });
  assert.equal(count, 2); assert.equal(failed.complete, false); assert.deepEqual(failed.coverageIds, []);
  const originalClock = Date.now; let elapsed = originalClock(); const budgets = [];
  try {
    Date.now = () => elapsed;
    const expired = await executeTask({ ...input, run: async (_command, _argv, options) => {
      budgets.push(options.timeoutMs); elapsed += 10 * 60_000; return { exitCode: 0 };
    } });
    assert.deepEqual(budgets, [35, 25, 15, 5].map(minutes => minutes * 60_000));
    assert.equal(expired.complete, false); assert.match(expired.error, /whole-task deadline/);
  } finally { Date.now = originalClock; }
});

test('bundle performs setup once and aggregates atomic receipts for the complete gate', async () => {
  const input = fixture();
  input.task.expectedSeconds = 20; input.task.setupSeconds = 10; input.task.prerequisites = [];
  const second = { ...input.task, id: 'node-second', coverageIds: ['node:tests/unit/actions-coverage.test.mjs'] };
  input.plan.tasks.push(second); input.plan.requiredCoverage = input.plan.tasks.flatMap(t => t.coverageIds);
  input.plan.digest = computePlanDigest(input.plan); for (const t of input.plan.tasks) t.planDigest = input.plan.digest;
  const bundle = bundleTasks(input.plan).bundles[0];
  const claim = { ...input.claim, taskId: bundle.id, planDigest: input.plan.digest };
  let setups = 0, commands = 0, cleaned = 0;
  const receipt = await executeBundle({ ...input, bundle, claim, owner: { ...claim },
    setup: async () => { setups++; return { env: {}, cleanup: () => cleaned++ }; },
    run: async () => { commands++; return { exitCode: 0 }; } });
  assert.equal(setups, 1); assert.equal(cleaned, 1); assert.equal(commands, 2);
  assert.equal(receipt.complete, true); assert.equal(receipt.subreceipts.length, 2);
  assert.equal(verifyCoverage(input.plan, [receipt]).ok, true);
  receipt.complete = false;
  assert.equal(verifyCoverage(input.plan, [receipt]).ok, false, 'partial parent receipt cannot smuggle successful children');
});

test('failed bundle setup cannot start test commands or earn coverage', async () => {
  const input = fixture(); input.task.expectedSeconds = 20; input.task.prerequisites = [];
  input.plan.digest = computePlanDigest(input.plan); input.task.planDigest = input.plan.digest;
  const bundle = bundleTasks(input.plan).bundles[0];
  const claim = { ...input.claim, taskId: bundle.id, planDigest: input.plan.digest };
  const result = await executeBundle({ ...input, bundle, claim, owner: { ...claim },
    setup: async () => { throw new Error('browser installation failed'); }, run: async () => assert.fail('setup failed') });
  assert.equal(result.complete, false); assert.equal(result.subreceipts.length, 0);
  assert.match(result.error, /installation failed/);
});

test('staged boot proves minification and stamp and serves only the staged tree', async () => {
  const input = fixture();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'executor-stage-'));
  try {
    fs.mkdirSync(path.join(dir, '_site'));
    const html = `<meta name="apex-sha" content="${input.task.sourceSha}"><script src="runtime.js"></script>`;
    fs.writeFileSync(path.join(dir, '_site/index.html'), html);
    fs.writeFileSync(path.join(dir, '_site/runtime.js'), 'window.staged=true');
    fs.writeFileSync(path.join(dir, 'secret.json'), 'source must never be served');
    fs.symlinkSync(path.join(dir, 'secret.json'), path.join(dir, '_site/escape.json'));
    input.task.kind = 'staged'; input.task.commands = [];
    input.plan.digest = computePlanDigest(input.plan); input.task.planDigest = input.plan.digest;
    input.claim.planDigest = input.owner.planDigest = input.plan.digest;
    let calls = 0;
    const receipt = await executeTask({ ...input, sourceRoot: dir, run: async (_command, argv, options) => {
      calls++;
      if (calls === 1) return { exitCode: 0, stdout: JSON.stringify({ minified: { files: 1 } }) };
      if (calls === 2) { assert.ok(argv.includes('--stamp-only')); return { exitCode: 0 }; }
      assert.equal(options.env.APEX_REUSE_SERVER, '1');
      const origin = `http://127.0.0.1:${options.env.APEX_PORT}`;
      assert.equal(await (await fetch(`${origin}/index.html`)).text(), html);
      assert.equal(await (await fetch(`${origin}/runtime.js`)).text(), 'window.staged=true');
      assert.equal((await fetch(`${origin}/secret.json`)).status, 404);
      assert.equal((await fetch(`${origin}/escape.json`)).status, 403);
      return { exitCode: 0 };
    } });
    assert.equal(receipt.complete, true); assert.equal(calls, 3);
    const failed = await executeTask({ ...input, sourceRoot: dir, run: async () => ({ exitCode: 0, stdout: '{"minified":{"files":0}}' }) });
    assert.equal(failed.complete, false); assert.match(failed.error, /did not minify/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
