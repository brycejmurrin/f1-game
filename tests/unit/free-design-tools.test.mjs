import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {screenshotReview,localImage,tokenHTML} from '../../tools/ui/design-evidence.mjs';
import {checkCatalog,normalizeHostName} from '../../tools/mcp/check-chat-contract.mjs';
import {createGateway,UPSTREAMS,RELEASE} from '../../tools/mcp/chat-gateway.mjs';
import {localResource,validateAsset,optimizeAsset} from '../../tools/assets/gltf-check.mjs';
import {parseCssPlayArgs} from '../../tools/ui/css-play.mjs';
import {gatewayProfile} from '../../tools/env/configure-chat-mcp.mjs';
import {readService} from '../../tools/env/chat-mcp-service.mjs';
import sharp from 'sharp';
import {Document,NodeIO} from '@gltf-transform/core';
const root=path.resolve(new URL('../..',import.meta.url).pathname);
function fixture(t){fs.mkdirSync(path.join(root,'scratch'),{recursive:true});const dir=fs.mkdtempSync(path.join(root,'scratch','apex-design-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}

test('gallery is self-contained and escapes labels, metadata and script-closing text',t=>{
  const dir=fixture(t);fs.writeFileSync(path.join(dir,'shot.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64'));
  const html=screenshotReview(dir,{title:'<script>x</script>',shots:[{file:'shot.png',before:'shot.png',label:'<img onerror=x>',metadata:{text:'</script>'}}]});
  assert(html.includes('data:image/png;base64,'));assert(!html.includes('<img onerror'));assert(html.includes('&lt;script&gt;'));assert(html.includes('type="range"'));assert(!html.includes('src="https:'));
  assert.throws(()=>localImage(dir,'../missing.png'));
  fs.symlinkSync('/etc/hosts',path.join(dir,'escape.png'));assert.throws(()=>localImage(dir,'escape.png'),/escapes/);
  assert.throws(()=>screenshotReview(dir,{shots:[]}),/1..40/);
  assert(tokenHTML({selector:'<x>',tokens:{'--bad':'<script>'},controls:[]}).includes('&lt;script&gt;'));
});

test('contract check finds advertised route drift, duplicates and missing release',()=>{
  const tools=UPSTREAMS.map(n=>({name:n.replaceAll('-','_')+'__test',inputSchema:{type:'object'}}));
  tools.push({name:RELEASE,inputSchema:{type:'object'}});
  assert(checkCatalog(tools).ok);assert(!checkCatalog([...tools,tools[0]]).ok);
  assert(!checkCatalog(tools,['mcp__codex_apps__f1_cloud_mcp_apex_tools__missing']).ok);
  assert.equal(normalizeHostName('mcp__codex_apps__f1_cloud_mcp_'+RELEASE),RELEASE);
});

test('gateway serializes calls, blocks conflicting browsers and reconnects released mode',async()=>{
  const closed=[];let active=0,max=0,connections=0;
  const gateway=await createGateway({connect:async name=>{connections++;return {
    listTools:async()=>({tools:[{name:'probe',description:name==='apex-tools'?'Tree':'Browser',inputSchema:{type:'object'}}]}),
    callTool:async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;return {content:[]};},
    close:async()=>closed.push(name)
  };}});
  try{
    await gateway.catalog();
    const calls=await Promise.all([gateway.call({name:'playwright_official__probe'}),gateway.call({name:'playwright_official__probe'})]);
    assert.equal(max,1);assert(!calls[0].isError);
    assert((await gateway.call({name:'chrome_devtools__probe'})).isError);
    await gateway.call({name:RELEASE});assert(closed.includes('playwright-official'));
    assert(!(await gateway.call({name:'chrome_devtools__probe'})).isError);
    await gateway.call({name:RELEASE});await gateway.call({name:'playwright_official__probe'});assert.equal(connections,6);
    await assert.rejects(gateway.call({name:'no-such-tool'}),/Unknown/);
  }finally{await gateway.close();}
});

test('external glTF buffers cannot escape through traversal, scheme or symlinks',async t=>{
  const dir=fixture(t);fs.writeFileSync(path.join(dir,'buffer.bin'),'data');
  assert.equal((await localResource(dir,'buffer.bin')).length,4);
  for(const uri of ['../outside.bin','https://example.com/model.bin','file:///etc/hosts','%2fetc/hosts','%xx'])await assert.rejects(localResource(dir,uri));
  fs.symlinkSync('/etc/hosts',path.join(dir,'escape.bin'));await assert.rejects(localResource(dir,'escape.bin'),/escapes/);
});

test('real triangle GLB validates; budgets fail and dedup output preserves original',async t=>{
  const dir=fixture(t),input=path.join(dir,'model.glb'),output=path.join(dir,'optimized.glb');
  const doc=new Document(),buffer=doc.createBuffer();
  const position=doc.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,0,1,0,0,0,1,0])).setBuffer(buffer);
  const primitive=doc.createPrimitive().setAttribute('POSITION',position);
  doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)));
  await new NodeIO().write(input,doc);
  const before=fs.readFileSync(input),report=await validateAsset(input);assert(report.ok,JSON.stringify(report));assert.equal(report.triangles,1);
  assert(!(await validateAsset(input,{maxBytes:1})).ok);
  const reportOverwrite=spawnSync(process.execPath,['tools/assets/gltf-check.mjs',input,'--out',input],{cwd:root,encoding:'utf8'});
  assert.notEqual(reportOverwrite.status,0);assert.ok(/Report must not replace input/.test(reportOverwrite.stderr),reportOverwrite.stderr);assert.deepEqual(fs.readFileSync(input),before);
  const result=await optimizeAsset(input,output);assert(result.ok);assert.deepEqual(fs.readFileSync(input),before);
  await assert.rejects(optimizeAsset(input,input),/separate/);await assert.rejects(optimizeAsset(input,output),/overwrite/);
});

