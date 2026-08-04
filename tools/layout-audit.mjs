#!/usr/bin/env node
// LAYOUT AUDIT — every screen, on every shape of display, measured the same way.
//
// WHY THIS EXISTS. The layout bugs in this app are not bugs in a screen, they are
// bugs in a CELL of a matrix: a screen crossed with a viewport. The circuit list
// stopped 49px above the sheet floor only in the two-column branch; the garage
// stacked its categories only at the sheet's 430px floor width; the preview card
// clipped its chip row only where the column was shorter than the card. Every one
// of those was found by looking at one screenshot and missed everywhere else,
// because nothing enumerated the matrix.
//
// So: MEASURE FIRST, LOOK SECOND. Screenshots are slow (SwiftShader, seconds to
// minutes each) and prove nothing you can grep. The probe below reads geometry
// out of the live DOM — what overflows, what is clipped, what is off screen, what
// is too small to tap, what scrolls and whether it reaches the floor — for every
// (screen, viewport) pair, and writes both JSON and a gallery page. Shots are
// opt-in (--shots) and are for the eye, after the numbers say where to look.
//
//   node tools/layout-audit.mjs                  # measure every cell, write JSON + HTML
//   node tools/layout-audit.mjs --shots          # also capture a PNG per cell (slow)
//   node tools/layout-audit.mjs --screens=select,garage --viewports=ios-*
//
// Output: artifacts/layout-audit/{audit.json,index.html,shots/*.png}
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const require = createRequire(ROOT + "/");
const { chromium, devices } = require("playwright");

const OUT = path.join(ROOT, "artifacts", "layout-audit");
const SHOT_DIR = path.join(OUT, "shots");

// ---------------------------------------------------------------- the matrix
// VIEWPORTS: the shapes a display can be, not the devices people own. Each one
// exists because some layout branch turns on or off at it.
const VIEWPORTS = [
  ["ios-iphone-portrait",   { ...devices["iPhone 15 Pro"], deviceScaleFactor: 2 },
    "the phone as most people hold it"],
  ["ios-iphone-landscape",  { ...devices["iPhone 15 Pro landscape"], deviceScaleFactor: 2 },
    "the shape the game is PLAYED in — 343px of height for everything"],
  ["ios-ipad-portrait",     { ...devices["iPad Pro 11"], deviceScaleFactor: 1 },
    "wide sheet, tall window: the case that wants bands, not columns"],
  ["ios-ipad-landscape",    { ...devices["iPad Pro 11 landscape"], deviceScaleFactor: 1 },
    "wide and short: the two-column case at its smallest"],
  ["desktop-1280x800",      { viewport: { width: 1280, height: 800 } },
    "a small laptop"],
  ["desktop-1440x900",      { viewport: { width: 1440, height: 900 } },
    "the common desktop"],
  ["desktop-1920x1080",     { viewport: { width: 1920, height: 1080 } },
    "full screen on a 1080p monitor"],
  ["desktop-windowed-1920x937", { viewport: { width: 1920, height: 937 } },
    "the same monitor with browser chrome — 143px less"],
  ["desktop-narrow-860x560", { viewport: { width: 860, height: 560 } },
    "a small window, or a maximised one at 125% zoom"],
  ["desktop-portrait-1080x1920", { viewport: { width: 1080, height: 1920 } },
    "a rotated monitor: portrait window, but the sheet is capped landscape"],
];

