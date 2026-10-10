#!/usr/bin/env node
// hud-mock.mjs — the race HUD on BLACK, every widget populated with mock
// content, a labelled box per element, ~1 s a shot. For SEEING the layout fast.
// @doc Race-HUD layout shots on black: mocked widgets, labelled boxes, overlaps in red; one race boot per pointer type, ~1 s a shot.
// @skill survey-ui-matrix
//
//   node tools/shot/hud-mock.mjs                                   # phone landscape: shipped + all-on x the main cameras
//   node tools/shot/hud-mock.mjs --devices phone-landscape-844x390,phone-se-667x375 --cams cockpit,chase
//   node tools/shot/hud-mock.mjs --hud-scale 70,100,200 --btn-scale 100,300
//   node tools/shot/hud-mock.mjs --matrix scratch/my-cells.json   # hud-survey's cell schema (normalizeCell)
//   node tools/shot/hud-mock.mjs --no-boxes --out artifacts/hud-mock/x
//
// Flags: --devices a,b (tools/lib/hud-survey-matrix.mjs DEVICES)  --cams a,b
//   --hud-scale / --ui-scale / --btn-scale a,b (percent)  --sets shipped,all-on (which opt-ins are on)
//   --preset clean|big|corners|… (MOVE & SIZE)  --matrix <file.json>  --no-boxes  --no-mock
//   --out artifacts/hud-mock/<stamp>  --gl swiftshader|llvmpipe (default $APEX_GL or llvmpipe)
//   --track monza  --frac 0.18  --list (cells, no browser)  --json (summary as the last stdout block)  --help
//
// WHY IT IS FAST. hud-survey.mjs paints a software 3D frame per cell; this tool
// paints none after boot. It builds ONE race per pointer type (touch / desktop:
// body.desktop is decided at boot), sets __apex.headless(true), hides the 3D
// canvases (black background), and HOLDS the game's requestAnimationFrame loop
// so the HUD tick cannot re-hide the mocked widgets. Every cell after that is
// DOM only: a viewport change is page.setViewportSize on the same page (fitHud
// keys on innerWidth x innerHeight), the knobs are hud-survey's applyCell, the
// fit runs through __apex.jump's forced refresh, and the capture composites DOM.
//
// WHAT IS MOCKED (and therefore approximate):
//  - the radio card, the track-limits chip and the caution flag get their widest
//    text after the last refresh (as hud-survey's transient pass), then
//    GameHud.invalidateFit re-places the card around them;
//  - DAMAGE and the track-limits strikes are real state (__apex.damage / __apex.strikes,
//    display-only), so the fit places those pieces itself;
//  - the MIRROR frame: render() is off, so its frame is shown by the pass's own
//    rule (ON, or AUTO on an onboard camera, as on a phone with a GPU), not by a
//    rendered frame; the side-of-tower placement (hud-mirror-side) is not run;
//  - nothing 3D: occlusion of the car / horizon needs hud-survey's shots.
// Overlaps use the same rules as hud-survey / hud-layout.spec (hud-geometry.mjs).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { launchChromium, shutdown, sleep, startStaticServer } from "../lib/harness.mjs";
import { CliArgError, makeFlags, runCli } from "../lib/cli-args.mjs";
import { probeHudElements, analyzeOverlap, overlapArea } from "../lib/hud-geometry.mjs";
import { DEVICES, HUD_TARGETS, normalizeCell, cellId } from "../lib/hud-survey-matrix.mjs";
import { installProbeInit } from "./probe-page.mjs";
import { applyCell, chromiumArgs } from "./hud-survey.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const KNOWN = ["--devices", "--cams", "--hud-scale", "--ui-scale", "--btn-scale", "--sets", "--preset", "--matrix", "--no-boxes",
  "--no-mock", "--out", "--gl", "--track", "--frac", "--list", "--json", "--help"];
const SETS = { "all-on": [], shipped: ["rel", "strat", "inputs"] };

