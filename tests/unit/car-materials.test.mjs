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
