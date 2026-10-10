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
import { readCssSource } from "../helpers/css-source.mjs";
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
  const css = readCssSource("css/overlays.css");
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
  const css = readCssSource("css/overlays.css");
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
  const css = readCssSource("css/overlays.css");
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
  assert.equal(FLY_MS, 20000);
  assert.equal(SHORT_FLY_MS, 10000);
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
function harness(stored = {}, storeOverride = null, docEl = null, nav = undefined) {
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
    document: { createElement: () => elem(), documentElement: docEl },
    Log: { warn() {}, info() {} },
  };
  if (nav !== undefined) sb.navigator = nav;
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
    skip: (ev = {}) => { for (const fn of listeners.keydown || []) fn(Object.assign({ type: "keydown", repeat: false }, ev)); },
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

test("SETTINGS › MOTION: REDUCED still runs the card, the flyby and the announcer after the garage leave — a tap skips them", () => {
  const h = harness({}, null, { dataset: { motion: "reduce" } });
  h.run();
  assert.equal(h.els.loading.dataset.phase, "run", "the flyby runs under the in-game REDUCED setting (2026-10-09: the 700 ms card read as a broken start)");
  assert.equal(h.plays.at(-1), LS.FLY_MS, "the announcer reads over it, fitted to the full cut");
  h.tick(LS.CARD_MS);
  assert.equal(h.races.length, 0, "the race does not start after a 700 ms card");
  h.tick(LS.FLY_MS - LS.CARD_MS);
  assert.equal(h.races.length, 1, "the race starts when the flyby has run its length");
  const skip = harness({}, null, { dataset: { motion: "reduce" } });
  skip.run(); skip.tick(2000); skip.skip();
  assert.equal(skip.races.length, 1, "still skippable: a tap after the grace window goes to the race");
  const on = harness({}, null, { dataset: {} });
  on.run();
  assert.equal(on.els.loading.dataset.phase, "run", "motion ON keeps the flyby");
});

test("a harness-driven launch (navigator.webdriver) keeps the 700 ms card and hands off to the grid promptly; a player's reduced motion still flies", () => {
  const bot = harness({}, null, { dataset: { motion: "reduce" } }, { webdriver: true });
  bot.run();
  assert.equal(bot.els.loading.dataset.phase, "card", "automation: the card, not a 20-60 s flyby on software GL");
  assert.equal(bot.plays.length, 0, "no announcer read over a 700 ms card");
  bot.tick(LS.CARD_MS);
  assert.equal(bot.races.length, 1, "the race starts after the card");
  const player = harness({}, null, { dataset: { motion: "reduce" } }, { webdriver: false });
  player.run();
  assert.equal(player.els.loading.dataset.phase, "run", "a player under REDUCED still gets the flyby (#1290)");
});

test("a skip of the GARAGE leave is not a verdict on the flyby: the streak counts flyby skips only", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/ui/loading-screen.js"), "utf8");
  const note = src.slice(src.indexOf("function noteFlyby("), src.indexOf("const MAP_W"));
  assert.match(note, /if \(phase !== "run"\) return;/, "only the run phase records a skip or a watch");
  const skipBlock = src.slice(src.indexOf('if (phase === "garage" || ((phase === "build" || phase === "prep") && skipCb)) {'), src.indexOf("if (!(phase && build) || Date.now() - flyT0 < SKIP_GRACE_MS) return;"));
  assert.ok(!/noteFlyby/.test(skipBlock), "the garage / prep / build skip calls the callback and nothing else");
  const run = src.slice(src.indexOf("function run(info, go)"), src.indexOf("function stop()"));
  assert.ok(!/prefers-reduced-motion/.test(run) && !/dataset\.motion/.test(run), "run() reads no motion flag: the flyby and the announcer always follow the garage leave");
});

test("three skips in a row shorten the next flyby — and its announcer budget — to SHORT_FLY_MS", () => {
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
  assert.equal(h.els.loading.style.props["--ld-fly"], LS.SHORT_FLY_MS + "ms", "the letterbox is timed to it too");
  // The shots follow: progress() is a fraction of THIS run's length.
  h.tick(LS.SHORT_FLY_MS / 2);
  assert.ok(Math.abs(h.screen.progress() - 0.5) < 1e-9, `progress ${h.screen.progress()} halfway through the short cut`);
  // …and the race starts when the short flyby ends, not at FLY_MS.
  h.tick(LS.SHORT_FLY_MS / 2);
  assert.equal(h.races.length, 4, "every run handed over to the race");
});