export function planCells(F) {
  const list = (k, d) => F.list(k, d).filter(Boolean);
  const nums = (k) => list(k, "").map((v) => { const n = Number(v); if (!Number.isFinite(n)) throw new CliArgError(`${k}: ${v} is not a number`); return n; });
  const track = F.flag("--track", "monza");
  if (F.has("--matrix")) {
    const spec = JSON.parse(fs.readFileSync(path.resolve(ROOT, F.flag("--matrix", "")), "utf8"));
    return (Array.isArray(spec) ? spec : spec.cells).map((r) => { const c = normalizeCell(r, { track }); return { ...c, id: cellId(c) }; });
  }
  const devices = list("--devices", "phone-landscape-844x390");
  for (const d of devices) if (!DEVICES[d]) throw new CliArgError(`--devices: unknown ${d} (known: ${Object.keys(DEVICES).join(", ")})`);
  const cams = list("--cams", "cockpit,chase,hood,helmet,tv");
  const sets = list("--sets", "shipped,all-on");
  for (const s of sets) if (!SETS[s]) throw new CliArgError(`--sets: ${s} (shipped | all-on)`);
  const hs = nums("--hud-scale"), us = nums("--ui-scale"), bs = nums("--btn-scale");
  const preset = F.flag("--preset", "shipped");
  const out = [];
  for (const device of devices) for (const cam of cams) for (const set of sets)
    for (const hudScale of hs.length ? hs : [null]) for (const uiScale of us.length ? us : [null]) for (const btnScale of bs.length ? bs : [null]) {
      const raw = { device, cam, off: SETS[set], preset, track,
        ...(hudScale != null ? { hudScale } : {}), ...(uiScale != null ? { uiScale } : {}),
        ...(btnScale != null && DEVICES[device].touch ? { btnScale } : {}) };
      const c = normalizeCell(raw, { track });
      out.push({ ...c, id: [device, cam, set, hudScale && "hud" + hudScale, uiScale && "ui" + uiScale, btnScale && "btn" + btnScale,
        preset !== "shipped" && preset].filter(Boolean).join("-") });
    }
  return out;
}

// ── in-page (self-contained) ──────────────────────────────────────────────
/** Init script: a held rAF queue, so the frozen game's loop stops ticking the HUD while a cell is shot. */
function holdLoopInit() {
  const raf = window.requestAnimationFrame.bind(window);
  const q = [];
  window.__hudMock = { hold: false, release() { this.hold = false; for (const f of q.splice(0)) raf(f); } };
  window.requestAnimationFrame = (f) => (window.__hudMock.hold ? (q.push(f), 0) : raf(f));
}

/** After the cell's last refresh: the widest transient text, the mirror's own show rule, the fit re-placed around them. */
function mockWidgets(opt) {
  const $ = (id) => document.getElementById(id);
  if (opt.mock) {
    const ann = $("announce");
    if (ann) {
      const who = $("announce-who"), text = $("announce-text"), num = $("announce-num");
      if (who) who.textContent = "VERSTAPPEN · RADIO";
      if (text) text.textContent = "Box this lap — CAUTION, cheaper stop, about 23s lost";
      if (num) num.textContent = "33";
      ann.hidden = false;
    }
    const lim = $("hud-limits");   // forced only on a tree without __apex.strikes (the real strike shows it otherwise)
    if (lim && !(window.__apex && window.__apex.strikes) && !document.body.matches('[data-hud-hide~="limits"]')) { const s = lim.querySelector("span"); if (s) s.textContent = "●●●○"; lim.hidden = false; }
    const flag = $("hud-flag");
    if (flag) { if (!flag.textContent.trim()) flag.textContent = "YELLOW · SECTOR 2"; flag.hidden = false; }
  }
  const mir = $("hud-mirror");
  const a = window.__apex;
  const m = a && a.mirror ? a.mirror() : null;
  if (mir && m) {
    const onboard = { cockpit: 1, hood: 1, visor: 1, tcam: 1, helmet: 1 }[m.cam];
    const want = m.mode === "on" || (m.mode === "auto" && !!onboard);
    mir.hidden = !want;
    document.body.classList.toggle("hud-mirror-on", want);
  }
  try { GameHud.invalidateFit(); } catch { /* old tree */ }
  try { for (const an of document.getAnimations()) { try { an.finish(); } catch { /* infinite */ } } } catch { /* old engine */ }
}

/** Labelled outlines: controls yellow, readouts cyan, overlapping pairs red. */
function drawBoxes({ recs, bad }) {
  let layer = document.getElementById("hm-boxes");
  if (layer) layer.remove();
  layer = document.createElement("div");
  layer.id = "hm-boxes";
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;font:10px/1 monospace";
  for (const r of recs) {
    const d = document.createElement("div");
    const hot = bad.includes(r.key);
    const col = hot ? "#ff3b3b" : r.role === "ctrl" ? "#ffd400" : "#22d3ee";
    d.style.cssText = `position:absolute;left:${r.x}px;top:${r.y}px;width:${r.r - r.x}px;height:${r.b - r.y}px;` +
      `outline:1px ${r.role === "ctrl" ? "dashed" : "solid"} ${col};${hot ? "background:rgba(255,59,59,.22);" : ""}`;
    const t = document.createElement("span");
    t.textContent = r.key;
    t.style.cssText = `position:absolute;left:0;top:${r.y < 12 ? 1 : -11}px;color:${col};background:rgba(0,0,0,.7);padding:0 2px;white-space:nowrap`;
    d.appendChild(t);
    layer.appendChild(d);
  }
  document.body.appendChild(layer);
}

