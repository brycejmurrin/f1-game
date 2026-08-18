/* perf-try.test.mjs — pause-menu PERF EXPERIMENTS must be honest.

   A switch that does nothing is worse than no switch (js/game/perf-try.js).
   These tests freeze: schema defaults, storage/URL overlay, GLSL #defines,
   WGSL const overlay, generated SETTINGS rows, and the three-backend wiring
   that used to silently ignore flareGate / lampFogGate / envCull.

   Run: node --test tests/unit/perf-try.test.mjs
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const SRC = read("js/game/perf-try.js");

function makeStorage(init) {
  const data = { ...init };
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data,
  };
}

function loadPerfTry(opts) {
  const ls = makeStorage(opts.ls || {});
  const kids = [];
  const host = {
    id: "pm-panel-performance",
    appendChild(el) { kids.push(el); return el; },
  };
  const byId = { "pm-panel-performance": host };
  const ctx = vm.createContext({
    document: {
      getElementById: (id) => byId[id] || null,
      createElement: (tag) => {
        const el = {
          tagName: String(tag).toUpperCase(),
          id: "",
          className: "",
          textContent: "",
          title: "",
          onclick: null,
          setAttribute() {},
        };
        Object.defineProperty(el, "id", {
          get() { return this._id || ""; },
          set(v) { this._id = v; byId[v] = this; },
        });
        return el;
      },
      readyState: "complete",
      addEventListener() {},
    },
    localStorage: ls,
    location: { search: opts.search || "", reload() { ctx._reloads += 1; } },
    URLSearchParams,
    setTimeout: (fn) => { ctx._timers.push(fn); return 1; },
    PerfGov: { sentinelArm(on) { ctx._sentinel = !!on; } },
    GameAudio: { uiSelect() { ctx._clicks += 1; } },
    _reloads: 0,
    _timers: [],
    _sentinel: true,
    _clicks: 0,
  });
  seedLog(ctx);
  vm.runInContext(SRC, ctx, { filename: "js/game/perf-try.js" });
  ctx._kids = kids;
  ctx._byId = byId;
  ctx._ls = ls;
  return ctx;
}

test("all four shipped flags default ON and envCull has a label", () => {
  const ctx = loadPerfTry({});
  const P = vm.runInContext("PerfTry", ctx);
  const names = Object.keys(P.FLAGS);
  assert.deepEqual(names.sort(), ["envCull", "flareGate", "lampFogGate", "skyLate"]);
  for (const k of names) {
    assert.equal(P.FLAGS[k].def, true, k + " ships ON");
    assert.equal(P.on(k), true, k + " is ON with empty storage");
  }
  const list = P.list();
  assert.equal(list.envCull.on, true);
  assert.match(list.flareGate.backends, /wgx/);
  assert.match(P.defines(), /OPT_FLAREGATE/);
  assert.match(P.defines(), /OPT_LAMPFOGGATE/);
});

test("storage persists only deviations, and URL overrides the session", () => {
  const ctx = loadPerfTry({
    ls: { "apex26.perfTry": JSON.stringify({ skyLate: false, flareGate: true }) },
  });
  const P = vm.runInContext("PerfTry", ctx);
  assert.equal(P.on("skyLate"), false, "explicit OFF of a default-ON switch survives");
  assert.equal(P.on("flareGate"), true);
  assert.equal(P.on("envCull"), true, "untouched default-ON stays ON");
  assert.equal(P.on("lampFogGate"), true);

  const url = loadPerfTry({ search: "?perftry=none" });
  const U = vm.runInContext("PerfTry", url);
  assert.equal(U.active().length, 0, "perftry=none clears every flag");
  assert.equal(U.defines(), "");

  const all = loadPerfTry({
    ls: { "apex26.perfTry": JSON.stringify({ skyLate: false }) },
    search: "?perftry=all",
  });
  const A = vm.runInContext("PerfTry", all);
  assert.equal(A.active().length, 4);
});

test("set() writes deviations, disarms the crash sentinel, and reloads", () => {
  const ctx = loadPerfTry({});
  const P = vm.runInContext("PerfTry", ctx);
  assert.equal(P.set("skyLate", false), true);
  const stored = JSON.parse(ctx._ls.getItem("apex26.perfTry"));
  assert.deepEqual(stored, { skyLate: false });
  assert.equal(ctx._sentinel, false, "settings reload must not count as a crash");
  assert.equal(ctx._reloads, 0);
  ctx._timers.forEach((fn) => fn());
  assert.equal(ctx._reloads, 1);
  assert.equal(P.set("notAFlag", true), false);
});

test("withWgslConsts overlays authored OPT_* = true lines", () => {
  const on = loadPerfTry({});
  const P = vm.runInContext("PerfTry", on);
  const src = "const OPT_FLAREGATE = true;\nconst OPT_LAMPFOGGATE = true;\n";
  assert.equal(P.withWgslConsts(src), src, "default ON is a no-op overlay");

  const off = loadPerfTry({ search: "?perftry=none" });
  const O = vm.runInContext("PerfTry", off);
  const out = O.withWgslConsts(src);
  assert.match(out, /const OPT_FLAREGATE = false;/);
  assert.match(out, /const OPT_LAMPFOGGATE = false;/);
});

test("SETTINGS > PERF injects four labelled buttons and honest help copy", () => {
  const ctx = loadPerfTry({});
  const labels = ctx._kids.filter((el) => el.tagName === "BUTTON").map((el) => el.textContent);
  assert.deepEqual(labels, [
    "SKY LATE: ON",
    "FLARE GATE: ON",
    "ENV CULL: ON",
    "LAMP FOG GATE: ON",
  ]);
  const note = ctx._kids.find((el) => el.className === "adv-help");
  assert.ok(note, "help note exists");
  assert.match(note.textContent, /All four switches ship ON/);
  assert.doesNotMatch(note.textContent, /the rest stay OFF/);
  assert.ok(ctx._byId["pm-try-envCull"], "envCull button id");
  assert.ok(ctx._byId["pm-try-flareGate"], "flareGate button id");
});

test("initUI refuses to mint a second set of rows", () => {
  assert.match(SRC, /if \(!host \|\| document\.getElementById\("pm-try-skyLate"\)\) return;/);
});

test("GLX compiles GLSL flags; WGX/TLX honor the same three switches", () => {
  const glx = read("js/render/glx.js");
  const wgx = read("js/render/webgpu/wgx.js");
  const chunks = read("js/render/webgpu/wgsl-chunks.js");
  const post = read("js/render/webgpu/wgsl-post.js");
  const tslLit = read("js/render/three/tsl-lit.js");
  const tslPost = read("js/render/three/tsl-post.js");
  const tlx = read("js/render/three/tlx.js");
  const html = read("index.html");

  assert.match(glx, /PerfTry\.defines\(\)/);
  assert.match(read("js/render/shaders/post.js"), /#ifdef OPT_FLAREGATE/);
  assert.match(read("js/render/shaders/lit.js"), /#ifdef OPT_LAMPFOGGATE/);

  assert.match(wgx, /function _perfWgsl\(/);
  assert.match(wgx, /_perfWgsl\(WGSLChunks\.LIT\)/);
  assert.match(chunks, /const OPT_LAMPFOGGATE = true;/);
  assert.match(post, /const OPT_FLAREGATE = true;/);

  assert.match(tslLit, /PerfTry\.on\("lampFogGate"\)/);
  assert.match(tslPost, /PerfTry\.on\("flareGate"\)/);
  assert.match(tlx, /PerfTry\.on\("envCull"\)/);
  assert.match(tlx, /chunkedSys\.cull\(rec\.chunked, faceVP, _envEye, _envCullM\)/);
  assert.match(tlx, /function _restoreEnvCull\(/);

  assert.match(html, /GRAPHICS: HIGH/);
  assert.doesNotMatch(html, /GRAPHICS: STANDARD/);
});
