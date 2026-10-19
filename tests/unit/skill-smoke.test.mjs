import test from 'node:test';
import assert from 'node:assert/strict';
import {parseArgs,loadRecipes,validateCatalog,planRecipe,checkRecipe,runRecipes} from '../../tools/check/skill-smoke.mjs';
test('smoke catalog has a nonempty bounded recipe for every canonical skill',()=>{const recipes=loadRecipes();assert.equal(new Set(recipes.map(r=>r.skill)).size,recipes.length);for(const r of recipes){assert.ok(r.pattern);assert.ok(r.expected.minPass>0);}});
test('smoke rejects unknown flags, missing names and contradictory modes',()=>{for(const argv of [['--oops'],['--skill','--plan'],['--skill','agent-view','--all','--check'],['--all','--check','--plan']])assert.throws(()=>parseArgs(argv));assert.equal(parseArgs(['--all','--plan']).mode,'plan');});
test('smoke plans preserve unverified followups without executing or claiming a pass',()=>{const p=planRecipe(loadRecipes()[0]);assert.equal(p.performed,false);assert.equal(p.status,'planned');assert.ok(p.followups.every(f=>f.status==='unverified'));});
test('smoke rejects duplicate and empty fixture selections',()=>{const rows=loadRecipes();assert.throws(()=>validateCatalog({schemaVersion:1,recipes:[...rows,rows[0]]}),/Duplicate/);assert.throws(()=>validateCatalog({schemaVersion:1,recipes:rows.map((r,i)=>i? r:{...r,pattern:''})}),/empty selection/);});
test('smoke detects non-vacuity, failing subprocesses and timeouts',async()=>{const r=loadRecipes()[0];let calls=0;const empty=await checkRecipe(r,undefined,async()=>{calls++;return {stdout:'# pass 0\n# fail 0\n'};});assert.equal(empty.status,'failed');const failed=await checkRecipe(r,undefined,async()=>{throw {message:'exit 1',stdout:'# pass 1\n# fail 1\n'};});assert.equal(failed.status,'failed');const timed=await checkRecipe(r,undefined,async()=>{throw {killed:true};});assert.equal(timed.failure,'timeout');assert.equal(calls,1);});
test('smoke executes a real bounded AgentView contract and retains its scope',async()=>{const result=await checkRecipe(loadRecipes().find(r=>r.skill==='agent-view'));assert.equal(result.status,'offline_pass',JSON.stringify(result));assert.ok(result.counts.pass>0);assert.ok(result.followups.every(f=>f.status==='unverified'));});

test('smoke progress tracks recipe transitions and failures without claiming unfinished work',async()=>{
  const recipes=loadRecipes().slice(0,2),events=[];let tick=0;
  const results=await runRecipes(recipes,'check',{progress:e=>events.push(e),now:()=>tick++,check:async r=>({skill:r.skill,status:r===recipes[0]?'failed':'offline_pass'})});
  assert.equal(results.length,2);
  assert.deepEqual(events.map(e=>e.phase),['started','checking','recipe_completed','checking','recipe_completed','failed']);
  assert.deepEqual(events.map(e=>e.completed),[0,0,1,1,2,2]);
  assert.deepEqual(events.map(e=>e.failed),[0,0,1,1,1,1]);
  assert.ok(events.every(e=>e.total===2));
  assert.ok(events.every((e,i)=>!i||e.elapsedMs>=events[i-1].elapsedMs));
});
test('smoke progress CLI keeps stdout as one complete JSON and stderr opt-in',async()=>{
  const {spawnSync}=await import('node:child_process');
  for(const progress of [false,true]){
    const r=spawnSync(process.execPath,['tools/check/skill-smoke.mjs','--skill','agent-view','--plan',...(progress?['--progress']:[])],{encoding:'utf8'});
    assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).results[0].status,'planned');
    const events=r.stderr.trim()?r.stderr.trim().split('\n').map(line=>JSON.parse(line)):[];
    assert.equal(events.length,progress?4:0);
    if(progress)assert.equal(events.at(-1).phase,'completed');
  }
});
