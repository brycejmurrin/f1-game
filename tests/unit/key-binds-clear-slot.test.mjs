// key-binds-clear-slot.test.mjs — #7150: an armed slot has a CLEAR control a touch or a pad can use; no keyboard needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakePad, plain, bootUi, slotOf } from "../helpers/key-binds-rig.mjs";

const clearOf = (node, id) => {
  if (node.dataset && node.dataset.clear === id) return node;
  for (const k of node.kids || []) { const h = clearOf(k, id); if (h) return h; }
  return null;
};

test("CLEAR on an armed pad slot unbinds it with no keyboard event (touch tap)", () => {
  const disk = {};
  const { Input, $, fire, sb } = bootUi(false, {}, disk);
  fakePad(sb, fire);
  const second = slotOf($("pm-pad"), "throttle", 1);
  const clear = clearOf($("pm-pad"), "throttle");
  assert.equal(clear.hidden, true, "CLEAR is hidden until a slot is armed");
  second.onclick();
  assert.equal(clear.hidden, false, "arming shows CLEAR");
  assert.equal(slotOf($("pm-pad"), "throttle", 0).hidden, true, "in the idle slot's place, so the row stays one line");
  clear.onclick();
  assert.deepEqual(plain(Input.getPadMap().throttle), [7, null]);
  assert.deepEqual(plain(disk.pad.throttle), [7, null]);
  const after = slotOf($("pm-pad"), "throttle", 1);
  assert.equal(after.textContent, "—");
  assert.match(after.attrs["aria-label"], /unset/);
  assert.match($("pm-pad-note").textContent, /cleared — it is unset now/);
  assert.equal(clearOf($("pm-pad"), "throttle").hidden, true);
});

test("a D-pad left/right press on an armed pad slot hands the pad to the menu walker with CLEAR focused", () => {
  const { Input, $, fire, sb } = bootUi(true, {});
  const pad = fakePad(sb, fire);
  const before = plain(Input.getPadMap().throttle);
  slotOf($("pm-pad"), "throttle", 1).onclick();
  pad.press(15); Input.poll();
  assert.equal(sb.document.activeElement, clearOf($("pm-pad"), "throttle"), "focus moved to CLEAR");
  assert.deepEqual(plain(Input.getPadMap().throttle), before, "the D-pad was not bound");
  assert.match($("pm-pad-note").textContent, /CLEAR/);
});

test("D-pad up (12) is still bindable from an armed slot: only left/right hand off", () => {
  const { Input, $, fire, sb } = bootUi(true, {});
  const pad = fakePad(sb, fire);
  slotOf($("pm-pad"), "throttle", 1).onclick();
  pad.press(12); Input.poll();
  assert.equal(Input.getPadMap().throttle[1], 12);
});
