/* Apex 26 — three.js migration spike scene.
 *
 * Renders one REAL circuit (geometry straight from the unmodified game pipeline
 * via SpikeData) with three.js r184: WebGPURenderer (auto WebGL2 fallback,
 * ?gl=1 pins WebGL2), a custom TSL lit material that ports the load-bearing
 * pieces of js/render/shaders/lit.js — the stride-15 32-lamp loop (windowed
 * inverse-square + aimed cone + bleed) and three of the fifteen procedural
 * materials (FLAT pass-through, METAL 4, GRASS 9) — plus sun shadow map,
 * hemisphere ambient, bloom + ACES, and a 22-car instancing A/B.
 *
 * Port-cost probe notes (criterion 6) are inline, marked "PORT:".
 */
import * as THREE from 'three';
import {
  Fn, If, Break, Loop, uniform, uniformArray, attribute, float, int, vec2, vec3, vec4,
  positionWorld, normalWorld, cameraPosition, fract, floor, dot, mix, smoothstep,
  clamp, pow, max, min, normalize, length, select, pass,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

const params = new URL(location.href).searchParams;
const FORCE_GL = params.has('gl');
const TRACK_ID = params.get('track') || 'singapore';
const MAX_LIGHTS = 32;

const hud = document.getElementById('hud');
const say = (t) => { hud.textContent = t; };
window.addEventListener('error', (e) => say('ERROR: ' + e.message));

/* ── data from the real pipeline ──────────────────────────────────────────── */
say('building ' + TRACK_ID + ' via real Tracks.build…');
const data = SpikeData.build(TRACK_ID);
const track = data.track;

/* ── renderer ─────────────────────────────────────────────────────────────── */
const canvas = document.getElementById('c');
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: FORCE_GL });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
// PORT: the game is calibrated with NO sRGB encode (see shaders/chunks.js note);
// keep linear output + disable color management so vertex colours pass through raw.
THREE.ColorManagement.enabled = false;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;   // Hill fit, not Narkowicz — "close is fine"
renderer.toneMappingExposure = 1.3;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
await renderer.init();
const BACKEND = renderer.backend && renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2';

/* ── scene / night atmosphere (eyeballed against the game's night look) ───── */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06080f);
scene.fog = new THREE.FogExp2(0x0a0e18, 0.0016);

// PORT: three's standard material divides diffuse by π (energy-conserving PBR);
// GLX's lambert term does not (lit.js:757) — compensate sun+hemisphere by ~π so
// the night ambience lands where the game's calibration expects it.
const hemi = new THREE.HemisphereLight(0x28324a, 0x0c0e14, 1.8);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0x93a4cc, 1.5);   // moonlight
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);                      // matches GLX's static sun map
sun.shadow.camera.left = -240; sun.shadow.camera.right = 240;
sun.shadow.camera.top = 240;  sun.shadow.camera.bottom = -240;
sun.shadow.camera.near = 10;  sun.shadow.camera.far = 900;
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

/* ── lamp uniform arrays (the stride-15 flat array, split by consumer) ─────── */
// PORT: GLX uploads six uniform arrays from one flat Float32Array; TSL's
// uniformArray maps 1:1 (pos, col, dir as vec3; rad/cone/bleed packed in a vec4).
const lampPos = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3());
const lampCol = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3());
const lampDir = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3(0, -1, 0));
const lampGeo = Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(1, 0.8, 0.5, 0));
const uLampPos = uniformArray(lampPos);
const uLampCol = uniformArray(lampCol);
const uLampDir = uniformArray(lampDir);
const uLampGeo = uniformArray(lampGeo);   // (radius, cosInner, cosOuter, bleed)
const uNumLights = uniform(0);
let lightCap = MAX_LIGHTS;                // __spike.setLightCount for criterion 3

/* ── TSL port of the lit-shader pieces ────────────────────────────────────── */
// PORT: surface-family noise (chunks.js surfaceNoise) — direct transliteration.
const hash21 = Fn(([p2]) => {
  const p = fract(p2.mul(vec2(123.34, 456.21))).toVar();
  p.addAssign(dot(p, p.add(45.32)));
  return fract(p.x.mul(p.y));
});
const vnoise = Fn(([pIn]) => {
  const i = floor(pIn), f = fract(pIn).toVar();
  f.assign(f.mul(f).mul(f.mul(-2.0).add(3.0)));
  const a = hash21(i), b = hash21(i.add(vec2(1, 0)));
  const c = hash21(i.add(vec2(0, 1))), d = hash21(i.add(vec2(1, 1)));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
});

