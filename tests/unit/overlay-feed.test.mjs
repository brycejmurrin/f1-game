/* Stream overlay frame schema and diff contract. */
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

function load() {
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(source("js/race/broadcast.js") + ";this.Broadcast=Broadcast;", ctx, { filename: absSrc("js/race/broadcast.js") });
  vm.runInContext(source("js/overlay/feed.js") + ";this.OverlayFeed=OverlayFeed;", ctx, { filename: absSrc("js/overlay/feed.js") });
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

test("battle/rowsFrom refuse invented 0.00 gaps when prog or intervalS is missing/NaN", () => {
  const Feed = load();
  const plain = (v) => JSON.parse(JSON.stringify(v));
  // One deepEqual covers: no-prog battle, NaN-prog battle, real fight, missing
  // intervalS, NaN interval/gap, and the prog fallback still used by TV rows.
  assert.deepEqual({
    nanBattle: Feed.battle([{ code: "A", prog: NaN, speed: 50 }, { code: "B", prog: NaN, speed: 50 }]),
    noProgBattle: Feed.battle([{ code: "A", speed: 50 }, { code: "B", speed: 50 }]),
    real: plain(Feed.battle(cars(.4))),
    missingInterval: plain(Feed.rowsFrom([
      { code: "LEC", pos: 1, team: "#e8002d" },
      { code: "YOU", pos: 2, team: "#fff", gapToLeaderS: 1.5, you: true },
    ])[1]),
    nanInterval: plain(Feed.rowsFrom([
      { code: "LEC", pos: 1, intervalS: 0, gapToLeaderS: 0 },
      { code: "YOU", pos: 2, intervalS: NaN, gapToLeaderS: NaN },
    ])[1]),
    progFallback: Feed.rowsFrom(cars(.4))[1].interval,
  }, {
    nanBattle: null,
    noProgBattle: null,
    real: { ahead: "LEC", behind: "NOR", gapS: .4 },
    missingInterval: { pos: 2, code: "YOU", team: "#fff", interval: null, gap: 1.5, tyre: null, pit: false, out: false, you: true },
    nanInterval: { pos: 2, code: "YOU", team: "", interval: null, gap: null, tyre: null, pit: false, out: false, you: false },
    progFallback: .4,
  });
});

test("a caller's own battle (or null) wins over the progress scan", () => {
  const Feed = load();
  const noProg = [{ code: "LEC", pos: 1 }, { code: "VER", pos: 2 }];
  assert.equal(Feed.frame({ state: "race", ranked: noProg, battle: null }).battle, null, "no prog: no 0.00 s fight");
  assert.deepEqual(JSON.parse(JSON.stringify(Feed.frame({ state: "race", ranked: noProg,
    battle: { ahead: "LEC", behind: "VER", gapS: 0.4567 } }).battle)), { ahead: "LEC", behind: "VER", gapS: 0.457 });
  assert.equal(Feed.frame({ state: "race", ranked: noProg, battle: { ahead: "LEC" } }).battle, null, "a malformed battle is none");
  assert.deepEqual(JSON.parse(JSON.stringify(Feed.frame({ state: "race", ranked: cars(.5) }).battle)),
    { ahead: "LEC", behind: "NOR", gapS: .5 }, "no battle key: the scan still runs (TV graphics)");
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
    { pos: 1, code: "LEC", team: "#e8002d", interval: null, gap: null, tyre: "M", pit: false, out: false, you: false },
    { pos: 2, code: "NOR", team: "#ff8700", interval: .4, gap: .4, tyre: null, pit: true, out: false, you: true },
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

test("cleared caption id can re-arm on a later patch (dispose the latch)", () => {
  const Feed = load();
  const diff = Feed.createDiffer(2000);
  const cap = { id: "radio-1", who: "NOR", text: "Box", kind: "radio" };
  diff.next(Feed.frame({ seq: 1, t: 0, ranked: [], caption: cap }), 0);
  const cleared = diff.next(Feed.frame({ seq: 2, t: .25, ranked: [] }), 250);
  assert.equal(cleared.caption, null, "clearing a caption publishes null");
  const again = diff.next(Feed.frame({ seq: 3, t: .5, ranked: [], caption: cap }), 500);
  assert.deepEqual(JSON.parse(JSON.stringify(again.caption)), {
    n: null, who: "NOR", text: "Box", kind: "radio", id: "radio-1",
  }, "same id must reappear after a clear — captionId must not stick");
});

test("leaving race forces battle:null on the differ so overlays cannot stick", () => {
  const Feed = load();
  // Unchanged gap on a patch — battle key was omitted, then forced null.
  const diff = Feed.createDiffer(2000);
  diff.next(Feed.frame({ seq: 1, t: 0, state: "race", ranked: cars(.4) }), 0);
  const ended = diff.next(Feed.frame({ seq: 2, t: .25, state: "results", ranked: cars(.4) }), 250);
  assert.equal(ended.state, "results");
  assert.equal(ended.battle, null, "battle must clear when the session leaves race/count");

  // Gap change on the same leave-race patch — must not ship the new fight.
  const diffGap = Feed.createDiffer(2000);
  diffGap.next(Feed.frame({ seq: 1, t: 0, state: "race", ranked: cars(.4) }), 0);
  const endedGap = diffGap.next(Feed.frame({ seq: 2, t: .25, state: "results", ranked: cars(.2) }), 250);
  assert.equal(endedGap.battle, null, "leave-race wins over a changed battle on a patch");

  // Full frame coinciding with the flag still carries ranked cars — must not re-arm.
  const diffFull = Feed.createDiffer(2000);
  diffFull.next(Feed.frame({ seq: 1, t: 0, state: "race", ranked: cars(.4) }), 0);
  const endedFull = diffFull.next(Feed.frame({ seq: 2, t: 2, state: "results", ranked: cars(.4) }), 2000);
  assert.equal(endedFull.full, true);
  assert.equal(endedFull.battle, null, "full leave-race frame must force battle:null");

  const diffCount = Feed.createDiffer(2000);
  diffCount.next(Feed.frame({ seq: 1, t: 0, state: "count", ranked: cars(.4) }), 0);
  const endedIdle = diffCount.next(Feed.frame({ seq: 2, t: 2, state: "idle", ranked: cars(.4) }), 2000);
  assert.equal(endedIdle.battle, null, "count→idle full frame must force battle:null");
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
  vm.runInContext(source("js/overlay/render.js") + ";this.OverlayRender=OverlayRender;", ctx, { filename: absSrc("js/overlay/render.js") });
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.OverlayRender.options("?demo=1&scale=9&rows=3&side=right&chroma=green"))),
    { scale: 2, rows: 3, side: "right", chroma: "green", demo: true, only: "" });
});

