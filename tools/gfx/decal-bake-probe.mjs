import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {startStaticServer,launchChromium,shutdown} from '../lib/harness.mjs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,sep} from 'node:path';
import {exitIfHelp,parseFlags} from '../lib/cli-args.mjs';
const ROOT=fileURLToPath(new URL('../..',import.meta.url)).replace(/[\\/]$/, '');
const argv=process.argv.slice(2);
exitIfHelp(argv, 'decal-bake-probe — compare production bake-pool pixels on real WebGL2\n\n  node tools/gfx/decal-bake-probe.mjs [--base REF] [--json artifacts/PATH.json]\n\nFresh contexts, five enabled/disabled/extent/tile cases. Counts and pixel correctness only; no timing or WebGPU claim.');
parseFlags(argv,['--base','--json','--help']);
const flag=(k,d)=>argv.includes(k)?argv[argv.indexOf(k)+1]:d;
const base=flag('--base','HEAD');
const out=resolve(ROOT,flag('--json','artifacts/probes/decal-bake-ab.json'));
if(!['artifacts','scratch'].some(d=>out.startsWith(resolve(ROOT,d)+sep)))throw Error('--json must be under artifacts/ or scratch/');
// @doc Compare production decal bake pixels on WebGL2: five cases, baseline ref and JSON artifact.
// @skill playwright-probe
const rows=[];
try {
 const srv=await startStaticServer(ROOT);
 const browser=await launchChromium({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const arm of ['base','candidate']) {
  const context=await browser.newContext();
  await context.route('**/pool-probe.html',r=>r.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(srv.url+'pool-probe.html');
  await page.evaluate(()=>{window.Log={info(){},warn(){},error(){},debug(){}}});
  for(const f of ['js/render/shared/light-budget.js','js/lighting/knobs.js','js/render/three/tsl-chunks.js','js/render/three/tsl-lit.js']) {
   const content=arm==='base'&&f.endsWith('tsl-lit.js')?execFileSync('git',['show',base+':'+f],{cwd:ROOT,encoding:'utf8'}):fs.readFileSync(resolve(ROOT,f),'utf8');
   await page.addScriptTag({content});
  }
  const result=await page.evaluate(async()=>{
   const T=await import('/vendor/three-0.186.1/three.webgpu.min.js'),S=T.TSL;
   const renderer=new T.WebGPURenderer({forceWebGL:true,antialias:false});await renderer.init();renderer.setSize(2,2);
   const lit=TLXShaders.lit(T,S,{chunks:TLXShaders.chunks(T,S),maxLights:16});
   const wp=S.uniform(new T.Vector3(.5,0,.5));
   const material=new T.MeshBasicNodeMaterial();material.fragmentNode=S.vec4(lit.decalLight.pool(wp,S.vec3(0,1,0)),1);
   const geo=new T.PlaneGeometry(2,2),scene=new T.Scene(),mesh=new T.Mesh(geo,material);scene.add(mesh);
   const camera=new T.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=1;
   const rt=new T.RenderTarget(2,2,{type:T.UnsignedByteType});renderer.setRenderTarget(rt);
   const data=new Uint16Array(2*4*4);for(let i=0;i<data.length;i+=4)data.set([0x3400,0x3800,0x3a00,0],i);
   const bake=(slot)=>({data,indir:new Uint16Array([slot,0,0,0]),atlasW:4,atlasH:1,tilesX:1,tilesY:1,T:1,cell:1,x0:0,z0:0});
   const cases=[];
   async function sample(name){renderer.render(scene,camera);const p=await renderer.readRenderTargetPixelsAsync(rt,0,0,1,1);cases.push({name,pixel:Array.from(p)});}
   await sample('off-placeholder');
   lit.setLampBake(bake(0),[1,1,1]);await sample('valid-tile');
   wp.value.set(2,0,2);await sample('outside-extent');
   wp.value.set(.5,0,.5);lit.setLampBake(bake(0xbc00),[1,1,1]);await sample('empty-tile');
   lit.setLampBake(null,null);await sample('off-live-texture');
   const gl=renderer.backend.gl,glError=gl.getError();
   rt.dispose();geo.dispose();material.dispose();renderer.dispose();
   return {cases,glError};
  });
  rows.push({arm,...result,errors});console.log(JSON.stringify(rows.at(-1)));await context.close();
 }
 fs.mkdirSync(dirname(out),{recursive:true});
 fs.writeFileSync(out,JSON.stringify({baseline:base,backend:'webgl2',scope:'production decalLight.pool only; not full-scene pixels or GPU performance',rows},null,2));
 if(JSON.stringify(rows[0].cases)!==JSON.stringify(rows[1].cases)||rows.some(x=>x.glError||x.errors.length)||!rows[1].cases[1].pixel.some((v,i)=>i<3&&v>0))process.exitCode=1;
}finally{await shutdown()}
