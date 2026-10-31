import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

// Every WGSL program may only name the resource bindings IT declares.
//
// THE INCIDENT (2026-09-15, found by gpu-census run 113 on macos-latest).
// js/render/webgpu/wgsl-chunks.js holds several complete, independent WGSL
// programs in one file. They do not share a scope: LIT binds `F : FrameU`
// at @group(0) @binding(0), and SKY binds `U : SkyU` at the very same slot.
// 9f2c6dc83 added the painted pit lane and wrote, inside LIT:
//
//     roadMarkings(&albedo, &rough, vTrk, fwTrk, U.pitLane);
//
// `U` is the SKY program's binding. In LIT it does not exist, and Dawn said
// so: "error: unresolved value 'U'". The field was right (`pitLane` IS a
// member of FrameU) and the binding name was another program's.
//
// WHY EVERYTHING ELSE WAS GREEN. This is a plain compile error, not a
// hardware quirk — it would fail on any device. But WGX is opt-in: it has no
// <script> tag and is injected only when apex26.gfxBackend names it, so the
// normal gate never builds that shader, and the whole no-browser suite stayed
// green while the WebGPU backend's lit shader could not compile at all. It
// took a real-GPU census leg, on a macOS runner, to say a word about it.
//
// The check is deliberately narrow: MEMBER ACCESS (`Name.`) on an identifier
// that some OTHER program declares as a binding and this one does not. That
// is exactly the defect, and it cannot fire on a local variable that merely
// shares a short name, because a local is not a binding anywhere.
//
// Comments are stripped first, and that is load-bearing rather than tidy: the
// SHADOW program carries the line `// match GLX uInstanced / LIT D.mat2.y`,
// which is a legitimate cross-reference in prose. A scan of the raw text
// reports it and a reviewer learns to ignore this guard.

const ROOT = new URL("../..", import.meta.url);
const REQUIRE = (await import("node:module")).createRequire(import.meta.url);
const P = REQUIRE("../../tools/manifest.cjs").PATHS;
const CHUNKS_SOURCE = await readFile(new URL(P.WGSL_CHUNKS, ROOT), "utf8");

// Strip WGSL comments the way a parser does: block comments and line comments,
// preserving newlines so reported line numbers stay true to the file.
function stripComments(src) {
  let out = "", i = 0;
  while (i < src.length) {
    if (src[i] === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const cut = end < 0 ? src.slice(i) : src.slice(i, end + 2);
      out += cut.replace(/[^\n]/g, " ");
      i += cut.length;
    } else if (src[i] === "/" && src[i + 1] === "/") {
      let end = src.indexOf("\n", i);
      if (end < 0) end = src.length;
      out += " ".repeat(end - i);
      i = end;
    } else { out += src[i]; i++; }
  }
  return out;
}

// A resource binding declaration: `@group(0) @binding(0) var<uniform> F : FrameU;`
// or the sampler/texture form `@group(0) @binding(2) var shadowTex : texture_depth_2d;`
const declsOf = (src) => new Set(
  [...stripComments(src).matchAll(/\bvar(?:<[^>]*>)?\s+(\w+)\s*:/g)].map((m) => m[1]));

function loadChunks() {
  const context = vm.createContext({ console, Math });
  vm.runInContext(`${CHUNKS_SOURCE}\nglobalThis.__CHUNKS = WGSLChunks;`, context, { filename: absSrc(P.WGSL_CHUNKS) });
  return context.__CHUNKS;
}

// The complete WGSL programs the module exports (the named leaves above them
// are fragments, composed INTO these, and have no scope of their own).
const PROGRAM_KEYS = ["SKY", "LIT", "BLIT", "BLOCKER", "SHADOW", "DEPTH_RESOLVE"];

function crossProgramRefs(programs) {
  const decls = new Map(Object.entries(programs).map(([k, v]) => [k, declsOf(v)]));
  const everyBinding = new Set([...decls.values()].flatMap((s) => [...s]));
  const bad = [];
  for (const [name, src] of Object.entries(programs)) {
    const mine = decls.get(name);
    const body = stripComments(src);
    for (const m of body.matchAll(/\b([A-Za-z_]\w*)\s*\./g)) {
      const id = m.group ? m.group(1) : m[1];
      if (everyBinding.has(id) && !mine.has(id)) {
        const line = body.slice(0, m.index).split("\n").length;
        bad.push({ program: name, id, line, text: src.split("\n")[line - 1].trim().slice(0, 90) });
      }
    }
  }
  return bad;
}

test("every WGSL program only names bindings it declares", () => {
  const chunks = loadChunks();
  const programs = {};
  for (const k of PROGRAM_KEYS) {
    assert.equal(typeof chunks[k], "string", `WGSLChunks.${k} is a composed WGSL program`);
    programs[k] = chunks[k];
  }
  const bad = crossProgramRefs(programs);
  assert.deepEqual(bad, [], bad.map((b) =>
    `${b.program} names '${b.id}', which ${b.program} does not declare (line ${b.line}): ${b.text}`).join("\n"));
});