test("busy(): the card over the scrim without a circuit, no timer, no skip, not active", () => {
  const h = harness();
  assert.equal(h.screen.busy("Returning"), true);
  assert.equal(h.els.loading.dataset.phase, "busy");
  assert.equal(h.els.loading.hidden, false, "the plate is up while garage teardown / a start waits");
  assert.equal(h.els["ld-name"].textContent, "RETURNING");
  assert.equal(h.els["ld-gp"].textContent, "Please wait");
  assert.equal(h.screen.active(), false, "not the flyby: game.js still owns the canvas");
  assert.equal(h.screen.busy("Starting race"), true, "already covering: keep the first phase");
  assert.equal(h.els.loading.dataset.phase, "busy");
  assert.equal(h.els["ld-name"].textContent, "RETURNING", "a second busy() does not reset the plate");
  h.skip();
  h.tick(LS.FLY_MS * 2);
  assert.equal(h.races.length, 0, "nothing to skip to and no timer");
  h.screen.stop();
  assert.equal(h.els.loading.hidden, true);
  assert.equal(h.screen.busy("Starting race"), true);
  h.screen.lowerWaitPlate();
  assert.equal(h.els.loading.hidden, true, "lowerWaitPlate drops busy once the race owns the screen");
  assert.equal(h.screen.phase(), "");
  h.run();
  h.screen.lowerWaitPlate();
  assert.equal(h.screen.phase(), "run", "a live flyby is not a wait plate");
  h.screen.stop();
  assert.match(readCssSource("css/overlays.css"), /#loading\[data-phase="busy"\] #ld-card/, "the busy phase shows the card");
  const game = read("js/game.js");
  assert.match(game, /if \(!loadingScreen\.phase\(\)\) \{ loadingScreen\.building\(loadingInfo\(\)\) \|\| loadingScreen\.busy\("Starting race"\); \}/,
    "startRace raises the card before ensureScenery / stopHome");
  assert.match(game, /const rs = \$\("race-settings"\);\s*if \(rs\) \{\s*rs\.hidden = true;/,
    "startRace closes the settings dialog so #loading is not under a top-layer sheet");
  assert.match(game, /rs\.open && typeof rs\.close === "function"\) rs\.close\(\)/,
    "startRace sync-closes :modal (TopModal MutationObserver is a later task)");
  assert.match(game, /if \(garageReturn !== "pit" && !loadingScreen\.phase\(\)\) loadingScreen\.busy\("Returning"\)/,
    "CLOSE GARAGE / BACK raise the plate before hiding #carsetup");
  assert.match(game, /if \(!_introSheet\) loadingScreen\.prep\(info, \(\) => studioSkip\(n\)\);/,
    "race settings covers prep with the sheet — race card waits until after the garage leave (else prep scrim, card hidden)");
  assert.match(game, /body:yield/,
    "startRaceBody yields after the plate is up and before ensureAudio");
  assert.match(game, /els\.overlay\.hidden = false; \}   \/\/ no vt: snapshot after hiding #carsetup is a black hold/,
    "title return skips the view-transition snapshot that held a blank page");
});

