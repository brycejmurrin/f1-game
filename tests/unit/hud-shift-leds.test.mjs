/* hud-shift-leds.test.mjs — the shift-light LED strip and gear-digit pop (#7096, #6543 I2, D-053).
 *
 * GameHud.shiftLeds maps revs to lit segments: dark to 80 % of MAX_RPM, full at
 * the 92 % shift point, flashing while the redline latch holds. paintInstruments
 * builds the strip into #hud-tach and pops the gear digit on a shift — never
 * while Reduce Motion is on. hud.js runs in a VM on tests/helpers/mini-dom.mjs,
 * the same harness shape as hud-feel.test.mjs; the CSS is read as rules.
 *
 * Run: node --test tests/unit/hud-shift-leds.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";
import { cssRules } from "../helpers/css-rules.mjs";
import { absSrc } from "../helpers/abs-src.mjs";
import { loadDom } from "../helpers/dom-vm.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");
const src = (p) => read(p).replace(/^const\b/gm, "var");
const IDLE_RPM = 5000, MAX_RPM = 15000;

function boot(extra = {}) {
  const dom = makeDom();
  const ctx = () => new Proxy({}, { get: () => () => {}, set: () => true });
  const rawCreate = dom.document.createElement;
  dom.document.createElement = (tag) => {
    const el = rawCreate(tag);
    if (String(tag).toLowerCase() === "canvas") el.getContext = ctx;
    return el;
  };
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, WeakMap, WeakSet, RegExp, Date, parseFloat, parseInt, isFinite, Infinity,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: dom.document, innerWidth: 852, innerHeight: 393, devicePixelRatio: 3,
    M4: { clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)) },
    PhysicsConsts: { IDLE_RPM, MAX_RPM },
    Ghost: { hasGhost: () => false, timeAt: () => null, at: () => null },
    GhostShare: { hasGuest: () => false, timeAt: () => null, at: () => null },
    TrackMaps: { drsZones: () => [], sectorColors: () => ["#ffd700", "#c0c0c0", "#cd9b5a"], drawStartFinish() {}, drawCarMarker() {} },
    setTimeout: () => 0, clearTimeout: () => {}, performance: { now: () => 1000 },
    ...extra,
  };
  sb.window = sb;
  loadDom(sb);
  for (const f of ["js/ui/live-region.js", "js/ui/hud-skin.js", "js/ui/hud-minimap.js", "js/ui/hud-radio-lane.js", "js/ui/hud-readouts.js", "js/ui/hud.js", "js/race/overtake-mode.js"]) {
    vm.runInNewContext(src(f), sb, { filename: absSrc(f) });
  }
  const $ = (id) => dom.byId(id);
  $("minimap").getContext = ctx;
  const els = {
    pos: $("hud-pos"), lap: $("hud-lap"), time: $("hud-time"), best: $("hud-best"),
    speed: $("hud-speed-n"), energy: $("hud-energy-fill"), ot: $("hud-ot"), aero: $("hud-aero"),
    btnOT: $("btn-ot"), btnAero: $("btn-aero"), btnBoost: $("btn-boost"),
    gapA: $("hud-gap-ahead"), gapB: $("hud-gap-behind"), hudSectors: $("hud-sectors"),
    flag: $("hud-flag"), minimap: $("minimap"), gear: $("hud-gear"), rpmFill: $("hud-rpm-fill"), tach: $("hud-tach"),
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
    dashKph: (v) => v * 3.6, vTop: () => 90, otEnabled: () => true, cssCol: () => "#f00",
  };
  const hud = sb.GameHud.create(G);
  return { sb, els, player, hud, tick: () => hud.updateHud(true) };
}

test("segments stay dark to 80 % RPM, fill one per step to the shift point, and flash there", () => {
  const { sb } = boot();
  const leds = (f, latched = false) => sb.GameHud.shiftLeds(MAX_RPM * f, latched);
  assert.deepEqual({ ...leds(0.5) }, { lit: 0, flash: false });
  assert.equal(leds(0.80).lit, 0, "80 % exactly: still dark");
  assert.equal(leds(0.801).lit, 1, "the first segment lights just past 80 %");
  assert.equal(leds(0.86).lit, 5, "half way to 92 %: half the strip");
  assert.equal(leds(0.919).lit, 10, "just under the shift point: full, not yet flashing");
  assert.equal(leds(0.919).flash, false);
  assert.deepEqual({ ...leds(0.93, true) }, { lit: 10, flash: true }, "the redline latch is the shift point");
  let prev = 0;
  for (let f = 0.7; f <= 0.92; f += 0.001) { const n = leds(f).lit; assert.ok(n >= prev && n <= 10, `monotonic at ${f}`); prev = n; }
});

test("paintInstruments builds ten LEDs in #hud-tach and drives them from the redline latch", () => {
  const { els, player, tick } = boot();
  player.rpm = MAX_RPM * 0.86; tick();
  const strip = els.tach.children.find((c) => String(c.tagName).toLowerCase() === "b");
  assert.ok(strip, "the strip is built inside #hud-tach");
  assert.equal(strip.getAttribute("aria-hidden"), "true");
  const on = () => strip.children.filter((c) => c.classList.contains("on")).length;
  assert.equal(strip.children.length, 10);
  assert.equal(on(), 5);
  assert.equal(("flash" in strip.dataset), false);
  player.rpm = MAX_RPM * 0.93; tick();
  assert.equal(on(), 10); assert.equal(("flash" in strip.dataset), true, "flashes at the shift point");
  player.rpm = MAX_RPM * 0.905; tick();
  assert.equal(("flash" in strip.dataset), true, "holds through the latch's hysteresis band");
  player.rpm = MAX_RPM * 0.7; tick();
  assert.equal(on(), 0); assert.equal(("flash" in strip.dataset), false);
});

test("the gear digit pops on a shift, not on the first paint, and never under Reduce Motion", () => {
  const popped = (els) => els.gear.dataset.pop;
  const a = boot();
  a.tick(); assert.equal(popped(a.els), undefined, "the first paint is not a shift");
  a.player.gear = 4; a.tick(); assert.equal(popped(a.els), "a", "upshift pops");
  a.player.gear = 5; a.tick(); assert.equal(popped(a.els), "b", "the next shift swaps keyframe name, restarting the pop");
  a.hud.resetRace(); a.player.gear = 1; a.tick();
  assert.equal(a.els.gear.textContent, "1"); assert.equal(popped(a.els), "b", "a new race: its first gear does not pop");

  // A shift while the chip is hidden (cockpit-cam) is not a pop on the way back.
  const c = boot(); c.tick(); c.player.gear = 4; c.tick();
  c.els.gear.dataset.pop = "seen";
  c.sb.document.body.classList.add("cockpit-cam"); c.player.gear = 6; c.tick();
  c.sb.document.body.classList.remove("cockpit-cam"); c.tick();
  assert.equal(c.els.gear.textContent, "6");
  assert.equal(popped(c.els), "seen", "no pop for a shift made while the chip was hidden");

  const r = boot({ TitleFx: { mode: () => "reduce" } });
  r.tick(); r.player.gear = 4; r.tick(); r.player.gear = 5; r.tick();
  assert.equal(r.els.gear.textContent, "5", "the digit still changes");
  assert.equal(popped(r.els), undefined, "Reduce Motion: no pop at all");
});

test("CSS: LED segments are at least 4 px tall on the smallest tach, and the motion is reduce-aware", () => {
  const rules = cssRules(read("css/hud.css"));
  const strip = rules.find((r) => r.selector === "#hud-tach > b" && !r.context.some((c) => c.startsWith("@media")));
  assert.ok(strip, "#hud-tach > b rule");
  const h = strip.decls.get("height");
  const m = /^max\((\d+)px, (\d+)%\)$/.exec(h);
  assert.ok(m, `height is max(Npx, P%): ${h}`);
  assert.ok(+m[1] >= 4, "a 4 px floor");
  // The smallest tach height any sheet sets (the 852×393 phone gets 13 px from css/touch-controls.css).
  const heights = ["css/hud.css", "css/touch-controls.css", "css/overlays.css"]
    .flatMap((f) => cssRules(read(f)).filter((r) => /#hud-tach\b/.test(r.selector) && r.decls.get("height")))
    .map((r) => parseFloat(r.decls.get("height"))).filter(Number.isFinite);
  assert.ok(heights.length >= 2 && Math.min(...heights) >= 10, `tach heights ${heights}`);
  assert.ok(Math.min(...heights) * (+m[2] / 100) - 1 >= 4, "the percent alone clears 4 px inside the 1 px inset");
  const reduce = rules.filter((r) => r.context.some((c) => /prefers-reduced-motion: reduce/.test(c)));
  assert.ok(reduce.some((r) => r.selector.includes("#hud-tach > b[data-flash] > i") && r.decls.get("animation") === "none"),
    "the flash stops under the OS query");
  const pop = rules.filter((r) => /data-pop/.test(r.selector) && r.decls.get("animation"));
  assert.ok(pop.length && pop.every((r) => r.context.some((c) => /prefers-reduced-motion: no-preference/.test(c))),
    "the pop runs only for no-preference");
});
