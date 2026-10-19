import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, symlinkSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const recorder = fileURLToPath(new URL('../helpers/agent-experiment.py', import.meta.url));
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'agent-experiment-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const args of [['init', '-q'], ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture']]) {
    assert.equal(spawnSync('git', args, { cwd: root }).status, 0);
  }
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  const run = (args = [], code = "print('hello')", cwd = root) => spawnSync('python3', [recorder, '--worktree', root, ...args, '--', 'python3', '-c', code], { cwd });
  const rows = () => readFileSync(path.join(root, 'artifacts/agent-experiments/records.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  return { root, head, run, rows };
}

test('wrong cwd, HEAD, traversal and symlink escape refuse before child execution', t => {
  const f = fixture(t);
  const marker = path.join(f.root, 'marker');
  const code = `open(${JSON.stringify(marker)}, 'w').write('executed')`;
  assert.notEqual(f.run([], code, tmpdir()).status, 0);
  assert.notEqual(f.run(['--expected-head', 'bad'], code).status, 0);
  assert.notEqual(f.run(['--records', 'artifacts/../outside/records'], code).status, 0);
  mkdirSync(path.join(f.root, 'artifacts'), { recursive: true });
  symlinkSync(tmpdir(), path.join(f.root, 'artifacts/escape'));
  assert.notEqual(f.run(['--stdout', 'artifacts/escape/out'], code).status, 0);
  assert.equal(existsSync(marker), false);
});

test('raw bytes, exact argv/cwd/head, exit 7 and visible mismatch survive capture', t => {
  const f = fixture(t);
  const code = "import os; os.write(1,b'\\x00\\xffabc'); os.write(2,b'err\\xfe'); raise SystemExit(7)";
  const result = f.run(['--expected-head', f.head, '--mode', 'compact', '--limit', '2'], code);
  assert.equal(result.status, 7);
  const [row] = f.rows();
  assert.equal(row.cwd, f.root);
  assert.equal(row.git_head, f.head);
  assert.deepEqual(row.argv, ['python3', '-c', code]);
  assert.deepEqual(readFileSync(row.stdout_path), Buffer.from([0, 255, 97, 98, 99]));
  assert.deepEqual(readFileSync(row.stderr_path), Buffer.from([101, 114, 114, 254]));
  assert.equal(row.exit_code, 7);
  assert.equal(row.actual_route_output_level, 'native');
  assert.equal(row.declared_mode_mismatch, true);
  assert.equal(row.terminal_emitted_bytes, result.stdout.length);
  assert.equal(row.display_truncated, true);
  assert.equal(row.billed_tokens, null);
  assert.equal(row.host_model_visible_bytes, null);
  assert.equal(statSync(row.stdout_path).mode & 0o777, 0o600);
  assert.equal(statSync(path.dirname(row.stdout_path)).mode & 0o777, 0o700);
  const receipt = JSON.parse(result.stdout.toString().trim().split('\n').at(-1));
  assert.equal(receipt.mode_mismatch, true);
});

test('limits and between-command caps refuse launch and report admitted overshoot', t => {
  const f = fixture(t);
  const marker = path.join(f.root, 'marker');
  const code = `open(${JSON.stringify(marker)}, 'w').write('executed')`;
  for (const args of [['--limit', '-1'], ['--limit', '30001'], ['--limit', '12001'], ['--timeout', 'nan'], ['--heavy']]) {
    assert.notEqual(f.run(args, code).status, 0);
  }
  assert.equal(existsSync(marker), false);
  assert.equal(f.run(['--time-budget', '0.000001', '--cpu-budget', '0.000001', '--limit', '12001', '--large-output-reason', 'bounded fixture']).status, 0);
  assert.ok(f.rows()[0].budget_overshoot.wall_seconds > 0);
  for (const args of [['--command-budget', '1'], ['--time-budget', '0.000001'], ['--cpu-budget', '0.000001']]) {
    assert.notEqual(f.run(args, code).status, 0);
  }
  assert.equal(existsSync(marker), false);
});

test('timeout records original terminating signal and bounded cleanup', t => {
  const f = fixture(t);
  assert.equal(f.run(['--timeout', '0.05'], 'import time; time.sleep(5)').status, 124);
  const [row] = f.rows();
  assert.equal(row.timed_out, true);
  assert.equal(row.signal, 15);
  assert.equal(row.exit_code, -15);
  assert.ok(row.command_wall_seconds < 2);
});

test('agent-run route is inferred from its options and ignores child options', t => {
  const f = fixture(t);
  const runner = fileURLToPath(new URL('../../tools/agent-run.mjs', import.meta.url));
  const result = spawnSync('python3', [recorder, '--worktree', f.root, '--mode', 'full', '--', process.execPath, runner, '--output-level=full', '--', 'python3', '-c', "print('ok')", '--output-level=compact'], { cwd: f.root });
  assert.equal(result.status, 0);
  assert.equal(f.rows()[0].actual_route_output_level, 'full');
  assert.equal(f.rows()[0].declared_mode_mismatch, false);
});

test('launch errors retain an error and do not fabricate a child exit', t => {
  const f = fixture(t);
  const result = spawnSync('python3', [recorder, '--worktree', f.root, '--', path.join(f.root, 'missing-executable')], { cwd: f.root });
  assert.equal(result.status, 127);
  assert.equal(f.rows()[0].exit_code, null);
  assert.match(f.rows()[0].launch_error, /No such file/);
});
