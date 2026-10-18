import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { materializeRuntime } from '../../tools/mcp/chrome-devtools-runtime.mjs';

const INPUT_FRAGMENT = `                    await handle.asLocator().click({
                        count: request.params.dblClick ? 2 : 1,
                    });`;
const CONTEXT_FRAGMENT = `        await page.pptrPage.close({ runBeforeUnload: false });
    }
    get #hasNetworkBlockOrAllowlist()`;
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-server-fixes-'));
  const source = path.join(root, 'source');
  const input = `const logger=()=>{}; export async function click(request,handle){\n${INPUT_FRAGMENT}\n}\n`;
  const context = `export class McpContext {\n    async closePage(page) {\n${CONTEXT_FRAGMENT} { return false; }\n}\n`;
  fs.mkdirSync(path.join(source, 'build/src/tools'), { recursive: true });
  fs.mkdirSync(path.join(source, 'build/src/bin'), { recursive: true });
  fs.mkdirSync(path.join(source, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({ name: 'chrome-devtools-mcp', version: '1.7.0', type: 'module' }));
  fs.writeFileSync(path.join(source, 'build/src/tools/input.js'), input);
  fs.writeFileSync(path.join(source, 'build/src/McpContext.js'), context);
  fs.writeFileSync(path.join(source, 'build/src/bin/chrome-devtools-mcp.js'), '#!/usr/bin/env node\n');
  return { root, source, cache: path.join(root, 'cache'), guards: { 'build/src/tools/input.js': sha(input), 'build/src/McpContext.js': sha(context) } };
}

test('materialized Chrome server fixes dialog click and selected-page close without mutating source', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const bin = materializeRuntime({ sourceRoot: f.source, cacheRoot: f.cache, guards: f.guards });
  const runtime = path.resolve(path.dirname(bin), '../../..');
  const patchedInput = fs.readFileSync(path.join(runtime, 'build/src/tools/input.js'), 'utf8');
  const patchedContext = fs.readFileSync(path.join(runtime, 'build/src/McpContext.js'), 'utf8');
  assert.match(patchedInput, /Promise\.race/);
  assert.match(patchedInput, /pptrPage\.once\('dialog'/);
  assert.match(patchedContext, /await this\.createPagesSnapshot\(\)/);
  assert.match(patchedInput, /completed === 'dialog'[\s\S]*locatorClick\.catch/, 'only a click that opened a new dialog consumes the late locator rejection');
  assert.equal(fs.readFileSync(path.join(f.source, 'build/src/tools/input.js'), 'utf8').includes('Promise.race'), false);
  assert.equal(fs.readFileSync(path.join(f.source, 'build/src/McpContext.js'), 'utf8').includes('createPagesSnapshot'), false);
  assert.ok(fs.lstatSync(path.join(runtime, 'node_modules')).isSymbolicLink());
  for (const file of ['build/src/tools/input.js', 'build/src/McpContext.js']) {
    const checked = spawnSync(process.execPath, ['--check', path.join(runtime, file)], { encoding: 'utf8' });
    assert.equal(checked.status, 0, checked.stderr);
  }
  assert.equal(materializeRuntime({ sourceRoot: f.source, cacheRoot: f.cache, guards: f.guards }), bin, 'validated cache is reused');
  fs.appendFileSync(path.join(runtime, 'build/src/tools/input.js'), '// corrupt cache\n');
  assert.equal(materializeRuntime({ sourceRoot: f.source, cacheRoot: f.cache, guards: f.guards }), bin, 'invalid cache is atomically rebuilt');
  assert.doesNotMatch(fs.readFileSync(path.join(runtime, 'build/src/tools/input.js'), 'utf8'), /corrupt cache/);
  const manifestPath = path.join(runtime, 'apex-patch-manifest.json');
  const stale = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  stale.patchedHashes = {};
  stale.identity.transformDigest = 'stale-transform';
  fs.writeFileSync(manifestPath, JSON.stringify(stale));
  materializeRuntime({ sourceRoot: f.source, cacheRoot: f.cache, guards: f.guards });
  const repaired = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.deepEqual(Object.keys(repaired.patchedHashes).sort(), ['build/src/McpContext.js', 'build/src/tools/input.js']);
  assert.notEqual(repaired.identity.transformDigest, 'stale-transform');
});

test('materializer fails closed on package version and reviewed-source drift', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(f.source, 'package.json'), JSON.stringify({ name: 'chrome-devtools-mcp', version: '1.7.1' }));
  assert.throws(() => materializeRuntime({ sourceRoot: f.source, cacheRoot: f.cache, guards: f.guards }), /1\.7\.0 required/);
  fs.writeFileSync(path.join(f.source, 'package.json'), JSON.stringify({ name: 'chrome-devtools-mcp', version: '1.7.0' }));
  fs.appendFileSync(path.join(f.source, 'build/src/tools/input.js'), '// drift\n');
  assert.throws(() => materializeRuntime({ sourceRoot: f.source, cacheRoot: f.cache, guards: f.guards }), /SHA256 drift/);
});

