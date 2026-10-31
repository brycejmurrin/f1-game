// Bounded, read-only Codex history contracts. No provider credentials or network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CODEX_TOOL, CODEX_CAPABILITIES, CODEX_CONTROL_TOOL, validateCodexControlArgs, createCodexControlHandler, validateCodexArgs, createCodexAgentsHandler, runCodexTransport } from '../../tools/mcp/apex-codex-agents.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ID = '11111111-2222-3333-4444-555555555555';
const ctx = (extra = {}) => ({ ROOT, toolResult: (x) => x, refuse: (error, message) => ({ ok: false, error, message }), ...extra });

test('Codex descriptor is closed and capabilities do not claim provider writes', () => {
  assert.equal(CODEX_TOOL.inputSchema.additionalProperties, false);
  assert.equal(CODEX_TOOL.inputSchema.properties.options.additionalProperties, false);
  assert.deepEqual(CODEX_CAPABILITIES.verbs, ['capabilities', 'list', 'status', 'transcript']);
  assert.ok(CODEX_CAPABILITIES.unsupported.includes('send'));
});

test('Codex rejects unknown verbs, credential arguments, misplaced options and malformed IDs', () => {
  for (const input of [null, [], { verb: null }, { options: null }, { verb: 'send' }, { verb: 'list', id: ID }, { verb: 'status' },
    { verb: 'status', id: '../auth.json' }, { verb: 'list', options: { limit: true } }, { verb: 'list', options: { limit: 21 } },
    { verb: 'list', options: { token: 'do-not-echo' } }, { verb: 'list', options: { archived: 'yes' } },
    { verb: 'status', id: ID, options: { cursor: 'next' } }, { verb: 'transcript', id: ID, options: { only: 'tools' } },
    { verb: 'transcript', id: ID, options: { maxBytes: 8193 } }, { verb: 'transcript', id: ID, options: { cursor: 'x'.repeat(8193) } }]) {
    assert.throws(() => validateCodexArgs(input));
  }
  const polluted = Object.create({ verb: 'list' });
  assert.throws(() => validateCodexArgs(polluted));
});

test('capabilities, dryRun and refusals never invoke the authentication child', async () => {
  const handler = createCodexAgentsHandler(ctx({ run: () => { throw new Error('must not execute'); } }));
  assert.equal((await handler({})).readOnly, true);
  assert.equal((await handler({ verb: 'list', dryRun: true })).dryRun, true);
  assert.equal((await handler({ verb: 'resume', id: ID })).error, 'bad_args');
  assert.equal((await handler({ verb: 'list', options: { token: 'do-not-echo' } })).message.includes('do-not-echo'), false);
});

test('normalized read request and abort signal reach the transport', async () => {
  const controller = new AbortController(); let observed;
  const handler = createCodexAgentsHandler(ctx({ run: async (request, options) => { observed = { request, options }; return { ok: true, verb: request.verb }; } }));
  const result = await handler({ verb: 'transcript', id: ID.toUpperCase(), options: { limit: 2, only: 'all' } }, { signal: controller.signal });
  assert.equal(result.ok, true);
  assert.deepEqual(observed.request, { verb: 'transcript', id: ID, options: { limit: 2, only: 'all' } });
  assert.equal(observed.options.signal, controller.signal);
});

function fakeSpawn(chunks, result = { exitCode: 0 }) {
  let stops = 0, args, input = '';
  const spawnProcess = (command, argv, options) => {
    args = { command, argv, options };
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.stdin = new Writable({ write(chunk, _encoding, callback) { input += chunk; callback(); } });
    const done = new Promise((resolve) => { setImmediate(() => { for (const chunk of chunks) child.stdout.write(chunk); child.stderr.write('private-cli-diagnostic'); resolve(result); }); });
    return { child, done, stop: async () => { stops++; } };
  };
  return { spawnProcess, state: () => ({ stops, args, input }) };
}

test('control validates exact targets, request IDs and UTF-8 bytes without permission overrides', () => {
  assert.equal(CODEX_CONTROL_TOOL.inputSchema.additionalProperties, false);
  for (const args of [null, { verb: 'start' }, { verb: 'start', id: ID, options: { requestId: ID } },
    { verb: 'message', options: { requestId: ID, text: 'hi' } }, { verb: 'message', id: ID, options: { requestId: ID } },
    { verb: 'start', options: { requestId: ID, text: '🏎'.repeat(2049) } },
    { verb: 'start', options: { requestId: ID, approvalPolicy: 'never' } },
    { verb: 'start', options: { requestId: ID, text: ' ' } }, { verb: 'resume', id: ID }]) assert.throws(() => validateCodexControlArgs(args));
  assert.equal(validateCodexControlArgs({ verb: 'start', options: { requestId: ID, text: '🏎'.repeat(2048) } }).verb, 'start');
});

