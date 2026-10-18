import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const gateway = fileURLToPath(new URL('../../tools/mcp/output-level-mcp.mjs', import.meta.url));
const fixture = String.raw`
const {createInterface}=require('node:readline');
let calls=0;
const tools=[
 {name:'echo',description:'Echo',inputSchema:{type:'object',properties:{value:{type:'string'}},additionalProperties:false},outputSchema:{type:'object',required:['value'],properties:{value:{type:'string'}}}},
 {name:'plain',inputSchema:{type:'object',properties:{}}},
 {name:'collision',inputSchema:{type:'object',properties:{outputLevel:{type:'string'},_outputLevel:{type:'string'}},additionalProperties:false}},
 {name:'failure',inputSchema:{type:'object',properties:{}}}
];
function send(m){process.stdout.write(JSON.stringify(m)+'\n')}
createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);
 if(m.method==='initialize') return send({jsonrpc:'2.0',id:m.id,result:{protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:true},resources:{subscribe:true}},serverInfo:{name:'fixture',version:'1'},_meta:{pid:process.pid}}});
 if(m.method==='tools/list') return send({jsonrpc:'2.0',id:m.id,result:m.params?.cursor?{tools:tools.slice(2)}:{tools:tools.slice(0,2),nextCursor:'second'}});
 if(m.method==='notifications/initialized') {send({jsonrpc:'2.0',method:'notifications/progress',params:{progressToken:0,progress:1}});return send({jsonrpc:'2.0',id:null,method:'sampling/createMessage',params:{messages:[]}})}
 if(m.method==='notifications/cancelled') return send({jsonrpc:'2.0',method:'cancel-observed',params:m.params});
 if(!m.method) return send({jsonrpc:'2.0',method:'response-observed',params:m});
 if(m.method==='die') process.exit(7);
 if(m.method!=='tools/call') return;
 calls++;
 if(m.params.name==='failure' && m.params.arguments?.rpc) return send({jsonrpc:'2.0',id:m.id,error:{code:-32000,message:'uncertain upstream error',data:{maybe:true}}});
 const a=m.params.arguments||{}, result={content:[{type:'text',text:'uncertain evidence '+ 'x'.repeat(22000)}],structuredContent:{value:'fixture',args:a,calls},...(m.params.name==='failure'?{isError:true}:{})};
 setTimeout(()=>send({jsonrpc:'2.0',id:m.id,result}),a.delay||0);
});
process.stderr.write('PRIVATE RAW OUTPUT SHOULD NEVER BE LOGGED');
`;
function harness(t, code = fixture) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'output-gateway-'));
  const child = spawn(process.execPath, [gateway, '--server', 'fixture', '--', process.execPath, '-e', code], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  const messages = [], waiters = []; let stderr = '';
  child.stderr.on('data', b => { stderr += b; });
  const closed = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  createInterface({ input: child.stdout }).on('line', line => {
    const m = JSON.parse(line); messages.push(m);
    for (const w of [...waiters]) if (w.predicate(m)) { waiters.splice(waiters.indexOf(w), 1); clearTimeout(w.timer); w.resolve(m); }
  });
  const wait = predicate => {
    const found = messages.find(predicate); if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => { const w = { predicate, resolve, timer: setTimeout(() => reject(new Error('Missing response; stderr: ' + stderr)), 4000) }; waiters.push(w); });
  };
  const send = m => child.stdin.write(JSON.stringify(m) + '\n');
  const request = async (id, method, params) => { send({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }); return wait(m => !m.method && Object.hasOwn(m, 'id') && m.id === id); };
  const call = (id, name, args) => request(id, 'tools/call', { name, arguments: args });
  t.after(async () => { child.stdin.end(); await closed; fs.rmSync(root, { recursive: true, force: true }); });
  return { root, child, closed, messages, wait, send, request, call, stderr: () => stderr };
}

test('help starts no executable and documents presentation levels', () => {
  const r = spawnSync(process.execPath, [gateway, '--help', '--server', 'fake', '--', '/nonexistent'], { encoding: 'utf8' });
  assert.equal(r.status, 0); assert.match(r.stdout, /compact.*diagnostic.*full/); assert.equal(r.stderr, '');
});

