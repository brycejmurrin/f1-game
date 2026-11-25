// key-binds-ownership.test.mjs — who owns a key while Controls records or a menu navigates (unit U1):
// #6288 browser keys cannot be bindings, #6282 a menu-consumed arrow is not also PAUSE,
// #6281 capture ends when focus leaves the armed chip, #6262 every BACK path cancels the
// recording first, #6289 Help names the Look Back / Gas toggle mode. Rig: tests/helpers/key-binds-rig.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, bootUi, plain, slotOf } from "../helpers/key-binds-rig.mjs";

const codesOf = (Input) => Object.fromEntries(Input.keyBindings().map((a) => [a.id, plain(a.codes)]));
const flat = (n) => (typeof n === "string" ? n : (n.kids && n.kids.length ? n.kids.map(flat).join("") : n.textContent || ""));
const keyEvent = (init) => {
  const e = { repeat: false, isTrusted: true, defaultPrevented: false, stopped: false,
    target: { tagName: "BODY" }, ...init };
  e.preventDefault = () => { e.defaultPrevented = true; };
  e.stopPropagation = () => { e.stopped = true; };
  e.stopImmediatePropagation = () => { e.stopped = true; };
  return e;
};

test("#6288: browser Reload, fullscreen and devtools keys are refused as bindings", () => {
  const { Input } = boot();
  for (const code of ["F5", "F11", "F12", "BrowserBack", "BrowserForward", "BrowserRefresh"]) {
    assert.deepEqual(plain(Input.setKeyBinding("camera", 0, code)), { ok: false, reason: "reserved", by: "browser" }, code);
  }
  assert.deepEqual(plain(Input.setKeyMap({ camera: ["F5", "KeyC"] }).camera), [null, "KeyC"],
    "a saved F5 binding does not load back");
});

test("#6288: capturing F5 keeps the slot armed and says the browser owns it", () => {
  const { Input, $, press } = bootUi(true);
  slotOf($("pm-keys"), "camera", 0).onclick();
  press("F5");
  assert.equal(codesOf(Input).camera[0], "KeyC", "camera keeps its key");
  assert.equal($("pm-keys-note").textContent.startsWith("F5 is reserved by the browser"), true);
});

test("#6282: a menu-consumed arrow bound to PAUSE moves focus only", () => {
  let pauses = 0;
  const { Input, fire } = boot({ onPause: () => { pauses++; } });
  assert.equal(Input.setKeyBinding("pause", 0, "ArrowDown").ok, true);
  fire("keydown", keyEvent({ code: "ArrowDown", key: "ArrowDown", defaultPrevented: true }));
  assert.equal(pauses, 0, "MenuNav already spent ArrowDown on a focus move");
  fire("keydown", keyEvent({ code: "ArrowDown", key: "ArrowDown" }));
  assert.equal(pauses, 1, "an unconsumed ArrowDown still pauses");
});

test("#6281: focus leaving the armed chip ends the capture before the next key", () => {
  const { Input, $, press, fire } = bootUi(true);
  const chip = slotOf($("pm-keys"), "boost", 0);
  chip.focus(); chip.onclick();
  assert.equal(chip.dataset.armed, "1");
  const select = { tagName: "SELECT" };
  fire("focusin", { target: select });
  assert.equal(chip.dataset.armed, undefined, "the capture ended with the focus move");
  press("ArrowRight");
  const map = codesOf(Input);
  assert.equal(map.right[0], "ArrowRight", "STEER RIGHT keeps its key");
  assert.equal(map.boost[0], "Space", "BOOST was not rebound");
  // Focus landing on the armed chip itself (a click) keeps it armed.
  const again = slotOf($("pm-keys"), "boost", 0);
  again.onclick();
  fire("focusin", { target: again });
  assert.equal(again.dataset.armed, "1");
});

test("#6262: browser Back's synthetic Escape and a dialog cancel (controller B) cancel the recording, not Controls", () => {
  const { $, fire } = bootUi(true);
  const host = $("pm-keys");
  // Browser Back: deep-link.js dispatches an UNTRUSTED Escape keydown first.
  let chip = slotOf(host, "boost", 0);
  chip.onclick();
  const esc = keyEvent({ key: "Escape", code: "Escape", isTrusted: false });
  fire("keydown", esc);
  assert.equal(slotOf(host, "boost", 0).dataset.armed, undefined, "Back cancelled the capture");
  assert.equal(esc.defaultPrevented, true, "the Back is claimed, so escapeTop does not run");
  assert.equal(esc.stopped, true, "TopModal's Escape never sees it");
  // Controller B: pad-menu.js padEscape dispatches `cancel` at the settings dialog (key only, no code).
  chip = slotOf(host, "boost", 0);
  chip.onclick();
  const dialog = { tagName: "DIALOG", contains: (n) => n === host };
  const cancel = keyEvent({ type: "cancel", target: dialog });
  fire("cancel", cancel);
  assert.equal(slotOf(host, "boost", 0).dataset.armed, undefined, "B cancelled the capture");
  assert.equal(cancel.defaultPrevented, true, "the dialog stays open");
  assert.equal(cancel.stopped, true, "Settings BACK is not pressed");
  // With nothing armed both pass through untouched.
  const idle = keyEvent({ type: "cancel", target: dialog });
  fire("cancel", idle);
  assert.equal(idle.defaultPrevented, false);
  const padEsc = keyEvent({ key: "Escape", isTrusted: false });
  chip = slotOf(host, "boost", 0); chip.onclick();
  fire("keydown", padEsc);
  assert.equal(slotOf(host, "boost", 0).dataset.armed, undefined, "a key-only synthetic Escape cancels too");
});

test("#6289: Help says toggle once Look Back or Gas is set to Toggle", () => {
  const { Input, $, fire } = bootUi(true);
  const group = (id, name) => flat($(id)).split("  ·  ").find((g) => g.startsWith(name + " "));
  assert.equal(group("htp-keys", "Look back"), "Look back B hold");
  assert.equal(group("htp-pad", "Look back").endsWith(" hold"), true);
  assert.equal(group("htp-keys", "Gas"), "Gas ↑ / W", "hold GAS has no tail");
  Input.setHoldMode({ lookBack: "toggle", throttle: "toggle" });
  fire("apexholdmodechange", {});
  assert.equal(group("htp-keys", "Look back"), "Look back B tap to toggle");
  assert.equal(group("htp-pad", "Look back").endsWith(" tap to toggle"), true);
  assert.equal(group("htp-keys", "Gas"), "Gas ↑ / W tap to toggle");
  Input.setHoldMode({ lookBack: "hold", throttle: "hold" });
  fire("apexholdmodechange", {});
  assert.equal(group("htp-keys", "Look back"), "Look back B hold");
});
