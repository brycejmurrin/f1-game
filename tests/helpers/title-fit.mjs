// @ts-check
/**
 * title-fit.mjs — the #5150 matrix: the landscape title screen never scrolls.
 *
 * Shared by tests/specs/title-fit.spec.js (the gate) and by hand-run probes,
 * so the cells and the verdict are written ONCE. Everything in-page is a plain
 * function handed to page.evaluate: no closure over this module.
 *
 * GEOS are Bryce's phone as the iOS home-screen app and as a Safari tab (852x393
 * and the MEASURED 852x368, both 59/21/59; tests/data/phone-windows.json is the one
 * record, #5218), the 844x390 house geometry and a Pro Max. Insets land through CDP Emulation.setSafeAreaInsetsOverride, which
 * is what env(safe-area-inset-*) reads. PROFILES are what a phone BOOTS with:
 * a fresh profile, Bryce's export (tests/data/settings-defaults-export.json,
 * landscape WIDTH 20) and that export carrying the Nov 4–5 title-layout values
 * (WIDTH 40, LAYOUT STACK — the #5139 sweep's scrollHeight 563 in a 343 box).
 * SWEEP is every stored TITLE LAYOUT value the issue lists, applied in-page
 * through TitleLayout.set so one boot covers them all, plus UI SIZE 130/200.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// `rows` is the composition a TOUCH boot paints with CONTINUE shown (#5213: under a finger a door
// is at least 44 px, so the eight rows re-flow where eight 44 px rows do not fit the box): seven
// rows (CAREER joins the retention row) in a 353-356 px box, all eight at 430; `floor` is false
// where no row count fits WITH EVERY WORD WHOLE and the fit wins. Safari's 254 px box (#5208's
// max(inset, gutter) edge; it was 246) takes the five-row tier by door box, but PRACTICE's label
// clips four-up (#5378: span 53 px in a 50 px box), so fits() rejects it and the unfloored eight
// rows zoom down, as before the floor. judgeLabels holds the "every word whole" half.
// The phone windows come from THE record (#5218): the Safari cell was 852x283 with 67/21/67 here, 852x344 in
// tools/ui/menu-screens.mjs and 852x283 59/0/59 in the UI contract; his phone read 852x368. At 852x368 the touch
// boot still composes eight rows with every label whole and misses the 44 px floor (poke 2026-11-11, fresh and
// export profiles), so the cell keeps ROWS8 / floor false.
const WIN = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/data/phone-windows.json"), "utf8")).windows;
const cell = (name, w) => ({ name, w: w.width, h: w.height, insets: { ...w.insets } });
const ROWS7 = [3, 2, 2, 2, 2, 3, 4], ROWS8 = [1, 2, 2, 2, 2, 2, 3, 4];
export const GEOS = [
  { ...cell("852x393-standalone", WIN.standalone), rows: ROWS7, floor: true },
  { ...cell(`${WIN.safari.width}x${WIN.safari.height}-safari`, WIN.safari), rows: ROWS8, floor: false },
  { ...cell("844x390", WIN.w844), rows: ROWS7, floor: true },
  { name: "932x430", w: 932, h: 430, insets: { top: 0, left: 59, bottom: 21, right: 59 }, rows: ROWS8, floor: true },
];

/** No door paints a clipped label (#5378: the old Safari 852x283 cell's five-row tier fit by door box while
 *  PRACTICE's label span was 53 px in a 50 px box). The rows pin follows from this rule. */
export function judgeLabels(m) {
  return m.doors.filter((d) => d.clip).map((d) => `door ${d.id} clips its label`);
}

/** The touch paint floor (#5213): every door at least 44 px tall and its label at least 12 px. */
export function judgeFloor(m) {
  const bad = [];
  for (const d of m.doors) {
    if (d.h < 44) bad.push(`door ${d.id} paints ${Math.round(d.h * 10) / 10} px tall (under 44)`);
    if (d.fs < 12) bad.push(`door ${d.id} label paints at ${d.fs} px (under 12)`);
  }
  return bad;
}

/** What Bryce's phone stored on 2026-11-09 (his live export, the settings file PR #5264
 *  adds under tests/data): UI SIZE 61 %, and a landscape TITLE LAYOUT with
 *  BUTTONS SIZE 60, WIDTH 49, pushed right and up, the title pushed left. Over the older export. */
