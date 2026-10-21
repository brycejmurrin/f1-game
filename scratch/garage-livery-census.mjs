// Garage livery-edit census: ~30 scripted edits on TLX/WebGPU vs TLX/WebGL2 (B·P1, 2026-10-20).
// Run by gpu-census.yml leg `garage-livery-perf` on macos-latest; `--software` is a local smoke only.
// Per edit: dispatch ms, next-frame ms, rAF intervals over a fixed window, long tasks, and deltas of
// WebGPU createRenderPipeline/createShaderModule/writeTexture/copyExternalImageToTexture, WebGL2
// compileShader/linkProgram/tex*Image*, Car3D.build/buildComplete, LiveryTex.buildAtlas, renderer.info.memory.
// APIs: https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/createRenderPipeline
//       https://developer.mozilla.org/en-US/docs/Web/API/GPUQueue/copyExternalImageToTexture
//       https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming
import {chromium} from 'playwright';
import {writeFileSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {launchChromium,startStaticServer,shutdown,chromiumLaunchInfo,WEBGPU_LAVAPE_CHROMIUM_ARGS} from '../tools/lib/harness.mjs';
import {installProbeInit,gotoGame} from '../tools/shot/probe-page.mjs';
import {installGarageGpuAllocationProbe} from './garage-webgpu-allocation-init.mjs';
const soft=process.argv.includes('--software');
// Optional knobs from the pushed request (.github/gpu-census-request.json): livery_edits, livery_parts, livery_arm.
let REQ={};try{REQ=JSON.parse(readFileSync('.github/gpu-census-request.json','utf8'));}catch(_){}
const EDITS=soft?6:(+REQ.livery_edits||30),PARTS=+REQ.livery_parts||3,WINDOW_MS=soft?1500:(+REQ.livery_window_ms||2500),IDLE_MS=soft?1500:5000;
const ONLY=(process.argv.find(a=>a.startsWith('--arm='))||'').slice(6)||REQ.livery_arm||'';
const ARMS=[{arm:'tlx-webgpu',forceGL:'0'},{arm:'tlx-webgl2',forceGL:'1'},
  ...(REQ.livery_hires_off_arms?[{arm:'tlx-webgpu-nohires',forceGL:'0',noHiRes:true},{arm:'tlx-webgl2-nohires',forceGL:'1',noHiRes:true}]:[])].filter(a=>!ONLY||a.arm===ONLY);
const report={schema:'garage-livery-census/v1',parts:PARTS,request:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),software:soft,edits:EDITS,windowMs:WINDOW_MS,viewport:{width:844,height:390},arms:[],started:new Date().toISOString()};
const save=()=>writeFileSync('game-livery-census.json',JSON.stringify(report,null,2));
const log=x=>console.log(new Date().toISOString(),x);

