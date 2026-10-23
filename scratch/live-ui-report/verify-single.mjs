import { createRequire } from "node:module";
const { chromium } = createRequire("/home/box/mcp/apex-f1/package.json")("playwright");
const F = "file:///workspace/apex-status/live-ui-report/live-ui-findings-2026-10-22.single.html", V = "/workspace/apex-status/live-ui-report/verify-single";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
for (const [tag, vp] of [["desk",{width:1280,height:900}],["phone",{width:390,height:844}]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: tag==="phone"?2:1, offline: true });
  const blocked = [];
  await ctx.route("**/*", r => { const u = r.request().url(); if (u.startsWith("file:")) return r.continue(); blocked.push(u); r.abort(); });
  const p = await ctx.newPage();
  await p.goto(F, { waitUntil: "load" });
  const r = await p.evaluate(async()=>{await Promise.all([...document.querySelectorAll("img:not(#lb img)")].map(i=>i.complete?0:new Promise(z=>{i.onload=i.onerror=z})));return {n:document.querySelectorAll("img:not(#lb img)").length,broken:[...document.querySelectorAll("img:not(#lb img)")].filter(i=>!i.naturalWidth).length,hs:document.documentElement.scrollWidth>innerWidth}});
  console.log(tag, JSON.stringify(r), "blocked requests", blocked.length);
  await p.screenshot({ path: `${V}/${tag}-top.png` });
  for (const id of ["garage","hud","menus","perf"]) { await p.evaluate(id=>{document.getElementById(id).scrollIntoView();scrollBy(0,-60)},id); await p.screenshot({ path: `${V}/${tag}-${id}.png` }); }
  await p.locator("main img").first().click(); await p.waitForTimeout(150);
  console.log(tag, "lightbox opens", await p.evaluate(()=>!document.getElementById("lb").hidden)); await p.screenshot({ path: `${V}/${tag}-zoom.png` });
  await ctx.close();
}
await b.close();
