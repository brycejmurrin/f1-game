import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// B·P1 garage census (2026-10-20, gpu-census run 39403676222): __apex.diag() sniffed WebGL2 on
// #game before TLX's lazy WebGPU configure, which bound the canvas for life; present() then hit
// getContext("webgpu") === null and the page reloaded into WebGL2. COPY DIAG reaches the same path.
function loadApex(extra) {
  const context = vm.createContext(Object.assign({
    CamModes: { CAM_MODES: [{ id: "chase" }] }, LightTune: { TUNE_DEFS: [], LT: {} },
    AgentView: { create: () => ({}) }, setTimeout: (f) => f(),
  }, extra));
  vm.runInContext(fs.readFileSync(new URL("../../js/agent/apex-net.js", import.meta.url), "utf8"), context);
  for (const f of ["apex-cam.js", "apex-track.js", "apex-lobby.js"])
    vm.runInContext(fs.readFileSync(new URL("../../js/agent/" + f, import.meta.url), "utf8"), context);
  vm.runInContext(fs.readFileSync(new URL("../../js/agent/apex.js", import.meta.url), "utf8"), context);
  return vm.runInContext("ApexApi", context).create({ track: {} });
}

function fakeCanvas(name, asked) {
  return {
    id: name,
    getContext(type) {
      asked.push(name + ":" + type);
      return {
        getExtension: (n) => (n === "WEBGL_lose_context" ? { loseContext: () => asked.push(name + ":lost") } : null),
        getParameter: () => "x", VENDOR: 1, RENDERER: 2, VERSION: 3, MAX_TEXTURE_SIZE: 4,
      };
    },
  };
}

function run(api) {
  const asked = [];
  const game = fakeCanvas("game", asked);
  const document = { querySelector: () => game, createElement: () => fakeCanvas("scratch", asked),
    getElementById: () => null, querySelectorAll: () => [] };
  const apex = loadApex({ document, GLX: { backendState: () => ({ api }) },
    window: {}, navigator: { userAgent: "test" }, localStorage: { getItem: () => null }, sessionStorage: { getItem: () => null } });
  const d = apex.diag({ download: false });
  return { asked, d };
}

test("diag() never binds a context on #game while the bound backend is WebGPU", () => {
  const { asked, d } = run("webgpu");
  assert.ok(d && typeof d === "object", "diag returns its report");
  assert.ok(!asked.some((a) => a.startsWith("game:")), "no getContext on #game: " + asked.join(", "));
  assert.ok(asked.includes("scratch:webgl2"), "GPU identity still comes from a throwaway canvas");
  assert.ok(asked.includes("scratch:lost"), "the throwaway context is released");
});

test("diag() reads the live WebGL2 context in place on a WebGL2 bind", () => {
  const { asked } = run("webgl2");
  assert.deepEqual(asked.filter((a) => a.startsWith("game:")), ["game:webgl2"]);
  assert.ok(!asked.some((a) => a.startsWith("scratch:")));
});