// Init script: WebGL2 + WebGPU call counters and a buffered long-task list. Counts only; nothing retained.
function installCounters(){
  if(window.__livCount)return;
  const c={};const bump=k=>{c[k]=(c[k]||0)+1;};
  const wrap=(proto,names,prefix)=>{if(!proto)return;for(const n of names){const f=proto[n];if(typeof f!=='function')continue;proto[n]=function(){bump(prefix+n);return f.apply(this,arguments);};}};
  wrap(window.WebGL2RenderingContext?.prototype,['compileShader','linkProgram','texImage2D','texSubImage2D','texImage3D','texSubImage3D','texStorage2D','texStorage3D','generateMipmap','bufferData','bufferSubData'],'gl.');
  wrap(window.GPUQueue?.prototype,['writeTexture','copyExternalImageToTexture','writeBuffer'],'gpu.');
  wrap(window.GPUDevice?.prototype,['createBindGroup','createSampler'],'gpu.');
  // Who binds a context on #game (a canvas keeps its first context type for life; MDN getContext).
  const gc=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type){const r=gc.apply(this,arguments);
    if(this.id==='game'||this.id==='game-soft'){const k=this.id+':'+type+':'+(r?'ok':'null');if(!c['ctx.'+k]){console.warn('[ctxprobe gfx] '+k+' @'+performance.now().toFixed(0)+' '+(new Error().stack||'').split('\n').slice(2,9).map(l=>l.trim()).join(' | '));}bump('ctx.'+k);}return r;};
  const longs=[];
  try{new PerformanceObserver(l=>{for(const e of l.getEntries())longs.push([e.startTime,e.duration]);}).observe({type:'longtask',buffered:true});}catch(_){}
  window.__livCount={read:()=>({...c}),longs};
}
// Page script after boot: wrap the global Car3D / LiveryTex entry points (callers that captured the
// function at eval time are NOT seen — the counts are a floor) and a rAF interval recorder.
function installPageCounters(){
  const poll=setInterval(()=>{if(!window.__livCount||typeof Car3D==='undefined'||typeof LiveryTex==='undefined')return;clearInterval(poll);wrapAll();},50);
  function wrapAll(){
  const c=window.__livCount,k={};c.boot=performance.timeOrigin;const bump=n=>{k[n]=(k[n]||0)+1;};
  for(const [obj,names] of [[Car3D,['build','buildComplete']],[LiveryTex,['buildAtlas','drawCrest']]]){
    if(!obj)continue;for(const n of names){const f=obj[n];if(typeof f!=='function')continue;
      obj[n]=function(){const t=performance.now();try{return f.apply(this,arguments);}finally{bump(n);k[n+'Ms']=(k[n+'Ms']||0)+performance.now()-t;}};}}
  const frames=[];let last=null;const tick=t=>{if(last!==null)frames.push([t,t-last]);last=t;requestAnimationFrame(tick);};requestAnimationFrame(tick);
  c.page=()=>({...k});c.frames=frames;
  }
}
async function snapshot(page){return page.evaluate(()=>{const r=window.renderer;return {doc:performance.timeOrigin,wrapped:!!__livCount.page,calls:{...__livCount.read(),...(__livCount.page?__livCount.page():{})},
  alloc:window.__garageGpuAlloc?__garageGpuAlloc.read():null,memory:r?.info?.memory?JSON.parse(JSON.stringify(r.info.memory)):null,
  programs:r?.info?.programs?.length??null,gpuErrors:window.GLX?.gpuErrors?.()??null,t:performance.now(),
  heapMB:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null};});}
const delta=(a,b)=>{const o={};for(const k of new Set([...Object.keys(a||{}),...Object.keys(b||{})])){const d=(b?.[k]||0)-(a?.[k]||0);if(typeof d==='number'&&d)o[k]=+d.toFixed(2);}return o;};
async function windowStats(page,t0,t1){return page.evaluate(([t0,t1])=>{const f=(__livCount.frames||[]).filter(([t])=>t>t0&&t<=t1).map(x=>x[1]);
  const l=__livCount.longs.filter(([s,d])=>s+d>t0&&s<t1);const s=f.slice().sort((a,b)=>a-b);const q=p=>s.length?+s[Math.min(s.length-1,Math.floor(s.length*p))].toFixed(1):null;
  return {frames:f.length,meanMs:f.length?+(f.reduce((a,b)=>a+b,0)/f.length).toFixed(1):null,p50Ms:q(.5),p95Ms:q(.95),maxMs:s.length?+s[s.length-1].toFixed(1):null,
    longTasks:l.length,longTaskMs:+l.reduce((a,[,d])=>a+d,0).toFixed(1),longestTaskMs:l.length?+Math.max(...l.map(x=>x[1])).toFixed(1):0};},[t0,t1]);}

