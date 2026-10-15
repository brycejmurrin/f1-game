/* title-flow.test.mjs — TitleFlow entry points (round 2: M4 ghost link over an
 * open screen, M5 VS FRIEND mutating flow before its bundle loads). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../../js/ui/title-flow.js", import.meta.url), "utf8").replace(/^const TitleFlow/m, "var TitleFlow");
const tick = () => new Promise((r) => setTimeout(r, 0));

function boot({ ensureNet = () => Promise.resolve(true), top = () => null, racing = false, link = false, queuedVt = false } = {}) {
  const hash = { on: link }, transitions = [];
  const captures = [];
  const btns = {}, listeners = {}, log = { announce: [], vt: 0, builds: 0, opened: 0, consumed: 0, restore: 0, flyby: 0, dailySelect: 0 };
  const G = {
    flow: "title", session: "none", soundOn: false, trackIdx: 0, announce: (...a) => log.announce.push(a),
    buildSelect: () => { log.builds++; }, scheduleFlybyTrack() { log.flyby++; },
    daily: { select() { log.dailySelect++; }, stop() {} },
    netLobby: { open: () => { log.opened++; } }, els: { overlay: { hidden: false,
      addEventListener(type, fn, capture) { captures.push({ type, fn, capture }); },
    }, select: { hidden: true } },
    $: (id) => btns[id] || (btns[id] = { id, addEventListener() {} }),
  };
  const ctx = vm.createContext({
    Log: { info() {}, warn() {} }, Promise, GameAudio: { uiSelect() {} }, DeepLink: { create() {} },
    UiLayers: { inRace: () => racing, top: () => top() },
    GhostShare: { consumeHash: async () => { if (!hash.on) return null; log.consumed++; return { ok: true, track: "monza" }; } },
    DailyChallenge: { dayKey: () => "2026-10-10" }, Tracks: { LIST: [{ id: "monza" }] },
    window: { addEventListener: (n, f) => { listeners[n] = f; } }, location: { hash: "" },
  });
  vm.runInContext(source, ctx);
  const api = ctx.TitleFlow.create(G, { vt: (f) => { log.vt++; if (queuedVt) transitions.push(f); else f(); }, restoreFreePlaySelection: () => { log.restore++; },
    careerUi: { openSlots() {} }, refreshTitle() {}, ensureNet });
  // Mirror DOM capture before onclick, including taps on a button's SVG/span.
  function click(id) {
    const button = G.$(id);
    const event = { target: { closest: (selector) => selector === "button, a" ? button : null } };
    for (const { type, fn, capture } of captures) if (type === "click" && capture === true) fn(event);
    button.onclick?.();
  }
  return { G, btns, listeners, log, api, hash, transitions, click };
}

test("Settings/Help visits cancel pending VS success and failure even after BACK", async () => {
  for (const door of ["mb-settings", "mb-help"]) {
    for (const outcome of [true, false, "reject"]) {
      let resolveNet, rejectNet, top = null, cached;
      const h = boot({ top: () => top, ensureNet: () => cached ||= new Promise((resolve, reject) => {
        resolveNet = resolve; rejectNet = reject;
      }) });
      h.G.$(door).onclick = () => { top = { id: door === "mb-settings" ? "pmsettings" : "howtoplay" }; };
      h.click("mb-vs");
      h.click(door);
      assert.ok(top, "the external title handler still opens its sheet");
      top = null;   // BACK before the pending download finishes
      if (outcome === "reject") rejectNet(new Error("offline"));
      else resolveNet(outcome);
      await tick();
      assert.equal(h.log.opened, 0, `${door}: stale ${outcome} does not reopen the lobby`);
      assert.equal(h.log.announce.length, 0, "cancelled failures remain silent");
      assert.equal(h.G.flow, "title"); assert.equal(h.G.session, "none");
      assert.equal(h.log.restore, 0, "cancelled requests do not change selection");
      if (outcome !== true) cached = Promise.resolve(true);   // loader's normal retry after failure
      h.click("mb-vs");
      await tick();
      assert.equal(h.log.opened, 1, "fresh activation accepts the cached or retried bundle");
      assert.equal(h.G.flow, "gp"); assert.equal(h.G.session, "race");
      assert.equal(h.log.restore, 1);
    }
  }
});

test("repeated VS activations sharing one download open the lobby only once", async () => {
  let ready;
  const download = new Promise((resolve) => { ready = resolve; });
  const h = boot({ ensureNet: () => download });
  h.click("mb-vs"); h.click("mb-vs");
  ready(true);
  await tick();
  assert.equal(h.log.opened, 1);
  assert.equal(h.log.restore, 1);
});

test("title sound and background-motion toggles do not cancel a pending VS entry", async () => {
  let ready;
  const h = boot({ ensureNet: () => new Promise((resolve) => { ready = resolve; }) });
  h.click("mb-vs");
  h.click("soundbtn"); h.click("home-motion");
  ready(true);
  await tick();
  assert.equal(h.log.opened, 1);
  assert.equal(h.log.restore, 1);
});

test("M5: VS FRIEND leaves flow/selection alone and announces when the net bundle is refused", async () => {
  const h = boot({ ensureNet: () => Promise.resolve(false) });
  h.btns["mb-vs"].onclick();
  await tick(); await tick();
  assert.equal(h.G.flow, "title", "flow untouched");
  assert.equal(h.log.restore, 0, "selection untouched");
  assert.equal(h.log.opened, 0);
  assert.equal(h.log.announce.length, 1);
  assert.match(h.log.announce[0][0], /COULD NOT LOAD/);
  assert.equal(h.log.announce[0][2], "warning");
});

test("M5: VS FRIEND sets the gp/race flow and opens the lobby once the bundle lands", async () => {
  const h = boot();
  h.btns["mb-vs"].onclick();
  await tick(); await tick();
  assert.equal(h.G.flow, "gp"); assert.equal(h.G.session, "race");
  assert.equal(h.log.restore, 1); assert.equal(h.log.opened, 1);
  assert.equal(h.log.announce.length, 0);
});

test("VS FRIEND loading cannot open the lobby over a newer title sheet or race picker", async () => {
  for (const hidden of [false, true]) {
    for (const ok of [true, false]) {
      let ready, top = null;
      const h = boot({ ensureNet: () => new Promise((resolve) => { ready = resolve; }), top: () => top });
      h.btns["mb-vs"].onclick();
      if (hidden) h.btns["mb-race"].onclick();
      else top = { id: "pmsettings" };   // Settings leaves the title visible beneath it.
      const before = { flow: h.G.flow, session: h.G.session, restore: h.log.restore };
      ready(ok);
      await tick();
      assert.equal(h.log.opened, 0, "a stale bundle completion cannot take navigation");
      assert.deepEqual({ flow: h.G.flow, session: h.G.session, restore: h.log.restore }, before);
      assert.equal(h.log.announce.length, 0, "a superseded request stays silent on refusal too");
      top = null; h.G.els.overlay.hidden = false;
      h.btns["mb-vs"].onclick();
      ready(true);
      await tick();
      assert.equal(h.log.opened, 1, "a fresh VS request works after returning to the title");
    }
  }
});

test("a queued title transition owns navigation before its DOM callback runs", async () => {
  for (const door of ["mb-race", "mb-tt"]) {
    let ready;
    const h = boot({ queuedVt: true, ensureNet: () => new Promise((resolve) => { ready = resolve; }) });
    h.btns["mb-vs"].onclick();
    h.btns[door].onclick();
    assert.equal(h.G.els.overlay.hidden, false, "normal-motion VT has not changed the DOM yet");
    assert.equal(h.transitions.length, 1);
    const before = { session: h.G.session, restore: h.log.restore, builds: h.log.builds };
    ready(true);
    await tick();
    assert.equal(h.log.opened, 0, "the delayed lobby cannot take the pending transition");
    assert.deepEqual({ session: h.G.session, restore: h.log.restore, builds: h.log.builds }, before);
    h.transitions.shift()();
    assert.equal(h.G.els.overlay.hidden, true);
    h.G.els.overlay.hidden = false; h.G.els.select.hidden = true;
    h.btns["mb-vs"].onclick(); ready(true);
    await tick();
    assert.equal(h.log.opened, 1, "transition ownership clears after its DOM callback finishes");
  }
});

test("a superseded VS load stays cancelled even after the player returns to the title", async () => {
  let ready;
  const h = boot({ queuedVt: true, ensureNet: () => new Promise((resolve) => { ready = resolve; }) });
  h.btns["mb-vs"].onclick();
  h.btns["mb-tt"].onclick();
  h.transitions.shift()();
  h.G.els.overlay.hidden = false; h.G.els.select.hidden = true;
  ready(true);
  await tick();
  assert.equal(h.log.opened, 0, "BACK does not resurrect a superseded lobby request");
  assert.equal(h.G.session, "tt");
});

test("overlapping queued title transitions cannot release or apply another transition's ownership", async () => {
  for (const newerFirst of [false, true]) {
    let ready;
    const h = boot({ queuedVt: true, ensureNet: () => new Promise((resolve) => { ready = resolve; }) });
    h.btns["mb-race"].onclick();
    h.api.openCareerSlots();
    const [older, newer] = h.transitions;
    if (!newerFirst) {
      older();
      assert.equal(h.G.els.overlay.hidden, false, "a superseded swap never applies");
      h.btns["mb-vs"].onclick(); ready(true);
      await tick();
      assert.equal(h.log.opened, 0, "the older callback cannot release the newer ownership");
    }
    newer();
    assert.equal(h.G.els.overlay.hidden, true);
    assert.equal(h.G.els.select.hidden, true, "the latest career door wins over Race");
    h.G.els.overlay.hidden = false;   // BACK from the completed transition
    older();
    assert.equal(h.G.els.overlay.hidden, false, "an out-of-order stale callback stays inert after BACK");
    h.btns["mb-vs"].onclick(); ready(true);
    await tick();
    assert.equal(h.log.opened, 1, "the title accepts fresh work after completion");
  }
});

// DAILY used to skip scheduleFlybyTrack; START then cold-compiled Shanghai FOG under
// the sheet and burned awaitIntroWarm on CI (garage-out-before-card DAILY, 2026-10-11).
test("DAILY and TIME TRIAL both warm the selected circuit under the picker", () => {
  const tt = boot();
  tt.api.openTimeTrial(false);
  assert.equal(tt.G.session, "tt");
  assert.equal(tt.log.dailySelect, 0);
  assert.equal(tt.log.flyby, 1, "free TT warms");
  const daily = boot();
  daily.api.openTimeTrial(true);
  assert.equal(daily.G.session, "tt");
  assert.equal(daily.log.dailySelect, 1);
  assert.equal(daily.log.flyby, 1, "daily warms the already-selected circuit");
});
