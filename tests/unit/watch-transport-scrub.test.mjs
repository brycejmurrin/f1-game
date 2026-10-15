// WATCH timeline scrub: each `input` event of a drag used to run replay.seek() — pose 22 cars, refresh
// the HUD, render — synchronously, many times per frame. The seek now coalesces to one per animation
// frame with the latest value; the clock text still follows every event, and `change` seeks at once.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function element(tag) {
  const listeners = {}, attrs = {};
  return { tagName: tag.toUpperCase(), dataset: {}, children: [], style: {}, hidden: false,
    classList: { add() {}, remove() {} },
    appendChild(n) { this.children.push(n); n.parentNode = this; return n; },
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((n) => n !== this); },
    setAttribute(k, v) { attrs[k] = v; }, getAttribute(k) { return k in attrs ? attrs[k] : null; },
    addEventListener(k, fn) { listeners[k] = fn; }, dispatch(k) { if (listeners[k]) listeners[k](); } };
}

function setup({ raf, events = [] }) {
  const body = element("body"), frames = [];
  const sandbox = { document: { body, createElement: element, activeElement: null }, RealReplay: { LEAD_S: 8 } };
  if (raf) sandbox.requestAnimationFrame = (fn) => frames.push(fn);
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(new URL("../../js/ui/watch-transport.js", import.meta.url), "utf8"), ctx);
  const W = vm.runInContext("WatchTransport", ctx);
  const seeks = [], state = { T: 0, duration: 100, paused: true, speed: 1, follow: "AAA", broadcast: { auto: true, locked: false, manual: false } };
  const api = { describe: () => ({ name: "GP", drivers: [{ code: "AAA", name: "Alpha" }], events, speeds: [1] }), status: () => state,
    setPaused() {}, setSpeed() {}, follow() {}, setLocked() {}, setAuto() {}, eventStep() {},
    seek: (v) => { seeks.push(v); state.T = v; } };
  const ui = W.create({ camMode: 0 }, api); ui.start();
  const find = (key, p = body) => p.dataset.wt === key ? p : p.children.map((n) => find(key, n)).find(Boolean);
  return { ui, seeks, state, frames, find, flush: () => frames.splice(0).forEach((f) => f()) };
}

test("50 scrub `input` events cost at most one seek (one paint) before the next frame", () => {
  const t = setup({ raf: true });
  assert.equal(t.find("event").textContent, "RACE IN PROGRESS", "a replay without highlight events has not finished");
  const seek = t.find("seek");
  for (let i = 1; i <= 50; i++) { seek.value = String(i); seek.dispatch("input"); }
  assert.ok(t.seeks.length <= 1, `seeks before the frame: ${t.seeks.length}`);
  assert.equal(t.find("time").textContent, "0:50", "the clock text still follows every event");
  t.flush();
  assert.deepEqual(t.seeks, [50], "one seek with the latest value");
  seek.value = "60"; seek.dispatch("input"); seek.value = "61"; seek.dispatch("change");
  assert.equal(t.seeks.at(-1), 61, "`change` seeks at once");
  t.flush();
  assert.equal(t.seeks.at(-1), 61, "a stale pending value never overwrites the committed seek");
  t.ui.stop();
});

test("a frame that fires after stop() seeks nothing", () => {
  const t = setup({ raf: true });
  const seek = t.find("seek");
  seek.value = "7"; seek.dispatch("input");
  t.ui.stop();
  t.flush();
  assert.deepEqual(t.seeks, []);
});

test("without requestAnimationFrame the scrub still seeks (no lost input)", () => {
  const t = setup({ raf: false });
  const seek = t.find("seek");
  seek.value = "12"; seek.dispatch("input");
  assert.deepEqual(t.seeks, [12]);
  t.ui.stop();
});


test("WATCH chapters name each lap, clock and event, seek with lead-in and preserve ownership", () => {
  const events = [{ t: 3, lap: 1, text: "Start" }, { t: 90, lap: 2, text: "Safety car" }, { t: 99, lap: 3, text: "Pit stop" }];
  const t = setup({ raf: true, events });
  assert.equal(t.find("chapters").hidden, false);
  assert.equal(t.find("chapter-jump").disabled, true, "blank choice cannot jump");
  const pick = t.find("chapter");
  assert.equal(pick.getAttribute("aria-label"), "RACE EVENT");
  assert.deepEqual(pick.children.slice(1).map(o => o.textContent), ["L1 · 0:03 · Start", "L2 · 1:30 · Safety car", "L3 · 1:39 · Pit stop"]);
  for (const paused of [true, false]) {
    t.state.paused = paused; t.state.broadcast.locked = true;
    const seek = t.find("seek"); seek.value = "20"; seek.dispatch("input");
    for (const [i, target] of [[0, 0], [1, 82], [2, 91]]) {
      pick.value = String(i); pick.dispatch("change");
      assert.equal(t.seeks.at(-1), target);
      assert.equal(pick.value, String(i), "native select retains the chapter for the next ArrowDown");
      const jump = t.find("chapter-jump");
      assert.equal(jump.disabled, false);
      const count = t.seeks.length;
      jump.dispatch("click");
      assert.equal(t.seeks.length, count + 1, "repeat action seeks once without changing selection");
      assert.equal(t.seeks.at(-1), target);
      assert.equal(pick.value, String(i));
      assert.equal(t.state.paused, paused); assert.equal(t.state.follow, "AAA");
      assert.equal(t.state.broadcast.locked, true);
    }
    t.flush(); assert.equal(t.seeks.at(-1), 91, "pending scrub cannot overwrite chapter");
  }
  pick.value = ""; const count = t.seeks.length; pick.dispatch("change");
  assert.equal(t.seeks.length, count, "blank choice does not seek");
  assert.equal(t.find("chapter-jump").disabled, true);
  t.ui.stop(); t.ui.start();
  assert.equal(t.find("chapter-jump").disabled, true, "re-entry starts with no selected chapter");
  assert.equal(t.find("chapter").children.length, 4, "re-entry rebuilds exactly one event choice set");
});

test("empty or invalid WATCH events hide chapters", () => {
  const empty = setup({ raf: false });
  assert.equal(empty.find("chapters").hidden, true);
  assert.equal(empty.find("chapter-jump").disabled, true);
  assert.equal(setup({ raf: false, events: [{ t: NaN, lap: 1, text: "Unknown" }] }).find("chapters").hidden, true);
});
