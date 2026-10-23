import { createRequire } from "node:module";
const require = createRequire("/workspace/f1-game-explore/package.json");
const { chromium } = require("playwright");
const F = "file:///workspace/f1-game-explore/scratch/live-ui-findings-2026-10-22/index.html", V = "/workspace/apex-status/live-ui-report/verify";
const b = await chromium.launch();
for (const [tag, vp] of [["desk",{width:1280,height:900}],["phone",{width:390,height:844}]]) {
  const p = await b.newPage({ viewport: vp, deviceScaleFactor: tag==="phone"?2:1 });
  await p.goto(F); await p.evaluate(()=>Promise.all([...document.images].map(i=>{i.loading="eager";return i.complete?0:new Promise(r=>{i.onload=i.onerror=r})})));
  const bad = await p.evaluate(()=>[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src));
  console.log(tag, "images", await p.evaluate(()=>document.images.length), "broken", bad.length, bad.slice(0,3), "hscroll", await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
  await p.screenshot({ path: `${V}/${tag}-top.png` });
  for (const id of ["garage","hud","menus","perf"]) { await p.locator("#"+id).scrollIntoViewIfNeeded(); await p.evaluate(id=>{document.getElementById(id).scrollIntoView();scrollBy(0,-60)},id); await p.waitForTimeout(200); await p.screenshot({ path: `${V}/${tag}-${id}.png` }); }
  await p.evaluate(()=>{document.getElementById("ok").open=true;document.getElementById("ok").scrollIntoView()}); await p.waitForTimeout(300); await p.screenshot({ path: `${V}/${tag}-ok.png` });
}
await b.close();
