import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import path from 'node:path';
import {compare, summarize, main} from '../../plugins/f1-dev-tools/skills/f1-dev-tools/scripts/compare.mjs';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../..');
const {createGame} = require(root + '/tools/lib/game-vm.cjs');
const source = fs.readFileSync(root + '/plugins/f1-dev-tools/skills/f1-dev-tools/scripts/browser.js','utf8');
const plain = value => JSON.parse(JSON.stringify(value));

test('real game API: capture/restore, raw preset inheritance, invalid inputs and failure cleanup', async () => {
  const g = await createGame({track:'monza', carMeshes:false});
  try {
    vm.runInContext(source, g.ctx);
    vm.runInContext('__apex.agentHelp()',g.ctx);
    g.apex.go(); g.apex.jump(0.2,60,0);
    const dev = g.ctx.F1Dev;
    const inspection = dev.inspect();
    assert.equal(inspection.info.track,'monza');
    const diagnostic = dev.diagnose();
    assert.equal(diagnostic.schema,'f1-dev-diagnostic/v1');
    assert.equal(diagnostic.inspection.info.track,'monza');
    assert.ok(diagnostic.manifest && typeof diagnostic.manifest === 'object');
    assert.ok(['visible','hidden',null].includes(diagnostic.page.visibility));
    const originalDiag=g.apex.diag,originalTimer=g.apex.gpuTimer;
    g.apex.diag=()=>({env:{backend:'webgl2',backendState:{api:'webgl2'},renderScale:0.5},gl:{renderer:'ANGLE (Google, Vulkan SwiftShader Device)'},perf:{tier:4}});
    g.apex.gpuTimer=()=>({software:false});
    assert.equal(dev.inspect().renderer.software,true,'device identifies SwiftShader even if backend software flag is false');
    g.apex.diag=originalDiag;g.apex.gpuTimer=originalTimer;
    const scene = plain(dev.capture());
    const baseline = JSON.stringify(g.apex.repro());
    const savedBeforeInvalid = vm.runInContext('JSON.stringify(CamTune.exportPack()) + localStorage.getItem("apex26.camTune")',g.ctx);
    for (const corrupt of [
      b => { b.cars[0].x = null; }, b => { delete b.cars[0].speed; },
      b => { b.cars[0].prog = '12'; }, b => { b.cars.push({...b.cars[0]}); },
      b => { b.cars.forEach(c => {c.me=false;}); }, b => { b.cars.find(c=>c.me).team='wrong'; },
      b => { b.cam.mode='missing'; }, b => { b.cam.tune.height=1e8; },
      b => { b.cam.tune.unknown=1; },
    ]) {
      const malformed=structuredClone(scene);corrupt(malformed.repro);
      await assert.rejects(dev.restore(JSON.parse(JSON.stringify(malformed))),/Invalid scene/);
      assert.equal(JSON.stringify(g.apex.repro()),baseline,'invalid JSON must not partly apply a scene');
      assert.equal(vm.runInContext('JSON.stringify(CamTune.exportPack()) + localStorage.getItem("apex26.camTune")',g.ctx),savedBeforeInvalid);
    }
    g.apex.jump(0.5,10,1);
    const restored = await dev.restore(scene);
    assert.equal(restored.result.restored,true);
    assert.equal(restored.result.skipped,0);
    assert.equal(dev.capture().repro.cars.find(c=>c.me).s,scene.repro.cars.find(c=>c.me).s);
    const wrong = structuredClone(scene); wrong.repro.teamIdx = 100000;
    await assert.rejects(dev.restore(wrong),/Team\/halo differ/);
    vm.runInContext('CamTune.setGlobal("height", 0.4); CamTune.set("chase","dist",2); CamTune.comfortSet("bob",0.5)',g.ctx);
    const saved = vm.runInContext('JSON.stringify(CamTune.exportPack())',g.ctx);
    const storage = vm.runInContext('localStorage.getItem("apex26.camTune")',g.ctx);
    const mode = g.apex.camera().mode;
    const preview = dev.previewPreset('chase',{height:0.6,fov:-4});
    assert.equal(preview.preset.modes.chase.height,0.6);
    assert.ok(preview.preview.eye.every(Number.isFinite));
    assert.equal(vm.runInContext('JSON.stringify(CamTune.exportPack())',g.ctx),saved);
    assert.equal(vm.runInContext('localStorage.getItem("apex26.camTune")',g.ctx),storage);
    assert.equal(g.apex.camera().mode,mode);
    assert.equal(g.apex.viewState().dbgCamActive,false);
    assert.throws(()=>dev.previewPreset('chase',{height:1e8}),/Invalid tuner value/);
    assert.equal(vm.runInContext('JSON.stringify(CamTune.exportPack())',g.ctx),saved);
    assert.throws(()=>dev.previewPreset('missing',{height:0}),/Unknown camera/);
    g.apex.view({eye:[10,20,30],target:[0,0,0],fov:60});
    assert.throws(()=>dev.previewPreset('chase',{height:0.7}),/Exit sky\/free\/debug/);
    assert.equal(g.apex.camState().debug,true);
    g.apex.view('chase');
    await assert.rejects(dev.replayCheck([{seek:20}]),/Start Data Hub WATCH/);
    await assert.rejects(dev.trace({frames:1}),/frames/);
    // Throw inside the real preview solver call and prove finally restores the entire raw pack.
    vm.runInContext('globalThis.originalPreview = __apex.previewCam; __apex.previewCam = () => { throw new Error("forced preview failure") }',g.ctx);
    assert.throws(()=>dev.previewPreset('chase',{height:0.7}),/forced preview failure/);
    assert.equal(vm.runInContext('JSON.stringify(CamTune.exportPack())',g.ctx),saved);
    vm.runInContext('__apex.previewCam = originalPreview',g.ctx);
  } finally {g.close();}
});

