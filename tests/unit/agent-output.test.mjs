// Shared agent output: bounded presentation is never a replacement for retained evidence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { spawnAgentProcess } from '../../tools/lib/agent-process.mjs';
import { fileURLToPath } from 'node:url';
import { OUTPUT_LEVELS, validateOutputLevel, saveOutputArtifact, summarizeOutput, presentMcpResult, readOutputArtifact, readOriginalMcpArtifact, readOutputCollection } from '../../tools/lib/agent-output.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = path.join(ROOT, 'tools/agent-run.mjs');
function fixture(t) {
  fs.mkdirSync(path.join(ROOT, 'scratch'), { recursive: true });
  const root = fs.mkdtempSync(path.join(ROOT, 'scratch/agent-output-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function cli(root, argv) { return spawnSync(process.execPath, [CLI, ...argv], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }); }

test('levels reject mistakes rather than silently falling back', () => {
  assert.deepEqual(OUTPUT_LEVELS, ['compact', 'diagnostic', 'full']);
  assert.equal(validateOutputLevel(undefined), 'compact');
  assert.equal(validateOutputLevel(undefined, 'full'), 'full');
  for (const level of ['', null, 'brief', 'FULL']) assert.throws(() => validateOutputLevel(level), /output level/);
});
test('huge JSON retains failure, counts and bounded excerpts with omissions', () => {
  const original = { status: 'unknown', verdict: 'failed', counts: { failed: 25, passed: 100 }, error: { message: 'bad input', fix: 'supply track', stack: 'failure trace\n' + 'x'.repeat(20000) }, rows: Array.from({ length: 5000 }, (_, i) => ({ i, value: 'x'.repeat(1000) })) };
  const compact = summarizeOutput(original);
  assert.equal(compact.status, 'unknown');
  assert.deepEqual(compact.counts, original.counts);
  assert.equal(compact.error.fix, 'supply track');
  assert.match(JSON.stringify(compact), /omitted/);
  assert.ok(JSON.stringify(compact).length < 10000);
  const diagnostic = summarizeOutput(original, { level: 'diagnostic' });
  assert.ok(diagnostic.error.stack.length > compact.error.stack.length);
  assert.ok(JSON.stringify(diagnostic).length < 25000);
});
test('wide numeric trees and huge property names remain bounded', () => {
  function tree(depth) { return depth ? Object.fromEntries(Array.from({ length: 20 }, (_, i) => ['branch' + i, tree(depth - 1)])) : 42; }
  const value = { status: 'unknown', tree: tree(4), ['x'.repeat(100000)]: 1 };
  assert.ok(JSON.stringify(summarizeOutput(value)).length < 25000);
  assert.ok(JSON.stringify(summarizeOutput(value, { level: 'diagnostic' })).length < 50000);
  const longCollectionKey = summarizeOutput({ ['x'.repeat(100000)]: Array(50).fill(1) });
  assert.ok(JSON.stringify(longCollectionKey).length < 10000);
  assert.equal(Object.values(longCollectionKey)[0].at(-1).sourcePointerOmitted, true);
  const exhausted = Object.fromEntries(Array.from({ length: 35 }, (_, i) => ['error' + i, 'x'.repeat(100000)]));
  assert.ok(JSON.stringify(summarizeOutput(exhausted)).length < 10000);
  assert.ok(JSON.stringify(summarizeOutput(exhausted, { level: 'diagnostic' })).length < 25000);
});

test('full MCP preserves exact result identity while compact mirrors artifact envelope in text', (t) => {
  const root = fixture(t);
  const result = { content: [{ type: 'text', text: JSON.stringify({ status: 'failed', error: 'broken', count: 999, rows: Array(1000).fill('r') }) }, { type: 'image', mimeType: 'image/png', data: 'BASE64'.repeat(100000) }], structuredContent: { verdict: 'unknown' }, isError: true, custom: 'kept in artifact' };
  assert.equal(presentMcpResult(result, { root, level: 'full' }), result);
  const compact = presentMcpResult(result, { root, tool: 'probe' });
  assert.equal(compact.isError, true);
  assert.deepEqual(JSON.parse(compact.content[0].text), compact.structuredContent);
  assert.ok(compact.content[0].text.length < 10000);
  assert.equal(compact.structuredContent.summary.content[0].data.status, 'failed');
  assert.equal(compact.structuredContent.summary.content[1].omittedDataCharacters, 600000);
  const file = path.join(root, compact.structuredContent.artifact.path);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), result);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});
test('byte retrieval is paged, level independent and traversal/symlink safe', (t) => {
  const root = fixture(t);
  const artifact = saveOutputArtifact('0123456789'.repeat(10000), { root, tool: 'test', kind: 'stdout' });
  const page = readOutputArtifact({ root, artifact, level: 'full', offset: 7, limit: 12 });
  assert.equal(page.text, '789012345678');
  assert.equal(page.nextOffset, 19);
  assert.equal(page.totalBytes, 100000);
  for (const ref of ['/etc/passwd', '../foo', 'artifacts/agent-output/../agent-output/x', 'artifacts/agent-output/../../../package.json']) assert.throws(() => readOutputArtifact({ root, artifact: ref }));
  const link = path.join(root, 'artifacts/agent-output/link');
  fs.symlinkSync(path.join(ROOT, 'package.json'), link);
  assert.throws(() => readOutputArtifact({ root, artifact: 'artifacts/agent-output/link' }), /symlink/);
  assert.throws(() => readOutputArtifact({ root, artifact, limit: 300000 }), /limit/);
  assert.throws(() => readOutputArtifact({ root, artifact, offset: -1 }), /offset/);
});
test('artifact directory symlinks are rejected and presentation failure preserves original error', (t) => {
  const root = fixture(t);
  fs.symlinkSync(path.join(ROOT, 'scratch'), path.join(root, 'artifacts'));
  const result = { content: [{ type: 'text', text: 'original failure' }], isError: true };
  const output = presentMcpResult(result, { root });
  assert.equal(output.isError, true);
  assert.equal(output.content[0].text, 'original failure');
  assert.match(output.presentationError, /real directory/);
  const originalWrite = process.stderr.write;
  let warning = '';
  process.stderr.write = (chunk) => { warning += chunk; return true; };
  try { assert.equal(presentMcpResult(result, { root, level: 'full' }), result); }
  finally { process.stderr.write = originalWrite; }
  assert.match(warning, /presentation error/);
});
test('CLI defaults compact, preserves failing exit and exact separately retained streams', (t) => {
  const root = fixture(t);
  const stdout = JSON.stringify({ status: 'failed', count: 10000, rows: Array(10000).fill('large') });
  const stderr = 'Error: invalid track\n' + 'trace detail\n'.repeat(1000);
  const run = cli(root, ['--', process.execPath, '-e', `process.stdout.write(${JSON.stringify(stdout)});process.stderr.write(${JSON.stringify(stderr)});process.exit(23)`]);
  assert.equal(run.status, 23);
  const result = JSON.parse(run.stdout);
  assert.equal(result.outputLevel, 'compact');
  assert.equal(result.exitCode, 23);
  assert.equal(result.status, 'exited');
  assert.equal(result.stdout.data.status, 'failed');
  assert.equal(fs.readFileSync(path.join(root, result.stdout.artifact.path), 'utf8'), stdout);
  assert.equal(fs.readFileSync(path.join(root, result.stderr.artifact.path), 'utf8'), stderr);
  assert.ok(run.stdout.length < 15000);
  const read = cli(root, ['--read', result.stderr.artifact.path, '--output-level', 'full', '--limit', '20']);
  assert.equal(read.status, 0);
  assert.equal(JSON.parse(read.stdout).text, stderr.slice(0, 20));
  assert.equal(cli(root, ['--read', '/etc/passwd']).status, 1);
});
test('CLI full replays exact streams and never interprets argv as shell', (t) => {
  const root = fixture(t);
  const run = cli(root, ['--output-level=full', '--', process.execPath, '-e', 'process.stdout.write(process.argv[1]);process.stderr.write("original stderr\\n");process.exit(9)', '$(touch SHOULD_NOT_EXIST); literal']);
  assert.equal(run.status, 9);
  assert.equal(run.stdout, '$(touch SHOULD_NOT_EXIST); literal');
  assert.equal(run.stderr, 'original stderr\n');
  assert.equal(fs.existsSync(path.join(root, 'SHOULD_NOT_EXIST')), false);
});
test('CLI help and invalid options execute nothing; missing executables and explicit timeouts remain failures', (t) => {
  const root = fixture(t);
  assert.equal(cli(root, ['--help', '--', 'missing-command']).status, 0);
  assert.equal(fs.existsSync(path.join(root, 'artifacts')), false);
  assert.equal(cli(root, ['--output-level=bad', '--', process.execPath, '-e', 'process.exit(0)']).status, 1);
  const missing = cli(root, ['--', 'apex-command-that-does-not-exist']);
  assert.equal(missing.status, 127);
  assert.equal(JSON.parse(missing.stdout).status, 'spawn-error');
  const timeout = cli(root, ['--timeout-ms', '200', '--', process.execPath, '-e', 'setInterval(()=>{},1000)']);
  assert.equal(timeout.signal, 'SIGTERM');
  const result = JSON.parse(timeout.stdout);
  assert.equal(result.timedOut, true);
  assert.equal(result.status, 'timed-out');
  assert.equal(result.signal, 'SIGTERM');
  assert.equal(result.exitCode, null);
  const handled = cli(root, ['--timeout-ms', '400', '--', process.execPath, '-e', "process.on('SIGTERM',()=>process.exit(0)); setInterval(()=>{},1000)"]);
  assert.equal(handled.status, 124, 'a timeout must not become success when the child handles termination');
  const handledResult = JSON.parse(handled.stdout);
  assert.equal(handledResult.timedOut, true);
  assert.equal(handledResult.exitCode, 0, 'retained evidence preserves the actual child exit');
});
test('diagnostic finds middle failure lines in long logs', (t) => {
  const root = fixture(t);
  const log = 'routine\n'.repeat(4000) + 'Error: central failure\n    at broken.js:10\n' + 'routine\n'.repeat(4000);
  const run = cli(root, ['--output-level', 'diagnostic', '--', process.execPath, '-e', `process.stdout.write(${JSON.stringify(log)})`]);
  assert.equal(run.status, 0);
  assert.match(JSON.stringify(JSON.parse(run.stdout).stdout.diagnostics), /central failure/);
});

test('compact retains actionable middle failures and reported test counts', t => {
  const root = fixture(t);
  const log = 'routine\n'.repeat(2000) + 'Error: missing fixture alpha\n    at load.js:22\n' + 'routine\n'.repeat(2000) + '# tests 15\n# pass 14\n# fail 1\n';
  const result = cli(root, ['--', process.execPath, '-e', `process.stdout.write(${JSON.stringify(log)});process.exitCode=7`]);
  assert.equal(result.status, 7);
  const data = JSON.parse(result.stdout);
  assert.match(JSON.stringify(data.stdout.diagnostics), /missing fixture alpha/);
  assert.equal(data.stdout.testCounts.fail, 1);
  assert.equal(data.stdout.testCounts.pass, 14);
  assert.equal(fs.readFileSync(path.join(root, data.stdout.artifact.path), 'utf8'), log);
});

test('capture and performance phase logs retain semantic final reports and validity evidence', t => {
  const root = fixture(t);
  const report = { status: 'unknown', valid: false, renderer: 'software fixture', units: 'ms', baseline: 16.7, sampleCount: 400, manifest: 'artifacts/captures/manifest.json', results: [...Array.from({ length: 20 }, (_, i) => ({ id: i, status: 'passed' })), { id: 20, status: 'failed', cause: 'camera stale' }] };
  const log = '[capture] measuring phase\n' + JSON.stringify(report, null, 2) + '\n';
  const run = cli(root, ['--', process.execPath, '-e', `process.stdout.write(${JSON.stringify(log)})`]);
  const summary = JSON.parse(run.stdout).stdout;
  assert.match(summary.reportScope, /final JSON/);
  assert.equal(summary.data.valid, false);
  assert.equal(summary.data.units, 'ms');
  assert.equal(summary.data.baseline, 16.7);
  assert.equal(summary.data.sampleCount, 400);
  assert.equal(summary.data.results[0].cause, 'camera stale');
  assert.equal(summary.data.results.at(-1).statusCounts.failed, 1);
  assert.deepEqual(readOutputCollection({ root, artifact: summary.reportArtifact, pointer: summary.data.results.at(-1).sourcePointer, offset: 20, limit: 1 }).items, [report.results[20]]);
  assert.equal(fs.readFileSync(path.join(root, summary.artifact.path), 'utf8'), log);
});

test('small MCP answers retain native schema and avoid duplicate summary payloads', t => {
  const root = fixture(t);
  const original = { content: [{ type: 'text', text: 'connected' }], structuredContent: { connected: true }, _meta: { upstream: 'preserved' } };
  const result = presentMcpResult(original, { root });
  assert.deepEqual(result.content, original.content);
  assert.deepEqual(result.structuredContent, original.structuredContent);
  assert.equal(result._meta.upstream, 'preserved');
  const artifact = result._meta['apex/agent-output'].artifact;
  assert.deepEqual(readOriginalMcpArtifact({ root, artifact }), original);
  assert.ok(JSON.stringify(result).length < 600);
});

test('exact collection pages recover all omitted rows without advancing upstream cursors', t => {
  const root = fixture(t);
  const rows = Array.from({ length: 40 }, (_, id) => ({ id, value: `é${id}` }));
  const native = { structuredContent: { rows, total: 200, nextCursor: 'upstream40' }, content: [{ type: 'text', text: JSON.stringify({ rows }) }] };
  const artifact = saveOutputArtifact(native, { root, kind: 'mcp' });
  const first = readOutputCollection({ root, artifact, pointer: '/structuredContent/rows', limit: 3 });
  const recovered = [...first.items];
  let offset = first.nextOffset;
  while (offset !== null) { const page = readOutputCollection({ root, artifact, pointer: '/structuredContent/rows', offset, limit: 7 }); recovered.push(...page.items); offset = page.nextOffset; }
  assert.deepEqual(recovered, rows);
  assert.equal(first.totalItems, 40);
  assert.equal(first.omittedItems, 37);
  assert.equal(readOutputCollection({ root, artifact, pointer: '/content/0/text/rows', limit: 1 }).items[0].value, 'é0');
  assert.throws(() => readOutputCollection({ root, artifact, pointer: '/structuredContent/missing' }), /does not exist/);
  assert.throws(() => readOutputCollection({ root, artifact, pointer: '/structuredContent/~2' }), /pointer/);
  assert.throws(() => readOutputCollection({ root, artifact, pointer: '/structuredContent/rows', limit: 101 }), /limit/);
  const cliPage = cli(root, ['--read', artifact.path, '--pointer', '/structuredContent/rows', '--offset', '3', '--limit', '2']);
  assert.deepEqual(JSON.parse(cliPage.stdout).items, rows.slice(3, 5));
});

test('opt-in progress exposes running status before completion without stdout preambles', async t => {
  const root = fixture(t);
  const child = spawn(process.execPath, [CLI, '--progress', '--', process.execPath, '-e', 'setTimeout(()=>{console.log("finished");process.exitCode=7},1000)'], { cwd: root });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  const receipt = await new Promise(resolve => child.stderr.on('data', chunk => { stderr += chunk; if (stderr.includes('\n')) resolve(JSON.parse(stderr.split('\n')[0])); }));
  const done = new Promise(resolve => child.once('close', code => resolve(code)));
  assert.equal(stdout, '');
  assert.equal(receipt.status, 'running');
  const status = JSON.parse(cli(root, ['--status', receipt.artifact.path]).stdout);
  assert.equal(status.status, 'running');
  const unchanged = JSON.parse(cli(root, ['--status', receipt.artifact.path, '--since', status.cursor]).stdout);
  assert.equal(unchanged.unchanged, true);
  const observed = [], readErrors = [];
  const watcher = setInterval(() => {
    try { observed.push(JSON.parse(fs.readFileSync(path.join(root, receipt.artifact.path), 'utf8')).status); }
    catch (error) { readErrors.push(error.message); }
  }, 1);
  t.after(() => clearInterval(watcher));
  assert.equal(await done, 7);
  clearInterval(watcher);
  assert.ok(observed.length > 0);
  assert.deepEqual(readErrors, [], 'concurrent readers always see a complete status record');
  assert.equal(JSON.parse(stdout).exitCode, 7);
  const final = JSON.parse(cli(root, ['--status', receipt.artifact.path]).stdout);
  assert.equal(final.status, 'exited');
  assert.equal(final.exitCode, 7);
  assert.notEqual(final.cursor, status.cursor);
  assert.equal(final.streamBytes.stdout, 9);
});


test('diagnostic collections surface late failures and warnings while ordinary arrays keep their order', () => {
  const checks = [...Array.from({ length: 240 }, (_, i) => ({ status: 'passed', name: 'healthy' + i })), { status: 'warning', name: 'late warning', cause: 'stale receipt' }, { status: 'failed', name: 'late failure', cause: 'missing artifact', fix: 'rerun verification' }];
  const summary = summarizeOutput({ checks, refs: ['one', 'two', 'three', 'four'] });
  assert.equal(summary.checks[0].status, 'failed');
  assert.equal(summary.checks[0].cause, 'missing artifact');
  assert.equal(summary.checks[1].status, 'warning');
  assert.equal(summary.checks.at(-1).omittedItems, 239);
  assert.deepEqual(summary.checks.at(-1).statusCounts, { passed: 240, warning: 1, failed: 1 });
  assert.deepEqual(summary.refs.slice(0, 3), ['one', 'two', 'three']);
});
test('MCP summaries deduplicate identical transport text and structured data', () => {
  const data = { verdict: 'failed', cause: 'missing file', checks: [{ status: 'warning' }] };
  const summary = summarizeOutput({ content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data });
  assert.equal(summary.content[0].duplicateOf, 'structuredContent');
  assert.equal(summary.structuredContent.cause, 'missing file');
});
test('original MCP retrieval restores content and split UTF8 pages retain exact bytes', (t) => {
  const root = fixture(t);
  const original = { content: [{ type: 'image', mimeType: 'image/png', data: 'xyz' }, { type: 'text', text: 'é 🏎' }], isError: false, structuredContent: { count: 2 } };
  const artifact = saveOutputArtifact(original, { root, kind: 'mcp' });
  assert.deepEqual(readOriginalMcpArtifact({ root, artifact }), original);
  assert.throws(() => readOriginalMcpArtifact({ root, artifact, maxBytes: 1 }), /maxBytes/);
  assert.throws(() => readOriginalMcpArtifact({ root, artifact: '/etc/passwd' }));
  const utf = saveOutputArtifact('é🏎', { root, kind: 'stdout' });
  const page = readOutputArtifact({ root, artifact: utf, offset: 1, limit: 2 });
  assert.equal(page.encoding, 'base64');
  assert.deepEqual(Buffer.from(page.base64, 'base64'), Buffer.from('é🏎').subarray(1, 3));
});
function pidAlive(pid) {
  try { return !['Z', 'X'].includes(fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1][0]); }
  catch { try { process.kill(pid, 0); return true; } catch { return false; } }
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFile(file) {
  const until = Date.now() + 3000;
  while (!fs.existsSync(file) && Date.now() < until) await wait(20);
  assert.ok(fs.existsSync(file), 'child tree reported readiness');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function treeCode(file, { ignore = true, naturalExit = false } = {}) {
  const grandchild = `${ignore ? "process.on('SIGTERM',()=>{});process.on('SIGINT',()=>{});" : ''}setInterval(()=>{},1000)`;
  return `const fs=require('node:fs');const {spawn}=require('node:child_process');${ignore ? "process.on('SIGTERM',()=>{});process.on('SIGINT',()=>{});" : ''}const c=spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{detached:true,stdio:'ignore'});setTimeout(()=>{fs.writeFileSync(${JSON.stringify(file)},JSON.stringify([process.pid,c.pid]));${naturalExit ? 'process.exit(7)' : ''}},160);setInterval(()=>{},1000);`;
}
test('explicit timeout escalates ignored signals and removes detached descendants', async (t) => {
  const root = fixture(t), ready = path.join(root, 'pids.json');
  const run = spawnAgentProcess(process.execPath, ['-e', treeCode(ready)], { cwd: root, stdio: 'ignore', timeoutMs: 400, killGraceMs: 100 });
  const pids = await waitFile(ready);
  const outcome = await run.done;
  assert.equal(outcome.timedOut, true);
  assert.equal(outcome.signal, 'SIGKILL');
  assert.equal(outcome.exitCode, null);
  assert.deepEqual(pids.filter(pidAlive), []);
});
test('natural nonzero root exit cleans detached descendants and retains exit code', async (t) => {
  const root = fixture(t), ready = path.join(root, 'pids.json');
  const run = spawnAgentProcess(process.execPath, ['-e', treeCode(ready, { naturalExit: true })], { cwd: root, stdio: 'ignore', killGraceMs: 100, cleanupOnExit: true });
  const pids = await waitFile(ready);
  const outcome = await run.done;
  assert.equal(outcome.exitCode, 7);
  assert.equal(outcome.signal, null);
  assert.deepEqual(pids.filter(pidAlive), []);
});
test('CLI cancellation forwards original signal and finishes descendant cleanup first', async (t) => {
  const root = fixture(t), ready = path.join(root, 'pids.json');
  const child = spawn(process.execPath, [CLI, '--', process.execPath, '-e', treeCode(ready)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const finished = new Promise((resolve) => child.on('close', (exitCode, signal) => resolve({ exitCode, signal })));
  const pids = await waitFile(ready);
  child.kill('SIGINT');
  const outcome = await finished;
  assert.equal(outcome.signal, 'SIGINT', stderr);
  const summary = JSON.parse(stdout);
  assert.equal(summary.cancelSignal, 'SIGINT');
  assert.equal(summary.timedOut, false);
  assert.equal(summary.signal, 'SIGKILL');
  assert.deepEqual(pids.filter(pidAlive), []);
});

test('normal CLI exit preserves intentional detached background handoff', async (t) => {
  const root = fixture(t), ready = path.join(root, 'pids.json');
  const run = cli(root, ['--', process.execPath, '-e', treeCode(ready, { naturalExit: true })]);
  const pids = await waitFile(ready);
  t.after(() => { for (const pid of pids) if (pidAlive(pid)) { try { process.kill(pid, 'SIGKILL'); } catch { /* Owned test process exited. */ } } });
  assert.equal(run.status, 7);
  assert.equal(pidAlive(pids[1]), true);
  assert.equal(JSON.parse(run.stdout).exitCode, 7);
});
