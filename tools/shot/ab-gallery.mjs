#!/usr/bin/env node
// @doc Capture matched game views or import image pairs into an appendable, portable A/B comparison gallery.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import sharp from 'sharp';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const TEMPLATE=path.join(ROOT,'examples/visor-lab');
const HELP=`Apex A/B gallery — local captures and existing screenshot pairs
  node tools/shot/ab-gallery.mjs --capture recipe.json --gallery /path/to/gallery
  node tools/shot/ab-gallery.mjs --add --a before.png --b after.png --id road-wet --title "Wet road" --gallery /path/to/gallery
Optional import labels: --a-label Original --b-label Candidate
Writes comparisons.html + comparisons.json + content-addressed images; retains existing pairs.
Recipe: {"pairs":[{"id":"rain-visor","title":"Rain visor","scene":{"track":"bahrain","tod":"night","weather":"rain","camera":"helmet","frac":0.18},"a":{"label":"Original","visor":"off"},"b":{"label":"Clear shield","visor":"clear","visorRefraction":"strong","visorReflections":"strong"}}]}
Captures use one disposable WebGL2 browser, Ultra, 1920x1080, reduced motion and a frozen shared scene.
Wetness is pinned to the weather target for comparison; rainfall may still be ramping.
Import equal-size images to compare different code revisions or any other captured settings.
Serve the gallery over HTTP; publish separately. No credentials or hosting identity are needed.
`;
const optics={visor:['off','clear','smoke'],visorColor:['neutral','amber','ice','rose'],visorIntensity:['light','medium','strong'],visorRefraction:['off','light','medium','strong'],visorReflections:['off','light','medium','strong'],visorRain:['off','light','normal','heavy'],visorRunoff:['slow','normal','fast']};
const defaults={visor:'off',visorColor:'neutral',visorIntensity:'light',visorRefraction:'off',visorReflections:'off',visorRain:'off',visorRunoff:'normal'};
function id(value){if(typeof value!=='string'||!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(value))throw new Error('id must be a lowercase slug (1..80 characters)');return value;}
export function recipePairs(data){
 if(!Array.isArray(data?.pairs)||!data.pairs.length||data.pairs.length>64)throw new Error('recipe needs 1..64 pairs');
 const seen=new Set();
 return data.pairs.map(p=>{
  const key=id(p.id);if(seen.has(key))throw new Error('duplicate recipe id: '+key);seen.add(key);
  const scene={track:'bahrain',tod:'night',weather:'rain',camera:'helmet',frac:.18,...p.scene};
  if(!/^[a-z0-9_-]+$/.test(scene.track)||!['day','dawn','dusk','night'].includes(scene.tod)||!['dry','wet','rain','storm','fog','overcast'].includes(scene.weather)||!Number.isFinite(scene.frac)||scene.frac<0||scene.frac>=1||!/^\w+$/.test(scene.camera))throw new Error('invalid scene: '+key);
  const side=(raw={},fallback)=>{const settings={...defaults};for(const [k,v] of Object.entries(raw)){if(k==='label')continue;if(!optics[k]?.includes(v))throw new Error('invalid visor setting: '+k+'='+v);settings[k]=v;}return {label:String(raw.label||fallback),settings};};
  return {id:key,title:String(p.title||key),scene,a:side(p.a,'Original'),b:side(p.b,'Candidate')};
 });
}
export async function installViewer(gallery){
 await fs.mkdir(gallery,{recursive:true});
 for(const name of ['comparisons.html','comparisons.js','comparisons.css'])if(path.resolve(TEMPLATE)!==path.resolve(gallery))await fs.copyFile(path.join(TEMPLATE,name),path.join(gallery,name));
}
export async function addPair({gallery,id:pairId,title,a,b,aLabel='Original',bLabel='Candidate',provenance=null}){
 id(pairId);gallery=path.resolve(gallery);
 // Validate BOTH inputs before changing the index. Assets are immutable and safe to retry.
 const load=async file=>{const bytes=await fs.readFile(file);if(bytes.length>32*1024*1024)throw new Error('image exceeds 32 MiB');const meta=await sharp(bytes).metadata();if(!['png','jpeg','webp'].includes(meta.format)||!meta.width||!meta.height||meta.pages>1)throw new Error('expected a still PNG/JPEG/WebP');return {bytes,meta};};
 const [left,right]=await Promise.all([load(a),load(b)]);
 if(left.meta.width!==right.meta.width||left.meta.height!==right.meta.height)throw new Error('A/B dimensions must match; images are never stretched to fit');
 await fs.mkdir(gallery,{recursive:true});
 const lockPath=path.join(gallery,'.comparisons.lock'),lock=await fs.open(lockPath,'wx');
 try{
 let data;try{data=JSON.parse(await fs.readFile(path.join(gallery,'comparisons.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;data={version:1,pairs:[]};}
 if(data.version!==1||!Array.isArray(data.pairs))throw new Error('unsupported comparison index');
 await fs.mkdir(path.join(gallery,'comparison-images'),{recursive:true});
 const save=async item=>{const image=await sharp(item.bytes).webp({lossless:true,effort:3}).toBuffer(),hash=createHash('sha256').update(image).digest('hex'),file='comparison-images/'+hash+'.webp';await fs.writeFile(path.join(gallery,file),image);return {file,sha256:hash};};
 const [aa,bb]=await Promise.all([save(left),save(right)]);
 const pair={id:pairId,title:String(title||pairId),width:left.meta.width,height:left.meta.height,a:{...aa,label:String(aLabel)},b:{...bb,label:String(bLabel)},provenance};
 data.pairs=data.pairs.filter(p=>p.id!==pairId);data.pairs.push(pair);
 data.visorLab=await Promise.all(['index.html','optics.html'].map(name=>fs.access(path.join(gallery,name)).then(()=>true,()=>false))).then(found=>found.every(Boolean));
 await installViewer(gallery);
 const pending=path.join(gallery,'.comparisons-'+randomUUID()+'.json');await fs.writeFile(pending,JSON.stringify(data,null,2)+'\n');await fs.rename(pending,path.join(gallery,'comparisons.json'));
 return pair;
 }finally{await lock.close();await fs.unlink(lockPath);}
}
export async function capturePairs(pairs,gallery){
 const {launchChromium,startStaticServer,shutdown}=await import('../lib/harness.mjs');
 const {installProbeInit,gotoGame,mutateCaptureScene,awaitCaptureReady,screenshotPresentedCanvas,chromiumArgsForBackend}=await import('./probe-page.mjs');
 const {pixelEvidence}=await import('./capture-contract.mjs');
 const {runBoundedCapture}=await import('./capture-runtime.mjs');
 const source={sha:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain'],{cwd:ROOT,encoding:'utf8'}).trim()};
 await fs.mkdir(path.join(ROOT,'artifacts'),{recursive:true});
 const captureDir=await fs.mkdtemp(path.join(ROOT,'artifacts/ab-capture-'));
 const report={source,viewport:{width:1920,height:1080},reducedMotion:true,pairs:[],verdict:'RUNNING'};
 try{await runBoundedCapture(async()=>{
  const server=await startStaticServer(ROOT),browser=await launchChromium({args:chromiumArgsForBackend('webgl2')});
  const context=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await installProbeInit(page,{backend:'webgl2'});await page.addInitScript(()=>{localStorage.setItem('apex26.gfxPreset',JSON.stringify('ultra'));localStorage.setItem('apex26.gfxHigh','1');});
  await gotoGame(page,server.url);await page.evaluate(()=>__apex.agentHelp());
  for(const pair of pairs){
   console.log('CAPTURE',pair.id,pair.scene);
   await page.evaluate(async s=>{__apex.headless(true);await __apex.race(s.track,s.tod,s.weather);__apex.headless(true);},pair.scene);
   await page.evaluate(()=>{if(!GLX.begin.__abObserver){const begin=GLX.begin;GLX.begin=function(f){window.__abFrame={wetness:f.wetness,rain:f.rain};return begin.apply(this,arguments)};GLX.begin.__abObserver=true;}});
   await mutateCaptureScene(page,s=>{const a=__apex;a.govHold(true);a.renderScale(1);a.lightTune({wetness:s.weather==='wet'?.5:['rain','storm'].includes(s.weather)?1:0});a.go();if(a.park(s.frac)===false)throw Error('park failed');a.camera(s.camera);a.snapCam();a.freeze(true);a.headless(false);},pair.scene);
   await awaitCaptureReady(page,{timeoutMs:150000,pauseRender:true});
   const identity=await page.evaluate(()=>({info:__apex.info(),weather:__apex.weather(),tod:__apex.setTimeOfDay(),camera:__apex.camera().mode,perf:__apex.renderScale(),frame:window.__abFrame,backend:__apex.diag({download:false}).env}));
   if(identity.info.track!==pair.scene.track||identity.weather!==pair.scene.weather||identity.tod!==pair.scene.tod||identity.camera!==pair.scene.camera||identity.perf.scale!==1||identity.backend.backend!=='webgl2')throw Error('capture identity mismatch');
   const target=pair.scene.weather==='wet'?.5:['rain','storm'].includes(pair.scene.weather)?1:0;
   if(!Number.isFinite(identity.frame?.wetness)||Math.abs(identity.frame.wetness-target)>.001)throw Error('surface wetness not ready');
   const paths={};
   for(const key of ['a','b']){
    await page.evaluate(({settings,weather})=>{for(const [k,v] of Object.entries(settings))CockpitOpts['set'+k[0].toUpperCase()+k.slice(1)](v);Droplets.clear();const active=__apex.camera().mode==='helmet',rain=['rain','storm'].includes(weather)?1:0;for(let i=0;i<60;i++)Droplets.tick(1/60,active,rain,weather==='storm',0,true);}, {settings:pair[key].settings,weather:pair.scene.weather});
    paths[key]=path.join(captureDir,pair.id+'-'+key+'.png');
    const shot=await screenshotPresentedCanvas(page,{path:paths[key],forceCdp:true,skipAwait:true,timeout:25000});
    if(!(await pixelEvidence(shot.buf)).meaningful)throw Error('blank screenshot');
   }
   if(errors.length)throw Error(errors.join('\n'));
   await addPair({gallery,id:pair.id,title:pair.title,...paths,aLabel:pair.a.label,bLabel:pair.b.label,provenance:{...source,scene:pair.scene,identity,settings:{a:pair.a.settings,b:pair.b.settings},reducedMotion:true}});
   report.pairs.push({id:pair.id,identity});console.log('ADDED',pair.id);
  }
  await page.evaluate(()=>__apex.lightTune({wetness:-.05}));
 },{timeoutMs:900000});report.verdict='PASS';}
 catch(e){report.verdict='FAIL';report.error=String(e.stack||e);throw e;}
 finally{await fs.writeFile(path.join(captureDir,'report.json'),JSON.stringify(report,null,2));await shutdown();console.log('REPORT',captureDir);}
}
async function main(){
 const {values:v}=parseArgs({options:{help:{type:'boolean'},capture:{type:'string'},add:{type:'boolean'},a:{type:'string'},b:{type:'string'},id:{type:'string'},title:{type:'string'},'a-label':{type:'string'},'b-label':{type:'string'},gallery:{type:'string',default:'artifacts/ab-gallery'}},strict:true});
 if(v.help){console.log(HELP);return;}
 if(!!v.capture===!!v.add)throw Error('choose --capture recipe.json OR --add (see --help)');
 const gallery=path.resolve(v.gallery);
 if(v.capture)await capturePairs(recipePairs(JSON.parse(await fs.readFile(v.capture,'utf8'))),gallery);
 else{if(!v.a||!v.b||!v.id)throw Error('--add requires --a, --b and --id');await addPair({gallery,id:v.id,title:v.title,a:v.a,b:v.b,aLabel:v['a-label'],bLabel:v['b-label']});}
 console.log('A/B gallery:',path.join(gallery,'comparisons.html'));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