test("building(): the card over the scrim, no timer, no skip, not active — then run() takes over", () => {
  const h = harness();
  assert.equal(h.screen.building({ track: { id: "monza", name: "MONZA", country: "Italy" }, laps: 5 }), true);
  assert.equal(h.els.loading.dataset.phase, "build");
  assert.equal(h.els.loading.hidden, false, "the card is up while the world builds");
  assert.equal(h.screen.active(), false, "not active: game.js keeps the canvas hidden, so the old circuit never shows");
  h.skip();
  h.tick(LS.FLY_MS * 2);
  assert.equal(h.races.length, 0, "nothing to skip to and no timer: only run() starts the race");
  h.run();
  assert.equal(h.els.loading.dataset.phase, "run");
  h.tick(LS.FLY_MS);
  assert.equal(h.races.length, 1);
  assert.match(readCssSource("css/overlays.css"), /#loading\[data-phase="build"\] #ld-card/, "the build phase shows the card");
});

test("prep(): scrim up, race card hidden, skip arms studioSkip — garage-out owns the leave", () => {
  const h = harness();
  let skips = 0;
  assert.equal(h.screen.prep({ track: { id: "monza", name: "MONZA", country: "Italy" }, laps: 5 }, () => { skips++; }), true);
  assert.equal(h.els.loading.dataset.phase, "prep");
  assert.equal(h.els.loading.hidden, false, "prep owns the screen over a cold compile");
  assert.equal(h.screen.active(), false);
  assert.match(read("css/loading.css"), /#loading\[data-phase="prep"\] #ld-card \{ visibility: hidden; \}/,
    "prep keeps #ld-card out of sight until garage-out ends");
  h.tick(LS.SKIP_GRACE_MS + 1);
  h.skip();
  assert.equal(skips, 1, "prep skip reaches studioSkip like build");
  assert.equal(h.screen.garage({ track: { id: "monza", name: "MONZA", country: "Italy" }, laps: 5 }), true);
  assert.equal(h.els.loading.dataset.phase, "garage");
});

test("handoff(): the card stays up, disarmed, until render() lowers it with the race's first PRESENTED frame", () => {
  const h = harness();
  h.run();
  h.tick(LS.FLY_MS);   // the flyby played out: the race is on its way
  assert.equal(h.races.length, 1);
  assert.equal(h.screen.active(), true, "until the race lowers it, the flyby's last frame is the picture");
  h.screen.stop();     // clearMenuScreens' sweep
  assert.equal(h.screen.handoff(), true);
  assert.equal(h.els.loading.hidden, false, "the card is up again over the frame the backend has yet to paint");
  assert.equal(h.els.loading.dataset.phase, "handoff");
  assert.equal(h.screen.active(), false, "not active: the race, not the screen, decides what the canvas shows");
  h.skip();
  h.tick(LS.FLY_MS * 2);
  assert.equal(h.races.length, 1, "no timer and no skip listener: nothing is left to start");
  h.screen.stop();
  assert.equal(h.els.loading.hidden, true);
  // The two ends in game.js. startRaceBody reads active() BEFORE the sweep (a
  // race started with no screen up — netplay, __apex.race(), pm-restart — raises
  // no stale card) and render() lowers it only after a present that painted: the
  // first countdown present on TLX starts the program warm and paints nothing.
  const game = read("js/game.js");
  const body = game.slice(game.indexOf("async function startRaceBody()"), game.indexOf("const sessionEntry ="));
  assert.match(body, /const handoff = \(loadingScreen\.active\(\) \|\| loadingScreen\.phase\(\) === "build" \|\| loadingScreen\.phase\(\) === "busy"\) && !!player;/,
    "startRaceBody still decides handoff from the screen that was up before the sweep");
  assert.match(body, /clearMenuScreens\(\); garagePre\.release\(\);[^\n]*\n\s*if \(handoff\) RaceEntryProfile\.raiseHandoff\(loadingScreen\);/,
    "startRaceBody raises the handoff card right after the sweep (and garage GPU release), only when the screen was up");
  const render = game.slice(game.indexOf("function render(dt) {"));
  assert.match(render, /if \(headlessMode\) \{ mirrorPass\.cancelPreparation\(\); loadingScreen\.lowerWaitPlate\(\); return; \}/,
    "headless lowers busy/build/handoff — present never runs");
  assert.match(render, /if \(state === "race"\) loadingScreen\.lowerWaitPlate\(\);/,
    "lights-out drops the wait plate before gfx.warming() can stall it over the HUD");
  assert.match(read("js/agent/apex.js"), /G\.state = "race"; G\.raceT = Math\.max\(G\.raceT, 0\.5\);\s*if \(G\.loadingScreen && G\.loadingScreen\.lowerWaitPlate\) G\.loadingScreen\.lowerWaitPlate\(\);/,
    "__apex.go() drops the plate before jump() refreshHud");
  assert.match(read("js/agent/apex.js"), /G\.state = "race"; G\.raceT = Math\.max\(G\.raceT, 1\);\s*if \(G\.loadingScreen && G\.loadingScreen\.lowerWaitPlate\) G\.loadingScreen\.lowerWaitPlate\(\);/,
    "__apex.park() drops the plate for hud-audit");
  assert.match(render, /gfx\.present\(po\);[\s\S]{0,200}?RaceEntryProfile\.afterPresent\(loadingScreen, gfx, mirrorPass\.preparing\(\)\);/,
    "render() lowers it via afterPresent after a present that painted");
  assert.match(read("js/perf/race-entry-profile.js"), /function raiseHandoff\(screen\) \{[\s\S]*?screen\.handoff\(\);/,
    "raiseHandoff still calls loadingScreen.handoff()");
  assert.match(read("js/perf/race-entry-profile.js"), /function afterPresent\(screen, gfx, preparing = false\) \{[\s\S]*?screen\.phase\(\) === "handoff"[\s\S]*?if \(handoff && !warming\)[\s\S]*?screen\.stop\(\)/,
    "afterPresent still stops the card only when not warming");
  assert.match(readCssSource("css/overlays.css"), /#loading\[data-phase="handoff"\] #ld-card/, "the handoff phase shows the card");
});

test("a skip inside SKIP_GRACE_MS is ignored (a double-click on RACE!), and a real skip stops the event", () => {
  const h = harness();
  h.run();
  h.skip();
  assert.equal(h.races.length, 0, "the second click of a double-click does not skip the flyby");
  assert.equal(h.saved.get("flySkips"), undefined, "…nor count toward the short cut");
  h.tick(LS.SKIP_GRACE_MS);
  let stopped = 0, prevented = 0;
  h.skip({ stopPropagation() { stopped++; }, preventDefault() { prevented++; }, cancelable: true });
  assert.equal(h.races.length, 1, "after the grace a skip starts the race");
  assert.equal(stopped + prevented, 2, "…and swallows the key, or Escape/P reach the race's pause handler on frame one");
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
  assert.equal(h.els.loading.style.props["--ld-fly"], LS.FLY_MS + "ms");
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
  h.tick(LS.SKIP_GRACE_MS);
  h.skip();
  assert.equal(h.races.length, 1, "the skip still reaches the race when the write throws");
  h.screen.stop();
  h.run();
  h.tick(LS.FLY_MS);
  assert.equal(h.races.length, 2, "…and so does a flyby that plays out");
});

test("the skip hint is a run-phase pseudo-element that waits ~3 s — no new shell node", () => {
  const css = readCssSource("css/overlays.css");
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

const { gridLayout, gridField, gridColour, gridInk, isGridShot, GRID_ROW_MIN } = LS;
const field = (n, me) => Array.from({ length: n }, (_, i) => ({ code: "D" + String(i).padStart(2, "0"), colour: [0.2, 0.4, 0.8], isPlayer: i === me }));
/** A bare sandbox with `files` evaluated in it (the const -> var rewrite). */
function modules(files) {
  const sb = { Math, Object, Array, Number, String, JSON, Map, Set, WeakMap, RegExp, isFinite, console, Log: { info() {}, warn() {} } };
  sb.window = sb;
  for (const f of files) vm.runInNewContext(read(f).replace(/^const\b/gm, "var"), sb, { filename: f });
  return sb;
}

const inBox = (L, w, h) => L.cells.every((c) => c.x >= 0 && c.y >= 0 && c.x + c.w <= w + 1e-9 && c.y + c.h <= h + 1e-9);
/** The chip's text fits it (drawGrid's layout: the code 6 px + 1.35 fonts in after a slot number, 6 px alone; a wide code is 2.3 fonts). */
const textFits = (L) => L.cells[0].w >= 6 + (L.showPos ? L.font * 1.35 : 0) + L.font * 2.3;

test("grid geometry: the WHOLE field, in blocks of two staggered columns, P1 left and half a row ahead of P2", () => {
  const L = gridLayout(field(22, 11), 210, 150, 11);
  assert.equal(L.cells.length, 22, "every car is on the wall, not a window around the player");
  assert.deepEqual(Array.from(L.cells, (c) => c.pos), Array.from({ length: 22 }, (_, i) => i + 1));
  assert.equal(L.blocks, 2, "22 cars in the card's map box: P1-P12 | P13-P22");
  assert.ok(L.rowH >= GRID_ROW_MIN, `row ${L.rowH} px is under the legibility floor`);
  assert.ok(L.font >= 10 && L.showPos, `a ${L.font} px chip with its position on a desktop card`);
  assert.ok(inBox(L, 210, 150), "every chip inside the card's map box");
  assert.ok(textFits(L), "'12 D11' fits its chip");
  for (const c of L.cells) assert.equal(c.col, (c.pos - 1) % 2, "odd positions left, even right");
  for (let k = 0; k + 1 < L.cells.length; k += 2) {
    const a = L.cells[k], b = L.cells[k + 1];
    assert.equal(a.block, b.block, "a grid row never splits across blocks");
    assert.ok(a.x + a.w < b.x, "the odd slot is on the left, clear of the even one");
    assert.ok(Math.abs(b.y - a.y - L.rowH / 2) < 1e-9, "the even slot is half a row behind");
  }
  const p13 = L.cells[12], p12 = L.cells[11];
  assert.equal(p13.block, 1, "the second block starts at P13");
  assert.equal(p13.y, L.cells[0].y, "and at the top, beside P1");
  assert.ok(p13.x > p12.x + p12.w, "the blocks do not overlap");
  const mine = L.cells.filter((c) => c.isPlayer);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].pos, 12);
  assert.equal(mine[0].code, "D11");
});

test("grid geometry: a phone keeps every car and drops the position before the code", () => {
  // The canvas shown at 70 %: rows too short and chips too narrow for "P12 D11".
  const phone = gridLayout(field(22, 11), 147, 105, 11);
  assert.equal(phone.cells.length, 22);
  assert.ok(inBox(phone, 147, 105));
  assert.equal(phone.showPos, false, "a 31 px chip carries the code alone");
  assert.ok(phone.font >= 10, `a ${phone.font} px code is not readable on a phone`);
  assert.ok(textFits(phone), "the code fits its chip");
  assert.ok(phone.cells.some((c) => c.isPlayer && c.pos === 12));
  // A wide circuit leaves a short box: every car still drawn, still inside it.
  const flat = gridLayout(field(22, 5), 210, 40, 5);
  assert.equal(flat.cells.length, 22);
  assert.ok(inBox(flat, 210, 40) && flat.cells.some((c) => c.isPlayer));
  // A tall, narrow circuit (Monza's box is ~85 x 150): one pair of columns, the
  // code alone, and still inside its chip ("P14 LAW" overran it before).
  const tall = gridLayout(field(22, 13), 85, 150, 13);
  assert.equal(tall.cells.length, 22);
  assert.ok(inBox(tall, 85, 150) && textFits(tall) && tall.font >= 8, `font ${tall.font}, pos ${tall.showPos}`);
  // The fewest blocks that are legible: a small field and a duel stay one pair of columns.
  assert.equal(gridLayout(field(10, 3), 210, 150, 3).blocks, 1);
  const duel = gridLayout(field(2, 1), 210, 150, 1);
  assert.equal(duel.rows, 1);
  assert.equal(duel.blocks, 1);
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
  // The player's chip is filled with that colour: its text goes dark on a light livery.
  assert.equal(gridInk([1, 0.95, 0.2]), "#0a0a10", "yellow chip, dark code");
  assert.equal(gridInk([0.9, 0, 0.1]), "#ffffff", "red chip, white code");
  for (const junk of [null, "#fff", [NaN, 0, 0]]) assert.equal(gridInk(junk), "#ffffff");
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
  const said = [], stops = [], stings = [], ops = [], plays = [], annStops = [], draws = [];
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
    TrackMaps: { corners: () => [], fitCanvas: () => ({ w: 210, h: 150 }), draw: (cv, t, o) => { ops.push("map"); draws.push(o); } },
    store: { get: (k, d) => (saved.has(k) ? saved.get(k) : d), set: (k, v) => saved.set(k, v) },
    announcer: () => ({ play: (inf, life) => { plays.push(life); return true; }, stop() { annStops.push(now); }, speaking }),
    radio: () => ({ sayPreRace: (text, life, lead) => { said.push({ text, life, lead }); return radioOn; }, stop: () => stops.push(now),
      debug: () => ({ enabled: radioOn }) }),
  });
  const info = { track: { id: "monza", name: "MONZA", country: "Italy" }, laps: 5, hasWorld: true, shots: sb.FlybySeq.DEFAULT, grid };
  const h = {
    screen, said, stops, stings, ops, els, plays, annStops, saved, listeners, draws, sb,
    run: (over = {}) => { h.t0 = now; screen.run(Object.assign({}, info, over), () => {}); },
    skip: (ev = {}) => { for (const fn of listeners.keydown || []) fn(Object.assign({ type: "keydown", repeat: false }, ev)); },
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

test("the turn on camera is tagged on the map, and only redrawn when it changes", () => {
  const h = gridHarness();
  let onAir = 0;
  h.sb.FlybySeq = Object.assign({}, h.sb.FlybySeq, { airCorner: () => onAir });
  h.run();
  assert.equal(h.draws.at(-1).mark, 0, "the card goes up with the plain outline");
  h.tickTo(0.2);
  const before = h.draws.length;
  onAir = 4;
  h.tickTo(0.25);
  assert.equal(h.draws.length, before + 1, "one redraw for the new corner");
  assert.equal(h.draws.at(-1).mark, 4);
  assert.equal(h.els["ld-map"].dataset.turn, "4");
  assert.match(h.els["ld-map"].attrs["aria-label"], /turn 4/i);
  h.tickTo(0.3);
  assert.equal(h.draws.length, before + 1, "the same corner is not redrawn ten times a second");
  onAir = 0;
  h.tickTo(0.35);
  assert.equal(h.draws.at(-1).mark, 0, "a shot of no corner clears the tag");
  assert.equal(h.els["ld-map"].dataset.turn, "");
  // The grid shots own the slot whatever the last corner was.
  onAir = 9;
  h.tickTo(0.72);
  assert.equal(h.view(), "grid");
});

test("FlybySeq.airCorner: 0 until a corner shot is solved, and reset() clears it", () => {
  const sb = modules(["js/camera/flyby-seq.js"]);
  assert.equal(sb.FlybySeq.airCorner(), 0);
  sb.FlybySeq.reset();
  assert.equal(sb.FlybySeq.airCorner(), 0);
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
  h.tickTo(0.882);
  assert.equal(h.said.length, 0, "the announcer is still reading");
  talking = false;
  h.tickTo(0.886);
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
  F.setPlayerSlot(null, 22);   // a random grid: your slot is not known yet
  assert.equal(F.shotAt(0.99, F.withoutSlot(F.DEFAULT)).id, "grid-front", "a random grid's list ends on grid-front");
  F.setPlayerSlot(11, 22);
  // solve() takes its cut from shotAt, so the two cannot drift.
  assert.match(read("js/camera/flyby-seq.js"), /const on = shotAt\(u, list\)/);
});

test("game.js hands the card its field in grid order, the flyby's shots, and the radio", () => {
  const game = read("js/game.js");
  assert.match(game, /LoadingScreen\.create\(\{[^}]*radio: \(\) => radioVoice/);
  const at = game.indexOf("function loadingInfo()");
  const li = game.slice(at, at + 2500);
  assert.match(li, /shots: flybyShots, grid:/, "the list the screen plays is the flyby as it is: the garage drive-out is its own phase, before it");
  assert.match(li, /isPlayer: c === player && FlybySeq\.slotKnown\(\)/, "an unknown slot (random grid) must flag no player");
});

test("with the radio check coming, the announcer's read is budgeted to end before the grid-mine shot", () => {
  const on = gridHarness({ radioOn: true });
  on.run();
  const off = gridHarness({ radioOn: false });
  off.run();
  const full = off.plays[0];
  assert.ok(full > 0, "the announcer gets the whole flyby when no check will run");
  // grid-mine starts at 0.88 of the shipped sequence: the read must be done by then,
  // or its landing hold keeps speaking() true until the check has no time left.
  assert.ok(on.plays[0] <= full * 0.88, `announcer budget ${on.plays[0]} of ${full}`);
  assert.ok(on.plays[0] >= full * 0.8, "and it still gets nearly all of it");
});

test("the radio check's hiss is held for the line, not for the rest of the flyby", () => {
  const h = gridHarness({ radioOn: 1.6 });   // sayPreRace -> the line's length, cue included
  h.run();
  h.tickTo(0.885);
  assert.equal(h.said.length, 1);
  assert.equal(h.stings.length, 1);
  assert.ok(Math.abs(h.stings[0] - 2.2) < 1e-9, `bed ${h.stings[0]} s: the words plus a beat`);
  assert.ok(h.stings[0] < h.said[0].life, "shorter than the shot it plays over");
  // …and the real RadioVoice reports that length: plan() carries the words' own seconds.
  const sb = modules(["js/audio/radio-voice.js"]);
  const p = sb.RadioVoice.plan({ msg: "P12. RADIO CHECK", life: 6, kind: "race", lead: 0.43, enabled: true, soundOn: true, api: true, state: "menu", preRace: true });
  assert.ok(p.speak && p.secs > 0 && p.secs < 3, `secs ${p.secs}`);
});

// ── A REAL RACE: the flyby stretches to the race-so-far read; the card shows where it stands ──
test("flyMsFor(skips, wantMs): a real race's read stretches the flyby up to FLY_MAX_MS; a habitual skipper keeps the short cut", () => {
  const { flyMsFor, FLY_MS, SHORT_FLY_MS, FLY_MAX_MS } = LS;
  assert.equal(FLY_MAX_MS, 60000);
  assert.equal(flyMsFor(0, 0), FLY_MS, "nothing to read: the usual cut");
  assert.equal(flyMsFor(0, 10000), FLY_MS, "a short read never SHORTENS the flyby");
  assert.equal(flyMsFor(0, 41500), 41500, "the read's own length");
  assert.equal(flyMsFor(0, 91354), FLY_MAX_MS, "capped — the announcer fits the rest down");
  for (const bad of [NaN, "x", null, undefined, -5]) assert.equal(flyMsFor(0, bad), FLY_MS, String(bad));
  assert.equal(flyMsFor(3, 50000), SHORT_FLY_MS, "three skips in a row: they have told us what they think of waiting");
  // game.js asks with the read, before the shots are planned, and the screen runs the same budget.
  const game = read("js/game.js");
  const intro = game.slice(game.indexOf("function raceIntro(go)"), game.indexOf("function loadingInfo()"));
  assert.match(intro, /const flyMs = loadingScreen\.nextFlyMs\(info\.readMs, info\.warmReady = !\(gfx && gfx\.warming && gfx\.warming\(\)\)\);[\s\S]{0,300}FlybySeq\.setDuration\(flyMs\);/);
  assert.match(intro, /loadingScreen\.run\(info, go\);/);
  const li = game.slice(game.indexOf("function loadingInfo()"), game.indexOf("function loadingInfo()") + 2000);
  assert.match(li, /if \(real && announcer\.readMs\) out\.readMs = announcer\.readMs\(out\);/, "only a real race stretches it");
  assert.match(read("js/ui/loading-screen.js"), /flyMsFor\(readSkips\(\), info\.readMs, info\.warmReady\)/);
});

test("flyMsFor: habitual short cut waits for warmReady (would fail before the warm gate)", () => {
  const { flyMsFor, FLY_MS, SHORT_FLY_MS } = LS;
  assert.equal(flyMsFor(3, 0, true), SHORT_FLY_MS, "warm done: short applies");
  assert.equal(flyMsFor(3, 0, false), FLY_MS, "still warming: keep the full cut");
  assert.equal(flyMsFor(3, 50000, false), 50000, "still warming: may stretch for a real-race read, but never SHORTEN");
  assert.equal(flyMsFor(3, 0, { warmReady: false }), FLY_MS, "opts form");
  assert.equal(flyMsFor(3, 0, undefined), SHORT_FLY_MS, "absent warmReady keeps today's short");
  assert.equal(flyMsFor(0, 0, false), FLY_MS, "no streak: full cut either way");
});

test("metaRows: a circuit gets its facts; a real race joined mid-race gets the lap, your place, tyres, stops, leader and flag", () => {
  const metaRows = (...a) => JSON.parse(JSON.stringify(LS.metaRows(...a)));   // the module's arrays are another realm's
  const track = { id: "baku", name: "BAKU", lengthKm: 6.003, night: true };
  assert.deepEqual(metaRows({ track, laps: 12, weather: "dry", tod: "default" }, 20),
    [["LAPS", "12"], ["LENGTH", "6.003 km"], ["TURNS", "20"], ["WEATHER", "DRY"], ["TIME", "NIGHT"]]);
  const story = {
    lap: 40, realLaps: 51, grid: false, leader: { code: "RUS" }, out: [{}, {}, {}, {}, {}, {}], cautions: [],
    you: { running: true, pos: 5, gap: { s: 3.3, lapsDown: 0 }, tyre: { compound: "medium", age: 8 }, stops: [31, 36] },
  };
  const real = { startLap: 40, watch: false, story };
  assert.deepEqual(metaRows({ track, laps: 51, weather: "dry", tod: "day", real }, 20), [
    ["LAP", "40 / 51"], ["RUNNING", "P5 · +3.3s"], ["TYRE", "MEDIUM · 8 LAPS"], ["STOPS", "2 (L31, L36)"], ["LEADER", "RUS"], ["OUT", "6"],
    ["WEATHER", "DRY"], ["TIME", "DAY"]]);
  // No gap to show (0 / null): "P5", never a dangling "P5 · ".
  for (const gap of [{ s: 0, lapsDown: 0 }, null, undefined]) {
    const r = metaRows({ track, laps: 51, weather: "dry", tod: "day", real: { ...real, story: { ...story, you: { ...story.you, gap } } } }, 20);
    assert.deepEqual(r[1], ["RUNNING", "P5"], "empty gap: " + JSON.stringify(gap));
  }
  assert.deepEqual(metaRows({ track, laps: 51, weather: "dry", tod: "day", real: { ...real, story: { ...story, you: { ...story.you, gap: { s: 0, lapsDown: 2 } } } } }, 20)[1], ["RUNNING", "P5 · +2 LAPS"]);
  const sc = { ...story, cautions: [{ kind: "safety car", from: 31, to: 32, now: true }], you: { ...story.you, pos: 1, stops: [] } };
  const rows = metaRows({ track, weather: "dry", tod: "day", real: { ...real, story: sc, watch: true } });
  assert.deepEqual(rows.slice(1, 4), [["FOLLOWING", "P1"], ["TYRE", "MEDIUM · 8 LAPS"], ["STOPS", "NONE"]]);
  assert.deepEqual(rows[5], ["FLAG", "SAFETY CAR"], "a flag that is out outranks the retirements count");
  const grid = { lap: 1, realLaps: 51, grid: true, pole: { code: "RUS" }, you: { pos: 2, tyre: { compound: "medium", age: 2 } } };
  assert.deepEqual(metaRows({ track, laps: 51, weather: "rain", tod: "day", real: { startLap: 1, story: grid } }).slice(0, 4),
    [["GRID", "P2"], ["POLE", "RUS"], ["TYRE", "MEDIUM · USED"], ["LAPS", "51"]]);
});

// ── THE LOADING-SCREEN HUNT (2026-09-29) ─────────────────────────────────────
test("a habitual skipper's short cut leaves no room for the radio check, so the announcer keeps the whole flyby", () => {
  const h = gridHarness({ radioOn: true, stored: { flySkips: LS.SKIP_STREAK } });
  h.run();
  assert.equal(h.plays[0], LS.SHORT_FLY_MS, "grid-mine gets ~1.4 s of 12 — under the check's 2.2 s floor, so nothing waits on it");
  h.tickTo(0.99);
  assert.equal(h.said.length, 0, "and the check itself still refuses, as before");
});

test("a skip ends the announcer with the flyby, not when startRace reaches clearMenuScreens()", () => {
  const h = gridHarness({ radioOn: false });
  h.run();
  h.tick(3000);
  const before = h.annStops.length;
  h.skip();
  assert.ok(h.annStops.length > before, "the skip itself stops the voice");
});

test("RACE! over a pending warm holds the card until it ends; the sheets that skip the flyby still get the card and the handoff", () => {
  const game = read("js/game.js");
  const intro = game.slice(game.indexOf("function introWarm(go)"), game.indexOf("function loadingInfo()"));
  assert.match(intro, /if \(!gfx\.warm \|\| \(_warmKey === key && !\(gfx\.warming && gfx\.warming\(\)\)\)\) return false;/, "warmed and no warm pending: fly at once");
  assert.match(intro, /loadingScreen\.building\(loadingInfo\(\)\);/, "the card holds over the warm");
  assert.match(intro, /await introPrepare\(live, key, info, n, true\)/, "a built but unwarmed world joins planning and warm under the card before motion");
  assert.match(intro, /const prepP = introPrepare\(live, key, info, n, false\);\s*await studioDone\(live, n\);/, "warm world: garage-out is not blocked behind prepare");
  const prepare = game.slice(game.indexOf("async function introPrepare("), game.indexOf("// A ready, warm world"));
  assert.match(prepare, /await awaitIntroWarm\(current\)/, "shared compile bound — never fly over pending warm");
  assert.match(intro, /announce\("PREPARATION FAILED/, "a warm timeout recovers to the menu with a visible message");
  assert.match(intro, /if \(!built && menuWorld\(\) && introWarm\(go\)\) return;/, "raceIntro routes a built world with a pending warm through it");
  assert.match(intro, /function startRaceCovered\(\) \{\s*if \(!loadingScreen\.phase\(\)\) loadingScreen\.building\(loadingInfo\(\)\);\s*return startRace\(\);/);
  for (const [name, re] of [["qualifying's GRID", /session = "race";\s*startRaceCovered\(\);/],
    ["qualifying's DRIVE", /session = "quali";\s*startRaceCovered\(\);/],
    ["a season's NEXT RACE", /openQuali\(\);\s*else startRaceCovered\(\);/]]) assert.match(game, re, `${name} starts under the card`);
  // The build path plans the flyby for the length it will run (a real race's read).
  const build = game.slice(game.indexOf("function introBuild(go)"), game.indexOf("function introWarm(go)"));
  assert.match(build, /const info0 = loadingInfo\(\);/);
  assert.match(build, /await introPrepare\(live, key, info0, n, true\)/);
  assert.match(game, /FlybySeq\.setDuration\(loadingScreen\.nextFlyMs\(info\.readMs\)\);/);
  assert.match(build, /await awaitIntroWarm\(live\)/, "introBuild waits via awaitIntroWarm, not the race-start introWarm(go)");
});

test("the card over the scene: black bars and a light hint in every theme, an undistorted map, a real fade, no bars under MENU ANIMATIONS: REDUCED", () => {
  const css = readCssSource("css/overlays.css");
  const bars = css.match(/#loading::before,\s*#loading::after\s*\{([^}]*)\}/)[1];
  assert.match(bars, /background:\s*#000/, "cinema bars — the LIGHT theme's --bg made them white");
  const hint = css.match(/#loading\[data-phase="run"\] #ld-card::after\s*\{([^}]*)\}/)[1];
  assert.match(hint, /color:\s*#fff/, "the hint sits on the 3D scene, not a themed plate");
  assert.match(css.match(/\n#ld-map\s*\{([^}]*)\}/)[1], /object-fit:\s*contain/, "fitCanvas pins px width AND height; the 45% cap squashed the outline");
  assert.match(css, /@starting-style\s*\{\s*#loading\[data-phase\] #ld-card\s*\{[^}]*opacity:\s*0/, "a transition cannot start from display: none");
  assert.match(css, /:root\[data-motion="reduce"\] #loading::before,\s*:root\[data-motion="reduce"\] #loading::after\s*\{\s*content:\s*none;/);
  assert.match(css.match(/#ld-wordmark\s*\{([^}]*)\}/)[1], /font-size:\s*clamp\([^;]*\b3\.4vw\b/, "#loading is not zoomed: --vwz shrank the wordmark as UI SIZE grew");
});

test("the garage phase (the drive-out before the flyby): no card, no timer, and a tap skips to the card + flyby, not counted as a flyby skip", () => {
  const h = gridHarness({ radioOn: false });
  const info = { track: { id: "monza", name: "MONZA", country: "Italy" }, laps: 5, hasWorld: true };
  let skips = 0;
  assert.equal(h.screen.garage(info, () => skips++), true);
  assert.equal(h.screen.phase(), "garage");
  assert.equal(h.els.loading.dataset.phase, "garage", "the stylesheet hides the card and the scrim on this phase");
  assert.equal(h.screen.active(), false, "not the flyby: game.js draws the garage");
  assert.equal(h.plays.length, 0, "no announcer: the voice comes with the card");
  h.skip();
  assert.equal(skips, 0, "the second click of a double-click on START is not a skip");
  h.tick(LS.SKIP_GRACE_MS + 10);
  h.skip({ repeat: true });
  assert.equal(skips, 0, "a key auto-repeat is not a press");
  h.skip(); h.skip();
  assert.equal(skips, 1, "one skip, once");
  assert.equal(h.saved.get("flySkips"), undefined, "it is not a verdict on the flyby, which still follows: the streak does not count it");
  h.tick(60000);
  assert.equal(h.screen.phase(), "garage", "no timer: game.js ends the phase");
  // The card then comes up for the rest of a build (building) or with the flyby (run); both disarm the garage's skip.
  let late = 0;
  h.screen.garage(info, () => late++);
  h.screen.building(info);
  h.tick(LS.SKIP_GRACE_MS + 10); h.skip();
  assert.equal(late, 0, "the build card has no skip of its own");
  assert.equal((h.listeners.keydown || new Set()).size, 0, "stop() took the garage's listeners down");
  h.screen.building(info, () => late++);
  h.skip(); assert.equal(late, 0, "the preparation skip retains the double-click grace");
  h.tick(LS.SKIP_GRACE_MS + 10); h.skip(); h.skip();
  assert.equal(late, 1, "a preparation skip marks the cinematic once, without lowering its card");
  assert.equal(h.saved.get("flySkips"), undefined, "a preparation skip does not count toward the shorter cinematic either");
  assert.equal(h.screen.phase(), "build", "preparation continues safely after the skip");
  h.screen.stop();
  assert.equal((h.listeners.keydown || new Set()).size, 0, "cancellation removes preparation skip listeners");
  const css = readCssSource("css/overlays.css");
  assert.match(css, /#loading\[data-phase="garage"\] \{ background: none; \}/, "no scrim over the car");
  assert.match(css, /#loading\[data-phase="garage"\] #ld-card \{ visibility: hidden; \}/, "the card is out of the accessibility tree, not just transparent");
});