test('paginated schemas retain upstream constraints and full output schema; collision is explicit', async t => {
  const h = harness(t);
  const first = (await h.request(0, 'tools/list')).result;
  assert.equal(first.nextCursor, 'second'); assert.equal(first.tools.length, 2);
  for (const tool of first.tools) assert.deepEqual(tool.inputSchema.properties.outputLevel.enum, ['compact', 'diagnostic', 'full']);
  assert.equal(first.tools[0].inputSchema.additionalProperties, false);
  assert.equal(first.tools[0].outputSchema.anyOf[0].required[0], 'value');
  assert.equal(first.tools[0].outputSchema.anyOf[1].required[0], 'outputLevel');
  assert.equal(Object.hasOwn(first.tools[1], 'outputSchema'), false);
  const second = (await h.request('second', 'tools/list', { cursor: first.nextCursor })).result;
  const collision = second.tools.find(x => x.name === 'collision');
  assert.deepEqual(collision.inputSchema.properties.outputLevel, { type: 'string' });
  assert.equal(collision.inputSchema.properties.__outputLevel.default, 'compact');
  assert.match(collision.description, /collision/);
  assert.equal(second.tools.at(-1).name, 'output_read');
  const result = await h.call('c', 'collision', { outputLevel: 'upstream-value', _outputLevel: 'also-upstream', __outputLevel: 'full', unknown: 3 });
  assert.deepEqual(result.result.structuredContent.args, { outputLevel: 'upstream-value', _outputLevel: 'also-upstream', unknown: 3 });
});

test('compact and diagnostic retain artifacts; full is exact; reading never repeats the action', async t => {
  const h = harness(t);
  const compact = (await h.call('compact', 'echo', { unknown: 'forwarded' })).result;
  const diagnostic = (await h.call('diagnostic', 'plain', { outputLevel: 'diagnostic' })).result;
  const full = (await h.call('full', 'echo', { outputLevel: 'full', unknown: 'forwarded' })).result;
  assert.equal(compact.structuredContent.outputLevel, 'compact');
  assert.equal(diagnostic.structuredContent.outputLevel, 'diagnostic');
  assert.ok(JSON.stringify(compact).length < JSON.stringify(full).length);
  assert.ok(JSON.stringify(diagnostic).length > JSON.stringify(compact).length);
  assert.equal(full.content[0].text, 'uncertain evidence ' + 'x'.repeat(22000));
  assert.equal(full.structuredContent.calls, 3); assert.deepEqual(full.structuredContent.args, { unknown: 'forwarded' });
  const artifact = compact.structuredContent.artifact.path;
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(h.root, artifact))).structuredContent.args, { unknown: 'forwarded' });
  const a = (await h.call('read', 'output_read', { artifact, limit: 101 })).result.structuredContent;
  const b = (await h.call('read2', 'output_read', { artifact, offset: a.nextOffset, limit: 101, outputLevel: 'full' })).result.structuredContent;
  assert.equal(a.bytes, 101); assert.equal(b.offset, 101); assert.equal(b.bytes, 101);
  assert.equal((await h.call('count', 'plain', { outputLevel: 'full' })).result.structuredContent.calls, 4);
  assert.ok(fs.readdirSync(path.join(h.root, 'artifacts/agent-output')).length >= 4);
  assert.equal((await h.call('invalid', 'plain', { outputLevel: 'bogus' })).error.code, -32602);
  assert.equal((await h.call('escape', 'output_read', { artifact: '../private' })).error.code, -32602);
});

test('collection reader restores exact fetched rows and refuses incompatible options', async t => {
  const h = harness(t);
  const native = (await h.call('rows-source', 'plain', {})).result;
  const artifact = native.structuredContent.artifact.path;
  const saved = JSON.parse(fs.readFileSync(path.join(h.root, artifact), 'utf8'));
  saved.structuredContent.rows = Array.from({ length: 40 }, (_, id) => ({ id }));
  saved.structuredContent.nextCursor = 'native-next-page';
  fs.writeFileSync(path.join(h.root, artifact), JSON.stringify(saved));
  const page = (await h.call('rows', 'output_read', { artifact, format: 'collection', pointer: '/structuredContent/rows', offset: 3, limit: 4 })).result.structuredContent;
  assert.deepEqual(page.items, [{ id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }]);
  assert.equal(page.totalItems, 40); assert.equal(page.nextOffset, 7);
  assert.equal((await h.call('rows-invalid', 'output_read', { artifact, pointer: '/rows' })).error.code, -32602);
  assert.equal((await h.call('rows-limit', 'output_read', { artifact, format: 'collection', pointer: '/structuredContent/rows', limit: 101 })).error.code, -32602);
  assert.equal((await h.call('rows-count', 'plain', { outputLevel: 'full' })).result.structuredContent.calls, 2);
});

