/* audio-low-tier.test.mjs — #7111 (#6865 2c): ONE "low-tier device" answer for js/audio.
 * Phone (GLX.isMobile) OR memory-safe tier (GLX.mobileTier); desktop is neither.
 * crowd, engine, radio-voice and rivals used to carry four copies. soundtrack and
 * voice-pack stay isMobile-only on purpose (decoded-PCM budgets). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const run = (ctx, f) => vm.runInContext(read(f), ctx, { filename: absSrc(f) });
const CASES = [
  [{ mobileTier: true }, true, "mobileTier alone"],
  [{ isMobile: true }, true, "isMobile alone"],
  [{ isMobile: true, mobileTier: true }, true, "both"],
  [{}, false, "desktop"],
  [undefined, false, "no GLX at all"],
];

// Engine-voice cap seen through collect(): cars past the cap take their RANK as slot
// (follows a rank swap); cars inside it stay bound to their voice. Desktop cap 4 binds
// the 3rd car; a low-tier cap of 2 does not.
function thirdCarKeepsSlot(glx) {
  const sb = { Math, Array, Object, Number, console, GLX: glx };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  for (const f of ["js/core/mat4.js", "js/physics/consts.js", "js/audio/signal.js", "js/audio/rivals.js"]) run(ctx, f);
  const RivalAudio = vm.runInContext("RivalAudio", ctx);
  const car = (s) => ({ s, x: 0, speed: 50, rpm: 3000, retired: false });
  const me = car(100), a = car(108), b = car(116), c = car(124), d = car(132);
  const R = RivalAudio.create({ track: { total: 1000 }, cars: [me, a, b, c, d] });
  const slotOf = (rows, arc) => rows.find((r) => Math.abs(r.arc - arc) < 0.5).slot;
  const first = [...R.collect(me)];
  const before = slotOf(first, 24);
  c.s = 132; d.s = 124;                     // 3rd and 4th trade places
  const after = slotOf([...R.collect(me)], 32);
  return before === after;
}

test("GameAudioSignal.lowTier is the one predicate", () => {
  for (const [glx, want, why] of CASES) {
    const ctx = vm.createContext({ GLX: glx });
    run(ctx, "js/audio/signal.js");
    assert.equal(vm.runInContext("GameAudioSignal.lowTier()", ctx), want, why);
  }
});

test("rivals voice cap follows the predicate (mobileTier alone caps, desktop does not)", () => {
  for (const [glx, want, why] of CASES) {
    assert.equal(!thirdCarKeepsSlot(glx), want, why);
  }
});
