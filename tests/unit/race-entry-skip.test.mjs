/* SKIP WHEN READY (Bryce 2026-11-25: "Those waits were designed for the game building and processes in the
 * background so keep what's needed but provide skips when ready"). The garage drive-out and the flyby stay as the
 * race's loading cover; a SKIP (#ld-skip, plus any tap, key or pad press) is offered on both only once the build,
 * its warm and introPrepare are done, and it goes straight to the start. Before ready a press is ignored, not
 * latched. Also the hunt's instrumentation rows #4/#5: the drive-out is a sibling of introBuild, and the
 * studioShown mark splits studioDone into studioWait (loading) and driveOut (playback).
 *
 * Run: node --test tests/unit/race-entry-skip.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";
import { withM4 } from "../helpers/mat4-vm.mjs";
import { gameSource, GAME_REL } from "../helpers/game-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function stubEl(extra = {}) {
  const props = { dataset: {}, style: { setProperty(k, v) { this[k] = v; } }, hidden: true, offsetWidth: 0, ...extra };
  return new Proxy(props, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === Symbol.toPrimitive || k === "then") return undefined;
      return () => stubEl();
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function boot() {
  const els = new Map(), listeners = {}, stored = { flySkips: 0 }, made = [];
  let now = 10000;
  const $ = (id) => { if (!els.has(id)) els.set(id, stubEl()); return els.get(id); };
  const sb = { Math, JSON, Object, Array, Number, String, isFinite, console, Date: { now: () => now },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    addEventListener(type, fn) { (listeners[type] = listeners[type] || new Set()).add(fn); },
    removeEventListener(type, fn) { if (listeners[type]) listeners[type].delete(fn); },
    document: { getElementById: $, createElement: () => { const b = stubEl(); made.push(b); return b; }, documentElement: stubEl() },
    navigator: { getGamepads: () => [] }, matchMedia: () => ({ matches: false }), Log: { info() {}, warn() {} } };
  sb.window = sb;
  vm.runInNewContext(read("js/ui/loading-card.js").replace(/^const\b/gm, "var"), sb, { filename: absSrc("js/ui/loading-card.js") });
  withM4(sb);
  vm.runInNewContext(read("js/ui/loading-screen.js").replace(/^const\b/gm, "var"), sb, { filename: absSrc("js/ui/loading-screen.js") });
  const store = { get: (k, d) => (k in stored ? stored[k] : d), set: (k, v) => { stored[k] = v; } };
  const screen = sb.LoadingScreen.create({ $, store, Tracks: { LIST: [] }, TrackMaps: { corners: () => [] }, Flags: { svg: () => "" } });
  const press = () => { for (const fn of [...(listeners.pointerdown || [])]) fn({ type: "pointerdown", cancelable: true, preventDefault() {}, stopPropagation() {} }); };
  return { screen, stored, press, tick: (ms) => { now += ms; }, btn: () => made.find((b) => b.id === "ld-skip") };
}
const info = { track: { name: "Monza", country: "Italy", id: "monza" }, session: "race" };

test("the garage takes no skip before the race is ready; once ready(), SKIP shows and a press goes on", () => {
  const h = boot();
  let skipped = 0;
  h.screen.garage(info, () => { skipped++; }, false);
  h.tick(1000); h.press();
  assert.equal(skipped, 0, "before ready a press is ignored (not latched)");
  assert.ok(!h.btn() || h.btn().hidden, "and no SKIP is shown");
  assert.equal(h.screen.skipReady(), false);
  h.screen.ready();
  assert.equal(h.screen.skipReady(), true);
  assert.equal(h.btn().hidden, false, "SKIP appears the moment the race is ready");
  assert.equal(h.btn().textContent, "SKIP TO RACE");
  let writes = 0; const b = h.btn(); let t = b.textContent;
  Object.defineProperty(b, "textContent", { get: () => t, set: (v) => { writes++; t = v; } });
  h.screen.ready(); h.screen.ready();
  assert.equal(writes, 0, "the label is written only when it changes: the live region does not re-announce it");
  h.press();
  assert.equal(skipped, 1, "a press after ready skips");
  assert.equal(h.stored.flySkips, 1, "a garage skip skips the flyby too, so the habitual-skipper streak counts it");
  h.press();
  assert.equal(skipped, 1, "once per run");
});

test("a garage opened ready offers SKIP at once (introBuild: preparation settled before the drive-out); named for the session", () => {
  const h = boot();
  let skipped = 0;
  h.screen.garage({ ...info, session: "tt" }, () => { skipped++; }, true);
  assert.equal(h.btn().hidden, false);
  assert.equal(h.btn().textContent, "SKIP TO TIME TRIAL", "names the session, as the garage's own skip does (#6390)");
  h.press();
  assert.equal(skipped, 0, "SKIP_GRACE_MS: the second click of the START double-click is not a skip");
  h.tick(500); h.press();
  assert.equal(skipped, 1);
  h.screen.stop();
  assert.equal(h.btn().hidden, true, "stop() hides SKIP");
  assert.equal(h.screen.skipReady(), false, "and forgets readiness for the next run");
});

test("the flyby shows SKIP for its whole run (it is always after ready); the prep cover shows none", () => {
  const h = boot();
  h.screen.prep(info);
  assert.ok(!h.btn() || h.btn().hidden, "prep is preparation: no skip");
  h.press();
  let went = 0;
  h.screen.run({ ...info, hasWorld: true }, () => { went++; });
  assert.equal(h.btn().hidden, false, "the flyby offers SKIP");
  h.tick(500); h.press();
  assert.equal(went, 1, "a skip in the flyby starts the race");
});

test("game.js: studioReady offers the skip at once when the garage is up, else on its first frame; every path calls it", () => {
  const game = gameSource();
  const body = (name) => game.slice(game.indexOf("function " + name + "("), game.indexOf("\n}\n", game.indexOf("function " + name + "(")) + 3);
  let offered = 0;
  const c = { _studio: null, loadingScreen: { ready: () => { offered++; } } };
  vm.createContext(c); vm.runInContext(body("studioReady"), c, { filename: absSrc(GAME_REL) });
  c.studioReady(1);
  assert.equal(offered, 0, "no studio: nothing to offer");
  c._studio = { n: 1, cardUp: true }; c.studioReady(2);
  assert.equal(c._studio.ready, undefined, "another run's readiness is not this one's");
  c.studioReady(1);
  assert.equal(c._studio.ready, true); assert.equal(offered, 0, "under the cover: studioShown passes it to garage()");
  c._studio = { n: 3, cardUp: false }; c.studioReady(3);
  assert.equal(offered, 1, "the garage is already showing: SKIP now");
  for (const name of ["introGarage", "introWarm", "introBuild", "raceIntro"]) assert.ok(body(name).includes("studioReady(n)"), name + " marks its run ready");
});

test("introBuild's span closes before the drive-out: studioDone is its sibling, not its child (hunt row #4)", async () => {
  const game = gameSource();
  const b = game.slice(game.indexOf("function introBuild(go)"), game.indexOf("function introWarm(go)"));
  const spanEnd = b.indexOf("      });\n", b.indexOf('spanAsync("introBuild"'));
  assert.ok(spanEnd > 0 && b.indexOf("studioOpen(n, info0)") > spanEnd, "studioOpen runs after the introBuild span ends");
  assert.ok(b.indexOf('spanAsync("studioDone"') > spanEnd);
});

test("studioShown splits studioDone into studioWait and driveOut in raceEntryStages (hunt row #5)", () => {
  const sb = { console, performance: { now: () => 0 } };
  sb.globalThis = sb; sb.window = sb;
  vm.runInNewContext(read("js/perf/race-entry-profile.js").replace(/^const\b/m, "var"), sb, { filename: absSrc("js/perf/race-entry-profile.js") });
  const P = sb.RaceEntryProfile;
  const marks = [[0, "introBuild:start"], [900, "introBuild:end"], [900, "studioOpen:start"], [905, "studioDone:start"],
    [2100, "studioShown"], [12700, "studioDone:end"], [12700, "studioOpen:end"], [12710, "flyby:start"], [32710, "flyby:end"]].map(([t, n]) => ({ n, t }));
  const rows = P.stagesFromSnapshot({ legs: [], marks });
  const row = (n) => rows.find((r) => r.n === n);
  assert.equal(row("introBuild").ms, 900, "introBuild is the build alone");
  assert.equal(row("studioWait").ms, 1195, "the wait for the garage's first frame: loading");
  assert.equal(row("driveOut").ms, 10600, "the drive-out's playback: cinematic");
  assert.equal(row("studioDone").selfMs, 0, "studioDone is exactly its two halves");
  assert.equal(row("introBuild").selfMs, 900, "nothing of the drive-out inside introBuild");
  const noShown = P.stagesFromSnapshot({ legs: [], marks: marks.filter((m) => m.n !== "studioShown") });
  assert.equal(noShown.some((r) => r.n === "driveOut"), false, "no mark (a run cancelled under the cover): no split");
});