test("the programs really do declare bindings, so the check is not vacuous", () => {
  const chunks = loadChunks();
  // If a refactor stopped exporting composed programs, the test above would
  // pass by finding nothing to check. Pin the two bindings the incident was
  // about: LIT owns F, SKY owns U, and NEITHER owns the other's.
  const lit = declsOf(chunks.LIT), sky = declsOf(chunks.SKY);
  assert.ok(lit.has("F"), "LIT declares F");
  assert.ok(sky.has("U"), "SKY declares U");
  assert.ok(!lit.has("U"), "LIT does not declare U — that is why the incident was an error");
  assert.ok(!sky.has("F"), "SKY does not declare F");
});

test("the guard fires on the real defect, rather than being asserted to", () => {
  const chunks = loadChunks();
  // The exact edit 9f2c6dc83 shipped, reapplied to today's LIT.
  // The call site has since grown a second argument (F.pitBox, the painted pit
  // box), so the reconstruction tracks it rather than pinning the old spelling —
  // the defect being reproduced is the WRONG STRUCT NAME, not the arity.
  const broken = chunks.LIT.replace("roadMarkings(&albedo, &rough, vTrk, fwTrk, F.pitLane, F.pitBox);",
    "roadMarkings(&albedo, &rough, vTrk, fwTrk, U.pitLane, F.pitBox);");
  assert.notEqual(broken, chunks.LIT, "the call site still looks the way the fix left it");
  const bad = crossProgramRefs({ LIT: broken, SKY: chunks.SKY });
  assert.equal(bad.length, 1, "exactly the one bad reference");
  assert.equal(bad[0].id, "U");
  assert.equal(bad[0].program, "LIT");
});

test("a cross-program name inside a COMMENT is not a defect", () => {
  const chunks = loadChunks();
  // SHADOW genuinely carries `// match GLX uInstanced / LIT D.mat2.y`. A raw
  // text scan flags it; a parser does not. Prove we behave like the parser.
  const commented = chunks.SHADOW + "\n// see LIT F.pitLane and SKY U.p0 for the shape\n";
  assert.deepEqual(crossProgramRefs({ SHADOW: commented, LIT: chunks.LIT, SKY: chunks.SKY }), []);
});

// ── Exact-zero gates (perf hunt 9, issue #4270 §6) ───────────────────────────
// Each term below is scaled by a weight that is exactly 0 in part of its range
// (near past 90 m, brush/weave/sparkle fades past 55-60 m, the sky "life" band
// at up >= 0.55, its azimuth at up >= 0.5, mist inside 8 m), so skipping it is
// bit-identical. Structural on the COMPOSED program: walk the braces up to the
// term and collect the conditions of the enclosing `if` blocks.

// Conditions (split on &&) of every `if (...) {` block enclosing src[idx].
function guardsAt(src, idx) {
  const body = stripComments(src), stack = [];
  let stmt = 0;
  for (let i = 0; i < idx; i++) {
    const ch = body[i];
    if (ch === "{") { stack.push(body.slice(stmt, i).trim()); stmt = i + 1; }
    else if (ch === "}") { stack.pop(); stmt = i + 1; }
    else if (ch === ";") stmt = i + 1;
  }
  return stack.filter((h) => h.startsWith("if (") && h.endsWith(")"))
    .flatMap((h) => h.slice(4, -1).split("&&").map((c) => c.trim()));
}
// `fn <name>(` through its matching brace, as [start, end) indices.
function fnSpan(src, name) {
  const s = src.indexOf(`fn ${name}(`);
  assert.ok(s >= 0, `fn ${name} exists`);
  let i = src.indexOf("{", s), depth = 0;
  for (; i < src.length; i++) { if (src[i] === "{") depth++; else if (src[i] === "}" && --depth === 0) break; }
  return [s, i + 1];
}
function assertGated(src, fn, cases) {
  const [a, b] = fnSpan(src, fn);
  const ungated = [];
  for (const [term, guard] of cases) {
    const at = src.indexOf(term, a);
    assert.ok(at >= a && at < b, `${fn}: term ${term} is in the function`);
    const g = guardsAt(src, at);
    if (g.indexOf(guard) < 0) ungated.push(`${term} needs if (${guard}); enclosing: ${g.join(" | ") || "none"}`);
  }
  assert.deepEqual(ungated, [], `${fn}: terms outside their exact-zero gate`);
}

