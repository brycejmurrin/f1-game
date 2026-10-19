// car-materials — surface ids, finish remaps, palette, and the shade contract
// the three lit backends must keep in lockstep (finish pass).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function loadMaterials() {
  const cx = {
    console, Math, Object, Array, Float32Array, Float64Array, Map, Set,
    Uint32Array, Uint8Array, Int32Array, JSON, Number, String, Boolean,
  };
  cx.globalThis = cx;
  vm.createContext(cx);
  vm.runInContext(read("js/car/car-material-shade.js"), cx, { filename: absSrc("js/car/car-material-shade.js") });
  vm.runInContext(read("js/car/car-materials.js"), cx, { filename: absSrc("js/car/car-materials.js") });
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

// C1-10 (short term): ONE table over every constant CarMaterialShade owns. The
// per-finish pins below check each formula's shape; this is the cross-dialect
// parity net — add a constant to CarMaterialShade, or change its number, and
// all three hand-maintained dialects must carry it (generating them at gen time
// is the follow-up). 0 / 1 are skipped: they appear in any shader.
test("every CarMaterialShade constant is spelled in GLX, TLX and WGX (table)", () => {
  const { CarMaterialShade } = loadMaterials();
  const src = shaderSources();
  const rows = [];
  for (const [family, obj] of Object.entries(CarMaterialShade)) {
    if (!obj || typeof obj !== "object") continue;
    for (const [key, v] of Object.entries(obj)) {
      const nums = typeof v === "number" ? [v] : Array.isArray(v) ? v.filter((x) => typeof x === "number") : [];
      for (const n of nums) if (n !== 0 && n !== 1) rows.push([`${family}.${key}`, n]);
    }
  }
  assert.ok(rows.length >= 60, `the table covers the shade contract (${rows.length} constants)`);
  const spellings = (n) => [...new Set([String(n), n.toFixed(1), n.toFixed(2), n.toFixed(3)])];
  const miss = [];
  for (const [what, n] of rows) for (const [dialect, text] of Object.entries(src)) {
    const hit = spellings(n).some((t) => new RegExp(`(?<![\\d.])${t.replace(/[.]/g, "\\.")}(?!\\d)`).test(text));
    if (!hit) miss.push(`${dialect}: ${what}=${n}`);
  }
  assert.deepEqual(miss, [], "shade constants missing from a dialect — the three backends have drifted from CarMaterialShade");
});

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
  vm.runInContext(read("js/data/teams.js"), cx, { filename: absSrc("js/data/teams.js") });
  const Teams = vm.runInContext("Teams", cx);
  for (const f of ["gloss", "pearl", "tinted", "chameleon"]) assert.equal(Teams.liveryEnumOk("finish", f), true, f);
  for (const f of ["constructor", "tintedd"]) assert.equal(Teams.liveryEnumOk("finish", f), false, f);
});

