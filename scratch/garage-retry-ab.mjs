// Exact-revision garage A/B. CPU profiling is separate from timing windows.
// API units: developer.mozilla.org/en-US/docs/Web/API/GPUQueue/writeBuffer
import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {launchChromium,startStaticServer,shutdown,chromiumLaunchInfo,WEBGPU_LAVAPE_CHROMIUM_ARGS} from '../tools/lib/harness.mjs';
import {installProbeInit,gotoGame} from '../tools/shot/probe-page.mjs';
import {installGarageGpuAllocationProbe} from './garage-webgpu-allocation-init.mjs';
import {installRenderSubmitMetrics} from './render-submit-metrics.mjs';
const baseline='e48b3e9038e38126c105c64ac1e59f4bc36f28f7',candidate='24cb26e2380f3e954007e5b9b537dbc12da9f3ad';
const soft=process.argv.includes('--software'),pairs=soft?1:3,edits=soft?2:10,idleFrames=soft?3:90,warmFrames=soft?3:45;
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
try{git('cat-file','-e',baseline+'^{commit}');}catch{execFileSync('git',['fetch','--depth=1','origin',baseline],{stdio:'inherit'});}
try{git('cat-file','-e',candidate+'^{commit}');}catch{execFileSync('git',['fetch','--depth=1','origin',candidate],{stdio:'inherit'});}
if(git('diff',candidate,'HEAD','--','js','css','vendor','assets','index.html'))throw Error('candidate product does not match pin');
const oldRoot=resolve('scratch/garage-retry-baseline');mkdirSync(oldRoot,{recursive:true});
execFileSync('git',['archive','--format=tar',baseline,'-o',resolve('scratch/garage-retry-baseline.tar')]);
execFileSync('tar',['-xf',resolve('scratch/garage-retry-baseline.tar'),'-C',oldRoot]);
const report={schema:'garage-retry-ab/v1',baseline,candidate,request:git('rev-parse','HEAD'),software:soft,entryMode:'cold-fast-tap; headless pauses speculative title prebuild before click',pairs,edits,idleFrames,viewport:{width:844,height:390},arms:[],started:new Date().toISOString()};
const tracked=['index.html','js/garage/scene.js','js/garage/livery-design-editor.js','js/render/three/tsl-lit.js','js/ui/setting-deps.js'];
report.sourceHashes=Object.fromEntries([['baseline',oldRoot],['candidate',process.cwd()]].map(([arm,root])=>[arm,Object.fromEntries(tracked.map(p=>[p,createHash('sha256').update(readFileSync(root+'/'+p)).digest('hex')]))]));
const output=soft?'artifacts/garage-retry/pilot':'artifacts/garage-retry/native';mkdirSync(output,{recursive:true});
const save=()=>writeFileSync('game-garage-retry-ab.json',JSON.stringify(report,null,2));
const log=x=>console.log(new Date().toISOString(),x);
function installBench(){
 const A=__apex,R=renderer,b=window.__garageRetry={on:false,done:false};__renderSubmitMetrics.attach(R);
 const render=R.render,begin=GLX.begin,present=GLX.present;
 R.render=function(scene){const t=this.getRenderTarget(),main=t?.texture?.name==='output'||!t&&scene?.isScene===true;const result=render.apply(this,arguments);if(b.on&&main&&(!b.entry||A.garageCam().on)&&++b.main>=b.limit)b.pending=true;return result;};
 GLX.begin=function(){if(b.on)b.begin=performance.now();return begin.apply(this,arguments);};
 GLX.present=function(){try{return present.apply(this,arguments);}finally{if(b.on){const t=performance.now();if(b.begin!==null)b.beginPresent.push(t-b.begin);b.begin=null;if(b.last!==null)b.cadence.push(t-b.last);b.last=t;if(b.pending){b.on=false;b.done=true;b.end=t;b.inputToPresent=b.inputStart===null?null:t-b.inputStart;b.render=__renderSubmitMetrics.stop();A.headless(true);}}}};
 b.start=(n,entry=false)=>{A.headless(true);Object.assign(b,{on:true,done:false,pending:false,entry,main:0,limit:n,begin:null,last:null,inputStart:null,beginPresent:[],cadence:[]});__renderSubmitMetrics.start();A.headless(false);};
}
try{
 const servers={baseline:await startStaticServer(oldRoot),candidate:await startStaticServer(process.cwd())};
 const browser=await launchChromium({executablePath:soft?'/usr/bin/chromium':chromium.executablePath(),args:soft?[...WEBGPU_LAVAPE_CHROMIUM_ARGS,'--headless=new']:['--enable-unsafe-webgpu','--disable-background-timer-throttling'],...(soft?{env:{...process.env,VK_DRIVER_FILES:'/workspace/f1-game/scratch/vulkan-runtime/lvp-local.json'}}:{})});
 report.browser=chromiumLaunchInfo(browser);report.browserVersion=browser.version();save();
 for(let pair=1;pair<=pairs;pair++)for(const arm of pair%2?['baseline','candidate']:['candidate','baseline']){
  const row={pair,arm,pageErrors:[],consoleErrors:[],warnings:[],edits:[],profiledEdits:[]};report.arms.push(row);save();log(`${pair} ${arm} boot`);
  const ctx=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1,hasTouch:true,reducedMotion:'reduce'});
  try{
   const page=await ctx.newPage();page.on('pageerror',e=>row.pageErrors.push(String(e)));page.on('console',m=>{if(m.type()==='error')row.consoleErrors.push(m.text());if(m.type()==='warning')row.warnings.push(m.text());});
   await installProbeInit(page,{backend:'three',team:2,tlxForceGL:false});
   await page.addInitScript(soft=>{window.__TEST_MODE=true;localStorage.setItem('apex26.tlxForceGL','0');localStorage.setItem('apex26.gfxBootStepMs','45000');if(soft)localStorage.setItem('apex26.tlxForceHw','batches');{localStorage.setItem('apex26.wgxCapture','0');sessionStorage.setItem('apex26.wgxCapture','0');}},soft);
   await page.addInitScript(installGarageGpuAllocationProbe);
   await gotoGame(page,servers[arm].url+'?three-devtools=1',120000);
   row.adapter=await page.evaluate(async()=>{const a=await navigator.gpu.requestAdapter();return {vendor:a.info.vendor,architecture:a.info.architecture};});if(!soft&&row.adapter.vendor!=='apple')throw Error('expected Apple hardware');
   await page.evaluate(()=>{__apex.agentHelp();__apex.govHold(true);__apex.renderScale(1);__apex.headless(true);});
   await page.evaluate(installRenderSubmitMetrics);await page.evaluate(installBench);
   const done=async()=>{try{await page.waitForFunction(()=>__garageRetry.done,null,{polling:100,timeout:60000});}catch(e){row.timeout=await page.evaluate(()=>({bench:__garageRetry,headless:__apex.headless(),view:__apex.viewState(),camera:__apex.garageCam(),backend:GLX.backendState(),render:__renderSubmitMetrics.stop()}));save();throw e;}await page.evaluate(async()=>{let timer;try{await Promise.race([renderer.backend.device.queue.onSubmittedWorkDone(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('GPU completion wait exceeded 60s')),60000);})]);}finally{clearTimeout(timer);}});return page.evaluate(()=>{const b=__garageRetry;return {main:b.main,beginPresentMs:b.beginPresent,cadenceMs:b.cadence,inputToPresentMs:b.inputToPresent,render:b.render};});};
   const frames=async n=>{await page.evaluate(n=>__garageRetry.start(n),n);return done();};
   const snap=()=>page.evaluate(()=>({camera:__apex.garageCam(),quality:__apex.govHold(),scale:__apex.renderScale(),allocation:__garageGpuAlloc.read(),memory:JSON.parse(JSON.stringify(renderer.info.memory)),garage:GarageScene.debug(),gpuErrors:GLX.gpuErrors(),isWebGPU:renderer.backend.isWebGPUBackend,finish:[...document.querySelectorAll('[data-cs-finish="gloss"]')].some(e=>e.classList.contains('active'))}));
   row.entryBefore=await page.evaluate(()=>({prebuild:__apex.garagePrebuild(),assets:Assets.state()}));
   const entryCdp=soft?null:await ctx.newCDPSession(page);if(entryCdp){await entryCdp.send('Profiler.enable');await entryCdp.send('Profiler.start');}
   await page.evaluate(()=>{document.addEventListener('click',function entry(e){if(!e.target.closest('#mb-garage'))return;document.removeEventListener('click',entry,true);__garageRetry.start(1,true);__garageRetry.inputStart=performance.now();},true);});
   await page.locator('#mb-garage').click();await page.waitForFunction(()=>__garageRetry.done,null,{polling:100,timeout:120000});
   row.entry=await page.evaluate(()=>({clickToFirstGaragePresentMs:__garageRetry.inputToPresent,main:__garageRetry.main,beginPresentMs:__garageRetry.beginPresent,render:__garageRetry.render}));
   await page.waitForFunction(()=>!document.querySelector('#carsetup').hasAttribute('aria-busy')&&document.querySelector('#cs-tabs [data-cs-cat="livery"]'),null,{polling:100,timeout:120000});
   row.entryAfter=await page.evaluate(()=>({prebuild:__apex.garagePrebuild(),assets:Assets.state()}));row.entry.uiReadyMs=await page.evaluate(()=>performance.now()-__garageRetry.inputStart);log(`${pair} ${arm} first garage frame`);if(entryCdp){const p=await entryCdp.send('Profiler.stop');writeFileSync(`game-garage-${pair}-${arm}-entry.cpuprofile`,JSON.stringify(p.profile));await entryCdp.detach();}save();
   if(!soft){
    await page.evaluate(()=>document.querySelector('[data-cs-view="hero"]').click());
    await frames(warmFrames);row.stockWarm=await snap();row.stockIdle=await frames(idleFrames);row.stockAfter=await snap();
    await page.evaluate(()=>__apex.headless(false));await page.screenshot({path:`game-garage-${pair}-${arm}-stock.png`,timeout:60000});await page.evaluate(()=>__apex.headless(true));save();log(`${pair} ${arm} stock garage done`);
   }
   await page.evaluate(()=>{__apex.headless(true);document.querySelector('#cs-tabs [data-cs-cat="livery"]').click();});await page.waitForSelector('.cs-liv-create');await page.evaluate(()=>document.querySelector('.cs-liv-create').click());await page.waitForSelector('input[data-liv-field="c2"]');
   await page.evaluate(()=>{const gloss=document.querySelector('[data-cs-finish="gloss"]');if(!gloss)throw Error('gloss selector absent');gloss.click();document.querySelector('[data-cs-view="hero"]').click();});
   row.backend=await page.evaluate(()=>__apex.diag({download:false}).env.backendState);
   if(row.backend.api!=='webgpu'||row.backend.forceWebGL||!soft&&(row.backend.softAdapter||row.backend.softBlit))throw Error('invalid WebGPU presentation');
   let idx=0;
   const edit=async()=>{const n=idx++;const dispatch=await page.evaluate(i=>{__garageRetry.start(1);const input=document.querySelector('input[data-liv-field="c2"]'),color='#'+(0x204060+i*0x030507).toString(16).slice(-6);__garageRetry.inputStart=performance.now();input.value=color;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return {color,dispatchMs:performance.now()-__garageRetry.inputStart};},n);const rendered=await done();return {...dispatch,...rendered,applied:await page.evaluate(()=>({value:document.querySelector('input[data-liv-field="c2"]').value,key:GarageScene.debug().geomKey,camera:__apex.garageCam()}))};};
   for(let i=0;i<3;i++)await edit();await frames(warmFrames);
   row.warm=await snap();log(`${pair} ${arm} warm`);if(row.warm.camera.spin)throw Error('garage camera still spins');
   row.idleBefore=await frames(idleFrames);row.before=await snap();save();
   for(let i=0;i<edits;i++)row.edits.push(await edit());
   row.after=await snap();log(`${pair} ${arm} timed edits done`);row.idleAfter=await frames(idleFrames);row.idleAfterState=await snap();save();
   if(!soft){const cdp=await ctx.newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');for(let i=0;i<edits;i++)row.profiledEdits.push(await edit());await page.evaluate(()=>Promise.resolve());const p=await cdp.send('Profiler.stop');writeFileSync(`game-garage-${pair}-${arm}-edits.cpuprofile`,JSON.stringify(p.profile));await cdp.detach();}
   await page.evaluate(()=>__apex.headless(false));await page.screenshot({path:`game-garage-${pair}-${arm}.png`,timeout:60000});await page.evaluate(()=>__apex.headless(true));row.final=await snap();
   const camera=JSON.stringify(row.before.camera);for(const s of [row.warm,row.after,row.idleAfterState,row.final])if(s.camera.spin||JSON.stringify(s.camera)!==camera||s.scale.scale!==1||!s.quality.tierHold||s.gpuErrors||!s.isWebGPU||!s.finish)throw Error('unmatched camera/quality/finish');
   for(const e of [...row.edits,...row.profiledEdits])if(e.main!==1||e.applied.value!==e.color||JSON.stringify(e.applied.camera)!==camera)throw Error('unapplied edit or moved camera');
   row.ok=!row.pageErrors.length&&!row.consoleErrors.length;save();if(!row.ok)throw Error('runtime errors');log(`${pair} ${arm} done`);
  }finally{await ctx.close();}
 }
 report.ok=report.arms.length===pairs*2&&report.arms.every(r=>r.ok);report.finished=new Date().toISOString();save();
}catch(e){report.ok=false;report.error=String(e.stack||e);save();console.error(report.error);process.exitCode=1;}finally{await shutdown();}