test('room adapter rejects unapproved final composition and export before importing Blender',()=>{
  for(const stage of ['compose','export']){
    const r=spawnSync('python3',['tools/assets/procedural-room.py',stage,'tools/assets/procedural-room.example.json','--out','artifacts/must-not-exist'],{cwd:root,encoding:'utf8'});
    assert.notEqual(r.status,0);assert.ok(/Function approval required/.test(r.stderr),r.stderr);
  }
});

test('CSS inspection accepts explicit axe/token flags; stale service records are not live',t=>{
  const opts=parseCssPlayArgs(['--screen','settings','--axe','--tokens']);assert(opts.axe&&opts.tokens);
  const dir=fixture(t),record=path.join(dir,'service.json');fs.writeFileSync(record,JSON.stringify({pid:process.pid,identity:'not-this-process'}));
  assert.equal(readService(record).running,false);
});

test('profile upgrade retains tunnel identity and never accepts literal credential values',()=>{
  const original={control_plane:{tunnel_id:'fixture-tunnel',api_key:'env:FIXTURE_KEY'},mcp:{commands:[{command:'old',channel:'main'}]}};
  const next=gatewayProfile(original,'/checkout path/tools/mcp/chat-gateway.mjs');
  assert.deepEqual(next.control_plane,original.control_plane);assert.equal(original.mcp.commands[0].command,'old');
  assert(next.mcp.commands[0].command.includes('checkout path'));
  assert.throws(()=>gatewayProfile({control_plane:{tunnel_id:'fixture',api_key:'literal-secret'}},'/gateway'),/reference/);
});

test('procedural arrival cannot be declared outside its wall',t=>{
  const dir=fixture(t),brief=JSON.parse(fs.readFileSync(path.join(root,'tools/assets/procedural-room.example.json')));
  brief.openings[0].centerX=100;const file=path.join(dir,'room.json');fs.writeFileSync(file,JSON.stringify(brief));
  const r=spawnSync('python3',['tools/assets/procedural-room.py','validate',file,'--out',path.join(dir,'unused')],{cwd:root,encoding:'utf8'});
  assert.notEqual(r.status,0);assert.ok(/strictly within/.test(r.stderr),r.stderr);
});

