// Measurement-only. Product files must match the pinned deploy SHA.
// APIs: MDN GPUQueue.writeBuffer; chromedevtools.github.io/devtools-protocol/tot/{Profiler,HeapProfiler}/
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { startStaticServer, launchChromium, shutdown, chromiumLaunchInfo } from '../tools/lib/harness.mjs';
import { installProbeInit, gotoGame } from '../tools/shot/probe-page.mjs';
import { installGarageGpuAllocationProbe } from './garage-webgpu-allocation-init.mjs';
import { installRenderSubmitMetrics } from './render-submit-metrics.mjs';
const deploy='e48b3e9038e38126c105c64ac1e59f4bc36f28f7';
const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim();
try{git('cat-file','-e',deploy+'^{commit}');}catch{execFileSync('git',['fetch','--depth=1','origin',deploy],{stdio:'inherit'});}
if(git('diff',deploy,'HEAD','--','js','css','vendor','assets','index.html','tools/lib/harness.mjs','tools/shot/probe-page.mjs')) throw Error('product differs from deploy');
const report={schema:'deploy-three-webgpu-profile/v1',deploy,requestCommit:git('rev-parse','HEAD'),viewport:{width:844,height:390},deviceScaleFactor:1,reducedMotion:true,runs:[],started:new Date().toISOString()};
const save=()=>writeFileSync('game-deploy-webgpu-profile.json',JSON.stringify(report,null,2));
const log=x=>console.log(new Date().toISOString(),x);
function installBench(){
 const A=__apex,R=renderer; __renderSubmitMetrics.attach(R);
 const b=window.__deployBench={on:false,done:false};
 const oldWrite=GPUQueue.prototype.writeBuffer;
 GPUQueue.prototype.writeBuffer=function(buffer,offset,data,dataOffset=0,size){const result=oldWrite.apply(this,arguments);if(b.on){const unit=ArrayBuffer.isView(data)?data.BYTES_PER_ELEMENT||1:1;b.writes++;b.writeBytes+=size===undefined?data.byteLength-dataOffset*unit:size*unit;}return result;};
 const begin=GLX.begin,present=GLX.present,render=R.render,draw=GarageScene.draw;
 GLX.begin=function(){if(b.on)b.begin=performance.now();return begin.apply(this,arguments);};
 GarageScene.draw=function(){if(!b.on)return draw.apply(this,arguments);const t=performance.now();try{return draw.apply(this,arguments);}finally{b.garageMs.push(performance.now()-t);}};
 R.render=function(scene){const target=this.getRenderTarget(),main=target?.texture?.name==='output'||!target&&scene?.isScene===true;const result=render.apply(this,arguments);if(b.on&&main){const t=performance.now();if(b.last!==null)b.intervals.push(t-b.last);b.last=t;b.main++;if(b.main>=b.limit||b.duration&&t-b.start>=b.duration)b.pending=true;}return result;};
 GLX.present=function(){try{return present.apply(this,arguments);}finally{if(b.on){if(b.begin!==null)b.buildPresentMs.push(performance.now()-b.begin);b.begin=null;if(b.pending){b.on=false;b.done=true;b.elapsedMs=performance.now()-b.start;b.render=__renderSubmitMetrics.stop();A.headless(true);}}}};
 b.startWindow=(limit,duration=0)=>{A.headless(true);Object.assign(b,{on:true,done:false,pending:false,main:0,limit,duration,start:performance.now(),last:null,begin:null,intervals:[],buildPresentMs:[],garageMs:[],writes:0,writeBytes:0,render:null});__renderSubmitMetrics.start();A.headless(false);};
}
try{
 const server=await startStaticServer(process.cwd());
 const browser=await launchChromium({executablePath:chromium.executablePath(),args:['--enable-unsafe-webgpu','--enable-precise-memory-info','--disable-background-timer-throttling']});
 report.browser=chromiumLaunchInfo(browser);report.browserVersion=browser.version();save();
 for(let rep=1;rep<=3;rep++){
  const row={rep,pageErrors:[],consoleErrors:[],consoleWarnings:[],edits:[],scenarios:[]};report.runs.push(row);save();log('rep '+rep+' garage boot');
  const ctx=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1,reducedMotion:'reduce'});
  try{
   const page=await ctx.newPage();page.on('pageerror',e=>row.pageErrors.push(String(e)));page.on('console',m=>{if(m.type()==='error')row.consoleErrors.push(m.text());if(m.type()==='warning')row.consoleWarnings.push(m.text());});
   await installProbeInit(page,{backend:'three',team:2,tlxForceGL:false});
   await page.addInitScript(()=>{window.__TEST_MODE=true;localStorage.setItem('apex26.tlxForceGL','0');localStorage.setItem('apex26.wgxCapture','0');sessionStorage.setItem('apex26.wgxCapture','0');localStorage.setItem('apex26.gfxBootStepMs','45000');});
   await page.addInitScript(installGarageGpuAllocationProbe);
   await gotoGame(page,server.url+'?three-devtools=1',120000);
   row.adapter=await page.evaluate(async()=>{const a=await navigator.gpu.requestAdapter();return {vendor:a.info.vendor,architecture:a.info.architecture,device:a.info.device,features:[...a.features]};});
   if(row.adapter.vendor!=='apple')throw Error('expected native Apple adapter');
   await page.evaluate(()=>{__apex.agentHelp();__apex.govHold(true);__apex.renderScale(1);__apex.headless(true);});
   await page.locator('#mb-race').click();await page.locator('#select').waitFor({state:'visible'});await page.locator('#sel-car').click();
   await page.waitForFunction(()=>!document.querySelector('#carsetup').hasAttribute('aria-busy')&&document.querySelector('#cs-tabs [data-cs-cat="livery"]'),null,{polling:100,timeout:90000});
   await page.evaluate(()=>{__apex.headless(true);document.querySelector('#cs-tabs [data-cs-cat="livery"]').click();});
   await page.waitForSelector('.cs-liv-create');await page.evaluate(()=>document.querySelector('.cs-liv-create').click());await page.waitForSelector('input[data-liv-field="c2"]');
   await page.evaluate(installRenderSubmitMetrics);await page.evaluate(installBench);
   const cdp=await ctx.newCDPSession(page);await cdp.send('HeapProfiler.enable');await cdp.send('Profiler.enable');
   const windowFrames=async(n,duration=0)=>{await page.evaluate(({n,duration})=>__deployBench.startWindow(n,duration),{n,duration});await page.waitForFunction(()=>__deployBench.done,null,{polling:100,timeout:60000});await page.evaluate(async()=>{await renderer.backend.device.queue.onSubmittedWorkDone();});return page.evaluate(()=>{const b=__deployBench;return {mainRenders:b.main,elapsedMs:b.elapsedMs,intervalsMs:b.intervals,buildPresentMs:b.buildPresentMs,garageDrawMs:b.garageMs,nativeWrites:b.writes,nativeWriteBytes:b.writeBytes,render:b.render};});};
   const state=()=>page.evaluate(()=>({backend:__apex.diag({download:false}).env.backendState,isWebGPUBackend:renderer.backend.isWebGPUBackend,view:__apex.viewState(),quality:__apex.govHold(),scale:__apex.renderScale(),clock:__apex.renderClock(),light:__apex.lightState(),gpuErrors:GLX.gpuErrors(),gpuTimer:__apex.gpuTimer(),allocation:__garageGpuAlloc.read(),memory:JSON.parse(JSON.stringify(renderer.info.memory)),renderObjects:renderer._objects?._renderObjects?.size,tlxMemory:GLX.__tlx?.memState?.(),mesh:GLX.__tlx?.meshState?.(),coalescing:GLX.__tlx?.coState?.(),garage:GarageScene.debug(),flaps:CarMesh.flapState?.(),mirror:__apex.mirror?.(),physics:__apex.physState()}));
   const snap=async label=>{await page.evaluate(async()=>{await renderer.backend.device.queue.onSubmittedWorkDone();});await cdp.send('HeapProfiler.collectGarbage');await cdp.send('HeapProfiler.collectGarbage');const heap=await cdp.send('Runtime.getHeapUsage');const s=await state();if(!s.isWebGPUBackend||s.backend.api!=='webgpu'||s.backend.forceWebGL||s.backend.softAdapter||s.backend.softBlit||s.gpuErrors)throw Error('invalid native path/errors at '+label);return {label,heap,...s};};
   const shot=async label=>{await page.evaluate(()=>__apex.headless(false));await page.screenshot({path:`game-deploy-${rep}-${label}.png`,timeout:60000});await page.evaluate(()=>__apex.headless(true));};
   const profiled=async label=>{await cdp.send('Profiler.start');const metrics=await windowFrames(120);const p=await cdp.send('Profiler.stop');writeFileSync(`game-deploy-${rep}-${label}.cpuprofile`,JSON.stringify(p.profile));return metrics;};
   let color=0;const edit=async()=>{const dispatchMs=await page.evaluate(i=>{const el=document.querySelector('input[data-liv-field="c2"]'),t=performance.now();el.value='#'+(0x204060+i*0x030507).toString(16).slice(-6);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return performance.now()-t;},color++);return {dispatchMs,...await windowFrames(1),applied:await page.evaluate(()=>({value:document.querySelector('input[data-liv-field="c2"]').value,garage:GarageScene.debug()}))};};
   for(let i=0;i<5;i++)await edit();await windowFrames(60);row.garageWarm=await snap('garage-warm');
   row.garageIdleBefore=await windowFrames(180);row.garageIdleBeforeState=await snap('garage-idle-before');
   for(let i=0;i<30;i++){row.edits.push(await edit());if((i+1)%10===0){row['after'+(i+1)]=await snap('garage-after-'+(i+1));save();log('rep '+rep+' garage edits '+(i+1));}}
   row.garageLiveCleanup=await windowFrames(100000,26000);row.garagePostIdle=await snap('garage-post-26s-live');row.garageCleanupEdit=await edit();row.garagePostCleanup=await snap('garage-post-idle-and-edit');
   row.garageIdleAfter=await windowFrames(180);row.garageFinal=await snap('garage-final');await shot('garage');
   row.garageCpuProfile=await profiled('garage');save();
   const scenarios=[{id:'montreal-day',track:'montreal',tod:'day',weather:'dry',clock:12,modes:['chase','helmet']},{id:'vegas-night',track:'vegas',tod:'night',weather:'dry',clock:0,modes:['chase','helmet']},{id:'montreal-wet',track:'montreal',tod:'day',weather:'rain',clock:12,modes:['helmet']}];
   for(const scene of scenarios){
    log('rep '+rep+' build '+scene.id);
    const buildMs=await page.evaluate(async s=>{__apex.headless(true);await Assets.loadModels();__apex.seed(42);const t=performance.now();await __apex.race(s.track,s.tod,s.weather);const ms=performance.now()-t;__apex.go();__apex.freeze(true);__apex.govHold(true);__apex.renderScale(1);__apex.renderClock(s.clock,true);__apex.jump(.1,0,0);__apex.snapCam();__apex.gpuTimer(true);return ms;},scene);
    for(const mode of scene.modes){
     const s={id:scene.id,track:scene.track,tod:scene.tod,weather:scene.weather,mode,buildMs};row.scenarios.push(s);save();
     await page.evaluate(mode=>{__apex.freeze(true);__apex.jump(.1,0,0);__apex.camera(mode);__apex.snapCam();},mode);
     await windowFrames(60);s.before=await snap(scene.id+'-'+mode+'-before');s.fixed=await windowFrames(180);s.after=await snap(scene.id+'-'+mode+'-after');
     await shot(scene.id+'-'+mode);s.profiled=await profiled(scene.id+'-'+mode);
     await page.evaluate(()=>{__apex.freeze(false);__apex.setInput({throttle:false,brake:false,steer:0});});
     await windowFrames(30);s.liveBefore=await snap(scene.id+'-'+mode+'-live-before');s.live=await windowFrames(240);s.liveAfter=await snap(scene.id+'-'+mode+'-live-after');
     if(s.fixed.mainRenders!==180||s.live.mainRenders!==240||s.before.view.camMode!==mode||s.before.scale.scale!==1)throw Error('wrong measured scenario');save();log('rep '+rep+' done '+scene.id+' '+mode);
    }
   }
   row.final=await snap('end-of-run');row.ok=!row.pageErrors.length&&!row.consoleErrors.length;save();if(!row.ok)throw Error('runtime errors in repetition '+rep);
  }finally{await ctx.close();}
 }
 report.ok=report.runs.length===3&&report.runs.every(r=>r.ok);report.finished=new Date().toISOString();save();
}catch(e){report.ok=false;report.error=String(e.stack||e);save();log(report.error);process.exitCode=1;}finally{await shutdown();log('finished '+report.ok);}
