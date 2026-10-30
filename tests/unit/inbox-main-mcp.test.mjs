import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { handleInbox } from '../../tools/mcp/apex-tools-mcp.mjs';
import { createHandler, TOOLS } from '../../tools/mcp/inbox-mcp.mjs';
import { InboxStore } from '../../tools/agent/inbox-store.mjs';

const entry = new URL('../../tools/mcp/apex-tools-mcp.mjs', import.meta.url).pathname;
function rpc(calls) {
  const child = spawnSync(process.execPath, [entry, 'serve'], { encoding: 'utf8', timeout: 15000,
    input: calls.map((params, id) => JSON.stringify({ jsonrpc: '2.0', id, method: params.method ?? 'tools/call', params: params.params ?? params })).join('\n') + '\n' });
  assert.equal(child.status, 0, child.stderr);
  return child.stdout.trim().split('\n').map(JSON.parse);
}
test('configured apex-tools server discovers all inbox tools with closed schemas and accurate annotations', () => {
  const [listed, help] = rpc([{ method: 'tools/list', params: {} }, { name: 'apex_help', arguments: { tool: 'apex_inbox_get' } }]);
  const tools = listed.result.tools.filter(t => t.name.startsWith('apex_inbox_'));
  assert.deepEqual(tools.map(t => t.name), TOOLS.map(t => t.name));
  for (const tool of tools) {
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.annotations.readOnlyHint, tool.name !== 'apex_inbox_sync');
    assert.equal(tool.annotations.idempotentHint, tool.name !== 'apex_inbox_sync');
    assert.equal(tool.annotations.openWorldHint, tool.name === 'apex_inbox_sync');
    assert.equal(tool.annotations.destructiveHint, false);
  }
  const full = help.result.structuredContent;
  assert.equal(full.inputSchema.properties.maxBytes.maximum, 16384);
  assert.equal(full.inputSchema.properties.dryRun.type, 'boolean');
  assert.equal(full.inputSchema.properties.path, undefined);
});
test('existing server dry-run never opens cache or fetches; invalid inbox arguments are refused', async () => {
  let called = false;
  const dry = await handleInbox('apex_inbox_sync', { issue: 4387, dryRun: true }, { handle() { called = true; throw Error('unexpected side effect'); } });
  assert.equal(dry.structuredContent.dryRun, true);
  assert.equal(called, false);
  const rows = rpc([{ name: 'apex_inbox_sync', arguments: { issue: 4387, dryRun: true } },
    { name: 'apex_inbox_get', arguments: { issue: 4387, id: 1, path: '/tmp/cache' } },
    { name: 'apex_inbox_list', arguments: { issue: 4387, limit: 101 } }]);
  assert.equal(rows[0].result.structuredContent.dryRun, true);
  assert.equal(rows[1].result.isError, true);
  assert.equal(rows[2].result.isError, true);
});
test('main adapter preserves core status/get payload, pagination and error semantics using a local SQLite fixture', async () => {
  const openStore = () => {
    const store = new InboxStore(':memory:');
    store.replaceThread(4387, 'issue', [{ id: 12, body: 'cached fixture ' + 'é'.repeat(4000), actor: 'fixture', envelope: null, parseError: null,
      updatedAt: '2026-10-30T12:00:00Z', url: 'https://github.com/brycejmurrin/f1-game/issues/4387#issuecomment-12' }], '2026-10-30T12:00:00Z', 0);
    return store;
  };
  const handle = createHandler({ openStore });
  for (const [name, args] of [['apex_inbox_status', { issue: 4387 }], ['apex_inbox_get', { issue: 4387, id: 12, maxBytes: 2048 }],
    ['apex_inbox_get', { issue: 4387, id: 999 }]]) {
    const expected = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })).result;
    const actual = await handleInbox(name, args, { handle });
    assert.equal(actual.isError, expected.isError);
    assert.deepEqual(actual.structuredContent, JSON.parse(expected.content[0].text));
    assert.deepEqual(actual.content, expected.content);
  }
  const status = await handleInbox('apex_inbox_status', { issue: 4387 }, { handle });
  assert.equal(status.structuredContent.generation, 1);
  const got = await handleInbox('apex_inbox_get', { issue: 4387, id: 12, maxBytes: 2048 }, { handle });
  assert.match(JSON.stringify(got.structuredContent), /cached fixture/);
  assert.ok(Buffer.byteLength(got.content[0].text) <= 2048);
  assert.ok(got.structuredContent.nextBodyCursor > 0);
  const next = await handleInbox('apex_inbox_get', { issue: 4387, id: 12, maxBytes: 2048,
    afterCodePoint: got.structuredContent.nextBodyCursor, bodyVersion: got.structuredContent.bodyVersion }, { handle });
  assert.equal(next.isError, false);
  assert.ok(next.structuredContent.content.startsWith('é'));
});

test('existing server listing and inbox dryRun stay available without SQLite support', () => {
  for (const args of [['list-tools'], ['call', 'apex_inbox_sync', JSON.stringify({ issue: 4387, dryRun: true })]]) {
    const hook = 'export async function resolve(name, context, next) { if (name === "node:sqlite") throw Error("SQLite unavailable in test"); return next(name, context); }';
    const hookURL = 'data:text/javascript,' + encodeURIComponent(hook);
    const source = `import { register } from 'node:module';
      register(${JSON.stringify(hookURL)}, import.meta.url);
      process.argv = [process.execPath, ${JSON.stringify(entry)}, ...${JSON.stringify(args)}];
      await import(${JSON.stringify(new URL('../../tools/mcp/apex-tools-mcp.mjs', import.meta.url).href)});`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8', timeout: 15000 });
    assert.equal(child.status, 0, child.stderr);
    const body = JSON.parse(child.stdout);
    if (args[0] === 'list-tools') assert.equal(body.filter(t => t.name.startsWith('apex_inbox_')).length, 4);
    else assert.equal(body.dryRun, true);
  }
});
