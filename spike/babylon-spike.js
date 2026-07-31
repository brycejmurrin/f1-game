/* Apex 26 — Babylon.js migration spike scene (comparison arm to three-spike.js).
 *
 * Renders one REAL circuit (geometry straight from the unmodified game pipeline
 * via SpikeData) with the vendored Babylon.js UMD build: WebGL2 Engine, night
 * atmosphere (dim cool hemisphere + moonlight with a 2048 shadow map + EXP2
 * fog), StandardMaterial with vertex colors, the 32-lamp per-frame cull mapped
 * onto 32 SpotLights (maxSimultaneousLights raised from the default 4), a
 * 22-car thin-instancing A/B, and DefaultRenderingPipeline (HDR bloom + ACES
 * tone map + FXAA).
 *
 * Deliberately SKIPPED vs the TSL arm (recorded as friction, see README):
 * the mat-id procedural materials (GRASS/METAL noise etc.) — Babylon custom
 * shading means ShaderMaterial GLSL (+WGSL for WebGPU) or NodeMaterial, i.e.
 * the dual-source problem the TSL arm avoids. The `mat` attribute is not
 * uploaded. The lamp bleed floor + windowed inverse-square attenuation are
 * approximated by Babylon's standard spot falloff (range/exponent, tuned).
 *
 * The night "emissive ∝ albedo" path (lit windows / neon / floodlit props) maps
 * exactly onto StandardMaterial: finalDiffuse = clamp(lighting + emissiveColor
 * + ambient, 0, 1) * baseColor — emissiveColor rides inside the clamp and is
 * multiplied by the (HDR) vertex color, which is the same self-illumination
 * model the game uses (mix(color, albedo, emissive)), so the game's per-mesh
 * night emissive constants transfer 1:1.
 */
"use strict";
(function () {

const params = new URL(location.href).searchParams;
const TRACK_ID = params.get("track") || "singapore";
const MAX_LIGHTS = Math.max(0, Math.min(32, parseInt(params.get("lamps") || "32", 10)));
const LAMP_GAIN = parseFloat(params.get("gain") || "0.055");

const hud = document.getElementById("hud");
const say = (t) => { hud.textContent = t; };
window.addEventListener("error", (e) => say("ERROR: " + e.message));

/* ── data from the real pipeline ──────────────────────────────────────────── */
say("building " + TRACK_ID + " via real Tracks.build…");
const data = SpikeData.build(TRACK_ID);
const track = data.track;

/* ── engine / scene ───────────────────────────────────────────────────────── */
const canvas = document.getElementById("c");
// FRICTION (SwiftShader): Babylon's WebGL2 path binds one uniform BLOCK per
// light; SwiftShader reports GL_MAX_VERTEX_UNIFORM_BUFFERS = 14, so 34 lights
// exceed the block limit and every shader fails to link. disableUniformBuffers
// (an engine PROPERTY, not a constructor option) falls back to classic
// uniforms — compiles fine but disables Babylon's UBO fast path engine-wide.
const engine = new BABYLON.Engine(canvas, true);   // WebGL2
engine.disableUniformBuffers = true;
// Force synchronous shader compile: with KHR_parallel_shader_compile the first
// frames silently skip not-yet-ready materials, corrupting both the ready gate
// and the compile-time measurement.
engine.getCaps().parallelShaderCompile = undefined;
engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));

const scene = new BABYLON.Scene(engine);
scene.useRightHandedSystem = true;                 // match the game's RH data
scene.clearColor = new BABYLON.Color4(0.023, 0.031, 0.059, 1);   // ~0x06080f
scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
scene.fogDensity = 0.0016;
scene.fogColor = new BABYLON.Color3(0.039, 0.055, 0.094);        // ~0x0a0e18

/* ── night atmosphere (eyeballed against the game's night look) ───────────── */
// Babylon Blinn-Phong doesn't divide by pi (same as GLX's lambert), so the
// intensities land near GLX's calibration directly — no pi compensation.
const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
hemi.diffuse = new BABYLON.Color3(0.157, 0.196, 0.290);   // cool sky ~0x28324a
hemi.groundColor = new BABYLON.Color3(0.047, 0.055, 0.078);
hemi.specular = new BABYLON.Color3(0, 0, 0);
// Kept LOW: StandardMaterial clamps (lighting + emissive) to 1 before the
// albedo multiply, so lamp pools cap at surface albedo — the night reading
// comes from a dark ambient floor + exposure lift instead (see pipeline).
hemi.intensity = 0.55;

