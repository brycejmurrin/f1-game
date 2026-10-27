import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const names = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const client = new Client({name: 'doctor-catalog-validation', version: '1.0.0'});
const transport = new StdioClientTransport({command: process.execPath, args: ['/workspace/f1-toolchain/runtime/chat-gateway.mjs'], cwd: '/workspace/f1-game', env: {...process.env}, stderr: 'pipe'});
transport.stderr?.on('data', () => {});
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
