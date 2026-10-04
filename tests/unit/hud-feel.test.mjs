/* hud-feel.test.mjs — the in-race HUD's glance-ability, pinned.
 *
 * 2026-09-02 "HUD feel" pass. Each test here is a defect that could be shown
 * from the code without a browser, and its fix:
 *
 *   - #hud-tach.redline toggled on a single 0.92 threshold, so a needle held on
 *     the line flickered the class (and restarted its pulse) every HUD tick.
 *     Now a latch: on above 92 % of MAX_RPM, off again below 89 %.
 *   - #hud-ot read "OVERTAKE" in both ot-off and ot-cool, differing by a 50 %
 *     opacity; the lockout now spells itself, "COOLDOWN n" in whole seconds.
 *   - the sector rows showed a raw split with nothing to read it against; they
 *     now carry the announce banner's own ▼/▲ against sectorBests, lime on a PB.
 *   - #hud-speed-n had no fixed slot, so 99 -> 100 km/h shifted the centred
 *     figure and its KM/H by half a digit several times a lap.
 *   - #hud-energy had no plate and a 55 %-black label: below half charge the
 *     word ENERGY sat on the live scene and vanished.
 *   - the S2 label and the ghost delta used the brand #e10600, ~4.2:1 on black
 *     at 12–14 px — under the 4.5:1 AA floor for text that size.
 *
 * hud.js runs in a VM on tests/helpers/mini-dom.mjs with a stub G façade —
 * the same harness shape menu-a11y-audit.test.mjs uses — and the CSS is read
 * as rules (tests/helpers/css-rules.mjs), never as text.
 *
 * Run: node --test tests/unit/hud-feel.test.mjs   (npm run test:tooling-fast)
 */
import { readCssSource } from "../helpers/css-source.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";
import { cssRules, decl } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");
const src = (p) => read(p).replace(/^const\b/gm, "var");

const IDLE_RPM = 5000, MAX_RPM = 15000;

// --text and --bg as the SHEET declares them, and WCAG contrast computed here
// rather than imported — the point of the accent test below is that hud.js
// picks the same winner an independent calculation does.
const TOKEN = (() => {
  const t = {};
  for (const [, k, v] of read("css/tokens.css").matchAll(/^\s*(--(?:text|bg)):\s*([^;]+);/gm)) t[k] = v.trim();
  return t;
})();
const lin = (u) => (u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4));
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const wcag = (a, b) => {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
const hex01 = (h) => {
  const d = /^#([0-9a-f]{6})$/i.exec(String(h).trim())[1];
  return [0, 2, 4].map((i) => parseInt(d.slice(i, i + 2), 16) / 255);
};

// A 2D context that accepts every call and every property write — and, given
// a log, records each write as [prop, value] so a test can read the paint.
function ctx2d(log) {
  const store = {};
  return new Proxy({}, {
    get: (_, k) => (k in store ? store[k] : () => {}),
    set: (_, k, v) => { store[k] = v; if (log) log.push([k, v]); return true; },
  });
}
// Every custom property css/tokens.css declares at the top of a line — the
// values a browser's getComputedStyle(root) would hand back unskinned.
const ALL_TOKENS = (() => {
  const t = {};
  for (const [, k, v] of read("css/tokens.css").matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) if (!(k in t)) t[k] = v.trim();
  return t;
})();

function boot(opts = {}) {
  const dom = makeDom();
  const rawCreate = dom.document.createElement;
  const bgLog = [], mapLog = [], timers = [];
  dom.document.createElement = (tag) => {
    const el = rawCreate(tag);
    if (String(tag).toLowerCase() === "canvas") el.getContext = () => ctx2d(bgLog);
    return el;
  };
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, WeakSet, RegExp, Date, parseFloat, parseInt, isFinite, Infinity,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: dom.document,
    innerWidth: opts.innerWidth || 1280, innerHeight: 800, devicePixelRatio: 1,
    M4: { clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)) },
    PhysicsConsts: { IDLE_RPM, MAX_RPM },
    Ghost: { hasGhost: () => false, timeAt: () => null, at: () => null },
    GhostShare: { hasGuest: () => false, timeAt: () => null, at: () => null },
    TrackMaps: opts.trackMaps || { drsZones: () => [], sectorColors: () => ["#ffd700", "#c0c0c0", "#cd9b5a"] },
    // #announce-live's delayed write (sayFlag) queues here; a test runs them.
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout: () => {},
    performance: { now: () => 1000 },
    matchMedia: opts.matchMedia,
    // The three globals the TEAM ACCENT path reads (skinAccent in hud.js). They
    // are absent from the other tests' boot on purpose — without Teams the
    // function must leave the cascade alone, which is what lets hud.js run in a
    // node harness at all.
    Teams: opts.teams || undefined,
    getComputedStyle: opts.teams ? () => ({ getPropertyValue: (k) => TOKEN[k] || "" })
      : opts.tokens ? () => ({ getPropertyValue: (k) => ALL_TOKENS[k] || "" }) : undefined,
  };
  sb.window = sb;
  vm.runInNewContext(src("js/ui/hud.js"), sb, { filename: "js/ui/hud.js" });
  // The OVERTAKE chip converts the allowance to MJ through the real module.
  vm.runInNewContext(src("js/race/overtake-mode.js"), sb, { filename: "js/race/overtake-mode.js" });

  const $ = (id) => dom.byId(id);
  const minimap = $("minimap");
  minimap.getContext = () => ctx2d(mapLog);
  const els = {
    pos: $("hud-pos"), lap: $("hud-lap"), time: $("hud-time"), best: $("hud-best"),
    speed: $("hud-speed-n"), energy: $("hud-energy-fill"), ot: $("hud-ot"), aero: $("hud-aero"),
    btnOT: $("btn-ot"), btnAero: $("btn-aero"),
    gapA: $("hud-gap-ahead"), gapB: $("hud-gap-behind"), hudSectors: $("hud-sectors"),
    flag: $("hud-flag"), minimap, gear: $("hud-gear"), rpmFill: $("hud-rpm-fill"), tach: $("hud-tach"),
    announceLive: $("announce-live"),
  };
  const player = {
    team: { id: "t1", color: [1, 0, 0] }, code: "YOU", rank: 1, lap: 1, lapTime: 12, best: Infinity,
    speed: 50, energy: 0.5, gear: 3, rpm: IDLE_RPM, boostOn: false,
    otT: 0, otArmed: false, otE: 0, otEarned: false, aeroX: 0, xArmed: false, s: 10, prog: 10, retired: false,
  };
  const G = {
    els, player, cars: [player], ranked: [player], timeTrial: false, state: "race",
    lapsTarget: 5, track: { map: [[0, 0], [0.5, 0.5], [1, 1]], total: 100, def: {} },
    sectorLast: [null, null, null], sectorBests: [Infinity, Infinity, Infinity], fieldSectorBests: [Infinity, Infinity, Infinity],
    aeroZones: [{}], ttRecord: Infinity,
    fmtTime: (t) => (isFinite(t) && t > 0 ? t.toFixed(2) : "-"),
    dashKph: (v) => v * 3.6, vTop: () => 90, otEnabled: () => true,
    cssCol: () => "#f00",
  };
  const hud = sb.GameHud.create(G);
  return { dom, els, player, G, sb, hud, bgLog, mapLog, timers, tick: () => hud.updateHud(true) };
}

