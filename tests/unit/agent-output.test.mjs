// Shared agent output: bounded presentation is never a replacement for retained evidence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createProcFdPool } from '../../tools/lib/proc-stat-reader.mjs';
import { parseProcStat, spawnAgentProcess } from '../../tools/agent/process.mjs';
import { fileURLToPath } from 'node:url';
import { OUTPUT_LEVELS, ARTIFACT_TTL_MS, NATIVE_MAX, validateOutputLevel, saveOutputArtifact, summarizeOutput, presentMcpResult, readOutputArtifact, readOriginalMcpArtifact, readOutputCollection } from '../../tools/agent/output.mjs';
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

test('passing error-related test names and generic chatter cannot crowd out real failures or warnings', t => {
  const root = fixture(t);
  const lines = Array.from({ length: 1300 }, (_, i) => `INFO sample ${i} ${'.'.repeat(85)}`);
  lines[100] = '✔ NET: a failed prepare is rejected as expected';
  lines[200] = 'ok 201 - error response is handled';
  lines[300] = 'PASS exception path returns to title';
  lines[400] = 'INFO error catalog loaded';
  lines[410] = 'INFO failure policy configured';
  lines[420] = 'INFO exception handler registered';
  lines[650] = 'not ok 651 - REAL_CAUSE js/game.js:65 expected=0.12 actual=0.987654321';
  lines[900] = 'WARNING tyre temperature sensor stale at js/game.js:90';
  lines[950] = '✔ a warning is expected for invalid input';
  lines[1000] = '# fail 0';
  lines[1001] = 'warnings: 0';
  const log = lines.join('\n') + '\n= run failed\n';
  const source = path.join(root, 'log.txt'); fs.writeFileSync(source, log);
  for (const level of ['compact', 'diagnostic']) {
    const run = cli(root, ['--output-level', level, '--', process.execPath, '-e', 'process.stdout.write(require("node:fs").readFileSync(process.argv[1]));process.exitCode=7', source]);
    assert.equal(run.status, 7, run.stderr);
    const data = JSON.parse(run.stdout), failure = JSON.stringify(data.stdout.diagnostics), warning = JSON.stringify(data.stdout.warnings);
    assert.match(failure, /REAL_CAUSE.*0\.987654321/);
    assert.doesNotMatch(failure, /failed prepare|error response|exception path/);
    assert.match(warning, /tyre temperature sensor stale/);
    assert.doesNotMatch(warning, /warning is expected|warnings: 0/);
    assert.equal(fs.readFileSync(path.join(root, data.stdout.artifact.path), 'utf8'), log);
  }
});

test('tagged producer markers preserve real failures and zero-valued assertion expectations', t => {
  const root = fixture(t);
  for (const cause of ['[tooling-fast] FAIL REAL_TAGGED_CAUSE expected=1 actual=2', 'AssertionError: expected failures: 0, actual: 1; REAL_ZERO_EXPECTATION']) {
    const lines = Array.from({ length: 1200 }, (_, i) => `INFO nominal ${i} ${'.'.repeat(85)}`);
    for (const i of [100, 200, 300]) lines[i] = '[tooling-fast] PASS expected error handling case';
    lines[650] = cause;
    lines[900] = '[tooling-fast] WARNING stale sensor';
    lines[950] = '[tooling-fast] PASS warning is expected for invalid input';
    const source = path.join(root, 'tagged.log'); fs.writeFileSync(source, lines.join('\n'));
    for (const level of ['compact', 'diagnostic']) {
      const run = cli(root, ['--output-level', level, '--', process.execPath, '-e', 'process.stdout.write(require("node:fs").readFileSync(process.argv[1]));process.exitCode=7', source]);
      assert.equal(run.status, 7);
      const data = JSON.parse(run.stdout);
      assert.ok(JSON.stringify(data.stdout.diagnostics).includes(cause));
      assert.doesNotMatch(JSON.stringify(data.stdout.diagnostics), /PASS expected error handling/);
      assert.match(JSON.stringify(data.stdout.warnings), /WARNING stale sensor/);
      assert.doesNotMatch(JSON.stringify(data.stdout.warnings), /PASS warning is expected/);
    }
  }
});

