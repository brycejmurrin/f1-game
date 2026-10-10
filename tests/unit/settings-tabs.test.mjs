/* settings-tabs.test.mjs — SettingsNav's lazy MUSIC & SOUND gate.
 * M1 (round 2): AudioPanel._ensure() resolving false (UPDATE READY / offline)
 * used to re-enter show() -> _ensure() forever and never reveal #audioset. */
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
