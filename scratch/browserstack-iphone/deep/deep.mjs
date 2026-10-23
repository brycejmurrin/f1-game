// Deep profiling runner. usage: node deep.mjs <mode> [device] [os]
//  mode: race:<trk>:<tod>:<preset>[:scale=<x>][:ablate][:soak=<s>]   |  ui
// env: LOCAL=1 (local chromium via playwright instead of BrowserStack), RACE_S (default 40), OUT, REP (tag suffix)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const [scen, device = "iPhone 15", os = "26"] = process.argv.slice(2);
const OUT = process.env.OUT || "results"; mkdirSync(OUT, { recursive: true });
const RACE_S = +(process.env.RACE_S || 40), LOCAL = !!process.env.LOCAL;
const URL0 = process.env.URL0 || "https://brycejmurrin.github.io/f1-game/?apex";
const HELP = readFileSync(new URL("./page-helpers.js", import.meta.url), "utf8") + "\n" + readFileSync(new URL("./probe.js", import.meta.url), "utf8");
const tag = (scen.replace(/[^a-z0-9.=]+/gi, "-") + "_" + (LOCAL ? "local" : device.replace(/\s+/g, "") + "-ios" + os) + (process.env.REP ? "_r" + process.env.REP : "")).toLowerCase();
const out = { scen, device: LOCAL ? "local-chromium" : device, os, tag, startPT: new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }), steps: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ex, exA, quit, shot;
if (LOCAL) {
  const { chromium } = await import("/workspace/f1-game/node_modules/playwright/index.mjs");
  const br = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const ctx = await br.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
  const page = await ctx.newPage(); out.page = page;
  if (process.env.CPU) { const c = await ctx.newCDPSession(page); await c.send("Emulation.setCPUThrottlingRate", { rate: +process.env.CPU }); globalThis.__cdp = c; }
  globalThis.__page = page;
  ex = (s, ...a) => page.evaluate(([s, a]) => new Function(...a.map((_, i) => "a" + i), "const arguments_=[...arguments];" + s.replace(/arguments\[(\d)\]/g, "arguments_[$1]")).apply(null, a), [s, a]);
  exA = (s, ...a) => page.evaluate(([s, a]) => new Promise(res => { new Function("arguments", s)([...a, res]); }), [s, a]);
  quit = () => br.close(); shot = async n => { await page.screenshot({ path: `${OUT}/${tag}__${n}.png` }); };
  out.get = u => page.goto(u, { waitUntil: "load", timeout: 120000 });
} else {
  const { Builder } = await import("selenium-webdriver");
  const d = await new Builder().usingServer("https://hub-cloud.browserstack.com/wd/hub").withCapabilities({ browserName: "safari", "bstack:options": {
    deviceName: device, osVersion: os, realMobile: "true", deviceOrientation: "landscape", userName: process.env.BROWSERSTACK_USERNAME,
    accessKey: process.env.BROWSERSTACK_ACCESS_KEY, projectName: "Apex", buildName: "iphone-deep-" + new Date().toISOString().slice(0, 10), sessionName: tag, video: "true", consoleLogs: "verbose", idleTimeout: 120 } }).build();
  out.session = (await d.getSession()).getId(); await d.manage().setTimeouts({ script: 900000, pageLoad: 120000 });
  ex = (s, ...a) => d.executeScript(s, ...a); exA = (s, ...a) => d.executeAsyncScript(s, ...a);
  quit = () => d.quit(); shot = async n => writeFileSync(`${OUT}/${tag}__${n}.png`, await d.takeScreenshot(), "base64");
  out.get = u => d.get(u); globalThis.__d = d;
}
const get = out.get; delete out.get; const page = out.page; delete out.page;
async function waitFor(js, maxS = 60) { const t = Date.now(); for (let i = 0; i < maxS * 4; i++) { try { if (await ex("return !!(" + js + ")")) return Date.now() - t; } catch (_) {} await sleep(250); } return -1; }
async function boot() { const t = Date.now(); await get(URL0 + "&t=" + Date.now()); let w = await waitFor("window.__apex && window.__apex.race", 90); await ex("window.__bootMark=1"); await sleep(3000);
  if (!(await ex("return !!window.__bootMark").catch(() => false))) { out.reloadedAfterBoot = (out.reloadedAfterBoot || 0) + 1; w = await waitFor("window.__apex && window.__apex.race", 90); await sleep(1500); }
  await ex(HELP); return w < 0 ? -1 : Date.now() - t; }
