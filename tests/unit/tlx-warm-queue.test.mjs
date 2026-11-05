/* #4958 — TLX warm() must not DROP a request while a warm is in flight. game.js warmPrograms records the key in
 * _warmed before it calls gfx.warm(), so a dropped "|lit" (a dark circuit's lamp-baked second warm, requested from
 * menuFinish while the first is still compiling on a slow GPU) was counted done and race entry skipped it
 * (race-entry-profile warm:skipped-menu): its programs compiled on the first race frames (~1.2 s each on iPhone 14,
 * docs/notes/MIRROR-WARM-2026-10-24.md). The REAL warm()/cancelWarmRetry() and _promoteQueuedWarm source, with
 * present()'s dispatch line as tlx.js has it (pinned below). No browser, no GPU. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TLX = fs.readFileSync(path.join(ROOT, "js/render/three/tlx.js"), "utf8");
const tslice = (from, to) => {
  const a = TLX.indexOf(from), b = TLX.indexOf(to, a);
  assert.ok(a > 0 && b > a, `tlx.js block "${from.trim()}" moved — check this test, not the code`);
  return TLX.slice(a, b);
};
const QUEUE_SRC = tslice("      let _warmQueued = null;", "      // Set by onDeviceLost");
const API_SRC = tslice("        warm(opts) {", "        warming() {") + tslice("        cancelWarmRetry() {", "        warmQueued() {");
const DISPATCH = "if (!_warmPending && !_deviceLost) { if (_warmRequested) startProgramWarm(opts); else if (_mirWarmReq) startMirrorWarm(opts); else if (_rigWarm) startRigWarm(); }";

function rig() {
  return new Function(`"use strict";
    let _warmRequested = false, _warmPending = null, _warmAttempts = 0, _deviceLost = false, _warmWhere = "menu";
    let _mirWarmReq = false, _rigWarm = null, mirrorStarts = 0;
    const started = [];
    let release = null;
    const _resolveWarmWhere = (o) => (o && o.where) || "menu";
    function startProgramWarm() {
      _warmRequested = false; _warmAttempts++; started.push(_warmWhere);
      _warmPending = new Promise((r) => { release = r; }).finally(() => { _warmPending = null; });
    }
    function startMirrorWarm() { mirrorStarts++; _mirWarmReq = false; }
    function startRigWarm() {}
    ${QUEUE_SRC}
    const api = { ${API_SRC} };
    function present(opts) {
      _promoteQueuedWarm();
      ${DISPATCH}
    }
    return { api, present, started, mirrorStarts: () => mirrorStarts, settle: () => { const p = _warmPending; release(); return p; },
      pending: () => !!_warmPending, setMirror: () => { _mirWarmReq = true; } };`)();
}

test("a warm() during an in-flight warm runs after it settles, with its own where (before #4958: dropped)", async () => {
  const h = rig();
  h.api.warm(); h.present();
  assert.deepEqual(h.started, ["menu"], "the first warm starts at the next present");
  h.api.warm({ where: "loading" });   // the dark circuit's "|lit" warm, requested mid-compile
  h.present();
  assert.equal(h.started.length, 1, "nothing starts over a pending warm");
  await h.settle();
  h.setMirror();
  h.present();
  assert.deepEqual(h.started, ["menu", "loading"], "the queued warm compiled: 2 program warms, not 1");
  assert.equal(h.mirrorStarts(), 0, "and it goes ahead of a queued mirror warm");
  await h.settle(); h.present();
  assert.equal(h.started.length, 2, "one queued request runs once");
  assert.equal(h.mirrorStarts(), 1);
});

test("cancelWarmRetry drops a queued warm too (loadTrackStepped frees the world it was for)", async () => {
  const h = rig();
  h.api.warm(); h.present();
  h.api.warm();
  h.api.cancelWarmRetry();
  await h.settle(); h.present();
  assert.deepEqual(h.started, ["menu"]);
});

test("wiring: present() promotes the queued warm right before its dispatch; device loss clears it", () => {
  const p = TLX.indexOf("          _promoteQueuedWarm();"), d = TLX.indexOf("          " + DISPATCH);
  assert.ok(p > 0 && d > p && TLX.slice(p, d).split("\n").length === 3, "the promote is above present()'s rig-seen/dispatch pair");
  const lost = tslice("      renderer.onDeviceLost = function (info) {", "_pinnedPipes.clear()");
  assert.ok(lost.includes("_warmQueued = null;"), "a lost device forgets the queued warm with the rest");
});
