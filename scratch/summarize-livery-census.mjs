// Markdown summary of game-livery-census.json (scratch/garage-livery-census.mjs) for the job summary.
// node scratch/summarize-livery-census.mjs [path] — prints to stdout; never fails the job.
import {readFileSync} from 'node:fs';
const r=JSON.parse(readFileSync(process.argv[2]||'game-livery-census.json','utf8'));
const KEYS=['build','buildComplete','buildAtlas','gpu.createRenderPipeline','pipelineCreated','pipelineAsyncCreated','shaderModulesCreated','gl.compileShader','gl.linkProgram','gpu.writeTexture','gpu.copyExternalImageToTexture','gl.texImage2D','gl.texSubImage2D','gl.texImage3D','textureCreated','bufferCreatedBytes'];
const out=[`## Garage livery census — ${r.request.slice(0,8)} ${r.software?'(SOFTWARE smoke)':''}`,`browser ${r.browserVersion||'?'} · ok=${r.ok}`];
for(const a of r.arms){
  out.push('',`### ${a.arm} — adapter ${JSON.stringify(a.adapter)} · api ${a.backend?.api} softAdapter=${a.backend?.softAdapter}`);
  if(a.error)out.push('ERROR: '+a.error.split('\n')[0]);
  out.push(`garage entry ${a.entry?.ms} ms · idle garage p50 ${a.idleGarage?.p50Ms} ms p95 ${a.idleGarage?.p95Ms} · idle after p50 ${a.idleAfter?.p50Ms} p95 ${a.idleAfter?.p95Ms}`);
  const sum={};const by={};
  for(const e of a.edits.filter(e=>!e.missing)){const k=e.kind;(by[k]||(by[k]={n:0,next:[],long:0,max:0,c:{}}));const b=by[k];b.n++;b.next.push(e.nextFrameMs);b.long+=e.longTaskMs;b.max=Math.max(b.max,e.maxMs||0);
    for(const [x,v] of Object.entries({...e.delta,...e.alloc}))if(KEYS.includes(x)){b.c[x]=(b.c[x]||0)+v;sum[x]=(sum[x]||0)+v;}}
  out.push('','| kind | n | next-frame median ms | worst frame ms | long-task ms | counts (sum) |','|---|---|---|---|---|---|');
  for(const [k,b] of Object.entries(by)){const s=b.next.slice().sort((x,y)=>x-y);out.push(`| ${k} | ${b.n} | ${s[s.length>>1]} | ${b.max} | ${b.long.toFixed(0)} | ${Object.entries(b.c).map(([x,v])=>x+'='+Math.round(v)).join(' ')} |`);}
  out.push('',`totals: ${Object.entries(sum).map(([x,v])=>x+'='+Math.round(v)).join(' ')}`,`missing edits: ${a.edits.filter(e=>e.missing).length} · pageErrors ${a.pageErrors.length}`);
}
console.log(out.join('\n'));