// SCREENS: how to get there, and what the eye is supposed to land on. `open`
// runs in Playwright; anything that throws marks the cell skipped rather than
// failing the sweep, because a screen that cannot be reached is itself a finding.
const SCREENS = [
  { id: "title", name: "Title / main menu", root: "#overlay", open: async () => {} },
  { id: "select", name: "Circuit select", root: "#select", open: async (p) => {
      await p.click("#mb-race"); await p.waitForSelector("#select:not([hidden])", { timeout: 15000 }); } },
  { id: "garage", name: "Garage", root: "#carsetup", open: async (p) => {
      await p.click("#mb-garage"); await p.waitForSelector("#carsetup:not([hidden])", { timeout: 15000 });
      await p.evaluate(() => { const t = [...document.querySelectorAll("#cs-tabs .cs-tab")];
        (t.find((e) => /ENGINE/i.test(e.textContent)) || t[1] || t[0])?.click(); }); } },
  { id: "career", name: "Career hub", root: "#career", open: async (p) => {
      await p.click("#mb-career"); await p.waitForSelector("#career:not([hidden])", { timeout: 15000 }); } },
  { id: "datahub", name: "F1 data hub", root: "#datahub", open: async (p) => {
      await p.click("#mb-data"); await p.waitForSelector("#datahub:not([hidden])", { timeout: 15000 });
      await p.waitForTimeout(1200); } },
  { id: "howtoplay", name: "How to play", root: "#howtoplay", open: async (p) => {
      await p.click("#mb-help"); await p.waitForSelector("#howtoplay:not([hidden])", { timeout: 15000 }); } },
  { id: "settings", name: "Settings", root: "#pmsettings", open: async (p) => {
      await p.click("#mb-settings"); await p.waitForSelector("#pmsettings:not([hidden])", { timeout: 15000 }); } },
  // The VS FRIEND lobby is the densest sheet in the game — two multi-hundred-
  // character code boxes, a QR, copy buttons and a room code — and it was the
  // one screen the grid did not cover. It is also all of css/overlays.css's
  // trailing block, the part that spent this long outside its cascade layer.
  // No peer is dialled: the lobby opens on its own and the layout is the same
  // whether or not anyone answers.
  { id: "vsfriend", name: "VS friend lobby", root: "#vsfriend", open: async (p) => {
      await p.click("#mb-vs"); await p.waitForSelector("#vsfriend:not([hidden])", { timeout: 15000 });
      await p.waitForTimeout(600); } },
  // The garage owns the team card now (#cs-team-card, TEAM tab) — the select
  // screen's #sel-team-card is gone. Reaching a screen by the route a player
  // takes is the point; when the route moves, the audit's own path has to move.
  { id: "teampicker", name: "Team picker", root: "#teampicker", open: async (p) => {
      await p.click("#mb-garage"); await p.waitForSelector("#carsetup:not([hidden])", { timeout: 15000 });
      await p.evaluate(() => { const t = [...document.querySelectorAll("#cs-tabs .cs-tab")];
        (t.find((e) => /TEAM/i.test(e.textContent)) || t[0])?.click(); });
      await p.waitForTimeout(400);
      await p.click("#cs-team-card");
      await p.waitForSelector("#teampicker:not([hidden])", { timeout: 15000 }); } },
  // START on the select screen goes to the GARAGE, not to race settings — the
  // garage is a step on the way now, and its DONE carries on to the settings.
  { id: "racesettings", name: "Race settings", root: "#race-settings", open: async (p) => {
      await p.click("#mb-race"); await p.waitForSelector("#select:not([hidden])", { timeout: 15000 });
      await p.click("#sel-go"); await p.waitForSelector("#carsetup:not([hidden])", { timeout: 15000 });
      await p.click("#cs-done");
      await p.waitForSelector("#race-settings:not([hidden])", { timeout: 15000 }); } },
  { id: "results", name: "Results", root: "#results", open: async (p) => {
      await p.evaluate(async () => { await window.__apex.race("monza"); });
      await p.waitForFunction(() => window.__apex.info().track === "monza", null, { timeout: 40000 });
      await p.evaluate(() => { window.__apex.go(); window.__apex.setLap(3); window.__apex.finishRace(); });
      await p.waitForSelector("#results:not([hidden])", { timeout: 20000 }); } },
  { id: "pause", name: "Pause menu", root: "#pausemenu", open: async (p) => {
      await p.evaluate(async () => { await window.__apex.race("monza"); });
      await p.waitForFunction(() => window.__apex.info().track === "monza", null, { timeout: 40000 });
      await p.evaluate(() => { window.__apex.go(); window.__apex.jump(0.2, 40); });
      await p.evaluate(() => { document.getElementById("pausemenu").hidden = false; });
      await p.waitForTimeout(300); } },
  { id: "hud", name: "In-race HUD", root: "#hud", open: async (p) => {
      await p.evaluate(async () => { await window.__apex.race("monza"); });
      await p.waitForFunction(() => window.__apex.info().track === "monza", null, { timeout: 40000 });
      await p.evaluate(() => { window.__apex.go(); window.__apex.jump(0.2, 45); window.__apex.snapCam(); });
      await p.waitForTimeout(600); } },
];

