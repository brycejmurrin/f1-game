#!/usr/bin/env node
// @doc Version gate for chrome-devtools-mcp: materialize the Apex 1.7.0 fixes; 1.11.0 passes unpatched; else fail closed.
// Upstream source (v1.7.0, the patched pin):
// https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/v1.7.0/src/tools/input.ts
// https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/v1.7.0/src/McpContext.ts
// Tool contract: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/v1.7.0/docs/tool-reference.md
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PATCH_ID = 'apex-dialog-close-v1';
const EXPECTED_VERSION = '1.7.0';
// Versions audited to carry BOTH patched fixes upstream, served unpatched —
// any other version fails closed in prepareSource below. 1.11.0 evidence
// (re-audit 2026-10-21): dialog-blocked input actions are handled upstream
// since 1.10.0 (ChromeDevTools/chrome-devtools-mcp#2794: the click handler
// catches the locator failure and reports "opened a dialog" when one is
// open), and close_page refreshes the pages snapshot at response time —
// McpResponse calls createPagesSnapshot() whenever the response includes
// pages, so the selected-page fallback runs before the response is built
// (plus the close_page guard-order fix, upstream #3042). Verified live
// against the unpatched 1.11.0 package: a click that opens alert()
// completes and reports the dialog, and closing the selected page answers
// with the surviving page selected.
const UNPATCHED_VERSIONS = Object.freeze(['1.11.0']);
const DEFAULT_GUARDS = Object.freeze({
  'build/src/tools/input.js': 'a6fbc87b0f1d3dde17cd7f721610a1a06df980de0409d873422bebbed0fcdb4a',
  'build/src/McpContext.js': '61b457a04cf654f7370d453b68a23a3ce5969951714efbd9ff1aa884afe10c5c',
});

const INPUT_OLD = `                    await handle.asLocator().click({
                        count: request.params.dblClick ? 2 : 1,
                    });`;
const INPUT_NEW = `                    // A modal dialog pauses the renderer, so Puppeteer's locator
                    // may not resolve after it successfully dispatches the click. Race
                    // the action against the dialog and consume only that late rejection.
                    let dialogHandler;
                    const dialogOpened = new Promise(resolve => {
                        dialogHandler = () => resolve('dialog');
                        request.page.pptrPage.once('dialog', dialogHandler);
                    });
                    let locatorClick;
                    try {
                        // The promise turn also converts a synchronous locator throw
                        // into the same rejection path as an asynchronous failure.
                        locatorClick = Promise.resolve().then(() => handle.asLocator().click({
                            count: request.params.dblClick ? 2 : 1,
                        }));
                        const completed = await Promise.race([
                            locatorClick.then(() => 'click'),
                            dialogOpened,
                        ]);
                        if (completed === 'dialog') {
                            void locatorClick.catch(error => logger?.('locator settled after opening dialog', error));
                        }
                    }
                    finally {
                        request.page.pptrPage.off('dialog', dialogHandler);
                    }`;
const CONTEXT_OLD = `        await page.pptrPage.close({ runBeforeUnload: false });
    }
    get #hasNetworkBlockOrAllowlist()`;
const CONTEXT_NEW = `        await page.pptrPage.close({ runBeforeUnload: false });
        // Refresh wrappers and select a surviving page before ToolHandler builds
        // the close_page response. This uses the existing selected-page fallback.
        await this.createPagesSnapshot();
    }
    get #hasNetworkBlockOrAllowlist()`;

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}
function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before);
  assert.notEqual(first, -1, `${label}: reviewed upstream fragment missing`);
  assert.equal(source.indexOf(before, first + before.length), -1, `${label}: reviewed upstream fragment is ambiguous`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}
