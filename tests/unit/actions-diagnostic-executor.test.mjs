import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildDiagnosticRequest } from '../../tools/ci/actions/diagnostics.mjs';
import { diagnosticTasks, executeDiagnostic, executePublisher, collectHistoricalInputs } from '../../tools/ci/actions/diagnostic-executor.mjs';
const SHA='a'.repeat(40), BASE='b'.repeat(40);
const descriptor=(workflow,inputs={},extra={})=>buildDiagnosticRequest(workflow,{sha:SHA,inputs,...extra});
const plan=(workflow,inputs={},extra={})=>diagnosticTasks(descriptor(workflow,inputs,extra),{sourceSha:SHA,treeSha:SHA,baseSha:BASE});

test('GPU controls retain all four backends and aggregate errors, optional experiments have separate bounded tasks',()=>{
  const tasks=plan('gpu-census.yml',{relaunch:true,mem_cycles:'16',cam:'chase>cockpit',ls:'apex26.test=1'});
  assert.equal(tasks.length,3);
  const controls=tasks[0].commands;
  assert.equal(controls.filter(c=>c.argv[0]==='tools/gfx/gpu-game-check.mjs').length,4);
  assert.ok(controls.at(-1).argv.includes('tools/gfx/census-verdict.mjs'));
  for(const task of tasks){assert.ok(task.timeoutMinutes<=45);assert.equal(task.timeoutMinutes,4+task.commands.reduce((n,c)=>n+c.timeoutMinutes,0));}
  assert.ok(tasks[1].commands.every(c=>c.argv.includes('--profile')&&c.argv.includes('--port')));
  assert.ok(tasks[2].commands.every(c=>c.argv.includes('16')));
  assert.throws(()=>plan('gpu-census.yml',{images:'self-hosted'}),/image/);
  assert.throws(()=>plan('gpu-census.yml',{ls:'bad=1'}),/localStorage/);
});

test('manual browser groups retain each shard and distinct software stack, with bounded one-worker execution',()=>{
  const tasks=plan('browser-group.yml',{group:'ui',gl:'swiftshader',workers:'8',plan:JSON.stringify({matrix:[{shard:1,total:2},{shard:2,total:2}]})});
  assert.equal(tasks.length,2);assert.equal(tasks[1].commands[0].env.SHARD,'2');
  assert.equal(tasks[0].commands[0].env.WORKERS,'1');assert.equal(tasks[0].environment.renderer,'swiftshader');
  assert.throws(()=>plan('browser-group.yml',{group:'../../oops'}),/group/);
  assert.throws(()=>plan('browser-group.yml',{group:'ui',plan:JSON.stringify({matrix:Array(9).fill({shard:1,total:9})})}),/1..8/);
});

test('capture and packaging plans preserve actual tools, garage views and three-OS manual coverage',()=>{
  const garage=plan('garage-before.yml')[0];assert.ok(garage.commands[0].argv.includes('--views=hero,front,side,rear,top,wingFront,wingRear'));
  assert.ok(garage.commands[1].argv.includes('--manifest'));
  assert.ok(plan('car-shot.yml',{preset:'wing',team:'redbull'})[0].commands[0].argv.includes('--preset=wing'));
  assert.equal(plan('capture-gallery.yml')[0].commands.length,2);
  assert.equal(plan('perf-census-webgpu.yml')[0].commands.length,3);
  assert.equal(plan('lit-wgsl-advisory.yml')[0].baseCheckout,BASE);
  const desktop=plan('desktop.yml');assert.equal(desktop.length,6);
  assert.deepEqual(new Set(desktop.map(t=>t.runner)),new Set(['ubuntu-latest','windows-latest','macos-latest']));
  assert.ok(desktop.every(t=>t.timeoutMinutes<=45));
  assert.equal(plan('repo-size.yml',{top:'30'})[0].fullHistory,true);
});

test('readonly execution keeps failed controls visible, invokes verdict, strips credentials and retains evidence',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'diagnostic-executor-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const desc=descriptor('gpu-census.yml');const calls=[];
  const result=await executeDiagnostic({descriptor:desc,sourceRoot:root,sourceSha:SHA,treeSha:SHA,setup:async()=>({env:{PATH:process.env.PATH},cleanup(){}}),env:{GH_TOKEN:'secret',GITHUB_TOKEN:'secret',NODE_OPTIONS:'--require evil'},run:async(command,argv,options)=>{
    calls.push({command,argv,options});assert.equal(options.env.GH_TOKEN,undefined);assert.equal(options.env.GITHUB_TOKEN,undefined);assert.equal(options.env.NODE_OPTIONS,undefined);
    if(argv[0]==='tools/gfx/gpu-census.mjs')fs.writeFileSync(path.join(root,'census-macos-latest.json'),'{}');
    return {exitCode:argv.includes('game-glx-macos-latest.json')?1:0,stdout:'x'.repeat(2*1024*1024)};
  }});
  assert.ok(JSON.stringify(result).length<32768,'command output remains in job logs, not receipt payload');
  assert.equal(result.complete,false);assert.equal(calls.at(-1).argv[0],'tools/gfx/census-verdict.mjs');
  assert.ok(fs.existsSync(path.join(root,'artifacts/actions/diagnostic',`${desc.request_id}-controls-macos-latest`,'census-macos-latest.json')));
});

