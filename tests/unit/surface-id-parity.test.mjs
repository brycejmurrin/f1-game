// surface-id-parity — a car surface id means the same thing in all three
// shading languages, or it means nothing.
//
// A Car3D surface id (js/car/car3d.js SURFACES) is not a uniform: it rides in
// the vertex stream and every backend's lit shader branches on it by hand.
// GLX writes `surfaceId == 24`, WGSL writes `surfaceId == 24`, TSL writes
// `surfaceId.equal(24.0)` — three hand-maintained copies of one table, in three
// languages, in three files. Adding a surface means editing all three, and
// forgetting one is silent: the id simply falls through to the default branch
// on that backend and the car looks subtly wrong there and nowhere else.
//
// backend-surface-parity.test.mjs guards the JS METHOD surface. It does not see
// this: it passed unchanged through the commit that added SURFACES.visor to
// three shaders, because method names did not move. This file is the shader-side
// half of that guard.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

// The three lit shaders and how each spells "this fragment's surface is N".
const BACKENDS = {
  GLX: { file: "js/render/glx/shaders/glsl-lit.js", re: /surfaceId\s*==\s*(\d+)\b/g,
         bound: /classifiedCar\s*=\s*surfaceId\s*>=\s*20\s*&&\s*surfaceId\s*<=\s*(\d+)/ },
  WGX: { file: "js/render/webgpu/wgsl-chunks.js", re: /surfaceId\s*==\s*(\d+)\b/g,
         bound: /classifiedCar\s*=\s*surfaceId\s*>=\s*20\s*&&\s*surfaceId\s*<=\s*(\d+)/ },
  TLX: { file: "js/render/three/tsl-lit.js", re: /surfaceId\.equal\((\d+)(?:\.0)?\)/g,
         bound: /surfaceId\.lessThanEqual\((\d+)(?:\.0)?\)/ },
};

const idsIn = (b) => {
  const src = read(b.file);
  return { ids: new Set([...src.matchAll(b.re)].map((m) => Number(m[1]))),
           bound: Number((src.match(b.bound) || [])[1]) };
};

test("every car surface id is branched on in all three shading languages", () => {
  const seen = Object.fromEntries(Object.entries(BACKENDS).map(([k, b]) => [k, idsIn(b)]));
  // Tripwire: a regex that silently stops matching reads as "no gaps".
  for (const [name, { ids }] of Object.entries(seen))
    assert.ok(ids.size >= 8, `${name}: found only ${ids.size} surface-id branches — the scanner stopped matching`);

  const union = new Set(Object.values(seen).flatMap(({ ids }) => [...ids]));
  for (const [name, { ids }] of Object.entries(seen)) {
    const missing = [...union].filter((id) => !ids.has(id)).sort((a, b) => a - b);
    assert.deepEqual(missing, [],
      `${name} (${BACKENDS[name].file}) never branches on surface id ${missing.join(", ")} — ` +
      `the other backends do, so that surface silently falls through to the default there`);
  }
});

test("classifiedCar's upper bound covers every id each backend branches on", () => {
  for (const [name, b] of Object.entries(BACKENDS)) {
    const { ids, bound } = idsIn(b);
    assert.ok(Number.isFinite(bound), `${name}: could not read the classifiedCar upper bound`);
    const over = [...ids].filter((id) => id >= 20 && id > bound).sort((a, b2) => a - b2);
    assert.deepEqual(over, [],
      `${name}: surface id ${over.join(", ")} is branched on but sits ABOVE classifiedCar's ${bound}, ` +
      `so the branch is dead — the id takes the non-car path before it is ever reached`);
  }
});

test("every id the shaders branch on is a real Car3D surface, and vice versa", () => {
  const car3d = read("js/car/car3d.js");
  const block = car3d.slice(car3d.indexOf("const SURFACES = Object.freeze({"));
  const declared = new Set([...block.slice(0, block.indexOf("});")).matchAll(/:\s*(\d+)/g)]
    .map((m) => Number(m[1])).filter((n) => n >= 20));
  const finish = car3d.slice(car3d.indexOf("const FINISH_SURFACE = Object.freeze({"));
  for (const m of finish.slice(0, finish.indexOf("});")).matchAll(/:\s*(\d+)/g)) declared.add(Number(m[1]));
  assert.ok(declared.size >= 8, `only ${declared.size} car surfaces parsed — the scanner stopped matching`);

  const shader = idsIn(BACKENDS.GLX).ids;
  const ghosts = [...shader].filter((id) => id >= 20 && !declared.has(id)).sort((a, b) => a - b);
  assert.deepEqual(ghosts, [], `the shaders branch on surface id ${ghosts.join(", ")}, which car3d.js never assigns`);
  const unhandled = [...declared].filter((id) => !shader.has(id)).sort((a, b) => a - b);
  assert.deepEqual(unhandled, [], `car3d.js assigns surface id ${unhandled.join(", ")}, which no shader branches on`);
});

test("the visor's dielectric reflection constants agree across the three backends", () => {
  // Structural parity above proves each backend KNOWS about id 32. It does not
  // prove they treat it the same. The visor's whole fix is one pair of numbers —
  // the angle-independent mirror term, cut from glass's 0.14/0.72 so a tinted
  // visor stays dark head-on and keeps only its grazing rim — and tuning that
  // pair in one shader while the other two keep the old one is invisible until
  // somebody renders the same car on two backends and sees two visors.
  const pair = (file, re) => {
    const m = read(file).match(re);
    assert.ok(m, `${file}: could not find the visor's baseRefl override — has the fix been removed?`);
    return [Number(m[1]), Number(m[2])];
  };
  const got = {
    GLX: pair("js/render/glx/shaders/glsl-lit.js",
              /if\s*\(visorSurface\)\s*baseRefl\s*=\s*mix\(([\d.]+),\s*([\d.]+),\s*probeLive\)/),
    WGX: pair("js/render/webgpu/wgsl-chunks.js",
              /if\s*\(visorSurface\)\s*\{\s*baseRefl\s*=\s*mix\(([\d.]+),\s*([\d.]+),\s*probeLive\)/),
    TLX: pair("js/render/three/tsl-lit.js",
              /select\(visorSurface,\s*mix\(float\(([\d.]+)\),\s*float\(([\d.]+)\),\s*probeLive\)/),
  };
  const [g0, g1] = got.GLX;
  for (const [name, v] of Object.entries(got))
    assert.deepEqual(v, [g0, g1],
      `${name} reflects the visor at ${v.join("/")} but GLX uses ${g0}/${g1} — the same visor would look different per backend`);
  // ...and it must actually be dimmer than the chrome term it replaced, or the
  // override is present but doing nothing.
  assert.ok(g1 < 0.72 * 0.5,
    `the visor's live-probe mirror term is ${g1}, not meaningfully below glass's 0.72 — this is chrome again, which is the defect`);
});