test('materializer rejects a hash-approved file when the reviewed patch fragment is absent', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const inputPath = path.join(f.source, 'build/src/tools/input.js');
  const changed = fs.readFileSync(inputPath, 'utf8').replace('await handle.asLocator().click({', 'await handle.click({');
  fs.writeFileSync(inputPath, changed);
  f.guards['build/src/tools/input.js'] = sha(changed);
  assert.throws(() => materializeRuntime({ sourceRoot: f.source, cacheRoot: f.cache, guards: f.guards }), /reviewed upstream fragment missing/);
});

test('different source roots cannot race for or replace the same runtime target', t => {
  const a = fixture(); const b = fixture();
  t.after(() => { fs.rmSync(a.root, { recursive: true, force: true }); fs.rmSync(b.root, { recursive: true, force: true }); });
  const sharedCache = path.join(os.tmpdir(), `chrome-server-shared-${process.pid}-${Date.now()}`);
  t.after(() => fs.rmSync(sharedCache, { recursive: true, force: true }));
  const aBin = materializeRuntime({ sourceRoot: a.source, cacheRoot: sharedCache, guards: a.guards });
  const bBin = materializeRuntime({ sourceRoot: b.source, cacheRoot: sharedCache, guards: b.guards });
  assert.notEqual(aBin, bBin);
  assert.ok(fs.existsSync(aBin)); assert.ok(fs.existsSync(bBin));
  const aManifest = JSON.parse(fs.readFileSync(path.resolve(path.dirname(aBin), '../../../apex-patch-manifest.json')));
  const bManifest = JSON.parse(fs.readFileSync(path.resolve(path.dirname(bBin), '../../../apex-patch-manifest.json')));
  assert.notEqual(aManifest.identity.sourceRoot, bManifest.identity.sourceRoot);
});

test('dead materializer owner is recovered while a live owner is preserved', t => {
  const f = fixture(); t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const bin = materializeRuntime({ sourceRoot: f.source, cacheRoot: f.cache, guards: f.guards });
  const runtime = path.resolve(path.dirname(bin), '../../..');
  const cacheKey = path.basename(path.dirname(runtime));
  const lock = path.join(f.cache, `.${cacheKey}.lock`);
  fs.rmSync(runtime, { recursive: true, force: true });
  fs.mkdirSync(lock);
  fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: 999_999_999, cacheKey }));
  assert.equal(materializeRuntime({ sourceRoot: f.source, cacheRoot: f.cache, guards: f.guards, lockWaitMs: 200 }), bin);
  assert.equal(fs.existsSync(lock), false, 'recovered stale lock is removed after materialization');

  fs.rmSync(runtime, { recursive: true, force: true });
  fs.mkdirSync(lock);
  fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, cacheKey }));
  assert.throws(() => materializeRuntime({ sourceRoot: f.source, cacheRoot: f.cache, guards: f.guards, lockWaitMs: 30, lockPollMs: 5 }), /timed out waiting/);
  assert.equal(fs.existsSync(lock), true, 'live owner lock is not removed');
  fs.rmSync(lock, { recursive: true, force: true });
});

test('patched click action handles dialog and all locator settlements without leaking listeners', async t => {
  const f = fixture(); t.after(() => fs.rmSync(f.root, { recursive: true, force: true }));
  const bin = materializeRuntime({ sourceRoot: f.source, cacheRoot: f.cache, guards: f.guards });
  const inputPath = path.resolve(path.dirname(bin), '../tools/input.js');
  const { click } = await import(`${pathToFileURL(inputPath).href}?test=${Date.now()}`);
  const run = action => {
    const page = new EventEmitter();
    const request = { params: { dblClick: false }, page: { pptrPage: page } };
    const handle = { asLocator: () => ({ click: action }) };
    return { page, result: click(request, handle) };
  };

  let rejectLate;
  const dialog = run(() => new Promise((_, reject) => { rejectLate = reject; }));
  dialog.page.emit('dialog', {});
  assert.equal(await dialog.result, undefined, 'new dialog completes the action promptly');
  assert.equal(dialog.page.listenerCount('dialog'), 0);
  rejectLate(new Error('locator paused by modal dialog'));
  await new Promise(resolve => setImmediate(resolve)); // late rejection is consumed

  const asyncFailure = run(() => Promise.reject(new Error('ordinary async failure')));
  await assert.rejects(asyncFailure.result, /ordinary async failure/);
  assert.equal(asyncFailure.page.listenerCount('dialog'), 0);

  const syncFailure = run(() => { throw new Error('ordinary sync failure'); });
  await assert.rejects(syncFailure.result, /ordinary sync failure/);
  assert.equal(syncFailure.page.listenerCount('dialog'), 0);

  const success = run(() => Promise.resolve());
  await success.result;
  assert.equal(success.page.listenerCount('dialog'), 0);
});

test('Chrome wrapper applies the guarded runtime to local and pinned npm backends', () => {
  const wrapper = fs.readFileSync(new URL('../../tools/mcp/chrome-devtools-mcp.sh', import.meta.url), 'utf8');
  assert.match(wrapper, /MCP_NPM_PACKAGE="chrome-devtools-mcp@1\.7\.0"/);
  assert.match(wrapper, /npm exec --yes --package="\$MCP_NPM_PACKAGE"/);
  assert.match(wrapper, /patched_bin="\$\(node "\$PATCHER"/);
  assert.match(wrapper, /exec node "\$patched_bin"/);
  assert.doesNotMatch(wrapper, /exec npx -y "\$MCP_NPM_PACKAGE"/);
});