// PORT: applyMaterial() for FLAT(0)/METAL(4)/GRASS(9) — same constants, same
// distance fades (far 90-260 m, near 26-90 m, brushed 26-55 m) as lit.js.
// Returns vec4(albedo, roughness).
const applyMaterial = Fn(([mid, baseCol, baseRough, wp, nrm, vd]) => {
  const albedo = vec3(baseCol).toVar();
  const rough = float(baseRough).toVar();
  const far = clamp(vd.sub(90.0).div(170.0).oneMinus(), 0.0, 1.0);
  const near = clamp(vd.sub(26.0).div(64.0).oneMinus(), 0.0, 1.0);
  If(mid.greaterThan(8.5).and(mid.lessThan(9.5)), () => {           // GRASS
    const g = vnoise(wp.xz.mul(3.5)).mul(0.6)
      .add(vnoise(wp.xz.mul(14.0)).mul(0.4).mul(near)).sub(0.5);
    albedo.mulAssign(g.mul(0.22).mul(far).add(1.0));
    albedo.y.mulAssign(g.mul(0.08).mul(far).add(1.0));
  }).ElseIf(mid.greaterThan(3.5).and(mid.lessThan(4.5)), () => {    // METAL
    const an = normalize(nrm).abs();
    const hc = select(an.x.greaterThan(an.z), wp.z, wp.x);
    const brushFade = clamp(vd.sub(26.0).div(29.0).oneMinus(), 0.0, 1.0);
    albedo.mulAssign(vnoise(vec2(hc.mul(40.0), wp.y.mul(2.0))).sub(0.5).mul(0.12).mul(brushFade).add(1.0));
    rough.assign(clamp(rough.sub(far.mul(0.15)), 0.05, 1.0));
  });                                                               // else FLAT: pass through
  return vec4(albedo, rough);
});

// PORT: the punctual-lamp loop from lit.js:775-860 — windowed inverse-square
// (1-(d/r)^4)^2 / (max(d,4)^2+1), aimed cone smoothstep(cosOuter,cosInner) with
// bleed floor, lambert pool + a Blinn specular standing in for the GGX lobe.
const lampLight = Fn(([albedo, N, wp, rough]) => {
  const sum = vec3(0).toVar();
  const V = normalize(cameraPosition.sub(wp));
  Loop({ start: int(0), end: int(MAX_LIGHTS), type: 'int', condition: '<' }, ({ i }) => {
    If(float(i).greaterThanEqual(uNumLights), () => { Break(); });
    const geo = uLampGeo.element(i);
    const LP = uLampPos.element(i).sub(wp);
    const dist = length(LP);
    const rad = geo.x;
    If(dist.lessThan(rad), () => {
      const Ld = LP.div(max(dist, 1e-3));
      const dn = dist.div(rad);
      const win = clamp(dn.mul(dn).mul(dn).mul(dn).oneMinus(), 0.0, 1.0);
      const distC = max(dist, 4.0);                       // LAMP NEAR CLAMP def
      const att = win.mul(win).div(distC.mul(distC).add(1.0));
      const cd = dot(Ld.negate(), uLampDir.element(i));
      const beam = smoothstep(geo.z, geo.y, cd);
      const spotD = mix(geo.w, 1.0, beam);
      const NoL = max(dot(N, Ld), 0.0);
      const H = normalize(Ld.add(V));
      const spec = pow(max(dot(N, H), 0.0), 48.0).mul(rough.oneMinus()).mul(0.6);
      sum.addAssign(uLampCol.element(i).mul(att).mul(spotD)
        .mul(albedo.mul(NoL).add(vec3(spec.mul(NoL)))));
      // bounce fill (lit.js:845, uBounceK def 0.04): pool light bounced off the
      // road washes nearby surfaces with the lamp tint even outside the beam
      sum.addAssign(uLampCol.element(i).mul(albedo)
        .mul(att.mul(0.04).mul(NoL.mul(0.45).add(0.55))));
    });
  });
  return sum;
});

