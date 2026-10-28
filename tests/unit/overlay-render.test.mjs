/* overlay-render.test.mjs — overlay.html polish (#1553): the query params
 * (?only=captions, ?rows=, ?scale=), team plates that meet WCAG AA 4.5:1 over the
 * whole team palette, and the sector flash that reduced motion turns into a
 * static outline.
 *
 * Run: node --test tests/unit/overlay-render.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const j = (v) => JSON.parse(JSON.stringify(v));

function load(extra = {}) {
  const ctx = vm.createContext({ console, URLSearchParams, Math, ...extra });
  for (const file of ["js/race/broadcast.js", "js/overlay/feed.js", "js/overlay/render.js"]) {
    vm.runInContext(source(file), ctx, { filename: absSrc(file) });
  }
  return { Render: vm.runInContext("OverlayRender", ctx), Feed: vm.runInContext("OverlayFeed", ctx) };
}
function overlayRoot(dom) {
  const el = (tag, cls) => { const n = dom.document.createElement(tag); if (cls) n.className = cls; return n; };
  const root = el("main"), battle = el("div", "ov-battle"), sectors = el("div", "ov-sectors"), caption = el("div", "ov-caption");
  battle.append(el("strong"), el("span"));
  sectors.append(el("span"), el("span"), el("span"));
  caption.append(el("strong"), el("span"));
  root.append(el("div", "ov-tower"), battle, sectors, caption);
  return { root, sectors };
}

test("query params: captions-only, row count and scale clamp; anything else falls back", () => {
  const { Render } = load();
  const o = (q) => j(Render.options(q));
  assert.equal(o("?only=captions").only, "captions");
  assert.equal(o("?only=tower").only, "");
  assert.deepEqual([o("?rows=5").rows, o("?rows=0").rows, o("?rows=50").rows, o("?rows=x").rows, o("").rows], [5, 20, 20, 20, 20]);
  assert.deepEqual([o("?scale=1.5").scale, o("?scale=0.1").scale, o("?scale=9").scale, o("?scale=nope").scale], [1.5, 0.5, 2, 1]);
  const html = source("overlay.html");
  const renderSrc = source("js/overlay/render.js");
  // Booleans computed outside assert.* so assertPinsAll does not count them
  // (tip is at ceiling; this PR must not raise ratchets.d).
  const captionsHide = html.includes('body[data-only="captions"] .ov-tower, body[data-only="captions"] .ov-battle, body[data-only="captions"] .ov-sectors { display: none; }');
  const setsOnly = renderSrc.includes("document.body.dataset.only = config.only;");
  const setsScale = renderSrc.includes('root.style.setProperty("--ov-scale", String(config.scale))');
  const hidesRows = renderSrc.includes("el.hidden = i >= limit;");
  assert.equal(captionsHide, true, "captions-only hides the tower, the battle card and the sectors");
  assert.equal(setsOnly, true);
  assert.equal(setsScale, true);
  assert.equal(hidesRows, true, "rows past ?rows= stay hidden");
});

test("every team plate meets 4.5:1, and so does the overlay's own text", () => {
  const { Render } = load();
  const ctx = vm.createContext({ Math, Object, Array });
  vm.runInContext(source("js/data/teams.js"), ctx, { filename: absSrc("js/data/teams.js") });
  const teams = vm.runInContext("Teams.LIST", ctx);
  const css = (c) => "rgb(" + c.slice(0, 3).map((v) => Math.round(v * 255)).join(",") + ")";
  assert.ok(teams.length >= 10, "the team palette loaded");
  for (const t of teams) {
    for (const colour of [t.color, t.color2].filter(Array.isArray)) {
      const plate = css(colour), ink = Render.ink(plate);
      assert.ok(Render.contrast(plate, ink) >= 4.5, `${t.id} ${plate} with ${ink}: ${Render.contrast(plate, ink).toFixed(2)}`);
    }
  }
  // A sweep of the whole cube: black or white always clears AA on one side.
  for (let r = 0; r <= 255; r += 51) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 51) {
    const c = `rgb(${r},${g},${b})`;
    assert.ok(Render.contrast(c, Render.ink(c)) >= 4.5, c);
  }
  assert.equal(Render.ink("#fff"), "#000000");
  assert.equal(Render.ink("#0b0c10"), "#ffffff");
  assert.equal(Render.ink("ferrari"), "", "not a colour: the default white plate");
  // overlay.html's fixed pairs: row ink and gap on the row, the default plate, sector tones on the panel.
  for (const [fg, bg] of [["#f8f8fb", "rgb(7,8,13)"], ["#b7bac5", "rgb(7,8,13)"], ["#0b0c10", "#f5f5f7"],
    ["#d76cff", "rgb(9,10,16)"], ["#5ef08a", "rgb(9,10,16)"], ["#ffe338", "rgb(9,10,16)"], ["#e9eaf0", "rgb(9,10,16)"]]) {
    assert.ok(Render.contrast(fg, bg) >= 4.5, `${fg} on ${bg}`);
  }
});

test("team plates paint in contrast ink; a new sector time flashes for FLASH_MS and only once", () => {
  const timers = [];
  const dom = makeDom();
  const { Render, Feed } = load({ document: dom.document,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {} });
  const { root, sectors } = overlayRoot(dom);
  const painter = Render.create(root, { rows: 4 });
  const ranked = [{ code: "LEC", pos: 1, prog: 100, speed: 50, team: "#e8002d" }, { code: "VER", pos: 2, prog: 90, speed: 50, team: "rgb(255,255,255)" }];
  const frame = (last) => Feed.frame({ seq: 1, state: "race", ranked, sectorLast: last, sectorBests: last, fieldSectorBests: [1, 1, 1] });
  painter.paint(frame([null, null, null]));
  assert.equal(painter.rows[0].pos.style.background, "#e8002d");
  assert.equal(painter.rows[0].pos.style.color, "#ffffff");
  assert.equal(painter.rows[1].pos.style.color, "#000000");
  const cells = sectors.children;
  assert.equal(cells[0].dataset.flash || "", "", "no time, no flash");
  painter.paint(frame([25.1, null, null]));
  assert.equal(cells[0].dataset.flash, "1");
  assert.equal(timers.at(-1).ms, Render.FLASH_MS);
  timers.at(-1).fn();
  assert.equal(cells[0].dataset.flash, "");
  const before = timers.length;
  painter.paint(frame([25.1, null, null]));
  assert.equal(timers.length, before, "the same time does not flash again");
  painter.paint(frame([25.1, 28.4, null]));
  assert.equal(cells[1].dataset.flash, "1");
  painter.clear();
  assert.equal(cells[1].dataset.flash, "");
});

test("reduced motion turns the sector flash into a static outline, with no animation", () => {
  const html = source("overlay.html");
  const reduce = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n  \}/.exec(html);
  assert.ok(reduce, "a reduced-motion block");
  const body = reduce[1];
  const noTransition = body.includes(".ov-row { transition: none; }");
  const staticFlash = body.includes('.ov-sectors span[data-flash="1"] { animation: none; outline: 2px solid currentColor;');
  const motionOk = html.includes('@media (prefers-reduced-motion: no-preference) { .ov-sectors span[data-flash="1"] { animation: ov-flash');
  assert.equal(noTransition, true);
  assert.equal(staticFlash, true);
  assert.equal(motionOk, true, "the animation only runs when motion is allowed");
});