// ── node ──────────────────────────────────────────────────────────────────
async function shot(page, file) {
  const s = await page.context().newCDPSession(page);
  let timer;
  try {
    const { data } = await Promise.race([
      s.send("Page.captureScreenshot", { format: "png" }),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("capture timed out after 30 s")), 30000); }),
    ]).finally(() => clearTimeout(timer));
    fs.writeFileSync(file, Buffer.from(data, "base64"));
  } finally { await s.detach().catch(() => {}); }
}

async function bootPage(browser, plan, touch) {
  const first = DEVICES[plan.cells.find((c) => DEVICES[c.device].touch === touch).device];
  const ctx = await browser.newContext({ viewport: { width: first.w, height: first.h }, hasTouch: touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e && e.message || e).slice(0, 200)));
  await installProbeInit(page, { backend: "three" });
  await page.addInitScript(holdLoopInit);
  await page.goto(plan.url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForFunction(() => window.__apex != null && window.__apex.race, null, { polling: 100, timeout: 180000 });
  await page.evaluate((id) => window.__apex.race(id), plan.track);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 180000 });
  await sleep(800);
  await page.evaluate(() => { const a = window.__apex; a.go(); a.headless(true); });
  await page.addStyleTag({ content: "#game,#game-soft,canvas#game{visibility:hidden!important}html,body{background:#000!important}" });
  return { ctx, page, errs };
}

