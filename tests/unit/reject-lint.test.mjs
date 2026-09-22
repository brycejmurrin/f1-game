// reject-lint — a try/catch cannot swallow a promise REJECTION, and in this
// shell an escaped rejection is a full-screen overlay, not console noise.
//
// index.html installs
//
//   window.addEventListener("unhandledrejection", e => show("Promise rejection", …))
//
// which paints `#__err_overlay` over the running game. The `error` handler
// beside it carries a benign-noise exemption (ResizeObserver); the rejection
// handler carries none. So the classic shape
//
//   try { ctx.close(); } catch (e) { /* already closed */ }
//
// is a user-visible crash: `AudioContext.close()` on a closed context REJECTS
// with InvalidStateError (webaudio.github.io/web-audio-api/#dom-audiocontext-close
// — "reject the promise with InvalidStateError"), so the catch never runs and
// the overlay does. Found 2026-09-22 at four sites; the two that fire in
// ordinary play are:
//
//   js/audio/engine.js  rebuildCtx() is reached ONLY after a resume already
//                       failed — i.e. with the context in exactly the state
//                       close() refuses.
//   js/input/input.js   playEffect() rejects with InvalidStateError whenever
//                       `document.visibilityState === "hidden"`
//                       (w3c.github.io/gamepad/#dom-gamepadhapticactuator-playeffect),
//                       and rumble() fires on every collision, kerb and shift —
//                       so a phone locking mid-race was enough.
//
// This is a ZERO ratchet, not a frozen population: the tree is clean, the fix
// is one line per site, and the lint only names APIs whose promise-return is
// unambiguous, so a hit is always real.
import test from "node:test";
import assert from "node:assert/strict";
import { lintSource, count } from "../../tools/check/reject-lint.mjs";

test("a discarded promise API inside try{} is flagged", () => {
  const { sites } = lintSource(`function f(){ try { ctx.close(); } catch (e) {} }`);
  assert.equal(sites.length, 1);
  assert.equal(sites[0].call, "ctx.close()");
});

test("the rejection arm clears it", () => {
  const { sites } = lintSource(
    `function f(){ try { const p = ctx.close(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }`);
  assert.deepEqual(sites, []);
});

test("playEffect is flagged on any receiver — only the haptic actuator has it", () => {
  assert.equal(lintSource(`function f(){ a.playEffect("dual-rumble", {}); }`).sites.length, 1);
  assert.equal(lintSource(`function f(){ pad.vibrationActuator.playEffect("x", {}); }`).sites.length, 1);
});

test("a value the caller owns is not a site", () => {
  for (const src of [
    `async function f(){ await ctx.close(); }`,
    `function f(){ return ctx.close(); }`,
    `function f(){ const p = ctx.close(); }`,
    `function f(){ ctx.close().catch(() => {}); }`,
    `function f(){ ctx.close().then(a, b); }`,
  ]) assert.deepEqual(lintSource(src).sites, [], src);
});

// THE FALSE-POSITIVE RULE IS WHAT KEEPS THE LINT ON. `close`, `play`, `pause`
// and `resume` are synchronous on most of the receivers this tree uses them on,
// and a lint that cried wolf at ~30 WebSocket/IDB/dialog teardowns would be
// turned off within the week. Ambiguous names are matched only with a receiver.
test("synchronous close()/resume() receivers are not flagged", () => {
  for (const src of [
    `function f(){ try { ws.close(); } catch (e) {} }`,          // WebSocket — sync
    `function f(){ try { db.close(); } catch (e) {} }`,          // IDBDatabase — sync
    `function f(){ try { pc.close(); } catch (e) {} }`,          // RTCPeerConnection — sync
    `function f(){ try { el.close(); } catch (e) {} }`,          // <dialog> — sync
    `function f(){ try { synth.resume(); } catch (e) {} }`,      // speechSynthesis — sync void
  ]) assert.deepEqual(lintSource(src).sites, [], src);
});

// A GUARD THAT ONLY HOLDS UNTIL SOMEONE ADDS A NULL CHECK IS NOT HOLDING THE
// CLASS AT ZERO. `ctx && ctx.close()` and `ctx ? ctx.close() : null` discard the
// promise exactly as completely as the bare statement does, and both are the
// obvious rewrite when a receiver turns out to be nullable.
test("the guarded spellings of the same discard are flagged too", () => {
  for (const src of [
    `function f(ctx){ ctx && ctx.close(); }`,
    `function f(ctx){ ctx ? ctx.close() : null; }`,
    `function f(ctx){ ctx == null || ctx.close(); }`,
    `function f(ctx){ a(), ctx.close(); }`,
  ]) assert.equal(lintSource(src).sites.length, 1, src);
});

test("guarding the rejection still clears the guarded spellings", () => {
  const { sites } = lintSource(
    `function f(ctx){ ctx && (() => { const p = ctx.close(); if (p && p.catch) p.catch(() => {}); })(); }`);
  assert.deepEqual(sites, []);
});

test("a parse failure is reported, never swallowed as clean", () => {
  const r = lintSource(`function f( {`);
  assert.ok(r.parseError, "a file the lint cannot parse must not read as zero sites");
});

test("js/ is clean — no rejection reaches the overlay", () => {
  assert.equal(count(), 0);
});