test('initialize, progress, cancellation, bidirectional ids including null, concurrent replies and upstream errors survive', async t => {
  const h = harness(t);
  const init = await h.request('init', 'initialize', {});
  assert.deepEqual(init.result.capabilities, { tools: { listChanged: true }, resources: { subscribe: true } });
  await h.request('list', 'tools/list');
  h.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal((await h.wait(m => m.method === 'notifications/progress')).params.progressToken, 0);
  assert.equal((await h.wait(m => m.method === 'sampling/createMessage')).id, null);
  h.send({ jsonrpc: '2.0', id: null, result: { accepted: true } });
  assert.equal((await h.wait(m => m.method === 'response-observed')).params.id, null);
  h.send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 0, reason: 'user request' } });
  assert.equal((await h.wait(m => m.method === 'cancel-observed')).params.requestId, 0);
  const slow = h.call(0, 'echo', { delay: 80, outputLevel: 'full' });
  const fast = h.call(null, 'plain', { outputLevel: 'diagnostic' });
  assert.equal((await fast).result.structuredContent.outputLevel, 'diagnostic');
  assert.equal((await slow).result.structuredContent.args.delay, 80);
  assert.ok(h.messages.findIndex(m => !m.method && m.id === null) < h.messages.findIndex(m => !m.method && m.id === 0));
  const fail = await h.call('fail', 'failure', {}); assert.equal(fail.result.isError, true);
  const rpc = await h.call('rpc', 'failure', { rpc: true }); assert.deepEqual(rpc.error, { code: -32000, message: 'uncertain upstream error', data: { maybe: true } });
  assert.doesNotMatch(h.stderr(), /PRIVATE/);
});

test('JSONL buffering accepts split input; stdin EOF terminates own child', async t => {
  const h = harness(t);
  h.child.stdin.write('{"jsonrpc":"2.0","id":"split","method":"tools/');
  h.child.stdin.write('list"}\n');
  assert.equal((await h.wait(m => m.id === 'split')).result.tools[0].name, 'echo');
  const pid = (await h.request('pid', 'initialize')).result._meta.pid;
  h.child.stdin.end(); assert.equal((await h.closed).code, 0);
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});

test('upstream failure exits gateway and does not expose upstream stderr', async t => {
  const h = harness(t); h.send({ jsonrpc: '2.0', method: 'die' });
  assert.equal((await h.closed).code, 7);
  assert.match(h.stderr(), /exited/); assert.doesNotMatch(h.stderr(), /PRIVATE/);
});

test('spawn failure closes gateway promptly', async t => {
  const h = harness(t, '');
  h.child.stdin.end(); await h.closed;
  const r = spawnSync(process.execPath, [gateway, '--server', 'missing', '--', '/no-such-executable'], { encoding: 'utf8', timeout: 4000 });
  assert.equal(r.status, 1); assert.match(r.stderr, /unable to start/);
});


test('output schema local references retain their original target after adding the envelope', async t => {
  const code = fixture.replace("required:['value'],properties:{value:{type:'string'}}", "required:['value'],$defs:{Value:{type:'string'}},properties:{value:{$ref:'#/$defs/Value'}},examples:[{$ref:'#/literal'}]");
  const h = harness(t, code);
  const schema = (await h.request('refs', 'tools/list')).result.tools[0].outputSchema;
  assert.equal(schema.anyOf[0].properties.value.$ref, '#/anyOf/0/$defs/Value');
  assert.equal(schema.anyOf[0].examples[0].$ref, '#/literal');
  assert.equal(schema.anyOf[0].$defs.Value.type, 'string');
});

