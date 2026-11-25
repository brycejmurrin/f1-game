// #6588 (HUD readout overlaps, readouts ON) and #5835 step 2 (TT pit lane) on Bryce's 2026-11-25 10:32Z export.
// node scratch/extra.mjs <portrait|standalone|mac> <hud|pit> [cam] [shot.png]  → JSON on stdout
import { chromium } from "playwright";
import { brycePhone, openBrycePhone, seedStoreInPage, readBackInPage } from "./lib/bryce-phone.mjs";

const [win = "standalone", task = "hud", cam = "chase", shot] = process.argv.slice(2);
const browser = await chromium.launch();
let context, page, insets;
if (win === "mac") {
  // His 16-inch MacBook Pro: 1728x1117 CSS px @2x, fine pointer. His export seeded the same way (all keys verbatim).
  const p = brycePhone({ window: "standalone" });
  context = await browser.newContext({ viewport: { width: 1728, height: 1117 }, deviceScaleFactor: shot ? 2 : 1 });
  if (!process.env.FRESH) await context.addInitScript(seedStoreInPage, p.localStorage);
  page = await context.newPage(); insets = { top: 0, left: 0, bottom: 0, right: 0 };
} else {
  ({ context, page } = await openBrycePhone(browser, { window: win, dpr: shot ? 2 : 1 }));
  insets = brycePhone({ window: win }).insets;
}
if (task === "hud") await context.addInitScript(() => { try { localStorage.setItem("apex26.hudElements", JSON.stringify({ speed: "on", gear: "on", energy: "on", ot: "on", aero: "on", rel: "off" })); } catch (_) {} });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message || e).slice(0, 160)));
await page.goto("http://127.0.0.1:3456/", { waitUntil: "load" });
await page.waitForFunction(() => window.__apex && __apex.race && __apex.tt, null, { timeout: 90000 });
await page.waitForTimeout(2500);
const env = await page.evaluate(readBackInPage);
const rectsOf = (ids) => page.evaluate((ids) => Object.fromEntries(ids.map((id) => { const el = document.getElementById(id);
  if (!el || el.closest("[hidden]")) return [id, null]; const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return [id, null];
  const r = el.getBoundingClientRect(); return [id, r.width > 0 ? { x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1) } : null]; })), ids);
