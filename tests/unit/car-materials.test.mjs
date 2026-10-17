// car-materials — surface ids, finish remaps, palette, and the shade contract
// the three lit backends must keep in lockstep (finish pass).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function loadMaterials() {
  const cx = {
    console, Math, Object, Array, Float32Array, Float64Array, Map, Set,
    Uint32Array, Uint8Array, Int32Array, JSON, Number, String, Boolean,
  };
  cx.globalThis = cx;
  vm.createContext(cx);
  vm.runInContext(read("js/car/car-material-shade.js"), cx, { filename: "car-material-shade.js" });
  vm.runInContext(read("js/car/car-materials.js"), cx, { filename: "car-materials.js" });
  const grab = (n) => vm.runInContext(n, cx);
  return { CarMaterials: grab("CarMaterials"), CarMaterialShade: grab("CarMaterialShade") };
}

test("CarMaterials exposes SURFACES, FINISH_SURFACE, palette and SHADE", () => {
  const { CarMaterials, CarMaterialShade } = loadMaterials();
  assert.equal(CarMaterials.SURFACES.paint, 20);
  assert.equal(CarMaterials.SURFACES.carbon, 21);
  assert.equal(CarMaterials.SURFACES.metal, 23);
  assert.equal(CarMaterials.FINISH_SURFACE.matte, 28);
  assert.equal(CarMaterials.FINISH_SURFACE.carbon, 31);
  assert.ok(!("gloss" in CarMaterials.FINISH_SURFACE), "gloss is the default — no remap row");
  assert.ok(CarMaterials.HALO[2] > CarMaterials.HALO[0] - 0.01, "titanium skews cool");
  assert.ok(CarMaterials.CARBON[0] < 0.07, "carbon resin stays deep so weave contrast reads");
  assert.ok(CarMaterials.EXHAUST, "exhaust metal palette is exported");
  assert.equal(CarMaterials.SHADE, CarMaterialShade);
  assert.equal(CarMaterialShade.MATTE.clearcoat, 0);
  assert.ok(CarMaterialShade.MATTE.roughFloor >= 0.90, "matte stays chalkier than satin/panel");
  assert.ok(CarMaterialShade.CARBON.lacquer > 0.30, "carbon lacquer glints");
  assert.ok(CarMaterialShade.GLOSS.peelAmp > 0.22, "gloss peel reads at garage distance");
  assert.ok(CarMaterialShade.METAL.darkEnvBoost > 0, "dark titanium gets an env boost");
});

test("applyFinish remaps paint only; matte stays id 28", () => {
  const { CarMaterials } = loadMaterials();
  const { SURFACES, FINISH_SURFACE, applyFinish } = CarMaterials;
  const out = {
    mat: [SURFACES.paint, SURFACES.carbon, SURFACES.metal, SURFACES.paint],
    pos: [], col: [], nrm: [],
  };
  applyFinish(out, "matte");
  assert.deepEqual(out.mat, [FINISH_SURFACE.matte, SURFACES.carbon, SURFACES.metal, FINISH_SURFACE.matte]);
  applyFinish(out, "gloss"); // no-op — gloss is absent from FINISH_SURFACE
  assert.equal(out.mat[0], FINISH_SURFACE.matte);
});

