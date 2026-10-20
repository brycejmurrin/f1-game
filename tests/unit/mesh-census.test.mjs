/* mesh-census.test.mjs — parser/aggregation for tools/perf/mesh-census-lib.mjs.
 * No browser. Run: node --test tests/unit/mesh-census.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { fnSource } from "../helpers/fn-source.mjs";
import { initCensusPage } from "../../tools/lib/census-init.mjs";
import {
  distanceBand, classifySource, classifyPass, aggregateRows, tableRows,
  formatBandTable, recommend, parseSummaryLine, perFrame,
} from "../../tools/perf/mesh-census-lib.mjs";

test("distanceBand: 150 m cut", () => {
  assert.equal(distanceBand(0), "near");
  assert.equal(distanceBand(149.9), "near");
  assert.equal(distanceBand(150), "far");
  assert.equal(distanceBand(400), "far");
  assert.equal(distanceBand(NaN), "unknown");
});

test("classifySource: ribbon vs props vs other", () => {
  assert.equal(classifySource("tlxLgRoad"), "ribbon");
  assert.equal(classifySource("tlxBatch,inst"), "props");
  assert.equal(classifySource("chunked.js:road"), "ribbon");
  assert.equal(classifySource("props/scenery"), "props");
  assert.equal(classifySource("sky"), "other");
  assert.equal(classifySource(""), "other");
});

test("classifyPass: never treat shadow as main (#2631)", () => {
  assert.equal(classifyPass("canvas"), "main");
  assert.equal(classifyPass("output 576x324"), "main");
  assert.equal(classifyPass("mirror 207x59"), "mirror");
  assert.equal(classifyPass("rt 207x59"), "mirror", "unnamed TLX mirRT is still the mirror");
  assert.equal(classifyPass("rt 138x39"), "mirror", "phone lite mirror rung");
  assert.equal(classifyPass("rt 160x90"), "aux", "bloom mip must not count as mirror");
  assert.equal(classifyPass("rt 80x45"), "aux", "bloom mip chain");
  assert.equal(classifyPass("TLXSunShadow 512x512"), "shadow");
  assert.equal(classifyPass("rt 512x512"), "shadow", "square pot → shadow atlas");
  assert.equal(classifyPass("car shadow depth"), "shadow");
  assert.equal(classifyPass("bloom mip"), "aux");
});

test("aggregateRows: bands and sources; drops shadow/aux", () => {
  const agg = aggregateRows([
    { pass: "main", source: "ribbon", band: "near", tris: 1000, calls: 2, draws: 2 },
    { pass: "main", source: "ribbon", band: "far", tris: 500, calls: 1, draws: 1 },
    { pass: "mirror", source: "ribbon", band: "far", tris: 800, calls: 1, draws: 1 },
    { pass: "shadow", source: "ribbon", band: "far", tris: 99999, calls: 9, draws: 9 },
    { passKey: "TLXSunShadow 512x512", group: "tlxLgRoad", dist: 200, tris: 50, calls: 1, draws: 1 },
  ]);
  assert.equal(agg.by.main.ribbon.near.tris, 1000);
  assert.equal(agg.by.main.ribbon.far.tris, 500);
  assert.equal(agg.by.mirror.ribbon.far.tris, 800);
  assert.equal(agg.by.shadow, undefined);
  assert.equal(agg.passTotals.main.tris, 1500);
});

test("tableRows + formatBandTable are stable", () => {
  const agg = aggregateRows([
    { pass: "main", source: "ribbon", band: "far", tris: 4000, calls: 4, draws: 4 },
    { pass: "mirror", source: "ribbon", band: "near", tris: 2000, calls: 2, draws: 2 },
  ]);
  const rows = tableRows(agg, 2);
  assert.equal(rows.length, 2);
  assert.equal(perFrame(agg.by.main.ribbon.far, 2).tris, 2000);
  const md = formatBandTable(rows, { title: "TLX — monaco" });
  assert.match(md, /### TLX — monaco/);
  assert.match(md, /\| main \| ribbon \| far/);
  assert.match(md, /\| mirror \| ribbon \| near/);
});

test("recommend: mirror-first when mirror ribbon is huge", () => {
  const r = recommend({
    mainRibbonNear: 40_000, mainRibbonFar: 20_000,
    mirrorRibbon: 130_000, mainPropsFar: 5_000,
    mainTris: 180_000, mirrorTris: 140_000,
    culledChunks: 20, totalChunks: 80, mainCalls: 75, mirrorCalls: 12,
  });
  assert.equal(r.lodPays, true);
  assert.equal(r.passFirst, "mirror");
  assert.match(r.summary, /PAYS/);
  assert.ok(r.experiments.some((e) => /road-chunking|chunk-merge/i.test(e)));
});

test("recommend: no clear pay when far share and mirror are small", () => {
  const r = recommend({
    mainRibbonNear: 90_000, mainRibbonFar: 5_000,
    mirrorRibbon: 8_000, mainPropsFar: 1_000,
    mainTris: 100_000, mirrorTris: 10_000,
    culledChunks: 70, totalChunks: 80, mainCalls: 30, mirrorCalls: 4,
  });
  assert.equal(r.lodPays, false);
  assert.equal(r.passFirst, "none");
  assert.match(r.summary, /does NOT clearly pay/);
});

test("recommend: unbanded GLX ribbon leaves the far share unmeasured", () => {
  const r = recommend({
    mainRibbonUnknown: 120_000, mirrorRibbon: 35_000,
    mainTris: 195_000, mirrorTris: 59_000, mainCalls: 117, mirrorCalls: 36,
  });
  assert.equal(r.lodPays, false);
  assert.equal(r.farShare, null);
  assert.match(r.summary, /far ribbon share unmeasured on this backend/);
});

test("parseSummaryLine reads = mesh-census JSON", () => {
  const log = "noise\n= mesh-census {\"tracks\":[\"monaco\"],\"errors\":0}\n";
  assert.deepEqual(parseSummaryLine(log), { tracks: ["monaco"], errors: 0 });
  assert.equal(parseSummaryLine("nope"), null);
});

// The initializer is serialized into the page by all three census CLIs.
// Execute that serialized body in a fresh realm, without module bindings.
function censusPage({ constructors = ["WebGL2RenderingContext", "WebGLRenderingContext"], blocked = false } = {}) {
  const writes = [], calls = [], originals = new Map();
  const window = {};
  for (const name of constructors) {
    class GL {}
    Object.assign(GL.prototype, { LINK_STATUS: 1, VALIDATE_STATUS: 2, COMPLETION_STATUS_KHR: 3, COMPILE_STATUS: 4 });
    for (const method of ["linkProgram", "compileShader", "validateProgram", "getProgramParameter", "getShaderParameter", "getProgramInfoLog", "getShaderInfoLog"]) {
      GL.prototype[method] = function (...args) { calls.push({ method, receiver: this, args }); return "native:" + method; };
    }
    originals.set(GL, { ...GL.prototype });
    window[name] = GL;
  }
  const storage = (kind) => ({ setItem(key, value) { writes.push([kind, key, value]); if (blocked) throw new Error("blocked storage"); } });
  const context = { window, localStorage: storage("local"), sessionStorage: storage("session") };
  return { context, writes, calls, originals, window };
}

for (const backend of ["tlx", "glx"]) for (const stub of [false, true]) for (const mobile of [false, true]) {
  test(`census page initialization: ${backend}, stub=${stub}, mobile=${mobile}`, () => {
    const f = censusPage();
    runInNewContext(`(${initCensusPage.toString()})(options)`, { ...f.context, options: { backend, stub, mobile } });
    assert.equal(f.window.__TEST_MODE, true);
    assert.deepEqual(f.writes, [
      ...(mobile ? [["local", "apex26.forceMobileTier", "1"]] : []),
      ["local", "apex26.gfxBackend", backend === "tlx" ? "three" : "glx"],
      ...(backend === "tlx" ? [["local", "apex26.tlxForceGL", "1"]] : []),
      ["local", "apex26.gfxBootStepMs", "45000"],
      ["session", "apex26.wgxCapture", "0"],
    ]);
    for (const [GL, original] of f.originals) {
      const gl = new GL(), program = {}, shader = {};
      if (!(backend === "tlx" && stub)) {
        for (const [name, method] of Object.entries(original)) assert.equal(GL.prototype[name], method, name);
        continue;
      }
      for (const name of ["linkProgram", "compileShader", "validateProgram"]) assert.equal(gl[name](program), undefined);
      for (const status of [gl.LINK_STATUS, gl.VALIDATE_STATUS, gl.COMPLETION_STATUS_KHR]) assert.equal(gl.getProgramParameter(program, status), true);
      assert.equal(gl.getShaderParameter(shader, gl.COMPILE_STATUS), true);
      assert.equal(gl.getProgramInfoLog(program), "");
      assert.equal(gl.getShaderInfoLog(shader), "");
      const before = f.calls.length;
      assert.equal(gl.getProgramParameter(program, 99), "native:getProgramParameter");
      assert.equal(gl.getShaderParameter(shader, 98), "native:getShaderParameter");
      assert.deepEqual(f.calls.slice(before), [
        { method: "getProgramParameter", receiver: gl, args: [program, 99] },
        { method: "getShaderParameter", receiver: gl, args: [shader, 98] },
      ]);
    }
    assert.equal(f.calls.length, backend === "tlx" && stub ? 4 : 0);
  });
}

for (const constructors of [[], ["WebGL2RenderingContext"], ["WebGLRenderingContext"]]) {
  test(`census page initialization tolerates blocked storage and ${constructors.length} GL constructor(s)`, () => {
    const f = censusPage({ constructors, blocked: true });
    runInNewContext(`(${initCensusPage.toString()})(options)`, { ...f.context, options: { backend: "tlx", stub: true, mobile: true } });
    assert.deepEqual(f.writes, [["local", "apex26.forceMobileTier", "1"]], "one blocked write aborts the storage block");
    assert.equal(f.window.__TEST_MODE, true, "storage failure does not skip test mode or shader setup");
    for (const [GL] of f.originals) assert.equal(new GL().getProgramParameter({}, 1), true);
  });
}


// Extract the exact private page function without importing the CLI (which runs it).
const glxWrapSource = fnSource(
  readFileSync(new URL("../../tools/perf/mesh-census.mjs", import.meta.url), "utf8"),
  "function installGlxWrap(", { sourceType: "module" },
);

function glxCensus({ instanced = true, multiDraw = false, canvas = true, context = true } = {}) {
  const calls = [], result = {}, nativeError = {};
  const probe = { stack: "at drawRoad (/road/chunked.js:1:1)", stacks: 0, fail: false };
  const gl = { TRIANGLES: 4 };
  const methods = ["drawElements", "drawArrays"];
  if (instanced) methods.push("drawElementsInstanced", "drawArraysInstanced");
  if (multiDraw) methods.push("multiDrawElementsWEBGL");
  for (const method of methods) {
    gl[method] = function (...args) {
      calls.push({ method, receiver: this, args });
      if (probe.fail) throw nativeError;
      return result;
    };
  }
  const install = runInNewContext(`(${glxWrapSource})`, {
    document: { getElementById(id) {
      assert.equal(id, "game");
      return canvas ? { getContext(type) { assert.equal(type, "webgl2"); return context ? gl : null; } } : null;
    } },
    Error: class { constructor() { probe.stacks++; this.stack = probe.stack; } },
  });
  const installed = install(150);
  return { gl, calls, result, nativeError, probe, install, installed, state: gl.__meshCensus };
}

// Literal public WebGL signatures and expected triangles are independent of the wrapper's indices.
for (const [method, args, tris] of [
  ["drawElements", [4, 6, 5123, 24], 2], // mode, count, UNSIGNED_SHORT, byte offset
  ["drawElements", [4, 9, 5125, 48], 3], // UNSIGNED_INT must not become the count
  ["drawArrays", [4, 11, 12], 4], // mode, first, count
  ["drawElementsInstanced", [4, 6, 5123, 24, 5], 10], // byte offset != instance count
  ["drawArraysInstanced", [4, 7, 9, 4], 12], // mode, first, count, instance count
]) {
  test(`GLX census native signature: ${method}(${args.join(",")})`, () => {
    const f = glxCensus();
    f.state.on = true;
    assert.equal(f.gl[method].call({}, ...args), f.result);
    assert.deepEqual(f.calls, [{ method, receiver: f.gl, args }]);
    assert.equal(f.state.rows.length, 1);
    assert.deepEqual({ ...f.state.rows[0] }, {
      pass: "main", source: "ribbon", band: "unknown", draws: 1, tris, calls: 1, group: method + ":ribbon",
    });
    assert.deepEqual({ ...f.state.infoSamples[0] }, { pass: "main", passKey: "main:" + method, calls: 1, tris });
    assert.deepEqual({ ...f.state.passKeys }, { ["main:" + method]: 1 });
  });
}

test("GLX census preserves measurement gating, pass exclusions and native forwarding", () => {
  const f = glxCensus();
  const args = [4, 6, 5123, 24];
  const draw = () => {
    const before = f.calls.length;
    assert.equal(f.gl.drawElements.call({}, ...args), f.result);
    assert.equal(f.calls.length, before + 1);
    assert.deepEqual(f.calls.at(-1), { method: "drawElements", receiver: f.gl, args });
  };
  const empty = () => {
    assert.equal(f.state.rows.length, 0);
    assert.equal(f.state.infoSamples.length, 0);
    assert.deepEqual({ ...f.state.passKeys }, {});
  };
  assert.equal(f.state.on, false);
  draw();
  empty();
  assert.equal(f.probe.stacks, 0, "disabled measurement does not capture a stack");
  f.state.on = true;
  for (const stack of ["at castShadow (/shadow.js:1:1)", "at render (/post.js:1:1)"]) {
    f.probe.stack = stack;
    draw();
    empty();
  }
  f.probe.stack = "at drawMirror (/props/scenery.js:1:1)";
  draw();
  draw();
  assert.equal(f.state.rows.length, 2);
  assert.deepEqual({ ...f.state.rows[0] }, {
    pass: "mirror", source: "props", band: "unknown", draws: 1, tris: 2, calls: 1, group: "drawElements:props",
  });
  assert.deepEqual({ ...f.state.infoSamples[0] }, { pass: "mirror", passKey: "mirror:drawElements", calls: 1, tris: 2 });
  assert.deepEqual({ ...f.state.passKeys }, { "mirror:drawElements": 2 });
  f.state.on = false;
  const stacks = f.probe.stacks;
  draw();
  assert.equal(f.probe.stacks, stacks);
  assert.equal(f.state.rows.length, 2);
  assert.equal(f.state.infoSamples.length, 2);
  assert.deepEqual({ ...f.state.passKeys }, { "mirror:drawElements": 2 });
  f.probe.fail = true;
  assert.throws(() => f.gl.drawElements(...args), (error) => error === f.nativeError);
  assert.deepEqual(f.calls.at(-1), { method: "drawElements", receiver: f.gl, args });
});

test("GLX census retains coercion, zero-instance fallback and nontriangle accounting", () => {
  const f = glxCensus();
  f.state.on = true;
  f.gl.drawElementsInstanced(4, "6", 5123, 24, "5");
  f.gl.drawElementsInstanced(4, 6, 5123, 24, 0);
  f.gl.drawArraysInstanced(4, 7, 9, 0);
  f.gl.drawArrays(1, 0, 12);
  assert.deepEqual(Array.from(f.state.rows, (row) => row.tris), [10, 2, 3, 0]);
  assert.deepEqual(Array.from(f.state.infoSamples, (sample) => sample.tris), [10, 2, 3, 0]);
});

test("GLX census installs idempotently and tolerates missing optional methods or context", () => {
  const f = glxCensus({ instanced: false });
  assert.equal(f.installed, true);
  assert.equal(f.gl.drawElementsInstanced, undefined);
  assert.equal(f.gl.multiDrawElementsWEBGL, undefined);
  const wrapped = f.gl.drawElements;
  assert.equal(f.install(200), true);
  assert.equal(f.gl.drawElements, wrapped);
  assert.equal(f.gl.__meshCensus, f.state);
  f.state.on = true;
  f.gl.drawElements(4, 6, 5123, 24);
  assert.equal(f.calls.length, 1);
  assert.equal(f.state.rows.length, 1);
  assert.equal(glxCensus({ canvas: false }).installed, false);
  assert.equal(glxCensus({ context: false }).installed, false);
});

test("GLX census retains multiDraw offsets, measurement gating and exclusions", () => {
  const f = glxCensus({ multiDraw: true });
  const args = [4, new Int32Array([99, 6, 9]), 1, 5123, new Int32Array([0, 24, 48]), 1, 2];
  const draw = () => {
    const before = f.calls.length;
    assert.equal(f.gl.multiDrawElementsWEBGL.call({}, ...args), f.result);
    assert.equal(f.calls.length, before + 1);
    assert.deepEqual(f.calls.at(-1), { method: "multiDrawElementsWEBGL", receiver: f.gl, args });
  };
  draw();
  assert.equal(f.probe.stacks, 0);
  assert.equal(f.state.rows.length, 0);
  f.state.on = true;
  for (const stack of ["at castShadow (/shadow.js:1:1)", "at render (/post.js:1:1)"]) {
    f.probe.stack = stack;
    draw();
    assert.equal(f.state.rows.length, 0);
    assert.equal(f.state.infoSamples.length, 0);
  }
  f.probe.stack = "at drawMirror (/props/scenery.js:1:1)";
  draw();
  assert.equal(f.state.rows.length, 1);
  assert.deepEqual({ ...f.state.rows[0] }, {
    pass: "mirror", source: "props", band: "unknown", draws: 2, tris: 5, calls: 1, group: "multiDraw:props",
  });
  assert.deepEqual({ ...f.state.infoSamples[0] }, { pass: "mirror", passKey: "multiDraw", calls: 1, tris: 5 });
  assert.deepEqual({ ...f.state.passKeys }, {}, "multiDraw keeps its existing pass-key behavior");
});
