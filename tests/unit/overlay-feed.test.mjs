/* Stream overlay frame schema and diff contract. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function load() {
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(source("js/race/broadcast.js") + ";this.Broadcast=Broadcast;", ctx);
  vm.runInContext(source("js/overlay/feed.js") + ";this.OverlayFeed=OverlayFeed;", ctx);
  return ctx.OverlayFeed;
}

function cars(gapS) {
  return [
    { code: "LEC", prog: 1000, speed: 50, pos: 1, team: "#e8002d" },
    { code: "NOR", prog: 1000 - gapS * 50, speed: 50, pos: 2, team: "#ff8700", you: true },
  ];
}

test("battle uses Broadcast's strict one-second gate", () => {
  const Feed = load();
  assert.deepEqual(JSON.parse(JSON.stringify(Feed.battle(cars(.99)))), { ahead: "LEC", behind: "NOR", gapS: .99 });
  assert.equal(Feed.battle(cars(1.01)), null);
});

test("sector colours and glyphs match the HUD predicate", () => {
  const Feed = load();
  const plain = (v) => JSON.parse(JSON.stringify(v));
  assert.deepEqual(plain(Feed.sector(20, 20, 20)), { value: 20, tone: "purple", glyph: "★" });
  assert.deepEqual(plain(Feed.sector(20, 20, 19)), { value: 20, tone: "green", glyph: "▼" });
  assert.deepEqual(plain(Feed.sector(21, 20, 19)), { value: 21, tone: "yellow", glyph: "▲" });
  assert.deepEqual(plain(Feed.sector(null, 20, 19)), { value: null, tone: "", glyph: "" });

  const hud = source("js/ui/hud.js");
  assert.match(hud, /const pb = t != null && bests && t <= bests\[i\]/);
  assert.match(hud, /const sb = pb && field && t <= field\[i\]/);
});

test("frame schema maps ranked cars without writing them", () => {
  const Feed = load();
  const ranked = cars(.4);
  ranked[0].tyre = { code: "M" };
  ranked[1].pit = true;
  const before = JSON.stringify(ranked);
  const frame = Feed.frame({
    seq: 7, t: 12.5, state: "race", track: "monza", lap: 4, laps: 12,
    flag: "green", ranked, sectorLast: [20, 21, null],
    sectorBests: [20, 20, 20], fieldSectorBests: [20, 19, 19],
  });
  assert.equal(frame.v, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(frame.rows)), [
    { pos: 1, code: "LEC", team: "#e8002d", interval: null, gap: null, tyre: "M", pit: false, you: false },
    { pos: 2, code: "NOR", team: "#ff8700", interval: .4, gap: .4, tyre: null, pit: true, you: true },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(frame.battle)), { ahead: "LEC", behind: "NOR", gapS: .4 });
  assert.equal(JSON.stringify(ranked), before, "read-only mapping");
});

test("diff omits unchanged parts and sends a full frame every two seconds", () => {
  const Feed = load();
  const diff = Feed.createDiffer(2000);
  const first = Feed.frame({ seq: 1, t: 0, state: "race", ranked: cars(.4) });
  assert.equal(diff.next(first, 0).full, true);

  const same = Feed.frame({ seq: 2, t: .25, state: "race", ranked: cars(.4) });
  const patch = diff.next(same, 250);
  assert.equal(patch.full, undefined);
  assert.equal(patch.rows, undefined);
  assert.equal(patch.battle, undefined);
  assert.equal(patch.seq, 2);

  const changed = Feed.frame({ seq: 3, t: .5, state: "race", ranked: cars(.2) });
  assert.deepEqual(JSON.parse(JSON.stringify(diff.next(changed, 500).battle)), { ahead: "LEC", behind: "NOR", gapS: .2 });

  const full = diff.next(Feed.frame({ seq: 4, t: 2, state: "race", ranked: cars(.2) }), 2000);
  assert.equal(full.full, true);
  assert.ok(full.rows);
});

test("caption ids dedupe and unsupported schema versions are rejected", () => {
  const Feed = load();
  const diff = Feed.createDiffer();
  const base = Feed.frame({ seq: 1, t: 0, ranked: [], caption: { id: "radio-1", text: "Box" } });
  diff.next(base, 0);
  const again = Feed.frame({ seq: 2, t: .25, ranked: [], caption: { id: "radio-1", text: "Box" } });
  assert.equal(diff.next(again, 250).caption, undefined);
  assert.equal(Feed.accept({ v: 2 }), null);
  assert.equal(Feed.accept({ v: 1, seq: 4 }).seq, 4);
});

test("overlay source is display-only", () => {
  for (const rel of ["js/overlay/feed.js", "js/overlay/render.js"]) {
    const src = source(rel);
    assert.doesNotMatch(src, /\bTracks\b|\bcurvature\s*\(|\.\s*(?:speed|prog|px|pz|lap)\s*=/,
      `${rel} must not reach track geometry or write car physics`);
  }
});

test("query options clamp scale/rows and select chroma + side", () => {
  const ctx = { console, URLSearchParams };
  vm.createContext(ctx);
  vm.runInContext(source("js/overlay/render.js") + ";this.OverlayRender=OverlayRender;", ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.OverlayRender.options("?demo=1&scale=9&rows=3&side=right&chroma=green"))),
    { scale: 2, rows: 3, side: "right", chroma: "green", demo: true, only: "" });
});

test("painter builds fixed rows once, moves by transform and skips unchanged text", () => {
  const dom = makeDom();
  const root = dom.document.createElement("section");
  const tower = dom.document.createElement("div"); tower.className = "ov-tower";
  const battle = dom.document.createElement("div"); battle.className = "ov-battle";
  battle.append(dom.document.createElement("strong"), dom.document.createElement("span"));
  const sectors = dom.document.createElement("div"); sectors.className = "ov-sectors";
  sectors.append(dom.document.createElement("span"), dom.document.createElement("span"), dom.document.createElement("span"));
  const caption = dom.document.createElement("div"); caption.className = "ov-caption";
  caption.append(dom.document.createElement("strong"), dom.document.createElement("span"));
  root.append(tower, battle, sectors, caption);

  const ctx = { console, document: dom.document, URLSearchParams, OverlayFeed: load() };
  vm.createContext(ctx);
  vm.runInContext(source("js/overlay/render.js") + ";this.OverlayRender=OverlayRender;", ctx);
  const painter = ctx.OverlayRender.create(root, { rows: 4 });
  assert.equal(tower.children.length, 20, "rows are built once");
  const frame = ctx.OverlayFeed.frame({ seq: 1, ranked: cars(.4) });
  painter.paint(frame);
  assert.equal(painter.rows[1].el.style.transform, "translate3d(0,34px,0)");
  const original = painter.rows[1].code.textContent;
  painter.rows[1].code.textContent = "sentinel";
  painter.paint(frame);
  assert.equal(painter.rows[1].code.textContent, "sentinel", "unchanged row text is not rewritten");
  frame.rows[1].pos = 1;
  painter.paint(frame);
  assert.equal(painter.rows[1].el.style.transform, "translate3d(0,0px,0)");
  assert.equal(original, "NOR");
});

function loadTv(document) {
  const ctx = { console, document, OverlayFeed: load() };
  vm.createContext(ctx);
  vm.runInContext(source("js/race/tv-graphics.js") + ";this.TvGraphics=TvGraphics;", ctx);
  return ctx.TvGraphics;
}

test("TV graphics diffs ranked order into a pass lower-third and fastest-lap banner", () => {
  const Tv = loadTv(makeDom().document);
  const before = [{ code: "LEC", pos: 1 }, { code: "NOR", pos: 2 }];
  const after = [{ code: "NOR", pos: 1, fastest: true }, { code: "LEC", pos: 2 }];
  const first = Tv.diff(null, before);
  assert.equal(first.lower, null);
  const changed = Tv.diff(first.snapshot, after);
  assert.deepEqual(JSON.parse(JSON.stringify(changed.lower)), { code: "NOR", from: 2, to: 1, over: "LEC" });
  assert.deepEqual(JSON.parse(JSON.stringify(changed.fastest)), { code: "NOR" });
});

test("TV graphics paint only in the broadcast HUD profile", () => {
  const dom = makeDom();
  const Tv = loadTv(dom.document);
  const ranked = cars(.4);
  const G = { hudProfile: "standard", ranked, state: "race", raceT: 4, lap: 2, laps: 10 };
  const graphics = Tv.create(G, dom.document.body);
  graphics.tick(.25, true);
  assert.equal(graphics.element().hidden, true);
  G.hudProfile = "broadcast";
  graphics.tick(.25, true);
  assert.equal(graphics.element().hidden, false);
  assert.match(graphics.element().querySelector(".tvg-battle").textContent, /LEC.*NOR.*0\.40/);
});

test("overlay page explicitly owns transparent and chroma backgrounds and is staged", () => {
  const html = source("overlay.html");
  assert.match(html, /html,\s*body\s*\{[^}]*background:\s*transparent/s);
  assert.match(html, /data-chroma="green"[\s\S]*background:\s*#00b140/);
  assert.match(source("tools/desktop/stage-files.mjs"), /"overlay\.html"/);
});
