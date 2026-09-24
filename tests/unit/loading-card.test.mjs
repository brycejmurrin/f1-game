/* THE LOADING CARD'S GEOMETRY — the three numbers the flyby editor authors.
 *
 * js/ui/loading-screen.js is a DOM screen and nothing here boots one. What is
 * checkable without a browser is the part that decides what reaches the
 * stylesheet, and that part is where this feature can actually break a player's
 * game rather than just look wrong:
 *
 *  1. A PARTIAL OR HOSTILE GEOMETRY MUST NOT REACH CSS. The value comes out of
 *     localStorage, so it can be a save from a future build, a hand-edited
 *     blob, or half an object. `NaNvw` in a custom property is not an error CSS
 *     reports — the declaration is dropped and the card silently keeps whatever
 *     it had, which is the one failure mode nobody would think to look for.
 *  2. NULL IS WHAT "UNCHANGED" IS STORED AS. The flyby shot list learned this
 *     the expensive way (see persist() in js/camera/flyby-panel.js): storing a
 *     copy of the defaults pins the player to today's numbers and silently
 *     ignores every later change to them.
 *
 * Run: node --test tests/unit/loading-card.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/** LoadingScreen's module surface, evaluated on its own — the same `const` ->
 *  `var` rewrite tests/unit/flyby-panel.test.mjs uses for the other UI modules. */
function load() {
  const sb = { Math, JSON, Object, Array, Number, String, isFinite, Date, console };
  sb.window = sb;
  vm.runInNewContext(read("js/ui/loading-screen.js").replace(/^const\b/gm, "var"), sb,
    { filename: "js/ui/loading-screen.js" });
  assert.ok(sb.LoadingScreen, "js/ui/loading-screen.js assigns the LoadingScreen global");
  return sb.LoadingScreen;
}

const LS = load();
const { CARD, CARD_KEYS, clampCard, cardPristine, cardVars } = LS;

test("the registry is complete: every key has a range, a step, a label and a default inside it", () => {
  assert.ok(CARD_KEYS.length >= 3, "size and both axes, at least");
  for (const k of CARD_KEYS) {
    const d = CARD[k];
    assert.ok(d, `${k} has no definition`);
    assert.ok(d.label && d.label.length > 2, `${k} has no label for its slider`);
    assert.ok(Number.isFinite(d.min) && Number.isFinite(d.max) && d.min < d.max, `${k} has no usable range`);
    assert.ok(d.step > 0, `${k} has no step`);
    assert.ok(d.def >= d.min && d.def <= d.max, `${k}'s shipped default is outside its own slider`);
  }
});

test("clampCard fills EVERY field from anything at all — the store can hand back a fragment", () => {
  for (const hostile of [null, undefined, {}, [], "1.2", 7, { scale: "big" }, { scale: NaN }, { x: Infinity }]) {
    const g = clampCard(hostile);
    for (const k of CARD_KEYS) {
      assert.ok(Number.isFinite(g[k]), `${k} came back ${g[k]} from ${JSON.stringify(hostile)}`);
      assert.ok(g[k] >= CARD[k].min && g[k] <= CARD[k].max, `${k} came back out of range`);
    }
  }
});

test("a partial save keeps what it has and defaults the rest — it is not thrown away whole", () => {
  const g = clampCard({ x: 12 });
  assert.equal(g.x, 12);
  assert.equal(g.scale, CARD.scale.def);
  assert.equal(g.y, CARD.y.def);
});

test("an out-of-range value is CLAMPED, never dropped — a card three times the screen is a card nobody can move back", () => {
  const big = clampCard({ scale: 99, x: 5000, y: -5000 });
  assert.equal(big.scale, CARD.scale.max);
  assert.equal(big.x, CARD.x.max);
  assert.equal(big.y, CARD.y.min);
  const small = clampCard({ scale: -3 });
  assert.equal(small.scale, CARD.scale.min);
});

test("the shipped geometry is pristine, and one moved field is not", () => {
  assert.equal(cardPristine(null), true, "no save at all is the shipped card");
  assert.equal(cardPristine({}), true);
  const def = {};
  for (const k of CARD_KEYS) def[k] = CARD[k].def;
  assert.equal(cardPristine(def), true, "a geometry equal to the defaults must still store as null");
  assert.equal(cardPristine(Object.assign({}, def, { x: 3 })), false);
  // …and a value that CLAMPS back onto the default is pristine, because what
  // the card ends up at is what "unchanged" means.
  assert.equal(cardPristine(Object.assign({}, def, { scale: "nonsense" })), true);
});