test('spec failure markers are actionable even when their names contain no error keywords', t => {
  const root = fixture(t);
  const log = 'INFO nominal\n'.repeat(1200) + '✖ wrong pose at tools/agent-run.mjs:3\n';
  const source = path.join(root, 'spec.log'); fs.writeFileSync(source, log);
  const run = cli(root, ['--', process.execPath, '-e', 'process.stdout.write(require("node:fs").readFileSync(process.argv[1]));process.exitCode=1', source]);
  assert.equal(run.status, 1);
  assert.match(JSON.stringify(JSON.parse(run.stdout).stdout.diagnostics), /✖ wrong pose/);
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

test('a mid-size answer the summary cannot shrink stays native; one it can shrink is summarized', t => {
  const root = fixture(t);
  // apex_doctor-shaped, ~1.7 KB: the envelope as sent (text mirror + structuredContent) is no smaller.
  const flat = { ok: true, summary: { pass: 3, warn: 0, fail: 0 }, checks: ['node', 'chromium', 'lsp'].map(name => ({ name, status: 'pass', detail: name.padEnd(200, '.') })) };
  const small = { content: [{ type: 'text', text: JSON.stringify(flat) }], structuredContent: flat, isError: false };
  const kept = presentMcpResult(small, { root });
  assert.deepEqual(kept.structuredContent, flat);
  assert.equal(kept.isError, false);
  assert.ok(kept._meta['apex/agent-output'].artifact.bytes > 1024);
  // A bounded LSP body (~2 KB text): excerpting it would save little and force a re-read.
  const body = Array.from({ length: 30 }, (_, i) => `    ${10 + i}  const line${i} = compute(${i}); // ${'x'.repeat(30)}`).join('\n');
  const lsp = { content: [{ type: 'text', text: `1 definition\n${body}` }] };
  assert.equal(presentMcpResult(lsp, { root }).content[0].text, lsp.content[0].text);
  // Many long rows: the summary is far smaller, so the envelope still wins.
  const rows = Array.from({ length: 200 }, (_, id) => ({ id, detail: 'x'.repeat(200) }));
  const big = { content: [{ type: 'text', text: JSON.stringify({ rows }) }], structuredContent: { rows } };
  const summarized = presentMcpResult(big, { root });
  assert.equal(summarized.structuredContent.outputLevel, 'compact');
  assert.ok(JSON.stringify(summarized).length < JSON.stringify(big).length / 4);
});

test('fenced JSON after a prose lead-in (chrome-devtools evaluate_script) is summarized and paged structurally', t => {
  const root = fixture(t);
  const value = { apiVersion: 1, hooks: Array.from({ length: 160 }, (_, i) => ({ name: `hook${i}`, doc: 'd'.repeat(80) })), notes: ['stale under headless(true)'] };
  const original = { content: [{ type: 'text', text: 'Script ran on page and returned:\n```json\n' + JSON.stringify(value) + '\n```' }] };
  const result = presentMcpResult(original, { root });
  const block = result.structuredContent.summary.content[0];
  assert.equal(block.lead, 'Script ran on page and returned:');
  assert.equal(block.data.apiVersion, 1);
  assert.equal(block.data.hooks.at(-1).totalItems, 160);
  assert.equal(block.data.hooks.at(-1).sourcePointer, '/content/0/text/hooks');
  const page = readOutputCollection({ root, artifact: result.structuredContent.artifact, pointer: '/content/0/text/hooks', offset: 158, limit: 5 });
  assert.deepEqual(page.items.map(row => row.name), ['hook158', 'hook159']);
  // Prose that merely mentions a fence stays text, and a broken fence is never half-parsed.
  for (const text of ['see ```json\n{"a":1}\n``` then more', 'returned:\n```json\n{"a":\n```']) {
    assert.equal(summarizeOutput({ content: [{ type: 'text', text }] }).content[0].text, text);
  }
});

test('row text is cut on whole lines and keeps its paging footer; mid-size answers stay native', t => {
  const root = fixture(t);
  const rows = Array.from({ length: 300 }, (_, i) => `js/track/file${i}.js:${i + 1}:5 [use] (Mod › fn${i})`);
  const text = `${rows.length} references\n${rows.join('\n')}\n… 41 more (offset:300)`;
  const shown = summarizeOutput({ content: [{ type: 'text', text }] }).content[0].text.split('\n');
  assert.ok(shown.every(line => line === `${rows.length} references` || rows.includes(line) || /^\[omitted \d+ lines\]$/.test(line) || line === '… 41 more (offset:300)'));
  assert.equal(shown.at(-1), '… 41 more (offset:300)');
  // ~6 KB: summarizing would force a follow-up read that costs more than sending it whole.
  const mid = { content: [{ type: 'text', text: rows.slice(0, 120).join('\n') }] };
  assert.ok(JSON.stringify(mid).length > 4000 && JSON.stringify(mid).length <= NATIVE_MAX);
  assert.equal(presentMcpResult(mid, { root }).content[0].text, mid.content[0].text);
});

test('the first save in a process reaps artifacts older than the TTL and keeps fresh ones', t => {
  const root = fixture(t);
  const dir = path.join(root, 'artifacts/agent-output');
  fs.mkdirSync(dir, { recursive: true });
  const stale = path.join(dir, 'stale.json'), fresh = path.join(dir, 'fresh.json');
  fs.writeFileSync(stale, '{}'); fs.writeFileSync(fresh, '{}');
  const old = (Date.now() - ARTIFACT_TTL_MS - 60000) / 1000;
  fs.utimesSync(stale, old, old);
  saveOutputArtifact({ a: 1 }, { root });
  assert.equal(fs.existsSync(stale), false);
  assert.equal(fs.existsSync(fresh), true);
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

test('status-bearing collections prioritize late issues independently of their names', () => {
  const rows = Array.from({ length: 300 }, (_, index) => ({ id: index, status: index === 287 ? 'failed' : index === 295 ? 'warning' : 'passed', value: index === 287 ? 0.123456789 : index }));
  for (const key of ['rows', 'items', 'entries', 'producerSpecificName']) {
    for (const level of ['compact', 'diagnostic']) {
      const result = summarizeOutput({ [key]: rows }, { level })[key];
      assert.equal(result[0].id, 287); assert.equal(result[0].value, 0.123456789);
      assert.equal(result[1].id, 295);
      assert.equal(result.at(-1).sourcePointer, '/' + key);
      assert.deepEqual(result.at(-1).statusCounts, { passed: 298, failed: 1, warning: 1 });
    }
  }
  assert.equal(summarizeOutput({ rows: [{ level: 'info' }, { level: 'error' }] }).rows[0].level, 'error');
  const plain = summarizeOutput({ rows: Array.from({ length: 20 }, (_, value) => ({ value })) }).rows;
  assert.deepEqual(plain.slice(0, 3), [{ value: 0 }, { value: 1 }, { value: 2 }]);
});
test('successful rows with structured warnings retain warning priority and source status counts', () => {
  const rows = Array.from({ length: 160 }, (_, id) => ({ id, status: 'PASS', detail: 'healthy '.repeat(30) }));
  rows[130].warning = 'stale sensor receipt';
  rows[159] = { id: 159, status: 'FAIL', error: 'missing result' };
  const before = JSON.stringify(rows);
  for (const level of ['compact', 'diagnostic']) {
    const result = summarizeOutput({ rows }, { level }).rows;
    assert.equal(result[0].id, 159);
    assert.equal(result[1].id, 130);
    assert.equal(result[1].warning, 'stale sensor receipt');
    assert.equal(result.at(-1).warningFieldCount, 1);
    assert.deepEqual(result.at(-1).statusCounts, { PASS: 159, FAIL: 1 });
  }
  assert.equal(JSON.stringify(rows), before);
  assert.deepEqual(summarizeOutput({ rows }, { level: 'full' }).rows, rows);
});

test('warning-only rows are actionable while empty warning fields and passing names are not', () => {
  for (const empty of [0, false, '', '0 warnings', [], {}]) {
    const rows = Array.from({ length: 30 }, (_, id) => ({ id, name: 'a warning is expected', warnings: empty }));
    rows[28] = { id: 28, warnings: ['camera preference was restored'] };
    const result = summarizeOutput({ rows }).rows;
    assert.equal(result[0].id, 28);
    assert.equal(result.at(-1).warningFieldCount, 1);
  }
});

test('status-less rows that list problems (car_audit dead parts) outrank clean rows; empty lists do not', () => {
  // Measured 2026-10-19: apex_car_audit ladder at compact showed engine/aero/suspension and omitted
  // tyres, the one category with dead parts, because no row carried a status field.
  const rows = ['engine', 'aero', 'suspension', 'brakes', 'tyres', 'ers'].map(cat => ({ cat, live: 10, dead: [], traps: [] }));
  rows[4].dead = [{ id: 'intermediate' }, { id: 'wet' }];
  for (const level of ['compact', 'diagnostic']) {
    const result = summarizeOutput({ out: rows }, { level }).out;
    assert.equal(result[0].cat, 'tyres', level);
    assert.equal(result.at(-1).issueFieldCount, 1);
    assert.equal(result.at(-1).warningFieldCount, undefined);
  }
  const clean = summarizeOutput({ out: rows.map(r => ({ ...r, dead: [] })) }).out;
  assert.equal(clean[0].cat, 'engine');
  for (const empty of ['none', '0 failures', [], {}, 0]) {
    const out = summarizeOutput({ out: Array.from({ length: 6 }, (_, id) => ({ id, failures: empty })) }).out;
    assert.equal(out[0].id, 0, JSON.stringify(empty));
  }
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
// #4022: writeFileSync creates the file EMPTY and then writes it, so "exists" is not "ready" — a poll that
// landed in between parsed '' ("Unexpected end of JSON input", Pages 4261). Ready means it parses.
async function waitFile(file) {
  const until = Date.now() + 3000;
  let last;
  while (Date.now() < until) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { last = error; }
    await wait(20);
  }
  assert.fail(`child tree never reported readiness: ${last && last.message}`);
}
function treeCode(file, { ignore = true, naturalExit = false } = {}) {
  const grandchild = `${ignore ? "process.on('SIGTERM',()=>{});process.on('SIGINT',()=>{});" : ''}setInterval(()=>{},1000)`;
  return `const fs=require('node:fs');const {spawn}=require('node:child_process');${ignore ? "process.on('SIGTERM',()=>{});process.on('SIGINT',()=>{});" : ''}const c=spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{detached:true,stdio:'ignore'});setTimeout(()=>{fs.writeFileSync(${JSON.stringify(file + '.tmp')},JSON.stringify([process.pid,c.pid]));fs.renameSync(${JSON.stringify(file + '.tmp')},${JSON.stringify(file)});${naturalExit ? 'process.exit(7)' : ''}},160);setInterval(()=>{},1000);`;
}
test('Linux proc stat parser preserves process identity with spaces and parentheses in comm', () => {
  const fields = ['S', '123', '456', ...Array(16).fill('ignored'), '18446744073709551615', ...Array(32).fill('tail')];
  for (const comm of ['node', 'worker name', '(nested) work)', 'line\nbreak']) {
    assert.deepEqual(parseProcStat(`789 (${comm}) ${fields.join(' ')}\n`), {
      state: 'S', parent: 123, group: 456, start: '18446744073709551615'
    });
  }
  assert.deepEqual(parseProcStat(`789 (zombie) ${['Z', '1', '789', ...Array(16).fill('0'), '999'].join(' ')}`), {
    state: 'Z', parent: 1, group: 789, start: '999'
  });
});
test('Linux proc stat parser preserves missing fields and literal space delimiters', () => {
  assert.deepEqual(parseProcStat('1 (short) S 2 3'), { state: 'S', parent: 2, group: 3, start: undefined });
  assert.deepEqual(parseProcStat('1 (empty parent) R  3'), { state: 'R', parent: 0, group: 3, start: undefined });
  assert.deepEqual(parseProcStat(''), { state: '', parent: NaN, group: NaN, start: undefined });
  for (const bad of [null, undefined, 42]) assert.throws(() => parseProcStat(bad), TypeError);
});
test('readiness waits for a parseable file, not for the file to exist (#4022)', async (t) => {
  const root = fixture(t), ready = path.join(root, 'pids.json');
  fs.writeFileSync(ready, '');   // the instant writeFileSync has created the file but not yet written it
  const late = wait(60).then(() => fs.writeFileSync(ready, JSON.stringify([1, 2])));
  assert.deepEqual(await waitFile(ready), [1, 2]);
  await late;
});
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
  // A failure before child.kill() below left the CLI and its signal-ignoring tree running, and the CLI's
  // stdout pipe kept this file alive to the 540 s timeout (#4022). Reap them whatever happens first.
  let pids = [];
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    for (const pid of pids) if (pidAlive(pid)) { try { process.kill(pid, 'SIGKILL'); } catch { /* Owned test process exited. */ } }
  });
  pids = await waitFile(ready);
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

// Fresh descriptor reads retain process identity; cached descriptors have bounded ownership.
function procFdFixture(options = {}) {
  const paths = new Map(), handles = new Map(), closed = [], calls = [];
  let next = 10;
  const config = {soft: 1024, baseOpen: 10, partial: Infinity, missingLimits:false, ...options};
  const proc = (pid, text = `${pid} (node) S 1 1 0\n`) => {const task={alive:true,text};paths.set(pid,task);return task};
  const error = code => Object.assign(new Error(code),{code});
  const io = {
    readFileSync(path) {
      calls.push(['readFile',path]);
      if(path.endsWith('/limits')){if(config.missingLimits)throw error('ENOENT');return `Max open files            ${config.soft}                 ${config.soft}                 files\n`;}
      const task=paths.get(Number(path.split('/').at(-2)));if(!task?.alive)throw error('ENOENT');return task.text;
    },
    readdirSync:()=>Array(config.baseOpen+handles.size).fill('fd'),
    openSync(path){calls.push(['open',path]);if(config.openError){const code=config.openError;config.openError=null;throw error(code);}const task=paths.get(Number(path.split('/').at(-2)));if(!task?.alive)throw error('ENOENT');const fd=next++;handles.set(fd,task);return fd},
    closeSync(fd){assert.ok(handles.has(fd),'descriptor closed exactly once');closed.push(fd);handles.delete(fd)},
    readSync(fd,buffer,offset,length,position){
      calls.push(['read',fd,position]);const task=handles.get(fd);if(!task?.alive)throw error('ESRCH');
      if(task.readError){const code=task.readError;task.readError=null;throw error(code)}
      if(task.empty){task.empty=false;return 0}
      const bytes=Buffer.from(task.text),count=Math.min(length,config.partial,Math.max(0,bytes.length-position));bytes.copy(buffer,offset,position,position+count);return count;
    }
  };
  return {pool:createProcFdPool(io,{maximum:options.maximum??2048,initialBytes:options.initialBytes??8192}),proc,paths,handles,closed,calls,config};
}
test('cached FD reads fresh parent metadata at offset zero on every sample',()=>{
  const f=procFdFixture(),task=f.proc(1);const release=f.pool.acquire();assert.equal(f.pool.read(1),task.text);
  task.text='1 (node) S 99 1 0\n';assert.equal(f.pool.read(1),task.text);
  assert.equal(f.calls.filter(c=>c[0]==='open').length,1);assert.equal(f.calls.filter(c=>c[0]==='read'&&c[2]===0).length,2);
  release();assert.equal(f.handles.size,0);
});
test('old FD rejects reused PID and reader reopens the replacement path',()=>{
  const f=procFdFixture(),old=f.proc(1,'old process\n'),release=f.pool.acquire();assert.equal(f.pool.read(1),old.text);
  old.alive=false;const replacement=f.proc(1,'replacement start time\n');assert.equal(f.pool.read(1),replacement.text);
  assert.equal(f.closed.length,1);assert.equal(f.handles.size,1);release();assert.equal(f.handles.size,0);
});
test('empty cached descriptor is invalidated and reopened',()=>{
  const f=procFdFixture(),task=f.proc(1),release=f.pool.acquire();f.pool.read(1);task.empty=true;assert.equal(f.pool.read(1),task.text);
  assert.equal(f.closed.length,1);release();
});
test('partial reads, buffer growth and split UTF-8 preserve exact text',()=>{
  const f=procFdFixture({partial:1,initialBytes:4}),task=f.proc(1,'1 (é🏎) S 1 1 0\n'),release=f.pool.acquire();
  assert.equal(f.pool.read(1),task.text);assert.equal(f.pool.read(1),task.text);release();assert.equal(f.handles.size,0);
});
test('read errors invalidate descriptor and reopen without stale bytes',()=>{
  const f=procFdFixture(),task=f.proc(1),release=f.pool.acquire();f.pool.read(1);task.readError='EIO';assert.equal(f.pool.read(1),task.text);
  assert.equal(f.closed.length,1);release();
});
test('one process-global LRU cap is shared by multiple process owners',()=>{
  const f=procFdFixture({maximum:2});for(const pid of [1,2,3])f.proc(pid);
  const a=f.pool.acquire(),b=f.pool.acquire();f.pool.read(1);f.pool.read(2);f.pool.read(1);f.pool.read(3);
  assert.equal(f.handles.size,2);assert.equal(f.pool.stats().limit,2);assert.equal(f.closed[0],11);
  a();a();assert.equal(f.handles.size,2);b();assert.equal(f.handles.size,0);assert.equal(f.pool.stats().users,0);
});
test('absent PID eviction closes descriptor',()=>{
  const f=procFdFixture(),release=f.pool.acquire();f.proc(1);f.proc(2);f.pool.read(1);f.pool.read(2);f.pool.sweep([2]);
  assert.equal(f.handles.size,1);assert.equal(f.closed.length,1);release();assert.equal(f.handles.size,0);
});
for(const openError of ['EMFILE','ENFILE'])test(`${openError} releases retained FDs before uncached retry`,()=>{
  const f=procFdFixture(),release=f.pool.acquire();f.proc(1);const second=f.proc(2);f.pool.read(1);f.config.openError=openError;
  assert.equal(f.pool.read(2),second.text);assert.equal(f.handles.size,0);assert.equal(f.pool.stats().limit,0);
  f.pool.read(2);assert.equal(f.handles.size,0);release();
});
test('limit budget reserves descriptor headroom and respects soft RLIMIT fraction',()=>{
  for(const [soft,baseOpen,expected]of[[1024,10,64],[1024,950,10],[32,10,0]]){
    const f=procFdFixture({soft,baseOpen}),release=f.pool.acquire();assert.equal(f.pool.stats().limit,expected);release();
  }
});
test('missing limits preserves uncached reads and owns no descriptors',()=>{
  const f=procFdFixture({missingLimits:true}),task=f.proc(1),release=f.pool.acquire();assert.equal(f.pool.read(1),task.text);
  assert.equal(f.pool.stats().limit,0);assert.equal(f.handles.size,0);release();
});
test('natural last-owner release closes pool, next owner recomputes budget',()=>{
  const f=procFdFixture(),release=f.pool.acquire();f.proc(1);f.pool.read(1);release();assert.equal(f.handles.size,0);
  f.config.soft=256;const again=f.pool.acquire();assert.equal(f.pool.stats().limit,16);again();
});
test('oversized scans keep a working set and use original reader for excess PIDs',()=>{
  const f=procFdFixture({maximum:2}),release=f.pool.acquire();for(const pid of [1,2,3])f.proc(pid);
  for(let i=0;i<3;i++){f.pool.sweep([1,2,3]);for(const pid of [1,2,3])f.pool.read(pid);}
  assert.equal(f.calls.filter(c=>c[0]==='open').length,2);assert.equal(f.calls.filter(c=>c[0]==='readFile'&&c[1].endsWith('/3/stat')).length,3);
  release();assert.equal(f.handles.size,0);
});

const countProcFd=()=>fs.readdirSync('/proc/self/fd').length;
// Python's join() returns before the kernel finishes reaping the thread; wait for the task dir to vanish (loaded runners lag).
const taskGone=async(pid,tid)=>{const end=Date.now()+10000;while(fs.existsSync(`/proc/${pid}/task/${tid}`)){if(Date.now()>end)assert.fail(`task ${tid} still listed`);await new Promise(r=>setTimeout(r,10))}};
test('actual proc FD after target exit returns ESRCH and never silently returns old metadata',{skip:process.platform !== 'linux'},async()=>{
  const child=spawn(process.execPath,['-e','setTimeout(()=>{},150)'],{stdio:'ignore'});
  const done=new Promise(resolve=>child.once('exit',resolve)),fd=fs.openSync(`/proc/${child.pid}/stat`,'r'),bytes=Buffer.alloc(8192);
  try{assert.ok(fs.readSync(fd,bytes,0,bytes.length,0)>0);await done;
    assert.throws(()=>fs.readSync(fd,bytes,0,bytes.length,0),{code:'ESRCH'});
  }finally{fs.closeSync(fd)}
});
test('actual retained proc FD observes subreaper adoption and surviving TGID after creator thread exit',{skip:process.platform !== 'linux'},async()=>{
  const code=String.raw`
import ctypes,os,sys,threading,warnings
warnings.filterwarnings('ignore',category=DeprecationWarning)
assert ctypes.CDLL(None).prctl(36,1,0,0,0)==0
r,w=os.pipe();rp,wp=os.pipe();rg,wg=os.pipe();p=os.fork()
if p==0:
 os.close(r);os.close(wp);os.close(wg);c=os.fork()
 if c==0:os.close(w);os.close(rp);os.setsid();os.read(rg,1);os.close(rg);os._exit(0)
 os.close(rg);os.write(w,str(c).encode());os.close(w);os.read(rp,1);os.close(rp);os._exit(0)
os.close(w);os.close(rp);os.close(rg);c=int(os.read(r,50));os.close(r)
print('before',p,c,flush=True);sys.stdin.readline();os.write(wp,b'x');os.close(wp);os.waitpid(p,0)
print('after',p,c,flush=True);sys.stdin.readline();os.write(wg,b'x');os.close(wg);os.waitpid(c,0)
rt,wt=os.pipe();gate=threading.Event()
def worker():
 c=os.fork()
 if c==0:os.close(wt);os.read(rt,1);os.close(rt);os._exit(0)
 os.close(rt);print('thread-before',threading.get_native_id(),c,flush=True);gate.wait()
t=threading.Thread(target=worker);t.start();sys.stdin.readline();gate.set();t.join()
print('thread-after',flush=True);sys.stdin.readline();os.write(wt,b'x');os.close(wt);os.waitpid(-1,0)
`;
  const opens=[],io={...fs,openSync(path,...a){opens.push(path);return fs.openSync(path,...a)}};
  const beforeCount=countProcFd(),pool=createProcFdPool(io),release=pool.acquire();
  const child=spawn('python3',['-c',code],{stdio:['pipe','pipe','inherit']});
  const done=new Promise(resolve=>child.once('close',resolve));let pid,before,tid,threadPid,threadBefore;
  try{
    for await(const line of createInterface({input:child.stdout})){
      const[phase,a,b]=line.split(' ');
      if(phase==='before'){pid=Number(b);before=parseProcStat(pool.read(pid));assert.equal(before.parent,Number(a));child.stdin.write('\n');}
      if(phase==='after'){const after=parseProcStat(pool.read(pid));assert.equal(after.start,before.start);assert.equal(after.parent,child.pid);assert.notEqual(after.parent,before.parent);assert.equal(opens.filter(p=>p===`/proc/${pid}/stat`).length,1);child.stdin.write('\n');}
      if(phase==='thread-before'){tid=Number(a);threadPid=Number(b);threadBefore=parseProcStat(pool.read(threadPid));child.stdin.write('\n');}
      if(phase==='thread-after'){const after=parseProcStat(pool.read(threadPid));assert.equal(after.parent,threadBefore.parent);assert.equal(after.parent,child.pid);await taskGone(child.pid,tid);assert.equal(opens.filter(p=>p===`/proc/${threadPid}/stat`).length,1);child.stdin.write('\n');}
    }
    assert.equal(await done,0);
  }finally{child.stdin.end();release()}
  assert.equal(countProcFd(),beforeCount);
});
test('actual pool FDs are not inherited by a spawned child and last-owner release balances descriptors',{skip:process.platform !== 'linux'},async()=>{
  const before=countProcFd(),pool=createProcFdPool(),a=pool.acquire(),b=pool.acquire();pool.read(process.pid);
  assert.equal(countProcFd(),before+1);
  const child=spawn(process.execPath,['-e',`const fs=require('node:fs');let n=0;for(const fd of fs.readdirSync('/proc/self/fd'))try{if(/^\\/proc\\/\\d+\\/stat$/.test(fs.readlinkSync('/proc/self/fd/'+fd)))n++}catch{};console.log(n)`],{stdio:['ignore','pipe','inherit']});
  let output='';child.stdout.on('data',data=>output+=data);const done=new Promise(resolve=>child.once('close',resolve));
  assert.equal(await done,0);assert.equal(Number(output.trim()),0);a();assert.equal(countProcFd(),before+1);b();assert.equal(countProcFd(),before);
});
test('actual lifecycle natural completion releases every retained descriptor',{skip:process.platform !== 'linux'},async()=>{
  const before=countProcFd(),run=spawnAgentProcess(process.execPath,['-e','setTimeout(()=>{},150)'],{stdio:'ignore',cleanupOnExit:true});
  const result=await run.done;assert.equal(result.exitCode,0);assert.equal(result.cleanupError,undefined);assert.equal(countProcFd(),before);
});
