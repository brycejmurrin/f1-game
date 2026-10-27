import test from 'node:test';
import assert from 'node:assert/strict';
import {createGateway} from './chat-gateway.mjs';
import {doctorWithCatalog} from './doctor-catalog.mjs';

test('caller catalog reaches doctor and the checkout SDK resolves', async () => {
  const body = await doctorWithCatalog('/workspace/f1-game', {hostToolNames: ['apex_tools__apex_status'], full: true});
  assert.equal(body.out.checks.find(c => c.id === 'session.catalog').status, 'pass');
  assert.equal(body.out.checks.find(c => c.id === 'runtime.dependencies').status, 'pass');
});
test('catalog input cannot select files, commands, or roots', async () => {
  for (const args of [{hostToolNames: '../secret'}, {hostToolNames: ['../secret']},
    {hostToolNames: Array(2001).fill('tool')}, {hostToolNames: [], root: '/tmp'},
    {hostToolNames: [], command: 'install'}, {hostToolNames: [], full: 'true'}]) {
    await assert.rejects(doctorWithCatalog('/workspace/f1-game', args));
  }
});
test('gateway advertises host input, preserves ordinary doctor, and dispatches supplied input', async () => {
  let calls = 0;
  const gateway = await createGateway({connect: async () => ({
    listTools: async () => ({tools: [{name: 'apex_doctor', inputSchema: {type: 'object', properties: {full: {type: 'boolean'}}}}]}),
    callTool: async () => {calls++; return {content: [{type: 'text', text: 'upstream'}]};}, close: async () => {}
  })});
  try {
    assert.equal((await gateway.catalog()).get('apex_tools__apex_doctor').tool.inputSchema.properties.hostToolNames.maxItems, 2000);
    await gateway.call({name: 'apex_tools__apex_doctor', arguments: {}});
    const response = await gateway.call({name: 'apex_tools__apex_doctor', arguments: {hostToolNames: ['apex_tools__apex_status']}});
    assert.equal(calls, 1);
    assert.equal(response.structuredContent.out.checks.find(c => c.id === 'session.catalog').status, 'pass');
  } finally {await gateway.close();}
});