test("cardVars emits parseable CSS for every input, hostile ones included", () => {
  for (const hostile of [null, { scale: NaN, x: "left", y: {} }, { x: 1e9 }]) {
    const v = cardVars(hostile);
    // A bare number for the scale: the stylesheet divides the width cap by it,
    // and a unit there makes the whole calc() invalid.
    assert.match(v["--ld-card-scale"], /^[0-9]+(\.[0-9]+)?$/, JSON.stringify(v));
    // The offsets carry the SCREEN's units, not the card's. A percentage would
    // be a percentage of the card, so the same saved number would move a scaled
    // card further than an unscaled one.
    assert.match(v["--ld-card-x"], /^-?[0-9]+(\.[0-9]+)?vw$/, JSON.stringify(v));
    assert.match(v["--ld-card-y"], /^-?[0-9]+(\.[0-9]+)?vh$/, JSON.stringify(v));
    for (const s of Object.values(v)) assert.ok(!/NaN|undefined|Infinity/.test(s), s);
  }
});

test("the stylesheet reads exactly the custom properties this module writes, and gives each one a fallback", () => {
  // The two halves of this feature live in different files and neither imports
  // the other. A renamed property fails SILENTLY — CSS drops an unknown var()
  // and the card renders at its fallback, which looks exactly like "the player
  // never moved it".
  const css = read("css/overlays.css");
  for (const name of Object.keys(cardVars(null))) {
    assert.ok(css.includes(name), `css/overlays.css never reads ${name}`);
    assert.match(css, new RegExp(`var\\(${name},\\s*[^)]+\\)`),
      `${name} is read with no fallback — a browser with no saved geometry gets an invalid declaration`);
  }
});

test("the shipped default is the card that ships TODAY: no offset, no rescale", () => {
  // If this ever needs changing, the change belongs in the stylesheet, not
  // here: a non-identity default means every player's stored "unchanged" is a
  // different card from the one the CSS draws without JS.
  const v = cardVars(null);
  assert.equal(v["--ld-card-scale"], "1");
  assert.equal(v["--ld-card-x"], "0vw");
  assert.equal(v["--ld-card-y"], "0vh");
});

/* ── THE LETTERBOX ─────────────────────────────────────────────────────────
 * CSS only (css/overlays.css), so what is checkable here is the SOURCE: the
 * bars exist, are keyed on the flyby's run phase alone, are gated on landscape
 * and on motion being welcome, and the card paints above them. */

/** The body of the first `@media` block whose prelude matches `re`. */
function mediaBody(css, re) {
  const at = css.search(re);
  if (at < 0) return "";
  let i = css.indexOf("{", at), depth = 0;
  const start = i + 1;
  for (; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(start, i);
  }
  return "";
}

