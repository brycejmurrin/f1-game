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
function harness(stored = {}, storeOverride = null, reduced = false) {
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
    matchMedia: () => ({ matches: reduced }),
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

test("skip affordance follows the live flyby; reduced motion uses the short card without clearing the streak", () => {
  const h = harness({ flySkips: 4 }, null, true);
  h.run();
  assert.equal(h.els["ld-skip"].hidden, true);
  assert.equal(h.els["ld-skip-help"].hidden, true);
  assert.equal(h.els.loading.dataset.phase, "card");
  assert.equal(h.plays.length, 0, "a 700 ms card must not begin an announcer read");
  h.tick(LS.CARD_MS);
  assert.equal(h.races.length, 1);
  assert.equal(h.saved.get("flySkips"), 4, "reduced motion is not a watched flyby");

  const full = harness();
  full.run();
  assert.equal(full.els["ld-skip"].hidden, false);
  assert.equal(full.els["ld-skip-help"].hidden, false);
  full.run({ hasWorld: false });
  assert.equal(full.els["ld-skip"].hidden, true);
  assert.equal(full.els["ld-skip-help"].hidden, true);
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

test("the skip is one visible button during run and stays hidden in the editor hold", () => {
  const css = read("css/overlays.css");
  const html = read("index.html");
  assert.match(html, /<button id="ld-skip"[^>]*type="button"/);
  assert.match(css, /#ld-skip\[hidden\]\s*\{\s*display:\s*none/,
    "author display:block must not override the browser's hidden rule");
  assert.match(css, /#loading:not\(\[data-phase="run"\]\) #ld-skip[\s\S]*?display:\s*none/,
    "the flyby editor reuses the card after run and must hide the button");
  assert.ok(!/#loading\[data-phase="run"\] #ld-card::after/.test(css), "no duplicate CSS skip hint");
});
