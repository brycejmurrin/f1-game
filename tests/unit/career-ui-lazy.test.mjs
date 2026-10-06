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