test('cancellation while discovering schemas never dispatches the cancelled action', async t => {
  const code = fixture.replace("if(m.method==='tools/list') return send(", "if(m.method==='tools/list') return setTimeout(()=>send(").replace("nextCursor:'second'}});", "nextCursor:'second'}}),80);");
  const h = harness(t, code);
  const cancelled = h.call('cancel-me', 'echo', {});
  h.send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 'cancel-me' } });
  assert.equal((await cancelled).error.code, -32800);
  assert.equal((await h.call('next', 'echo', { outputLevel: 'full' })).result.structuredContent.calls, 1);
});

test('original retrieval restores saved image blocks without executing the action again', async t => {
  const code = fixture.replace("setTimeout(()=>send({jsonrpc:'2.0',id:m.id,result})", "if(m.params.name==='image') result.content=[{type:'image',mimeType:'image/png',data:'iVBORw0KGgo='},{type:'text',text:'image evidence'}]; setTimeout(()=>send({jsonrpc:'2.0',id:m.id,result})");
  const h = harness(t, code);
  const compact = (await h.call('image', 'image', {})).result;
  const artifact = compact.structuredContent.artifact.path;
  const saved = JSON.parse(fs.readFileSync(path.join(h.root, artifact), 'utf8'));
  const original = (await h.call('original', 'output_read', { artifact, format: 'original', outputLevel: 'full' })).result;
  assert.deepEqual(original, saved);
  assert.equal(original.content[0].type, 'image');
  assert.equal((await h.call('count-image', 'plain', { outputLevel: 'full' })).result.structuredContent.calls, 2);
  assert.equal((await h.call('need-full', 'output_read', { artifact, format: 'original' })).error.code, -32602);
  fs.writeFileSync(path.join(h.root, artifact), ' '.repeat(8 * 1024 * 1024 + 1));
  const large = await h.call('too-large', 'output_read', { artifact, format: 'original', outputLevel: 'full' });
  assert.equal(large.error.code, -32602);
});

test('failure stderr is retained privately with an actionable artifact reference', async t => {
  const h = harness(t);
  h.send({ jsonrpc: '2.0', method: 'die' });
  assert.equal((await h.closed).code, 7);
  const match = h.stderr().match(/stderr retained at (artifacts\/agent-output\/[^ ]+)/);
  assert.ok(match, h.stderr());
  assert.match(fs.readFileSync(path.join(h.root, match[1]), 'utf8'), /PRIVATE RAW OUTPUT SHOULD NEVER BE LOGGED/);
  assert.equal(fs.statSync(path.join(h.root, match[1])).mode & 0o777, 0o600);
  assert.doesNotMatch(h.stderr(), /PRIVATE RAW/);
});

test('stdin EOF lets the upstream perform graceful cleanup before escalation', async t => {
  const code = fixture + `\nrequire('node:readline').createInterface({input:process.stdin}).on('close',()=>{require('node:fs').writeFileSync('graceful-cleanup','yes');setTimeout(()=>process.exit(0),80)});`;
  const h = harness(t, code);
  await h.request('ready', 'initialize');
  h.child.stdin.end();
  assert.equal((await h.closed).code, 0);
  assert.equal(fs.readFileSync(path.join(h.root, 'graceful-cleanup'), 'utf8'), 'yes');
});

const isLive = pid => {
  try {
    process.kill(pid, 0);
    // A reparented zombie has exited; some container init processes reap slowly.
    if (process.platform === 'linux' && /\) Z /.test(fs.readFileSync(`/proc/${pid}/stat`, 'utf8'))) return false;
    return true;
  } catch (error) { if (error.code === 'ESRCH' || error.code === 'ENOENT') return false; throw error; }
};

test('EOF bounds ignored SIGTERM and cleans the owned grandchild process group', { skip: process.platform === 'win32' }, async t => {
  const grandchild = "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)";
  const code = fixture + `\nconst gc=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'ignore'});require('node:fs').writeFileSync('grandchild.pid',String(gc.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`;
  const h = harness(t, code);
  const pid = (await h.request('root-pid', 'initialize')).result._meta.pid;
  const descendant = Number(fs.readFileSync(path.join(h.root, 'grandchild.pid'), 'utf8'));
  h.child.stdin.end();
  assert.equal((await h.closed).code, 0);
  assert.equal(isLive(pid), false);
  assert.equal(isLive(descendant), false);
});