// The edit plan, discovered from the live editor DOM: each entry is {kind, sel, value?}.
function planEdits([n,cycle]){
  const root=document.querySelector('#cs-options')||document;const plan=[];
  const colours=[...root.querySelectorAll('input[type="color"][data-liv-field]')].map(i=>i.dataset.livField);
  const pills={};for(const b of root.querySelectorAll('[data-cs-pill]')){const [f,v]=b.dataset.csPill.split(':');(pills[f]||(pills[f]=[])).push(v);}
  const finishes=[...root.querySelectorAll('[data-cs-finish]')].map(b=>b.dataset.csFinish);
  const span=f=>Math.min(pills[f].length,cycle||pills[f].length); // cycle: revisit few values, so a cache plateaus and a leak keeps climbing
  const pick=(f,i)=>pills[f]?.length?{kind:/^crest/.test(f)?'crest':/^decal/.test(f)?'decal':f==='bodyStyle'?'body':/^pattern/.test(f)?'pattern':/Finish$/.test(f)?'part-finish':'pill',field:f,value:pills[f][(i+1)%span(f)]}:null;
  const pal=['#d01020','#1040e0','#20a040','#f0c000','#ffffff','#101010','#ff6000','#8020c0'];
  const rota=[i=>colours.length&&{kind:'colour',field:colours[i%Math.min(colours.length,4)],value:pal[i%pal.length]},
    i=>finishes.length&&{kind:'finish',value:finishes[(i+1)%finishes.length]},
    i=>pick(['crestStyle','crestTone','crestFrame'][i%3],i),
    i=>pick(['decalNoseTip','decalCockpit','decalHalo'][i%3],i),
    i=>pick('bodyStyle',i),
    i=>pick(['patternRepeat','patternWidth','patternOpacity'][i%3],i)];
  for(let i=0;plan.length<n&&i<n*3;i++){const e=rota[i%rota.length](Math.floor(i/rota.length));if(e)plan.push(e);}
  return {plan,available:{colours,finishes,pills:Object.fromEntries(Object.entries(pills).map(([k,v])=>[k,v.length]))}};
}
function applyEdit(e){
  const root=document.querySelector('#cs-options')||document;const t=performance.now();
  if(e.kind==='colour'){const i=root.querySelector(`input[data-liv-field="${e.field}"]`);if(!i)return {missing:true};i.value=e.value;i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));}
  else if(e.kind==='finish'){const b=root.querySelector(`[data-cs-finish="${e.value}"]`);if(!b)return {missing:true};b.click();}
  else if(e.kind==='part'){const b=document.querySelector(`[data-cs-opt="${e.value}"]`);if(!b)return {missing:true};b.click();}
  else{const b=root.querySelector(`[data-cs-pill="${e.field}:${e.value}"]`);if(!b)return {missing:true};b.click();}
  return {t0:t,dispatchMs:+(performance.now()-t).toFixed(2)};
}
const nextFrame=(page,t0)=>page.evaluate(t0=>new Promise(r=>{const go=()=>requestAnimationFrame(t=>t>t0?requestAnimationFrame(t2=>r(+(t2-t0).toFixed(1))):go());go();}),t0);

