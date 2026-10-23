// Apex BrowserStack iPhone profiling suite.
// usage: node suite.mjs <scenario> [device] [os]
//   scenarios: race:<trackOrRegex>:<timeOfDay>:<preset|default>[:matrix]   e.g. race:monza:default:high:matrix, race:singapore:night:default
//              ui   (menus -> garage -> livery)
// env: BROWSERSTACK_USERNAME, BROWSERSTACK_ACCESS_KEY, RACE_S (driving seconds, default 60), OUT (dir, default ./results)
import { Builder } from "selenium-webdriver";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const [scen, device = "iPhone 15", os = "26"] = process.argv.slice(2);
const OUT = process.env.OUT || "REDACTED"; mkdirSync(OUT, { recursive: true });
const RACE_S = +(process.env.RACE_S || 60);
const URL0 = "https://brycejmurrin.github.io/f1-game/?apex";
const HELP = readFileSync(new URL("./page-helpers.js", import.meta.url), "utf8");
const tag = (scen.replace(/[^a-z0-9]+/gi, "-") + "_" + device.replace(/\s+/g, "") + "-ios" + os).toLowerCase();
const out = { scen, device, os, tag, steps: [], shots: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const d = await new Builder().usingServer("https://hub-cloud.browserstack.com/wd/hub").withCapabilities({ browserName: "safari", "bstack:options": {
  deviceName: device, osVersion: os, realMobile: "true", deviceOrientation: "landscape", userName: process.env.BROWSERSTACK_USERNAME || "REDACTED",
  accessKey: process.env.BROWSERSTACK_ACCESS_KEY, projectName: "Apex", buildName: "iphone-suite-" + new Date().toISOString().slice(0, 10), sessionName: tag, video: "true", consoleLogs: "verbose", idleTimeout: 120 } }).build();
const ex = (s, ...a) => d.executeScript(s, ...a);
const exA = (s, ...a) => d.executeAsyncScript(s, ...a);
async function shot(name) { const f = `${OUT}/${tag}__${name}.png`; writeFileSync(f, await d.takeScreenshot(), "base64"); out.shots.push(f); }
async function waitFor(js, maxS = 60) { const t = Date.now(); for (let i = 0; i < maxS * 4; i++) { try { if (await ex("return !!(" + js + ")")) return Date.now() - t; } catch (_) {} await sleep(250); } return -1; }
async function boot() { const t = Date.now(); await d.get(URL0 + "&t=" + Date.now()); const w = await waitFor("window.__apex && window.__apex.race", 90); await ex(HELP); return w < 0 ? -1 : Date.now() - t; }
const sample = (ms, bucket = 0) => exA(`const cb=arguments[arguments.length-1]; __bs.sample(${ms},${bucket},cb)`);
async function step(name, fn) { const t = Date.now(); let r; try { r = await fn(); } catch (e) { r = { error: String(e).slice(0, 300) }; } out.steps.push({ name, ms: Date.now() - t, ...(r && typeof r === "object" ? r : { v: r }) }); console.error(tag, name, Date.now() - t); return r; }
async function clickId(id, waitSel, maxS = 20) { const t = Date.now(); const ok = await ex(`const e=document.getElementById(arguments[0]); if(!e) return false; e.click(); return true;`, id); if (!ok) return { error: "no #" + id }; const w = waitSel ? await waitFor(`document.querySelector('${waitSel}')`, maxS) : 0; return { transitionMs: w < 0 ? -1 : Date.now() - t }; }
try {
  out.session = (await d.getSession()).getId();
  await d.manage().setTimeouts({ script: 240000, pageLoad: 120000 });
  if (scen.startsWith("race:")) {
    const [, trk, tod, preset, matrix] = scen.split(":");
    out.bootMs = await boot();
    if (preset && preset !== "default") {
      await ex(`localStorage.setItem('apex26.gfxPreset',JSON.stringify(arguments[0])); localStorage.setItem('apex26.gfxHigh', arguments[0]==='ultra'?'1':'0');`, preset);
      out.rebootMs = await boot();
    }
    out.gfxMenu = await ex("return __bs.gfxInfo()");
    const trackId = await ex(`const re=new RegExp(arguments[0],'i'); const t=__apex.tracks().find(t=>re.test(t.id)||re.test(t.name)); return t&&t.id`, trk);
    out.trackId = trackId;
    await step("raceEntry", async () => { await ex(`window.__rd=null;Promise.resolve(__apex.race(arguments[0],arguments[1],'dry',{laps:20})).then(()=>__rd='ok',e=>__rd='err:'+e)`, trackId, tod === "default" ? undefined : tod);
      const w = await waitFor("window.__rd", 120); return { entryMs: w, result: await ex("return window.__rd") }; });
    await ex("try{__apex.go()}catch(e){}");
    await ex("__bs.apStart()");
    await sleep(3000);
    out.gfxRace = await ex("return __bs.gfxInfo()");
    out.drive = await step("drive", async () => { const s = await sample(RACE_S * 1000, 10000); await shot("racing"); return s; });
    out.ap1 = await ex("return __bs.apStop()"); await ex("__bs.apStart()");
    out.info = await ex("try{return JSON.parse(JSON.stringify(__apex.info()))}catch(e){return String(e)}");
    if (matrix) {
      for (const sc of [1, 0.75, 0.5]) await step("scale" + sc, async () => { await ex(`__apex.renderScale(${sc})`); await sleep(1500); const s = await sample(12000); s.got = await ex("return __apex.renderScale().scale"); return s; });
      await step("upscale0.75", async () => { const u = await ex("return __apex.spatialUpscale(1)"); await ex("__apex.renderScale(0.75)"); await sleep(1500); const s = await sample(12000); s.upscale = await ex("return __apex.spatialUpscale()"); s.set = u; await shot("upscale075"); return s; });
      await ex("try{__apex.spatialUpscale(0);__apex.renderScale(true)}catch(e){}");
    }
    out.ap2 = await ex("return __bs.apStop()");
  } else if (scen === "ui") {
    out.bootMs = await boot();
    out.gfx = await ex("return __bs.gfxInfo()");
    await shot("title");
    await step("title-idle", () => sample(5000));
    // menus
    await step("open-settings", () => clickId("mb-settings", "#pmsettings:not([hidden])"));
    await step("settings-idle", () => sample(4000));
    await shot("settings");
    await step("close-settings", async () => { const t = Date.now(); await ex(`document.getElementById('pm-settings-close').click();`); const w = await waitFor("document.getElementById('pmsettings').hidden || !document.getElementById('pmsettings').open", 10); return { transitionMs: w < 0 ? -1 : Date.now() - t }; });
    await step("open-race-select", () => clickId("mb-race", "#select:not([hidden])"));
    await step("select-idle", () => sample(4000));
    await shot("race-select");
    await step("back-from-select", async () => { const r = await clickId("sel-back", "#overlay:not([hidden])", 10); return r; });
    await step("title-again-idle", () => sample(3000));
    // garage
    await step("open-garage", () => clickId("mb-garage", '#carsetup:not([hidden]):not([aria-busy="true"])', 40));
    await sleep(1500);
    await step("garage-idle", () => sample(6000));
    await shot("garage");
    await step("garage-orbit", async () => { const p = exA(`const cb=arguments[arguments.length-1]; __bs.sample(8000,0,cb)`); for (let i = 0; i < 8; i++) { await ex(`try{__apex.garageFrame({az:${i * 0.8}})}catch(e){}`); await sleep(900); } return await p; });
    const teams = await ex("return __apex.teams().map(t=>t.id)");
    for (const t of teams.slice(1, 4)) await step("team-" + t, async () => { const t0 = Date.now(); const r = await ex(`return JSON.parse(JSON.stringify(__apex.garageTeam(arguments[0])||null))`, t); await sleep(300); const s = await sample(3000); return { switchCallMs: Date.now() - t0 - 3300, ok: !!(r && r.label), ...s }; });
    await shot("garage-team");
    await step("parts", async () => { const r = await ex(`try{const tabs=[...document.querySelectorAll('[id^="cs-tab-"]')].map(b=>b.id+':'+(b.textContent||'').trim().slice(0,20));return tabs}catch(e){return String(e)}`); return { tabs: r }; });
    // livery
    await step("open-livery-tab", async () => { const t = Date.now(); const id = await ex(`const b=[...document.querySelectorAll('[id^="cs-tab-"]')].find(b=>/livery|paint|design|colou?r/i.test(b.textContent||'')); if(!b) return null; b.click(); return b.id;`); const w = await waitFor(`document.querySelector('#cs-tab-livery[aria-selected="true"]') && document.querySelector('#cs-options > *')`, 15); return { tab: id, transitionMs: w < 0 ? -1 : Date.now() - t }; });
    await shot("livery");
    for (let i = 0; i < 6; i++) await step("livery-apply-" + i, async () => {
      const r = await ex(`const ps=[...document.querySelectorAll('#cs-options [data-cs-pill]:not([disabled]), #cs-options [data-cs-finish]:not([disabled]), #cs-options button:not([disabled])')].filter(b=>b.offsetParent); if(!ps.length) return null; const b=ps[(arguments[0]*7+3)%ps.length]; b.click(); return (b.dataset.csPill||(b.dataset.csFinish&&'finish:'+b.dataset.csFinish)||(b.id||b.textContent||'').trim().slice(0,30))+' /'+ps.length;`, i);
      const t = Date.now(); await exA(`const cb=arguments[arguments.length-1]; requestAnimationFrame(()=>requestAnimationFrame(()=>cb(1)))`); const twoFrames = Date.now() - t;
      const s = await sample(2500); return { pill: r, applyTo2FramesMs: twoFrames, ...s };
    });
    await shot("livery-after");
    await step("close-garage", () => clickId("cs-back", "#overlay:not([hidden])", 15));
  }
  out.errors = await ex("return window.__bs ? __bs.errs : null");
  try { out.logs = await ex("try{return (__apex.logs({level:'warn'})||[]).slice(-15).map(l=>JSON.stringify(l).slice(0,200))}catch(e){return String(e)}"); } catch (_) {}
  await shot("end");
  await ex(`browserstack_executor: {"action":"setSessionStatus","arguments":{"status":"passed","reason":"suite done"}}`);
} catch (e) { out.error = String(e).slice(0, 600); try { await shot("fail"); } catch (_) {} } finally { await d.quit().catch(() => {}); }
writeFileSync(`${OUT}/${tag}.json`, JSON.stringify(out, null, 1)); console.log("DONE", tag, out.error || "");