// ------------------------------------------------------------------ the probe
// Runs in the page. Everything here is geometry — no screenshots, no judgement
// calls that depend on colour or style, so a result can be diffed build to build.
const PROBE = (rootSel) => {
  const vw = innerWidth, vh = innerHeight;
  const root = document.querySelector(rootSel);
  const px = (n) => Math.round(n);
  const SCROLLERS = ".pane,#sel-body,.panel-scroll,.scroll-y,.dh-content,#track-detail-body";
  const FOCUSABLE = "button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
  };
  const desc = (el) => el.id ? "#" + el.id
    : (el.className && typeof el.className === "string"
        ? el.tagName.toLowerCase() + "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
        : el.tagName.toLowerCase());
  // The nearest ancestor that CLIPS: overflow hidden/auto/scroll in either axis.
  const clipper = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/(hidden|auto|scroll|clip)/.test(cs.overflowY + cs.overflowX)) return n;
    }
    return null;
  };

  const out = {
    // NOT `viewport`: the cell already carries the viewport's NAME, and
    // Object.assign(cell, probe) would overwrite it with this box — which is
    // exactly what happened, leaving every row keyed "[object Object]".
    box: { w: vw, h: vh, dpr: devicePixelRatio },
    bodyClass: [...document.body.classList].join(" "),
    rootPresent: !!root && visible(root),
    clipped: [], offscreen: [], smallTaps: [], truncated: [], scrollers: [],
    docOverflowX: document.documentElement.scrollWidth > vw + 1,
  };
  if (!root) return out;

  // CLIPPED: a visible element whose box escapes the thing that clips it. Text
  // nodes are excluded via the element list; a 1px slack absorbs sub-pixel layout.
  for (const el of root.querySelectorAll("*")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const c = clipper(el);
    if (!c) continue;
    const cr = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    // A scroll container legitimately holds content past its box on the axis it
    // SCROLLS — that is what scrolling is. Both axes count: the data hub's tab
    // strip is `overflow-x: auto`, and flagging its off-screen tabs as clipped
    // reported two false findings on a strip that works exactly as designed.
    const canScrollY = /(auto|scroll)/.test(cs.overflowY);
    const canScrollX = /(auto|scroll)/.test(cs.overflowX);
    const overBottom = r.bottom > cr.bottom + 1, overTop = r.top < cr.top - 1;
    const overRight = r.right > cr.right + 1, overLeft = r.left < cr.left - 1;
    const bad = (!canScrollY && (overBottom || overTop)) || (!canScrollX && (overRight || overLeft));
    if (bad && r.height > 2 && r.width > 2) {
      out.clipped.push({ el: desc(el), by: desc(c),
        past: { top: px(cr.top - r.top), bottom: px(r.bottom - cr.bottom),
                left: px(cr.left - r.left), right: px(r.right - cr.right) },
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40) });
    }
  }

  // OFFSCREEN / SMALL TAPS: only things a player is meant to hit.
  //
  // A row scrolled below the fold of a LIST is not off screen, it is the list —
  // the first run of this probe called 35 circuit rows a finding on a phone and
  // buried the real ones. Only a control with no scrollable ancestor, which
  // therefore nothing can bring into view, counts as unreachable. The rest are
  // counted separately as `belowFold`, which is information, not a defect.
  //
  // The tap floor is the project's own `--tap` token, not a hard 44: the density
  // ladder in css/tokens.css drops it to 40 on a landscape phone deliberately,
  // and a probe that argues with a design decision every run gets ignored.
  const tapFloor = parseFloat(getComputedStyle(document.documentElement)
    .getPropertyValue("--tap")) || 44;
  out.tapFloor = tapFloor;
  // Two thresholds, because they mean different things. WCAG 2.2 SC 2.5.8 (AA)
  // is 24x24 CSS px and is a CONFORMANCE floor — under it is a real defect.
  // 44 (2.5.5 AAA, Apple HIG) and our own `--tap` are house comfort targets, so
  // a 40px full-width circuit row with 24px of spacing around it is compliant
  // and merely below our preference. Counting both as one number had the grid
  // reporting 40 "violations" on a screen that has none.
  const WCAG_MIN = 24;
  out.tinyTaps = [];
  out.belowFold = 0;
  // ANY ancestor that can actually scroll to it, in either axis — not the
  // project's named `.pane` list. The data hub's tab strip is a plain
  // `overflow-x: auto` div, so a selector-based check called its last tab
  // unreachable when a swipe brings it in. Ask the computed style, not a list.
  const scrollerAncestor = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const scrollsY = /(auto|scroll)/.test(cs.overflowY) && n.scrollHeight - n.clientHeight > 1;
      const scrollsX = /(auto|scroll)/.test(cs.overflowX) && n.scrollWidth - n.clientWidth > 1;
      if (scrollsY || scrollsX) return n;
      if (n === root) break;
    }
    return null;
  };
  for (const el of root.querySelectorAll(FOCUSABLE)) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const off = r.right < -0.5 || r.bottom < -0.5 || r.left > vw + 0.5 || r.top > vh + 0.5;
    if (off) {
      if (scrollerAncestor(el)) out.belowFold++;
      else out.offscreen.push({ el: desc(el), box: [px(r.left), px(r.top), px(r.width), px(r.height)],
        text: (el.textContent || "").trim().slice(0, 24) });
    }
    if (r.height < tapFloor - 0.5 || r.width < tapFloor - 0.5) {
      const rec = { el: desc(el), w: px(r.width), h: px(r.height),
        text: (el.textContent || "").trim().slice(0, 24) };
      out.smallTaps.push(rec);
      if (r.height < WCAG_MIN - 0.5 || r.width < WCAG_MIN - 0.5) out.tinyTaps.push(rec);
    }
  }

  // TRUNCATED: ellipsised text. Not always a bug — often the point — but it is
  // the difference between "SUSPENSION" and "SUSPENSI…" and worth counting.
  for (const el of root.querySelectorAll("*")) {
    if (!visible(el) || el.children.length) continue;
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow === "ellipsis")
      out.truncated.push({ el: desc(el), text: (el.textContent || "").trim().slice(0, 30) });
  }

  // SCROLLERS: how much is hidden, and how close to the floor of its sheet the
  // region reaches — the measurement that caught the action bar stealing a row.
  const sheet = root.querySelector(".sheet") || root;
  const sr = sheet.getBoundingClientRect();
  for (const el of root.querySelectorAll(SCROLLERS)) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    out.scrollers.push({ el: desc(el), box: [px(r.width), px(r.height)],
      hidden: px(el.scrollHeight - el.clientHeight), toFloor: px(sr.bottom - r.bottom) });
  }
  out.sheet = sheet === root ? null : { el: desc(sheet), w: px(sr.width), h: px(sr.height) };
  return out;
};