/* material factory: shared node graph, per-mesh base roughness */
function litMaterial(baseRough, opts = {}) {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0.0 });
  const matId = attribute('mat', 'float');
  const baseCol = attribute('color', 'vec3');
  const vd = length(positionWorld.sub(cameraPosition));
  const packed = applyMaterial(matId, baseCol, float(baseRough), positionWorld, normalWorld, vd);
  m.colorNode = packed.xyz;
  m.roughnessNode = packed.w;
  // Lamps ride emissiveNode: additive on top of the sun+hemisphere standard
  // lighting, unshadowed — same as GLX (no per-light shadows in the loop).
  m.emissiveNode = lampLight(packed.xyz, normalWorld, positionWorld, packed.w);
  if (opts.doubleSided) m.side = THREE.DoubleSide;
  return m;
}

/* ── geometry upload: raw {pos,nrm,col,idx,mat} → BufferGeometry ──────────── */
function toGeometry(buf) {
  const g = new THREE.BufferGeometry();
  const verts = buf.pos.length / 3;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf.pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(buf.nrm), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(buf.col), 3));
  const mat = (buf.mat && buf.mat.length === verts) ? buf.mat : new Array(verts).fill(0);
  g.setAttribute('mat', new THREE.BufferAttribute(new Float32Array(mat), 1));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf.idx), 1));
  return g;
}

const MESH_OPTS = {   // per-mesh base roughness (game passes these as draw opts)
  road:      { rough: 0.82 },
  floor:     { rough: 0.95 },
  terrain:   { rough: 0.95 },
  props:     { rough: 0.90 },
  glass:     { rough: 0.15, doubleSided: true },
  water:     { rough: 0.10 },
  gate:      { rough: 0.70 },
  startline: { rough: 0.80 },
};
let triCount = 0;
for (const [name, buf] of Object.entries(data.geos)) {
  const o = MESH_OPTS[name] || { rough: 0.9 };
  const mesh = new THREE.Mesh(toGeometry(buf), litMaterial(o.rough, o));
  mesh.receiveShadow = true;
  if (name === 'props' || name === 'gate') mesh.castShadow = true;
  mesh.frustumCulled = false;   // single huge buffers; chunked culling is a Phase-B job
  scene.add(mesh);
  triCount += buf.idx.length / 3;
}

/* ── cars: 22 draws vs one InstancedMesh (criterion 4) ────────────────────── */
const carGeo = toGeometry(data.car);
const carMat = litMaterial(0.45);
const carMeshes = new THREE.Group();
const carTransforms = [];
for (const slot of data.carGrid) {
  const m = new THREE.Mesh(carGeo, carMat);
  m.position.set(slot.x, slot.y, slot.z);
  m.rotation.y = slot.heading;
  m.castShadow = true;
  carMeshes.add(m);
  m.updateMatrix();
  carTransforms.push(m.matrix.clone());
}
const carInst = new THREE.InstancedMesh(carGeo, carMat, carTransforms.length);
carTransforms.forEach((mtx, i) => carInst.setMatrixAt(i, mtx));
carInst.instanceMatrix.needsUpdate = true;
carInst.castShadow = true;
carInst.visible = false;
scene.add(carMeshes, carInst);
let instancing = false;
function setInstancing(on) {
  instancing = !!on;
  carMeshes.visible = !instancing;
  carInst.visible = instancing;
}

/* ── camera: manual orbit around a track fraction ─────────────────────────── */
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 4000);
const cam = { frac: 0.0, az: 155, el: 14, dist: 46 };
const target = new THREE.Vector3();
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
  camera.lookAt(target);
}
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; });
window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  cam.az -= (e.clientX - drag.x) * 0.3; cam.el = Math.min(85, Math.max(2, cam.el + (e.clientY - drag.y) * 0.2));
  drag = { x: e.clientX, y: e.clientY };
});
window.addEventListener('pointerup', () => { drag = null; });
window.addEventListener('wheel', (e) => { cam.dist = Math.min(400, Math.max(8, cam.dist * (e.deltaY > 0 ? 1.1 : 0.9))); });
window.addEventListener('keydown', (e) => { if (e.key === 'i') setInstancing(!instancing); });
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ── post: bloom + (renderer-level) ACES ──────────────────────────────────── */
const Pipeline = THREE.RenderPipeline || THREE.PostProcessing;
const pipeline = new Pipeline(renderer);
const scenePass = pass(scene, camera);
const sceneColor = scenePass.getTextureNode('output');
pipeline.outputNode = sceneColor.add(bloom(sceneColor, 0.55, 0.35, 0.9));