test("the tach redline latches with hysteresis instead of flickering on the 92 % line", () => {
  const { els, player, tick } = boot();
  const on = () => els.tach.classList.contains("redline");
  player.rpm = MAX_RPM * 0.91; tick(); assert.equal(on(), false, "below the entry threshold: off");
  player.rpm = MAX_RPM * 0.93; tick(); assert.equal(on(), true, "above 92 %: on");
  player.rpm = MAX_RPM * 0.905; tick(); assert.equal(on(), true, "hovering just under 92 % stays ON — the old single threshold flipped here");
  player.rpm = MAX_RPM * 0.895; tick(); assert.equal(on(), true, "still above the 89 % exit: on");
  player.rpm = MAX_RPM * 0.88; tick(); assert.equal(on(), false, "below 89 %: off");
  player.rpm = MAX_RPM * 0.905; tick(); assert.equal(on(), false, "and re-entry needs 92 % again, so the band is dead in both directions");
});

test("the OVERTAKE chip spells every state differently and reads the 2026 allowance in MJ", () => {
  const { els, player, G, tick } = boot();
  tick();
  assert.equal(els.ot.textContent, "OT · CLOSE IN");
  assert.equal(els.ot.className, "ot-off");
  assert.equal(els.btnOT.getAttribute("aria-disabled"), "true");
  assert.equal(els.btnOT.getAttribute("data-state"), "pending");

  // EARNED at the detection line, granted only at the timing line (B7.2.3(c)).
  player.otEarned = true; tick();
  assert.equal(els.ot.className, "ot-cool");
  assert.equal(els.ot.textContent, "OT · NEXT LAP");
  assert.equal(els.btnOT.getAttribute("aria-disabled"), "true");
  assert.equal(els.btnOT.getAttribute("data-state"), "earned");

  // Granted: 0.125 battery units = 0.5 MJ of the 4 MJ store.
  player.otEarned = false; player.otE = 0.125; player.otArmed = true; tick();
  assert.equal(els.ot.className, "ot-armed");
  assert.equal(els.ot.textContent, "OT READY 0.50 MJ");
  assert.equal(els.ot.getAttribute("aria-label"), "Overtake ready, 0.50 MJ — press to deploy");
  assert.equal(els.btnOT.getAttribute("aria-disabled"), "false");

  player.otArmed = false; player.otE = 0.0775; player.otT = 3.2; tick();
  assert.equal(els.ot.className, "ot-active");
  assert.equal(els.ot.textContent, "OVERTAKE 0.31 MJ", "the push reads what is LEFT of the allowance");

  player.otT = 0; tick();
  assert.equal(els.ot.textContent, "OT READY 0.31 MJ", "paused below the speed floor is still an allowance, not a lockout");

  player.otE = 0; G.otEnabled = () => false; tick();
  assert.equal(els.ot.textContent, "OT · LAP 1", "opening lap explains the race-wide gate");
  assert.equal(els.btnOT.getAttribute("aria-disabled"), "true");
  assert.equal(els.btnOT.getAttribute("data-state"), "opening-lap");

  G.cautionInfo = () => ({ level: 1 }); tick();
  assert.equal(els.ot.textContent, "OT · LAP 1", "a local yellow is not what closes Overtake (Art. B7.2.2)");
  G.cautionInfo = () => ({ level: 0, lowGrip: true }); tick();
  assert.equal(els.ot.textContent, "OT · LOW GRIP", "low grip conditions switch Overtake off (Art. B7.2.2(d))");
  assert.equal(els.btnOT.getAttribute("data-state"), "low-grip");
  G.cautionInfo = () => ({ level: 3 }); tick();
  assert.equal(els.ot.textContent, "OT · CAUTION", "caution explains the same unavailable control");
  assert.equal(els.btnOT.getAttribute("data-state"), "caution");
});

test("automatic active aero identifies its mode while the manual control stays unavailable", () => {
  const { els, player, G, tick } = boot();
  G.raceAeroMode = "auto";
  player.xArmed = true; player.aeroX = 1;
  tick();
  assert.equal(els.aero.textContent, "AUTO STRAIGHT");
  assert.equal(els.aero.className, "ax-open");
  assert.equal(els.btnAero.getAttribute("aria-disabled"), "true");
  assert.equal(els.btnAero.getAttribute("data-state"), "automatic");
});