function dependencyRoot(sourceRoot) {
  const parent = path.dirname(sourceRoot);
  return path.basename(parent) === 'node_modules' ? parent : path.join(sourceRoot, 'node_modules');
}
function prepareSource(sourceRoot, guards) {
  const pkg = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'chrome-devtools-mcp', `unexpected package: ${pkg.name}`);
  assert.equal(pkg.version, EXPECTED_VERSION, `chrome-devtools-mcp ${EXPECTED_VERSION} required; found ${pkg.version}`);
  const sourceHashes = {};
  for (const [relative, expected] of Object.entries(guards)) {
    const bytes = fs.readFileSync(path.join(sourceRoot, relative));
    sourceHashes[relative] = sha256(bytes);
    assert.equal(sourceHashes[relative], expected, `${relative}: upstream SHA256 drift; review before changing the guard`);
  }
  const inputRelative = 'build/src/tools/input.js';
  const contextRelative = 'build/src/McpContext.js';
  const patchedFiles = {
    [inputRelative]: replaceExactlyOnce(fs.readFileSync(path.join(sourceRoot, inputRelative), 'utf8'), INPUT_OLD, INPUT_NEW, 'dialog click fix'),
    [contextRelative]: replaceExactlyOnce(fs.readFileSync(path.join(sourceRoot, contextRelative), 'utf8'), CONTEXT_OLD, CONTEXT_NEW, 'selected close_page fix'),
  };
  const patchedHashes = Object.fromEntries(Object.entries(patchedFiles).map(([relative, contents]) => [relative, sha256(contents)]));
  const transformDigest = sha256(JSON.stringify({ patchId: PATCH_ID, inputBefore: INPUT_OLD, inputAfter: INPUT_NEW, contextBefore: CONTEXT_OLD, contextAfter: CONTEXT_NEW }));
  return { sourceHashes, patchedFiles, patchedHashes, transformDigest };
}
function cacheValid(target, expectedManifest) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(target, 'apex-patch-manifest.json'), 'utf8'));
    assert.deepEqual(manifest, expectedManifest);
    for (const [relative, expected] of Object.entries(expectedManifest.patchedHashes)) {
      assert.equal(sha256(fs.readFileSync(path.join(target, relative))), expected);
    }
    assert.ok(fs.lstatSync(path.join(target, 'node_modules')).isSymbolicLink());
    assert.equal(fs.realpathSync(path.join(target, 'node_modules')), expectedManifest.identity.dependencyRoot);
    assert.ok(fs.existsSync(path.join(target, 'build/src/bin/chrome-devtools-mcp.js')));
    return true;
  } catch {
    return false;
  }
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}
function recoverDeadOwner(lock, cacheKey) {
  let owner;
  try { owner = JSON.parse(fs.readFileSync(path.join(lock, 'owner.json'), 'utf8')); }
  catch { return false; } // prepared-directory rename prevents an ownerless published lock
  if (owner.cacheKey !== cacheKey || processAlive(owner.pid)) return false;
  const stale = `${lock}.stale-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  try { fs.renameSync(lock, stale); }
  catch (error) { if (error.code === 'ENOENT') return true; throw error; }
  fs.rmSync(stale, { recursive: true, force: true });
  return true;
}
function tryAcquireLock(lock, cacheKey) {
  const prepared = `${lock}.prepared-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.mkdirSync(prepared);
  fs.writeFileSync(path.join(prepared, 'owner.json'), JSON.stringify({ pid: process.pid, cacheKey, createdAt: new Date().toISOString() }));
  try {
    fs.renameSync(prepared, lock);
    return true;
  } catch (error) {
    fs.rmSync(prepared, { recursive: true, force: true });
    if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
    return false;
  }
}