const sun = new BABYLON.DirectionalLight("moon",
  new BABYLON.Vector3(-180, -420, -120).normalize(), scene);     // moonlight
sun.diffuse = new BABYLON.Color3(0.576, 0.643, 0.800);           // ~0x93a4cc
sun.specular = new BABYLON.Color3(0.1, 0.11, 0.13);
sun.intensity = 0.55;
sun.shadowFrustumSize = 480;      // fixed ortho box over the start area (~GLX box)
sun.shadowMinZ = 10;
sun.shadowMaxZ = 900;

const shadowGen = new BABYLON.ShadowGenerator(2048, sun);        // GLX's static sun map size
shadowGen.bias = 0.0012;
shadowGen.normalBias = 0.02;
shadowGen.usePercentageCloserFiltering = true;
shadowGen.filteringQuality = BABYLON.ShadowGenerator.QUALITY_LOW;

/* ── 32 lamp SpotLights fed by the REAL per-frame cull ────────────────────── */
// The game's lamp model is a windowed inverse-square + smoothstep(cosOuter,
// cosInner) aimed cone + bleed floor. Babylon standard falloff is linear
// (1 - d/range) with pow(cosAngle, exponent) inside a hard cone cutoff —
// different curves, so diffuse carries the normalized colour and intensity
// carries the HDR energy through LAMP_GAIN, tuned visually vs glx-t030.
const lamps = [];
for (let i = 0; i < MAX_LIGHTS; i++) {
  const L = new BABYLON.SpotLight("lamp" + i, new BABYLON.Vector3(0, -100, 0),
    new BABYLON.Vector3(0, -1, 0), Math.PI / 2, 2, scene);
  L.diffuse = new BABYLON.Color3(0, 0, 0);
  L.specular = new BABYLON.Color3(0.25, 0.24, 0.2);
  L.intensity = 0;
  L.range = 1;
  lamps.push(L);
}
let lightCap = MAX_LIGHTS;
const SIM_LIGHTS = MAX_LIGHTS + 2;   // + hemi + moon (Babylon default is 4!)

/* ── materials: StandardMaterial + vertex colors, per-mesh night constants ── */
// { emissive } values are the game's own night draw opts (game.js _wm* tables);
// specularPower approximates the per-mesh roughness the game passes.
const MESH_OPTS = {
  road:      { emissive: 0.06, rough: 0.82 },
  floor:     { emissive: 0.09, rough: 0.98 },
  terrain:   { emissive: 0.11, rough: 0.97 },
  props:     { emissive: 0.70, rough: 0.85 },   // floodEmit ramp at deep night
  glass:     { emissive: 0.45, rough: 0.13, doubleSided: true },
  water:     { emissive: 0.04, rough: 0.10 },
  gate:      { emissive: 0.20, rough: 0.45 },
  startline: { emissive: 0.10, rough: 0.80 },
};
function makeMaterial(name, o) {
  const m = new BABYLON.StandardMaterial("m_" + name, scene);
  m.diffuseColor = new BABYLON.Color3(1, 1, 1);
  m.specularColor = new BABYLON.Color3(0.22, 0.22, 0.22).scale(1 - o.rough * 0.7);
  m.specularPower = 8 + (1 - o.rough) * 120;
  m.emissiveColor = new BABYLON.Color3(o.emissive, o.emissive, o.emissive);
  m.maxSimultaneousLights = SIM_LIGHTS;          // CRITICAL: default 4 drops 30 lamps
  if (o.doubleSided) m.backFaceCulling = false;
  return m;
}