test("tinted chrome: mirror response + livery-hue reflection, same numbers in GLX / TLX / WGX", () => {
  const { CarMaterialShade } = loadMaterials();
  const T = CarMaterialShade.TINTED;
  const src = shaderSources();
  const pins = {
    GLX: [/bool tintedSurface = surfaceId == 36;/, /bool mirrorSurface = surfaceId == 27 \|\| tintedSurface \|\| goldSurface;/,
      new RegExp(`if \\(tintedSurface\\) addCC \\*= mix\\(vec3\\(1\\.0\\), albedo / max\\(max\\(albedo\\.r, max\\(albedo\\.g, albedo\\.b\\)\\), ${T.chromaFloor}\\), ${T.envTint}\\);`)],
    WGX: [/let tintedSurface = surfaceId == 36;/, /let mirrorSurface = surfaceId == 27 \|\| tintedSurface \|\| goldSurface;/,
      new RegExp(`if \\(tintedSurface\\) \\{ addCC = addCC \\* mix\\(vec3<f32>\\(1\\.0\\), albedo / max\\(max\\(albedo\\.r, max\\(albedo\\.g, albedo\\.b\\)\\), ${T.chromaFloor}\\), vec3<f32>\\(${T.envTint}\\)\\); \\}`)],
    TLX: [/const tintedSurface = surfaceId\.equal\(36\.0\)\.toVar\(\);/, /const mirrorSurface = surfaceId\.equal\(27\.0\)\.or\(tintedSurface\)\.or\(goldSurface\)\.toVar\(\);/,
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

// ---- Garage finishes S4: metallic flake (34) and candy (35) -------------------------------------------------

test("FINISH_SURFACE rows flake 34 and candy 35 exist, are accepted by Teams.liveryEnumOk, and remap paint only", () => {
  const { CarMaterials } = loadMaterials();
  assert.equal(CarMaterials.FINISH_SURFACE.flake, 34);
  assert.equal(CarMaterials.FINISH_SURFACE.candy, 35);
  const chips = ["gloss", ...Object.keys(CarMaterials.FINISH_SURFACE)];
  assert.deepEqual(chips, ["gloss", "satin", "chrome", "matte", "carbon", "brushed", "pearl", "flake", "candy", "tinted", "chameleon", "forged", "gunmetal", "goldplate", "holographic", "velvet", "hammered", "anodized"]);
  const cx = vm.createContext({ console, Math, Object, Array, JSON, Number, String, Boolean, Map, Set });
  cx.Car3D = { FINISH_SURFACE: CarMaterials.FINISH_SURFACE };
  vm.runInContext(read("js/data/teams.js"), cx, { filename: absSrc("js/data/teams.js") });
  const Teams = vm.runInContext("Teams", cx);
  for (const f of ["flake", "candy"]) assert.equal(Teams.liveryEnumOk("finish", f), true, f);
  const { SURFACES, applyFinish } = CarMaterials;
  for (const [name, id] of [["flake", 34], ["candy", 35]]) {
    const out = { mat: [SURFACES.paint, SURFACES.carbon, SURFACES.glass, SURFACES.paint] };
    applyFinish(out, name);
    assert.deepEqual(out.mat, [id, SURFACES.carbon, SURFACES.glass, id]);
  }
});

test("flake: same grain, spark, fade and specular numbers in GLX / TLX / WGX; paint-class response", () => {
  const { CarMaterialShade } = loadMaterials();
  const F = CarMaterialShade.FLAKE;
  const f2 = (v) => v.toFixed(2);
  const src = shaderSources();
  const fade = F.fadeStartM + F.fadeSpanM;
  assert.equal(fade, 26, "flake fades to the base colour at ~26 m");
  const pins = {
    GLX: [/bool flakeSurface = surfaceId == 34;/, /bool paintSurface = surfaceId == 20 \|\| flakeSurface \|\| candySurface;/,
      new RegExp(`clamp\\(1\\.0 - \\(vDist - ${F.fadeStartM.toFixed(1)}\\) / ${F.fadeSpanM.toFixed(1)}, 0\\.0, 1\\.0\\)`),
      new RegExp(`floor\\(vObjPos \\* ${F.cellsPerM.toFixed(1)}\\)`),
      new RegExp(`smoothstep\\(${f2(F.sparkLo)}, 1\\.0, fkH\\)`),
      new RegExp(`\\(fkH - 0\\.5\\) \\* ${f2(F.grainAmp)} \\+ \\(fkS - ${f2(F.sparkMean)}\\) \\* ${f2(F.sparkGain)}\\) \\* fkF`),
      new RegExp(`specular = min\\(1\\.0, specular \\+ fkS \\* ${f2(F.specGain)} \\* fkF\\)`),
      new RegExp(`flakeSurface \\? max\\(uMetalness, ${f2(F.metalness)}\\) : uMetalness`)],
    WGX: [/let flakeSurface = surfaceId == 34;/, /let paintSurface = surfaceId == 20 \|\| flakeSurface \|\| candySurface;/,
      new RegExp(`clamp\\(1\\.0 - \\(vDist - ${F.fadeStartM.toFixed(1)}\\) / ${F.fadeSpanM.toFixed(1)}, 0\\.0, 1\\.0\\)`),
      new RegExp(`floor\\(in\\.objPos \\* ${F.cellsPerM.toFixed(1)}\\)`),
      new RegExp(`smoothstep\\(${f2(F.sparkLo)}, 1\\.0, fkH\\)`),
      new RegExp(`\\(fkH - 0\\.5\\) \\* ${f2(F.grainAmp)} \\+ \\(fkS - ${f2(F.sparkMean)}\\) \\* ${f2(F.sparkGain)}\\) \\* fkF`),
      new RegExp(`specular = min\\(1\\.0, specular \\+ fkS \\* ${f2(F.specGain)} \\* fkF\\)`),
      new RegExp(`flakeSurface\\) \\{ metalness = max\\(D\\.mat0\\.w, ${f2(F.metalness)}\\)`)],
    TLX: [/const flakeSurface = surfaceId\.equal\(34\.0\)\.toVar\(\);/, /surfaceId\.equal\(20\.0\)\.or\(flakeSurface\)\.or\(candySurface\)/,
      new RegExp(`vd\\.sub\\(${F.fadeStartM.toFixed(1)}\\)\\.div\\(${F.fadeSpanM.toFixed(1)}\\)\\.oneMinus\\(\\)`),
      new RegExp(`floor\\(objP\\.mul\\(${F.cellsPerM.toFixed(1)}\\)\\)`),
      new RegExp(`smoothstep\\(${f2(F.sparkLo)}, 1\\.0, fkH\\)`),
      new RegExp(`fkH\\.sub\\(0\\.5\\)\\.mul\\(${f2(F.grainAmp)}\\)\\.add\\(fkS\\.sub\\(${f2(F.sparkMean)}\\)\\.mul\\(${f2(F.sparkGain)}\\)\\)\\.mul\\(fkF\\)`),
      new RegExp(`fkS\\.mul\\(${f2(F.specGain)}\\)\\.mul\\(fkF\\)`),
      new RegExp(`select\\(flakeSurface, max\\(matU\\.metalness, ${f2(F.metalness)}\\), matU\\.metalness\\)`)],
  };
  for (const [name, res] of Object.entries(pins)) for (const re of res) assert.match(src[name], re, `${name}: flake drifted: ${re}`);
  // mean-preserving: the share of sparking cells ~ sparkMean, so the fade does not pop the average brightness
  assert.ok(Math.abs((1 - F.sparkLo) / 2 - F.sparkMean) < 1e-9, "sparkMean is the mean of the smoothstep spark term");
});

test("candy: darker saturated base, tinted lacquer, saturated rim, high gloss — same numbers in GLX / TLX / WGX", () => {
  const { CarMaterialShade } = loadMaterials();
  const C = CarMaterialShade.CANDY;
  const f2 = (v) => v.toFixed(2);
  const src = shaderSources();
  const pins = {
    GLX: [/bool candySurface = surfaceId == 35;/,
      new RegExp(`candySurface \\? max\\(uClearcoat, ${f2(C.clearcoat)}\\)`),
      new RegExp(`max\\(mix\\(vec3\\(cdL\\), albedo, ${C.satBoost}\\), vec3\\(0\\.0\\)\\) \\* ${C.darken}`),
      new RegExp(`addCC \\*= mix\\(vec3\\(1\\.0\\), cdHue, ${C.envTint}\\)`),
      new RegExp(`color \\+= cdHue \\* ccF \\* ${C.rimGain}`),
      new RegExp(`max\\(max\\(albedo\\.r, max\\(albedo\\.g, albedo\\.b\\)\\), ${C.chromaFloor}\\)`)],
    WGX: [/let candySurface = surfaceId == 35;/,
      new RegExp(`candySurface\\) \\{ clearcoat = max\\(D\\.mat1\\.z, ${f2(C.clearcoat)}\\)`),
      new RegExp(`max\\(mix\\(vec3<f32>\\(cdL\\), albedo, vec3<f32>\\(${C.satBoost}\\)\\), vec3<f32>\\(0\\.0\\)\\) \\* ${C.darken}`),
      new RegExp(`addCC \\* mix\\(vec3<f32>\\(1\\.0\\), cdHue, vec3<f32>\\(${C.envTint}\\)\\)`),
      new RegExp(`color = color \\+ cdHue \\* ccF \\* ${C.rimGain}`),
      new RegExp(`max\\(max\\(albedo\\.r, max\\(albedo\\.g, albedo\\.b\\)\\), ${C.chromaFloor}\\)`)],
    TLX: [/const candySurface = surfaceId\.equal\(35\.0\)\.toVar\(\);/,
      new RegExp(`select\\(candySurface, max\\(matU\\.clearcoat, ${f2(C.clearcoat)}\\), matU\\.clearcoat\\)`),
      new RegExp(`max\\(mix\\(vec3\\(cdL\\), albedo, ${C.satBoost}\\), vec3\\(0\\.0\\)\\)\\.mul\\(${C.darken}\\)`),
      new RegExp(`addCC\\.mulAssign\\(mix\\(vec3\\(1\\.0\\), cdHue, ${C.envTint}\\)\\)`),
      new RegExp(`color\\.addAssign\\(cdHue\\.mul\\(ccF\\)\\.mul\\(${C.rimGain}\\)\\)`),
      new RegExp(`max\\(max\\(albedo\\.r, max\\(albedo\\.g, albedo\\.b\\)\\), ${C.chromaFloor}\\)`)],
  };
  for (const [name, res] of Object.entries(pins)) for (const re of res) assert.match(src[name], re, `${name}: candy drifted: ${re}`);
  // candy is darker than the paint it replaces and the rim cannot reach bloom territory on its own
  assert.ok(C.darken < 1 && C.satBoost > 1 && C.rimGain < 0.6);
});

test("flake and candy add no uniform, define, texture fetch or shader variant (surfaceId branches only)", () => {
  const src = shaderSources();
  for (const [name, s] of Object.entries(src)) {
    const m = (s.match(/(?:flakeSurface|candySurface|fkF|cdL)[^\n]*/g) || []).join("\n");
    assert.ok(m.length > 0, `${name}: no flake/candy code found`);
    assert.doesNotMatch(m, /\buniform\b|#define|texture\w*\(|textureSample|cubeTexture|\buCand|\buFlak/i, `${name}: flake/candy must stay ALU-only`);
  }
});

// ---- Garage finishes S5: forged carbon (38), gunmetal (39), gold plate (40) ----------------------------------

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const f1 = (v) => v.toFixed(1), f2 = (v) => v.toFixed(2);
const lit3 = (a) => a.map((v) => (Number.isInteger(v) ? v.toFixed(1) : String(v))).join(", ");

test("FINISH_SURFACE rows forged 38, gunmetal 39, goldplate 40 exist in the reserved ids and remap paint only", () => {
  const { CarMaterials } = loadMaterials();
  for (const [name, id] of [["forged", 38], ["gunmetal", 39], ["goldplate", 40]]) {
    assert.equal(CarMaterials.FINISH_SURFACE[name], id);
    assert.equal(CarMaterials.FINISH_RESERVED[name], id);
    const out = { mat: [CarMaterials.SURFACES.paint, CarMaterials.SURFACES.carbon, CarMaterials.SURFACES.glass, CarMaterials.SURFACES.paint] };
    CarMaterials.applyFinish(out, name);
    assert.deepEqual(out.mat, [id, CarMaterials.SURFACES.carbon, CarMaterials.SURFACES.glass, id]);
  }
  const cx = vm.createContext({ console, Math, Object, Array, JSON, Number, String, Boolean, Map, Set });
  cx.Car3D = { FINISH_SURFACE: CarMaterials.FINISH_SURFACE };
  vm.runInContext(read("js/data/teams.js"), cx, { filename: absSrc("js/data/teams.js") });
  const Teams = vm.runInContext("Teams", cx);
  for (const f of ["forged", "gunmetal", "goldplate"]) assert.equal(Teams.liveryEnumOk("finish", f), true, f);
  assert.match(read("js/garage/setup-sheet.js"), /\n  finish: "FINISH[^\n]*",/, "FINISH has a surface hint; the registry owns the option inventory");
});

test("forged carbon: chip cells, fade, resin, roughness and lacquer — same numbers in GLX / TLX / WGX", () => {
  const { CarMaterialShade } = loadMaterials();
  const F = CarMaterialShade.FORGED;
  const src = shaderSources();
  assert.ok(Math.abs(F.chipMean - 2 / 3) < 1e-3, "chipMean is the mean of the max of two uniform hashes");
  assert.ok(F.fadeStartM + F.fadeSpanM <= 26, "near field only: flat resin by 26 m at the latest");
  const fade = `${f1(F.fadeStartM)}) / ${f1(F.fadeSpanM)}, 0.0, 1.0)`;
  const pins = {
    GLX: [/bool forgedSurface = surfaceId == 38;/, `vDist - ${fade}`, `floor(vObjPos * ${f1(F.cellsPerM)})`, `* ${f1(F.cellsPerM2)});`,
      `fgM = mix(${F.chipMean}, max(hash21(`, `vec3(${lit3(F.resin)}), albedo * ${f2(F.tintKeep)}, ${f2(F.tintMix)}) * (1.0 + (fgM - ${F.chipMean}) * ${f2(F.chipGain)})`,
      `albedo * ${f2(F.resinKeep)} +`, `rough = clamp(rough, ${f2(F.roughLo)}, ${f2(F.roughHi)}) + (fgM - ${F.chipMean}) * ${f2(F.roughGain)}`,
      `forgedSurface ? clamp(uClearcoat, ${f2(F.clearcoatLo)}, ${f2(F.clearcoatHi)})`, `forgedSurface ? ${f2(F.metalness)}`, `forgedSurface ? ${f2(F.specular)}`],
    WGX: [/let forgedSurface = surfaceId == 38;/, `vDist - ${fade}`, `floor(in.objPos * ${f1(F.cellsPerM)})`, `* ${f1(F.cellsPerM2)});`,
      `fgM = mix(${F.chipMean}, max(hash21(`, `vec3<f32>(${lit3(F.resin)}), albedo * ${f2(F.tintKeep)}, vec3<f32>(${f2(F.tintMix)})) * (1.0 + (fgM - ${F.chipMean}) * ${f2(F.chipGain)})`,
      `albedo * ${f2(F.resinKeep)} +`, `rough = clamp(rough, ${f2(F.roughLo)}, ${f2(F.roughHi)}) + (fgM - ${F.chipMean}) * ${f2(F.roughGain)}`,
      `clearcoat = clamp(D.mat1.z, ${f2(F.clearcoatLo)}, ${f2(F.clearcoatHi)})`, `metalness = ${f2(F.metalness)}; specular = ${f2(F.specular)};`],
    TLX: [/const forgedSurface = surfaceId\.equal\(38\.0\)\.toVar\(\);/, `vd.sub(${f1(F.fadeStartM)}).div(${f1(F.fadeSpanM)}).oneMinus()`, `floor(objP.mul(${f1(F.cellsPerM)}))`, `.mul(${f1(F.cellsPerM2)}))`,
      `fgM.assign(mix(float(${F.chipMean}), max(hash21(`, `vec3(${lit3(F.resin)})), albedo.mul(${f2(F.tintKeep)}), ${f2(F.tintMix)}).mul(fgM.sub(${F.chipMean}).mul(${f2(F.chipGain)}).add(1.0))`,
      `albedo.mul(${f2(F.resinKeep)}).add(`, `rough.assign(clamp(rough, ${f2(F.roughLo)}, ${f2(F.roughHi)}).add(fgM.sub(${F.chipMean}).mul(${f2(F.roughGain)})))`,
      `clearcoat.assign(clamp(matU.clearcoat, ${f2(F.clearcoatLo)}, ${f2(F.clearcoatHi)})); metalness.assign(${f2(F.metalness)}); specular.assign(${f2(F.specular)});`],
  };
  for (const [name, list] of Object.entries(pins))
    for (const p of list) assert.match(src[name], p instanceof RegExp ? p : new RegExp(esc(p)), `${name}: forged drifted: ${p}`);
  // the chips are NOT the twill: no sin() weave in the forged block
  for (const [name, s] of Object.entries(src)) assert.doesNotMatch((s.match(/fg[ABMF][^\n]*/g) || []).join("\n"), /sin\(|\.sin\(\)/, `${name}: forged must not reuse the woven pattern`);
});

test("gunmetal: metal lobe with a dark livery-hue tint and the dark-metal env boost — same numbers in GLX / TLX / WGX", () => {
  const { CarMaterialShade } = loadMaterials();
  const G = CarMaterialShade.GUNMETAL;
  const src = shaderSources();
  const hue = `albedo / max(max(albedo.r, max(albedo.g, albedo.b)), ${G.chromaFloor}) * ${f2(G.hueGain)}`;
  const pins = {
    GLX: [/bool gunSurface = surfaceId == 39;/, `albedo = mix(vec3(${lit3(G.base)}), ${hue}, ${f2(G.hueMix)});`,
      `gunSurface ? max(uMetalness, ${f2(G.metalness)})`, `gunSurface ? ${f2(G.specular)}`, `gunSurface ? min(uClearcoat, ${f2(G.clearcoatMax)})`,
      `if (gunSurface) rough = clamp(rough, ${f2(G.roughLo)}, ${f2(G.roughHi)});`,
      "if (metalSurface || satinMetalSurface || mirrorSurface || gunSurface || hammerSurface || anodSurface) {", "if (metalSurface || gunSurface) {"],
    WGX: [/let gunSurface = surfaceId == 39;/, `albedo = mix(vec3<f32>(${lit3(G.base)}), ${hue}, vec3<f32>(${f2(G.hueMix)}));`,
      `metalness = max(D.mat0.w, ${f2(G.metalness)}); specular = ${f2(G.specular)};`, `if (gunSurface) { clearcoat = min(D.mat1.z, ${f2(G.clearcoatMax)}); }`,
      `if (gunSurface) { rough = clamp(rough, ${f2(G.roughLo)}, ${f2(G.roughHi)}); }`,
      "if (metalSurface || satinMetalSurface || mirrorSurface || gunSurface || hammerSurface || anodSurface) {", "if (metalSurface || gunSurface) {"],
    TLX: [/const gunSurface = surfaceId\.equal\(39\.0\)\.toVar\(\);/,
      `albedo.assign(mix(vec3(${lit3(G.base)}), albedo.div(max(max(albedo.r, max(albedo.g, albedo.b)), ${G.chromaFloor})).mul(${f2(G.hueGain)}), ${f2(G.hueMix)}));`,
      `clearcoat.assign(min(matU.clearcoat, ${f2(G.clearcoatMax)})); metalness.assign(max(matU.metalness, ${f2(G.metalness)})); specular.assign(${f2(G.specular)});`,
      `If(gunSurface, () => { rough.assign(clamp(rough, ${f2(G.roughLo)}, ${f2(G.roughHi)})); });`,
      "If(metalSurface.or(satinMetalSurface).or(mirrorSurface).or(gunSurface).or(hammerSurface).or(anodSurface), () => {", "If(metalSurface.or(gunSurface), () => {"],
  };
  for (const [name, list] of Object.entries(pins))
    for (const p of list) assert.match(src[name], p instanceof RegExp ? p : new RegExp(esc(p)), `${name}: gunmetal drifted: ${p}`);
  // between chrome 27 (rough <= 0.09) and brushed 29 (0.24-0.40), darker than either
  assert.ok(G.roughLo > 0.09 && G.roughLo < 0.24 && G.roughHi <= 0.40 && G.base.every((v) => v < 0.25));
});

test("gold plate: chrome mirror response with a fixed gold that ignores the livery — same numbers in GLX / TLX / WGX", () => {
  const { CarMaterialShade } = loadMaterials();
  const A = CarMaterialShade.GOLDPLATE;
  const src = shaderSources();
  const mx = Math.max(...A.gold);
  A.gold.forEach((v, i) => assert.ok(Math.abs(v / mx - A.hue[i]) < 0.01, "hue = gold / its brightest channel"));
  const pins = {
    GLX: [/bool goldSurface = surfaceId == 40;/, `albedo = vec3(${lit3(A.gold)});`,
      `if (goldSurface) addCC *= mix(vec3(1.0), vec3(${lit3(A.hue)}), ${A.envTint});`, `if (goldSurface) color *= vec3(${lit3(A.hue)});`],
    WGX: [/let goldSurface = surfaceId == 40;/, `albedo = vec3<f32>(${lit3(A.gold)});`,
      `if (goldSurface) { addCC = addCC * mix(vec3<f32>(1.0), vec3<f32>(${lit3(A.hue)}), vec3<f32>(${A.envTint})); }`, `if (goldSurface) { color = color * vec3<f32>(${lit3(A.hue)}); }`],
    TLX: [/const goldSurface = surfaceId\.equal\(40\.0\)\.toVar\(\);/, `albedo.assign(vec3(${lit3(A.gold)}));`,
      `If(goldSurface, () => { addCC.mulAssign(mix(vec3(1.0), vec3(${lit3(A.hue)}), ${A.envTint})); });`, `If(goldSurface, () => { color.mulAssign(vec3(${lit3(A.hue)})); });`],
  };
  for (const [name, list] of Object.entries(pins))
    for (const p of list) assert.match(src[name], p instanceof RegExp ? p : new RegExp(esc(p)), `${name}: gold plate drifted: ${p}`);
});

test("forged, gunmetal and gold plate add no uniform, define, texture fetch or shader variant (surfaceId branches only)", () => {
  const src = shaderSources();
  for (const [name, s] of Object.entries(src)) {
    const m = (s.match(/(?:forgedSurface|gunSurface|goldSurface|fg[ABMF]\b)[^\n]*/g) || []).join("\n");
    assert.ok(m.length > 0, `${name}: no forged/gunmetal/gold code found`);
    assert.doesNotMatch(m, /\buniform\b|#define|texture\w*\(|textureSample|cubeTexture|\buForg|\buGun|\buGold/i, `${name}: the new finishes must stay ALU-only`);
  }
});

// Four distinct BRDF families, not alternate names for existing surface identities.
test("expanded finishes reserve unique ids, accept whole-car/zone values and preserve mesh streams", () => {
  const { CarMaterials } = loadMaterials();
  const cx = vm.createContext({ console, Math, Object, Array, JSON, Number, String, Boolean, Map, Set });
  cx.Car3D = { FINISH_SURFACE: CarMaterials.FINISH_SURFACE };
  vm.runInContext(read("js/data/teams.js"), cx, { filename: absSrc("js/data/teams.js") });
  const Teams = vm.runInContext("Teams", cx);
  const { SURFACES: S } = CarMaterials;
  for (const [name, id] of [["holographic", 41], ["velvet", 42], ["hammered", 43], ["anodized", 44]]) {
    assert.equal(CarMaterials.FINISH_SURFACE[name], id);
    assert.equal(CarMaterials.FINISH_RESERVED[name], id);
    assert.equal(Teams.liveryEnumOk("finish", name), true);
    assert.equal(Teams.liveryEnumOk("coverFinish", name), true);
    const out = { mat: [S.paint, S.carbon, S.glass, S.emissive, S.mirror, S.paint], pos: [1, 2, 3], nrm: [0, 1, 0], col: [0.8, 0.2, 0.1], idx: [0] };
    const streams = [out.pos, out.nrm, out.col, out.idx];
    const values = streams.map((s) => s.slice());
    CarMaterials.applyFinish(out, name);
    assert.deepEqual(out.mat, [id, S.carbon, S.glass, S.emissive, S.mirror, id]);
    assert.deepEqual([out.pos, out.nrm, out.col, out.idx], values);
    streams.forEach((s, i) => assert.equal([out.pos, out.nrm, out.col, out.idx][i], s, "finish remaps IDs without allocating mesh streams"));
  }
});

const expandedPins = (label, pins) => {
  const shaders = shaderSources();
  for (const [backend, snippets] of Object.entries(pins)) for (const snippet of snippets)
    assert.ok(shaders[backend].includes(snippet), `${backend}: ${label} drifted: ${snippet}`);
};

test("holographic keeps one continuous angular spectrum in all three backends", () => {
  const { HOLOGRAPHIC: H } = loadMaterials().CarMaterialShade;
  expandedPins("holographic", {
    GLX: [`bool holoSurface = surfaceId == 41;`, `clearcoat = max(uClearcoat, ${f2(H.clearcoat)}); metalness = ${f2(H.metalness)}; specular = ${f2(H.specular)};`,
      `rough = ${f2(H.roughness)};`, `vec3(${lit3(H.phase)}) + hoF * ${H.cycles}`, `vec3(${H.hueFloor}) + ${H.hueSpan} * hoS`, `mix(${f2(H.minWeight)}, ${f2(H.tintWeight)}, smoothstep(${f2(H.fresLo)}, ${f2(H.fresHi)}, hoF))`],
    WGX: [`let holoSurface = surfaceId == 41;`, `clearcoat = max(D.mat1.z, ${f2(H.clearcoat)});`, `metalness = ${f2(H.metalness)}; specular = ${f2(H.specular)};`,
      `rough = ${f2(H.roughness)};`, `vec3<f32>(${lit3(H.phase)}) + vec3<f32>(hoF * ${H.cycles})`, `vec3<f32>(${H.hueFloor}) + ${H.hueSpan} * hoS`, `mix(${f2(H.minWeight)}, ${f2(H.tintWeight)}, smoothstep(${f2(H.fresLo)}, ${f2(H.fresHi)}, hoF))`],
    TLX: [`const holoSurface = surfaceId.equal(41.0).toVar();`, `clearcoat.assign(max(matU.clearcoat, ${f2(H.clearcoat)})); metalness.assign(${f2(H.metalness)}); specular.assign(${f2(H.specular)});`,
      `rough.assign(${f2(H.roughness)});`, `vec3(${lit3(H.phase)}).add(hoF.mul(${H.cycles}))`, `hoS.mul(${H.hueSpan}).add(${H.hueFloor})`, `mix(float(${f2(H.minWeight)}), float(${f2(H.tintWeight)}), smoothstep(${f2(H.fresLo)}, ${f2(H.fresHi)}, hoF))`],
  });
  assert.ok(H.cycles > 1 && H.fresLo < 0.1 && H.tintWeight > 0.75, "multi-hue response is broader than pearl/chameleon's grazing-only flip");
});

test("velvet has a diffuse dark face and lighting-preserving grazing sheen across backends", () => {
  const { VELVET: V, MATTE: M } = loadMaterials().CarMaterialShade;
  expandedPins("velvet", {
    GLX: [`bool velvetSurface = surfaceId == 42;`, `clearcoat = ${f1(V.clearcoat)}; metalness = ${f1(V.metalness)}; specular = ${f2(V.specular)};`,
      `rough = max(rough, ${f2(V.roughFloor)});`, `albedo *= ${f2(V.darken)};`, `color *= 1.0 + veF * veF * ${f2(V.sheenGain)};`],
    WGX: [`let velvetSurface = surfaceId == 42;`, `metalness = ${f1(V.metalness)}; specular = ${f2(V.specular)};`, `rough = max(rough, ${f2(V.roughFloor)});`,
      `albedo = albedo * ${f2(V.darken)};`, `color = color * (1.0 + veF * veF * ${f2(V.sheenGain)});`],
    TLX: [`const velvetSurface = surfaceId.equal(42.0).toVar();`, `clearcoat.assign(${f1(V.clearcoat)}); metalness.assign(${f1(V.metalness)}); specular.assign(${f2(V.specular)});`,
      `rough.assign(max(rough, ${f2(V.roughFloor)}));`, `albedo.mulAssign(${f2(V.darken)});`, `color.mulAssign(veF.mul(veF).mul(${f2(V.sheenGain)}).add(1.0));`],
  });
  assert.ok(V.roughFloor > M.roughFloor && V.specular < M.specular && V.darken * (1 + V.sheenGain) > 1, "velvet darkens the face and softly lifts the edge without a mirror lobe");
});

test("hammered relief is smooth, object-space and faded by 22 metres across backends", () => {
  const { HAMMERED: H } = loadMaterials().CarMaterialShade;
  expandedPins("hammered", {
    GLX: [`bool hammerSurface = surfaceId == 43;`, `clearcoat = min(uClearcoat, ${f2(H.clearcoatMax)}); metalness = ${f2(H.metalness)}; specular = ${f2(H.specular)};`,
      `(vObjPos.xz + vObjPos.y * vec2(${lit3(H.projectY)})) * ${f1(H.frequency)}`, `vDist - ${f1(H.fadeStartM)}) / ${f1(H.fadeSpanM)}`, `sin(hmP + sin(hmP.yx * ${H.warpFrequency}) * ${f2(H.warpGain)})`, `* (${f2(H.normalAmp)} * hmF)`, `rough = clamp(rough, ${f2(H.roughLo)}, ${f2(H.roughHi)});`],
    WGX: [`let hammerSurface = surfaceId == 43;`, `clearcoat = min(D.mat1.z, ${f2(H.clearcoatMax)});`, `metalness = ${f2(H.metalness)}; specular = ${f2(H.specular)};`,
      `(in.objPos.xz + in.objPos.y * vec2<f32>(${lit3(H.projectY)})) * ${f1(H.frequency)}`, `vDist - ${f1(H.fadeStartM)}) / ${f1(H.fadeSpanM)}`, `sin(hmP + sin(hmP.yx * ${H.warpFrequency}) * ${f2(H.warpGain)})`, `* (${f2(H.normalAmp)} * hmF)`, `rough = clamp(rough, ${f2(H.roughLo)}, ${f2(H.roughHi)});`],
    TLX: [`const hammerSurface = surfaceId.equal(43.0).toVar();`, `clearcoat.assign(min(matU.clearcoat, ${f2(H.clearcoatMax)})); metalness.assign(${f2(H.metalness)}); specular.assign(${f2(H.specular)});`,
      `objP.xz.add(objP.y.mul(vec2(${lit3(H.projectY)}))).mul(${f1(H.frequency)})`, `vd.sub(${f1(H.fadeStartM)}).div(${f1(H.fadeSpanM)}).oneMinus()`, `hmP.add(hmP.yx.mul(${H.warpFrequency}).sin().mul(${f2(H.warpGain)})).sin()`, `.mul(hmF.mul(${f2(H.normalAmp)}))`, `rough.assign(clamp(rough, ${f2(H.roughLo)}, ${f2(H.roughHi)}));`],
  });
  assert.equal(H.fadeStartM + H.fadeSpanM, 22);
  const fade = (m) => Math.min(1, Math.max(0, 1 - (m - H.fadeStartM) / H.fadeSpanM));
  assert.equal(fade(8), 1); assert.equal(fade(22), 0); assert.equal(fade(100), 0);
});

test("anodized retains bright colour on a broad metal lobe rather than gunmetal's dark substrate", () => {
  const { ANODIZED: A, GUNMETAL: G } = loadMaterials().CarMaterialShade;
  expandedPins("anodized", {
    GLX: [`bool anodSurface = surfaceId == 44;`, `clearcoat = min(uClearcoat, ${f2(A.clearcoatMax)}); metalness = ${f2(A.metalness)}; specular = ${f2(A.specular)};`,
      `rough = clamp(rough, ${f2(A.roughLo)}, ${f2(A.roughHi)});`, `albedo = anHue * ${f2(A.hueWeight)} + albedo * ${f2(A.baseWeight)};`, `mix(vec3(1.0), anHue, ${f2(A.tintWeight)})`],
    WGX: [`let anodSurface = surfaceId == 44;`, `clearcoat = min(D.mat1.z, ${f2(A.clearcoatMax)});`, `metalness = ${f2(A.metalness)}; specular = ${f2(A.specular)};`,
      `rough = clamp(rough, ${f2(A.roughLo)}, ${f2(A.roughHi)});`, `albedo = anHue * ${f2(A.hueWeight)} + albedo * ${f2(A.baseWeight)};`, `mix(vec3<f32>(1.0), anHue, vec3<f32>(${f2(A.tintWeight)}))`],
    TLX: [`const anodSurface = surfaceId.equal(44.0).toVar();`, `clearcoat.assign(min(matU.clearcoat, ${f2(A.clearcoatMax)})); metalness.assign(${f2(A.metalness)}); specular.assign(${f2(A.specular)});`,
      `rough.assign(clamp(rough, ${f2(A.roughLo)}, ${f2(A.roughHi)}));`, `albedo.assign(anHue.mul(${f2(A.hueWeight)}).add(albedo.mul(${f2(A.baseWeight)})));`, `mix(vec3(1.0), anHue, ${f2(A.tintWeight)})`],
  });
  assert.ok(A.hueWeight > G.hueGain && A.roughLo > G.roughHi && A.clearcoatMax < G.clearcoatMax);
});

test("expanded finish blocks add no resources, temporal pattern or shader derivatives", () => {
  for (const [backend, source] of Object.entries(shaderSources())) {
    const blocks = [...source.matchAll(/\/\/ EXPANDED FINISHES[\s\S]*?\/\/ END EXPANDED FINISHES/g)].map((m) => m[0]).join("\n");
    assert.ok(blocks.length > 500, `${backend}: finish implementation blocks are missing`);
    assert.doesNotMatch(blocks, /\buniform\b|#define|texture\w*\(|textureSample|cubeTexture|\bdpdx\b|\bdpdy\b|\bfwidth\b|\bdFdx\b|\bdFdy\b|\buTime\b|\btime\b/i, `${backend}: response must remain procedural and resource-free`);
  }
});

test("hammered cotangent frame follows panel rotation, reflection and screen handedness", () => {
  const { HAMMERED: H } = loadMaterials().CarMaterialShade;
  const dot3 = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
  const plus = (a, b) => a.map((v, i) => v + b[i]), times = (a, s) => a.map((v) => v * s);
  const cross3 = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const unit = (a) => times(a, 1 / (Math.hypot(...a) || 1));
  const uv = (p) => [p[0] + p[1] * H.projectY[0], p[2] + p[1] * H.projectY[1]];
  const point = [0.31, 0.72, -1.12], phase = uv(point).map((v) => v * H.frequency);
  const tilt = phase.map((v, i) => Math.sin(v + Math.sin(phase[1-i] * H.warpFrequency) * H.warpGain));
  const normal = (n, dp1, dp2, duv1, duv2, amplitude = H.normalAmp) => {
    const c1 = cross3(dp2, n), c2 = cross3(n, dp1);
    const u = plus(times(c1, duv1[0]), times(c2, duv2[0]));
    const v = plus(times(c1, duv1[1]), times(c2, duv2[1]));
    const scale = (dot3(dp1, c1) < 0 ? -1 : 1) / Math.sqrt(Math.max(dot3(u, u), dot3(v, v), 1e-12));
    return unit(plus(n, times(plus(times(u, tilt[0]), times(v, tilt[1])), scale * amplitude)));
  };
  const close = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-10, `${a} != ${b}`));
  for (const [n, dx, dy] of [[[0, 1, 0], [1, 0, 0], [0, 0, 1]], [[1, 0, 0], [0, 1, 0], [0, 0, 1]]]) {
    const duv1 = uv(dx), duv2 = uv(dy), original = normal(n, dx, dy, duv1, duv2);
    for (const angle of [Math.PI/2, Math.PI, 0.37]) for (const reflectX of [1, -1]) {
      const rotate = (p) => [reflectX * (p[0]*Math.cos(angle)+p[2]*Math.sin(angle)), p[1], -p[0]*Math.sin(angle)+p[2]*Math.cos(angle)];
      close(normal(rotate(n), rotate(dx), rotate(dy), duv1, duv2), rotate(original));
    }
    close(normal(n, dx, times(dy, -1), duv1, times(duv2, -1)), original);
    close(normal(n, [0, 0, 0], [0, 0, 0], [0, 0], [0, 0]), n);
    // Hammered always resets to Ngeo, including where its relief fade reaches
    // zero: otherwise the old generic peel abruptly reappears at 22 m.
    const fade = (distance) => Math.min(1, Math.max(0, 1 - (distance - H.fadeStartM) / H.fadeSpanM));
    const end = H.fadeStartM + H.fadeSpanM;
    const at = (distance) => normal(n, dx, dy, duv1, duv2, H.normalAmp * fade(distance));
    close(at(end), n); close(at(end + 1), n);
    at(end - 1e-6).forEach((v, i) => assert.ok(Math.abs(v - n[i]) < 1e-7, "normal approaches Ngeo continuously at the relief cutoff"));
  }
  expandedPins("hammered transformed frame", {
    GLX: ["vec3 hmDP1 = dFdx(vWorldPos), hmDP2 = dFdy(vWorldPos);", "vec2 hmDUV1 = dFdx(hmUV), hmDUV2 = dFdy(hmUV);", "cross(hmDP2, Ngeo)", "hmC1 * hmDUV1.x + hmC2 * hmDUV2.x", "dot(hmDP1, hmC1) < 0.0 ? -1.0 : 1.0", "N = normalize(Ngeo + hmTilt"],
    WGX: ["let hmDP1 = dpdx(in.wpos); let hmDP2 = dpdy(in.wpos);", "let hmDUV1 = dpdx(hmUV); let hmDUV2 = dpdy(hmUV);", "cross(hmDP2, Ngeo)", "hmC1 * hmDUV1.x + hmC2 * hmDUV2.x", "select(1.0, -1.0, dot(hmDP1, hmC1) < 0.0)", "N = normalize(Ngeo + hmTilt"],
    TLX: ["const hmDP1 = dFdx(wp).toVar(), hmDP2 = dFdy(wp).toVar();", "const hmDUV1 = dFdx(hmUV).toVar(), hmDUV2 = dFdy(hmUV).toVar();", "cross(hmDP2, Ngeo)", "hmC1.mul(hmDUV1.x).add(hmC2.mul(hmDUV2.x))", "select(dot(hmDP1, hmC1).lessThan(0.0), float(-1.0), float(1.0))", "N.assign(normalize(Ngeo.add(hmTilt"],
  });
  expandedPins("hammered fade baseline", {
    GLX: ["if (hammerSurface) {\n    N = Ngeo;\n    float hmF"],
    WGX: ["if (hammerSurface) {\n    N = Ngeo;\n    let hmF"],
    TLX: ["If(hammerSurface, () => {\n          N.assign(Ngeo);\n          const hmF"],
  });
  // In WGSL no dFdx/dpdx may be first evaluated inside the surface branch.
  const wgsl = shaderSources().WGX.slice(shaderSources().WGX.indexOf("fn fs_main(in : VSOut, @builtin(front_facing)"));
  assert.ok(wgsl.indexOf("let hmDUV2") < wgsl.indexOf("let isRoadDraw"), "all hammered derivatives precede divergent flow");
});

test("holographic transfers existing light across hue channels without increasing the lit peak", () => {
  const { HOLOGRAPHIC: H } = loadMaterials().CarMaterialShade;
  const response = (lit, fres) => {
    const peak = Math.max(...lit, 0), t = Math.max(0, Math.min(1, (fres - H.fresLo) / (H.fresHi - H.fresLo)));
    const blend = H.minWeight + (H.tintWeight - H.minWeight) * t*t*(3-2*t);
    return H.phase.map((phase, i) => {
      const spectrum = H.hueFloor + H.hueSpan * (0.5 + 0.5 * Math.cos(6.2831853 * (phase + fres * H.cycles)));
      return lit[i] * (1 - blend) + peak * spectrum * blend;
    });
  };
  for (const lit of [[1, 0, 0], [0, 0.8, 0], [0, 0, 0.6], [0.01, 0.01, 0.01], [2, 1, 0.5]]) {
    for (const fres of [0, 0.2, 0.35, 0.6, 1]) {
      const result = response(lit, fres);
      assert.ok(result.every((v) => Number.isFinite(v) && v >= 0 && v <= Math.max(...lit) + 1e-12), "interference redistributes existing light, never adds a brighter source");
    }
  }
  assert.deepEqual(Array.from(response([0, 0, 0], 0.4)), [0, 0, 0], "an unlit panel stays black");
  const shiftedRed = response([1, 0, 0], 0.35);
  assert.ok(shiftedRed[1] > 0.4 && shiftedRed[2] > 0.2, "saturated red can visibly shift green/blue; multiplication cannot do this");
  assert.ok(response([0, 0, 0.6], 0)[2] >= 0.6 * (1 - H.minWeight), "face-on retains most authored paint");
  expandedPins("bounded spectral light blend", {
    GLX: ["float hoPeak = max(max(max(color.r, color.g), color.b), 0.0);", "color = mix(color, hoPeak * (vec3(0.25) + 0.75 * hoS)"],
    WGX: ["let hoPeak = max(max(max(color.r, color.g), color.b), 0.0);", "color = mix(color, hoPeak * (vec3<f32>(0.25) + 0.75 * hoS)"],
    TLX: ["const hoPeak = max(max(max(color.r, color.g), color.b), 0.0).toVar();", "color.assign(mix(color, hoS.mul(0.75).add(0.25).mul(hoPeak)"],
  });
});