/* ── per-frame: lamp cull (the REAL game path) + stats ────────────────────── */
const eyeArr = [0, 0, 0], fwdArr = [0, 0, 0];
function updateLamps() {
  eyeArr[0] = camera.position.x; eyeArr[1] = camera.position.y; eyeArr[2] = camera.position.z;
  fwdArr[0] = target.x - camera.position.x; fwdArr[2] = target.z - camera.position.z;
  const flat = SpikeData.frameLights(eyeArr, fwdArr);
  const nSrc = flat ? Math.min(MAX_LIGHTS, flat.length / 15) : 0;
  const n = Math.min(nSrc, lightCap);
  for (let i = 0; i < n; i++) {
    const o = i * 15;
    lampPos[i].set(flat[o], flat[o + 1], flat[o + 2]);
    lampCol[i].set(flat[o + 3], flat[o + 4], flat[o + 5]);
    lampDir[i].set(flat[o + 7], flat[o + 8], flat[o + 9]);
    lampGeo[i].set(flat[o + 6], flat[o + 10], flat[o + 11], flat[o + 12]);
  }
  uNumLights.value = n;
  return n;
}

const msRing = new Float32Array(90); let msIdx = 0, msN = 0, lastT = performance.now();
let frames = 0, activeLights = 0;
function animate() {
  const t = performance.now();
  msRing[msIdx] = t - lastT; msIdx = (msIdx + 1) % msRing.length; msN = Math.min(msN + 1, msRing.length);
  lastT = t;
  placeCamera();
  // sun shadow box follows the camera target (GLX snap-caches a moving light box)
  sun.position.set(target.x + 180, target.y + 420, target.z + 120);
  sun.target.position.copy(target);
  activeLights = updateLamps();
  pipeline.render();
  frames++;
  if (frames === 1) { window.__spike.ready = true; }
  if (frames % 15 === 0) say(hudText());
}

function avgMs() { let s = 0; for (let i = 0; i < msN; i++) s += msRing[i]; return msN ? s / msN : 0; }
function drawCalls() {
  const r = renderer.info.render;
  return (r.drawCalls !== undefined ? r.drawCalls : r.calls) || 0;
}
function hudText() {
  return `three.js spike — ${TRACK_ID}\n`
    + `backend      ${BACKEND}${FORCE_GL ? ' (forced)' : ''}\n`
    + `frame        ${avgMs().toFixed(2)} ms (${(1000 / Math.max(0.01, avgMs())).toFixed(0)} fps)\n`
    + `draw calls   ${drawCalls()}\n`
    + `triangles    ${(renderer.info.render.triangles || triCount).toLocaleString()}\n`
    + `lamps        ${activeLights} / cap ${lightCap}\n`
    + `cars         ${instancing ? 'InstancedMesh (1 draw)' : '22 meshes'}  [i] toggles`;
}

/* ── __spike hooks (mirrors the __apex convention) ────────────────────────── */
window.__spike = {
  ready: false,
  backend: BACKEND,
  stats() {
    return {
      backend: BACKEND, forced: FORCE_GL, ms: avgMs(), fps: 1000 / Math.max(0.01, avgMs()),
      drawCalls: drawCalls(), triangles: renderer.info.render.triangles || triCount,
      lights: activeLights, lightCap, instancing, frames,
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
  setLightCount(nMax) { lightCap = Math.max(0, Math.min(MAX_LIGHTS, nMax | 0)); return lightCap; },
  resetMs() { msN = 0; msIdx = 0; },
};

placeCamera();
renderer.setAnimationLoop(animate);
say('first frame…');