test('production WATCH API: batch validation is atomic and timeout restores replay state', async()=>{
  const g=await createGame({track:'baku',carMeshes:false});
  try {
    vm.runInContext(source,g.ctx);
    vm.runInContext(fs.readFileSync(root+'/js/data/real-race-tab.js','utf8'),g.ctx);
    const fixture=JSON.parse(fs.readFileSync(root+'/tests/fixtures/openf1-baku-2026-race.json','utf8'));
    g.ctx.fixture=fixture;
    vm.runInContext(`{
      const script=DataRealRace.build(fixture,name=>Teams.LIST.find(t=>t.name===name)||null,Tracks.LIST);
      const line=(p,v,x)=>{const t=[],prog=[],xs=[];for(let tt=-5;tt<=120;tt+=0.5){t.push(tt);prog.push(tt<0?p:p+v*tt);xs.push(x);}return {t,prog,x:xs};};
      RealRace.launch(script,{seat:'LEC',watch:true,camera:'chase',traces:{frame:'track',cars:{63:line(-14,50,0),16:line(-22,48,1)}},startLap:1});
    }`,g.ctx);
    await g.settle(()=>g.G.state==='count',8000);g.step(2);g.apex.go();
    const r=vm.runInContext('RealRace.replay()',g.ctx), initial=plain(r.status());
    await assert.rejects(g.ctx.F1Dev.replayCheck([{seek:20},{follow:'NO_SUCH_DRIVER'}]),/Invalid replay action/);
    assert.equal(r.status().T,initial.T);
    const beforeUnsafe=JSON.stringify(r.status());
    await assert.rejects(g.ctx.F1Dev.replayCheck([{pause:true},{seek:initial.duration-0.5},{pause:false}],{frames:2,timeoutMs:100}),/budget could reach the finish/);
    assert.equal(JSON.stringify(r.status()),beforeUnsafe,'whole unsafe batch rejected before pause or seek');
    assert.equal(g.G.state,'race');
    const unavailable=r.describe().drivers.find(d=>d.code!==initial.follow);
    const unavailableCar=g.G.cars.find(c=>c.code===unavailable.code);
    unavailableCar.retired=true;
    assert.equal(r.describe().drivers.find(d=>d.code===unavailable.code).available,false);
    await assert.rejects(g.ctx.F1Dev.replayCheck([{follow:unavailable.code}],{frames:2,timeoutMs:100}),/driver is unavailable/);
    assert.equal(r.status().follow,initial.follow);
    // The production seek re-poses cars; use its live availability after cleanup.
    const other=r.describe().drivers.find(d=>d.code!==initial.follow && d.available);
    assert.ok(other);
    const nativeFollow=r.follow;
    r.follow=()=>null;
    try {
      await assert.rejects(g.ctx.F1Dev.replayCheck([{follow:other.code}],{frames:2,timeoutMs:100}),/follow did not select/);
    } finally {r.follow=nativeFollow;}
    // Deliberately provide NO render frames. The tool must reject this VM as motion evidence.
    const hostTimers=new Set();
    g.ctx.setTimeout=(fn,ms,...args)=>{const timer=setTimeout(()=>{hostTimers.delete(timer);fn(...args);},ms);hostTimers.add(timer);return timer;};
    g.ctx.clearTimeout=timer=>{hostTimers.delete(timer);clearTimeout(timer);};
    g.ctx.requestAnimationFrame=()=>1;g.ctx.cancelAnimationFrame=()=>{};
    try {
      await assert.rejects(g.ctx.F1Dev.replayCheck([{seek:20}],{frames:2,timeoutMs:100}),/Trace timed out/);
    } finally {for(const timer of hostTimers)clearTimeout(timer);}
    const restored=r.status();
    for(const key of ['T','follow','speed','paused'])assert.equal(restored[key],initial[key],key);
  }finally{g.close();}
});

function trace({track='monza', step=1}={}) {
  return {schema:'f1-dev-trace/v1',label:'test',before:{info:{track},viewport:{width:1280,height:720},camera:{mode:'chase'},renderer:{backend:'three',software:true},reducedMotion:false},
    samples:[0,1,2].map(i=>({wallTime:10+i*16,damping:{renderFrame:i,eye:[i*step,0,0],target:[i,0,1],fov:60}}))};
}
test('comparison detects mismatches, rejects non-rendering and non-finite traces',()=>{
  const same = compare(trace(),trace({step:2}));
  assert.equal(same.comparable,true);assert.equal(same.delta.maxEyeStep,1);
  assert.deepEqual(compare(trace(),trace({track:'baku'})).mismatches,['track']);
  const unknown=trace();unknown.before.renderer={unavailable:'unsupported'};
  assert.equal(compare(unknown,unknown).comparable,false);
  const invalid=trace();invalid.samples[1].damping.eye[0]=NaN;
  assert.throws(()=>summarize(invalid),/invalid camera/);
  const repeated=trace();repeated.samples[1].damping.renderFrame=0;
  assert.throws(()=>summarize(repeated),/advancing render frames/);
  assert.throws(()=>main(['compare','a','b','--out','/workspace/escape.json']),/artifacts/);
});