test('texture budgets use dimensions from the validator resource report',async t=>{
  const dir=fixture(t),file=path.join(dir,'textured.glb'),doc=new Document(),buffer=doc.createBuffer();
  const position=doc.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,0,1,0,0,0,1,0])).setBuffer(buffer);
  const uv=doc.createAccessor().setType('VEC2').setArray(new Float32Array([0,0,1,0,0,1])).setBuffer(buffer);
  const image=await sharp({create:{width:8,height:8,channels:4,background:'#fff'}}).png().toBuffer();
  const material=doc.createMaterial().setBaseColorTexture(doc.createTexture().setImage(image).setMimeType('image/png'));
  const primitive=doc.createPrimitive().setAttribute('POSITION',position).setAttribute('TEXCOORD_0',uv).setMaterial(material);
  doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)));
  await new NodeIO().write(file,doc);
  const normal=await validateAsset(file);assert(normal.ok,JSON.stringify(normal.report.issues));
  const small=await validateAsset(file,{maxTextureDimension:4});assert(!small.ok);assert(small.budgetErrors.includes('Texture dimensions exceed budget'));
});




import {doctorWithCatalog} from '../../tools/mcp/doctor-catalog.mjs';

test('caller catalog reaches doctor and the checkout SDK resolves', async () => {
  const body = await doctorWithCatalog(root, {hostToolNames: ['apex_tools__apex_status'], full: true});
  assert.equal(body.out.checks.find(c => c.id === 'session.catalog').status, 'pass');
  assert.equal(body.out.checks.find(c => c.id === 'runtime.dependencies').status, 'pass');
});
test('catalog input cannot select files, commands, or roots', async () => {
  for (const args of [{hostToolNames: '../secret'}, {hostToolNames: ['../secret']},
    {hostToolNames: Array(2001).fill('tool')}, {hostToolNames: [], root: '/tmp'},
    {hostToolNames: [], command: 'install'}, {hostToolNames: [], full: 'true'}]) {
    await assert.rejects(doctorWithCatalog(root, args));
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

test('VM eval and rejected preflight do not create browser ownership; runtime errors keep it',async()=>{
  let response={content:[]};
  const gateway=await createGateway({connect:async name=>({
    listTools:async()=>({tools:[{name:name==='apex-tools'?'apex_eval':'probe',description:'Browser probe',inputSchema:{type:'object'}}]}),
    callTool:async()=>{if(response instanceof Error)throw response;return response;},close:async()=>{}
  })});
  const evalCall=arguments_=>gateway.call({name:'apex_tools__apex_eval',arguments:arguments_});
  const chrome=()=>gateway.call({name:'chrome_devtools__probe'});
  const release=()=>gateway.call({name:RELEASE});
  try {
    await evalCall({vm:true});assert(!(await chrome()).isError,'VM must not claim ownership');
    assert(!(await evalCall({vm:true})).isError,'VM must also work under an existing Chrome owner');
    assert((await evalCall({})).isError,'real browser eval remains blocked by Chrome');
    await release();
    for(const error of ['bad_args','local_only']) {
      response={isError:true,content:[{type:'text',text:JSON.stringify({error})}]};
      await evalCall({});response={content:[]};
      assert(!(await chrome()).isError,error+' must not claim ownership');await release();
    }
    await evalCall({});
    response={isError:true,structuredContent:{error:'bad_args'},content:[]};await evalCall({});
    response={content:[]};assert((await chrome()).isError,'a rejected call must preserve its pre-existing owner');await release();
    response={isError:true,structuredContent:{error:'bad_args'},content:[]};await evalCall({});
    response={content:[]};assert(!(await chrome()).isError,'structured preflight refusal must not claim ownership');await release();
    response=new Error('transport lost after possible launch');await assert.rejects(evalCall({}),/transport lost/);
    assert((await chrome()).isError,'transport failures must retain ownership');await release();
    response={isError:true,content:[{type:'text',text:'runtime failure after launch'}]};await evalCall({});
    response={content:[]};assert((await chrome()).isError,'runtime failure must retain ownership');await release();
  } finally {await gateway.close();}
});

test('VM eval supports the advertised __apex expression and existing a/g bindings',()=>{
  const r=spawnSync(process.execPath,['tools/shot/apex-eval.mjs','bahrain','({same:a===__apex,track:__apex.info().track,handle:typeof g.close})','--vm','--raw'],{cwd:root,encoding:'utf8',timeout:20000});
  assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),{same:true,track:'bahrain',handle:'function'});
});