// ------------------------------------------------------------------ the runner
const argv = process.argv.slice(2);
const wantShots = argv.includes("--shots");
const pick = (flag, all) => {
  const a = argv.find((x) => x.startsWith(flag));
  if (!a) return all;
  const pats = a.split("=")[1].split(",");
  return all.filter((x) => pats.some((p) => p.endsWith("*") ? x[0].startsWith(p.slice(0, -1)) : x[0] === p || x.id === p));
};
const viewports = pick("--viewports=", VIEWPORTS);
const screens = argv.find((x) => x.startsWith("--screens="))
  ? SCREENS.filter((s) => argv.find((x) => x.startsWith("--screens=")).split("=")[1].split(",").includes(s.id))
  : SCREENS;

fs.mkdirSync(OUT, { recursive: true });
if (wantShots) fs.mkdirSync(SHOT_DIR, { recursive: true });

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const f = path.join(ROOT, path.normalize(p).replace(/^(\.\.[/\\])+/, ""));
  fs.readFile(f, (e, b) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
    res.end(b);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-angle=swiftshader", "--hide-scrollbars"] });

// ONE BOOT PER VIEWPORT, not one per cell. Booting this game means compiling
// shaders and building a circuit; measured at 2-4 minutes per load on the
// software renderer, which made a 120-cell sweep a nine-hour job. The overlays
// are all `hidden`-toggled, so a cell can be reached by closing whatever is open
// and opening the next one — 10 loads instead of 120.
const OVERLAY_IDS = ["select", "carsetup", "career", "career-offers", "career-history",
  "career-guide", "teampicker", "race-settings", "quali", "standings", "results", "customize",
  "howtoplay", "advanced", "pmsettings", "pausemenu", "datahub", "track-detail", "vsfriend"];
// Viewports run in PARALLEL, a few at a time. Each one is an independent browser
// context doing mostly single-threaded work, and the sweep is dominated by boot
// and by waits, not by CPU — three at once measured ~3x the throughput, which is
// the difference between a coffee and an afternoon. Raise with --jobs=N.
const JOBS = Number((argv.find((a) => a.startsWith("--jobs=")) || "--jobs=3").split("=")[1]) || 3;
const rows = [];
const queue = [...viewports];
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, () => worker()));
async function worker() { while (queue.length) { const vp = queue.shift(); if (vp) await sweepViewport(vp); } }