test("sector splits carry ★/▼/▲ against sectorBests, timing-screen colours", () => {
  // THREE glyphs, not two. Session best and personal best used to share "▼"
  // and separate only as purple vs green — the textbook deuteranopia pair, on
  // the one row where telling them apart is the entire point. ★ now carries
  // the session best on a non-colour channel; the colours are unchanged.
  const { els, G, tick } = boot();
  tick();
  const vals = els.hudSectors.children.map((row) => row.children[1]);
  assert.equal(vals.length, 3);
  assert.deepEqual(vals.map((v) => v.textContent), ["--", "--", "--"], "no split yet: placeholders, no arrow");

  // A first-ever lap: every split IS the best, and game.js writes the best in
  // the same crossing that writes the split.
  G.sectorLast[0] = 28.431; G.sectorBests[0] = 28.431; G.fieldSectorBests[0] = 28.0; tick();
  assert.equal(vals[0].textContent, "▼28.431");
  assert.equal(vals[0].style.color, "var(--faster)", "a personal best that is not the field's reads GREEN");
  assert.equal(vals[1].textContent, "--");
  assert.equal(vals[1].style.color, "", "no split yet keeps the row's own ink (white)");

  // The field's best too: PURPLE, the timing screen's session best — and ★,
  // so it is still distinguishable from the green ▼ above without hue.
  G.fieldSectorBests[0] = 28.431; tick();
  assert.equal(vals[0].textContent, "★28.431", "topping the session swaps the glyph, not just the hue");
  assert.equal(vals[0].style.color, "var(--sec-best)", "session best reads purple");

  // Next lap, slower: the arrow flips and the colour is the timing screen's yellow.
  G.sectorLast[0] = 28.9; tick();
  assert.equal(vals[0].textContent, "▲28.900");
  assert.equal(vals[0].style.color, "var(--sec-slow)", "slower than your own best reads yellow");

  // A slower lap NEVER lowers sectorBests, so a later equal-to-best split is a
  // best again — and fieldSectorBests still holds 28.431 from above, so this
  // one matches the SESSION best too and reads ★, not ▼.
  G.sectorLast[0] = 28.431; tick();
  assert.equal(vals[0].textContent, "★28.431");
  assert.equal(vals[0].style.color, "var(--sec-best)");

  // Personal best but NOT the session's: green ▼, the state the ★ split off.
  G.fieldSectorBests[0] = 28.0; G.sectorLast[0] = 28.431; tick();
  assert.equal(vals[0].textContent, "▼28.431");
  assert.equal(vals[0].style.color, "var(--faster)");
});

test("the speed digits, energy bar and sector red are set up to be read at a glance", () => {
  const rules = cssRules(read("css/hud.css"));
  // The slot must hold three TABULAR digits so 99 -> 100 does not move the
  // figure. It said `3ch` and that was wrong: `ch` is the advance of "0" and the
  // browser takes the PROPORTIONAL one, ignoring the tabular-nums on the same
  // element — measured 9.1% short on the current face, a 3.5px jump at 100 km/h.
  // Only the UNIT is asserted here; the exact em figure is re-derived from the
  // measured font ledger in tests/unit/font-digits.test.mjs, so a font swap has
  // one place to update rather than two.
  const slot = decl(rules, "#hud-speed-n", "min-width");
  assert.match(slot, /^[\d.]+em$/,
    `#hud-speed-n reserves "${slot}". It must be an em multiple of the tabular ` +
    `advance — \`ch\` does not follow tabular-nums and silently under-reserves`);
  assert.equal(decl(rules, "#hud-speed-n", "text-align"), "right", "the units digit stays put");
  assert.equal(decl(rules, "#hud-speed-n", "display"), "inline-block", "min-width needs a box on the inline span");

  assert.match(decl(rules, "#hud-energy", "background") || "", /^var\(--/, "the bar has a plate under its empty half, from a token");
  assert.equal(decl(rules, ".hud-energy-label", "color"), "var(--text)", "light ink reads over the plate AND the fill");
  assert.match(decl(rules, ".hud-energy-label", "text-shadow") || "", /rgba\(0,0,0,0\.9\)/, "with the HUD's dark halo behind it");

  // Contrast: the brand red is a fill colour, not an ink for 12–14px text
  // (css/tokens.css measures it at ~2.6:1 on the page). No HUD text may use it.
  const hud = read("js/ui/hud.js").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(hud, /#e10600/i, "hud.js writes no text in the brand red");
  assert.match(hud, /var\(--slower\)/, "the ghost delta reads the shared --slower token");
  assert.match(hud, /var\(--faster\)/, "and --faster");
});

test("the TIME box's shell placeholder is fmtTime's own zero, so the first tick does not reflow it", () => {
  const html = read("index.html");
  const m = html.match(/<div id="hud-time" class="hud-value">([^<]*)<\/div>/);
  assert.ok(m, "index.html holds #hud-time");
  assert.equal(m[1], "-", "fmtTime(0) is \"-\" (game.js); a 0:00.0 placeholder was a width fmtTime never produces");
});

test("the race gap readout is smoothed: braking halves the divisor, the tenths do not double in one tick", () => {
  const { player, G, els, tick } = boot();
  const rival = { code: "NOR", prog: player.prog + 100, speed: 80, rank: 1 };
  G.ranked = [rival, player]; player.rank = 2; player.speed = 80; G.timeTrial = false;
  tick();
  const read = () => parseFloat((els.gapA.textContent || "").replace(/[^0-9.]/g, ""));
  assert.equal(read(), 1.3, "100 m at 80 m/s reads 1.3 s on the first tick (no history)");
  player.speed = 30; tick();
  assert.ok(read() < 2.2, `one braking tick must not jump to 3.3 s — read ${read()}`);
  for (let i = 0; i < 40; i++) tick();
  assert.equal(read(), 3.3, "…but converges to the true 3.3 s within a few seconds");
  const other = { code: "LEC", prog: player.prog + 100, speed: 30, rank: 1 };
  G.ranked = [other, player]; tick();
  assert.equal(read(), 3.3, "a new rival starts from its own raw gap, not the old rival's history");
});

test("the gap widget's DROP rule follows the viewport in a time trial as well as a race", () => {
  // Bug-hunt 2026-09-02 (UI, not landed in round 1): gapForm() ran only on the
  // race branch, so data-gap-drop on <html> was whatever the LAST race left.
  const narrow = boot({ innerWidth: 500 });          // ratio 500 <= GAP_DROP_AT.narrow (550)
  narrow.G.timeTrial = true; narrow.tick();
  assert.equal(narrow.dom.documentElement.dataset.gapDrop, "1",
    "a time trial on a narrow phone drops the widget below .hud-top like a race does");
  const wide = boot({ innerWidth: 1280 });
  wide.dom.documentElement.dataset.gapDrop = "1";    // inherited from a narrow race
  wide.G.timeTrial = true; wide.tick();
  assert.equal("gapDrop" in wide.dom.documentElement.dataset, false,
    "and a wide time trial clears a drop the previous session left behind");
});

test("the ahead gap slot keeps one line so the behind line never jumps when the leader has nobody ahead", () => {
  const hud = cssRules(read("css/hud.css"));
  assert.equal(decl(hud, ".hud-gaps > div:first-child", "min-height"), "1.3em",
    "measured: the container was 2px with the ahead line empty and 17.6px filled (headless, 2026-09-02)");
});


test("the POS box flashes on a position change and the gap chips carry the neighbour's team colour", () => {
  const { els, G, tick, player } = boot();
  const rival = { ...player, code: "RIV", prog: (player.prog || 0) + 50, rank: 1, team: { color: [1, 0, 0] }, isPlayer: false };
  player.rank = 2; G.cars = [rival, player]; G.ranked = [rival, player];
  tick();
  assert.equal(els.pos.dataset.delta, undefined, "the first rank is not a change");
  player.rank = 1; G.ranked = [player, rival]; rival.rank = 2; rival.prog = (player.prog || 0) - 50; tick();
  assert.equal(els.pos.dataset.delta, "up", "gaining a place stamps data-delta=up");
  for (let i = 0; i < 6; i++) tick();
  assert.equal(els.pos.dataset.delta, undefined, "and it expires after ~6 ticks");
  assert.equal(els.gapB.style.getPropertyValue("--gap-team"), "#f00", "the behind chip carries that car's team colour");
  assert.equal(els.gapA.style.getPropertyValue("--gap-team"), "", "no car ahead: no bar");
});

test("timing columns use the bundled condensed numerals with tabular figures", () => {
  const comp = cssRules(readCssSource("css/components.css"));
  for (const sel of [".res-pos", ".res-pts"]) {
    assert.equal(decl(comp, sel, "font-family"), "var(--font-hud)", sel + " reads the HUD face");
    assert.equal(decl(comp, sel, "font-variant-numeric"), "tabular-nums", sel + " keeps digits from reflowing");
  }
  const hud = cssRules(read("css/hud.css"));
  assert.match(decl(hud, '#hud-pos[data-delta="up"]', "color") || "", /--faster/);
  const results = readCssSource("css/components.css");
  assert.match(results, /prefers-reduced-motion: no-preference\)[^}]*#results-table \.res-row \{ animation: row-in/s,
    "the results stagger lives inside the no-preference query");
});