test('closed object branches in composed input schemas accept the presentation key', async t => {
  const code = fixture.replace("inputSchema:{type:'object',properties:{value:{type:'string'}},additionalProperties:false}", "inputSchema:{type:'object',allOf:[{type:'object',properties:{value:{type:'string'}},additionalProperties:false}]}");
  const validatingCode = code.replace('calls++;', "if(m.params.name==='echo' && Object.keys(m.params.arguments||{}).some(k=>k!=='value'))return send({jsonrpc:'2.0',id:m.id,error:{code:-32602,message:'unknown upstream argument'}});calls++;");
  const h = harness(t, validatingCode);
  const tool = (await h.request('composite', 'tools/list')).result.tools[0];
  assert.equal(tool.inputSchema.properties.outputLevel.default, 'compact');
  assert.equal(tool.inputSchema.allOf[0].additionalProperties, false);
  assert.deepEqual(tool.inputSchema.allOf[0].properties.outputLevel.enum, ['compact', 'diagnostic', 'full']);
  assert.deepEqual((await h.call('composed-call', 'echo', { value: 'original', outputLevel: 'full' })).result.structuredContent.args, { value: 'original' });
  assert.equal((await h.call('upstream-validation', 'echo', { unknown: true, outputLevel: 'full' })).error.message, 'unknown upstream argument');
});


test('retrieval tool name avoids upstream names regardless of pagination order', async t => {
  const code = fixture.replace("name:'plain'", "name:'_output_read'").replace("name:'failure'", "name:'output_read'");
  const h = harness(t, code);
  const first = (await h.request('names1', 'tools/list')).result;
  assert.equal(first.tools[1].name, '_output_read');
  const second = (await h.request('names2', 'tools/list', { cursor: first.nextCursor })).result;
  assert.equal(second.tools.at(-1).name, '__output_read');
  const result = (await h.call('save-name', 'echo', {})).result;
  const artifact = result.structuredContent.artifact.path;
  const read = await h.call('retrieve-name', '__output_read', { artifact, limit: 10 });
  assert.equal(read.result.structuredContent.bytes, 10);
  const upstream = (await h.call('original-name', 'output_read', { outputLevel: 'full' })).result;
  assert.equal(upstream.structuredContent.calls, 2);
});

test('unexpected root exit cleans the owned grandchild before gateway completion', { skip: process.platform === 'win32' }, async t => {
  const grandchild = "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)";
  const code = fixture + `\nconst gc=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'ignore'});require('node:fs').writeFileSync('grandchild.pid',String(gc.pid));`;
  const h = harness(t, code);
  await h.request('unexpected-ready', 'initialize');
  const descendant = Number(fs.readFileSync(path.join(h.root, 'grandchild.pid'), 'utf8'));
  h.send({ jsonrpc: '2.0', method: 'die' });
  assert.equal((await h.closed).code, 7);
  assert.equal(isLive(descendant), false);
});

test('opaque empty cursors and tool-list changes preserve discovery and collision safety', async t => {
  const code = fixture.replace("m.params?.cursor?", "m.params && Object.hasOwn(m.params,'cursor')?").replace("nextCursor:'second'", "nextCursor:''").replace("if(m.method==='die')", "if(m.method==='change'){tools[0].inputSchema.properties.outputLevel={type:'string'};return send({jsonrpc:'2.0',method:'notifications/tools/list_changed'})} if(m.method==='die')");
  const h = harness(t, code);
  const first = (await h.request('empty-first', 'tools/list')).result;
  assert.equal(first.nextCursor, '');
  assert.equal(first.tools.length, 2);
  const second = (await h.request('empty-second', 'tools/list', { cursor: '' })).result;
  assert.equal(second.tools.at(-1).name, 'output_read');
  h.send({ jsonrpc: '2.0', method: 'change' });
  await h.wait(m => m.method === 'notifications/tools/list_changed');
  const changed = (await h.call('changed-call', 'echo', { outputLevel: 'upstream', _outputLevel: 'full' })).result;
  assert.deepEqual(changed.structuredContent.args, { outputLevel: 'upstream' });
});