try{
  const server=await startStaticServer(process.cwd());
  const browser=await launchChromium({...(soft?{}:{executablePath:chromium.executablePath()}),args:soft?[...WEBGPU_LAVAPE_CHROMIUM_ARGS,'--headless=new']:['--enable-unsafe-webgpu','--disable-background-timer-throttling','--enable-precise-memory-info']});
  report.browser=chromiumLaunchInfo(browser);report.browserVersion=browser.version();save();
  for(const {arm,forceGL,noHiRes} of ARMS){
    const row={arm,pageErrors:[],consoleErrors:[],gfxLog:[],edits:[]};report.arms.push(row);save();log(`${arm} boot`);
    const ctx=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1,hasTouch:true,reducedMotion:'reduce'});
    try{
      const page=await ctx.newPage();page.on('pageerror',e=>row.pageErrors.push(String(e)));page.on('console',m=>{if(m.type()==='error')row.consoleErrors.push(m.text().slice(0,300));else if((m.type()==='warning'||/gfx|TLX|WebGPU|reload|device|lost/i.test(m.text()))&&!/experimental on this platform/.test(m.text())&&row.gfxLog.length<200)row.gfxLog.push(m.type()+' '+m.text().slice(0,/ctxprobe/.test(m.text())?1200:240));});
      await installProbeInit(page,{backend:'three',team:2,tlxForceGL:forceGL==='1'});
      await page.addInitScript(fgl=>{window.__TEST_MODE=true;localStorage.setItem('apex26.tlxForceGL',fgl);localStorage.setItem('apex26.wgxCapture','0');sessionStorage.setItem('apex26.wgxCapture','0');localStorage.setItem('apex26.gfxBootStepMs','45000');},forceGL);
      if(noHiRes)await page.addInitScript(()=>{const t=setInterval(()=>{if(typeof LiveryTex!=='undefined'){LiveryTex.IS_PHONE=true;clearInterval(t);}},20);});
      await page.addInitScript(installGarageGpuAllocationProbe);await page.addInitScript(installCounters);await page.addInitScript(installPageCounters);
      page.on('framenavigated',f=>{if(f===page.mainFrame())row.navigations=(row.navigations||0)+1;(row.navLog||(row.navLog=[])).push({at:new Date().toISOString(),phase:row.phase||'boot'});});
      await gotoGame(page,server.url+'?three-devtools=1',120000);
      // A boot may reload once (renderer-boot claim latch): settle, then re-wait on the reloaded page.
      for(let i=0;i<3;i++){await page.waitForTimeout(4000);try{await page.waitForFunction(()=>window.__apex&&__apex.race&&window.__livCount&&__livCount.page&&document.querySelector('#mb-garage'),null,{polling:250,timeout:120000});break;}catch(e){if(i===2)throw e;}}
      row.adapter=await page.evaluate(async()=>{const a=navigator.gpu&&await navigator.gpu.requestAdapter();return a?{vendor:a.info.vendor,architecture:a.info.architecture,description:a.info.description}:null;});
      await page.evaluate(()=>{__apex.agentHelp();__apex.govHold(true);__apex.renderScale(1);});
            row.phase='garage';const s0=await snapshot(page);const tIn=s0.t;
      await page.locator('#mb-garage').click();
      await page.waitForFunction(()=>!document.querySelector('#carsetup').hasAttribute('aria-busy')&&document.querySelector('#cs-tabs [data-cs-cat="livery"]'),null,{polling:100,timeout:120000});
      const s1=await snapshot(page);row.entry={ms:+(s1.t-tIn).toFixed(0),delta:delta(s0.calls,s1.calls),alloc:delta(s0.alloc,s1.alloc),memory:s1.memory,programs:s1.programs};
      row.backend=await page.evaluate(()=>GLX.backendState()); // NOT __apex.diag(): its GL sniff binds an unconfigured #game to webgl2 (apex.js diag)log(`${arm} garage open ${JSON.stringify(row.backend)}`);
      await page.waitForTimeout(3000);
      const i0=await snapshot(page);await page.waitForTimeout(IDLE_MS);const i1=await snapshot(page);
      row.idleGarage={...await windowStats(page,i0.t,i1.t),delta:delta(i0.calls,i1.calls)};
      // livery_idle_trace_ms (B·H30, Bryce 2026-10-21 "lagging happens in phases like every 10 seconds"): every frame
      // interval and long task over a long idle in the bay, timestamped, so a periodic stall shows its period.
      if(+REQ.livery_idle_trace_ms>0){const t0=(await snapshot(page)).t;
        // B·H26's discriminator: per-1 s TLX pool/render-object counts and the governor tier, so a step at ~15-20 s
        // (prune / relink) or a tier move separates from a flat plateau (a newly sampled hi-res atlas).
        const mem=[];for(let i=0;i<Math.round(+REQ.livery_idle_trace_ms/1000);i++){await page.waitForTimeout(1000);
          mem.push(await page.evaluate(()=>{const m=window.GLX&&GLX.__tlx&&GLX.__tlx.memState?GLX.__tlx.memState():{};const P=typeof PerfGov!=='undefined'?PerfGov:null;
            return {pool:m.pool,draws:m.draws,mats:m.mats,dropLater:m.dropLater&&m.dropLater.now,rObj:m.rObj,rGeo:m.rGeo,rTex:m.rTex,progs:m.progs,matMiss:m.matMiss,
              tier:P&&P.tier?P.tier():null,autoTier:P&&P.autoTier?P.autoTier():null};}));}
        const t1=(await snapshot(page)).t;
        row.idleTrace=await page.evaluate(([t0,t1])=>({frames:(__livCount.frames||[]).filter(([t])=>t>t0&&t<=t1).map(([t,d])=>[Math.round(t-t0),+d.toFixed(1)]),
          longs:__livCount.longs.filter(([s])=>s>t0&&s<t1).map(([s,d])=>[Math.round(s-t0),Math.round(d)])}),[t0,t1]);
        row.idleTrace.mem=mem;row.idleTraceStats=await windowStats(page,t0,t1);log(`${arm} idle trace ${JSON.stringify(row.idleTraceStats)}`);save();}
      // livery_select_trace (B·H30, Bryce's 2026-10-21 recording: 6-9 fps for ~10 s after picking his BRUSHED custom
      // livery, then recovery): save a BRUSHED custom, then alternate stock and custom picks; per pick, ten 1 s buckets.
      if(REQ.livery_select_trace){
        await page.evaluate(()=>document.querySelector('#cs-tabs [data-cs-cat="livery"]').click());await page.waitForSelector('.cs-liv-create',{timeout:60000});
        // the id list is read BEFORE .cs-liv-create (B·H32): the open editor's draft row already carries the id SAVE keeps
        const before=await page.evaluate(()=>[...document.querySelectorAll('[data-cs-livery]')].map(b=>b.dataset.csLivery));
        await page.evaluate(()=>document.querySelector('.cs-liv-create').click());await page.waitForSelector('[data-cs-finish="brushed"]',{timeout:60000});
        await page.evaluate(()=>document.querySelector('[data-cs-finish="brushed"]').click());await page.waitForTimeout(1500);
        await page.evaluate(()=>document.querySelector('.cs-liv-ed-save').click());
        // a saved paint job's id is livIdCounter()'s Date.now()+seq: wait for a NEW id to appear in the list
        await page.waitForFunction(b=>[...document.querySelectorAll('[data-cs-livery]')].some(x=>!b.includes(x.dataset.csLivery)),before,{polling:250,timeout:60000}).catch(()=>{});
        await page.waitForTimeout(8000);
        const {ids,custom}=await page.evaluate(b=>{const all=[...document.querySelectorAll('[data-cs-livery]')].map(x=>x.dataset.csLivery);
          return {ids:all,custom:all.find(i=>!b.includes(i))||null};},before);
        if(!custom){row.selectTrace={ids,error:'no saved custom livery appeared after SAVE & FIT'};log(`${arm} select trace: no custom ${JSON.stringify(ids)}`);save();continue;}const stock=ids.filter(i=>i!==custom&&i!=='default');
        const seq=[stock[1]||stock[0],custom,stock[2]||stock[0],custom,stock[1]||stock[0]];row.selectTrace={ids,custom,seq,picks:[]};
        for(const id of seq){const pick={id,buckets:[]};row.selectTrace.picks.push(pick);
          await page.evaluate(id=>{const b=[...document.querySelectorAll('[data-cs-livery]')].find(x=>x.dataset.csLivery===id);b&&b.click();},id);
          for(let i=0;i<10;i++){const a=await snapshot(page);await page.waitForTimeout(1000);const b=await snapshot(page);
            const w=await windowStats(page,a.t,b.t);pick.buckets.push({s:i,frames:w.frames,p50:w.p50Ms,max:w.maxMs,longMs:w.longTaskMs,calls:delta(a.calls,b.calls),
              alloc:Object.fromEntries(Object.entries(delta(a.alloc,b.alloc)).filter(([k])=>/pipeline|shader|texture/i.test(k)))});}
          log(`${arm} select ${id} ${JSON.stringify(pick.buckets.map(x=>[x.frames,x.longMs,x.alloc.pipelineCreated||0,x.alloc.textureCreated||0,x.calls.buildAtlas||0]))}`);save();}
        if(REQ.livery_finish_only){row.ok=!row.pageErrors.length;save();continue;}
        await page.evaluate(()=>document.querySelector('#cs-tabs [data-cs-cat="team"]')?.click());await page.waitForTimeout(1500);}
      row.phase='editor';await page.evaluate(()=>document.querySelector('#cs-tabs [data-cs-cat="livery"]').click());
      await page.waitForSelector('.cs-liv-create',{timeout:soft?180000:60000});
      const o0=await snapshot(page);await page.evaluate(()=>document.querySelector('.cs-liv-create').click());
      await page.waitForSelector('input[data-liv-field]',{timeout:soft?180000:60000});await page.waitForTimeout(WINDOW_MS);
      const o1=await snapshot(page);row.openEditor={...await windowStats(page,o0.t,o1.t),delta:delta(o0.calls,o1.calls),alloc:delta(o0.alloc,o1.alloc)};
      // livery_finish_sweep (B·H30): hold each listed finish on the turntable and time the frames, twice over, so a
      // finish whose fragment cost drops the bay's frame rate shows against gloss on a real GPU.
      if(Array.isArray(REQ.livery_finish_sweep)){row.finishSweep=[];
        for(let pass=0;pass<2;pass++)for(const f of REQ.livery_finish_sweep){
          const d=await page.evaluate(applyEdit,{kind:'finish',value:f});if(d.missing){row.finishSweep.push({finish:f,missing:true});continue;}
          await page.waitForTimeout(2500);const a=await snapshot(page);await page.waitForTimeout(WINDOW_MS);const b=await snapshot(page);
          row.finishSweep.push({finish:f,pass,...await windowStats(page,a.t,b.t),delta:delta(a.calls,b.calls),programs:b.programs});
          log(`${arm} finish ${f} pass ${pass} ${JSON.stringify(row.finishSweep.at(-1))}`);save();}
        if(REQ.livery_finish_only){row.ok=!row.pageErrors.length;save();continue;}}
      const {plan,available}=await page.evaluate(planEdits,[EDITS,+REQ.livery_cycle||0]);row.available=available;
      const parts=await page.evaluate(()=>{const t=[...document.querySelectorAll('#cs-tabs [data-cs-cat]')].map(b=>b.dataset.csCat).find(c=>!['team','tune','livery'].includes(c));return t||null;});
      row.phase='edits';row.before=await snapshot(page);
      for(const e of plan){
        const a=await snapshot(page);const d=await page.evaluate(applyEdit,e);
        if(d.missing){row.edits.push({...e,missing:true});continue;}
        const nf=await nextFrame(page,d.t0);await page.waitForTimeout(WINDOW_MS);const b=await snapshot(page);
        row.edits.push({...e,doc:b.doc,wrapped:b.wrapped,dispatchMs:d.dispatchMs,nextFrameMs:nf,...await windowStats(page,d.t0,b.t),delta:delta(a.calls,b.calls),alloc:delta(a.alloc,b.alloc),programs:b.programs,memory:b.memory,heapMB:b.heapMB});
        log(`${arm} ${e.kind} ${e.field||''}=${e.value} next=${nf}ms`);save();
      }
      if(parts){ // three part swaps through the parts tab, the same click a player makes
        await page.evaluate(c=>document.querySelector(`#cs-tabs [data-cs-cat="${c}"]`).click(),parts);await page.waitForTimeout(1500);
        const pool=await page.evaluate(()=>[...document.querySelectorAll('[data-cs-opt]')].filter(b=>!b.disabled).map(b=>b.dataset.csOpt).slice(0,4));
        const ids=Array.from({length:PARTS},(_,i)=>pool[i%pool.length]).filter(Boolean); // cycles the same few parts: a cache plateaus, a leak keeps climbing
        for(const id of ids){const e={kind:'part',field:parts,value:id};const a=await snapshot(page);const d=await page.evaluate(applyEdit,e);if(d.missing)continue;
          const nf=await nextFrame(page,d.t0);await page.waitForTimeout(WINDOW_MS);const b=await snapshot(page);
          row.edits.push({...e,doc:b.doc,wrapped:b.wrapped,dispatchMs:d.dispatchMs,nextFrameMs:nf,...await windowStats(page,d.t0,b.t),delta:delta(a.calls,b.calls),alloc:delta(a.alloc,b.alloc),programs:b.programs,memory:b.memory,heapMB:b.heapMB});log(`${arm} part ${id} next=${nf}ms`);save();}
      }
      row.after=await snapshot(page);row.total=delta(row.before.calls,row.after.calls);row.totalAlloc=delta(row.before.alloc,row.after.alloc);
      const p0=await snapshot(page);await page.waitForTimeout(IDLE_MS);const p1=await snapshot(page);row.idleAfter={...await windowStats(page,p0.t,p1.t),delta:delta(p0.calls,p1.calls)};
      await page.screenshot({path:`game-livery-${arm}.png`,timeout:60000}).catch(()=>{});
      row.ok=!row.pageErrors.length;save();log(`${arm} done`);
    }catch(e){row.error=String(e.stack||e);save();log(`${arm} FAILED ${row.error}`);}finally{await Promise.race([ctx.close(),new Promise(r=>setTimeout(r,20000))]);}
  }
  report.ok=report.arms.every(r=>r.ok);report.finished=new Date().toISOString();save();
}catch(e){report.ok=false;report.error=String(e.stack||e);save();console.error(report.error);process.exitCode=1;}finally{await shutdown();}
