// pause-key-tools — the pause key (P / gamepad Start) with a TOOL open from the
// pause menu. The garage arrival tuner, the photo studio and the Spotify panel
// each hide the pause and settings sheets and put up their own layer; the pause
// key used to see neither sheet and UNPAUSE, leaving the tool over a running
// race (driving input gated behind it, the car coasting, #garrival's lt-open
// hiding the pause button), and its close door then reopened SETTINGS over a
// race that was not paused. Now it presses the top layer's own Escape door,
// as Escape does. The real onPause body from js/ui/platform-session.js, run in
// a vm against stubs. Under a second.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/platform-session.js"), "utf8");

function onPauseBody() {
  const open = "Input.init(canvas, { onPause: () => {";
  const i = SRC.indexOf(open);
  assert.ok(i >= 0, "the pause handler is where this test expects it");
  const end = SRC.indexOf("\n  setPaused(!G.paused, \"key\");\n},", i);
  assert.ok(end > i, "…and ends with the plain toggle");
  return SRC.slice(i + open.length, end) + "\n  setPaused(!G.paused, \"key\");";
}

function rig({ paused = true, top = null } = {}) {
  const clicks = [], toggles = [];
  const el = (id, extra = {}) => ({ id, hidden: true, dataset: {}, ...extra });
  const els = { howtoplay: el("howtoplay"), pmsettings: el("pmsettings"), pausemenu: el("pausemenu", { hidden: false }) };
  const doors = { "ga-close": { click: () => clicks.push("ga-close") }, "ps-close": { click: () => clicks.push("ps-close") }, "sp-close": { click: () => clicks.push("sp-close") } };
  const ctx = {
    G: { paused }, els,
    UiLayers: { top: () => (top === "pausemenu" ? els.pausemenu : top === "pmsettings" ? els.pmsettings : top) },
    document: { getElementById: (id) => doors[id] || null },
    setPaused: (p, why) => toggles.push([p, why]),
    settingsBack: () => true, closeSettings: () => clicks.push("closeSettings"),
  };
  vm.createContext(ctx);
  const fn = vm.runInContext("(function onPause() {" + onPauseBody() + "\n})", ctx);
  return { fn, clicks, toggles, els };
}

for (const [layer, door] of [["garrival", "ga-close"], ["photo-studio", "ps-close"], ["spotifypanel", "sp-close"]]) {
  test(`paused with #${layer} on top: the pause key closes the tool (${door}), the race stays paused`, () => {
    const r = rig({ top: { id: layer, dataset: { escClose: door } } });
    r.fn();
    assert.deepEqual(r.clicks, [door]);
    assert.deepEqual(r.toggles, [], "no unpause under an open tool");
  });
}

test("the pause menu itself on top: the key resumes, as before", () => {
  const r = rig({ top: "pausemenu" });
  r.fn();
  assert.deepEqual(r.toggles, [[false, "key"]]);
  assert.deepEqual(r.clicks, []);
});

test("settings on top keeps its own BACK path", () => {
  const r = rig({ top: "pmsettings" });
  r.els.pmsettings.hidden = false;
  r.fn();
  assert.deepEqual(r.clicks, ["closeSettings"]);
  assert.deepEqual(r.toggles, []);
});

test("racing (not paused): the key pauses, whatever layer the DOM reports", () => {
  const r = rig({ paused: false, top: { id: "garrival", dataset: { escClose: "ga-close" } } });
  r.fn();
  assert.deepEqual(r.toggles, [[true, "key"]]);
  assert.deepEqual(r.clicks, []);
});

test("a layer with no Escape door falls through to the toggle", () => {
  const r = rig({ top: { id: "overlay", dataset: {} } });
  r.fn();
  assert.deepEqual(r.toggles, [[false, "key"]]);
});
