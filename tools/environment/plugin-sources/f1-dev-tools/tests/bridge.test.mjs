// @doc Bridge.test: canonical F1 environment and plugin support.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const entry = fileURLToPath(new URL('../scripts/apex-tools-bridge.mjs', import.meta.url));
function fixture(t, gateway) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'f1-plugin-bridge-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  fs.mkdirSync(path.join(root, 'tools/mcp'), {recursive:true});
  fs.mkdirSync(path.join(root, 'js'));
  fs.writeFileSync(path.join(root, 'js/game.js'), '');
  fs.writeFileSync(path.join(root, 'tools/mcp/apex-tools-mcp.sh'), 'printf "wrapper:%s" "$1"\n');
  if (gateway) fs.writeFileSync(path.join(root, 'tools/mcp/output-level-mcp.sh'), 'printf "gateway:%s:%s:" "$1" "$2"\nshift 3\nexec "$@"\n');
  return root;
}
function run(root) {
  const env = {...process.env, F1_GAME_CHECKOUT: root};
  delete env.APEX_GAME_CHECKOUT;
  return spawnSync(process.execPath, [entry], {cwd:os.tmpdir(), env, encoding:'utf8', timeout:5000});
}
test('explicit nested path cannot silently select its parent checkout', t => {
  const root = fixture(t, false);
  const nested = path.join(root, 'nested'); fs.mkdirSync(nested);
  const result = run(nested);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
});
test('selected checkout uses its output gateway and passes the server and serve mode', t => {
  const result = run(fixture(t, true));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'gateway:--server:apex-tools:wrapper:serve');
});
test('older checkout retains direct-wrapper compatibility', t => {
  const result = run(fixture(t, false));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'wrapper:serve');
});