async function sweepViewport([vpName, vpOpts, why]) {
  const ctx = await browser.newContext({ ...vpOpts, colorScheme: "dark" });
  const page = await ctx.newPage();
  let errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
  let booted = false;
  try {
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__apex && window.__apex.race, null, { timeout: 60000 });
    // Stop the render loop first: the 3D scene starves the compositor, which
    // makes every later wait and every screenshot an order slower.
    await page.evaluate(() => window.__apex.headless(true));
    // A cell that cannot be reached should cost seconds, not the 30s default —
    // there are 120 of them and "skipped" is a perfectly good result.
    page.setDefaultTimeout(12000);
    booted = true;
  } catch (e) {
    console.log(`${vpName}: BOOT FAILED — ${e.message.split("\n")[0]}`);
  }
  // In-race screens need a track built, which is the one slow step left; run
  // them last so the cheap overlay cells are already recorded if it times out.
  const ordered = [...screens].sort((a, b) =>
    (["hud", "pause", "results"].indexOf(a.id) + 1 ? 1 : 0) - (["hud", "pause", "results"].indexOf(b.id) + 1 ? 1 : 0));
  for (const screen of ordered) {
    const cell = { viewport: vpName, why, screen: screen.id, screenName: screen.name };
    errors = [];
    if (!booted) cell.skipped = "boot failed";
    else try {
      // Back to the title: closing the overlays is not enough, because the app
      // hides #overlay when one opens — leaving nothing for the next cell to
      // click. Geometry probing does not need the state machine to agree, only
      // the buttons to be hittable.
      await page.evaluate((ids) => {
        for (const id of ids) { const el = document.getElementById(id); if (el) el.hidden = true; }
        const ov = document.getElementById("overlay");
        if (ov) { ov.hidden = false; ov.style.removeProperty("display"); }
        document.body.classList.remove("in-race");
      }, OVERLAY_IDS);
      await page.waitForTimeout(200);
      await screen.open(page);
      await page.waitForTimeout(400);
      Object.assign(cell, await page.evaluate(PROBE, screen.root));
      if (wantShots) {
        const file = `${screen.id}__${vpName}.png`;
        await page.screenshot({ path: path.join(SHOT_DIR, file), timeout: 300000 });
        cell.shot = "shots/" + file;
      }
    } catch (e) {
      cell.skipped = e.message.split("\n")[0].slice(0, 120);
    }
    cell.errors = errors;
    rows.push(cell);
    const n = (a) => (a ? a.length : 0);
    console.log(`${cell.screen.padEnd(13)} ${vpName.padEnd(28)} ` +
      (cell.skipped ? `SKIPPED: ${cell.skipped}`
        : `clipped ${String(n(cell.clipped)).padStart(2)}  offscreen ${String(n(cell.offscreen)).padStart(2)}` +
          `  tapUnder24 ${String(n(cell.tinyTaps)).padStart(2)}  tapSoft ${String(n(cell.smallTaps)).padStart(2)}` +
          `  trunc ${String(n(cell.truncated)).padStart(2)}` +
          `  xOverflow ${cell.docOverflowX ? "YES" : "no "}  err ${n(cell.errors)}`));
  }
  await page.close();
  await ctx.close();
}

await browser.close();
server.close();

// MERGE, don't clobber: a filtered run (--screens / --viewports) must top up the
// grid rather than replace it with its own twelve cells, or re-running one
// viewport silently throws the other hundred away.
let prior = [];
try { prior = JSON.parse(fs.readFileSync(path.join(OUT, "audit.json"), "utf8")).rows || []; } catch {}
const key = (r) => r.screen + "|" + r.viewport;
// Sorted back into the canonical matrix order, so a filtered run's rows land in
// their own columns instead of appending new ones to the right of the grid.
const vpOrder = VIEWPORTS.map(([n]) => n), scOrder = SCREENS.map((s) => s.id);
const rank = (r) => [scOrder.indexOf(r.screen), vpOrder.indexOf(r.viewport)];
const merged = [...prior.filter((p) => !rows.some((r) => key(r) === key(p))), ...rows]
  .sort((a, b) => { const [as, av] = rank(a), [bs, bv] = rank(b); return as - bs || av - bv; });