test('privileged requests cannot silently complete in the readonly executor',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'diagnostic-publisher-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const result=await executeDiagnostic({descriptor:descriptor('flake-tally.yml'),sourceRoot:root,sourceSha:SHA,treeSha:SHA});
  assert.equal(result.complete,false);assert.equal(result.status,'awaiting-trusted-publisher');
});

test('publisher requires protected checkout identity before any publication and uses fixed argv',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'trusted-publisher-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const calls=[];const run=async(command,argv,options)=>{calls.push({command,argv,options});return{exitCode:0,stdout:command==='git'&&argv[0]==='rev-parse'?SHA+'\n':''};};
  const result=await executePublisher(descriptor('flake-tally.yml',{mode:'base-red'}),{trustedRoot:root,run,env:{GH_TOKEN:'publisher-token',EVIL_SECRET:'hidden'}});
  assert.equal(result.complete,true);assert.ok(calls[1].argv.includes('--base-red'));assert.equal(calls[1].options.env.GH_TOKEN,'publisher-token');assert.equal(calls[1].options.env.EVIL_SECRET,undefined);
  await assert.rejects(executePublisher({...descriptor('flake-tally.yml'),source_sha:BASE},{trustedRoot:root,run}),/protected executor/);
});

import { execFileSync } from 'node:child_process';
import { prepareRelease, verifyRelease, releaseBase } from '../../tools/ci/actions/diagnostic-executor.mjs';
function releaseFixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'actions-release-'));
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.test');
  fs.writeFileSync(path.join(root,'source.txt'),'one');git('add','.');git('commit','-qm','live');const live=git('rev-parse','HEAD');
  fs.writeFileSync(path.join(root,'source.txt'),'two');git('commit','-qam','candidate');
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return {root,live,sourceSha:git('rev-parse','HEAD'),treeSha:git('rev-parse','HEAD^{tree}')};
}
const fakeStage=async dest=>{fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(dest,'index.html'),'exact staged bytes');};

test('admitted release stages exact tested source using trusted code and verifies that same artifact',async t=>{
  const f=releaseFixture(t);let dataRoot;
  const prepared=await prepareRelease({...f,sourceRoot:f.root,trustedRoot:f.root,fetchImpl:async()=>({ok:true,text:async()=>`<meta name="apex-sha" content="${f.live}">`}),stage:async(dest,options)=>{dataRoot=options.root;await fakeStage(dest);},stamp:(dest,options)=>{assert.equal(options.sha,f.sourceSha);assert.equal(options.root,f.root);},buildFor:()=>2002});
  assert.equal(prepared.publish,true);assert.equal(dataRoot,f.root);
  const result=await verifyRelease({sourceRoot:f.root,trustedRoot:f.root,prepared,deploymentResult:'success',poll:async()=>({ok:true,outcome:'match'}),verify:async options=>{assert.equal(options.root,prepared.stagedRoot);assert.equal(fs.readFileSync(path.join(options.root,'index.html'),'utf8'),'exact staged bytes');return{ok:true};}});
  assert.equal(result.complete,true);assert.equal(result.sourceSha,f.sourceSha);
  await assert.rejects(verifyRelease({sourceRoot:f.root,trustedRoot:f.root,prepared,deploymentResult:'failure'}),/did not succeed/);
});

test('unreadable live SHA and source/tree mismatch refuse release before staging',async t=>{
  const f=releaseFixture(t);let staged=false;
  const options={...f,sourceRoot:f.root,trustedRoot:f.root,fetchImpl:async()=>({ok:true,text:async()=>'<html></html>'}),stage:async()=>{staged=true;},stamp(){},buildFor:()=>2002};
  await assert.rejects(prepareRelease(options),/provenance unreadable/);assert.equal(staged,false);
  await assert.rejects(prepareRelease({...options,treeSha:SHA}),/differs/);
});


test('release admission selects the live ancestor, skips already-live and falls back exhaustively on unknown base',async t=>{
  const f=releaseFixture(t);
  const response=live=>async()=>({ok:true,text:async()=>`<meta name="apex-sha" content="${live}">`});
  assert.deepEqual(await releaseBase({sourceRoot:f.root,sourceSha:f.sourceSha,fetchImpl:response(f.live)}),{alreadyLive:false,baseSha:f.live});
  assert.deepEqual(await releaseBase({sourceRoot:f.root,sourceSha:f.sourceSha,fetchImpl:response(f.sourceSha)}),{alreadyLive:true,baseSha:f.sourceSha});
  assert.deepEqual(await releaseBase({sourceRoot:f.root,sourceSha:f.sourceSha,fetchImpl:response(SHA)}),{alreadyLive:false,baseSha:null});
  assert.deepEqual(await releaseBase({sourceRoot:f.root,sourceSha:f.sourceSha,fetchImpl:async()=>{throw new Error('network unavailable');}}),{alreadyLive:false,baseSha:null});
});


