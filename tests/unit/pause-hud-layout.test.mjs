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
  assert.match(css, /body:has\(#pmsettings:not\(\[hidden\]\)\)\s*:is\(/);
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
