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

// A 2D context that accepts every call and every property write.
function ctx2d() {
  const store = {};
  return new Proxy({}, {
    get: (_, k) => (k in store ? store[k] : () => {}),
    set: (_, k, v) => { store[k] = v; return true; },
  });
}

function boot(opts = {}) {
  const dom = makeDom();
  const rawCreate = dom.document.createElement;
  dom.document.createElement = (tag) => {
    const el = rawCreate(tag);
    if (String(tag).toLowerCase() === "canvas") el.getContext = () => ctx2d();
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
    TrackMaps: { drsZones: () => [] },
  };
  sb.window = sb;
  vm.runInNewContext(src("js/game/hud.js"), sb, { filename: "js/game/hud.js" });

  const $ = (id) => dom.byId(id);
  const minimap = $("minimap");
  minimap.getContext = () => ctx2d();
  const els = {
    pos: $("hud-pos"), lap: $("hud-lap"), time: $("hud-time"), best: $("hud-best"),
    speed: $("hud-speed-n"), energy: $("hud-energy-fill"), ot: $("hud-ot"), aero: $("hud-aero"),
    gapA: $("hud-gap-ahead"), gapB: $("hud-gap-behind"), hudSectors: $("hud-sectors"),
    flag: $("hud-flag"), minimap, gear: $("hud-gear"), rpmFill: $("hud-rpm-fill"), tach: $("hud-tach"),
  };
  const player = {
    team: { id: "t1", color: [1, 0, 0] }, code: "YOU", rank: 1, lap: 1, lapTime: 12, best: Infinity,
    speed: 50, energy: 0.5, gear: 3, rpm: IDLE_RPM, boostOn: false,
    otT: 0, otArmed: false, otCool: 0, aeroX: 0, xArmed: false, s: 10, prog: 10, retired: false,
  };
  const G = {
    els, player, cars: [player], ranked: [player], timeTrial: false, state: "race",
    lapsTarget: 5, track: { map: [[0, 0], [0.5, 0.5], [1, 1]], total: 100, def: {} },
    sectorLast: [null, null, null], sectorBests: [Infinity, Infinity, Infinity],
    aeroZones: [{}], ttRecord: Infinity,
    fmtTime: (t) => (isFinite(t) && t > 0 ? t.toFixed(2) : "-"),
    dashKph: (v) => v * 3.6, vTop: () => 90, otEnabled: () => true,
    cssCol: () => "#f00",
  };
  const hud = sb.GameHud.create(G);
  return { dom, els, player, G, tick: () => hud.updateHud(true) };
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

test("the OVERTAKE chip spells all four states differently — the lockout counts down", () => {
  const { els, player, G, tick } = boot();
  tick();
  assert.equal(els.ot.textContent, "OVERTAKE");
  assert.equal(els.ot.className, "ot-off");

  player.otCool = 11.2; tick();
  assert.equal(els.ot.className, "ot-cool");
  assert.equal(els.ot.textContent, "COOLDOWN 12", "whole seconds — this is a 9..14 s wait, not a tenths readout");
  player.otCool = 0.3; tick();
  assert.equal(els.ot.textContent, "COOLDOWN 1");

  player.otCool = 0; player.otArmed = true; tick();
  assert.equal(els.ot.className, "ot-armed");
  assert.equal(els.ot.textContent, "OVERTAKE");

  player.otT = 3.2; player.otCool = 12.2; tick();
  assert.equal(els.ot.className, "ot-active");
  assert.equal(els.ot.textContent, "OVERTAKE 3.2", "the push keeps its tenths and never reads as a cooldown while active");

  player.otT = 0; player.otArmed = false; G.otEnabled = () => false; tick();
  assert.equal(els.ot.textContent, "NO OVERTAKE", "the race-wide gate still wins over a cooldown");
});

test("sector splits carry the banner's ▼/▲ against sectorBests, lime on a personal best", () => {
  const { els, G, tick } = boot();
  tick();
  const vals = els.hudSectors.children.map((row) => row.children[1]);
  assert.equal(vals.length, 3);
  assert.deepEqual(vals.map((v) => v.textContent), ["--", "--", "--"], "no split yet: placeholders, no arrow");

  // A first-ever lap: every split IS the best, and game.js writes the best in
  // the same crossing that writes the split.
  G.sectorLast[0] = 28.431; G.sectorBests[0] = 28.431; tick();
  assert.equal(vals[0].textContent, "▼28.431");
  assert.equal(vals[0].style.color, "#a3e635", "a PB reads in the HUD's existing faster-than colour");
  assert.equal(vals[1].textContent, "--");

  // Next lap, slower: the arrow flips and the colour drops back to the row's own.
  G.sectorLast[0] = 28.9; tick();
  assert.equal(vals[0].textContent, "▲28.900");
  assert.equal(vals[0].style.color, "", "slower: no inline colour, the .sec-val rule shows through");

  // A slower lap NEVER lowers sectorBests, so a later equal-to-best split is a PB again.
  G.sectorLast[0] = 28.431; tick();
  assert.equal(vals[0].textContent, "▼28.431");
});

test("the speed digits, energy bar and sector red are set up to be read at a glance", () => {
  const rules = cssRules(read("css/hud.css"));
  assert.equal(decl(rules, "#hud-speed-n", "min-width"), "3ch", "three tabular digits: 99 -> 100 must not move the figure");
  assert.equal(decl(rules, "#hud-speed-n", "text-align"), "right", "the units digit stays put");
  assert.equal(decl(rules, "#hud-speed-n", "display"), "inline-block", "min-width needs a box on the inline span");

  assert.match(decl(rules, "#hud-energy", "background") || "", /^var\(--/, "the bar has a plate under its empty half, from a token");
  assert.equal(decl(rules, ".hud-energy-label", "color"), "var(--text)", "light ink reads over the plate AND the fill");
  assert.match(decl(rules, ".hud-energy-label", "text-shadow") || "", /rgba\(0,0,0,0\.9\)/, "with the HUD's dark halo behind it");

  // Contrast: the brand red is a fill colour, not an ink for 12–14px text
  // (css/tokens.css measures it at ~2.6:1 on the page). No HUD text may use it.
  const hud = read("js/game/hud.js").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(hud, /#e10600/i, "hud.js writes no text in the brand red");
  assert.match(hud, /"#ff3b30"/, "the S2 label / ghost delta use the AA text red");
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
  const narrow = boot({ innerWidth: 500 });          // ratio 500 <= GAP_DROP_AT.narrow (600)
  narrow.G.timeTrial = true; narrow.tick();
  assert.equal(narrow.dom.documentElement.dataset.gapDrop, "1",
    "a time trial on a narrow phone drops the widget below .hud-top like a race does");
  const wide = boot({ innerWidth: 1280 });
  wide.dom.documentElement.dataset.gapDrop = "1";    // inherited from a narrow race
  wide.G.timeTrial = true; wide.tick();
  assert.equal("gapDrop" in wide.dom.documentElement.dataset, false,
    "and a wide time trial clears a drop the previous session left behind");
});

test("phone HUD 150% is under the narrow DROP floor so the chip leaves the POS slot", () => {
  // Measured Chromium 2026-09-03: 852×393 @150% → ratio 568, slot 69 vs chip 62,
  // clashTop true while DROP_AT was 550. Floor is 600 so that cell drops.
  const src = read("js/game/hud.js");
  const m = src.match(/GAP_DROP_AT\s*=\s*\{\s*narrow:\s*(\d+)/);
  assert.ok(m, "GAP_DROP_AT.narrow is declared");
  assert.ok(Number(m[1]) >= 600, `narrow drop floor ${m[1]} must be ≥ 600 (852@150% ratio 568)`);
  assert.match(src, /slot < gapsR\.width \+ FIT_AIR/,
    "fitHud also force-drops when the measured between-slot is smaller than the chip");
});

test("the ahead gap slot keeps one line so the behind line never jumps when the leader has nobody ahead", () => {
  const hud = cssRules(read("css/hud.css"));
  assert.equal(decl(hud, ".hud-gaps > div:first-child", "min-height"), "1.3em",
    "measured: the container was 2px with the ahead line empty and 17.6px filled (headless, 2026-09-02)");
});

test("the dropped gap chip docks under the minimap, not in the POS/flag band", () => {
  // The old drop was top:62px / same 130px left as the beside-slot. That kept
  // the chip in the centred POS row's horizontal band and under `#hud-flag`
  // (top 100px) on a short phone at HUD ≥150% (ARCHITECTURE-REVIEW item F).
  const hud = cssRules(read("css/hud.css"));
  const wide = cssRules(read("css/responsive.css"));
  assert.equal(decl(hud, ":root[data-gap-drop] .hud-gaps", "left"),
    "calc(10px + var(--sal) / var(--hud-z))",
    "same left as #minimap, not the beside-slot 130px");
  assert.match(decl(hud, ":root[data-gap-drop] .hud-gaps", "top") || "",
    /var\(--hud-map/,
    "8px + map + 8px via --hud-map (compact/wide only change the token)");
  assert.match(decl(hud, ":root[data-gap-drop] .hud-gaps", "max-width") || "",
    /var\(--hud-map/,
    "cannot grow past the map into POS or the flag");
  assert.match(decl(hud, "body[data-density=\"compact\"] #minimap", "--hud-map") ||
    decl(hud, "body[data-density=\"compact\"] #minimap", "width") || "",
    /96px|var\(--hud-map\)/,
    "compact map is 96px via --hud-map");
  assert.match(decl(wide, "#minimap", "--hud-map") || "", /140px/,
    "wide map is 140px via --hud-map");
});