const sample = (ms, bucket = 0) => exA(`const cb=arguments[arguments.length-1]; let done=false; const f=r=>{if(!done){done=true;cb(r)}}; setTimeout(()=>f({timeout:true}),${ms}+5000); __bs.sample(${ms},${bucket},f)`);
const J = s => ex(`try{return JSON.parse(JSON.stringify(${s}))}catch(e){return {err:String(e).slice(0,200)}}`);
async function step(name, fn) { const t = Date.now(); let r; try { r = await fn(); } catch (e) { r = { error: String(e).slice(0, 300) }; } out.steps.push({ name, ms: Date.now() - t, ...(r && typeof r === "object" ? r : { v: r }) }); console.error(tag, name, Date.now() - t); return r; }
async function measured(ms, bucket = 0) { await J("__dp.perf(true)"); const s = await sample(ms, bucket); s.perf = (await J("__dp.perf()")).spans; s.render = await J("__dp.render()"); return s; }
const save = () => writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(out, null, 1));
try {
  if (scen.startsWith("race:")) {
    const [, trk, tod, preset, ...opt] = scen.split(":"); const o = Object.fromEntries(opt.map(x => x.split("=")).map(([k, v]) => [k, v ?? true]));
    out.bootMs = await boot();
    if (preset && preset !== "default") { await ex(`localStorage.setItem('apex26.gfxPreset',JSON.stringify(arguments[0])); localStorage.setItem('apex26.gfxHigh', arguments[0]==='ultra'?'1':'0');`, preset); out.rebootMs = await boot(); }
    out.gfxMenu = await ex("return __bs.gfxInfo()"); out.renderMenu = await J("__dp.render()");
    out.diagGfx = await J("(()=>{const c=document.getElementById('game');const g=(typeof gfx!=='undefined'&&gfx)||G.gfx;let bs=null;try{bs=g.backendState()}catch(e){}return {canvas:c?{css:[c.clientWidth,c.clientHeight],buffer:[c.width,c.height]}:null,backendState:bs}})()");
    const trackId = await ex(`const re=new RegExp(arguments[0],'i'); const t=__apex.tracks().find(t=>re.test(t.id)||re.test(t.name)); return t&&t.id`, trk); out.trackId = trackId;
    await J("__apex.gpuTimer(true)");
    out.ensureMs = await exA(`const cb=arguments[arguments.length-1]; const t=performance.now(); const i=__apex.tracks().findIndex(t=>t.id===arguments[0]); const to=setTimeout(()=>cb(-1),60000); Promise.resolve(__apex.ensureCircuit(i)).then(()=>{clearTimeout(to);cb(Math.round(performance.now()-t))},e=>{clearTimeout(to);cb('err:'+e)})`, trackId);
    console.error(tag, "ensure", out.ensureMs);
    if (String(out.ensureMs).startsWith("err") || out.ensureMs < 0) { out.ensureDiag = await exA(`const cb=arguments[arguments.length-1]; const logs=(__apex.logs({})||[]).filter(l=>/track|load|bundle|circuit|script/i.test(l.ns+l.msg)).slice(-25).map(l=>[l.t,l.ns,l.level,String(l.msg).slice(0,200)]); const scripts=[...document.scripts].filter(s=>/circuits/.test(s.src)).map(s=>s.src); fetch('js/circuits/monza.js',{cache:'no-store'}).then(r=>r.text().then(t=>cb({logs,scripts,fetch:r.status,len:t.length,head:t.slice(0,120),TrackDefs:(window.TrackDefs||[]).map(d=>d.id+':'+!!(d.path&&d.path.pts)).slice(-5)})),e=>cb({logs,scripts,fetchErr:String(e)}))`); console.error(JSON.stringify(out.ensureDiag).slice(0, 3000)); }
    await step("raceEntry", async () => { const t0 = await ex("__dp.gapsOn(true); window.__t0=performance.now(); return __t0");
      await ex(`window.__rd=null;Promise.resolve(__apex.race(arguments[0],arguments[1],'dry',{laps:20})).then(()=>__rd='ok',e=>__rd='err:'+e)`, trackId, tod === "default" ? undefined : tod);
      const w = await waitFor("window.__rd", 120); await sleep(1500);
      const gaps = await ex("const g=__dp.gaps(); __dp.gapsOn(false); return g");
      if (String(await ex("return window.__rd")).startsWith("err")) throw new Error("race failed: " + await ex("return window.__rd"));
      return { entryMs: w, result: await ex("return window.__rd"), gapsTotalMs: gaps.reduce((a, g) => a + g.d, 0), gapsN: gaps.length, gapsTop: [...gaps].sort((a, b) => b.d - a.d).slice(0, 15).map(g => ({ at: Math.round(g.t - t0), d: g.d })),
        stages: await J("__apex.raceEntryStages()"), legs: await J("(__apex.raceProfile()||null)"), longtasks: await J("__dp.lt()"), res: await J("__dp.res(window.__t0)"), logs: await J("(__apex.logs({})||[]).filter(l=>l.t>0).slice(-60).map(l=>[l.t,l.ns,l.level,String(l.msg).slice(0,140)])") }; });
    save(); if (out.steps[out.steps.length-1].error) throw new Error("abort: " + out.steps[out.steps.length-1].error);
    await ex("try{__apex.go()}catch(e){}"); await ex("__bs.apStart()"); await sleep(3000);
    if (o.scale) await J(`__apex.renderScale(${+o.scale})`), await sleep(1500);
    out.gfxRace = await ex("return __bs.gfxInfo()");
    const soak = +(o.soak || 0);
    if (soak) { out.soak = []; const n = Math.ceil(soak / 30); for (let i = 0; i < n; i++) { const s = await measured(30000); s.ix = i; out.soak.push(s); console.error(tag, "soak", i, s.avgFps); save(); } }
    else await step("drive", async () => { const s = await measured(RACE_S * 1000, 10000); await shot("racing"); return s; });
    if (o.ablate) for (const [nm, m] of [["noProps", { props: true }], ["noTerrain", { terrain: true }], ["noCars", { cars: true }]]) await step("ablate-" + nm, async () => {
      if (m) await J(`__apex.meshToggle(${JSON.stringify(m)})`); else await J("__apex.occlusionCull(false)");
      await sleep(1000); const s = await measured(8000); if (m) await J("__apex.clearMeshes()"); else await J("__apex.occlusionCull(true)"); return s; });
    if (o.ablate) await step("ablate-base", () => measured(8000));
    out.ap = await ex("return __bs.apStop()");
  } else if (scen === "ui") {
    out.bootMs = await boot(); out.gfx = await ex("return __bs.gfxInfo()");
    await J("__dp.perf(true)");
    const win = async (name, fn, ms) => step(name, async () => { const t0 = await ex("return __dp.gapsOn(true)"); const r0 = fn ? await fn() : null; await sleep(ms); const g = await ex("const g=__dp.gaps(); __dp.gapsOn(false); return g");
      return { ...(r0 || {}), gapsTotalMs: g.reduce((a, x) => a + x.d, 0), gaps: g.sort((a, b) => b.d - a.d).slice(0, 8).map(x => ({ at: Math.round(x.t - t0), d: x.d })), res: await J(`__dp.res(${t0})`), lt: (await J("__dp.lt()")), logs: await J(`(__apex.logs({})||[]).filter(l=>l.t>=${Math.floor(t0)}).slice(-30).map(l=>[l.t,l.ns,l.level,String(l.msg).slice(0,140)])`) }; });
    await win("title-idle", null, 5000);
    await win("open-settings", () => ex(`document.getElementById('mb-settings').click()`), 5000);
    await shot("settings");
    await win("close-settings", () => ex(`document.getElementById('pm-settings-close').click()`), 2000);
    await win("open-race-select", () => ex(`document.getElementById('mb-race').click()`), 4000);
    await win("back-to-title", () => ex(`document.getElementById('sel-back').click()`), 4000);
    await win("open-garage", () => ex(`document.getElementById('mb-garage').click()`), 6000);
    await win("close-garage", () => ex(`document.getElementById('cs-back').click()`), 4000);
    out.menuPrep = await J("__apex.menuPrep()"); out.garagePrebuild = await J("__apex.garagePrebuild()");
  }
  out.errors = await ex("return window.__bs ? __bs.errs : null");
  await shot("end");
  if (!LOCAL) await ex(`browserstack_executor: {"action":"setSessionStatus","arguments":{"status":"passed","reason":"deep done"}}`);
} catch (e) { out.error = String(e).slice(0, 600); try { await shot("fail"); } catch (_) {} } finally { out.endPT = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }); await quit().catch(() => {}); }
save(); console.log("DONE", tag, out.session || "", out.error || "");