test("the ahead chip marks the slipstream from player.towing", () => {
  const { els, G, tick, player } = boot();
  const lead = { ...player, code: "LEA", prog: (player.prog || 0) + 20, rank: 1, team: { color: [0, 0, 1] }, isPlayer: false };
  player.rank = 2; G.cars = [lead, player]; G.ranked = [lead, player];
  player.towing = 0.9; tick();
  assert.equal(els.gapA.dataset.tow, "1", "towing > 0.5 stamps data-tow on the ahead chip");
  player.towing = 0.1; tick();
  assert.equal(els.gapA.dataset.tow, undefined, "and it clears when the tow fades");
});

test("every banner is the SAME small radio card — no kind gets billboard type back", () => {
  // The banners used to be tiered billboards (64px race, 40px info, 26px
  // coach). They are one radio card now (js/game.js radioWho, index.html
  // #announce-who/#announce-text): one token-sized type for every kind, and
  // a kind may only recolour the stripe and the channel line.
  const hud = read("css/hud.css");
  const card = hud.match(/\n#announce \{([\s\S]*?)\n\}/);
  assert.ok(card, "#announce has a rule");
  assert.match(card[1], /font-size:\s*var\(--fs-3\)/, "the card's type is a token, not a viewport clamp");
  assert.doesNotMatch(card[1], /clamp\(/, "no viewport-scaled billboard type");
  assert.match(hud, /#announce\[hidden\] \{ display: none; \}/, "the card's own display must not beat the UA's [hidden]");
  assert.match(hud, /#announce-who \{[\s\S]*?font-size:\s*var\(--fs-micro\)/, "the channel line is micro type");
  assert.match(hud, /#announce-text::before \{ content: "\\201C"; \}/, "the words are quoted");
  // No kind re-sizes the type: every #announce[data-kind=…] rule is colour only.
  for (const m of hud.matchAll(/#announce\[data-kind="[a-z-]+"\][^{]*\{([^}]*)\}/g)) {
    assert.doesNotMatch(m[1], /font-size|font-style|padding|text-shadow/, `a kind rule re-styles the card: ${m[0].slice(0, 60)}`);
  }
  // The compact override keeps the token discipline too.
  assert.match(hud, /body\[data-density="compact"\] #announce \{[\s\S]*?font-size:\s*var\(--fs-2\)/);
  // …and the shell carries the plate and the two lines beside it.
  const shell = read("index.html");
  assert.match(shell, /<div id="announce" aria-hidden="true" hidden><span id="announce-num"><\/span><span id="announce-body"><span id="announce-who"><\/span><span id="announce-text"><\/span><\/span><\/div>/);
});

test("the number plate is the card's identity anchor, and it collapses to a stripe with no number", () => {
  // The plate is the one place a HUD digit readout is allowed off the body type
  // scale (css/tokens.css says so), and it steps down with the compact card so
  // it can never grow taller than the two lines it stands beside.
  const hud = read("css/hud.css");
  const plate = hud.match(/\n#announce-num \{([\s\S]*?)\n\}/);
  assert.ok(plate, "#announce-num has a rule");
  assert.match(plate[1], /background:\s*var\(--accent\)/, "the plate carries the team colour");
  assert.match(plate[1], /color:\s*var\(--accent-ink\)/, "…and the per-team ink that is legible on it");
  assert.match(plate[1], /font-variant-numeric:\s*tabular-nums/, "a number that changes width jitters the card");
  assert.match(hud, /#announce-num:empty \{[^}]*min-width: 3px/,
    "with no number the plate must collapse to the 3px stripe the card had before it");
  assert.match(hud, /#announce \{[\s\S]*?--radio-num: 26px;/);
  assert.match(hud, /body\[data-density="compact"\] #announce \{[\s\S]*?--radio-num: 22px;/);
  // The number left the channel line when it gained the plate — one number on
  // the card, not two.
  const g = read("js/game.js");
  assert.doesNotMatch(g.match(/function radioWho\(kind\) \{[\s\S]*?\n\}/)[0], /num/,
    "radioWho still appends the car number — the plate already shows it");
  assert.match(g, /els\.announceNum\.textContent = radioNum\(\);/, "showAnnounce fills the plate");
});

test("coach and practice keep their own channel and priority, and practice is its own kind", () => {
  const hud = read("css/hud.css");
  // The advisory kinds are a CHANNEL on the card (the coach's colour on the
  // WHO line), never a bigger or smaller card.
  assert.match(hud, /#announce\[data-kind="coach"\] #announce-who,\n#announce\[data-kind="practice"\] #announce-who \{ color: var\(--faster\); \}/);
  const g0 = read("js/game.js");
  const who = vm.runInNewContext(read("js/audio/radio-voice.js") + "\n(" + g0.match(/function radioWho\(kind\) \{[\s\S]*?\n\}/)[0] + ")", { player: null });
  for (const kind of ["coach", "practice"]) assert.equal(who(kind), "COACH", kind);
  for (const kind of ["penalty-hit", "penalty-warn", "warning", "warn"]) assert.equal(who(kind), "RACE CONTROL", kind);
  // …and the channel is ALL a kind may recolour. The number plate is the
  // team's, on every kind: the card belongs to one car for a whole session, so
  // a plate that changed with the message would be the loudest thing on screen
  // saying something that never changes.
  assert.doesNotMatch(hud, /#announce\[data-kind="[a-z-]+"\][^{]*#announce-num/,
    "a kind repaints the number plate — the plate is the team, the WHO line is the channel");
  // A practice verdict must not be prioritised as a record message.
  const g = read("js/game.js");
  const pri = g.match(/const ANN_PRI = \{([^}]*)\}/)[1];
  assert.match(pri, /practice: 2/);
  assert.match(pri, /coach: 1/, "a coach tip still yields to everything else");
  for (const file of ["js/race/race-insights.js", "js/race/driving-coach.js"])
    assert.doesNotMatch(read(file), /G\.announce\([^)]*"info"\)/, file + " routes its messages to the practice tier");
});

test("sector flash, limits chip, and announce queue are wired in source", () => {
  const g = read("js/game.js");
  assert.doesNotMatch(g, /announce\(sign \+ \(prevSector \+ 1\)/);
  assert.match(g, /hud\.flashSector\(prevSector\)/);
  assert.match(g, /hudLimits:\s*\$\("hud-limits"\)/);
  assert.match(read("css/hud.css"), /#hud-limits/);
  assert.match(read("css/hud.css"), /\.sec-row\.sec-flash/);
});

/* ── the radio card's number plate carries the PLAYER'S team ─────────────── */

// css/tokens.css gives each of the eleven constructors a `:root[data-team="…"]`
// row holding --accent and the --accent-ink measured against it. A selector
// cannot match a team that does not exist until runtime, and two do not: MY
// TEAM and LEGENDS are appended to Teams.LIST at boot, and MY TEAM's colours
// are edited in the garage. So `data-team="custom"` matched no rule, --accent
// stayed at whatever team was skinned last (or the shipped --red), and the
// number plate — the one surface painted --accent — showed another
// constructor's colour for a whole session while the car on screen was cyan.

const REAL = { isReal: (t) => !!t && !t.custom && !t.legends };
const accentOf = (dom) => dom.documentElement.style._decls;

test("a team with no tokens.css row gets its OWN colour on the plate, not the last one skinned", () => {
  const { player, G, dom, tick } = boot({ teams: REAL });
  player.team = { id: "ferrari", color: [0.86, 0, 0] };
  G.cssCol = (c) => "rgb(" + c.map((x) => Math.round(x * 255)).join(",") + ")";
  tick();
  assert.equal(accentOf(dom)["--accent"], undefined,
    "a real constructor must leave the cascade alone — tokens.css already has its row, measured by hand");
  assert.equal(dom.documentElement.dataset.team, "ferrari");

  player.team = { id: "custom", custom: true, color: [0.13, 0.79, 0.85] };
  G.store = { rev: 1 };
  tick();
  assert.equal(accentOf(dom)["--accent"], "rgb(33,201,217)",
    "MY TEAM's plate is MY TEAM's colour — this is the bug: it used to inherit ferrari's row");
});

test("the plate's ink is whichever token stands further from the team colour", () => {
  // The same rule nontext-contrast.test.mjs proves of every hand-written row,
  // recomputed here so the code has to name the winner rather than prefer one.
  const text = hex01(TOKEN["--text"]), bg = hex01(TOKEN["--bg"]);
  const cases = [
    [0.13, 0.79, 0.85],   // the shipped MY TEAM cyan — light ground, wants dark ink
    [0.05, 0.08, 0.55],   // a navy a player could pick — dark ground, wants light ink
    [0.97, 0.97, 0.98],   // near-white
  ];
  for (const color of cases) {
    const { player, G, dom, tick } = boot({ teams: REAL });
    G.cssCol = () => "rgb(0,0,0)";
    G.store = { rev: 1 };
    player.team = { id: "custom", custom: true, color };
    tick();
    const want = wcag(color, text) >= wcag(color, bg) ? "var(--text)" : "var(--bg)";
    assert.equal(accentOf(dom)["--accent-ink"], want,
      `on ${color}: --text measures ${wcag(color, text).toFixed(2)}:1 and --bg ${wcag(color, bg).toFixed(2)}:1`);
  }
});

test("a garage colour edit re-skins the plate — the id has not changed", () => {
  // teamCss memoises on G.store.rev for exactly this reason (a CUSTOM team's
  // colours are editable mid-session); the skin write keyed on the team ID
  // alone, so the plate kept the colour the team was created with.
  const { player, G, dom, tick } = boot({ teams: REAL });
  G.store = { rev: 1 };
  G.cssCol = (c) => "rgb(" + c.map((x) => Math.round(x * 255)).join(",") + ")";
  player.team = { id: "custom", custom: true, color: [0.13, 0.79, 0.85] };
  tick();
  assert.equal(accentOf(dom)["--accent"], "rgb(33,201,217)");
  player.team.color = [0.9, 0.2, 0.1];
  G.store.rev = 2;
  tick();
  assert.equal(accentOf(dom)["--accent"], "rgb(230,51,26)", "the repaint never reached the plate");
});

test("Team menu accent follows team changes while an independent HUD accent stays selected", () => {
  const { player, dom, sb, tick } = boot({ teams: REAL });
  sb.AppearanceOpts = { hudUsesTeam: () => false, menuAccent: () => "team", speed: Math.round,
    applyMenuAccent: () => dom.documentElement.style.setProperty("--red", dom.documentElement.dataset.team === "ferrari" ? "#dc0000" : "#ff8000"),
    applyHudAccent: () => dom.documentElement.style.setProperty("--accent", "#00a3e0") };
  player.team = { id: "ferrari", color: [.86, 0, 0] }; tick();
  assert.equal(accentOf(dom)["--red"], "#dc0000");
  player.team = { id: "mclaren", color: [1, .5, 0] }; tick();
  assert.equal(accentOf(dom)["--red"], "#ff8000");
  assert.equal(accentOf(dom)["--accent"], "#00a3e0");
});

test("lap clocks carry the minute: never 1:60.00 or 1:010.00 (round first, then split)", async () => {
  const fs = await import("node:fs"), vm = await import("node:vm"), { seedDom } = await import("../helpers/seed-dom.mjs");
  const game = fs.readFileSync(new URL("../../js/game.js", import.meta.url), "utf8");
  const fmtTime = new Function(game.match(/function fmtTime\(t\) \{[\s\S]*?\n\}/)[0] + "; return fmtTime;")();
  const ctx = vm.createContext({}); seedDom(ctx);
  const fmtLap = vm.runInContext("Dom", ctx).fmtLap;
  const cases = [[59.996, "1:00.00", "59.996"], [119.9996, "2:00.00", "2:00.000"], [69.9996, "1:10.00", "1:10.000"], [9.996, "0:10.00", "9.996"], [83.456, "1:23.46", "1:23.456"]];
  for (const [t, clock, lap] of cases) {
    assert.equal(fmtTime(t), clock, `fmtTime(${t})`);
    assert.equal(fmtLap(t), lap, `fmtLap(${t})`);
  }
  const rs = fs.readFileSync(new URL("../../js/ui/results-sheet.js", import.meta.url), "utf8");
  assert.match(rs, /const cs = Math\.round\(seconds \* 100\)/, "the results sheet's fallback clock rounds first too");
});

/* ── MOTION: REDUCED, the spoken flag, and sector identity (2026-09-30) ──── */

// The ids inside one element of the shell, by <div> depth from its open tag
// (comments stripped first, so prose mentioning a tag cannot unbalance it).
function shellSubtreeIds(html, id) {
  const src = html.replace(/<!--[\s\S]*?-->/g, "");
  const start = src.indexOf(`<div id="${id}"`);
  assert.ok(start >= 0, `index.html has <div id="${id}">`);
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  let depth = 0, end = src.length, m;
  while ((m = re.exec(src))) {
    depth += m[0] === "</div>" ? -1 : 1;
    if (depth === 0) { end = m.index; break; }
  }
  return new Set([...src.slice(start, end).matchAll(/\sid="([\w-]+)"/g)].map((x) => x[1]));
}

test("MOTION: REDUCED stops every HUD pulse, not only the OS query", () => {
  // The bug: css/responsive.css scoped the data-motion backstop to
  // :is(#overlay, .screen), so a player who picked MOTION: REDUCED in SETTINGS
  // still got the redline, OVERTAKE, pit-arrow, limits and VSC-flag pulses —
  // every one of them stopped only for an OS that asked.
  const hud = cssRules(read("css/hud.css"));
  const back = hud.find((r) => r.selector.includes(':root[data-motion="reduce"] :is(#hud, #announce, .touchbtn) *')
    && !r.context.some((c) => c.startsWith("@media")));
  assert.ok(back, "css/hud.css carries a data-motion backstop over #hud and #announce, outside any @media");
  assert.match(back.selector, /:root\[data-motion="reduce"\] :is\(#hud, #announce, \.touchbtn\)/,
    "…and over the elements themselves, the touch buttons included (the dock groups start outside #hud)");
  assert.match(back.selector, /:is\(#hud, #announce, \.touchbtn\) \*::before/,
    "…and over the touch buttons' DESCENDANTS and pseudo-elements, not only the button box");
  assert.match(back.selector, /\*::before/); assert.match(back.selector, /\*::after/);
  assert.equal(back.decls.get("animation-iteration-count"), "1 !important", "nothing repeats");
  assert.match(back.decls.get("animation-duration") || "", /^0\.0\d*ms !important$/, "one-shots land at once");

  // Every live HUD animation must sit where that backstop reaches: an id in the
  // #hud / #announce subtree of the shell, or a node hud.js builds inside one
  // (.sec-row -> #hud-sectors). A new pulse on an element outside both is red here.
  const html = read("index.html");
  const covered = new Set([...shellSubtreeIds(html, "hud"), ...shellSubtreeIds(html, "announce"), "hud", "announce"]);
  const BUILT_INSIDE = [".sec-row"];
  const animated = hud.filter((r) => !r.context.some((c) => /prefers-reduced-motion: reduce/.test(c))
    && !r.selector.includes("data-motion")
    && [...r.decls].some(([k, v]) => (k === "animation" || k === "animation-name") && !/^none\b/.test(v)));
  assert.ok(animated.length >= 8, `found ${animated.length} animated HUD rules — the scan broke, not the sheet`);
  for (const r of animated) {
    for (const part of r.selector.split(",")) {
      const ids = [...part.matchAll(/#([\w-]+)/g)].map((x) => x[1]);
      const ok = ids.some((i) => covered.has(i)) || BUILT_INSIDE.some((c) => part.includes(c));
      assert.ok(ok, `"${part.trim()}" animates outside #hud/#announce, where MOTION: REDUCED cannot reach it`);
    }
  }
  // The touch OVERTAKE pulse lives in css/overlays.css on #btn-ot: covered
  // because the shell gives it .touchbtn.
  assert.match(readCssSource("css/overlays.css"), /#btn-ot\.armed \{[^}]*animation: pulse/);
  assert.match(html, /<button id="btn-ot" class="touchbtn"/);
  // The HUD-HIDDEN hint's fade has the same twin as its OS rule, so it stays put.
  assert.match(readCssSource("css/overlays.css"), /:root\[data-motion="reduce"\] #hud-restore::after \{ animation: none; \}/);
});

function pitBoot(opts) {
  const b = boot(opts);
  b.G.track.pit = { entryRoadM: 1, sA: 10, sB: 30, sIn: 15 };
  b.G.pits = { worthStopping: () => true, toEntry: () => 5, cueM: 100 };
  b.player.pitArmed = true;
  return b;
}
const alphas = (log) => log.filter(([k]) => k === "globalAlpha").map(([, v]) => v);

test("the minimap's armed pit marker pulses — unless motion is reduced, by SETTINGS or by the OS", () => {
  const live = pitBoot();
  live.tick();
  assert.ok(alphas(live.mapLog).some((a) => a !== 1), "an armed stop pulses the P when motion is on");

  // SETTINGS › MOTION: REDUCED (html[data-motion], js/ui/title-fx.js).
  const set = pitBoot();
  set.dom.documentElement.dataset.motion = "reduce";
  set.tick();
  assert.ok(alphas(set.mapLog).length > 0, "the marker was drawn");
  assert.deepEqual([...new Set(alphas(set.mapLog))], [1], "MOTION: REDUCED holds the P solid — it pulsed at 6 Hz regardless");

  // The OS flag, read through matchMedia.
  const os = pitBoot({ matchMedia: (q) => ({ matches: /prefers-reduced-motion: reduce/.test(q) }) });
  os.tick();
  assert.deepEqual([...new Set(alphas(os.mapLog))], [1], "an OS asking for reduced motion holds it solid too");
});

test("a caution flag is SPOKEN through #announce-live, once per change", () => {
  // #hud-flag was a role="alert" filled and unhidden in the same step, which
  // NVDA, JAWS and VoiceOver do not announce (index.html, #announce-live). It
  // carries no live role now; #announce-live is the one voice.
  assert.ok(/<div id="hud-flag" hidden><\/div>/.test(fs.readFileSync(path.join(ROOT, "index.html"), "utf8")),
    "#hud-flag must not be a live region too, or a working reader says the flag twice");
  const { els, G, timers, tick } = boot();
  const live = els.announceLive;
  const flush = () => { while (timers.length) timers.shift()(); };
  G.cautionInfo = () => ({ level: 2 }); tick();
  assert.equal(els.flag.textContent, "VSC", "the chip still reads VSC");
  assert.equal(els.flag.hidden, false, "…and still shows");
  assert.equal(live.textContent, "", "cleared first, so a repeat is still a change");
  assert.equal(timers.length, 1);
  flush();
  assert.equal(live.textContent, "RACE CONTROL: VIRTUAL SAFETY CAR", "spoken in words, on the radio's channel label");
  tick(); tick();
  assert.equal(timers.length, 0, "a steady flag is not re-spoken every HUD tick");
  G.cautionInfo = () => ({ level: 1, sector: 1 }); tick(); flush();
  assert.equal(live.textContent, "RACE CONTROL: YELLOW FLAG, SECTOR 2");
  G.cautionInfo = () => ({ level: 0 }); tick();
  assert.equal(els.flag.hidden, true);
  G.cautionInfo = () => ({ level: 1, sector: 1 }); tick(); flush();
  assert.equal(live.textContent, "RACE CONTROL: YELLOW FLAG, SECTOR 2", "the same flag after a green is news again");
  G.cautionInfo = () => ({ level: 4 }); tick(); flush();
  assert.equal(live.textContent, "RACE CONTROL: RED FLAG");
  G.cautionInfo = () => ({ level: 3 }); tick(); flush();
  assert.equal(live.textContent, "RACE CONTROL: SAFETY CAR");
});

test("minimap sector arcs are the podium metals from tokens — no purple, no red/green pair", () => {
  // Load the REAL TrackMaps.sectorColors against the sheet's own tokens, so the
  // map and CIRCUIT DETAIL are proven to read the same three.
  const tmCtx = { document: { documentElement: {} }, getComputedStyle: () => ({ getPropertyValue: (k) => ALL_TOKENS[k] || "" }) };
  vm.runInNewContext(src("js/ui/track-maps.js"), tmCtx, { filename: "js/ui/track-maps.js" });
  const TM = tmCtx.TrackMaps;
  assert.deepEqual([...TM.SECTOR_TOKENS], ["--gold", "--silver", "--bronze"]);
  const want = [...TM.SECTOR_TOKENS].map((k) => ALL_TOKENS[k]);   // spread first: a VM-realm .map() fails deepStrictEqual
  assert.deepEqual([...TM.sectorColors()], want, "sectorColors reads the tokens");
  assert.deepEqual([...TM.SECTOR_COLORS], want, "and its fallback literals are those tokens' values");

  const { bgLog, tick } = boot({ trackMaps: { drsZones: () => [], sectorColors: TM.sectorColors } });
  tick();
  const strokes = bgLog.filter(([k]) => k === "strokeStyle").map(([, v]) => v);
  assert.deepEqual(strokes.slice(0, 3), want, "S1/S2/S3 are gold, silver, bronze on the minimap");
  const a = alphas(bgLog);
  assert.equal(a[0], 0.8, "the arcs keep their 0.8 alpha"); assert.equal(a[a.length - 1], 1, "and the alpha is restored");

  // Not a timing colour: purple is session best, green personal best, red slower.
  for (const k of ["--sec-best", "--faster", "--slower", "--you"])
    assert.ok(!want.includes(ALL_TOKENS[k]), `a sector arc wears ${k}`);
  // Separated by LIGHTNESS, the channel every colour-vision type keeps: each
  // pair differs by at least 1.25:1 in WCAG luminance ratio.
  const L = want.map((h) => lum(hex01(h)));
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    const r = (Math.max(L[i], L[j]) + 0.05) / (Math.min(L[i], L[j]) + 0.05);
    assert.ok(r >= 1.25, `S${i + 1} vs S${j + 1}: ${r.toFixed(2)}:1`);
  }
  // Both drawers read the helper; the stale "= the sector labels" claim is gone.
  const hudSrc = read("js/ui/hud.js"), tmSrc = read("js/ui/track-maps.js");
  assert.match(hudSrc, /const SC = TrackMaps\.sectorColors\(\);/);
  assert.match(tmSrc, /SC = sectorColors\(\)/); assert.match(tmSrc, /g\.strokeStyle = SC\[s\];/);
  assert.doesNotMatch(hudSrc, /= the sector labels/);
  assert.doesNotMatch(hudSrc + tmSrc, /192,\s*132,\s*252|#c084fc/i, "the purple literal is gone from both drawers");
});

function measuredHud() {
  const b = boot({ tokens: true }), reads = { width: 0, height: 0 };
  const top = b.dom.document.createElement("div"); top.className = "hud-top";
  top._rect = { left: 490, right: 790, top: 8, bottom: 62, width: 300, height: 54 };
  b.dom.body.appendChild(top); b.dom.body.classList.add("desktop");
  const root = b.dom.documentElement;
  const zoom = () => +root.style.getPropertyValue("--hud-z-top") || +root.style.getPropertyValue("--hud-scale") || 1;
  const css = () => b.dom.body.dataset.density === "compact" ? 96 : 140;
  Object.defineProperties(b.els.minimap, {
    clientWidth: { get: () => { reads.width++; return css(); }, configurable: true },
    clientHeight: { get: () => { reads.height++; return css(); }, configurable: true },
    currentCSSZoom: { get: zoom, configurable: true },
  });
  b.els.minimap._rect = { left: 10, right: 150, top: 8, bottom: 148, width: 140, height: 140 };
  b.G.hudMapVis = "on";
  for (let i = 0; i < 3; i++) b.tick();
  const reset = () => { reads.width = reads.height = 0; };
  const bitmap = () => Math.round(css() * Math.min(3, Math.max(1, zoom() * b.sb.devicePixelRatio)));
  return { ...b, reads, reset, bitmap };
}

test("minimap measures actual raster/layout changes, not changing gap spelling", () => {
  const b = measuredHud(), rival = { s: 20, prog: 110, code: "AHD", team: { id: "t2", color: [0, 1, 0] } };
  b.G.cars.unshift(rival); b.G.ranked = [rival, b.player]; b.player.rank = 2;
  b.tick(); b.tick();
  const initial = b.els.gapA.textContent;
  b.reset(); rival.prog = b.player.prog + 10000; b.tick(); b.tick();
  assert.ok(b.els.gapA.textContent.length > initial.length, "the gap really acquired another digit");
  assert.deepEqual(b.reads, { width: 0, height: 0 }, "a spelling change without a new cap cannot resize the canvas");
  const change = (edit) => {
    b.reset(); edit(); b.tick();
    assert.deepEqual(b.reads, { width: 1, height: 1 }, "a real raster/layout change measures once");
    assert.deepEqual([b.els.minimap.width, b.els.minimap.height], [b.bitmap(), b.bitmap()]);
  };
  change(() => { b.sb.innerWidth = 1440; });
  change(() => { b.dom.documentElement.style.setProperty("--hud-scale", "1.25"); });
  b.tick(); b.tick();
  change(() => { b.dom.documentElement.style.setProperty("--hud-z-top", "2"); });
  change(() => { b.sb.devicePixelRatio = 2; });
  change(() => { b.dom.body.dataset.density = "compact"; });
  change(() => { b.G.hudProfile = "broadcast"; });
  b.reset(); b.G.hudMapVis = "off"; b.tick();
  assert.deepEqual(b.reads, { width: 0, height: 0 }, "a hidden map never measures");
  change(() => { b.G.hudMapVis = "on"; });
  change(() => { b.G.track = { ...b.G.track, map: [[0, 1], [1, 0]] }; b.hud.invalidateMap(); });
});

test("HUD conditional widgets skip stable attribute writes and repair external DOM edits", () => {
  const b = boot(), { els, G, player, dom, tick } = b;
  for (const key of ["tyre", "tyreCode", "tyreFill", "pitCue", "pitCueText", "pitCueArrow", "workBtn", "plan"])
    els[key] = dom.byId("probe-" + key);
  let writes = 0;
  for (const el of [els.tyre, els.pitCue, els.workBtn, els.gapA]) {
    let hidden = el.hidden;
    Object.defineProperty(el, "hidden", { get: () => hidden, set: (v) => { writes++; hidden = !!v; }, configurable: true });
    el.dataset = new Proxy(el.dataset, {
      set: (o, k, v) => { writes++; o[k] = String(v); return true; },
      deleteProperty: (o, k) => { writes++; delete o[k]; return true; },
    });
  }
  let wear = false, spent = 0.2, cue = null, work = false, plan = null;
  G.tyres = { on: () => wear, spent: () => spent, lapsLeft: () => 8 };
  G.pits = { commitFrac: () => 0, cue: () => cue, canWork: () => work, planInfo: () => plan,
    info: () => ({ side: 1 }), windowOf: () => "" };
  const steady = () => { writes = 0; for (let i = 0; i < 30; i++) tick(); assert.equal(writes, 0); };
  tick(); steady();
  assert.deepEqual([els.tyre.hidden, els.pitCue.hidden, els.workBtn.hidden], [true, true, true]);
  wear = true; tick(); steady(); assert.equal(els.tyre.dataset.wear, "ok");
  spent = 0.75; tick(); assert.equal(els.tyre.dataset.wear, "warn");
  const rival = { s: 20, prog: 20, code: "AHD", team: { id: "t2", color: [0, 1, 0] } };
  G.cars.unshift(rival); G.ranked = [rival, player]; player.rank = 2; player.towing = 0.7; player.pitState = "box";
  cue = { text: "WORK ON CAR", phase: "box", frac: 1 }; work = true; plan = { text: "BOX LAP 4", state: "due" };
  tick(); steady();
  assert.deepEqual([els.tyre.hidden, els.pitCue.hidden, els.workBtn.hidden], [false, false, false]);
  assert.equal(els.pitCueText.textContent, "WORK ON CAR"); assert.equal(els.pitCueArrow.textContent, "▶");
  for (const el of [els.tyre, els.pitCue, els.workBtn]) el.hidden = true;
  els.tyre.dataset.wear = "wrong"; els.tyre.dataset.pit = "wrong"; els.tyre.dataset.plan = "wrong";
  els.pitCue.dataset.phase = "wrong"; delete els.gapA.dataset.tow;
  writes = 0; tick(); assert.equal(writes, 8, "exactly the eight stale actual DOM values are repaired");
  assert.deepEqual([els.tyre.hidden, els.pitCue.hidden, els.workBtn.hidden], [false, false, false]);
  assert.deepEqual([els.tyre.dataset.wear, els.tyre.dataset.pit, els.tyre.dataset.plan, els.pitCue.dataset.phase, els.gapA.dataset.tow],
    ["warn", "box", "due", "box", "1"]);
  player.pitState = "none"; player.towing = 0; cue = null; work = false; plan = null; tick(); steady();
  assert.deepEqual([els.pitCue.hidden, els.workBtn.hidden, els.tyre.dataset.pit, els.tyre.dataset.plan, els.gapA.dataset.tow],
    [true, true, undefined, undefined, undefined]);
  wear = false; tick();
  for (const el of [els.tyre, els.pitCue, els.workBtn]) el.hidden = false;
  writes = 0; tick(); assert.equal(writes, 3);
  assert.deepEqual([els.tyre.hidden, els.pitCue.hidden, els.workBtn.hidden], [true, true, true]);
});