test("letterbox bars run over the flyby only, in landscape, and never under reduced motion", () => {
  const css = read("css/overlays.css");
  assert.match(css, /#loading::before,\s*#loading::after\s*\{[^}]*content:\s*none/,
    "the bars must be OFF by default — only the run phase turns them on");
  assert.match(css, /#loading::before,\s*#loading::after\s*\{[^}]*height:[^;]*2\.35/, "a 2.35:1 frame");
  const gated = mediaBody(css, /@media[^{]*orientation:\s*landscape[^{]*prefers-reduced-motion:\s*no-preference/);
  assert.ok(gated, "the bars are gated on landscape AND prefers-reduced-motion: no-preference");
  assert.match(gated, /#loading\[data-phase="run"\]::before/);
  assert.match(gated, /#loading\[data-phase="run"\]::after/);
  assert.match(gated, /content:\s*""/, "…and that is where they get their content");
  assert.match(gated, /var\(--ld-fly,\s*24s\)/, "timed to the run's budget, falling back to the shipped 24 s");
  // Nowhere else turns them on: not the no-world card, not the editor's hold.
  const outside = css.replace(gated, "");
  assert.ok(!/#loading\[data-phase="[a-z]+"\]::(before|after)/.test(outside),
    "a letterbox rule outside the landscape/motion gate");
  assert.ok(!/data-phase="(card|hold)"\]::(before|after)/.test(css), "the card and hold phases never letterbox");
  // They OPEN at the end: the last keyframe puts each bar back off-screen.
  for (const [name, dir] of [["ld-bar-top", "-100%"], ["ld-bar-bottom", "100%"]]) {
    const kf = css.match(new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?)\\n\\}`));
    assert.ok(kf, `@keyframes ${name} is missing`);
    assert.ok(new RegExp(`0%,\\s*100%\\s*\\{\\s*transform:\\s*translateY\\(${dir.replace(/[-%]/g, "\\$&")}\\)`).test(kf[1]),
      `${name} must start AND end off-screen — the bars open on the last beat`);
  }
});

test("the card paints ABOVE the letterbox, so the bottom bar never covers it", () => {
  const css = read("css/overlays.css");
  const card = css.match(/\n#ld-card\s*\{([\s\S]*?)\n\}/);
  assert.ok(card, "#ld-card rule not found");
  assert.match(card[1], /position:\s*relative/);
  const cz = +(card[1].match(/z-index:\s*(\d+)/) || [])[1];
  const bars = css.match(/#loading::before,\s*#loading::after\s*\{([^}]*)\}/);
  const bz = +(bars[1].match(/z-index:\s*(\d+)/) || [])[1];
  assert.ok(Number.isFinite(cz) && Number.isFinite(bz) && cz > bz, `card z ${cz} must exceed bar z ${bz}`);
  // The shipped placement is bottom-centre with no offset: the lower third
  // overlaps the bottom bar, which is why the stacking order matters at all.
  assert.equal(CARD.y.def, 0);
});

/* ── THE HABITUAL SKIPPER ──────────────────────────────────────────────────
 * Three flybys skipped in a row and the next one is SHORT_FLY_MS. Checked on
 * the pure pair first, then through a real create() with stub DOM, a stub
 * store and fake timers — which is where "the announcer gets the shorter
 * budget" and "the shots follow" (progress() over the run's own length) live. */

test("the streak: a skip extends it, a watched flyby clears it, hostile input is no streak", () => {
  const { flyMsFor, nextSkips, FLY_MS, SHORT_FLY_MS, SKIP_STREAK } = LS;
  assert.equal(FLY_MS, 24000);
  assert.equal(SHORT_FLY_MS, 12000);
  assert.equal(SKIP_STREAK, 3);
  for (const n of [0, 1, 2, null, undefined, "x", NaN, -5, {}]) assert.equal(flyMsFor(n), FLY_MS, String(n));
  for (const n of [3, 4, 99, "3"]) assert.equal(flyMsFor(n), SHORT_FLY_MS, String(n));
  assert.equal(nextSkips(0, true), 1);
  assert.equal(nextSkips(2, true), 3);
  assert.equal(nextSkips(7, false), 0, "one flyby watched to the end resets the streak");
  for (const n of [null, undefined, "junk", NaN, -2, {}]) assert.equal(nextSkips(n, true), 1, String(n));
  assert.equal(nextSkips(99, true), 99, "capped");
  assert.equal(nextSkips(2.7, true), 3);
});

/** A LoadingScreen instance over stubs: every $() id is a do-nothing element,
 *  timers and Date are fake, the store is a Map, and the announcer records the
 *  budget it was handed. */
function harness(stored = {}, storeOverride = null) {
  let now = 5000, seq = 0;
  const q = [], listeners = {}, saved = new Map(Object.entries(stored));
  const plays = [];
  const elem = () => ({
    dataset: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
    hidden: true, innerHTML: "", textContent: "",
    replaceChildren() {}, appendChild() {}, append() {},
  });
  const els = {};
  const sb = {
    Math, JSON, Object, Array, Number, String, Set, isFinite, console,
    Date: { now: () => now },
    setTimeout(fn, ms) { const id = ++seq; q.push({ id, at: now + (ms || 0), fn }); return id; },
    clearTimeout(id) { const k = q.findIndex((t) => t.id === id); if (k >= 0) q.splice(k, 1); },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || new Set()).add(fn); },
    removeEventListener(type, fn) { if (listeners[type]) listeners[type].delete(fn); },
    document: { createElement: () => elem() },
    Log: { warn() {}, info() {} },
  };
  sb.window = sb;
  vm.runInNewContext(read("js/ui/loading-screen.js").replace(/^const\b/gm, "var"), sb,
    { filename: "js/ui/loading-screen.js" });
  const races = [];
  const screen = sb.LoadingScreen.create({
    $: (id) => (els[id] = els[id] || elem()),
    Tracks: {}, TrackMaps: { corners: () => [] }, Flags: { svg: () => "" },
    store: storeOverride || { get: (k, d) => (saved.has(k) ? saved.get(k) : d), set: (k, v) => saved.set(k, v) },
    announcer: () => ({ play: (info, budget) => { plays.push(budget); return true; }, stop() {} }),
  });
  const info = { track: { id: "monza", name: "MONZA", country: "Italy" }, laps: 5, hasWorld: true };
  return {
    screen, saved, plays, races, els,
    run: (over = {}) => screen.run(Object.assign({}, info, over), () => races.push(now)),
    skip: () => { for (const fn of listeners.keydown || []) fn({ type: "keydown", repeat: false }); },
    tick(ms) {
      const end = now + ms;
      for (;;) {
        q.sort((a, b) => a.at - b.at || a.id - b.id);
        if (!q.length || q[0].at > end) break;
        const t = q.shift(); now = t.at; t.fn();
      }
      now = end;
    },
  };
}

test("three skips in a row shorten the next flyby — and its announcer budget — to 12 s", () => {
  const h = harness();
  for (let k = 0; k < 3; k++) {
    h.run();
    assert.equal(h.plays.at(-1), LS.FLY_MS, `flyby ${k + 1} is still the full cut`);
    h.tick(2000);
    h.skip();
    assert.equal(h.saved.get("flySkips"), k + 1);
    h.screen.stop();
  }
  h.run();
  assert.equal(h.plays.at(-1), LS.SHORT_FLY_MS, "the announcer is fitted to the SHORT budget");
  assert.equal(h.els.loading.style.props["--ld-fly"], "12000ms", "the letterbox is timed to it too");
  // The shots follow: progress() is a fraction of THIS run's length.
  h.tick(6000);
  assert.ok(Math.abs(h.screen.progress() - 0.5) < 1e-9, `progress ${h.screen.progress()} at 6 s of 12`);
  // …and the race starts when the short flyby ends, not at 24 s.
  h.tick(6000);
  assert.equal(h.races.length, 4, "every run handed over to the race");
});

test("a flyby that plays out resets the streak, and the full cut comes back", () => {
  const h = harness({ flySkips: 5 });
  h.run();
  assert.equal(h.plays.at(-1), LS.SHORT_FLY_MS);
  h.tick(LS.SHORT_FLY_MS);
  assert.equal(h.saved.get("flySkips"), 0, "watched to the end: the streak is over");
  h.screen.stop();
  h.run();
  assert.equal(h.plays.at(-1), LS.FLY_MS);
  assert.equal(h.els.loading.style.props["--ld-fly"], "24000ms");
});

test("only a FLYBY counts: the no-world card and a stop() before the end leave the streak alone", () => {
  const h = harness({ flySkips: 2 });
  h.run({ hasWorld: false });
  h.skip();
  assert.equal(h.saved.get("flySkips"), 2, "skipping the 700 ms card is not a vote on the flyby");
  h.run({ hasWorld: false });
  h.tick(LS.CARD_MS);
  assert.equal(h.saved.get("flySkips"), 2, "…and neither is letting it run");
  h.run();
  h.screen.stop();
  h.tick(LS.FLY_MS);
  assert.equal(h.saved.get("flySkips"), 2, "a run cancelled from outside is neither a skip nor a watch");
});

test("a store that throws never stops the flyby", () => {
  const boom = () => { throw new Error("storage refused"); };
  const h = harness({}, { get: boom, set: boom });
  h.run();
  assert.equal(h.plays.at(-1), LS.FLY_MS, "an unreadable streak is no streak");
  h.skip();
  assert.equal(h.races.length, 1, "the skip still reaches the race when the write throws");
  h.screen.stop();
  h.run();
  h.tick(LS.FLY_MS);
  assert.equal(h.races.length, 2, "…and so does a flyby that plays out");
});

test("the skip hint is a run-phase pseudo-element that waits ~3 s — no new shell node", () => {
  const css = read("css/overlays.css");
  const rule = css.match(/#loading\[data-phase="run"\] #ld-card::after\s*\{([^}]*)\}/);
  assert.ok(rule, "the hint rule is keyed on the run phase");
  assert.match(rule[1], /content:\s*"[^"]*RACE[^"]*"/i);
  assert.match(rule[1], /opacity:\s*0\b/, "hidden until its fade");
  assert.match(rule[1], /animation:[^;]*\b3s\b/, "fades in after ~3 s");
  assert.ok(!/data-phase="(card|hold)"\] #ld-card::after/.test(css), "no hint on the card fallback or the editor's hold");
  assert.ok(!/id="ld-(skip|hint)"/.test(read("index.html")), "the hint must not be a DOM node — shellNodes is at its ceiling");
});

/* ── THE STARTING GRID GRAPHIC AND THE RADIO CHECK ─────────────────────────
 * Over the flyby's grid shots the map slot shows the field as two staggered
 * columns with the player's box highlighted; as grid-mine starts, the engineer
 * says one line through TEAM RADIO. The geometry is pure; the switch and the
 * radio run through a real create() over the REAL FlybySeq.shotAt and
 * RadioLines, with the radio and the announcer as recording stubs. */

const { gridLayout, gridField, gridColour, isGridShot, GRID_ROW_MIN } = LS;
const field = (n, me) => Array.from({ length: n }, (_, i) => ({ code: "D" + String(i).padStart(2, "0"), colour: [0.2, 0.4, 0.8], isPlayer: i === me }));
/** A bare sandbox with `files` evaluated in it (the const -> var rewrite). */
function modules(files) {
  const sb = { Math, Object, Array, Number, String, JSON, Map, Set, WeakMap, RegExp, isFinite, console, Log: { info() {}, warn() {} } };
  sb.window = sb;
  for (const f of files) vm.runInNewContext(read(f).replace(/^const\b/gm, "var"), sb, { filename: f });
  return sb;
}

test("grid geometry: two staggered columns, P1 left and half a row ahead of P2, all inside the card's map box", () => {
  const L = gridLayout(field(22, 11), 210, 150, 11);
  assert.ok(L.rows >= 4 && L.rows <= 11, `rows ${L.rows}`);
  assert.ok(L.rowH >= GRID_ROW_MIN, `row ${L.rowH} px is under the legibility floor`);
  assert.ok(L.font >= 10, `a ${L.font} px code is not readable on a phone`);
  for (const c of L.cells) {
    assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= 210 + 1e-9 && c.y + c.h <= 150 + 1e-9, `P${c.pos} leaves the box`);
    assert.equal(c.col, (c.pos - 1) % 2, "odd positions left, even right");
  }
  for (let k = 0; k + 1 < L.cells.length; k += 2) {
    const a = L.cells[k], b = L.cells[k + 1];
    assert.ok(a.x + a.w < b.x, "the odd slot is on the left, clear of the even one");
    assert.ok(Math.abs(b.y - a.y - L.rowH / 2) < 1e-9, "the even slot is half a row behind");
  }
  // The player's row is IN the window, and theirs is the only highlight.
  const mine = L.cells.filter((c) => c.isPlayer);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].pos, 12);
  assert.equal(mine[0].code, "D11");
});

test("grid geometry: the window follows the player, and clamps at the grid's ends", () => {
  const front = gridLayout(field(22, 0), 210, 150, 0);
  assert.equal(front.first, 0, "pole: the window starts at the front row");
  assert.equal(front.cells[0].pos, 1);
  const back = gridLayout(field(22, 21), 210, 150, 21);
  assert.equal(back.cells.at(-1).pos, 22, "last on the grid: the window ends at the back row");
  assert.ok(back.cells.some((c) => c.isPlayer && c.pos === 22));
  // A phone: the canvas shown at 70 % keeps its rows legible by showing FEWER.
  const phone = gridLayout(field(22, 11), 147, 105, 11);
  assert.ok(phone.rows < gridLayout(field(22, 11), 210, 150, 11).rows);
  assert.ok(phone.rowH >= GRID_ROW_MIN && phone.font >= 10);
  assert.ok(phone.cells.some((c) => c.isPlayer), "the player's box survives the smaller window");
  // A wide circuit leaves a short box: still at least one row, never an empty graphic.
  assert.ok(gridLayout(field(22, 5), 210, 40, 5).cells.some((c) => c.isPlayer));
  // A two-car duel is one row.
  assert.equal(gridLayout(field(2, 1), 210, 150, 1).rows, 1);
});

test("grid geometry: an unknown slot highlights nobody, and the card keeps its map", () => {
  const L = gridLayout(field(22, -1), 210, 150, -1);
  assert.equal(L.first, 0, "no player: from the front");
  assert.ok(L.cells.every((c) => !c.isPlayer));
  assert.equal(gridField(field(22, -1)), null, "a random grid (no player in it) is not drawn");
  assert.equal(gridField([{ isPlayer: true }]), null, "a field of one is not a grid");
  assert.equal(gridField([{ isPlayer: true }, { isPlayer: true }]), null, "two players is broken data");
  for (const junk of [null, undefined, "grid", 7, {}, [null, { isPlayer: true }]]) assert.equal(gridField(junk), null, JSON.stringify(junk));
  assert.ok(gridField(field(22, 3)));
});

test("grid colours: a black car is lifted to be visible, junk falls back to the accent", () => {
  assert.equal(gridColour([1, 0.502, 0]), "rgb(255,128,0)");
  const m = gridColour([0.045, 0.055, 0.065]).match(/\d+/g).map(Number);
  assert.ok(m.every((v) => v > 100), `Mercedes black must be lifted, got ${m}`);
  for (const junk of [null, undefined, [], [NaN, 0, 0], {}]) assert.equal(gridColour(junk), "#e10600");
  assert.ok(isGridShot("grid-mine") && isGridShot("grid-crane") && !isGridShot("wide") && !isGridShot(undefined));
});

/** A LoadingScreen over the REAL FlybySeq and RadioLines, with fake timers
 *  (setInterval included: the shot watcher rides the pad poll), a canvas that
 *  records its draws, and radio/announcer stubs. */
function gridHarness({ grid = field(22, 11), speaking = () => false, radioOn = true, stored = {} } = {}) {
  let now = 5000, seq = 0;
  const q = [], listeners = {}, saved = new Map(Object.entries(stored));
  const said = [], stops = [], stings = [], ops = [];
  const elem = () => ({
    dataset: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
    hidden: true, innerHTML: "", textContent: "", width: 420, height: 300, clientWidth: 0, attrs: {},
    replaceChildren() {}, appendChild() {}, append() {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getContext: () => new Proxy({}, { get: (_, k) => (typeof k === "string" ? () => ops.push(k) : undefined), set: () => true }),
  });
  const els = {};
  const sb = {
    Math, JSON, Object, Array, Number, String, Set, Map, WeakMap, RegExp, isFinite, console,
    Date: { now: () => now },
    setTimeout(fn, ms) { const id = ++seq; q.push({ id, at: now + (ms || 0), fn }); return id; },
    clearTimeout(id) { const k = q.findIndex((t) => t.id === id); if (k >= 0) q.splice(k, 1); },
    setInterval(fn, ms) { const id = ++seq; const rep = () => q.push({ id, at: now + ms, fn: () => { rep(); fn(); } }); rep(); return id; },
    clearInterval(id) { for (let k = q.length - 1; k >= 0; k--) if (q[k].id === id) q.splice(k, 1); },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || new Set()).add(fn); },
    removeEventListener(type, fn) { if (listeners[type]) listeners[type].delete(fn); },
    document: { createElement: () => elem() },
    Log: { warn() {}, info() {} },
    GameAudio: { radioLeadS: () => 0.43, radioSting: (ch, life) => stings.push(life) },
  };
  sb.window = sb;
  for (const f of ["js/camera/flyby-seq.js", "js/race/radio-lines.js", "js/ui/loading-screen.js"]) {
    vm.runInNewContext(read(f).replace(/^const\b/gm, "var"), sb, { filename: f });
  }
  const screen = sb.LoadingScreen.create({
    $: (id) => (els[id] = els[id] || elem()),
    Tracks: {}, Flags: { svg: () => "" },
    TrackMaps: { corners: () => [], fitCanvas: () => ({ w: 210, h: 150 }), draw: () => ops.push("map") },
    store: { get: (k, d) => (saved.has(k) ? saved.get(k) : d), set: (k, v) => saved.set(k, v) },
    announcer: () => ({ play: () => true, stop() {}, speaking }),
    radio: () => ({ sayPreRace: (text, life, lead) => { said.push({ text, life, lead }); return radioOn; }, stop: () => stops.push(now) }),
  });
  const info = { track: { id: "monza", name: "MONZA", country: "Italy" }, laps: 5, hasWorld: true, shots: sb.FlybySeq.DEFAULT, grid };
  const h = {
    screen, said, stops, stings, ops, els,
    run: (over = {}) => { h.t0 = now; screen.run(Object.assign({}, info, over), () => {}); },
    skip: () => { for (const fn of listeners.keydown || []) fn({ type: "keydown", repeat: false }); },
    view: () => els["ld-map"].dataset.view,
    tickTo(u) { h.tick(h.t0 + u * LS.FLY_MS - now); },
    tick(ms) {
      const end = now + ms;
      for (;;) {
        q.sort((a, b) => a.at - b.at || a.id - b.id);
        if (!q.length || q[0].at > end) break;
        const t = q.shift(); now = t.at; t.fn();
      }
      now = end;
    },
  };
  return h;
}

// The shipped sequence: grid-crane starts at 0.68 of the flyby, grid-mine at 0.88.
test("the map slot switches to the grid for the grid shots, and back to the map otherwise", () => {
  const h = gridHarness();
  h.run();
  assert.equal(h.view(), "map");
  h.tickTo(0.5);
  assert.equal(h.view(), "map", "turn shots: the circuit map");
  h.tickTo(0.72);
  assert.equal(h.view(), "grid", "grid-crane: the grid graphic");
  assert.match(h.els["ld-map"].attrs["aria-label"], /grid.*P12/i, "the swap is announced to a screen reader too");
  assert.ok(h.ops.includes("fillText") && h.ops.includes("strokeRect"), "codes drawn, the player's box outlined");
  h.tickTo(0.95);
  assert.equal(h.view(), "grid", "still the grid over grid-mine");
  // A new run starts on the map again, and a list with no grid shot stays there.
  h.screen.stop();
  h.run({ shots: [{ id: "wide", dur: 1, eye: [], look: [] }] });
  assert.equal(h.view(), "map");
  h.tickTo(0.9);
  assert.equal(h.view(), "map", "a list with no grid shot never shows the graphic");
});

test("an unknown slot (random grid) or a missing field keeps the map through the grid shots", () => {
  for (const grid of [field(22, -1), null, [], [{ code: "YOU", isPlayer: true }]]) {
    const h = gridHarness({ grid });
    h.run();
    h.tickTo(0.95);
    assert.equal(h.view(), "map", JSON.stringify(grid && grid.length));
    assert.equal(h.said.length, 0, "no slot, no radio check naming one");
  }
});

test("the radio check fires ONCE, as grid-mine starts, with the player's slot and what is left of the flyby", () => {
  const h = gridHarness();
  h.run();
  h.tickTo(0.87);
  assert.equal(h.said.length, 0, "not before grid-mine");
  h.tickTo(0.885);
  assert.equal(h.said.length, 1);
  assert.match(h.said[0].text, /^P12\. /);
  assert.ok(Math.abs(h.said[0].life - LS.FLY_MS * 0.12 / 1000) < 0.2, `budget ${h.said[0].life}`);
  assert.equal(h.said[0].lead, 0.43, "the words wait out the courtesy figure, as in a race");
  assert.equal(h.stings.length, 1, "the radio's click and hiss go with it");
  h.tickTo(0.99);
  assert.equal(h.said.length, 1, "at most once per loading screen");
  // Every eng.grid line fits the budget the check guarantees (RadioVoice.plan).
  const sb = modules(["js/audio/radio-voice.js", "js/race/radio-lines.js"]);
  for (const tpl of sb.RadioLines.POOLS["eng.grid"]) {
    const msg = sb.RadioLines.fill(tpl, { pos: 22 });
    const p = sb.RadioVoice.plan({ msg, life: 2.2, kind: "race", lead: 0.43, enabled: true, soundOn: true, api: true, state: "menu", preRace: true });
    assert.ok(p.speak, `"${msg}" does not fit 2.2 s (${p.reason})`);
  }
});

test("the radio check never talks over the announcer: it waits, and gives up when the flyby runs out", () => {
  let talking = true;
  const h = gridHarness({ speaking: () => talking });
  h.run();
  h.tickTo(0.89);
  assert.equal(h.said.length, 0, "the announcer is still reading");
  talking = false;
  h.tickTo(0.895);
  assert.equal(h.said.length, 1, "…and the line goes the moment it stops");

  const g = gridHarness({ speaking: () => true });
  g.run();
  g.tickTo(0.999);
  assert.equal(g.said.length, 0, "a read that runs to the end leaves no room for the radio");
});

test("TEAM RADIO off, or the chatter setting at off/key, says nothing; the refusal is final for the run", () => {
  const off = gridHarness({ radioOn: false });
  off.run();
  off.tickTo(0.99);
  assert.equal(off.said.length, 1, "offered once, refused by the radio's own settings (sayPreRace -> false)");
  assert.equal(off.stings.length, 0, "a refused line plays no radio sting");
  for (const chat of ["off", "key"]) {
    const h = gridHarness({ stored: { radioChat: chat } });
    h.run();
    h.tickTo(0.99);
    assert.equal(h.said.length, 0, `radioChat ${chat}`);
  }
  // sayPreRace's gate IS RadioVoice.plan: the same refusals as a race line,
  // with only the session gate lifted, and only when asked for by name.
  const RV = modules(["js/audio/radio-voice.js"]).RadioVoice;
  const base = { msg: "P12. STAY CALM", life: 2.8, kind: "race", lead: 0.43, enabled: true, soundOn: true, api: true, state: "menu" };
  const P = (o) => RV.plan(Object.assign({}, base, o));
  assert.equal(P({}).reason, "not-racing", "a menu line is still refused without preRace");
  assert.equal(P({ preRace: true }).speak, true);
  assert.equal(P({ preRace: true, enabled: false }).reason, "off");
  assert.equal(P({ preRace: true, soundOn: false }).reason, "master-off");
  assert.equal(RV.inert().sayPreRace("P1. STAY CALM", 3), false, "the inert radio has the method too");
});

test("stop() and a skip cut a radio check that is on air", () => {
  const h = gridHarness();
  h.run();
  h.tickTo(0.9);
  assert.equal(h.said.length, 1);
  h.screen.stop();
  assert.equal(h.stops.length, 1, "stop() ends the line with the screen");
  h.screen.stop();
  assert.equal(h.stops.length, 1, "…once: a later stop() never cuts somebody else's race line");

  const s = gridHarness();
  s.run();
  s.tickTo(0.9);
  s.skip();
  assert.equal(s.stops.length, 1, "a skip cuts it too");
  s.tickTo(0.99);
  assert.equal(s.said.length, 1, "and nothing fires after the skip");

  const early = gridHarness();
  early.run();
  early.tickTo(0.5);
  early.skip();
  early.tickTo(0.95);
  assert.equal(early.said.length, 0, "skipped before grid-mine: no radio check at all");
  assert.equal(early.stops.length, 0);
});

test("FlybySeq.shotAt names the shot solve() cuts to, without planning it", () => {
  const F = modules(["js/camera/flyby-seq.js"]).FlybySeq;
  assert.equal(F.shotAt(0).id, F.DEFAULT[0].id);
  assert.equal(F.shotAt(1).id, "grid-mine");
  assert.equal(F.shotAt(0.87).id, "grid-front");
  assert.equal(F.shotAt(0.885).id, "grid-mine");
  assert.equal(F.shotAt(NaN).id, F.DEFAULT[0].id, "hostile progress is the start");
  assert.equal(F.shotAt(0.99, F.withoutSlot(F.DEFAULT)).id, "grid-front", "a random grid's list ends on grid-front");
  // solve() takes its cut from shotAt, so the two cannot drift.
  assert.match(read("js/camera/flyby-seq.js"), /const on = shotAt\(u, list\)/);
});

test("game.js hands the card its field in grid order, the flyby's shots, and the radio", () => {
  const game = read("js/game.js");
  assert.match(game, /LoadingScreen\.create\(\{[^}]*radio: \(\) => radioVoice/);
  const at = game.indexOf("function loadingInfo()");
  const li = game.slice(at, at + 2500);
  assert.match(li, /shots: flybyShots/);
  assert.match(li, /isPlayer: c === player && FlybySeq\.slotKnown\(\)/, "an unknown slot (random grid) must flag no player");
});