async function main() {
  const F = makeFlags(process.argv.slice(2), KNOWN);
  if (F.has("--help")) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 18).map((l) => l.replace(/^\/\/ ?/, "")).join("\n")); return; }
  const cells = planCells(F);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = path.resolve(ROOT, F.flag("--out", path.join("artifacts", "hud-mock", stamp)));
  if (!["artifacts", "scratch"].some((d) => !path.relative(path.join(ROOT, d), out).startsWith(".."))) throw new CliArgError("--out must stay under artifacts/ or scratch/");
  if (F.has("--list")) { for (const c of cells) console.log(c.id); console.log(`[hud-mock] ${cells.length} cells`); return; }
  const plan = { cells, track: F.flag("--track", "monza"), frac: Number(F.flag("--frac", "0.18")), boxes: !F.has("--no-boxes"), mock: !F.has("--no-mock"),
    gl: F.flag("--gl", process.env.APEX_GL === "swiftshader" ? "swiftshader" : "llvmpipe") };
  fs.mkdirSync(out, { recursive: true });
  const log = (m) => (F.has("--json") ? console.error : console.log)("[hud-mock] " + m);
  const targets = HUD_TARGETS.map((t) => ({ ...t }));
  const srv = await startStaticServer(ROOT);
  plan.url = srv.url;
  const rows = [];
  const t0 = Date.now();
  try {
    const browser = await launchChromium({ args: chromiumArgs({ backend: "three", gl: plan.gl }) });
    for (const touch of [true, false]) {
      const mine = cells.filter((c) => DEVICES[c.device].touch === touch);
      if (!mine.length) continue;
      const tb = Date.now();
      const { ctx, page, errs } = await bootPage(browser, plan, touch);
      log(`boot ${touch ? "touch" : "desktop"} in ${((Date.now() - tb) / 1000).toFixed(0)} s`);
      for (const cell of mine) {
        const t1 = Date.now();
        const dev = DEVICES[cell.device];
        await page.evaluate(() => window.__hudMock.release());
        await page.setViewportSize({ width: dev.w, height: dev.h });
        await page.evaluate((i) => {
          let st = document.getElementById("hm-ins");
          if (!st) { st = document.createElement("style"); st.id = "hm-ins"; document.head.appendChild(st); }
          st.textContent = `:root{--sal:${i.sal}px;--sar:${i.sar}px;--sat:${i.sat}px;--sab:${i.sab}px}`;
        }, dev.ins);
        // Real state where a hook exists, so the fit (and any column allocator) places the piece itself.
        if (plan.mock) await page.evaluate(() => {
          const a = window.__apex;
          try { a.damage(null, { long: 1, lat: 0.6, sev: 0.9 }); } catch { /* old tree */ }
          try { if (a.strikes) a.strikes(2); } catch { /* old tree */ }
        });
        const applied = await page.evaluate(applyCell, { ...cell, frac: plan.frac });
        await page.evaluate(async (frac) => {
          const a = window.__apex;
          a.headless(true);
          window.__hudMock.hold = true;
          for (let pass = 0; pass < 3; pass++) {
            try { GameHud.invalidateFit(); } catch { /* old tree */ }
            a.freeze(false); a.jump(frac, 60, 0); a.freeze(true);
            await new Promise((r) => setTimeout(r, 30));
          }
        }, plan.frac);
        await page.evaluate(mockWidgets, { mock: plan.mock });
        await sleep(60);
        const recs = (await page.evaluate(probeHudElements, { targets, fonts: true })).filter((r) => r.visible);
        const ov = analyzeOverlap(recs, dev.w, dev.h, dev.ins);
        const pairs = [...ov.overlaps, ...ov.hudClash].map((p) => {
          const [a, b] = p.split("+");
          const ra = recs.find((r) => r.key === a), rb = recs.find((r) => r.key === b);
          return { pair: p, px2: ra && rb ? Math.round(overlapArea(ra, rb)) : null };
        });
        const bad = [...new Set(pairs.flatMap((p) => p.pair.split("+")))];
        if (plan.boxes) await page.evaluate(drawBoxes, { recs: recs.map((r) => ({ key: r.key, role: r.role, x: r.x, y: r.y, r: r.r, b: r.b })), bad });
        const file = path.join(out, cell.id + ".png");
        await shot(page, file);
        const minFont = recs.filter((r) => r.minFontPx != null).sort((x, y) => x.minFontPx - y.minFontPx).slice(0, 3).map((r) => [r.key, r.minFontPx]);
        const smallTaps = recs.filter((r) => r.role === "ctrl" && Math.min(r.r - r.x, r.b - r.y) < 44).map((r) => [r.key, Math.round(r.r - r.x), Math.round(r.b - r.y)]);
        const slots = await page.evaluate(() => {
          const ann = document.getElementById("announce");
          return { radioSlot: document.body.dataset.radioSlot || null, announce: ann ? (ann.hidden ? "hidden" : ann.hasAttribute("data-lane-collapsed") ? "collapsed" : "shown") : null,
            dropped: [...document.querySelectorAll("[data-col-drop]")].map((e) => e.id) };
        });
        const row = { id: cell.id, cell, shot: path.relative(ROOT, file), overlaps: pairs, unsafe: ov.unsafe, minFont, smallTaps,
          visible: recs.map((r) => r.key), ...slots,
          applyErrors: applied.errors, pageErrors: errs.splice(0), ms: Date.now() - t1 };
        rows.push(row);
        log(`${cell.id}: ${pairs.length} overlaps${pairs.length ? " (" + pairs.map((p) => p.pair).join(", ") + ")" : ""}, ${row.ms} ms`);
      }
      await ctx.close().catch(() => {});
    }
  } finally {
    await shutdown();
    await srv.close?.();
  }
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify({ when: new Date().toISOString(), cells: rows }, null, 1));
  const md = ["| cell | overlaps | unsafe | smallest text | taps < 44 px |", "|---|---|---|---|---|",
    ...rows.map((r) => `| [${r.id}](${path.basename(r.shot)}) | ${r.overlaps.map((p) => `${p.pair} ${p.px2}px²`).join("<br>") || "—"} | ${r.unsafe.join(", ") || "—"} | ${r.minFont.map(([k, v]) => `${k} ${v}`).join(", ")} | ${r.smallTaps.map(([k, w, h]) => `${k} ${w}×${h}`).join(", ") || "—"} |`)];
  fs.writeFileSync(path.join(out, "index.md"), md.join("\n") + "\n");
  const sheet = spawnSync("sh", ["-c", "command -v montage"]).status === 0
    ? spawnSync("montage", [...rows.flatMap((r) => ["-label", r.id, path.join(ROOT, r.shot)]), "-tile", "3x", "-geometry", "560x+4+4", "-pointsize", "12",
      "-background", "#111", "-fill", "#eee", path.join(out, "sheet.jpg")], { timeout: 120000 }).status === 0 : false;
  log(`= hud-mock done: ${rows.length} shots in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${path.relative(ROOT, out)}${sheet ? " (sheet.jpg)" : ""}`);
  if (F.has("--json")) {
    const rel = (f) => path.relative(ROOT, path.join(out, f));
    console.log(JSON.stringify({ ok: rows.length === cells.length, out: path.relative(ROOT, out), report: rel("report.json"), index: rel("index.md"),
      sheet: sheet ? rel("sheet.jpg") : null, durationMs: Date.now() - t0,
      cells: rows.map((r) => ({ id: r.id, shot: r.shot, overlaps: r.overlaps, unsafe: r.unsafe, minFont: r.minFont, smallTaps: r.smallTaps,
        errors: [...r.applyErrors, ...r.pageErrors] })) }));
  }
}

let isEntry = false;
try { isEntry = fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { /* imported */ }
if (isEntry) runCli(main);
