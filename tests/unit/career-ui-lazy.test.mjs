/* career-ui-lazy.test.mjs — LAZY_CAREER_UI stub wires sheet controls before
 * CareerScreen lands, so a fast #cr-garage tap after openHub cannot no-op
 * (CI oversize-career: #carsetup stayed hidden for 20 s).
 *
 * Run: node --test tests/unit/career-ui-lazy.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => readFileSync(join(ROOT, p), "utf8").replace(/^const\b/gm, "var");

test("CareerUI stub prefetches LAZY_CAREER_UI and defers #cr-garage until CareerScreen mounts", async () => {
  const dom = makeDom({
    tagFor: (id) => (/^(cr-back|cr-go|cr-garage)$/.test(id) ? "button" : "div"),
  });
  const loads = [];
  let screenCreated = 0;
  const sb = {
    Math, console, Object, Array, String, Number, JSON, Promise,
    Log: { info() {}, warn() {}, debug() {}, error() {} },
    document: dom.document,
    ApexRoster: { LAZY_CAREER_UI: ["js/career/career-ui.js"], LAZY_CAREER_UI_EDGES: [] },
    ScriptLoader: {
      create: () => ({
        load: (files) => {
          loads.push(files.slice());
          // Install CareerScreen the way a real inject would.
          sb.CareerScreen = {
            create(G) {
              screenCreated++;
              const { $ } = G;
              $("cr-garage").onclick = () => { G.openGarage("career"); };
              return {
                openHub() { $("career").hidden = false; $("cr-title").textContent = "CAREER 2026"; },
                openSlots() { $("career").hidden = false; $("cr-title").textContent = "CAREER MODES"; },
                close() { $("career").hidden = true; },
                build() {},
              };
            },
          };
          return Promise.resolve(true);
        },
      }),
    },
  };
  sb.window = sb;
  vm.runInNewContext(src("js/career/career-ui-boot.js"), sb, { filename: "js/career/career-ui-boot.js" });

  const opened = [];
  const G = {
    $: (id) => dom.byId(id),
    els: { overlay: dom.byId("overlay") },
    openGarage: (from) => { opened.push(from); dom.byId("carsetup").hidden = false; },
  };
  const ui = sb.CareerUI.create(G);
  assert.equal(loads.length, 1, "create() kicks the prefetch");
  assert.equal(typeof dom.byId("cr-garage").onclick, "function", "stub wires #cr-garage before CareerScreen");

  // A tap during the in-flight fetch must still open the garage once loaded.
  dom.byId("cr-garage").onclick();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(screenCreated, 1);
  assert.deepEqual(opened, ["career"]);
  assert.equal(dom.byId("carsetup").hidden, false);

  // openHub must not cover an already-open garage.
  dom.byId("career").hidden = true;
  await ui.openHub();
  assert.equal(dom.byId("career").hidden, true, "openHub skips when #carsetup is up");
});

test("manifest keeps career-ui.js in LAZY_CAREER_UI and the boot stub on FULL", async () => {
  const { createRequire } = await import("node:module");
  const m = createRequire(import.meta.url)("../../tools/manifest.cjs");
  assert.ok(m.FULL.includes("js/career/career-ui-boot.js"));
  assert.ok(!m.FULL.includes("js/career/career-ui.js"));
  assert.deepEqual(m.LAZY_CAREER_UI, ["js/career/career-ui.js"]);
});

function delayedCareer() {
  const dom = makeDom(), pending = [], messages = [], opened = [];
  for (const id of ["overlay", "career", "carsetup"]) dom.byId(id).hidden = true;
  const state = { top: null, racing: false };
  const sb = {
    Promise,
    Log: { info() {}, warn() {} },
    ApexRoster: { LAZY_CAREER_UI: ["js/career/career-ui.js"] },
    UiLayers: { top: () => state.top, inRace: () => state.racing },
    ScriptLoader: { create: () => ({ load: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) }) },
  };
  vm.runInNewContext(src("js/career/career-ui-boot.js"), sb);
  const ui = sb.CareerUI.create({
    $: (id) => dom.byId(id), els: { overlay: dom.byId("overlay") },
    announce: (message) => messages.push(message),
    refreshCareerButton() {
      dom.byId("mb-career-sub").textContent = "DRIVER CAREER · MY TEAM";
      dom.byId("mb-career").setAttribute("aria-label", "Career modes — DRIVER CAREER · MY TEAM");
    },
  });
  function complete() {
    sb.CareerScreen = { create: () => ({
      openSlots(origin) { opened.push(["slots", origin]); dom.byId("career").hidden = false; },
      openHub() { opened.push(["hub"]); dom.byId("career").hidden = false; },
      close() { dom.byId("career").hidden = true; },
    }) };
    pending.shift().resolve(true);
  }
  return { dom, pending, messages, opened, state, ui, complete };
}

for (const failure of ["refused", "rejected"]) {
  test(`Career ${failure} download restores the menu and a later attempt loads the slots`, async () => {
    const h = delayedCareer();
    const opening = h.ui.openSlots("title");
    const load = h.pending.shift();
    if (failure === "rejected") load.reject(new Error("offline"));
    else load.resolve(false);
    await opening;
    assert.equal(h.dom.byId("overlay").hidden, false, "menu returns after the title door hid it");
    assert.equal(h.dom.byId("career").hidden, true);
    assert.match(h.messages[0], /COULD NOT LOAD.*TRY AGAIN/);
    assert.match(h.dom.byId("mb-career-sub").textContent, /COULD NOT LOAD.*TRY AGAIN/, "the title button carries the visible notice");
    assert.match(h.dom.byId("mb-career").getAttribute("aria-label"), /could not load.*Try again/);
    h.dom.byId("overlay").hidden = true;
    const retry = h.ui.openSlots("title");
    assert.equal(h.dom.byId("mb-career-sub").textContent, "DRIVER CAREER · MY TEAM", "retry restores the career summary");
    assert.doesNotMatch(h.dom.byId("mb-career").getAttribute("aria-label"), /could not load/);
    assert.equal(h.pending.length, 1, "failed promise is not cached");
    h.complete();
    await retry;
    assert.equal(h.dom.byId("career").hidden, false);
    assert.deepEqual(h.opened, [["slots", "title"]]);
  });
}

test("Career failure recovery does not cover a newer screen or race", async () => {
  for (const destination of ["settings", "race", "garage"]) {
    const h = delayedCareer();
    const opening = h.ui.openHub();
    if (destination === "settings") h.state.top = { id: "pmsettings" };
    if (destination === "race") h.state.racing = true;
    if (destination === "garage") h.dom.byId("carsetup").hidden = false;
    h.pending.shift().resolve(false);
    await opening;
    assert.equal(h.dom.byId("overlay").hidden, true, destination);
    assert.deepEqual(h.messages, [], destination);
  }
});

test("closing pending Career entry cancels it; the newest entry owns the loaded screen", async () => {
  const h = delayedCareer();
  const cancelled = h.ui.openHub();
  h.ui.close();
  h.complete();
  await cancelled;
  assert.deepEqual(h.opened, []);
  const old = h.ui.openHub(), current = h.ui.openSlots("title");
  await Promise.all([old, current]);
  assert.deepEqual(h.opened, [["slots", "title"]]);
});

test("a successful explicit Career hub request still supports a simulated season return", async () => {
  const h = delayedCareer();
  h.state.racing = true;
  const opening = h.ui.openHub();
  h.complete();
  await opening;
  assert.deepEqual(h.opened, [["hub"]], "careerSim callers may reopen the hub before leaving race state");
});
