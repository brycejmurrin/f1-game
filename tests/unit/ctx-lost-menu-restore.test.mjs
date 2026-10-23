/* ctx-lost-menu-restore — graphics reset must put the four play doors back on the title. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gameSource, symbolSource, GAME_PATH } from "../helpers/game-source.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("quitToMenuAfterCtxLost runs menu + preview recovery before the notice", () => {
  const game = gameSource();
  const fn = game.slice(game.indexOf("function quitToMenuAfterCtxLost()"), game.indexOf("function quitToMenu()"));
  assert.ok(fn.includes("restoreMenuAfterGraphicsReset()"));
  assert.ok(fn.includes("resetSetupCam()"));
  assert.ok(fn.includes("spMeshBust()"));
  assert.ok(fn.includes("showCtxLostNotice()"));
  assert.ok(fn.indexOf("restoreMenuAfterGraphicsReset()") < fn.indexOf("showCtxLostNotice()"));
});

test("TitleMenu.repairDestinations remounts orphaned play doors", () => {
  class Node {
    constructor(tag = "div") { this.tagName = tag; this.children = []; this.dataset = {}; this.hidden = false; this.disabled = false; this.classList = { add() {} }; }
    appendChild(node) {
      if (node.parentNode) node.parentNode.children = node.parentNode.children.filter((n) => n !== node);
      node.parentNode = this; this.children.push(node); return node;
    }
    contains(node) { return this.children.includes(node) || this.children.some((c) => c.contains && c.contains(node)); }
    setAttribute() {} removeAttribute() {} querySelectorAll() { return []; }
  }
  const menu = new Node(); menu.id = "menu-buttons"; menu.dataset.destinations = "true";
  const row = new Node(); row.id = "menu-primary"; menu.appendChild(row);
  const orphan = new Node();
  const walk = (node, id) => node.id === id ? node : node.children.map((n) => walk(n, id)).find(Boolean);
  const roots = [menu, orphan];
  const doc = { documentElement: { dataset: {} }, getElementById: (id) => roots.map((r) => walk(r, id)).find(Boolean), createElement: (tag) => new Node(tag), body: { appendChild() {} } };
  doc.getElementById = (id) => { if (id === "menu-buttons") return menu; return roots.map((r) => walk(r, id)).find(Boolean); };
  for (const id of ["mb-race", "mb-tt", "mb-watch", "mb-data", "mb-vs", "mb-season", "mb-practice", "mb-garage", "mb-photo", "mb-designer", "mb-standings", "mb-settings", "mb-phonepad", "mb-help", "menu-explore", "menu-garage", "menu-create", "menu-secondary", "menu-hero"]) {
    const n = new Node("button"); n.id = id; if (["mb-race", "mb-tt", "mb-watch", "mb-data"].includes(id)) orphan.appendChild(n);
    else menu.appendChild(n);
  }
  const ctx = vm.createContext({ document: doc, Log: { info() {} }, SettingsNav: null });
  vm.runInContext(read("js/ui/title-menu.js"), ctx, { filename: absSrc("js/ui/title-menu.js") });
  assert.equal(vm.runInContext("TitleMenu.repairDestinations(document)", ctx), true);
  for (const id of vm.runInContext("TitleMenu.CORE_PLAY_DOORS", ctx)) {
    const btn = doc.getElementById(id);
    assert.ok(btn, id);
    const primary = doc.getElementById("menu-primary");
    const explore = doc.getElementById("menu-explore");
    assert.ok((primary && primary.contains(btn)) || (explore && explore.contains(btn)), id + " remounted");
    assert.equal(btn.hidden, false);
  }
});

test("Menus.create returns restoreMenuAfterGraphicsReset for game.js wiring", () => {
  const src = read("js/ui/select-screen.js");
  assert.ok(src.includes("restoreMenuAfterGraphicsReset"));
  assert.ok(src.includes("TitleMenu.repairDestinations"));
  assert.ok(src.includes("TopModal.syncMenuIsolation"));
  assert.ok(src.includes("restoreMenuAfterGraphicsReset,"));
});

// #3571: a superseded paced build returns false with the context intact; only gfxContextLost() is a ctx loss.
function raceTrackSteppedHarness(results, { lost = () => false, stale = () => false } = {}) {
  const fn = symbolSource("async function raceTrackStepped(");
  const calls = { builds: 0, ctxQuits: 0 };
  const ctx = vm.createContext({
    calls,
    loadTrackStepped: async (_idx, live) => { calls.builds++; calls.liveAtCall = live(); return results.shift(); },
    gfxContextLost: lost,
    quitToMenuAfterCtxLost: () => { calls.ctxQuits++; },
  });
  vm.runInContext(fn + "\nthis.run = raceTrackStepped;", ctx, { filename: absSrc(GAME_PATH) });
  return { run: () => ctx.run(3, stale), calls };
}

test("startRaceBody builds through raceTrackStepped, not a bare ctx-lost branch", () => {
  const game = gameSource();
  const body = game.slice(game.indexOf("async function startRaceBody("), game.indexOf("async function startRaceBody(") + 12000);
  assert.ok(body.includes("await raceTrackStepped(trackIdx, stale)"));
  assert.ok(!/loadTrackStepped\([^)]*\)\)\s*&&\s*!stale\(\)\)\s*\{\s*quitToMenuAfterCtxLost/.test(body));
});

test("raceTrackStepped: a superseded build with the context intact retries, no graphics-reset quit", async () => {
  const h = raceTrackSteppedHarness([false, true]);
  assert.equal(await h.run(), true);
  assert.equal(h.calls.builds, 2);
  assert.equal(h.calls.ctxQuits, 0);
  assert.equal(h.calls.liveAtCall, true);
});

test("raceTrackStepped: a real context loss still takes the ctx-lost quit", async () => {
  const h = raceTrackSteppedHarness([false], { lost: () => true });
  assert.equal(await h.run(), false);
  assert.equal(h.calls.ctxQuits, 1);
  assert.equal(h.calls.builds, 1);
});

test("raceTrackStepped: a stale session returns false without any quit", async () => {
  const h = raceTrackSteppedHarness([false], { stale: () => true });
  assert.equal(await h.run(), false);
  assert.equal(h.calls.ctxQuits, 0);
});

test("raceTrackStepped: superseded twice fails the start (onFail), not a graphics reset", async () => {
  const h = raceTrackSteppedHarness([false, false]);
  await assert.rejects(h.run(), /superseded twice/);
  assert.equal(h.calls.ctxQuits, 0);
  assert.equal(h.calls.builds, 2);
});
