import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {launchChromium,startStaticServer,shutdown,WEBGPU_LAVAPE_CHROMIUM_ARGS} from '../tools/lib/harness.mjs';
import {installProbeInit,gotoGame} from '../tools/shot/probe-page.mjs';
import {installGarageGpuAllocationProbe} from './garage-webgpu-allocation-init.mjs';
import {installRenderSubmitMetrics} from './render-submit-metrics.mjs';
const argv=process.argv.slice(2),opt=(k,d)=>{const i=argv.indexOf(k);return i<0?d:argv[i+1];};
const root=process.cwd(),hardware=argv.includes('--hardware'),base=opt('--base','758646374fcb357c9873cf36a0255d666e3f626e');
const pairs=Number(opt('--pairs','3')),raceFrames=Number(opt('--race-frames','120')),out=resolve(opt('--out','artifacts/experiments/render-cleanup'));
mkdirSync(out,{recursive:true});
const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8'}).trim();
try{git('cat-file','-e',base+':js/garage/scene.js');}catch{execFileSync('git',['fetch','--depth=1','origin',base],{cwd:root,stdio:'inherit'});}
const changed=git('diff','--name-only',base,'HEAD','--','js').split('\n').filter(Boolean);
const bodies={baseline:new Map(),candidate:new Map()};
for(const path of changed){bodies.baseline.set('/'+path,execFileSync('git',['show',base+':'+path],{cwd:root,encoding:'utf8'}));bodies.candidate.set('/'+path,readFileSync(root+'/'+path,'utf8'));}
const report={schema:'three-webgpu-cleanup-ab/v1',base,candidate:git('rev-parse','HEAD'),hardwareRequested:hardware,pairs,raceFrames,viewport:{width:640,height:360},changedSources:changed,sourceDigests:Object.fromEntries(Object.entries(bodies).map(([k,m])=>[k,Object.fromEntries([...m].map(([p,s])=>[p,createHash('sha256').update(s).digest('hex')]))])),arms:[],started:new Date().toISOString()};
const file=out+'/game-render-cleanup-ab.json',save=()=>writeFileSync(file,JSON.stringify(report,null,2)),log=s=>process.stdout.write(new Date().toISOString()+' '+s+'\n');
function installBench(){
 const A=__apex,R=window.renderer;__renderSubmitMetrics.attach(R);
 const bench=window.__cleanupBench={on:false,done:false,limit:0,main:0,drawMs:[],frameMs:[],metrics:null,seen:[]};
 const originalBegin=GLX.begin,originalPresent=GLX.present;
 GLX.begin=function(){bench.beginWasOn=bench.on;bench.beginTime=performance.now();return originalBegin.apply(this,arguments);};
 GLX.present=function(){try{return originalPresent.apply(this,arguments);}finally{if(bench.beginWasOn){bench.frameMs.push(performance.now()-bench.beginTime);bench.beginWasOn=false;}}};
 const originalDraw=GarageScene.draw;
 GarageScene.draw=function(){if(!bench.on)return originalDraw.apply(this,arguments);const t=performance.now();try{return originalDraw.apply(this,arguments);}finally{bench.drawMs.push(performance.now()-t);}};
 const originalRender=R.render;
 R.render=function(scene){const target=this.getRenderTarget(),main=target?.texture?.name==='output'||!target&&scene?.isScene===true;if(bench.on&&bench.seen.length<8)bench.seen.push({target:target?.texture?.name||null,sceneType:scene?.type,isScene:!!scene?.isScene,main});const result=originalRender.apply(this,arguments);if(bench.on&&main&&++bench.main>=bench.limit){A.headless(true);bench.on=false;bench.done=true;bench.metrics=__renderSubmitMetrics.stop();}return result;};
 bench.start=n=>{A.headless(true);bench.done=false;bench.on=true;bench.limit=n;bench.main=0;bench.drawMs=[];bench.frameMs=[];bench.metrics=null;__renderSubmitMetrics.start();A.headless(false);};
}
let browser;
try{
 const srv=await startStaticServer(root),icd=root+'/scratch/vulkan-runtime/lvp-local.json';
 browser=await launchChromium({args:hardware?['--enable-unsafe-webgpu','--enable-precise-memory-info','--disable-background-timer-throttling']:[...WEBGPU_LAVAPE_CHROMIUM_ARGS,'--headless=new','--enable-precise-memory-info'],...(!hardware?{env:{...process.env,VK_ICD_FILENAMES:icd,VK_DRIVER_FILES:icd}}:{})});
 for(let pair=0;pair<pairs;pair++)for(const arm of(pair%2?['candidate','baseline']:['baseline','candidate'])){
  const row={pair:pair+1,arm,edits:[],pageErrors:[],consoleErrors:[]};report.arms.push(row);save();log('start pair '+row.pair+' '+arm);
  const ctx=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1,reducedMotion:'reduce'});
  await ctx.route('**/js/**',route=>{const body=bodies[arm].get(new URL(route.request().url()).pathname);return body===undefined?route.continue():route.fulfill({status:200,contentType:'application/javascript',body});});
  const page=await ctx.newPage();page.on('pageerror',e=>row.pageErrors.push(String(e)));page.on('console',m=>{if(m.type()==='error')row.consoleErrors.push(m.text());});
  try{
   await installProbeInit(page,{backend:'three',team:2,tlxForceGL:false});
   await page.addInitScript(()=>{window.__TEST_MODE=true;localStorage.setItem('apex26.tlxForceGL','0');localStorage.setItem('apex26.wgxCapture','0');sessionStorage.setItem('apex26.wgxCapture','0');localStorage.setItem('apex26.tlxForceHw','batches');localStorage.setItem('apex26.gfxBootStepMs','45000');});
   await page.addInitScript(installGarageGpuAllocationProbe);
   await gotoGame(page,srv.url+'?three-devtools=1',120000);row.adapter=await page.evaluate(async()=>{const a=await navigator.gpu.requestAdapter();return a?{vendor:a.info.vendor,architecture:a.info.architecture,device:a.info.device,description:a.info.description,isFallbackAdapter:a.isFallbackAdapter}:null;});if(hardware&&row.adapter?.vendor!=='apple')throw Error('expected Apple hardware adapter');await page.evaluate(()=>{__apex.agentHelp();__apex.govHold(true);__apex.renderScale(1);});
   await page.locator('#mb-race').click();await page.locator('#select').waitFor({state:'visible'});await page.locator('#sel-car').click();
   await page.waitForFunction(()=>!document.querySelector('#carsetup').hasAttribute('aria-busy')&&document.querySelector('#cs-tabs [data-cs-cat="livery"]'),null,{polling:100,timeout:90000});
   await page.evaluate(()=>{__apex.headless(true);document.querySelector('#cs-tabs [data-cs-cat="livery"]').click();});
   await page.waitForSelector('.cs-liv-create');await page.evaluate(()=>document.querySelector('.cs-liv-create').click());await page.waitForSelector('input[data-liv-field="c2"]');
   await page.evaluate(installRenderSubmitMetrics);await page.evaluate(installBench);
   const cdp=await ctx.newCDPSession(page);await cdp.send('HeapProfiler.enable');
   const windowFrames=async n=>{await page.evaluate(n=>__cleanupBench.start(n),n);try{await page.waitForFunction(()=>__cleanupBench.done,null,{polling:100,timeout:45000});}catch(e){row.frameDiagnostic=await page.evaluate(()=>({main:__cleanupBench.main,seen:__cleanupBench.seen,headless:__apex.headless(),info:__apex.info(),errors:GLX.gpuErrors(),stats:__renderSubmitMetrics.stop()}));save();throw e;}await page.evaluate(async()=>{await renderer.backend.device.queue.onSubmittedWorkDone();});return page.evaluate(()=>({render:__cleanupBench.metrics,garageDrawMs:__cleanupBench.drawMs,mainBuildPresentMs:__cleanupBench.frameMs}));};
   let colorIndex=0;
   const edit=async()=>{const i=colorIndex++;const dispatchMs=await page.evaluate(i=>{const input=document.querySelector('input[data-liv-field="c2"]'),t=performance.now();input.value='#'+(0x204060+i*0x0b0503).toString(16).slice(-6);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return performance.now()-t;},i);return{dispatchMs,...await windowFrames(1)};};
   const idle=()=>page.evaluate(()=>new Promise(r=>setTimeout(r,2700)));
   const snap=async label=>{await page.evaluate(async()=>{await renderer.backend.device.queue.onSubmittedWorkDone();});await cdp.send('HeapProfiler.collectGarbage');await page.evaluate(()=>new Promise(r=>setTimeout(r,0)));await cdp.send('HeapProfiler.collectGarbage');const heap=await cdp.send('Runtime.getHeapUsage');const state=await page.evaluate(()=>{const env=__apex.diag({download:false}).env;return{allocation:__garageGpuAlloc.read(),rendererMemory:renderer.info.memory,renderObjects:renderer._objects?._renderObjects?.size,co:GLX.__tlx?.coState?.(),backend:env.backendState,renderScale:__apex.renderScale(),view:__apex.viewState(),lightState:__apex.lightState(),quality:__apex.govHold(),renderClock:__apex.renderClock(),lightTune:__apex.lightTune(),camera:__apex.camState(),gpuErrors:GLX.gpuErrors()};});if(state.backend.api!=='webgpu'||state.backend.forceWebGL||state.gpuErrors)throw Error('invalid renderer/errors at '+label);return{label,heap,...state};};
   for(let i=0;i<3;i++)await edit();await idle();await edit();row.warm=await snap('garage-warm');save();
   for(let i=0;i<9;i++){row.edits.push(await edit());if([0,2,5,8].includes(i)){row['after'+(i+1)]=await snap('garage-after-'+(i+1));save();}log('pair '+row.pair+' '+arm+' edit '+(i+1));}
   await idle();row.cleanupEdit=await edit();row.end=await snap('garage-after-idle-cleanup');save();
   log('pair '+row.pair+' '+arm+' race');
   await page.evaluate(async()=>{await Assets.loadModels();__apex.seed(42);await __apex.race('vegas','night','dry');__apex.go();__apex.camera('chase');__apex.govHold(true);__apex.renderScale(1);__apex.renderClock(0,true);__apex.jump(.1,0,0);__apex.snapCam();__apex.freeze(true);__apex.lightTune({fogDensityMul:3.625});});
   await page.waitForFunction(()=>__apex.info().track==='vegas',null,{polling:100,timeout:120000});
   await windowFrames(30);row.raceWarm=await snap('vegas-frozen-warm');if(!row.raceWarm.view?.frozen||row.raceWarm.view?.state!=='race')throw Error('race not frozen and running');row.race=await windowFrames(raceFrames);row.raceEnd=await snap('vegas-frozen-end');
   if(hardware){await page.evaluate(()=>__apex.headless(false));await page.screenshot({path:out+'/game-render-ab-'+row.pair+'-'+arm+'.png',timeout:60000});await page.evaluate(()=>__apex.headless(true));}
   row.ok=row.pageErrors.length===0&&row.consoleErrors.length===0&&row.race.render.mainRenders===raceFrames;save();if(!row.ok)throw Error('arm errors '+JSON.stringify(row));
  }finally{await ctx.close();}
  log('done pair '+row.pair+' '+arm);
 }
 report.ok=report.arms.length===pairs*2&&report.arms.every(r=>r.ok);report.finished=new Date().toISOString();save();if(!report.ok)process.exitCode=1;
}catch(e){report.ok=false;report.error=String(e.stack||e);save();log(report.error);process.exitCode=1;}finally{await shutdown();log('finished ok='+report.ok);}
