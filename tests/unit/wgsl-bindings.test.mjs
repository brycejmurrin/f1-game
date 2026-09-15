import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

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
  vm.runInContext(`${CHUNKS_SOURCE}\nglobalThis.__CHUNKS = WGSLChunks;`, context);
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
  const broken = chunks.LIT.replace("roadMarkings(&albedo, &rough, vTrk, fwTrk, F.pitLane);",
    "roadMarkings(&albedo, &rough, vTrk, fwTrk, U.pitLane);");
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
