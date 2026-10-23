import { launchChromium } from '/workspace/f1-game-explore/tools/lib/harness.mjs';
import { captureGpuOptions } from '/workspace/f1-game-explore/tools/lib/browser-workers.mjs';
import fs from 'fs';
const O='/workspace/apex-status/live-pages-2026-10-22'; const plan=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const b=await launchChromium({...captureGpuOptions({gpu:'swiftshader'})});
const out={log:[],res:[]};
for(const sc of plan){
 const ctx=await b.newContext({viewport:{width:sc.w,height:sc.h},hasTouch:!!sc.touch,isMobile:!!sc.touch,deviceScaleFactor:1});
 const p=await ctx.newPage(); const t0=Date.now();
 p.on('console',m=>{if(['error','warning'].includes(m.type()))out.log.push(sc.name+' '+m.type()+' '+m.text().slice(0,250))}); p.on('pageerror',e=>out.log.push(sc.name+' PAGEERR '+String(e).slice(0,300)));
 try{
 await p.goto('https://brycejmurrin.github.io/f1-game/?apex',{waitUntil:'domcontentloaded',timeout:90000});
 await p.waitForFunction(()=>window.__apex!=null,null,{timeout:120000,polling:250}); await p.waitForTimeout(sc.settle||8000);
 for(const a of sc.steps){
  try{
  if(a.wait) await p.waitForTimeout(a.wait);
  if(a.click) await p.evaluate(s=>{const e=document.querySelector(s); if(!e) throw new Error('no '+s); e.click()},a.click);
  if(a.eval) out.res.push({sc:sc.name,eval:a.eval.slice(0,60),v:await p.evaluate(x=>{return (async()=>{const r=await (new Function('return ('+x+')'))(); return r===undefined?null:JSON.parse(JSON.stringify(r))})()},a.eval)});
  if(a.measure) out.res.push({sc:sc.name,measure:a.measure,v:await p.evaluate(sels=>sels.map(s=>{const e=document.querySelector(s); if(!e) return {s,missing:true}; const r=e.getBoundingClientRect(),cs=getComputedStyle(e); return {s,x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0,sw:e.scrollWidth,cw:e.clientWidth,sh:e.scrollHeight,ch:e.clientHeight,fs:cs.fontSize,vis:cs.display!=='none'&&cs.visibility!=='hidden',ovx:cs.overflowX}}),a.measure)});
  if(a.shot) await p.screenshot({path:`${O}/${a.shot}.png`});
  if(a.key) await p.keyboard.press(a.key);
  }catch(e){out.log.push(sc.name+' STEPERR '+JSON.stringify(a).slice(0,80)+' '+String(e).slice(0,200))}
 }}catch(e){out.log.push(sc.name+' FAIL '+String(e).slice(0,300))}
 out.res.push({sc:sc.name,ms:Date.now()-t0}); await ctx.close();
}
fs.writeFileSync(`${O}/${process.argv[3]}.json`,JSON.stringify(out,null,1)); console.log('done'); await b.close(); process.exit(0);