/* geometry upload: raw {pos,nrm,col,idx} → Mesh + VertexData (RGB→RGBA repack) */
function toMesh(name, buf, mat) {
  const mesh = new BABYLON.Mesh(name, scene);
  const vd = new BABYLON.VertexData();
  vd.positions = new Float32Array(buf.pos);
  vd.normals = new Float32Array(buf.nrm);
  vd.indices = new Uint32Array(buf.idx);
  const nv = buf.pos.length / 3;
  const rgba = new Float32Array(nv * 4);        // per-vertex RGB (HDR) → RGBA
  for (let i = 0; i < nv; i++) {
    rgba[i * 4] = buf.col[i * 3];
    rgba[i * 4 + 1] = buf.col[i * 3 + 1];
    rgba[i * 4 + 2] = buf.col[i * 3 + 2];
    rgba[i * 4 + 3] = 1;
  }
  vd.colors = rgba;
  vd.applyToMesh(mesh);
  mesh.material = mat;
  mesh.useVertexColors = true;
  mesh.alwaysSelectAsActiveMesh = true;   // single huge buffers; skip culling checks
  mesh.freezeWorldMatrix();
  return mesh;
}

let triCount = 0;
for (const [name, buf] of Object.entries(data.geos)) {
  const o = MESH_OPTS[name] || { emissive: 0.15, rough: 0.9 };
  const mesh = toMesh(name, buf, makeMaterial(name, o));
  mesh.receiveShadows = true;
  if (name === "props" || name === "gate") shadowGen.addShadowCaster(mesh);
  triCount += buf.idx.length / 3;
}

/* ── cars: 22 draws vs one thin-instanced mesh (A/B) ──────────────────────── */
const carMat = makeMaterial("car", { emissive: 0.16, rough: 0.45 });
const carBase = toMesh("car0", data.car, carMat);
carBase.alwaysSelectAsActiveMesh = false;
carBase.unfreezeWorldMatrix();
const carMeshes = [carBase];
for (let i = 1; i < data.carGrid.length; i++) {
  const c = carBase.clone("car" + i);           // shares geometry, separate draw
  carMeshes.push(c);
}
const carMatrices = new Float32Array(data.carGrid.length * 16);
data.carGrid.forEach((slot, i) => {
  const m = BABYLON.Matrix.RotationY(slot.heading)
    .multiply(BABYLON.Matrix.Translation(slot.x, slot.y, slot.z));
  carMeshes[i].position.set(slot.x, slot.y, slot.z);
  carMeshes[i].rotation = new BABYLON.Vector3(0, slot.heading, 0);
  shadowGen.addShadowCaster(carMeshes[i]);
  m.copyToArray(carMatrices, i * 16);
});
const carInst = toMesh("carInst", data.car, carMat);   // thin-instance twin
carInst.unfreezeWorldMatrix();
carInst.thinInstanceSetBuffer("matrix", carMatrices, 16, true);
shadowGen.addShadowCaster(carInst);
carInst.setEnabled(false);
let instancing = false;
function setInstancing(on) {
  instancing = !!on;
  for (const c of carMeshes) c.setEnabled(!instancing);
  carInst.setEnabled(instancing);
}

/* ── camera: manual orbit around a track fraction (math == three-spike.js) ── */
const camera = new BABYLON.FreeCamera("cam", new BABYLON.Vector3(0, 50, 50), scene);
camera.minZ = 0.3;
camera.maxZ = 4000;
camera.fov = 60 * Math.PI / 180;   // vertical, matches three's PerspectiveCamera(60)
const cam = { frac: 0.0, az: 155, el: 14, dist: 46 };
const target = new BABYLON.Vector3();
function camTarget() {
  const k = Math.min(track.n - 1, Math.round(cam.frac * track.n)) % track.n;
  target.set(track.px[k], track.py[k] + 1.2, track.pz[k]);
}
function placeCamera() {
  camTarget();
  const az = cam.az * Math.PI / 180, el = cam.el * Math.PI / 180;
  camera.position.set(
    target.x + Math.sin(az) * Math.cos(el) * cam.dist,
    target.y + Math.sin(el) * cam.dist,
    target.z + Math.cos(az) * Math.cos(el) * cam.dist);
  camera.setTarget(target);
}
let drag = null;
canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; });
window.addEventListener("pointermove", (e) => {
  if (!drag) return;
  cam.az -= (e.clientX - drag.x) * 0.3;
  cam.el = Math.min(85, Math.max(2, cam.el + (e.clientY - drag.y) * 0.2));
  drag = { x: e.clientX, y: e.clientY };
});
window.addEventListener("pointerup", () => { drag = null; });
window.addEventListener("wheel", (e) => { cam.dist = Math.min(400, Math.max(8, cam.dist * (e.deltaY > 0 ? 1.1 : 0.9))); });
window.addEventListener("keydown", (e) => { if (e.key === "i") setInstancing(!instancing); });
window.addEventListener("resize", () => engine.resize());