export const LIVE_TITLE = Object.freeze({ v: 2, wide: { btns: { x: 50, y: -42, size: 60, width: 49 }, title: { x: -50, y: 2, size: 100 }, art: { x: 0, y: 0, size: 100 }, layout: "grid", side: "auto" } });
export function liveStore() {
  const exp = exportStore();
  return { json: { ...exp.json, uiScale: 61, titleLayout: LIVE_TITLE }, raw: exp.raw };
}

/** Bryce's export as the store keys a boot writes: `json` through store.set, `raw` verbatim. */
export function exportStore() {
  const exp = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/data/settings-defaults-export.json"), "utf8"));
  const spec = fs.readFileSync(path.join(ROOT, "js/ui/settings-export.js"), "utf8");
  const raw = new Set([...spec.matchAll(/k: "([^"]+)", lane: "raw"/g)].map((m) => m[1]));
  const out = { json: {}, raw: {} };
  for (const g of Object.values(exp.settings)) {
    for (const [k, v] of Object.entries(g)) { if (v === null) continue; (raw.has(k) ? out.raw : out.json)[k] = v; }
  }
  return out;
}

const SHIPPED = { btns: { x: 0, y: 0, size: 100, width: 0 }, title: { x: 0, y: 0, size: 100 }, art: { x: 0, y: 0, size: 100 }, layout: "grid", side: "auto" };
const wide = (o) => ({ ...SHIPPED, ...o, btns: { ...SHIPPED.btns, ...(o.btns || {}) }, title: { ...SHIPPED.title, ...(o.title || {}) }, art: { ...SHIPPED.art, ...(o.art || {}) } });

/** The three boot profiles. `store` is what addInitScript writes before the page loads. */
export function profiles() {
  const exp = exportStore();
  const tl = exp.json.titleLayout;
  const stacked = { ...tl, wide: { ...tl.wide, btns: { ...tl.wide.btns, width: 40 }, layout: "stack" } };
  return [
    { name: "fresh", store: { json: {}, raw: {} }, offsets: false },
    { name: "export", store: exp, offsets: true },     // WIDTH 20, X -2 / Y -2 on the cluster, title +3/+9
    { name: "export-w40-stack", store: { json: { ...exp.json, titleLayout: stacked }, raw: exp.raw }, offsets: true, sweep: true },
  ];
}

/** Every stored value the issue names, as in-page TitleLayout.set payloads for the wide shape. */
export function sweep() {
  const cells = [];
  for (const layout of ["grid", "stack", "row"]) for (const side of ["auto", "swap"]) for (const size of [50, 100, 200]) for (const width of [0, 20, 40, 60, 100]) {
    cells.push({ name: `${layout}/${side}/size${size}/w${width}`, layout: wide({ layout, side, btns: { size, width } }), offsets: false });
  }
  // Offsets: the issue says ±100; TitleLayout.LIM clamps X / Y to ±50 (half a
  // screen), which already carries a piece out of the box without the clamp.
  for (const layout of ["grid", "stack", "row"]) for (const x of [-100, 0, 100]) for (const y of [-100, 0, 100]) {
    if (!x && !y) continue;
    cells.push({ name: `${layout}/w40/x${x}/y${y}`, layout: wide({ layout, btns: { x, y, width: 40 } }), offsets: true });
  }
  for (const [x, y] of [[-100, 0], [100, 0], [0, -100], [0, 100]]) cells.push({ name: `title/x${x}/y${y}`, layout: wide({ title: { x, y } }), offsets: true });
  for (const size of [50, 200]) cells.push({ name: `title/size${size}`, layout: wide({ title: { size } }), offsets: false });
  cells.push({ name: "art/size200/y100/x100", layout: wide({ art: { size: 200, y: 100, x: 100 } }), offsets: false });
  cells.push({ name: "art/size200/stack/w100/size200", layout: wide({ layout: "stack", btns: { size: 200, width: 100 }, art: { size: 200 } }), offsets: false });
  // UI SIZE (percent, js/agent/apex.js uiScale): the slider that made the shipped title scroll before.
  for (const ui of [130, 200]) {
    cells.push({ name: `ui${ui}/shipped`, layout: null, ui, offsets: false });
    cells.push({ name: `ui${ui}/stack/w40`, layout: wide({ layout: "stack", btns: { width: 40 } }), ui, offsets: false });
  }
  cells.push({ name: "ui-reset/shipped", layout: null, ui: null, offsets: false });
  return cells;
}

/** Init script: the iOS Home Screen LANDSCAPE LAUNCH (#5152's finding, #5167 part E). The app opens
 *  with CSS already laying out landscape while innerWidth/innerHeight still hold the PORTRAIT pair,
 *  and no resize follows. `vv` also holds visualViewport on the stale pair (the strict iOS case);
 *  without it the visual viewport is right and only inner* lies, which is the pair that latched
 *  --kb. Pass as page.addInitScript(staleLaunchInPage, { w, h, vv }) with the PORTRAIT w × h. */
export function staleLaunchInPage({ w, h, vv }) {
  Object.defineProperty(window, "innerWidth", { configurable: true, get() { return w; } });
  Object.defineProperty(window, "innerHeight", { configurable: true, get() { return h; } });
  if (vv && window.visualViewport) {
    Object.defineProperty(window.visualViewport, "width", { configurable: true, get() { return w; } });
    Object.defineProperty(window.visualViewport, "height", { configurable: true, get() { return h; } });
  }
}

/** Init script: record the FIRST body[data-density] / [data-shape] the page paints with — the inline
 *  pre-paint boot's answer, before SheetShape re-asks. Read back as window.__apexFirstFlags. */
export function firstFlagsInPage() {
  const first = {};
  window.__apexFirstFlags = first;
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.target !== document.body) continue;
      const k = m.attributeName === "data-density" ? "density" : m.attributeName === "data-shape" ? "shape" : "";
      if (k && !(k in first)) first[k] = document.body.getAttribute(m.attributeName);
    }
  // `document`, not documentElement: an init script runs at document start, before <html> exists.
  }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-density", "data-shape"] });
}

