// CLI guards and help text from the 2026-11-18 skill walkthrough (#5674): each case is exact output or exit code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runDiff } from '../../tools/ui/audit-diff.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const run = (...args) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, APEX_SUBAGENT: '1' } });

test('render-car refuses --preset with --views before any launch', () => {
  const r = run('tools/car/render-car.mjs', '--preset=livery', '--views=tail');
  assert.equal(r.status, 2);
  assert.equal(r.stderr.trim(), 'render-car: --preset overrides --views; pass one of them');
});

test('layout-audit --diff with a missing baseline returns 2 with one line, no stack', () => {
  const errs = [], orig = console.error;
  console.error = (m) => errs.push(m);
  try { assert.equal(runDiff('/nonexistent/before.json', '/nonexistent/after.json'), 2); }
  finally { console.error = orig; }
  assert.deepEqual(errs, ['layout-audit --diff: baseline audit not found: /nonexistent/before.json']);
});

test('build-viewer --help prints its usage and exits 0', () => {
  const r = run('tools/viewer/build-viewer.mjs', '--help');
  assert.equal(r.status, 0);
  const lines = r.stdout.trimEnd().split('\n');
  assert.equal(lines[0], '  node tools/viewer/build-viewer.mjs                         all cars + monza,spa,monaco,suzuka');
  assert.equal(lines.at(-1), '  node tools/viewer/build-viewer.mjs --json                  one JSON line: {ok,out,bytes,cars,circuits[,shots,sheet]}');
});

test('flicker-gate --help lists every flag it parses', () => {
  const r = run('tools/shot/flicker-gate.mjs', '--help');
  assert.equal(r.status, 0);
  assert.equal(r.stdout.split('\n')[2], '  node tools/shot/flicker-gate.mjs [--site <id> ...] [--backend webgl2|three|webgpu] [--root <tree>]');
  assert.equal(r.stdout.split('\n')[3], '    [--out DIR] [--png] [--a3] [--no-settle] [--list]');
});

test('backend-compare --help names --side and --label', () => {
  const r = run('tools/shot/backend-compare.mjs', '--help');
  assert.equal(r.status, 0);
  const lines = r.stdout.split('\n');
  assert.equal(lines[4], '    [--side -1|1]                 trackside cam: which side of the road (default 1)');
  assert.equal(lines[5], '    [--label NAME]                output file stem (default <track>-<frac%>-<cam>-<tod>)');
});

test('spine-station usage shows the value forms it reads', () => {
  const r = run('tools/car/spine-station.mjs', '--help');
  assert.equal(r.status, 0);
  assert.equal(r.stdout.split('\n')[0], 'usage: node tools/car/spine-station.mjs [--team=<id>|all] [--logo=<id>] [--side=<id>,...] [--occlude] [--png=<dir>]');
});
