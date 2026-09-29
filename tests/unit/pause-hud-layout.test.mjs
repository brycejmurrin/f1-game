import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("driving warnings survive camera changes while quiet views suppress optional tips", () => {
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const priorities = game.match(/const ANN_PRI = [^;]+;/)[0];
  const announce = game.match(/function announce\([^]*?\n\}/)[0];
  for (const id of ["chase", "cockpit", "heli", "side", "cinematic", "low", "overhead"]) {
    const shown = [];
    const ctx = vm.createContext({ hudProfile: "standard", CAM_MODES: [{ id }], camMode: 0,
      announceT: 0, _annPri: 0, _annQueue: null, showAnnounce: (...args) => shown.push(args) });
    vm.runInContext(priorities + "\n" + announce, ctx);
    for (const kind of ["warning", "penalty-warn", "penalty-hit", "race"]) {
      ctx.kind = kind;
      vm.runInContext('announce("driver message", 2, kind)', ctx);
      assert.equal(shown.at(-1)?.[2], kind, `${id} preserves ${kind}`);
    }
    shown.length = 0;
    vm.runInContext('announce("optional tip", 2, "coach")', ctx);
    assert.equal(shown.length, ["chase", "cockpit"].includes(id) ? 1 : 0);
    ctx.hudProfile = "broadcast";
    vm.runInContext('announce("optional tip", 2, "coach")', ctx);
    assert.equal(shown.at(-1)?.[2], "coach", "broadcast keeps its optional tips");
  }
});

test("any open screen hides race HUD chrome, DISPLAY keeps the live tower", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/hud.css"), "utf8");
  // Career / select / garage / datahub are `.screen` without `.dim`; gating
  // on dim + in-race left POS/LAP/CHASE reading through those scrims.
  assert.match(css, /body:has\(\.screen:not\(\[hidden\]\)\)\s*:is\(/);
  assert.doesNotMatch(css, /body\.in-race:has\(\.screen\.dim:not\(\[hidden\]\)\)\s*:is\(/);
  assert.match(css, /\.hud-bottom/);
  assert.match(css, /\.hud-top/);
  assert.match(css, /#btn-cam/);
  assert.match(css, /\.dock/);
  assert.match(css, /body:has\(#pmsettings:not\(\[hidden\]\) #pm-panel-display:not\(\[hidden\]\)\)\s*:is\(/);
  assert.doesNotMatch(css, /body:has\(#pmsettings:not\(\[hidden\]\)\)\s*:is\(/);
});

test("garage camera stack hides under a dim overlay, not under garage itself", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/carsetup.css"), "utf8");
  assert.match(css, /body:has\(\.screen\.dim:not\(\[hidden\]\)\)\s*#cs-stack/);
  assert.match(css, /visibility:\s*hidden/);
});

test("compact pause stack tightens without changing type tokens", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/components.css"), "utf8");
  assert.match(css, /#pausemenu\s+\.sheet\[data-density="compact"\]\s+\.stack/);
  // max(36px, --tap-min), not a bare 36px: the 36 floor is the compact tighten
  // this test guards; the --tap-min arm only wins below 100% UI SIZE, where a
  // flat 36 local px painted RESUME at 14-18px (2026-08-21 sweep, pause @40).
  assert.match(css, /#pausemenu\s+\.sheet\[data-density="compact"\]\s+\.stack\s+button[^}]*min-height:\s*max\(36px,\s*var\(--tap-min\)\)/);
});

test("a queued INFO card older than ANN_STALE_MS is dropped at the drain; a warning never is", () => {
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const priorities = game.match(/const ANN_PRI = [^;]+;/)[0];
  const stale = game.match(/const ANN_STALE_MS = [^;]+;/)[0];
  const qmax = game.match(/const ANN_QUEUE_MAX = [^;]+;/)[0];
  const announce = game.match(/function announce\([^]*?\n\}/)[0];
  const drain = game.match(/ {6}while \(_annQueue\.length\) \{\n[\s\S]*?showAnnounce\(q\.msg, q\.dur, q\.kind\); break;\n {6}\}/)[0];
  let now = 0;
  const shown = [];
  const ctx = vm.createContext({ hudProfile: "broadcast", CAM_MODES: [{ id: "chase" }], camMode: 0,
    announceT: 5, _annPri: 5, _annFloor: 3, _annQueue: [], performance: { now: () => now },
    showAnnounce: (...args) => shown.push(args) });
  vm.runInContext(priorities + "\n" + stale + "\n" + qmax + "\n" + announce + "\nfunction drain(){\n" + drain + "\n}", ctx);
  vm.runInContext('announce("UP TO P5", 2, "info"); announce("TRACK LIMITS", 2, "warning")', ctx);
  now = 9000;   // a burst held the card on screen past ANN_STALE_MS
  vm.runInContext("drain()", ctx);
  assert.deepEqual(shown.map((s) => s[0]), ["TRACK LIMITS"], "the warning plays; the stale position call is dropped");
  vm.runInContext("drain()", ctx);
  assert.equal(shown.length, 1, "UP TO P5 never reads out 9 s late");
  now = 0; shown.length = 0; ctx._annQueue.length = 0;
  vm.runInContext('announce("TYRES AT 50%", 2, "info")', ctx);
  now = 3000;
  vm.runInContext("drain()", ctx);
  assert.deepEqual(shown.map((s) => s[0]), ["TYRES AT 50%"], "a fresh info card still plays");
});

test("losing focus while visible pauses a solo race; an iOS audio interruption does too; neither in a friend race", () => {
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const blur = game.match(/window\.addEventListener\("blur", \(\) => \{[\s\S]*?\n\}\);/)[0];
  assert.match(blur, /document\.hidden \|\| document\.hasFocus\(\) \|\| navigator\.webdriver \|\| netPlay\.active\(\)/, "settled, visible-only, never under automation or in MP");
  assert.match(blur, /if \(state === "race" \|\| state === "count"\) setPaused\(true, "blur"\);/);
  assert.match(game, /GameAudio\.onInterrupted\(\(\) => \{\s*if \(\(state === "race" \|\| state === "count"\) && !netPlay\.active\(\)\) setPaused\(true, "audio-interrupted"\);/);
  const eng = fs.readFileSync(path.join(ROOT, "js/audio/engine.js"), "utf8");
  assert.match(eng, /ctx\.state === "interrupted" && _onInterrupted/);
});

test("a context lost within 3 s of becoming visible is iOS's late-reported BACKGROUND loss on every backend", () => {
  for (const f of ["js/render/glx/glx.js", "js/render/three/tlx.js", "js/render/webgpu/wgx.js"]) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    // pageshow fires on the FIRST load too; only a bfcache restore (persisted)
    // is a return. Unconditional, a real crash in the first 3 s after boot
    // was read as a background loss: uncounted reload, nothing latched.
    assert.match(src, /addEventListener\("pageshow", function \(e\) \{ if \(e && e\.persisted\) _shownAt = _nowMs\(\); \}\)/, f + " tracks when the page came back from the bfcache");
    assert.doesNotMatch(src, /addEventListener\("pageshow", function \(\) \{ _shownAt/, f + " must not treat the initial load as a return");
    assert.match(src, /_nowMs\(\) - _shownAt < 3000/, f + " treats a loss inside that window as the background loss");
  }
});
