/* title-flow.test.mjs — TitleFlow entry points (round 2: M4 ghost link over an
 * open screen, M5 VS FRIEND mutating flow before its bundle loads). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../../js/ui/title-flow.js", import.meta.url), "utf8").replace(/^const TitleFlow/m, "var TitleFlow");
const tick = () => new Promise((r) => setTimeout(r, 0));

function boot({ ensureNet = () => Promise.resolve(true), top = () => null, racing = false, link = false } = {}) {
  const hash = { on: link };
  const btns = {}, listeners = {}, log = { announce: [], vt: 0, builds: 0, opened: 0, consumed: 0, restore: 0 };
  const G = {
    flow: "title", session: "none", soundOn: false, trackIdx: 0, announce: (...a) => log.announce.push(a),
    buildSelect: () => { log.builds++; }, scheduleFlybyTrack() {}, daily: { select() {}, stop() {} },
    netLobby: { open: () => { log.opened++; } }, els: { overlay: { hidden: false }, select: { hidden: true } },
    $: (id) => btns[id] || (btns[id] = { id, addEventListener() {} }),
  };
  const ctx = vm.createContext({
    Log: { info() {}, warn() {} }, Promise, GameAudio: { uiSelect() {} },
    UiLayers: { inRace: () => racing, top: () => top() },
    GhostShare: { consumeHash: async () => { if (!hash.on) return null; log.consumed++; return { ok: true, track: "monza" }; } },
    DailyChallenge: { dayKey: () => "2026-10-10" }, Tracks: { LIST: [{ id: "monza" }] },
    window: { addEventListener: (n, f) => { listeners[n] = f; } }, location: { hash: "" },
  });
  vm.runInContext(source, ctx);
  const api = ctx.TitleFlow.create(G, { vt: (f) => { log.vt++; f(); }, restoreFreePlaySelection: () => { log.restore++; },
    careerUi: {}, refreshTitle() {}, ensureNet });
  return { G, btns, listeners, log, api, hash };
}

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
