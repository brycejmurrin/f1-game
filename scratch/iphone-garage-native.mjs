// Parent-owned bounded experiments. Hardware Apple Chromium with phone emulation,
// not an iPhone/Safari benchmark. Runtime toggles are diagnostic only.
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {writeFileSync,mkdirSync} from 'node:fs';
import {launchChromium,startStaticServer,shutdown} from '../tools/lib/harness.mjs';
import {installProbeInit,gotoGame} from '../tools/shot/probe-page.mjs';
import {installRenderSubmitMetrics} from './iphone-render-metrics.mjs';
import {menuPrepReady} from '../tools/lib/census-entry.mjs';
const dir='artifacts/iphone-native';mkdirSync(dir,{recursive:true});
const report={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),actualSafari:false,phoneEmulation:true,motion:true,video:true,flowOnly:true,software:false,timingScope:'CDP-profiled diagnostic cadence; Video-ticked flow capture; static stock window holds camera, tier, render scale and visual clock. No rendering cuts tested in this run.',arms:[],ok:false};
const save=()=>writeFileSync(`${dir}/report.json`,JSON.stringify(report,null,2));
try{
const server=await startStaticServer(process.cwd());const browser=await launchChromium({executablePath:chromium.executablePath(),args:['--enable-unsafe-webgpu','--disable-background-timer-throttling']});
for(const gpu of [false,true]){
const row={api:gpu?'webgpu':'webgl2',windows:[],errors:[]};report.arms.push(row);save();
const ctx=await browser.newContext({viewport:{width:852,height:393},deviceScaleFactor:3,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',reducedMotion:'no-preference',recordVideo:{dir:dir+'/video',size:{width:852,height:393}}});
try{
const page=await ctx.newPage();page.on('pageerror',e=>row.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')row.errors.push(m.text());});await installProbeInit(page,{backend:'three',tlxForceGL:!gpu,motion:true});
await page.addInitScript(gpu=>{localStorage.setItem('apex26.tlxForceGL',gpu?'0':'1');localStorage.setItem('apex26.wgxCapture','0');sessionStorage.setItem('apex26.wgxCapture','0');window.__apexFullIntro=true;},gpu);
await gotoGame(page,server.url+'?three-devtools=1&fullIntro=1',180000);row.help=await page.evaluate(()=>__apex.agentHelp());
row.adapter=await page.evaluate(async()=>{const a=await navigator.gpu.requestAdapter();return {...a.info.toJSON?.(),vendor:a.info.vendor,architecture:a.info.architecture};});if(row.adapter.vendor!=='apple')throw Error('Apple hardware required');
await page.evaluate(installRenderSubmitMetrics);await page.evaluate(()=>{__renderSubmitMetrics.attach(renderer);
const p=window.__ip={renderSerial:0,on:false,frames:[],mode:'stock',small:[],last:null};const begin=GLX.begin,draw=GLX.draw,present=GLX.present;const render=renderer.render;renderer.render=function(scene){const target=this.getRenderTarget(),main=target?.texture?.name==='output'||!target&&scene?.isScene===true;const value=render.apply(this,arguments);if(main)p.renderSerial++;return value;};
GLX.begin=function(o){if(p.mode==='four-lights'){p.small.length=0;for(let i=0;i<Math.min(60,o.lights?.length||0);i++)p.small.push(o.lights[i]);o={...o,lights:p.small};}if(p.on){p.start=performance.now();p.draws=0;p.lights=o.lights?.length/15;}return begin.apply(this,[o]);};
GLX.draw=function(mesh,mat,opts){if(p.mode==='no-floor-reflection'&&opts?.depthBias?.[0]===-2&&opts.depthBias[1]===-120)return;if(p.on)p.draws++;return draw.apply(this,arguments);};
GLX.present=function(o){try{return present.apply(this,arguments);}finally{if(p.on){const t=performance.now();p.frames.push({t,cadenceMs:p.last===null?null:t-p.last,submitMs:t-p.start,lights:p.lights,draws:p.draws,camera:__apex.garageCam(),phase:document.querySelector('#loading')?.dataset.phase||'',arriving:document.querySelector('#carsetup')?.classList.contains('cs-arriving'),scale:GLX.getRenderScale(),renderSize:[GLX.width,GLX.height],canvas:[game.width,game.height],triangles:renderer.info.render.triangles,renderCalls:renderer.info.render.drawCalls});p.last=t;}}};
});
const cdp=await ctx.newCDPSession(page);await cdp.send('Profiler.enable');
const settle=async()=>{const serial=await page.evaluate(()=>__ip.renderSerial);await page.waitForFunction(n=>__ip.renderSerial>=n+12&&!GLX.warming(),serial,{polling:100,timeout:180000});};
const capture=async(name,ms=4000)=>{await settle();await page.evaluate(()=>{__ip.frames=[];__ip.last=null;__ip.on=true;__renderSubmitMetrics.start();});await cdp.send('Profiler.start');await page.waitForTimeout(ms);const {profile}=await cdp.send('Profiler.stop');writeFileSync(`${dir}/${row.api}-${name}.cpuprofile`,JSON.stringify(profile));const result=await page.evaluate(()=>{__ip.on=false;return {render:__renderSubmitMetrics.stop(),camera:__apex.garageCam(),room:GarageScene.debug(),frames:__ip.frames,backend:GLX.backendState(),scale:__apex.renderScale()};});row.windows.push({name,...result});save();await page.screenshot({path:`${dir}/${row.api}-${name}.png`,timeout:60000});console.log(row.api,name,result.frames.length);};
await page.locator('#mb-garage').click();await capture('garage-spin',5000);
await page.evaluate(()=>document.querySelector('[data-cs-view="hero"]').click());await settle();const held=await page.evaluate(()=>{const scale=GLX.getRenderScale(),sky=__apex.renderClock(),autoRes=__apex.renderScale().auto;__apex.renderScale(scale);__apex.govHold(true);__apex.renderClock(sky,true);return {scale,sky,autoRes,camera:__apex.garageCam(),room:GarageScene.debug(),quality:__apex.govHold()};});row.control=held;const {scale}=held;
for(const mode of ['stock']){await page.evaluate(({mode,scale})=>{__ip.mode=mode==='scale-072'?'stock':mode;__apex.renderScale(mode==='scale-072'?.72:scale);},{mode,scale});await page.waitForTimeout(800);await capture(mode+'-'+row.windows.length,3000);}
for(const w of row.windows.slice(1)){const expected=w.name.startsWith('scale-072')?.72:scale;if(w.frames.some(f=>f.scale!==expected||JSON.stringify({...f.camera,fitD:0})!==JSON.stringify({...held.camera,fitD:0}))||w.room.geomKey!==held.room.geomKey||!w.scale.tierHold)throw Error('unmatched static A/B state');}
await page.evaluate(({sky,autoRes})=>{__apex.renderClock(sky,false);__apex.govHold(false);if(autoRes)__apex.renderScale(true);__ip.mode='stock';document.querySelector('#cs-back').click();},held);await page.locator('#mb-race').click();await page.locator('#sel-go').click();await page.waitForFunction(menuPrepReady,null,{polling:100,timeout:180000});
await page.locator('#rs-go').click({timeout:60000});await capture('drive-out-opening',2500);await capture('drive-out-middle',3000);await capture('drive-out-end',5000);
await page.waitForFunction(()=>!__apex.garageCam().on&&document.querySelector('#loading')?.dataset.phase==='run',null,{polling:100,timeout:60000});await capture('visible-flyby',2500);
if(row.windows.at(-1).frames.filter(f=>f.phase==='run'&&!f.camera.on).length<30)throw Error('insufficient actual flyby frames');
row.ok=!row.errors.length&&row.windows.every(w=>w.frames.length>0&&w.render.mainRenders>0&&w.render.rows.some(r=>r.main&&r.calls>0&&r.triangles>0)&&w.backend.api===row.api&&w.backend.gpuErrors===0&&w.backend.isMobile&&w.backend.isWebKit&&!w.backend.softwareGL&&!w.backend.softBlit&&!w.backend.softAdapter);if(!row.ok)throw Error('invalid native window');
}finally{await ctx.close();save();}
}
report.ok=report.arms.length===2&&report.arms.every(a=>a.ok);if(!report.ok)throw Error('missing native arm');
}catch(e){report.error=String(e.stack||e);console.error(report.error);process.exitCode=1;}finally{save();await shutdown();}
