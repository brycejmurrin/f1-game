/* settings-tabs.test.mjs — SettingsNav page stack (bug-hunt 2.1, 5.3 hook). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../../js/ui/settings-tabs.js", import.meta.url), "utf8");

// A jsdom-free DOM: every id resolves to a plain element with `hidden`, so show()
// can flip pages; nothing is focusable (visible() is false without a parent chain).
function harness(ensureResult) {
  const els = new Map();
  const el = (id) => {
    if (!els.has(id)) els.set(id, { id, hidden: false, textContent: "", onclick: null, getAttribute: () => null, querySelector: () => null, contains: () => false });
    return els.get(id);
  };
  const calls = { ensure: 0 };
  const ctx = vm.createContext({
    Log: { info() {}, warn() {} },
    document: { getElementById: el, activeElement: null },
    window: {},
    GameAudio: { _stub: true },
    // Past 20 calls the stub stops resolving, so an unfixed busy loop FAILS the count instead of starving the event loop.
    AudioPanel: { _ensure() { calls.ensure++; return calls.ensure > 20 ? new Promise(() => {}) : Promise.resolve(ensureResult); } },
  });
  vm.runInContext(src + "\nglobalThis.SettingsNav = SettingsNav;", ctx);
  return { ctx, el, calls };
}

const tick = () => new Promise((r) => setTimeout(r, 30));

test("show('audio') terminates and reveals the page when the audio bundle cannot load", async () => {
  const { ctx, el, calls } = harness(false);
  const nav = ctx.SettingsNav.create(null, null);
  nav.show("audio", false);
  await tick();
  assert.equal(calls.ensure, 1, "one load attempt, not a loop");
  assert.equal(el("audioset").hidden, false, "the audio page is revealed on the stub");
  assert.equal(el("pm-settings-index").hidden, true);
});

test("the audio door click also terminates when the bundle cannot load", async () => {
  const { ctx, el, calls } = harness(false);
  el("pm-audio");   // exists before create() so the door wires
  ctx.SettingsNav.create(null, null);
  el("pm-audio").onclick();
  await tick();
  assert.equal(calls.ensure, 1, "the door awaits _ensure once and then shows");
  assert.equal(el("audioset").hidden, false);
});

test("a rejecting _ensure also reveals the page once", async () => {
  const { ctx, el, calls } = harness(false);
  ctx.AudioPanel._ensure = () => { calls.ensure++; return calls.ensure > 20 ? new Promise(() => {}) : Promise.reject(new Error("x")); };
  const nav = ctx.SettingsNav.create(null, null);
  nav.show("audio", false);
  await tick();
  assert.equal(calls.ensure, 1);
  assert.equal(el("audioset").hidden, false);
});

test("onLeave(fn) is called with the page id when back() / show() hides a page", () => {
  const { ctx } = harness(true);
  const left = [];
  ctx.SettingsNav.onLeave((id) => left.push(id));
  const nav = ctx.SettingsNav.create(null, null);
  assert.deepEqual(left, [], "the initial show('home') leaves nothing");
  nav.show("controls", false);
  assert.deepEqual(left, [], "home is the index, not a page");
  nav.back();
  assert.deepEqual(left, ["controls"]);
  nav.show("driving", false);
  nav.show("display", false);
  assert.deepEqual(left, ["controls", "driving"]);
  nav.show("display", false);
  assert.deepEqual(left, ["controls", "driving"], "re-showing the same page leaves nothing");
});
