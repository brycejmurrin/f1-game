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

test("the baked normal map's tangent frame is the tile's world axes on every backend", () => {
  // Three copies of applyMaterialTexNormal perturbed N along
  // `cross(up, N)` until 2026-10-01 — a frame that is degenerate on the ground
  // (N is up, so T was whatever tilt the procedural bump had left) and
  // mirrored on +x / -z walls. The tile coordinate is world (x, z) on the
  // ground and (hc, y) on walls, so the frame must be those axes, picked by
  // the same an.x > an.z test matTexUV uses — in every language, or the same
  // brick wall lights differently per backend
  // (the graphics-detail survey note of 2026-10-01, PR #656).
  const body = (file, start) => {
    const src = read(file);
    const i = src.indexOf(start);
    assert.ok(i >= 0, `${file}: ${start} not found`);
    return src.slice(i, i + 4000);
  };
  const fns = {
    GLX: body("js/render/glx/shaders/glsl-lit.js", "void applyMaterialTexNormal("),
    WGX: body("js/render/webgpu/wgsl-chunks.js", "fn applyMaterialTexNormal("),
    TLX: body("js/render/three/tsl-lit.js", "const applyMaterialTexNormal ="),
  };
  for (const [name, s] of Object.entries(fns)) {
    const fn = s.slice(0, s.indexOf("\n}\n") > 0 ? s.indexOf("\n}\n") : s.length);
    assert.ok(!/cross\(/.test(fn),
      `${name}: applyMaterialTexNormal builds its tangent frame with cross() again — degenerate on the ground, mirrored on two wall faces`);
    assert.ok(/an\.x\s*>\s*an\.z|an\.x\.greaterThan\(an\.z\)/.test(fn),
      `${name}: the tangent frame must pick the wall axis with the same an.x > an.z test as matTexUV`);
    assert.ok(/\(0\.0,\s*0\.0,\s*1\.0\)/.test(fn) && /\(1\.0,\s*0\.0,\s*0\.0\)/.test(fn) && /\(0\.0,\s*1\.0,\s*0\.0\)/.test(fn),
      `${name}: the tangent frame must be built from the world axes (+x, +y, +z), not derived from N`);
  }
});

test("puddles follow the road shape on every backend — crown drains, the low side of a camber pools", () => {
  // The puddle mask was value noise on a flat threshold until 2026-10-01: water
  // pooled equally on the crown and in the gutter and a banked turn held it on
  // the high side (the second graphics-detail survey, item 13). On the road
  // ribbon the noise is weighted 0.7 (centre) → 1.2 (edge) and by the lateral
  // downhill read from the screen derivatives of trk.y against the geometric
  // normal — the same constants in every language.
  const wet = (file, start, end) => { const src = read(file); const i = src.indexOf(start); assert.ok(i >= 0, start); return src.slice(i, src.indexOf(end, i)); };
  const glx = wet("js/render/glx/shaders/glsl-lit.js", "float pn = vnoise(vWorldPos.xz", "RAIN RIPPLES");
  assert.match(glx, /mix\(0\.7, 1\.2, abs\(lat\)\) \* clamp\(1\.0 \+ downhill \* lat \* 4\.0, 0\.5, 1\.5\)/);
  assert.match(read("js/render/glx/shaders/glsl-lit.js"), /vec2 trkRightXZ = dFdx\(vWorldPos\.xz\) \* dFdx\(vTrk\.y\) \+ dFdy\(vWorldPos\.xz\) \* dFdy\(vTrk\.y\)/);
  assert.match(glx, /dot\(trkRightXZ \/ rl, Ngeo\.xz\)/);
  assert.match(glx, /smoothstep\(0\.48, 0\.88, pn \* pool\) \* wet/);
  const tlx = wet("js/render/three/tsl-lit.js", "const pn = vnoise(wp.xz", "RAIN RIPPLES");
  assert.match(tlx, /mix\(float\(0\.7\), float\(1\.2\), abs\(lat\)\)\.mul\(clamp\(float\(1\.0\)\.add\(downhill\.mul\(lat\)\.mul\(4\.0\)\), 0\.5, 1\.5\)\)/);
  assert.match(read("js/render/three/tsl-lit.js"), /const trkRightXZ = trkA \? dFdx\(wp\.xz\)\.mul\(dFdx\(trkA\.y\)\)\.add\(dFdy\(wp\.xz\)\.mul\(dFdy\(trkA\.y\)\)\)/);
  assert.match(tlx, /dot\(trkRightXZ\.div\(rl\), Ngeo\.xz\)\.negate\(\)/);
  assert.match(tlx, /smoothstep\(0\.48, 0\.88, pn\.mul\(pool\)\)\.mul\(wet\)/);
  const wgx = wet("js/render/webgpu/wgsl-chunks.js", "let pn = svnoise(in.wpos.xz", "RAIN RIPPLES");
  assert.match(wgx, /mix\(0\.7, 1\.2, abs\(lat\)\) \* clamp\(1\.0 \+ downhill \* lat \* 4\.0, 0\.5, 1\.5\)/);
  assert.match(read("js/render/webgpu/wgsl-chunks.js"), /let trkRightXZ = dpdx\(in\.wpos\.xz\) \* dpdx\(vTrk\.y\) \+ dpdy\(in\.wpos\.xz\) \* dpdy\(vTrk\.y\)/, "WGX takes the derivatives before the first branch (uniform control flow)");
  assert.match(wgx, /-dot\(trkRightXZ \/ rl, Ngeo\.xz\)/);
  assert.match(wgx, /smoothstep\(0\.48, 0\.88, pn \* pool\) \* wet/);
});

test("particles are lit by the frame hemisphere and fogged by the lit pass's fog on every backend", () => {
  // Every particle was unlit and unfogged until 2026-10-01 (the second
  // graphics-detail survey, item 9): the alpha group must read the hemisphere
  // ambient on the quad's up plus a wrap of the key with a floodlit floor, and
  // both groups must apply the lit pass's exp² fog on the eye distance.
  const g = read("js/render/glx/shaders/glsl-fx.js");
  const glx = g.slice(g.indexOf("const PARTICLE_FS"), g.indexOf("const LINE_VS"));
  assert.match(glx, /mix\(uAmbGround, uAmbSky, vUV\.y \* 0\.5 \+ 0\.5\) \+ uSunColor \* 0\.45/);
  assert.match(glx, /max\(lit, vec3\(0\.18\)\)/);
  assert.match(glx, /float fog = 1\.0 - exp\(-fd \* fd\);/);
  const t = read("js/render/three/tsl-fx.js");
  const tlx = t.slice(t.indexOf("function particleMaterial"), t.indexOf("const decalCache"));
  assert.match(tlx, /mix\(vec3\(U\.ambGround\), vec3\(U\.ambSky\), up\)\.add\(vec3\(U\.sunColor\)\.mul\(0\.45\)\)/);
  assert.match(tlx, /max\(lit, vec3\(0\.18\)\)/);
  assert.match(tlx, /exp\(fd\.mul\(fd\)\.negate\(\)\)/);
  assert.match(t, /U\.fogDensity\.value = \(frame\.fogDensity != null \? frame\.fogDensity : 0\) \* k\("fogDensityMul", 1\)/, "TLX refreshes the fog uniform per frame");
  const w = read("js/render/webgpu/wgsl-fx.js");
  const wgx = w.slice(w.indexOf("const PARTICLE ="), w.indexOf("// 2c. LINE"));
  assert.match(wgx, /mix\(U\.ambGnd\.xyz, U\.ambSky\.xyz, in\.uv\.y \* 0\.5 \+ 0\.5\) \+ U\.sunFog\.xyz \* 0\.45/);
  assert.match(wgx, /max\(lit, vec3<f32>\(0\.18\)\)/);
  assert.match(wgx, /let fog = 1\.0 - exp\(-fd \* fd\);/);
  assert.match(wgx, /size 144/);
  assert.match(w, /PARTICLE_UNIFORM_BYTES:\s+144/);
  assert.match(read("js/render/webgpu/wgx.js"), /writeBuffer\(particleUBO\[i\], 0, s, 0, 36\)/, "WGX uploads all 36 floats of ParticleU");
});

test("the sun disc sits behind the cloud deck on every backend", () => {
  // The cloud pass hoists the coverage along the ray (GLX cityCov, TLX cityCov,
  // WGX covRay) and the stars and the moon already fade by it; until 2026-10-01
  // the sun corona and disc were ADDED after the clouds with only the global
  // overcast damp, so a cumulus passing over the sun never hid the disc (the
  // second graphics-detail survey, item 12). The disc and the tight ring must
  // carry the full (1 − coverage); the aureole most of it.
  const block = (file, start) => {
    const src = read(file);
    const i = src.indexOf(start);
    assert.ok(i >= 0, `${file}: ${start} not found`);
    return src.slice(i, i + 3200);
  };
  const b = {
    GLX: block("js/render/glx/shaders/glsl-sky.js", "float coronaDamp = "),
    TLX: block("js/render/three/tsl-sky.js", "const coronaDamp = "),
    WGX: block("js/render/webgpu/wgsl-chunks.js", "let coronaDamp = "),
  };
  const discLine = (s, re) => { const m = re.exec(s); assert.ok(m, "no disc line"); return m[0]; };
  assert.match(discLine(b.GLX, /float disc = [^\n]*/), /\* sunClear;/, "GLX: the disc must be scaled by the ray's cloud coverage");
  assert.match(b.GLX, /float sunClear = 1\.0 - cityCov;/);
  assert.match(discLine(b.GLX, /uSunCorona[^\n]*/), /\* sunClear/, "GLX: the tight ring too");
  assert.match(discLine(b.TLX, /const disc = [\s\S]*?toVar\(\);/), /cityCov\.oneMinus\(\)/, "TLX: the disc must be scaled by cityCov");
  assert.match(discLine(b.TLX, /U\.sunCorona[^\n]*/), /cityCov\.oneMinus\(\)/, "TLX: the tight ring too");
  assert.match(discLine(b.WGX, /let disc = [^\n]*/), /\(1\.0 - covRay\)/, "WGX: the disc must be scaled by covRay");
  assert.match(discLine(b.WGX, /sunCorona \* coronaDamp[^\n]*/), /\(1\.0 - covRay\)/, "WGX: the tight ring too");
});

test("the moon disc hangs on the night key light, not a constant, on every backend", () => {
  // Three sky shaders drew the moon at a literal (0.42, 0.72, 0.55) until
  // 2026-10-01 while the lit pass, the wet-road glint and the shadow map used
  // the palette's sunDir (which at night IS the moon key — the NIGHT gate
  // comment in glsl-sky.js). Singapore's moon sat up-left of the pit straight
  // with the shadows falling toward it (the second graphics-detail survey).
  const moonBlock = (file, start) => {
    const src = read(file);
    const i = src.indexOf(start);
    assert.ok(i >= 0, `${file}: ${start} not found`);
    return src.slice(i, i + 600);
  };
  const blocks = {
    GLX: moonBlock("js/render/glx/shaders/glsl-sky.js", "if (uMoon > 0.0 && uStars > 0.5)"),
    TLX: moonBlock("js/render/three/tsl-sky.js", "If(U.moon.greaterThan(0.0).and(U.stars.greaterThan(0.5))"),
    WGX: moonBlock("js/render/webgpu/wgsl-chunks.js", "if (moon > 0.0 && stars > 0.5)"),
  };
  for (const [name, s] of Object.entries(blocks)) {
    assert.ok(!/moonDir\s*=\s*normalize\(vec3(<f32>)?\(\s*[\d.]+,\s*[\d.]+,\s*[\d.]+\s*\)\)/.test(s),
      `${name}: the moon disc direction is a literal vector again — it must follow the night key light`);
    assert.ok(/moonDir\s*=\s*normalize\((uSunDir|U\.sunDir|sunDir)\)/.test(s),
      `${name}: the moon disc must be placed on the sun/moon key direction uniform`);
  }
});

test("car materials: wet look, ground AO, metal env, sidewall and carbon agree on every backend", () => {
  // The car-material batch of 2026-10-03, pinned constant for constant. Each
  // backend spells the same maths in its own language, and a drift here is a
  // car that looks different on one renderer and nowhere else.
  const src = {
    GLX: read("js/render/glx/shaders/glsl-lit.js"),
    TLX: read("js/render/three/tsl-lit.js"),
    WGX: read("js/render/webgpu/wgsl-chunks.js"),
  };
  const pins = {
    // The road's world-keyed wet block (noise puddles, ripple cells) must not
    // reach a car: in rain they slid across the moving body.
    roadWetSkipsCars: { GLX: /if \(uWetness > 0\.001 && !classifiedCar\)/,
                        TLX: /If\(U\.wetness\.greaterThan\(0\.001\)\.and\(classifiedCar\.not\(\)\)/,
                        WGX: /if \(wetness > 0\.001 && !classifiedCar\)/ },
    carWetDarken: { GLX: /albedo \*= 1\.0 - 0\.20 \* uWetness;/,
                    TLX: /albedo\.mulAssign\(U\.wetness\.mul\(0\.20\)\.oneMinus\(\)\)/,
                    WGX: /albedo = albedo \* \(1\.0 - 0\.20 \* wetness\);/ },
    carWetGloss: { GLX: /rough \*= 1\.0 - 0\.25 \* uWetness;/,
                   TLX: /rough\.mulAssign\(U\.wetness\.mul\(0\.25\)\.oneMinus\(\)\)/,
                   WGX: /rough = rough \* \(1\.0 - 0\.25 \* wetness\);/ },
    groundAO: { GLX: /1\.0 - smoothstep\(0\.02, 0\.40, vObjPos\.y\)[\s\S]{0,40}vec3 amb = mix\(uAmbGround \* \(1\.0 - 0\.50 \* gpao\), uAmbSky \* \(1\.0 - 0\.06 \* gpao\)/,
                TLX: /smoothstep\(0\.02, 0\.40, objP\.y\)\.oneMinus\(\)[\s\S]{0,80}mul\(gpao\.mul\(0\.50\)\.oneMinus\(\)\)[\s\S]{0,40}mul\(gpao\.mul\(0\.06\)\.oneMinus\(\)\)/,
                WGX: /1\.0 - smoothstep\(0\.02, 0\.40, in\.objPos\.y\)[\s\S]{0,120}F\.ambGround\.xyz \* \(1\.0 - 0\.50 \* gpao\), F\.ambSky\.xyz \* \(1\.0 - 0\.06 \* gpao\)/ },
    metalEnv: { GLX: /F_Schlick\(NoV, albedo, 1\.0 - rough \* 0\.5\) \* \(metalness \* \(1\.0 - rough \* 0\.7\) \* ccTrans\)/,
                TLX: /F_Schlick\(NoV, albedo, rough\.mul\(0\.5\)\.oneMinus\(\)\)\)\s*\.mul\(metalness\.mul\(rough\.mul\(0\.7\)\.oneMinus\(\)\)\.mul\(ccTrans\)\)/,
                WGX: /F_Schlick\(NoV, albedo, 1\.0 - rough \* 0\.5\) \* \(metalness \* \(1\.0 - rough \* 0\.7\) \* ccTrans\)/ },
    sidewallRough: { GLX: /if \(sidewallSurface\) rough = clamp\(rough, 0\.55, 0\.65\);/,
                     TLX: /If\(sidewallSurface, \(\) => \{ rough\.assign\(clamp\(rough, 0\.55, 0\.65\)\); \}\)/,
                     WGX: /if \(sidewallSurface\) \{ rough = clamp\(rough, 0\.55, 0\.65\); \}/ },
    carbonLacquer: { GLX: /\(carbonSurface \|\| carbonFinish\) \? min\(uClearcoat, 0\.30\)/,
                     TLX: /select\(carbonSurface\.or\(carbonFinish\), min\(matU\.clearcoat, 0\.30\)/,
                     WGX: /if \(carbonSurface \|\| carbonFinish\) \{ clearcoat = min\(D\.mat1\.z, 0\.30\); \}/ },
    weaveNormal: { GLX: /N = normalize\(N \+ \(wT \* wvT\.x \+ wB \* wvT\.y\) \* 0\.18\);/,
                   TLX: /N\.assign\(normalize\(N\.add\(wT\.mul\(wvT\.x\)\.add\(wB\.mul\(wvT\.y\)\)\.mul\(0\.18\)\)\)\)/,
                   WGX: /N = normalize\(N \+ \(wT \* wvT\.x \+ wB \* wvT\.y\) \* 0\.18\);/ },
  };
  for (const [what, by] of Object.entries(pins))
    for (const [name, re] of Object.entries(by))
      assert.match(src[name], re, `${name}: ${what} drifted from the other two backends`);
  // The ground AO is an AMBIENT term: it may never multiply the final colour.
  for (const [name, s] of Object.entries(src))
    assert.ok(!/color\s*(\*=|\.mulAssign\()[^;\n]*gpao/.test(s) && !/color = color \*[^;\n]*gpao/.test(s),
      `${name}: the ground AO darkens the whole colour — it must stay on the ambient term`);
});

// Full-line comments out, so prose that names a statement cannot satisfy or
// trip a pin on it.
const code = (p) => read(p).replace(/^[ \t]*\/\/.*$/gm, "");

test("lamps and the baked lamp pools light the base BEFORE the lacquer's ccTrans absorb on every backend", () => {
  // The clearcoat env mirror darkens the base it sits over (color *= ccTrans)
  // and then adds the reflection. GLX and TLX run the bake + punctual-lamp loop
  // before that multiply; WGX ran them after it, so at night car paint, glass
  // and visors took lamp light the other two darken (~1.4x face-on).
  const order = {
    GLX: ["js/render/glx/shaders/glsl-lit.js", /for \(int i = 0; i < MAX_LIGHTS; i\+\+\)/, /float bakeW = /,
          /color = max\(color, vec3\(0\.0\)\);/, /color \*= ccTrans;/],
    TLX: ["js/render/three/tsl-lit.js", /Loop\(\{ start: int\(0\), end: int\(MAX_LIGHTS\)/, /const bakeW = /,
          /color\.assign\(max\(color, vec3\(0\.0\)\)\);/, /color\.mulAssign\(ccTrans\)/],
    WGX: ["js/render/webgpu/wgsl-chunks.js", /let r = lampContrib\(/, /let bakeW = /,
          /color = max\(color, vec3<f32>\(0\.0\)\);/, /color = color \* ccTrans;/],
  };
  for (const [name, [file, lamp, bake, clamp, cc]] of Object.entries(order)) {
    const s = code(file);
    const at = (re) => { const m = s.match(re); assert.ok(m, `${name}: ${re} not found in ${file}`); return m.index; };
    const ccAt = at(cc);
    assert.equal(s.match(new RegExp(cc.source, "g")).length, 1, `${name}: expected exactly one ccTrans absorb`);
    for (const [what, re] of [["the first lamp loop", lamp], ["the baked lamp-pool weight", bake], ["the >= 0 clamp after the lamps", clamp]])
      assert.ok(at(re) < ccAt, `${name}: ${what} runs AFTER the lacquer's ccTrans absorb — lamp light escapes the darkening the other backends apply`);
  }
  // WGX has two loops (per-chunk baked + global); neither may follow the absorb.
  const w = code("js/render/webgpu/wgsl-chunks.js");
  const wcc = w.indexOf("color = color * ccTrans;");
  const calls = [...w.matchAll(/let r = lampContrib\(/g)].map((m) => m.index);
  assert.equal(calls.length, 2, "WGX: expected the per-chunk and the global lamp loop");
  assert.ok(calls.every((i) => i < wcc), "WGX: a lampContrib loop runs after color = color * ccTrans");
});

test("road paint reaches the edge lines on WGX: roadMarkings is not gated on the asphalt id", () => {
  // GLX/TLX call roadMarkings on every fragment (it returns on hw <= 0.5). WGX
  // gated it on vMatId == 16, but its road ids come from the LUT with an inset,
  // so the 0.2 m edge-line band was never asphalt and never painted.
  const glx = code("js/render/glx/shaders/glsl-lit.js");
  assert.match(glx, /applyMaterial\(int\(vMat \+ 0\.5\), albedo, rough, vDist\);\s*\n\s*roadMarkings\(albedo, rough\);/,
    "GLX: roadMarkings follows applyMaterial unconditionally (the reference)");
  const w = code("js/render/webgpu/wgsl-chunks.js");
  const call = w.indexOf("roadMarkings(&albedo, &rough, vTrk, fwTrk, F.pitLane, F.pitBox);");
  assert.ok(call > 0, "WGX: the roadMarkings call moved — re-point this pin");
  const before = w.slice(w.lastIndexOf("applyMaterial(i32(vMatId + 0.5)", call), call);
  assert.ok(before.length > 0 && !/vMatId[^;\n]*== 16|if \(/.test(before),
    "WGX: roadMarkings is gated again (" + before.trim().split("\n").pop() + ") — the edge lines sit outside the asphalt id");
  // The surface under the paint: GLX stamps ASPHALT out to |x| = hw, so the
  // per-fragment LUT inset must stay inside the 0.2 m edge-line band.
  const inset = w.match(/let lutAsphalt = abs\(fromWorld\.y\) < fromWorld\.z - ([\d.]+);/);
  assert.ok(inset, "WGX: the per-fragment asphalt classification moved — re-point this pin");
  assert.ok(Number(inset[1]) <= 0.2,
    `WGX: the asphalt inset ${inset[1]} m leaves bare FLAT tarmac outside the edge line, where GLX has ASPHALT`);
});

test("the baked normal map has its own fade on WGX, not the procedural bump's early returns", () => {
  // GLX/TLX apply the baked map as a separate call after the procedural bump.
  // WGX called it from INSIDE applyMaterialNormal, after that function's own
  // footprint early-returns, so the baked relief cut out in a seam well inside
  // its own (fp/sc - 0.02)/0.30 fade.
  const w = code("js/render/webgpu/wgsl-chunks.js");
  const body = w.match(/fn applyMaterialNormal\([^)]*\)[^{]*\{[\s\S]*?\n\}/);
  assert.ok(body, "WGX: fn applyMaterialNormal not found");
  assert.ok(!/applyMaterialTexNormal\(/.test(body[0]),
    "WGX: applyMaterialNormal calls applyMaterialTexNormal again — the baked map inherits the bump's early returns");
  const bump = w.indexOf("applyMaterialNormal(i32(vMatId + 0.5), &N");
  const tex = w.indexOf("applyMaterialTexNormal(i32(vMatId + 0.5), &N");
  assert.ok(bump > 0 && tex > bump, "WGX fs_main: applyMaterialTexNormal must run right after applyMaterialNormal, as GLX does");
  const glx = code("js/render/glx/shaders/glsl-lit.js");
  assert.match(glx, /applyMaterialNormal\(int\(vMat \+ 0\.5\), N, vDist\);\s*\n\s*applyMaterialTexNormal\(int\(vMat \+ 0\.5\), N, vDist\);/,
    "GLX: the two normal calls are separate statements (the reference)");
});

test("no material pack means no baked mix on WGX, as on GLX", () => {
  // GLX uploads uMatTexMix = matAlbedoTex ? mix : 0. WGX packed the knob
  // regardless, and the 1x1 placeholder's alpha 255 read as roughness 1.0, so
  // a failed or pending pack pushed every world surface toward matte.
  assert.match(code("js/render/glx/glx.js"), /"matTexMix", matAlbedoTex \? mix : 0\)/, "GLX reference moved — re-point this pin");
  const d135 = code("js/render/webgpu/wgx.js").match(/d\[135\] = ([^;]+);/);
  assert.ok(d135, "WGX: the params8.w (matTexMix) write moved — re-point this pin");
  assert.match(d135[1], /^_matAlbedoOn \?[\s\S]*: 0$/,
    `WGX: d[135] = ${d135[1]} — it must be 0 unless a baked albedo array is bound`);
  // ...and a MAT with no baked layer (scale 0) keeps its procedural look on the
  // hoisted path too (GLX matTexUV and TLX both require scale > 0).
  const w = code("js/render/webgpu/wgsl-chunks.js");
  const fn = w.match(/fn applyMaterial\([^)]*\)[^{]*\{[\s\S]*?\n\}/);
  assert.ok(fn, "WGX: fn applyMaterial not found");
  assert.match(fn[0], /let hoisted = packOn && [^;]*matScale\(mid\) > 0\.0;/,
    "WGX: the hoisted baked-albedo path must require matScale(mid) > 0, as GLX/TLX do");
});