fs.writeFileSync(path.join(OUT, "audit.json"), JSON.stringify({
  when: null, build: JSON.parse(fs.readFileSync(path.join(ROOT, "version.json"), "utf8")).build,
  viewports: viewports.map(([n, , w]) => ({ name: n, why: w })),
  screens: screens.map((s) => ({ id: s.id, name: s.name })),
  rows: merged,
}, null, 2));
writeIndex(merged);
const bad = rows.filter((r) => r.skipped || (r.clipped || []).length || (r.offscreen || []).length
  || r.docOverflowX || (r.errors || []).length || (r.tinyTaps || []).length);
console.log(`\n${rows.length} cells, ${bad.length} with something to look at -> ${path.relative(ROOT, OUT)}/index.html`);

function writeIndex(rows) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const cellHtml = (r) => {
    if (r.skipped) return `<td class="skip" title="${esc(r.skipped)}">skipped</td>`;
    const issues = (r.clipped || []).length + (r.offscreen || []).length + (r.errors || []).length
      + (r.docOverflowX ? 1 : 0) + (r.tinyTaps || []).length;
    const cls = issues ? "bad" : (r.smallTaps || []).length ? "warn" : "ok";
    const detail = [
      ...(r.clipped || []).map((c) => `clipped ${c.el} past ${c.by}`),
      ...(r.offscreen || []).map((c) => `offscreen ${c.el}`),
      ...(r.docOverflowX ? ["horizontal overflow"] : []),
      ...(r.errors || []).map((e) => "error " + e),
      ...(r.tinyTaps || []).slice(0, 4).map((t) => `under WCAG 24px: ${t.el} ${t.w}x${t.h}`),
      ...(r.smallTaps || []).slice(0, 4).map((t) => `below house tap floor ${t.el} ${t.w}x${t.h}`),
    ].join("\n");
    const shot = r.shot ? `<a href="${r.shot}">shot</a>` : "";
    return `<td class="${cls}" title="${esc(detail)}">${issues || "&check;"} ${shot}</td>`;
  };
  const vps = [...new Set(rows.map((r) => r.viewport))];
  const scr = [...new Set(rows.map((r) => r.screen))];
  const head = vps.map((v) => `<th>${esc(v)}</th>`).join("");
  const body = scr.map((s) => `<tr><th>${esc(s)}</th>` +
    vps.map((v) => cellHtml(rows.find((r) => r.screen === s && r.viewport === v) || { skipped: "not run" })).join("") +
    "</tr>").join("\n");
  fs.writeFileSync(path.join(OUT, "index.html"), `<!doctype html><meta charset="utf-8">
<title>Apex 26 layout audit</title>
<style>
 body{background:#0b0b10;color:#e8e8ee;font:13px/1.5 ui-sans-serif,system-ui;padding:24px}
 h1{font-size:18px;letter-spacing:.08em} table{border-collapse:collapse;margin-top:16px}
 th,td{border:1px solid #26262e;padding:6px 10px;text-align:center}
 th{font-weight:600;color:#a9a9b6;font-size:11px} tbody th{text-align:left;color:#e8e8ee}
 td.ok{background:#12301c;color:#7fd89a} td.warn{background:#3a3212;color:#e2c766}
 td.bad{background:#3a1414;color:#ff9c9c;font-weight:700} td.skip{background:#1a1a20;color:#6b6b78}
 p{color:#9a9aa5;max-width:70ch}
</style>
<h1>APEX 26 — LAYOUT AUDIT</h1>
<p>One cell per screen x viewport. Green means nothing clipped, nothing off screen,
no horizontal overflow and no page errors. Amber means every finding is a control
below the house <code>--tap</code> floor but at or above WCAG 2.2 SC 2.5.8's
24&times;24 &mdash; a preference, not a defect. Red is the count of real findings,
tap targets under 24px among them &mdash; hover a cell for the list.</p>
<table><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table>`);
}
