// @ts-check
/**
 * title-fit.mjs — the #5150 matrix: the landscape title screen never scrolls.
 *
 * Shared by tests/specs/title-fit.spec.js (the gate) and by hand-run probes,
 * so the cells and the verdict are written ONCE. Everything in-page is a plain
 * function handed to page.evaluate: no closure over this module.
 *
 * GEOS are Bryce's phone as the iOS home-screen app and as Safari (852x393 /
 * 852x283 with 59/21/59 and 67/21/67 insets), the 844x390 house geometry and a
 * Pro Max. Insets land through CDP Emulation.setSafeAreaInsetsOverride, which
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

export const GEOS = [
  { name: "852x393-standalone", w: 852, h: 393, insets: { top: 0, left: 59, bottom: 21, right: 59 } },
  { name: "852x283-safari", w: 852, h: 283, insets: { top: 0, left: 67, bottom: 21, right: 67 } },
  { name: "844x390", w: 844, h: 390, insets: { top: 0, left: 47, bottom: 21, right: 47 } },
  { name: "932x430", w: 932, h: 430, insets: { top: 0, left: 59, bottom: 21, right: 59 } },
];

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
    doors.push({ id: b.id || (b.textContent || "").trim().slice(0, 18), ...r, hit: !!hit && (hit === b || b.contains(hit)) });
  }
  const de = document.documentElement;
  return {
    vw: innerWidth, vh: innerHeight, shape: document.body.dataset.shape, density: document.body.dataset.density,
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
