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
  // #announce-live's one writer, as in the shell (it loads before hud.js).
  vm.runInNewContext(src("js/ui/live-region.js"), sb, { filename: "js/ui/live-region.js" });
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

// The gearbox chip is display:none under body.cockpit-cam (css/track-detail.css),
// so its frame-rate writes wait there — but the hysteresis keeps tracking, and
// the first frame out of the cockpit paints the live values.
test("under cockpit-cam the hidden gear/tach writes wait; the redline latch keeps its history", () => {
  const { els, player, dom, tick } = boot();
  player.gear = 4; player.rpm = IDLE_RPM + (MAX_RPM - IDLE_RPM) * 0.5; tick();
  assert.equal(els.gear.textContent, "4");
  assert.equal(els.rpmFill.style.getPropertyValue("--rpm"), "0.50");
  dom.document.body.classList.add("cockpit-cam");
  player.gear = 6; player.rpm = MAX_RPM * 0.93; tick();   // enters the redline while hidden
  assert.equal(els.gear.textContent, "4", "no write to the hidden chip");
  assert.equal(els.rpmFill.style.getPropertyValue("--rpm"), "0.50");
  player.rpm = MAX_RPM * 0.905; tick();                   // inside the band: the latch must remember 93 %
  dom.document.body.classList.remove("cockpit-cam");
  tick();
  assert.equal(els.gear.textContent, "6", "out of the cockpit: the live gear");
  assert.ok(els.tach.classList.contains("redline"), "the latch entered at 93 % while hidden and holds at 90.5 %");
  assert.equal(els.rpmFill.style.getPropertyValue("--rpm"), (Math.round(clampFrac(MAX_RPM * 0.905) * 100) / 100).toFixed(2));
  // The fill is the whole tach, clipped at --rpm: its colour stops sit on fixed
  // revs instead of sliding with a fill whose width WAS the revs.
  const css = fs.readFileSync(path.join(ROOT, "css/hud.css"), "utf8");
  const fill = css.match(/#hud-rpm-fill \{([^}]*)\}/)[1];
  assert.match(fill, /width: 100%/);
  assert.match(fill, /clip-path: inset\(0 calc\(\(1 - var\(--rpm, 0\)\) \* 100%\) 0 0\)/);
  assert.equal(els.rpmFill.style.width || "", "", "the width is never written per frame any more");
});
function clampFrac(rpm) { return Math.min(1, Math.max(0, (rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM))); }

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

test("a sector split shows its GAIN on the previous best for 3 s, then the split again", () => {
  // The bare split made the driver remember last lap's figure to know whether
  // ▼31.204 was 0.02 s or 0.6 s better. game.js writes sectorLast AND the new
  // best in one crossing, then calls flashSector — so the HUD must measure
  // against the best it saw BEFORE that crossing, not the one just written.
  const { els, G, hud, tick } = boot();
  tick();
  const vals = els.hudSectors.children.map((row) => row.children[1]);
  G.fieldSectorBests[0] = 28.0;
  const cross = (t) => { G.sectorLast[0] = t; if (t < G.sectorBests[0]) G.sectorBests[0] = t; hud.flashSector(0); tick(); };

  cross(28.431);
  assert.equal(vals[0].textContent, "▼28.431", "a first-ever split has nothing to beat: the absolute time");

  cross(28.9);
  assert.equal(vals[0].textContent, "▲+0.469", "slower: the loss to the best, signed");
  assert.equal(vals[0].style.color, "var(--sec-slow)", "the slower state keeps its yellow");
  for (let k = 0; k < 29; k++) tick();
  assert.equal(vals[0].textContent, "▲+0.469", "held for the whole 3 s");
  tick();
  assert.equal(vals[0].textContent, "▲28.900", "then the split itself again");

  cross(28.289);
  assert.equal(vals[0].textContent, "▼-0.142", "a new best reads its gain on the OLD best, not 0.000");
  assert.equal(vals[0].style.color, "var(--faster)");

  // A new race starts with no best: the first split is absolute again.
  hud.resetRace();
  G.sectorBests[0] = Infinity; G.sectorLast[0] = null; tick();
  cross(29.5);
  assert.equal(vals[0].textContent, "▼29.500");
});

test("in a race the lap clock holds the lap just driven for 3 s — green on a personal best", () => {
  // The clock snapped to zero at the line and the race gaps slot shows gaps,
  // so a race never showed the lap the driver had just completed.
  const { els, G, player, tick } = boot();
  tick();
  assert.equal(els.time.textContent, "12.00", "mid-lap: the running clock");
  const line = (lastLap, lapTime) => { player.lap++; player.lastLap = lastLap; if (lastLap < player.best) player.best = lastLap; player.lapTime = lapTime; tick(); };

  line(91.5, 0.4);
  assert.equal(els.time.textContent, "91.50", "the lap just driven, not 0.40");
  assert.equal(els.time.dataset.hold, "pb", "a personal best is marked for the green");
  player.lapTime = 2.9; tick();
  assert.equal(els.time.textContent, "91.50", "still held inside the 3 s");
  player.lapTime = 3.1; tick();
  assert.equal(els.time.textContent, "3.10", "back to the running clock");
  assert.equal(els.time.dataset.hold, undefined);

  line(92.25, 0.2);
  assert.equal(els.time.textContent, "92.25");
  assert.equal(els.time.dataset.hold, "lap", "held, but not a personal best: no green");

  // An INVALID lap leaves lastLap where it was (game.js writes it for a valid
  // lap only) — the clock must not re-show the lap before it.
  player.lapTime = 5; tick();
  line(92.25, 0.3);
  assert.equal(els.time.textContent, "0.30", "an invalid lap keeps the running clock");

  // Qualifying is not a race: the clock is unchanged there.
  G.session = "quali"; player.lapTime = 5; tick();
  line(90, 0.3);
  assert.equal(els.time.textContent, "0.30");
  assert.match(read("css/hud.css"), /#hud-time\[data-hold="pb"\]\s*\{\s*color:\s*var\(--faster\)/);
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
  // Standard profile: two decimals under ~10 s (Overtake unlock ~1.0 s).
  assert.equal(read(), 1.25, "100 m at 80 m/s reads 1.25 s on the first tick (no history)");
  player.speed = 30; tick();
  assert.ok(read() < 2.2, `one braking tick must not jump to 3.33 s — read ${read()}`);
  for (let i = 0; i < 40; i++) tick();
  assert.equal(read(), 3.33, "…but converges to the true 3.33 s within a few seconds");
  const other = { code: "LEC", prog: player.prog + 100, speed: 30, rank: 1 };
  G.ranked = [other, player]; tick();
  assert.equal(read(), 3.33, "a new rival starts from its own raw gap, not the old rival's history");
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

// Portrait cockpit default: both #hud-gap-ahead / #hud-gap-behind are "" and
// the plate's padding + first-child min-height painted a ~10×10 junk chip under
// the minimap. Collapse when every child readout is :empty.
test("empty .hud-gaps collapses — no junk chip when both gap lines are empty", () => {
  const src = read("css/hud.css");
  const rule = src.match(/\.hud-gaps:not\(:has\(>\s*div:not\(:empty\)\)\)\s*\{([^}]*)\}/);
  assert.ok(rule, "a :has(:empty) collapse rule owns empty .hud-gaps");
  assert.match(rule[1], /display:\s*none/, "fully hide — not a zero-opacity plate");
  // Still keep the one-line ahead pin for the half-empty (P1) case.
  assert.equal(decl(cssRules(src), ".hud-gaps > div:first-child", "min-height"), "1.3em");
});

test("empty #hud-sectors collapses — no junk plate before buildSecRows fills it", () => {
  const src = read("css/hud.css");
  assert.match(src, /#hud-sectors:empty\s*\{\s*display:\s*none/,
    "bare #hud-sectors (index.html) must not reserve padding/background gap");
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
  const comp = cssRules(readCssSource("css/overlays.css"));
  for (const sel of [".res-pos", ".res-pts"]) {
    assert.equal(decl(comp, sel, "font-family"), "var(--font-hud)", sel + " reads the HUD face");
    assert.equal(decl(comp, sel, "font-variant-numeric"), "tabular-nums", sel + " keeps digits from reflowing");
  }
  const hud = cssRules(read("css/hud.css"));
  assert.match(decl(hud, '#hud-pos[data-delta="up"]', "color") || "", /--faster/);
  const results = readCssSource("css/overlays.css");
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

// UI-07 (hunt2): race-length clocks (results ELAPSED, the WATCH seek bar, the
// Data Hub race table) printed minutes past 60 ("92:14.53"), and results.js's
// fmtClock split before rounding ("59:60.000"). One formatter, round first.
test("race clocks roll over to hours and carry every unit (Dom.fmtRaceClock)", async () => {
  const fs = await import("node:fs"), vm = await import("node:vm"), { seedDom } = await import("../helpers/seed-dom.mjs");
  const ctx = vm.createContext({}); seedDom(ctx);
  const { fmtRaceClock } = vm.runInContext("Dom", ctx);
  const cases = [[3599.9996, 3, "1:00:00.000"], [5534.53, 3, "1:32:14.530"], [59.9996, 3, "1:00.000"],
    [3599.4, 3, "59:59.400"], [7199.9997, 3, "2:00:00.000"], [5534.9, 0, "1:32:14"], [59.9, 0, "0:59"], [0, 0, "0:00"]];
  for (const [t, d, want] of cases) assert.equal(fmtRaceClock(t, d), want, `fmtRaceClock(${t}, ${d})`);
  assert.equal(fmtRaceClock(-1), null);
  assert.equal(fmtRaceClock(NaN), null);
  const src = (f) => fs.readFileSync(new URL("../../" + f, import.meta.url), "utf8");
  assert.match(src("js/ui/results-sheet.js"), /Dom\.fmtRaceClock\(seconds\)/, "results ELAPSED");
  assert.match(src("js/ui/watch-transport.js"), /Dom\.fmtRaceClock\(s, 0\)/, "the WATCH seek bar");
  assert.match(src("js/data/results.js"), /return Dom\.fmtRaceClock\(s\);/, "the Data Hub race table");
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

test("MOTION: REDUCED keeps RELATIVE fit geometry out of transitions", () => {
  const rules = cssRules(read("css/hud.css"));
  const fit = rules.find((r) => r.selector.includes(':root[data-motion="reduce"]')
    && /#hud-rel\b/.test(r.selector) && r.decls.has("transition-property"));
  assert.ok(fit, "RELATIVE needs the geometry exemption: even a 0.01ms transition returns its old rect inside syncPhoneFit");
  const properties = fit.decls.get("transition-property").split(",").map((p) => p.trim());
  for (const geometry of ["all", "left", "top", "width", "height", "max-height", "zoom", "transform"]) {
    assert.ok(!properties.includes(geometry), `${geometry} must land before the synchronous clearance probe`);
  }
  assert.ok(properties.includes("opacity") && properties.includes("color"), "paint transitions keep the reduced-motion backstop");
  assert.ok(!fit.decls.has("zoom") && !fit.decls.has("--hud-z"), "the exemption does not change RELATIVE's band zoom");
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

/* fitHud BUDGETS THE UN-MOVED LAYOUT (MOVE & SIZE, js/ui/hud-layout.js).
 *
 * MOVE & SIZE paints `translate` / `scale` over an element (data-hl, --hl-x/-y
 * in screen %, --hl-s, origin --hl-o) and getBoundingClientRect includes both,
 * so a moved map, a SIZE-200 sector box or gearbox shrank whole bands, the
 * safe-area insets and the pedals. The fixture lays out a tight touch HUD
 * (800x400 @150 %, every cap biting), then paints offsets with an independent
 * FORWARD model of the CSS — O + t + s*(U - O), O the --hl-o point of the box
 * before the element's own transform (the tower's translateX(-50%)) — and
 * requires every cap and published edge to be unchanged. The same painted
 * rects WITHOUT data-hl (what the old code saw) must move them, which proves
 * the fixture can tell. */
const FIT_VARS = ["--hud-z-top", "--hud-z-bot", "--hud-z-dock", "--hud-left-h", "--hud-left-px", "--hud-sec-h", "--hud-top-h"];
function fitHarness(opts = {}) {
  const b = boot({ tokens: true, innerWidth: 800 });
  b.sb.innerHeight = 400;
  const { dom } = b, root = dom.documentElement;
  root.style.setProperty("--hud-scale", "1.5");
  const mk = (cls, parent) => { const e = dom.document.createElement("div"); e.className = cls; (parent || dom.body).appendChild(e); return e; };
  const top = mk("hud-top"), bottom = mk("hud-bottom"), bar = dom.document.createElement("div");
  bar.id = "hud-dock"; dom.body.appendChild(bar);
  const dockL = dom.byId("dock-left"), dockR = dom.byId("dock-right");
  for (const d of [dockL, dockR]) { dom.body.removeChild(d); bar.appendChild(d); }
  const gear = mk("g", bottom), energy = mk("e", bottom), gL = mk("gl", dockL), gR = mk("gr", dockR);
  const R = (left, top_, w, h) => ({ left, top: top_, right: left + w, bottom: top_ + h, width: w, height: h });
  // U: the un-moved layout. The tower is centred by left:50% + translateX(-50%).
  const U = new Map([
    [top, R(250, 8, 300, 54)], [b.els.minimap, R(10, 8, 140, 140)],
    // Sectors below the wrapping-card band (tower.bottom + tower.height = 116)
    // so they do not kill the default top-row slot; they still end the hanging lane.
    [b.els.hudSectors, R(650, 130, 140, 72)],
    [gear, R(100, 330, 300, 60)], [energy, R(400, 330, 300, 60)],
    [bar, R(0, 200, 800, 200)], [dockL, R(0, 200, 150, 200)], [dockR, R(650, 200, 150, 200)],
    [gL, R(0, 200, 150, 200)], [gR, R(650, 200, 150, 200)],
  ]);
  if (opts.emptyTower) U.set(top, R(400, 8, 0, 0));
  for (const [el, r] of U) el._rect = r;
  const own = new Map([[top, -150]]);   // translateX(-50%) in the tower's own px
  Object.defineProperty(top, "offsetWidth", { get: () => U.get(top).width, configurable: true });
  b.sb.getComputedStyle = (el) => ({
    getPropertyValue: (k) => ALL_TOKENS[k] || "", columnGap: "0px", rowGap: "0px",
    transform: own.has(el) ? `matrix(1, 0, 0, 1, ${own.get(el)}, 0)` : "none",
  });
  const O = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 };
  /** Paint MOVE & SIZE over `el` (forward model); `mark` false = the rect only. */
  const paint = (el, hl, mark = true) => {
    const u = U.get(el), s = hl.s || 1, [fy, fx] = hl.o.split(" ").map((k) => O[k]);
    const dx = own.has(el) ? -u.width / 2 : 0;           // the own transform's shift in screen px
    const ox = u.left - dx + fx * u.width, oy = u.top + fy * u.height;   // origin, on the box BEFORE the own transform
    const left = ox + (hl.x || 0) * 8 + s * (u.left - ox), top_ = oy + (hl.y || 0) * 4 + s * (u.top - oy);
    el._rect = R(left, top_, u.width * s, u.height * s);
    if (!mark) return;
    el.setAttribute("data-hl", "");
    for (const k of ["x", "y", "s"]) el.style.setProperty("--hl-" + k, String(hl[k] == null ? (k === "s" ? 1 : 0) : hl[k]));
    el.style.setProperty("--hl-o", hl.o);
  };
  const snap = () => Object.fromEntries(FIT_VARS.map((k) => [k, root.style.getPropertyValue(k)]));
  const refit = () => { b.sb.GameHud.invalidateFit(); b.tick(); return snap(); };
  for (let i = 0; i < 3; i++) b.tick();
  return { ...b, top, gear, U, paint, snap, refit, root };
}
const MOVES = (h) => [
  [h.top, { s: 1.5, o: "top left", y: 10 }], [h.els.minimap, { x: 20, y: 30, s: 1.5, o: "top left" }],
  [h.els.hudSectors, { s: 2, o: "top right", y: 20 }], [h.gear, { x: -10, s: 2, o: "bottom center" }],
];

test("a moved / resized tower, map, sector box or gearbox leaves every fit cap where it was", () => {
  const h = fitHarness(), base = h.snap();
  for (const k of ["--hud-z-top", "--hud-z-bot", "--hud-z-dock"]) assert.ok(+base[k] > 0 && +base[k] < 1.5, `${k} bites in the fixture (${base[k]})`);
  for (const [el, hl] of MOVES(h)) {
    h.paint(el, hl);
    assert.deepEqual(h.refit(), base, `moving ${el.className || el.id} ${JSON.stringify(hl)} changed the fit`);
  }
  // Control: the SAME painted rects with no data-hl are what the old fit read.
  const c = fitHarness(), cBase = c.snap();
  for (const [el, hl] of MOVES(c)) c.paint(el, hl, false);
  assert.notDeepEqual(c.refit(), cBase, "un-marked painted rects move the caps — the fixture can see the defect");
});

test("an empty timing tower still fits the bottom band and writes the dock cap", () => {
  const full = fitHarness().snap();
  const h = fitHarness({ emptyTower: true }), got = h.snap();
  assert.ok(+got["--hud-z-dock"] > 0, "the dock cap is written with POS/LAP/TIME/BEST all off");
  assert.equal(got["--hud-z-dock"], full["--hud-z-dock"], "and it is the same cap the full HUD gets");
  assert.equal(got["--hud-z-bot"], full["--hud-z-bot"]);
  // Nothing laid out at all (the menu layer) still writes nothing.
  const none = fitHarness({ emptyTower: true });
  for (const el of none.U.keys()) el._rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  none.root.style.removeProperty("--hud-z-dock");
  assert.equal(none.refit()["--hud-z-dock"], "", "an empty layout is a retry, not a fit");
});

test("GameHud.invalidateFit forces the next tick to re-fit; HudElements.apply calls it", () => {
  const h = fitHarness(), base = h.snap();
  const u = h.U.get(h.gear);
  h.gear._rect = { ...u, left: u.left - 200, width: u.width + 200 };
  h.tick();
  assert.deepEqual(h.snap(), base, "an attribute-only change waits out the same-key backoff");
  const after = h.refit();
  assert.notEqual(after["--hud-z-bot"], base["--hud-z-bot"], "invalidateFit re-measures on the very next tick");
  assert.match(read("js/ui/hud-elements.js"), /typeof GameHud !== "undefined" && GameHud\.invalidateFit\) GameHud\.invalidateFit\(\)/);
});

test("the radio card's top-row slot is published at 1/SIZE when MOVE & SIZE scales the card", () => {
  const h = fitHarness(), w = () => parseFloat(h.root.style.getPropertyValue("--radio-top-w"));
  assert.ok(h.dom.body.classList.contains("hud-radio-top"), "the fixture's tower row has a slot");
  const full = w();
  h.els.announce = h.dom.byId("announce");
  h.els.announce.setAttribute("data-hl", ""); h.els.announce.style.setProperty("--hl-s", "2");
  h.refit();
  assert.equal(w(), +(full / 2).toFixed(1), "a SIZE-200 card paints exactly the slot, not twice it");
});

/* HUD SURVEY FIXES (tools/shot/hud-survey.mjs, 2026-10-04). */
test("survey leads: SECTORS x-20, MAP y+40, SPEED & GEAR x40 / s200 leave every fit cap where it was", () => {
  for (const pick of [
    (h) => [h.els.hudSectors, { x: -20, o: "top right" }], (h) => [h.els.minimap, { y: 40, o: "top left" }],
    (h) => [h.gear, { x: 40, o: "bottom center" }], (h) => [h.gear, { s: 2, o: "bottom center" }],
  ]) {
    const h = fitHarness(), base = h.snap(), [el, hl] = pick(h);
    h.paint(el, hl);
    assert.deepEqual(h.refit(), base, `${el.className || el.id} ${JSON.stringify(hl)} changed the fit`);
  }
});

test("the radio card's top-row slot ends at a touch dock group in the tower's rows", () => {
  const h = fitHarness(), w = () => parseFloat(h.root.style.getPropertyValue("--radio-top-w"));
  const on = () => h.dom.body.classList.contains("hud-radio-top");
  // Tower R(250,8,300,54): the slot starts at 558 and runs to innerWidth - 10.
  assert.ok(on()); assert.equal(w(), 790 - 8 - 558);
  const boost = h.dom.document.createElement("div"); boost.className = "boost";
  h.dom.byId("dock-right").appendChild(boost);
  boost._rect = { left: 700, top: 30, right: 788, bottom: 118, width: 88, height: 88 };   // BOOST, up in the tower's rows
  h.refit();
  assert.ok(on(), "a 134px strip is still a slot"); assert.equal(w(), 700 - 8 - 558, "the strip ends at BOOST's left edge");
  boost._rect = { left: 540, top: 30, right: 628, bottom: 118, width: 88, height: 88 };   // over the slot's start
  h.refit();
  assert.ok(!on(), "a dock group over the slot's start leaves no top-row slot");
  boost._rect = { left: 600, top: 120, right: 688, bottom: 208, width: 88, height: 88 };  // below wrapping (8+54+54=116)
  h.refit();
  assert.ok(on()); assert.equal(w(), 790 - 8 - 558, "a group under a wrapping card does not bound the top-row slot");
});

test("the radio card's top-row slot ends at #hud-sectors in the wrapping band", () => {
  const h = fitHarness(), w = () => parseFloat(h.root.style.getPropertyValue("--radio-top-w"));
  const on = () => h.dom.body.classList.contains("hud-radio-top");
  assert.ok(on()); assert.equal(w(), 790 - 8 - 558, "sectors below the wrapping band leave the default slot");
  h.els.hudSectors._rect = { left: 650, top: 8, right: 790, bottom: 80, width: 140, height: 72 };
  h.refit();
  assert.ok(!on(), "sectors in the tower's rows leave no 96px top-row slot");
  h.els.hudSectors._rect = { left: 700, top: 8, right: 790, bottom: 80, width: 90, height: 72 };
  h.refit();
  assert.ok(on(), "a 134px strip past sectors is still a slot");
  assert.equal(w(), 700 - 8 - 558, "the strip ends at the sector box's left edge");
});

test("on touch the radio card is left-aligned in the gap between the dock groups", () => {
  // Tilt auto 852×393: a centred half from the left pedals still covered BOOST.
  const h = fitHarness();
  const lane = () => h.root.style.getPropertyValue("--announce-lane-w");
  const laneLeft = () => h.root.style.getPropertyValue("--announce-lane-x");
  // innerWidth 800; the map 10..150 hangs into the card's rows (tower.bottom 62 + 8
  // to +96) and starts the lane; the left dock group (y 200..400) only publishes it;
  // sectors 650..790 at y 130 end it the way BOOST does on a phone. --announce-lane-x
  // is screen px: css/hud.css divides by --hud-z on #announce, where it lives.
  assert.equal(laneLeft(), "158.0px");
  assert.equal(lane(), "484.0px");
  const boost = h.dom.document.createElement("div"); boost.className = "boost";
  h.dom.byId("dock-right").appendChild(boost);
  boost._rect = { left: 520, top: 72, right: 608, bottom: 160, width: 88, height: 88 };
  h.refit();
  assert.equal(laneLeft(), "158.0px", "the left dock still starts the lane");
  assert.equal(lane(), (520 - 8 - 158).toFixed(1) + "px", "BOOST ends the lane at its left edge");
  boost._rect = { left: 520, top: 300, right: 608, bottom: 388, width: 88, height: 88 };
  h.refit();
  assert.equal(lane(), "484.0px", "a tap column on the bottom edge (TILT's pedals, the steer buttons) shares none of the card's rows: it no longer ends the lane (phone 2026-10-10: the card pinned at the steer column's edge, over the cars)");
  boost._rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  h.els.hudSectors._rect = { left: 500, top: 8, right: 640, bottom: 80, width: 140, height: 72 };
  h.refit();
  assert.equal(lane(), (500 - 8 - 158).toFixed(1) + "px", "SECTORS in the hanging band end the lane");
  // #1191 --dock-r-w on buttons can shove the plate's centre left of mid; a
  // mid-based clip then filed it as LEFT chrome and left the lane spanning
  // into S1–S3 (Pages trains: #hud-sectors+#announce, notched-landscape).
  h.els.hudSectors._rect = { left: 300, top: 80, right: 440, bottom: 160, width: 140, height: 80 };
  h.refit();
  assert.equal(lane(), (300 - 8 - 158).toFixed(1) + "px",
    "sectors whose centre is left of mid still end the RIGHT of the lane");
  // Large --dock-r-w can push S3 past the left chrome so w≤0. Clearing the
  // lane vars then recentres #announce onto the plate (oversize CI).
  h.els.hudSectors._rect = { left: 100, top: 80, right: 240, bottom: 160, width: 140, height: 80 };
  h.refit();
  assert.equal(lane(), "0px",
    "collapsed lane keeps --announce-lane-w:0 instead of clearing (no centre fallback)");
  assert.equal(laneLeft(), "158.0px", "collapsed lane keeps the left pin");
  assert.ok(h.dom.byId("announce").hasAttribute("data-lane-collapsed"),
    "collapsed lane sets #announce[data-lane-collapsed] for the hard CSS collapse");
  h.els.hudSectors._rect = { left: 650, top: 130, right: 790, bottom: 202, width: 140, height: 72 };
  h.els.minimap._rect = { left: 10, top: 8, right: 220, bottom: 148, width: 210, height: 140 };
  h.refit();
  assert.equal(laneLeft(), "228.0px", "the map starts the lane when it hangs under the tower");
  const gapBox = h.dom.document.createElement("div"); gapBox.className = "hud-gaps";
  h.dom.body.appendChild(gapBox);
  gapBox._rect = { left: 160, top: 8, right: 250, bottom: 30, width: 90, height: 22 }; // above tower.bottom=62
  h.refit();
  assert.equal(laneLeft(), "228.0px", "gaps in the tower row end above the card's rows: they do not start the hanging lane");
  gapBox._rect = { left: 160, top: 62, right: 250, bottom: 84, width: 90, height: 22 }; // a DROPPED strip, into the card's rows
  h.refit();
  assert.equal(laneLeft(), "258.0px", "a dropped gaps strip in the card's rows starts the hanging lane");
  // Same-tick growth: the spec measures after jump()'s updateHud, whose gap
  // strings land AFTER fitHud. Widening the box without changing the fit key
  // (text length / class / viewport) must still move the lane on this tick.
  gapBox._rect = { left: 160, top: 62, right: 310, bottom: 84, width: 150, height: 22 };
  h.tick();
  assert.equal(laneLeft(), "318.0px", "a wider gaps chip re-clips the lane on the same HUD tick");
  // An opt-in STRATEGY box in the left column shares the rows too (the phone's own layout).
  const strat = h.dom.document.createElement("div"); strat.id = "hud-strat"; h.dom.body.appendChild(strat);
  strat._rect = { left: 10, top: 150, right: 330, bottom: 190, width: 320, height: 40 };
  h.refit();
  assert.equal(laneLeft(), "338.0px", "a readout in the card's rows starts the lane");
  strat._rect = { left: 10, top: 180, right: 330, bottom: 220, width: 320, height: 40 };
  h.refit();
  assert.equal(laneLeft(), "318.0px", "one below them (band ends at tower.bottom + 8 + 96) does not");
  strat._rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };   // the mini-dom keeps ids after removeChild: zero the box too
  h.dom.body.removeChild(strat);
  // UNDER A CAUTION the card steps below the flag chip (css/hud.css), so the band
  // starts under the flag: the dropped gaps strip at y 62..84 is above it now.
  if (h.els.flag) {
    h.els.flag.hidden = false;
    h.els.flag._rect = { left: 350, top: 70, right: 450, bottom: 94, width: 100, height: 24 };
    h.refit();
    assert.equal(laneLeft(), "228.0px", "a visible flag lowers the band past a strip that ends above it (the map still starts the lane)");
    h.els.flag.hidden = true; h.els.flag._rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    h.refit();
  }
  // INPUTS (opt-in, under the sector box on touch) ends the lane when it shares the rows.
  const inputs = h.dom.document.createElement("div"); inputs.id = "hud-inputs"; h.dom.body.appendChild(inputs);
  inputs._rect = { left: 540, top: 120, right: 640, bottom: 156, width: 100, height: 36 };
  h.refit();
  assert.equal(lane(), (540 - 8 - 318).toFixed(1) + "px", "INPUTS in the card's rows ends the lane at its left edge");
  h.dom.body.removeChild(inputs);
  const src = read("js/ui/hud.js");
  assert.ok(src.indexOf("announceLane(document.documentElement)") > src.indexOf("hText(els.gapA"),
    "announceLane runs after this tick's gap strings, not only inside fitHud");
  for (const g of [...h.dom.byId("dock-left").children, ...h.dom.byId("dock-right").children]) g._rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  h.refit();
  assert.equal(lane(), "", "empty docks (desktop) publish no lane, so the CSS cap falls away");
  assert.equal(laneLeft(), "");
  const css = read("css/hud.css");
  const rule = css.match(/body:not\(\.desktop\) #announce \{[^}]*\}/);
  assert.ok(rule, "a touch-only #announce lane rule");
  assert.match(rule[0], /max-width: min\(440px, calc\(72 \* var\(--vwzh\)\), calc\(var\(--announce-lane-w, 9999px\) \/ var\(--hud-z\)\)\)/);
  assert.match(rule[0], /min-width:\s*0/);
  assert.match(rule[0], /width:\s*min\(100%, max-content, calc\(var\(--announce-lane-w/);
  assert.match(css, /body:not\(\.desktop\):not\(\.hud-radio-top\):not\(\.hud-mirror-side\) #announce \{[\s\S]*?left: calc\(var\(--announce-lane-x\) \/ var\(--hud-z\)\)/);
  assert.match(css, /body:not\(\.desktop\):not\(\.hud-radio-top\):not\(\.hud-mirror-side\) #announce \{[\s\S]*?transform: translateX\(var\(--announce-lane-shift, -50%\)\)/);
  assert.doesNotMatch(css, /body\.desktop[^{]*#announce[^{]*\{[^}]*announce-lane/, "desktop never reads the lane");
});

test("MOVE & SIZE on the tower re-derives the radio card's slot at invalidateFit, not a tick later", () => {
  const h = fitHarness(), x = () => h.root.style.getPropertyValue("--radio-top-x");
  assert.equal(x(), "558.0px", "the shipped tower ends at 550");
  h.paint(h.top, { s: 1.1, o: "top left" });          // BIG-style growth: the painted tower now ends further right
  const painted = h.top.getBoundingClientRect().right;
  h.sb.GameHud.invalidateFit();                        // HudLayout.apply's call — no HUD tick follows
  assert.equal(x(), (painted + 8).toFixed(1) + "px", "the card follows the tower on screen");
});

test("the mirror's PAINTED bottom is published for the centre column (MOVE & SIZE can grow or lower it)", () => {
  const h = fitHarness(), b = () => h.root.style.getPropertyValue("--mir-paint-b");
  const mir = h.dom.byId("hud-mirror");
  mir._rect = { left: 330, top: 70, right: 470, bottom: 140, width: 140, height: 70 };
  h.refit();
  assert.equal(b(), "0.0px", "no hud-mirror-on: nothing to clear");
  h.dom.body.classList.add("hud-mirror-on");
  h.refit();
  assert.equal(b(), "140.0px", "the frame as painted, screen px");
  mir._rect = { left: 660, top: 70, right: 790, bottom: 140, width: 130, height: 70 };
  h.refit();
  assert.equal(b(), "0.0px", "moved clear of the centre column: the flag keeps its own slot");
  mir._rect = { left: 330, top: 70, right: 470, bottom: 140, width: 140, height: 70 }; mir.hidden = true;
  h.refit();
  assert.equal(b(), "0.0px", "a hidden frame clears nothing");
  const rules = cssRules(read("css/hud.css"));
  assert.match(decl(rules, "body.hud-mirror-on :is(#announce, #hud-flag)", "--mir-bot") || "",
    /^max\([\s\S]*var\(--mir-paint-b, 0px\) \/ var\(--hud-z\)/, "--mir-bot folds the painted frame in with a max()");
});

test("a moved (data-hl) piece that unhides after the fit re-runs it, so HudLayout.fit can clamp it", () => {
  const h = fitHarness();
  let fits = 0;
  h.sb.HudLayout = { fit() { fits++; } };
  const tyre = h.dom.byId("hud-tyre");
  tyre.hidden = true; tyre.setAttribute("data-hl", ""); tyre.style.setProperty("--hl-x", "-34");
  h.refit();                         // HudLayout.apply's invalidateFit: the list of moved pieces is re-read
  fits = 0;
  h.tick(); h.tick();
  assert.equal(fits, 0, "nothing changed: the same-key backoff holds");
  tyre.hidden = false; h.tick();
  assert.equal(fits, 1, "TYRES unhiding re-fits on the next tick");
  h.tick();
  assert.equal(fits, 1, "and only once");
});

test("a moved (data-hl) piece whose words change width re-fits on the next tick, not on the 3 s timer", () => {
  // The AERO chip's text changes all lap and the cockpit strip parks it +30vw
  // from centre, so a longer string pushed its right edge past the viewport
  // (survey 2026-10-05, 1280x720 cockpit: right edge 1297) until the same-key
  // safety re-measure came round. hlKey carried `hidden` and nothing else.
  const h = fitHarness();
  let fits = 0;
  h.sb.HudLayout = { fit() { fits++; } };
  const aero = h.dom.byId("hud-aero");
  aero.setAttribute("data-hl", ""); aero.style.setProperty("--hl-x", "30");
  aero.textContent = "CORNER MODE";
  h.refit();
  fits = 0;
  h.tick(); h.tick();
  assert.equal(fits, 0, "same words: the same-key backoff holds");
  aero.textContent = "STRAIGHT MODE"; h.tick();
  assert.equal(fits, 1, "a longer string re-fits on the next tick");
  h.tick();
  assert.equal(fits, 1, "and only once");
  aero.textContent = "AERO 523m"; h.tick();
  assert.equal(fits, 2, "a shorter one re-fits too (the clamp it was given may now be too much)");
  aero.textContent = "AERO 522m"; h.tick();
  assert.equal(fits, 2, "a countdown that keeps its length costs nothing");
});

test("the caution step-aside needs the card's other slot to really apply; TEXT LARGER grows the ERS bar", () => {
  const rules = cssRules(read("css/hud.css"));
  const caution = rules.filter((r) => /:has\(#hud-flag:not\(\[hidden\]\)\) #announce$/.test(r.selector));
  assert.equal(caution.length, 2, "base and compact caution rules");
  for (const r of caution) assert.match(r.selector, /:not\(\.hud-mirror-on\.hud-mirror-side\)/, r.selector);
  const tok = read("css/tokens.css");
  for (const size of ["large", "larger"]) {
    const fs = +new RegExp(`:root\\[data-text-size="${size}"\\] \\{[^}]*--fs-micro: (\\d+)px`).exec(tok)[1];
    const sel = ':root:is([data-text-size="large"], [data-text-size="larger"])';
    const mh = /^calc\(var\(--fs-micro\) \* ([\d.]+) \+ (\d+)px\)$/.exec(decl(rules, sel + " #hud-energy", "min-height"));
    const lh = +decl(rules, sel + " .hud-energy-label", "line-height");
    assert.ok(mh && lh, "both rules present");
    assert.ok(fs * +mh[1] + +mh[2] - 2 >= fs * lh, `${size}: the bar's inner height holds one ${fs}px label line`);
  }
});