/* ── post: DefaultRenderingPipeline — HDR bloom + ACES + FXAA ─────────────── */
const pipeline = new BABYLON.DefaultRenderingPipeline("post", true /* HDR */, scene, [camera]);
pipeline.fxaaEnabled = true;
pipeline.bloomEnabled = true;
pipeline.bloomThreshold = 0.45;
pipeline.bloomWeight = 0.65;
pipeline.bloomKernel = 64;
pipeline.bloomScale = 0.5;
pipeline.imageProcessing.toneMappingEnabled = true;
pipeline.imageProcessing.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
pipeline.imageProcessing.exposure = 1.75;      // lift compensating the diffuse clamp

/* ── per-frame lamp cull (the REAL game path) → SpotLight updates ─────────── */
const eyeArr = [0, 0, 0], fwdArr = [0, 0, 0];
let activeLights = 0;
function updateLamps() {
  eyeArr[0] = camera.position.x; eyeArr[1] = camera.position.y; eyeArr[2] = camera.position.z;
  fwdArr[0] = target.x - camera.position.x; fwdArr[2] = target.z - camera.position.z;
  const flat = SpikeData.frameLights(eyeArr, fwdArr);
  const nSrc = flat ? Math.min(MAX_LIGHTS, flat.length / 15) : 0;
  const n = Math.min(nSrc, lightCap);
  for (let i = 0; i < MAX_LIGHTS; i++) {
    const L = lamps[i];
    if (i >= n) { L.intensity = 0; continue; }   // keep enabled: no shader churn
    const o = i * 15;
    L.position.set(flat[o], flat[o + 1], flat[o + 2]);
    L.direction.set(flat[o + 7], flat[o + 8], flat[o + 9]);
    const r = flat[o + 3], g = flat[o + 4], b = flat[o + 5];
    const peak = Math.max(r, g, b, 1e-3);
    L.diffuse.set(r / peak, g / peak, b / peak);
    L.range = flat[o + 6];
    const cosInner = Math.min(0.9995, Math.max(-1, flat[o + 10]));
    const cosOuter = Math.min(0.999, Math.max(-1, flat[o + 11]));
    L.angle = 2 * Math.acos(cosOuter);
    // exponent so pow(cd, e) has decayed to ~0.1 at the cone edge (soft-ish
    // stand-in for the game's smoothstep(cosOuter, cosInner) beam)
    L.exponent = cosOuter > 0.02
      ? Math.min(64, Math.max(1, Math.log(0.1) / Math.log(cosOuter))) : 1;
    L.intensity = peak * (window.__bspikeGain != null ? window.__bspikeGain : LAMP_GAIN);
  }
  return n;
}

/* ── render loop + stats ──────────────────────────────────────────────────── */
const msRing = new Float32Array(90); let msIdx = 0, msN = 0, lastT = performance.now();
let frames = 0, lastDraws = 0, compileMs = -1, _prevDrawCum = 0;
function avgMs() { let s = 0; for (let i = 0; i < msN; i++) s += msRing[i]; return msN ? s / msN : 0; }
function drawCalls() {
  // engine._drawCalls is CUMULATIVE without EngineInstrumentation (nothing
  // calls fetchNewFrame) — report the per-frame delta.
  const cum = (engine._drawCalls && engine._drawCalls.current) || 0;
  const d = cum - _prevDrawCum;
  _prevDrawCum = cum;
  return d > 0 ? d : lastDraws;
}
function hudText() {
  return "babylon.js spike — " + TRACK_ID + "\n"
    + "babylon      " + BABYLON.Engine.Version + " (webgl2)\n"
    + "frame        " + avgMs().toFixed(2) + " ms (" + (1000 / Math.max(0.01, avgMs())).toFixed(0) + " fps)\n"
    + "compile      " + (compileMs < 0 ? "…" : compileMs.toFixed(0) + " ms (first scene-ready)") + "\n"
    + "draw calls   " + lastDraws + "\n"
    + "triangles    " + triCount.toLocaleString() + "\n"
    + "lamps        " + activeLights + " / cap " + lightCap + " (maxSimultaneousLights " + SIM_LIGHTS + ")\n"
    + "cars         " + (instancing ? "thin instances (1 draw)" : carMeshes.length + " meshes") + "  [i] toggles";
}