test("overlay boot enables chroma styles only for a selected chroma colour", () => {
  function boot(search) {
    const dom = makeDom();
    const root = dom.document.createElement("main");
    root.id = "overlay";
    root.setAttribute("role", "region");
    const tower = dom.document.createElement("div"); tower.className = "ov-tower";
    const battle = dom.document.createElement("div"); battle.className = "ov-battle";
    battle.append(dom.document.createElement("strong"), dom.document.createElement("span"));
    const sectors = dom.document.createElement("div"); sectors.className = "ov-sectors";
    sectors.append(dom.document.createElement("span"), dom.document.createElement("span"), dom.document.createElement("span"));
    const caption = dom.document.createElement("div"); caption.className = "ov-caption";
    caption.append(dom.document.createElement("strong"), dom.document.createElement("span"));
    root.append(tower, battle, sectors, caption);
    dom.body.appendChild(root);
    const ctx = { console, document: dom.document, URLSearchParams, location: { search }, OverlayFeed: load() };
    vm.createContext(ctx);
    vm.runInContext(source("js/overlay/render.js"), ctx, { filename: absSrc("js/overlay/render.js") });
    return dom.documentElement.dataset;
  }

  assert.equal(Object.hasOwn(boot(""), "chroma"), false, "transparent default must not match html[data-chroma]");
  assert.equal(Object.hasOwn(boot("?chroma=orange"), "chroma"), false, "unsupported colours stay transparent");
  assert.equal(boot("?chroma=green").chroma, "green", "explicit chroma still enables keyed styling");
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
  vm.runInContext(source("js/overlay/render.js") + ";this.OverlayRender=OverlayRender;", ctx, { filename: absSrc("js/overlay/render.js") });
  const painter = ctx.OverlayRender.create(root, { rows: 4 });
  assert.equal(tower.children.length, 22, "rows are built once");
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

test("painter merges differ patches and hides battle after the race ends", () => {
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

  const Feed = load();
  const ctx = { console, document: dom.document, URLSearchParams, OverlayFeed: Feed };
  vm.createContext(ctx);
  vm.runInContext(source("js/overlay/render.js") + ";this.OverlayRender=OverlayRender;", ctx, { filename: absSrc("js/overlay/render.js") });
  const painter = ctx.OverlayRender.create(root, { rows: 4 });
  const full = Feed.frame({ seq: 1, t: 0, state: "race", ranked: cars(.4) });
  painter.paint(full);
  assert.equal(painter.rows[0].el.hidden, false);
  assert.equal(battle.hidden, false, "battle shows while racing");

  // A createDiffer-style patch omits unchanged rows — must NOT wipe the tower.
  painter.paint({ v: 1, seq: 2, t: 0.25 });
  assert.equal(painter.rows[0].el.hidden, false, "omitted rows keep the last tower");
  assert.equal(battle.hidden, false, "omitted battle keeps the last fight while still racing");

  // Race ends without an explicit battle:null — BATTLE must still dispose.
  painter.paint({ v: 1, seq: 3, t: 1, state: "results" });
  assert.equal(battle.hidden, true, "battle cannot stick after results");
  assert.equal(painter.rows[0].el.hidden, false, "classification tower may remain");

  painter.clear();
  assert.equal(painter.rows[0].el.hidden, true);
  assert.equal(battle.hidden, true);
  assert.equal(caption.hidden, true);
});

function loadTv(document) {
  const ctx = { console, document, OverlayFeed: load() };
  vm.createContext(ctx);
  vm.runInContext(source("js/race/tv-graphics.js") + ";this.TvGraphics=TvGraphics;", ctx, { filename: absSrc("js/race/tv-graphics.js") });
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

// #5981: the frame read G.flag, G.lap and G.laps, none of which is a G member, so
// every overlay frame carried flag "" and the stream overlay never showed a caution.
// The flag now comes from G.cautionLevel(); the fake holds only GameCtx members.
test("TV graphics frame carries the race-control flag and the player's lap", () => {
  const dom = makeDom();
  const Tv = loadTv(dom.document);
  let level = 1;
  const G = { hudProfile: "broadcast", ranked: cars(.4), state: "race", raceT: 4,
    player: { lap: 3 }, lapsTarget: 12, cautionLevel: () => level };
  const graphics = Tv.create(G, dom.document.body);
  const yellow = graphics.tick(.25, true).frame;
  assert.equal(yellow.flag, "yellow", "a yellow under race control reaches the overlay frame");
  assert.equal(yellow.lap, 3);
  assert.equal(yellow.laps, 12);
  level = 3;
  assert.equal(graphics.tick(.25, true).frame.flag, "sc");
  level = 0;
  assert.equal(graphics.tick(.25, true).frame.flag, "green");
  assert.deepEqual([0, 1, 2, 3, 4].map((l) => Tv.flagOf({ cautionLevel: () => l })), ["green", "yellow", "vsc", "sc", "red"]);
});

// #5885 item 2: G.ranked drops retired cars, so when the car ahead retires the one behind moves up a
// place by array index. That is no overtake: the lower third said "NOR PASSED LEC" for a retirement.
test("TV graphics show no OVERTAKE when the place was gained because the car ahead retired", () => {
  const Tv = loadTv(makeDom().document);
  const first = Tv.diff(null, [{ code: "LEC" }, { code: "NOR" }, { code: "PIA" }]);
  const retired = Tv.diff(first.snapshot, [{ code: "LEC" }, { code: "PIA" }]);   // NOR retired
  assert.equal(retired.lower, null);
  // A real pass in the same frame as a retirement still names the car actually passed.
  const a = Tv.diff(null, [{ code: "LEC" }, { code: "NOR" }, { code: "PIA" }, { code: "RUS" }]);
  const b = Tv.diff(a.snapshot, [{ code: "RUS" }, { code: "LEC" }, { code: "PIA" }]);   // NOR out, RUS past LEC and PIA
  assert.deepEqual(JSON.parse(JSON.stringify(b.lower)), { code: "RUS", from: 4, to: 1, over: "LEC" });
});

// #5941: live cars carry their best lap as c.best and never a .fastest flag, so the FASTEST LAP card
// never showed. The car with the lowest best lap holds it; a lap that beats it moves the card.
test("TV graphics show FASTEST LAP from the live cars' best laps, and move it when a lap beats it", () => {
  const Tv = loadTv(makeDom().document);
  const a = Tv.diff(null, [{ code: "LEC", best: 0 }, { code: "NOR", best: 0 }]);
  assert.equal(a.fastest, null, "no lap set yet");
  const b = Tv.diff(a.snapshot, [{ code: "LEC", best: 81.2 }, { code: "NOR", best: 0 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(b.fastest)), { code: "LEC" });
  const c = Tv.diff(b.snapshot, [{ code: "LEC", best: 81.2 }, { code: "NOR", best: 80.9 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(c.fastest)), { code: "NOR" });
  const d = Tv.diff(c.snapshot, [{ code: "LEC", best: 81.2 }]);   // NOR retires: the mark is not LEC's
  assert.equal(d.fastest, null);
});

test("TV graphics paint only in the broadcast HUD profile", () => {
  const dom = makeDom();
  const Tv = loadTv(dom.document);
  const ranked = cars(.4);
  const G = { hudProfile: "standard", ranked, state: "race", raceT: 4, player: { lap: 2 }, lapsTarget: 10 };
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

test("the overlay companion loads the shared broadcast helpers without the replay graphics", () => {
  assert.doesNotMatch(source("overlay.html"), /js\/race\/tv-graphics\.js/);
  const shells = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html") && /js\/race\/broadcast\.js/.test(source(f)));
  assert.deepEqual(shells.sort(), ["index.html", "overlay.html"]);
});