test('control capabilities, refusals and dry runs never authenticate or dispatch writes', async () => {
  const handler = createCodexControlHandler(ctx({ run: () => { throw new Error('must not spawn'); } }));
  assert.equal((await handler({})).readOnly, false);
  assert.equal((await handler({ verb: 'start', options: { requestId: ID }, dryRun: true })).dryRun, true);
  assert.equal((await handler({ verb: 'delete', id: ID })).error, 'bad_args');
});

test('control transport is explicitly selected and ambiguous receipts do not claim completion', async () => {
  let observed;
  const handler = createCodexControlHandler(ctx({ run: async (request, options) => { observed = { request, options }; return { ok: false, error: 'timeout' }; } }));
  const result = await handler({ verb: 'message', id: ID, options: { requestId: ID, text: 'hello' } });
  assert.equal(observed.options.control, true);
  assert.equal(result.outcomeUnknown, true);
  assert.equal(result.requestId, ID);
  const fake = fakeSpawn([Buffer.from(JSON.stringify({ ok: true, verb: 'start' }))]);
  await runCodexTransport({ verb: 'start', options: { requestId: ID } }, { root: ROOT, env: {}, control: true, spawnProcess: fake.spawnProcess });
  assert.equal(fake.state().args.argv.at(-1), '--control');
});

test('transport preserves split UTF-8, uses stdin and owns bounded cleanup', async () => {
  const bytes = Buffer.from(JSON.stringify({ ok: true, verb: 'list', out: { name: '🏎' } }));
  const index = bytes.indexOf(Buffer.from('🏎')) + 1;
  const fake = fakeSpawn([bytes.subarray(0, index), bytes.subarray(index)]);
  const result = await runCodexTransport({ verb: 'list', options: {} }, { root: ROOT, env: {}, spawnProcess: fake.spawnProcess });
  assert.equal(result.out.name, '🏎');
  assert.deepEqual(JSON.parse(fake.state().input), { verb: 'list', options: {} });
  assert.equal(fake.state().args.options.cleanupOnExit, true);
  assert.equal(fake.state().args.options.timeoutMs, 60000);
  assert.equal(fake.state().args.argv.length, 1);
});

test('transport rejects output overflow, invalid receipts and cancellation without echoing diagnostics', async () => {
  const overflow = fakeSpawn([Buffer.alloc(65537, 120)]);
  assert.equal((await runCodexTransport({ verb: 'list' }, { root: ROOT, env: {}, spawnProcess: overflow.spawnProcess })).error, 'output_limit');
  assert.equal(overflow.state().stops, 1);
  for (const body of ['private-secret', JSON.stringify({ ok: true, verb: 'status' })]) {
    const fake = fakeSpawn([Buffer.from(body)]);
    const result = await runCodexTransport({ verb: 'list' }, { root: ROOT, env: {}, spawnProcess: fake.spawnProcess });
    assert.equal(result.error, 'invalid_response'); assert.ok(!JSON.stringify(result).includes('private-secret'));
  }
  const controller = new AbortController(); controller.abort();
  const result = await runCodexTransport({ verb: 'list' }, { root: ROOT, signal: controller.signal, spawnProcess: () => { throw new Error('must not spawn'); } });
  assert.equal(result.error, 'cancelled');
});

test('Python fixture covers UTF-8 continuity, stale cursors, filters and read-only RPCs without network', () => {
  const result = spawnSync('python3', [path.join(ROOT, 'tests/helpers/codex-cloud-fixture.py')], { cwd: ROOT, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true); assert.equal(report.tests, 18);
});

test('existing Apex server discovers and dispatches the read-only Codex tool', () => {
  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'codex-fixture', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'apex_codex_agents', arguments: { verb: 'list', dryRun: true } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'apex_codex_agents', arguments: { verb: 'send', id: ID } } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'apex_codex_control', arguments: { verb: 'start', options: { requestId: ID }, dryRun: true } } },
  ];
  const result = spawnSync(process.execPath, [path.join(ROOT, 'tools/mcp/apex-tools-mcp.mjs'), 'serve'], {
    cwd: ROOT, encoding: 'utf8', input: messages.map(x => JSON.stringify(x)).join('\n') + '\n',
    env: { ...process.env, APEX_MCP_MOCK: '1' }, timeout: 15000, maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  const replies = result.stdout.trim().split('\n').map(x => JSON.parse(x));
  const tool = replies.find(x => x.id === 2).result.tools.find(x => x.name === 'apex_codex_agents');
  assert.equal(tool.annotations.readOnlyHint, true); assert.equal(tool.annotations.destructiveHint, false); assert.equal(tool.annotations.openWorldHint, true);
  const control = replies.find(x => x.id === 2).result.tools.find(x => x.name === 'apex_codex_control');
  for (const [key, value] of Object.entries({ readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true })) assert.equal(control.annotations[key], value);
  assert.equal(replies.find(x => x.id === 5).result.structuredContent.dryRun, true);
  const dry = replies.find(x => x.id === 3).result;
  assert.equal(dry.structuredContent.dryRun, true); assert.equal(dry.structuredContent.readOnly, true);
  assert.equal(replies.find(x => x.id === 4).result.isError, true);
});
