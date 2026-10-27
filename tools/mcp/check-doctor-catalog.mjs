// @doc Check doctor catalog: canonical F1 environment and plugin support.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const gateway = fileURLToPath(new URL('./chat-gateway.mjs', import.meta.url));
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
if (process.argv.length !== 3) throw new Error('Usage: source tools/environment/activate.sh; node tools/mcp/check-doctor-catalog.mjs host-tools.json');
const names = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const client = new Client({name: 'doctor-catalog-validation', version: '1.0.0'});
const transport = new StdioClientTransport({command: process.execPath, args: [gateway], cwd: '/workspace/f1-game', env: {...process.env}, stderr: 'pipe'});
transport.stderr?.on('data', data => { if (process.env.APEX_CHAT_MCP_DIAGNOSTICS === '1') process.stderr.write(data); });
try {
  await client.connect(transport, {timeout: 30000});
  const {tools} = await client.listTools();
  assert.ok(tools.find(t => t.name === 'apex_tools__apex_doctor').inputSchema.properties.hostToolNames);
  const result = await client.callTool({name: 'apex_tools__apex_doctor', arguments: {hostToolNames: names, full: true}});
  const body = result.structuredContent;
  assert.equal(result.isError, false);
  const checks = body.out.checks.filter(c => ['runtime.dependencies', 'session.catalog'].includes(c.id));
  assert.ok(checks.every(c => c.status === 'pass'));
  console.log(JSON.stringify({ok: true, route: 'local MCP client', hostedCall: false, tools: tools.length, hostNamesSupplied: names.length, checkout: body.checkout, summary: body.out.summary, checks}, null, 2));
} finally {await client.close(); await transport.close();}