let out;
if (task === "hud") {
  await page.evaluate(() => __apex.race("bahrain"));
  await page.evaluate((cam) => { __apex.go(); if (cam !== "stored") __apex.camera(cam); }, cam);
  await page.waitForFunction(() => { const h = document.getElementById("hud"); return h && getComputedStyle(h).visibility !== "hidden"; }, null, { timeout: 60000 });
  await page.waitForTimeout(6000); // settle (the #6598 survey saw a card still moving at +3 s)
  const ids = ["hud-speed", "hud-gearbox", "hud-energy", "hud-ot", "hud-aero", "hud-tyre", "hud-sectors", "hud-box-pos", "hud-box-lap", "hud-box-time", "hud-box-best", "minimap", "hud-mirror", "hud-gap-ahead", "hud-gap-behind", "pausebtn", "btn-cam"];
  const a = await rectsOf(ids);
  await page.waitForTimeout(1500);
  const b = await rectsOf(ids); // second read: a rect that moved between reads is transient
  const pairs = [];
  const live = ids.filter((id) => b[id]);
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const A = b[live[i]], B = b[live[j]];
    const ix = Math.min(A.r, B.r) - Math.max(A.x, B.x), iy = Math.min(A.b, B.b) - Math.max(A.y, B.y);
    if (ix > 0 && iy > 0) pairs.push({ a: live[i], b: live[j], ix: +ix.toFixed(1), iy: +iy.toFixed(1) });
  }
  const moved = ids.filter((id) => JSON.stringify(a[id]) !== JSON.stringify(b[id]));
  out = { cam: await page.evaluate(() => __apex.camera().mode), rects: b, overlaps: pairs, moved };
} else {
  await page.evaluate(() => __apex.tt("bahrain"));
  await page.evaluate(() => __apex.go());
  await page.waitForTimeout(2500);
  const p0 = await page.evaluate(() => ({ ...__apex.pit(), total: __apex.info().total }));
  // Start ~700 m before the box at racing speed, then let SoakRun's "box" policy drive the entry, the lane and the stop.
  const frac = ((p0.atM - 700) / p0.total);
  // Cross the line first (the out-lap 0 -> 1), so the lap run through the lane is a timed lap 1.
  await page.evaluate(() => __apex.jump(0.985, 60, 0));
  for (let k = 0; k < 10 && await page.evaluate(() => (__apex.fieldLaps()[0].lap || 0) < 1); k++) await page.evaluate(() => { try { __apex.rollout({ seconds: 1, policy: "autopilot" }); } catch (_) {} });
  await page.evaluate((f) => __apex.jump(f, 60, 0, { keepLap: true }), frac);
  const CTL = !!process.env.CTL;
  const trace = []; let lane = null, box = null;
  for (let k = 0; k < 40 && !box && !CTL; k++) {
    const r = await page.evaluate(() => { let ran = null; try { ran = __apex.rollout({ seconds: 1, policy: "box" }); } catch (e) { ran = { err: String(e.message || e) }; }
      const p = __apex.pit(), ph = __apex.physState ? __apex.physState() : {}, hp = document.getElementById("hud-pit");
      return { stop: ran && (ran.stoppedEarly || ran.err || ran.name) || null, state: p.state, inLane: p.inLane, limitKph: p.limitKph,
        kph: ph.speed != null ? ph.speed * 3.6 : null, speedo: (document.getElementById("hud-speed-n") || document.getElementById("hud-speed") || {}).textContent || null,
        cue: hp && !hp.hidden && getComputedStyle(hp).display !== "none" ? hp.textContent.replace(/\s+/g, " ").trim().slice(0, 80) : null }; });
    trace.push(r); console.error(k, JSON.stringify(r).slice(0, 200));
    if (!lane && r.cue) { await page.waitForTimeout(700); lane = { at: k, ...r, rects: await rectsOf(["hud-pit", "hud-pit-arrow", "hud-speed", "hud-box-lap", "pausebtn"]) };
      if (shot) await page.screenshot({ path: shot.replace(/\.png$/, "-lane.png"), timeout: 120000 }); }
    if (r.state === "box" || (r.stop && /box|missed|closed|no-pit|released/.test(JSON.stringify(r.stop)))) { await page.waitForTimeout(1500); box = { at: k, ...r,
      cueNow: await page.evaluate(() => { const hp = document.getElementById("hud-pit"); return hp && !hp.hidden ? hp.textContent.replace(/\s+/g, " ").trim().slice(0, 80) : null; }),
      rects: await rectsOf(["hud-pit", "hud-pit-actions", "pit-end-tt", "pausebtn"]),
      actions: await page.evaluate(() => [...document.querySelectorAll("#hud-pit-actions > button")].filter((b) => !b.hidden).map((b) => { const r = b.getBoundingClientRect(); return { id: b.id, text: b.textContent.trim(), w: +r.width.toFixed(1), h: +r.height.toFixed(1), x: +r.left.toFixed(1), y: +r.top.toFixed(1) }; })) }; }
  }
  if (shot && box) await page.screenshot({ path: shot.replace(/\.png$/, "-box.png"), timeout: 120000 });
  // Drive on (autopilot) across the line, then read the player's completed lap from the lap log.
  const before = await page.evaluate(() => ({ n: (__apex.fieldLaps()[0].laps || []).length, lap: __apex.fieldLaps()[0].lap }));
  let after = null;
  for (let k = 0; k < 30; k++) {
    after = await page.evaluate(() => { try { __apex.rollout({ seconds: 2, policy: "autopilot" }); } catch (_) {} const f = __apex.fieldLaps()[0]; return { n: (f.laps || []).length, last: (f.laps || []).slice(-1)[0] || null, s: __apex.physState().s }; });
    if (after.n > before.n) break;
  }
  const laps = { before, after };
  out = { pit0: { atM: p0.atM, lenM: p0.lenM, limitKph: p0.limitKph, enabled: p0.enabled }, startFrac: +frac.toFixed(4), lane, box, trace: trace.map((t) => [t.state, t.kph && +(+t.kph).toFixed(1), t.cue && t.cue.slice(0, 30), t.stop && JSON.stringify(t.stop).slice(0, 60)]), laps };
}
if (shot && task === "hud") await page.screenshot({ path: shot, timeout: 120000 });
console.log(JSON.stringify({ window: win, task, viewport: env.viewport, insets: env.insets, uiScale: env.uiScaleVar, hudBtn: env.stored.hudBtnScale, ...out, errors }, null, 1));
await browser.close();
