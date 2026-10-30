import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InboxStore, syncThread, MAX_RESPONSE_BYTES } from '../../tools/agent/inbox-store.mjs';
import { createHandler, TOOLS } from '../../tools/mcp/inbox-mcp.mjs';

const rpc=(method,params,id=1)=>({jsonrpc:'2.0',id,method,...(params===undefined?{}:{params})});
test('inbox MCP advertises closed schemas and truthful cache/GitHub annotations',()=>{
  assert.deepEqual(TOOLS.map(t=>t.name),['apex_inbox_sync','apex_inbox_list','apex_inbox_get','apex_inbox_status']);
  for(const t of TOOLS) {
    assert.equal(t.inputSchema.additionalProperties,false);
    for(const name of ['path','file','db','repo','url']) assert.equal(t.inputSchema.properties[name],undefined);
    assert.equal(t.annotations.readOnlyHint,t.name!=='apex_inbox_sync');
    assert.equal(t.annotations.openWorldHint,t.name==='apex_inbox_sync');
  }
  assert.equal(TOOLS.find(t=>t.name==='apex_inbox_get').inputSchema.properties.maxBytes.maximum,MAX_RESPONSE_BYTES);
});
test('inbox MCP forwards pagination and sync to core once and always closes stores',async()=>{
  const calls=[];let closed=0;
  const store={close:()=>closed++,list:(...args)=>{calls.push(['list',...args]);return {items:[],nextCursor:12};},get:(...args)=>{calls.push(['get',...args]);return {content:'text',nextBodyCursor:4};},status:issue=>({issue,stale:true})};
  const request=()=>{throw Error('must only be passed to injected sync');};
  const handle=createHandler({openStore:()=>store,request,sync:(s,i,o)=>{assert.equal(s,store);assert.equal(o.request,request);calls.push(['sync',i,o.maxPages]);return {ok:true};}});
  for(const [name,args] of [['list',{issue:8,after:10,generation:2,limit:3,messagesOnly:true}],['get',{issue:8,id:12,afterCodePoint:3,bodyVersion:'a'.repeat(64)}],['sync',{issue:8,maxPages:2}]]) {
    const r=await handle(rpc('tools/call',{name:'apex_inbox_'+name,arguments:args})); assert.equal(r.result.isError,false);
  }
  assert.deepEqual(calls,[['list',8,{after:10,generation:2,limit:3,messagesOnly:true}],['get',8,12,{afterCodePoint:3,bodyVersion:'a'.repeat(64)}],['sync',8,2]]);
  assert.equal(closed,3);
});
test('inbox MCP rejects unknown args, wrong types and malformed RPC before opening cache',async()=>{
  let opened=0;const handle=createHandler({openStore:()=>{opened++;throw Error('unexpected open');}});
  for(const args of [JSON.parse('{"issue":1,"__proto__":{}}'),{issue:1,constructor:'bad'},{issue:1,repo:'other/repo'},{issue:'1'},{issue:0},{issue:1,limit:101},{issue:1,messagesOnly:'true'},{issue:1,after:-1},{issue:1,maxBytes:20000},{issue:1,recipient:4}]) {
    const r=await handle(rpc('tools/call',{name:'apex_inbox_list',arguments:args}));assert.equal(r.result.isError,true);
  }
  for(const args of [{issue:1},{issue:1,id:2,bodyVersion:'bad'}]) assert.equal((await handle(rpc('tools/call',{name:'apex_inbox_get',arguments:args}))).result.isError,true);
  assert.equal((await handle(rpc('tools/call',{name:'not-a-tool'}))).result.isError,true);
  assert.equal((await handle(rpc('tools/call',{name:'apex_inbox_status',arguments:[]}))).error.code,-32602);
  for(const value of [null,[],{jsonrpc:'1.0',method:'ping',id:1},{jsonrpc:'2.0',method:'ping',id:{}},rpc('ping',[])]) assert.equal((await handle(value)).error.code,-32600);
  assert.equal(opened,0);
});
test('inbox MCP bounds successful and failing core responses',async()=>{
  let closed=0;
  const handle=createHandler({openStore:()=>({status:()=>({text:'x'.repeat(17000)}),close:()=>closed++})});
  assert.equal((await handle(rpc('tools/call',{name:'apex_inbox_status',arguments:{issue:1}}))).result.isError,true);
  assert.equal(closed,1);
  const bad=createHandler({openStore:()=>{throw Error('x'.repeat(20000));}});
  assert.ok(JSON.stringify(await bad(rpc('tools/call',{name:'apex_inbox_status',arguments:{issue:1}}))).length<1000);
});
test('inbox MCP child transport emits only JSONRPC for initialize/list/get/status/errors',()=>{
  const moduleURL=new URL('../../tools/mcp/inbox-mcp.mjs',import.meta.url).href;
  const script=`import {serve} from ${JSON.stringify(moduleURL)}; await serve({openStore:()=>({close(){},status(issue){return {issue,stale:true};},get(issue,id,options){return {issue,id,options,content:'cached only',nextBodyCursor:null};}})});`;
  const messages=[rpc('initialize',{protocolVersion:'2025-06-18'}),{jsonrpc:'2.0',method:'notifications/initialized'},rpc('tools/list',{},2),rpc('tools/call',{name:'apex_inbox_get',arguments:{issue:7,id:9}},3),rpc('tools/call',{name:'apex_inbox_status',arguments:{issue:7}},4),rpc('tools/call',{name:'apex_inbox_status',arguments:{issue:7,path:'/etc/passwd'}},5),rpc('unknown',{},6),rpc('initialize',{protocolVersion:42},7)];
  const child=spawnSync(process.execPath,['--input-type=module','-e',script],{input:messages.map(JSON.stringify).join('\n')+'\n{bad\n[]\n',encoding:'utf8',timeout:10000});
  assert.equal(child.status,0,child.stderr);
  const rows=child.stdout.trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(rows.length,9);assert.ok(rows.every(row=>row.jsonrpc==='2.0'));
  assert.equal(rows[0].result.protocolVersion,'2025-06-18');
  assert.equal(rows[1].result.tools.length,4);
  assert.equal(JSON.parse(rows[2].result.content[0].text).content,'cached only');
  assert.equal(JSON.parse(rows[3].result.content[0].text).stale,true);
  assert.equal(rows[4].result.isError,true);
  assert.deepEqual(rows.slice(5).map(row=>row.error.code),[-32601,-32602,-32700,-32600]);
});
test('inbox MCP negotiates only existing repository protocol revisions',async()=>{
  const handle=createHandler();
  for(const version of ['2024-11-05','2025-03-26','2025-06-18']) assert.equal((await handle(rpc('initialize',{protocolVersion:version}))).result.protocolVersion,version);
  assert.equal((await handle(rpc('initialize',{protocolVersion:'2026-07-28'}))).result.protocolVersion,'2025-06-18');
  assert.equal(await handle({jsonrpc:'2.0',method:'notifications/initialized'}),null);
});
test('inbox MCP accepts request metadata separately from closed tool arguments',async()=>{
  const handle=createHandler({openStore:()=>({status:issue=>({issue}),close(){}})});
  assert.equal((await handle(rpc('tools/list',{_meta:{progressToken:1}}))).result.tools.length,4);
  const params={name:'apex_inbox_status',arguments:{issue:1},_meta:{progressToken:'work-1'}};
  assert.equal((await handle(rpc('tools/call',params))).result.isError,false);
  for(const _meta of [[],null,'bad']) {
    assert.equal((await handle(rpc('tools/list',{_meta}))).error.code,-32602);
    assert.equal((await handle(rpc('tools/call',{...params,_meta}))).error.code,-32602);
  }
  assert.equal((await handle(rpc('tools/call',{...params,arguments:{issue:1,_meta:{}}}))).result.isError,true);
});
test('inbox MCP discards oversized lines and recovers at next frame, including newline-free input',()=>{
  const entry=new URL('../../tools/mcp/inbox-mcp.mjs',import.meta.url);
  for(const input of ['x'.repeat(100000),'x'.repeat(100000)+'\n'+JSON.stringify(rpc('ping'))+'\n']) {
    const child=spawnSync(process.execPath,[entry.pathname],{input,encoding:'utf8',timeout:10000});
    assert.equal(child.status,0,child.stderr);
    const rows=child.stdout.trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(rows[0].error.code,-32600);
    assert.equal(rows.length,input.endsWith('\n')?2:1);
    if(rows.length===2) assert.deepEqual(rows[1].result,{});
  }
});
test('inbox MCP real entry reopens SQLite fixture for status/list/get without provider access',()=>{
  const scratch=fileURLToPath(new URL('../../scratch/',import.meta.url));
  fs.mkdirSync(scratch,{recursive:true,mode:0o700});
  const fixture=fs.mkdtempSync(path.join(scratch,'inbox-mcp-test-'));
  try {
    // Copy the exact entry so its fixed ROOT/cache belongs to this fixture.
    // Only backend modules are linked; no caller or environment path override.
    const entry=path.join(fixture,'tools','mcp','inbox-mcp.mjs');
    fs.mkdirSync(path.dirname(entry),{recursive:true});
    fs.copyFileSync(new URL('../../tools/mcp/inbox-mcp.mjs',import.meta.url),entry);
    fs.symlinkSync(fileURLToPath(new URL('../../tools/agent/',import.meta.url)),path.join(fixture,'tools','agent'),'dir');
    const file=path.join(fixture,'scratch','agent-inbox','mcp-cache.sqlite');
    fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
    const fd=fs.openSync(file,'wx',0o600);fs.closeSync(fd);
    const store=new InboxStore(file);
    try {
      syncThread(store,7,{request:route=>({json:route.includes('/comments?')?[{id:9,body:'cached fixture ✓',user:{login:'fixture-user'},updated_at:'2026-10-30T12:00:00Z',html_url:'https://github.com/brycejmurrin/f1-game/issues/7#issuecomment-9'}]:{number:7,comments:1,updated_at:'2026-10-30T12:00:00Z'}})});
    } finally {store.close();}
    // Read tools must neither chmod nor modify an existing projection.
    fs.chmodSync(file,0o400);
    const before=fs.statSync(file), original=fs.readFileSync(file);
    const requests=[rpc('tools/call',{name:'apex_inbox_status',arguments:{issue:7}}),rpc('tools/call',{name:'apex_inbox_list',arguments:{issue:7}},2),rpc('tools/call',{name:'apex_inbox_get',arguments:{issue:7,id:9},_meta:{progressToken:'fixture'}},3)];
    const child=spawnSync(process.execPath,[entry],{input:requests.map(JSON.stringify).join('\n')+'\n',encoding:'utf8',timeout:10000});
    assert.equal(child.status,0,child.stderr);
    const rows=child.stdout.trim().split('\n').map(JSON.parse);
    assert.equal(rows.length,3);assert.ok(rows.every(r=>r.result.isError===false));
    const data=rows.map(r=>JSON.parse(r.result.content[0].text));
    assert.equal(data[0].cachedComments,1);assert.equal(data[0].generation,1);
    assert.equal(data[1].source,'local-cache');assert.equal(data[1].items[0].id,9);
    assert.equal(data[2].content,'cached fixture ✓');assert.equal(data[2].identity,'claimed');
    assert.equal(fs.statSync(file).mode&0o777,0o400);
    assert.equal(fs.statSync(file).mtimeMs,before.mtimeMs);
    assert.deepEqual(fs.readFileSync(file),original);
  } finally {fs.rmSync(fixture,{recursive:true,force:true});}
});
test('inbox MCP descriptors and discovery do not load SQLite; real inbox calls fail gracefully without it',()=>{
  const moduleURL=new URL('../../tools/mcp/inbox-mcp.mjs',import.meta.url).href;
  // registerHooks arrived in Node 22.15; the asynchronous register API works
  // on the inbox's declared 22.13 floor as well (Node module API reference).
  const hook='export async function resolve(specifier,context,next){if(specifier==="node:sqlite")throw Error("SQLite deliberately unavailable");return next(specifier,context);}';
  const hookURL='data:text/javascript,'+encodeURIComponent(hook);
  const script=`import {register} from 'node:module';register(${JSON.stringify(hookURL)},import.meta.url);const {TOOLS,createHandler}=await import(${JSON.stringify(moduleURL)});const handle=createHandler();const listed=await handle(${JSON.stringify(rpc('tools/list'))});const called=await handle(${JSON.stringify(rpc('tools/call',{name:'apex_inbox_sync',arguments:{issue:7}}))});console.log(JSON.stringify({count:TOOLS.length,listed,called}));`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',timeout:10000});
  assert.equal(child.status,0,child.stderr);
  const data=JSON.parse(child.stdout);
  assert.equal(data.count,4);assert.equal(data.listed.result.tools.length,4);
  assert.equal(data.called.result.isError,true);
  assert.match(data.called.result.content[0].text,/SQLite deliberately unavailable/);
});