export function materializeRuntime({ sourceRoot, cacheRoot = path.join(ROOT, 'scratch/chrome-devtools-runtime'), guards = DEFAULT_GUARDS, lockWaitMs = 10_000, lockPollMs = 100 } = {}) {
  assert.ok(sourceRoot, 'sourceRoot is required');
  sourceRoot = fs.realpathSync(sourceRoot);
  const pkg = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'chrome-devtools-mcp', `unexpected package: ${pkg.name}`);
  if (UNPATCHED_VERSIONS.includes(pkg.version)) {
    // Audited upstream-fixed release: no copy, no transform — serve the
    // package's own built bin exactly as published.
    const bin = path.join(sourceRoot, 'build/src/bin/chrome-devtools-mcp.js');
    assert.ok(fs.existsSync(bin), `chrome-devtools-mcp ${pkg.version} is audited unpatched but has no built bin at ${bin}`);
    return bin;
  }
  const { sourceHashes, patchedFiles, patchedHashes, transformDigest } = prepareSource(sourceRoot, guards);
  const dependencies = fs.realpathSync(dependencyRoot(sourceRoot));
  const identity = { package: `chrome-devtools-mcp@${EXPECTED_VERSION}`, patchId: PATCH_ID, transformDigest, sourceRoot, dependencyRoot: dependencies, sourceHashes };
  const cacheKey = `${EXPECTED_VERSION}-${PATCH_ID}-${sha256(JSON.stringify(identity)).slice(0, 16)}`;
  const target = path.join(cacheRoot, cacheKey, 'chrome-devtools-mcp');
  const expectedManifest = { identity, patchedHashes };
  if (cacheValid(target, expectedManifest)) return path.join(target, 'build/src/bin/chrome-devtools-mcp.js');

  fs.mkdirSync(cacheRoot, { recursive: true });
  const lock = path.join(cacheRoot, `.${cacheKey}.lock`);
  let locked = false;
  const lockDeadline = Date.now() + lockWaitMs;
  while (Date.now() <= lockDeadline) {
    if (tryAcquireLock(lock, cacheKey)) { locked = true; break; }
    if (cacheValid(target, expectedManifest)) return path.join(target, 'build/src/bin/chrome-devtools-mcp.js');
    if (recoverDeadOwner(lock, cacheKey)) continue;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(1, Math.min(lockPollMs, lockDeadline - Date.now())));
  }
  assert.ok(locked, `timed out waiting for Chrome runtime materialization lock: ${lock}`);
  const stageBase = path.join(cacheRoot, `.${cacheKey}.tmp-${process.pid}-${crypto.randomBytes(5).toString('hex')}`);
  const stage = path.join(stageBase, 'chrome-devtools-mcp');
  try {
    if (cacheValid(target, expectedManifest)) return path.join(target, 'build/src/bin/chrome-devtools-mcp.js');
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(stageBase, { recursive: true });
    fs.cpSync(sourceRoot, stage, {
      recursive: true,
      filter: source => !['node_modules', '.git'].includes(path.basename(source)),
    });
    for (const [relative, contents] of Object.entries(patchedFiles)) fs.writeFileSync(path.join(stage, relative), contents);
    fs.symlinkSync(dependencies, path.join(stage, 'node_modules'), 'dir');
    fs.writeFileSync(path.join(stage, 'apex-patch-manifest.json'), JSON.stringify(expectedManifest, null, 2));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(stage, target);
  } finally {
    fs.rmSync(stageBase, { recursive: true, force: true });
    fs.rmSync(lock, { recursive: true, force: true });
  }
  assert.ok(cacheValid(target, expectedManifest), 'materialized Chrome runtime failed validation');
  return path.join(target, 'build/src/bin/chrome-devtools-mcp.js');
}

function cli() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    process.stdout.write('usage: chrome-devtools-runtime.mjs --source-root PATH [--cache-root PATH]\nVersion-gate the Chrome MCP runtime (patched 1.7.0 materialized, audited 1.11.0 passed through, anything else fails closed); prints its CLI path.\n');
    return;
  }
  const sourceIndex = args.indexOf('--source-root');
  const cacheIndex = args.indexOf('--cache-root');
  assert.notEqual(sourceIndex, -1, 'usage: chrome-devtools-runtime.mjs --source-root PATH [--cache-root PATH]');
  const sourceRoot = args[sourceIndex + 1];
  const cacheRoot = cacheIndex === -1 ? undefined : args[cacheIndex + 1];
  process.stdout.write(`${materializeRuntime({ sourceRoot, cacheRoot })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