/* ── __bspike hooks (mirrors __spike / the __apex convention) ─────────────── */
window.__bspike = {
  ready: false,
  backend: "webgl2",
  version: BABYLON.Engine.Version,
  stats() {
    return {
      backend: "webgl2", babylon: BABYLON.Engine.Version,
      ms: avgMs(), fps: 1000 / Math.max(0.01, avgMs()),
      drawCalls: lastDraws, triangles: triCount,
      lights: activeLights, lightCap, maxSimultaneousLights: SIM_LIGHTS,
      instancing, frames, compileMs,
      meshes: Object.keys(data.geos), track: TRACK_ID,
    };
  },
  setCamera(az, el, dist, frac) {
    if (az != null) cam.az = az; if (el != null) cam.el = el;
    if (dist != null) cam.dist = dist; if (frac != null) cam.frac = frac;
    placeCamera();
    say(hudText());
  },
  toggleInstancing(on) { setInstancing(on != null ? on : !instancing); return instancing; },
  setLightCount(nMax) {   // REAL light-count A/B: shrink the compiled shader too
    lightCap = Math.max(0, Math.min(MAX_LIGHTS, nMax | 0));
    for (let i = 0; i < MAX_LIGHTS; i++) lamps[i].setEnabled(i < lightCap);
    const sim = lightCap + 2;
    for (const m of scene.materials)
      if (m.maxSimultaneousLights != null) m.maxSimultaneousLights = sim;   // dirties + recompiles
    return lightCap;
  },
  resetMs() { msN = 0; msIdx = 0; },
  _dev: null,       // live handles for headless tuning (set below)
  debugLamps(k) {   // CPU-side view of what the SpotLights hold
    const out = [];
    for (let i = 0; i < Math.min(k || 4, activeLights); i++) out.push({
      pos: lamps[i].position.asArray(), col: lamps[i].diffuse.asArray(),
      dir: lamps[i].direction.asArray(),
      range: lamps[i].range, angle: lamps[i].angle,
      exponent: lamps[i].exponent, intensity: lamps[i].intensity,
    });
    return { n: activeLights, cam: camera.position.asArray(), lamps: out };
  },
};

window.__bspike._dev = { scene, engine, pipeline, lamps, hemi, sun, shadowGen,
  setGain(g) { window.__bspikeGain = g; },   // consumed by updateLamps below
};

/* ── go: compile (timed), then loop ───────────────────────────────────────── */
placeCamera();
updateLamps();
say("compiling shaders (" + SIM_LIGHTS + " simultaneous lights)…");
const t0 = performance.now();
scene.executeWhenReady(() => {
  compileMs = performance.now() - t0;   // includes geometry upload + all shader compiles
  engine.runRenderLoop(() => {
    const t = performance.now();
    msRing[msIdx] = t - lastT; msIdx = (msIdx + 1) % msRing.length; msN = Math.min(msN + 1, msRing.length);
    lastT = t;
    placeCamera();
    // sun shadow box follows the camera target (GLX snap-caches a moving box)
    sun.position.set(target.x + 180, target.y + 420, target.z + 120);
    activeLights = updateLamps();
    scene.render();
    lastDraws = drawCalls();
    frames++;
    if (frames === 3) window.__bspike.ready = true;
    if (frames % 15 === 0 || frames < 5) say(hudText());
  });
});
scene._checkIsReady();   // kick the ready check (also triggers sync compiles)

})();