test("applyMaterial: every per-material term with an exactly-zero weight sits inside its > 0.0 gate", () => {
  assertGated(loadChunks().LIT, "applyMaterial", [
    ["svnoise(vec2<f32>(hc, y) * 6.0)", "near > 0.0"],            // mid 1 fine grain
    ["abs(fract(y / 1.25) - 0.5) - 0.46", "near > 0.0"],           // mid 1 wall course line
    ["smoothstep(mortAA, 0.0, min(bx", "near > 0.0"],              // mid 2 mortar joint (mix t == 0)
    ["smoothstep(mullAA, 0.0, min(gx", "near > 0.0"],              // mid 3 mullion bar
    ["mix(rough, min(rough, 0.12), near)", "near > 0.0"],          // mid 3 glass gloss (mix t == 0)
    ["svnoise(vec2<f32>(hc * 40.0, y * 2.0))", "brushFade > 0.0"], // mid 4 brushed metal
    ["svnoise(vec2<f32>(hc * 3.0, y * 22.0))", "near > 0.0"],      // mid 5 grain
    ["abs(fract(hc / 0.35) - 0.5) - 0.46", "near > 0.0"],          // mid 5 plank seam
    ["svnoise(wpos.xz * 9.0)", "near > 0.0"],                      // mid 6 fine octave
    ["svnoise(vec2<f32>(hc, y) * 26.0)", "weaveFade > 0.0"],       // mid 7 weave
    ["svnoise(wpos.xz * 5.0)", "near > 0.0"],                      // mid 8 fine term
    ["svnoise(wpos.xz * 14.0)", "near > 0.0"],                     // mid 9 fine octave
    ["svnoise(wpos.xz * 24.0)", "sparkleFade > 0.0"],              // mid 11 sparkle
    ["floor(y / 0.34)) * 3.0)", "near > 0.0"],                     // mid 12 per-row noise
    ["hash21(cell)", "near > 0.0"],                                // mid 13 block joint (mix t == 0)
    ["svnoise(wpos.xz * 7.0)", "near > 0.0"],                      // mid 16 fine term
  ]);
});

test("sky day-gradient LIFE and the lit mist cloudFBM sit inside their exact-zero gates", () => {
  const c = loadChunks();
  assertGated(c.SKY, "fs_main", [
    ["mix(c, deepBlue, 0.30)", "bandLM > 0.0"],
    ["mix(c, deepBlue, 0.30)", "overcast < 1.0"],
    ["vnoise(vec2<f32>(atan2(dir.z, dir.x)", "azFade > 0.0"],
    ["vnoise(vec2<f32>(atan2(dir.z, dir.x)", "overcast < 1.0"],
  ]);
  assertGated(c.LIT, "fs_main", [["cloudFBM(mp)", "dRamp > 0.0"]]);
});

test("cloudShadow: the second cloud octave runs only after the edge0 early-out", () => {
  const lit = loadChunks().LIT;
  const [a, b] = fnSpan(lit, "cloudShadow");
  const body = stripComments(lit.slice(a, b));
  const exit = body.indexOf("<= edge0) { return 0.0; }");
  assert.ok(exit > 0, "cloudShadow has the edge0 early-out");
  const calls = [];
  for (let i = body.indexOf("svnoise("); i >= 0; i = body.indexOf("svnoise(", i + 1)) calls.push(i < exit);
  assert.deepEqual(calls, [true, false], "one octave before the exit, one after");
});

test("cloudShadow edge0 early-out is exact: it fires only where the full smoothstep is 0 (float32)", () => {
  const f = Math.fround;
  const fract = (x) => f(x - Math.floor(x));
  const hash21 = (x, y) => {
    let px = fract(f(x * f(123.34))), py = fract(f(y * f(456.21)));
    const d = f(f(px * f(px + f(45.32))) + f(py * f(py + f(45.32))));
    px = f(px + d); py = f(py + d);
    return fract(f(px * py));
  };
  const mix = (a, b, t) => f(f(a * f(1 - t)) + f(b * t));
  const svnoise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = fract(x), fy = fract(y);
    fx = f(f(fx * fx) * f(3 - f(2 * fx))); fy = f(f(fy * fy) * f(3 - f(2 * fy)));
    return mix(mix(hash21(ix, iy), hash21(ix + 1, iy), fx), mix(hash21(ix, iy + 1), hash21(ix + 1, iy + 1), fx), fy);
  };
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, f(f(x - e0) / f(e1 - e0)))); return f(f(t * t) * f(3 - f(2 * t))); };
  let fired = 0, seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let n = 0; n < 20000; n++) {
    const x = f(rnd() * 400 - 200), y = f(rnd() * 400 - 200), cover = f(0.002 + rnd() * 0.998);
    const edge0 = f(0.54 - f(cover * 0.4));
    const s1 = f(0.5 * svnoise(x, y));
    const s = f(s1 + f(0.25 * svnoise(f(f(x * 2.03) + 1.7), f(f(y * 2.03) + 1.7))));
    if (f(s1 + 0.2501) <= edge0) {
      fired++;
      assert.equal(f(smooth(edge0, 0.92, s) * cover), 0, `x=${x} y=${y} cover=${cover}`);
    }
  }
  assert.ok(fired > 1000, `the early-out fires on a real share of samples (${fired}/20000)`);
});