/** In-page: wait until the fit has settled — the cluster's scroll extent and
 *  fit tokens unchanged for `frames` frames in a row (ResizeObserver and the
 *  rAF-coalesced fit both run per frame). Returns the frames it took. */
export function settleInPage(frames) {
  return new Promise((done) => {
    const mb = document.getElementById("menu-buttons"), br = document.getElementById("menu-brand");
    let last = "", stable = 0, n = 0;
    const tick = () => {
      n++;
      const key = [mb.scrollHeight, mb.clientHeight, mb.style.cssText, br.style.cssText, document.body.dataset.density].join("/");
      if (key === last) { if (++stable >= frames) return done(n); } else { stable = 0; last = key; }
      if (n > 600) return done(-n);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/** In-page measurement of the title screen. A plain function for page.evaluate. */
export function measureInPage() {
  const $ = (id) => document.getElementById(id);
  const ov = $("overlay"), mb = $("menu-buttons"), br = $("menu-brand"), game = $("game");
  const R = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  const pf = (v) => parseFloat(v) || 0;
  const cs = getComputedStyle(ov), o = R(ov);
  const box = { l: o.l + pf(cs.paddingLeft), t: o.t + pf(cs.paddingTop), r: o.r - pf(cs.paddingRight), b: o.b - pf(cs.paddingBottom) };
  const doors = [];
  for (const b of mb.querySelectorAll(".bigbtn")) {
    if (b.hidden) continue;
    const r = R(b);
    if (!(r.h > 0 && r.w > 0) || getComputedStyle(b).visibility === "hidden") continue;
    const hit = document.elementFromPoint((r.l + r.r) / 2, (r.t + r.b) / 2);
    // A label span wider than its box is a clipped word; the subtitle's ellipsis (.mb-sub) is the
    // designed clip, unless the .mb-label beside it clips too (#5378's rule in TitleLayout fits()).
    const over = (e) => !!e && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1;
    let clip = over(b);
    for (const sp of b.querySelectorAll("span:not(.mb-sub)")) {
      if (clip || !over(sp)) continue;
      clip = !over(sp.querySelector(".mb-sub")) || over(sp.querySelector(".mb-label"));
    }
    doors.push({ id: b.id || (b.textContent || "").trim().slice(0, 18), ...r, clip, fs: Math.round(parseFloat(getComputedStyle(b).fontSize) * (parseFloat(getComputedStyle(mb).zoom) || 1) * 100) / 100, hit: !!hit && (hit === b || b.contains(hit)) });
  }
  const de = document.documentElement;
  const cols = cs.gridTemplateColumns.split(/\s+/).map(parseFloat).filter((n) => n > 0);
  const disc = $("disclaimer");
  const mbZoom = parseFloat(getComputedStyle(mb).zoom) || 1;
  // The viewport is the ICB (UI contract 2026-11-06 rule 1): what every tier reads and what
  // `fixed; inset: 0` spans. inner* sits beside it so a stale-launch disagreement is visible.
  return {
    // The overlay's grid tracks (screen px), the brand's small print, and the
    // painted size of the RACE label (own font-size under the cluster's zoom,
    // the fit included): what the stored-layout pins in judgeStored read.
    track: cols, disc: disc ? { ...R(disc), display: getComputedStyle(disc).display } : null,
    raceFs: Math.round(parseFloat(getComputedStyle($("mb-race")).fontSize) * mbZoom * 100) / 100,
    vw: de.clientWidth, vh: de.clientHeight, inner: [innerWidth, innerHeight],
    shape: document.body.dataset.shape, density: document.body.dataset.density, kb: de.style.getPropertyValue("--kb") || null,
    uiScale: getComputedStyle(de).getPropertyValue("--ui-scale").trim(),
    tl: { layout: de.dataset.titleLayout, btns: de.dataset.titleBtns, btnw: de.dataset.titleBtnw, side: de.dataset.titleSide },
    fit: { mb: mb.style.getPropertyValue("--tf"), mbDx: mb.style.getPropertyValue("--tf-dx"), mbDy: mb.style.getPropertyValue("--tf-dy"), br: br.style.getPropertyValue("--tf"), brDy: br.style.getPropertyValue("--tf-dy") },
    ov: { sh: ov.scrollHeight, ch: ov.clientHeight, sw: ov.scrollWidth, cw: ov.clientWidth, overflowY: cs.overflowY, rect: o, box },
    doc: { sh: de.scrollHeight, ch: de.clientHeight, sw: de.scrollWidth, cw: de.clientWidth },
    mb: { rect: R(mb), sh: mb.scrollHeight, ch: mb.clientHeight, sw: mb.scrollWidth, cw: mb.clientWidth, sfScroll: mb.classList.contains("sf-scroll") },
    brand: R(br), game: game ? R(game) : null, doors,
  };
}

const inside = (r, box, tol) => r.l >= box.l - tol && r.r <= box.r + tol && r.t >= box.t - tol && r.b <= box.b + tol;
const overlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
const fmt = (r) => [r.l, r.t, r.r, r.b].map((n) => Math.round(n)).join(",");

/** The verdict for one cell: an empty list, or every requirement it misses.
 *  `offsets`: the cell moved a piece on purpose, so the no-overlap and hit
 *  requirements (3) are the player's choice there; containment still holds. */
export function judge(m, { offsets = false } = {}) {
  const bad = [];
  const TOL = 1;
  if (m.shape !== "wide") bad.push(`shape ${m.shape} (landscape expected)`);
  // 1. The title overlay never scrolls, and neither does the document.
  if (m.ov.sh !== m.ov.ch) bad.push(`#overlay scrollHeight ${m.ov.sh} != clientHeight ${m.ov.ch}`);
  if (m.ov.sw !== m.ov.cw) bad.push(`#overlay scrollWidth ${m.ov.sw} != clientWidth ${m.ov.cw}`);
  if (m.ov.overflowY !== "hidden") bad.push(`#overlay overflow-y ${m.ov.overflowY} (hidden in landscape)`);
  if (m.doc.sh !== m.doc.ch || m.doc.sw !== m.doc.cw) bad.push(`document scrolls ${m.doc.sw}x${m.doc.sh} in ${m.doc.cw}x${m.doc.ch}`);
  // 2. The whole cluster, bottom row included, inside the overlay's content box; nothing behind a fold.
  if (!inside(m.mb.rect, m.ov.box, TOL)) bad.push(`#menu-buttons ${fmt(m.mb.rect)} leaves the box ${fmt(m.ov.box)}`);
  if (m.mb.sh > m.mb.ch + TOL || m.mb.sw > m.mb.cw + TOL) bad.push(`#menu-buttons scrolls ${m.mb.sw}x${m.mb.sh} in ${m.mb.cw}x${m.mb.ch}`);
  if (m.mb.sfScroll) bad.push("#menu-buttons carries sf-scroll (a scroller)");
  if (!inside(m.brand, m.ov.box, TOL)) bad.push(`#menu-brand ${fmt(m.brand)} leaves the box ${fmt(m.ov.box)}`);
  if (m.doors.length < 10) bad.push(`only ${m.doors.length} doors measured`);
  for (const d of m.doors) if (!inside(d, m.ov.box, TOL)) bad.push(`door ${d.id} ${fmt(d)} leaves the box ${fmt(m.ov.box)}`);
  // 3. The cluster does not overlap the title / brand box, and every door answers a tap.
  if (!offsets) {
    for (const d of m.doors) {
      if (overlap(d, m.brand) > 1) bad.push(`door ${d.id} ${fmt(d)} overlaps the brand ${fmt(m.brand)}`);
      if (!d.hit) bad.push(`door ${d.id} is covered (elementFromPoint misses it)`);
    }
  }
  // 4. No band: the overlay (and the canvas under it) is the whole viewport.
  const vp = { l: 0, t: 0, r: m.vw, b: m.vh };
  if (!inside(m.ov.rect, vp, 0.5) || Math.abs(m.ov.rect.w - m.vw) > 0.5 || Math.abs(m.ov.rect.h - m.vh) > 0.5) bad.push(`#overlay ${fmt(m.ov.rect)} is not the viewport ${m.vw}x${m.vh}`);
  if (m.game && (Math.abs(m.game.w - m.vw) > 0.5 || Math.abs(m.game.h - m.vh) > 0.5)) bad.push(`#game ${fmt(m.game)} is not the viewport`);
  return bad;
}

/** The stored-layout cell at a landscape phone (#5167 part F): Bryce's export
 *  carries WIDTH 20 on the doors, and before the floor that request pinned
 *  the cluster to 170 of 852 px at 852x393 (insets 59/21/59): the fit at
 *  0.628, labels painting at 9.7 px, GARAGE under a half-empty PRACTICE row,
 *  the four utility doors one per row, the disclaimer hidden and the wordmark
 *  at 36 own px (the live-home plate rules). What the code promises now, and
 *  what the reference picture shows (docs/notes/title-reference-2026-11-06.jpg
 *  on branch cursor/title-reference-7c1a): the cluster fills its track, two
 *  doors to a play row, PRACTICE beside GARAGE, the utilities on one row, the
 *  small print visible inside the box, and labels no smaller than 12 painted
 *  px where the box gives the composition its full height — the request's 9.7
 *  fails that, the 15.4 measured at fit 1 clears it with the room a machine's
 *  fonts can take back (#5152: never pin the fit). Where the cluster IS the
 *  track and the fit still sits under 1, the fit is paying for height alone
 *  (Safari's 283: the unfloored eight rows in a 254 px box, 246 before #5208) and
 *  the label follows it with every door (UI contract §3 rules 2–3: zoom
 *  scales type inside a fitted box; fit, never scroll); the track and the
 *  row pins are the guard there, and a label floor would only restate the
 *  fit. Returns every miss, like judge(). */
export function judgeStored(m) {
  const bad = [];
  const TOL = 1;
  const track = m.track[m.track.length - 1];
  const isTrack = track > 0 && Math.abs(m.mb.rect.w - track) <= TOL;
  if (!(track > 0)) bad.push(`no overlay column track in ${JSON.stringify(m.track)}`);
  else if (!isTrack) bad.push(`#menu-buttons ${Math.round(m.mb.rect.w)} wide in a ${Math.round(track)} track (the floor is the track)`);
  const fit = parseFloat(m.fit.mb) || 1;
  const heightBound = isTrack && fit < 1;
  if (!heightBound && m.raceFs < 12) bad.push(`RACE paints at ${m.raceFs}px (under 12 at fit ${fit})`);
  const door = (id) => m.doors.find((d) => d.id === id);
  const sameRow = (a, b) => { const x = door(a), y = door(b); if (!x || !y) return bad.push(`door ${!x ? a : b} missing`); if (Math.abs(x.t - y.t) > TOL) bad.push(`${a} (top ${Math.round(x.t)}) and ${b} (top ${Math.round(y.t)}) do not share a row`); };
  sameRow("mb-race", "mb-tt"); sameRow("mb-vs", "mb-season"); sameRow("mb-practice", "mb-garage"); sameRow("mb-watch", "mb-data");
  sameRow("mb-settings", "mb-phonepad"); sameRow("mb-phonepad", "mb-help"); sameRow("mb-help", "mb-saves");
  if (!m.disc || m.disc.display === "none" || !(m.disc.h > 0)) bad.push("the disclaimer is hidden");
  else if (!inside(m.disc, m.ov.box, TOL)) bad.push(`disclaimer ${fmt(m.disc)} leaves the box ${fmt(m.ov.box)}`);
  return bad;
}