test('timing publisher excludes PR samples from mixed worker receipts and requires canonical completion proof',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'publisher-timings-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const calls=[];
  const producer={id:123,run_attempt:1,head_branch:'claude/f1-game-project-26h3ng',path:'.github/workflows/actions-worker.yml',status:'completed',conclusion:'success'};
  const run=async(command,argv)=>{calls.push({command,argv});return{exitCode:0,stdout:command==='git'&&argv[0]==='rev-parse'?SHA+'\n':command==='gh'&&argv[0]==='api'?JSON.stringify(producer):''};};
  const d={...descriptor('spec-timings.yml'),producer_run_id:123};
  const ledger={waves:{'wave-1':{id:'wave-1',owner:{runId:'123',runAttempt:1},status:'completed',tasks:[{requestId:'pr:1',taskId:'browser'}]}},requests:{'pr:1':{kind:'pr',tasks:[{id:'browser',environment:{backend:'llvmpipe',browser:'chromium'}}],results:{browser:{status:'success',complete:true}}}}};
  const result=await executePublisher(d,{trustedRoot:root,run,ledger});
  assert.equal(result.publication.noMeasurements,true);assert.ok(!calls.some(c=>c.command==='gh'&&c.argv[0]==='run'));
  await assert.rejects(executePublisher(d,{trustedRoot:root,run}),/canonical ledger/);
});


test('historical garage reanalysis is a supported node-only task with retained artifact provenance',()=>{
  const legacy=plan('gpu-census.yml',{leg:'garage-reanalysis-367dc'});
  assert.equal(legacy.length,1);assert.equal(legacy[0].runner,'ubuntu-latest');assert.equal(legacy[0].environment.browser,false);
  assert.equal(legacy[0].historicalInputs.runId,39189412012);
  assert.equal(legacy[0].historicalInputs.expectedRequest,'367dc4103ecb14dc5d595dce2bfe813ef884fcaa');
  assert.ok(legacy[0].commands.every(c=>c.trustedEntry));
  const structured=plan('gpu-census.yml',{leg:'garage-reanalysis',source_run_id:'123',source_request_sha:SHA,garage_artifact:'retained-garage',controls_artifact:'retained-controls'});
  assert.equal(structured[0].historicalInputs.runId,123);assert.equal(structured[0].historicalInputs.garageArtifact,'retained-garage');
  assert.throws(()=>plan('gpu-census.yml',{leg:'garage-reanalysis'}),/bounds|request SHA/);
});

test('historical input collection checks archive digests and request SHA before token-free analysis',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'historical-input-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const bytes=Buffer.from('verified fixture archive'),digest='sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');
  const spec={runId:123,expectedRequest:SHA,garageArtifact:'garage',controlsArtifact:'controls'};
  const fetchImpl=async(url,options)=>{
    assert.equal(options.headers.Authorization,'Bearer readonly-token');
    if(url.endsWith('/actions/runs/123'))return new Response(JSON.stringify({id:123,status:'completed',head_sha:BASE,repository:{full_name:'brycejmurrin/f1-game'}}));
    if(url.includes('/artifacts?'))return new Response(JSON.stringify({artifacts:[{id:1,name:'garage',digest,workflow_run:{id:123}},{id:2,name:'controls',digest,workflow_run:{id:123}}]}));
    return new Response(bytes);
  };
  const run=async(command,argv,options)=>{
    assert.equal(command,'python3');assert.equal(options.env.GH_TOKEN,undefined);assert.equal(options.env.GITHUB_TOKEN,undefined);
    const target=argv.at(-1);
    if(target.endsWith('garage')){fs.writeFileSync(path.join(target,'game-garage-retry-ab.json'),JSON.stringify({schema:'garage-retry-ab/v1',request:SHA}));fs.writeFileSync(path.join(target,'analysis.json'),'{}');fs.writeFileSync(path.join(target,'report.md'),'original');}
    else fs.writeFileSync(path.join(target,'census-macos-latest.json'),'{}');
    return{exitCode:0};
  };
  const receipt=await collectHistoricalInputs(spec,{sourceRoot:root,env:{GH_TOKEN:'readonly-token'},fetchImpl,run});
  assert.equal(receipt.artifacts.length,2);assert.equal(fs.readFileSync(path.join(root,'artifacts/actions/diagnostic/historical/garage/report.original.md'),'utf8'),'original');
  const other=fs.mkdtempSync(path.join(os.tmpdir(),'historical-bad-'));t.after(()=>fs.rmSync(other,{recursive:true,force:true}));
  await assert.rejects(collectHistoricalInputs(spec,{sourceRoot:other,env:{GH_TOKEN:'readonly-token'},run,fetchImpl:async(url,options)=>url.endsWith('/zip')?new Response('tampered'):fetchImpl(url,options)}),/digest mismatch/);
});