test("shade contract numbers appear in all three lit backends", () => {
  const { CarMaterialShade } = loadMaterials();
  const { CARBON: C, GLOSS: G, MATTE: M, METAL: Met } = CarMaterialShade;
  const src = {
    GLX: read("js/render/glx/shaders/glsl-lit.js"),
    TLX: read("js/render/three/tsl-lit.js"),
    WGX: read("js/render/webgpu/wgsl-chunks.js"),
  };
  const pins = [
    ["carbon lacquer", String(C.lacquer), {
      GLX: new RegExp(`min\\(uClearcoat, ${C.lacquer}\\)`),
      TLX: new RegExp(`min\\(matU\\.clearcoat, ${C.lacquer}\\)`),
      WGX: new RegExp(`clearcoat = min\\(D\\.mat1\\.z, ${C.lacquer}\\)`),
    }],
    ["weave normal", String(C.normalAmp), {
      GLX: new RegExp(`\\* ${C.normalAmp}\\)`),
      TLX: new RegExp(`\\.mul\\(${C.normalAmp}\\)`),
      WGX: new RegExp(`\\* ${C.normalAmp}\\)`),
    }],
    ["matte rough", String(M.roughFloor), {
      GLX: new RegExp(`matteSurface\\) rough = max\\(rough, ${M.roughFloor}\\)`),
      TLX: new RegExp(`matteSurface.*max\\(rough, ${M.roughFloor}\\)`),
      WGX: new RegExp(`matteSurface\\) \\{ rough = max\\(rough, ${M.roughFloor}\\)`),
    }],
    ["matte specular", String(M.specular), {
      GLX: new RegExp(`matteSurface \\? ${M.specular}`),
      TLX: new RegExp(`matteSurface, float\\(${M.specular}\\)`),
      WGX: new RegExp(`matteSurface\\) \\{ specular = ${M.specular}`),
    }],
    ["gloss peel", String(G.peelAmp), {
      GLX: new RegExp(`${G.peelAmp} \\* carPaint \\* pFade`),
      TLX: new RegExp(`\\.mul\\(${G.peelAmp}\\)`),
      WGX: new RegExp(`${G.peelAmp} \\* amt \\* pFade`),
    }],
    ["metalness floor", String(Met.metalnessFloor), {
      GLX: new RegExp(`metalSurface \\? max\\(uMetalness, ${Met.metalnessFloor}\\)`),
      TLX: new RegExp(`metalSurface, max\\(matU\\.metalness, ${Met.metalnessFloor}\\)`),
      WGX: new RegExp(`max\\(D\\.mat0\\.w, ${Met.metalnessFloor}\\), metalSurface`),
    }],
    ["carbon part albedo", `${C.partAlbedoMean} + ${C.partAlbedoAmp}`, {
      GLX: new RegExp(`albedo \\*= ${C.partAlbedoMean} \\+ ${C.partAlbedoAmp} \\* weave`),
      TLX: new RegExp(`weave\\.mul\\(${C.partAlbedoAmp}\\)\\.add\\(${C.partAlbedoMean}\\)`),
      WGX: new RegExp(`albedo \\* \\(${C.partAlbedoMean} \\+ ${C.partAlbedoAmp} \\* weave\\)`),
    }],
    ["dark metal env boost", String(Met.darkEnvBoost), {
      GLX: new RegExp(`\\* ${Met.darkEnvBoost}`),
      TLX: new RegExp(`\\.mul\\(${Met.darkEnvBoost}\\)`),
      WGX: new RegExp(`\\* ${Met.darkEnvBoost}`),
    }],
  ];
  for (const [what, _v, by] of pins) {
    for (const [name, re] of Object.entries(by)) {
      assert.match(src[name], re, `${name}: ${what} drifted from CarMaterialShade`);
    }
  }
  // Matte must never gain clearcoat — Racing Bulls factory finish stays chalky.
  assert.match(src.GLX, /matteSurface \? 0\.0/, "GLX: matte clearcoat stays 0");
  assert.match(src.TLX, /select\(matteSurface, float\(0\.0\)/, "TLX: matte clearcoat stays 0");
  assert.match(src.WGX, /if \(matteSurface\) \{ clearcoat = 0\.0; \}/, "WGX: matte clearcoat stays 0");
});

// ---- Garage finishes S3: tinted chrome (36) and chameleon (37) ----------------------------------------------

function shaderSources() {
  return {
    GLX: read("js/render/glx/shaders/glsl-lit.js"),
    TLX: read("js/render/three/tsl-lit.js"),
    WGX: read("js/render/webgpu/wgsl-chunks.js"),
  };
}

test("FINISH_SURFACE rows tinted 36 and chameleon 37 exist, in the reserved ids", () => {
  const { CarMaterials } = loadMaterials();
  assert.equal(CarMaterials.FINISH_SURFACE.tinted, 36);
  assert.equal(CarMaterials.FINISH_SURFACE.chameleon, 37);
  assert.equal(CarMaterials.FINISH_RESERVED.tinted, 36);
  assert.equal(CarMaterials.FINISH_RESERVED.chameleon, 37);
  // shipped rows unchanged and still first (the chip order is the key order)
  assert.deepEqual(Object.keys(CarMaterials.FINISH_SURFACE).slice(0, 6), ["satin", "chrome", "matte", "carbon", "brushed", "pearl"]);
  assert.equal(CarMaterials.FINISH_SURFACE.pearl, 30);
});

test("tinted/chameleon remap only paint vertices; gloss and unset stay byte-identical", () => {
  const { CarMaterials } = loadMaterials();
  const { SURFACES, applyFinish } = CarMaterials;
  for (const [name, id] of [["tinted", 36], ["chameleon", 37]]) {
    const out = { mat: [SURFACES.paint, SURFACES.carbon, SURFACES.glass, SURFACES.rubber, SURFACES.paint] };
    applyFinish(out, name);
    assert.deepEqual(out.mat, [id, SURFACES.carbon, SURFACES.glass, SURFACES.rubber, id]);
    const zone = { mat: [SURFACES.paint, SURFACES.paint] };
    applyFinish(zone, "gloss", [{ name: "mirrors", from: 0, to: 1 }], { mirrorFinish: name });
    assert.deepEqual(zone.mat, [id, SURFACES.paint]);
  }
  const base = { mat: [SURFACES.paint, SURFACES.carbon, SURFACES.paint] };
  applyFinish(base, "gloss");
  applyFinish(base, undefined);
  assert.deepEqual(base.mat, [SURFACES.paint, SURFACES.carbon, SURFACES.paint]);
});

test("the garage chip rows are derived from FINISH_SURFACE, so the new finishes appear (and only rendered ones)", () => {
  const { CarMaterials } = loadMaterials();
  const sheet = read("js/garage/setup-sheet.js");
  assert.match(sheet, /pillRow\("FINISH", "finish", \["gloss", \.\.\.Object\.keys\(Car3D\.FINISH_SURFACE\)\], "gloss"\)/);
  assert.match(sheet, /\["inherit", "gloss", \.\.\.Object\.keys\(Car3D\.FINISH_SURFACE\)\]/);
  const chips = ["gloss", ...Object.keys(CarMaterials.FINISH_SURFACE)];
  assert.ok(chips.includes("tinted") && chips.includes("chameleon"));
  // Rule: a row is only added once its branch exists in all three shaders.
  const src = shaderSources();
  for (const id of Object.values(CarMaterials.FINISH_SURFACE)) {
    assert.match(src.GLX, new RegExp(`surfaceId == ${id}\\b`), `GLX has no branch for finish id ${id}`);
    assert.match(src.WGX, new RegExp(`surfaceId == ${id}\\b`), `WGX has no branch for finish id ${id}`);
    assert.match(src.TLX, new RegExp(`surfaceId\\.equal\\(${id}\\.0\\)`), `TLX has no branch for finish id ${id}`);
  }
});

test("Teams.liveryEnumOk accepts the new finish names (derived from FINISH_SURFACE) and still refuses junk", () => {
  const { CarMaterials } = loadMaterials();
  const cx = vm.createContext({ console, Math, Object, Array, JSON, Number, String, Boolean, Map, Set });
  cx.Car3D = { FINISH_SURFACE: CarMaterials.FINISH_SURFACE };
  vm.runInContext(read("js/data/teams.js"), cx, { filename: "js/data/teams.js" });
  const Teams = vm.runInContext("Teams", cx);
  for (const f of ["gloss", "pearl", "tinted", "chameleon"]) assert.equal(Teams.liveryEnumOk("finish", f), true, f);
  for (const f of ["constructor", "tintedd"]) assert.equal(Teams.liveryEnumOk("finish", f), false, f);
});

test("tinted chrome: mirror response + livery-hue reflection, same numbers in GLX / TLX / WGX", () => {
  const { CarMaterialShade } = loadMaterials();
  const T = CarMaterialShade.TINTED;
  const src = shaderSources();
  const pins = {
    GLX: [/bool tintedSurface = surfaceId == 36;/, /bool mirrorSurface = surfaceId == 27 \|\| tintedSurface;/,
      new RegExp(`if \\(tintedSurface\\) addCC \\*= mix\\(vec3\\(1\\.0\\), albedo / max\\(max\\(albedo\\.r, max\\(albedo\\.g, albedo\\.b\\)\\), ${T.chromaFloor}\\), ${T.envTint}\\);`)],
    WGX: [/let tintedSurface = surfaceId == 36;/, /let mirrorSurface = surfaceId == 27 \|\| tintedSurface;/,
      new RegExp(`if \\(tintedSurface\\) \\{ addCC = addCC \\* mix\\(vec3<f32>\\(1\\.0\\), albedo / max\\(max\\(albedo\\.r, max\\(albedo\\.g, albedo\\.b\\)\\), ${T.chromaFloor}\\), vec3<f32>\\(${T.envTint}\\)\\); \\}`)],
    TLX: [/const tintedSurface = surfaceId\.equal\(36\.0\)\.toVar\(\);/, /const mirrorSurface = surfaceId\.equal\(27\.0\)\.or\(tintedSurface\)\.toVar\(\);/,
      new RegExp(`addCC\\.mulAssign\\(mix\\(vec3\\(1\\.0\\), albedo\\.div\\(max\\(max\\(albedo\\.r, max\\(albedo\\.g, albedo\\.b\\)\\), ${T.chromaFloor}\\)\\), ${T.envTint}\\)\\);`)],
  };
  for (const [name, res] of Object.entries(pins)) for (const re of res) assert.match(src[name], re, `${name}: tinted chrome drifted: ${re}`);
  // the whole lit colour takes the hue after the metal block (T.finalTint): a red car stays red instead of washing pink
  assert.equal(T.finalTint, true);
  const hue = `albedo / max\\(max\\(albedo\\.r, max\\(albedo\\.g, albedo\\.b\\)\\), ${T.chromaFloor}\\)`;
  assert.match(src.GLX, new RegExp(`if \\(tintedSurface\\) color \\*= ${hue};`));
  assert.match(src.WGX, new RegExp(`if \\(tintedSurface\\) \\{ color = color \\* \\(${hue}\\); \\}`));
  assert.match(src.TLX, new RegExp(`If\\(tintedSurface, \\(\\) => \\{\\s*color\\.mulAssign\\(albedo\\.div\\(max\\(max\\(albedo\\.r, max\\(albedo\\.g, albedo\\.b\\)\\), ${T.chromaFloor}\\)\\)\\);`));
  // the mirror response it inherits (chrome 27) is unchanged
  assert.match(src.GLX, /mirrorSurface \? max\(uClearcoat, 0\.85\)/);
  assert.match(src.GLX, /if \(mirrorSurface\) rough = min\(rough, 0\.09\);/);
});

test("chameleon: team hue face-on, fixed flip hue at grazing angles on the LIT colour, same numbers in GLX / TLX / WGX; pearl 30 untouched", () => {
  const { CarMaterialShade } = loadMaterials();
  const H = CarMaterialShade.CHAMELEON;
  const src = shaderSources();
  const f2 = (v) => v.toFixed(2);
  const lit = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));   // 1 -> "1.0", 0.25 -> "0.25": the spelling the shaders use
  const [r, g, b] = H.flipHue.map(lit);
  const lo = f2(H.flipFresLo), hi = f2(H.flipFresHi), w = f2(H.flipWeight);
  const pins = {
    GLX: [/bool chamSurface = surfaceId == 37;/, /bool iriSurface = surfaceId == 30 \|\| chamSurface;/,
      new RegExp(`chamFlip = smoothstep\\(${lo}, ${hi}, fres\\);`),
      new RegExp(`if \\(chamSurface\\) color \\*= mix\\(chamHue, vec3\\(${r}, ${g}, ${b}\\), chamFlip \\* ${w}\\);`)],
    WGX: [/let chamSurface = surfaceId == 37;/, /let iriSurface = surfaceId == 30 \|\| chamSurface;/,
      new RegExp(`chamFlip = smoothstep\\(${lo}, ${hi}, fres\\);`),
      new RegExp(`if \\(chamSurface\\) \\{ color = color \\* mix\\(chamHue, vec3<f32>\\(${r}, ${g}, ${b}\\), vec3<f32>\\(chamFlip \\* ${w}\\)\\); \\}`)],
    TLX: [/const chamSurface = surfaceId\.equal\(37\.0\)\.toVar\(\);/, /const iriSurface = surfaceId\.equal\(30\.0\)\.or\(chamSurface\)\.toVar\(\);/,
      new RegExp(`chamFlip\\.assign\\(smoothstep\\(${lo}, ${hi}, fres\\)\\);`),
      new RegExp(`color\\.mulAssign\\(mix\\(chamHue, vec3\\(${r}, ${g}, ${b}\\), chamFlip\\.mul\\(${w}\\)\\)\\);`)],
  };
  for (const [name, res] of Object.entries(pins)) for (const re of res) assert.match(src[name], re, `${name}: chameleon drifted: ${re}`);
  // pearl 30 keeps its own constants (1.4 sweep, 0.30..0.92 window, 0.40 weight) in every backend
  assert.match(src.GLX, /fres \* 1\.4\)\);[\s\S]{0,400}smoothstep\(0\.30, 0\.92, fres\) \* 0\.40/);
  assert.match(src.WGX, /fres \* 1\.4\)\)\);[\s\S]{0,500}smoothstep\(0\.30, 0\.92, fres\) \* 0\.40/);
  assert.match(src.TLX, /fres\.mul\(1\.4\)[\s\S]{0,400}smoothstep\(0\.30, 0\.92, fres\)\.mul\(0\.40\)/);
  // the flip window sits in the grazing half and keeps the face-on colour
  assert.ok(H.flipFresLo > 0.5 && H.flipWeight < 1.0);
});
