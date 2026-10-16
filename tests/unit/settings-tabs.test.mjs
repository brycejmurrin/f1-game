/* settings-tabs.test.mjs — SettingsNav's lazy MUSIC & SOUND gate + onLeave.
 * M1 (round 2): AudioPanel._ensure() resolving false (UPDATE READY / offline)
 * used to re-enter show() -> _ensure() forever and never reveal #audioset.
 * Ship #1320 covered the same fail-loop with a boolean `ensured` flag; we keep
 * the richer offline-note path and still pin onLeave from that suite. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";

const source = fs.readFileSync(new URL("../../js/ui/settings-tabs.js", import.meta.url), "utf8").replace(/^const SettingsNav/m, "var SettingsNav");
const tick = () => new Promise((r) => setTimeout(r, 0));

function boot({ ensure, stub = true, onSelect = () => {} }) {
  const dom = makeDom();
  const audio = dom.byId("audioset"); audio.hidden = true;
  dom.byId("pm-audio"); dom.byId("pm-settings-index"); dom.byId("dlg-settings");
  const calls = { ensure: 0 };
  const GameAudio = { _stub: stub };
  const ctx = vm.createContext({ document: dom.document, window: {}, Log: { info() {}, warn() {} }, GameAudio,
    AudioPanel: { _ensure: () => { calls.ensure++; return ensure(GameAudio); } } });
  vm.runInContext(source, ctx);
  const nav = ctx.SettingsNav.create(null, onSelect);
  return { nav, dom, audio, calls, ctx };
}

test("MUSIC & SOUND: a bundle that fails to load is asked once per click and the page still reveals", async () => {
  const { dom, audio, calls } = boot({ ensure: () => Promise.resolve(false) });
  dom.byId("pm-audio").onclick();
  await tick(); await tick(); await tick();
  assert.equal(calls.ensure, 1, "no retry loop");
  assert.equal(audio.hidden, false, "stub page revealed");
  const note = dom.byId("audioset-offline");
  assert.equal(note.hidden, false);
  assert.match(note.textContent, /AUDIO ENGINE DID NOT LOAD/);
  // A second tap asks again exactly once more.
  dom.byId("pm-audio").onclick();
  await tick(); await tick(); await tick();
  assert.equal(calls.ensure, 2);
});

test("MUSIC & SOUND: a rejecting _ensure behaves like false, programmatic show() included", async () => {
  const { nav, audio, calls } = boot({ ensure: () => Promise.reject(new Error("net")) });
  nav.show("audio", false);
  await tick(); await tick(); await tick();
  assert.equal(calls.ensure, 1);
  assert.equal(audio.hidden, false);
});

test("MUSIC & SOUND: a bundle that loads reveals the wired page without the offline note", async () => {
  const sel = [];
  const { dom, audio, calls } = boot({ ensure: (ga) => { ga._stub = false; return Promise.resolve(true); }, onSelect: (id) => sel.push(id) });
  dom.byId("pm-audio").onclick();
  await tick(); await tick(); await tick();
  assert.equal(calls.ensure, 1);
  assert.equal(audio.hidden, false);
  assert.deepEqual(sel, ["audio"]);
  assert.notEqual(dom.byId("audioset-offline").hidden, false);
});

test("onLeave(fn) is called with the page id when back() / show() hides a page", () => {
  const { nav, ctx } = boot({ ensure: () => Promise.resolve(true), stub: false });
  const left = [];
  ctx.SettingsNav.onLeave((id) => left.push(id));
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

test("settings title acts as a breadcrumb on the page stack", () => {
  const h = boot({ ensure: () => Promise.resolve(true), stub: false });
  h.nav.show("advanced", false);
  assert.equal(h.dom.byId("dlg-settings").textContent, "SETTINGS › DRIVING AIDS");
  h.nav.back();
  assert.equal(h.dom.byId("dlg-settings").textContent, "SETTINGS");
});


test("late audio completion cannot supersede newer navigation or a closed session", async () => {
  for (const next of [h => h.nav.show("display", true), h => h.nav.back(), h => h.nav.showCurrent(), h => h.ctx.SettingsNav.invalidate(), h => { h.dom.byId("pmsettings").hidden = true; }, h => { h.dom.byId("pmsettings").hidden = true; h.nav.showCurrent(); h.dom.byId("pmsettings").hidden = false; }]) {
    let resolve; const selections = [];
    const h = boot({ ensure: () => new Promise(r => { resolve = r; }), onSelect: id => selections.push(id) });
    h.dom.byId("pm-audio").onclick(); next(h);
    const title = h.dom.byId("dlg-settings").textContent;
    resolve(true); await tick(); await tick();
    assert.equal(h.dom.byId("dlg-settings").textContent, title);
    assert.equal(h.audio.hidden, true); assert.deepEqual(selections, []);
  }
});
