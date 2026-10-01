// COCKPIT CHOICES (owner, 2026-09-29: "a bunch of different options like options
// for wheel, options for interior design, halo size" — all inside the same F1
// car). SETTINGS › DISPLAY › COCKPIT: WHEEL (F1 2026 / 2000s / CLASSIC / NONE),
// SEAT (STANDARD / LOW / HIGH / FORWARD), HALO (OFF / SLIM / STANDARD / THICK),
// INTERIOR (CARBON / TEAM / CLASSIC). Runs the real js/camera/cockpit-opts.js,
// js/camera/vantage.js and js/car/car-mesh.js in node vms; the draw path and the
// HUD gate are source pins. No browser (~0.2 s).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { loadCar3D } from "../../tools/car/cockpit-pale-sweep.mjs";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function loadOpts(disk, search = "", withCams = false) {
  const store = new Map(Object.entries(disk || {}));
  const ctx = vm.createContext({
    Math, JSON, Object, Array, Number, console,
    GameStore: { store: { raw: (k) => (store.has(k) ? store.get(k) : null), rawSet: (k, v) => { store.set(k, v); return true; } } },
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    location: { search },
    Tracks: {}, CamTune: { get: () => 0, cornerLead: () => 0, apply: (_, __, ___, fov) => fov },
  });
  vm.runInContext(read("js/camera/cockpit-opts.js") + "\n;this.CockpitOpts = CockpitOpts;", ctx);
  if (withCams) {
    vm.runInContext(read("js/core/mat4.js"), ctx);
    vm.runInContext(read("js/camera/vantage.js") + "\n;this.GameCams = GameCams;", ctx);
  }
  return { opts: ctx.CockpitOpts, cams: ctx.GameCams, store };
}

function loadMesh() {
  const made = [], freed = [];
  const ctx = { Log: { info() {}, warn() {}, error() {} }, GaragePrims: { block() {} } };
  vm.createContext(ctx);
  vm.runInContext(read("js/car/car-mesh.js") + "\n;this.CarMesh = CarMesh;", ctx, { filename: "car-mesh.js" });
  ctx.CarMesh.init({
    createMesh(d) { const m = { d }; made.push(m); return m; },
    freeMesh(m) { freed.push(m); },
  });
  return { CarMesh: ctx.CarMesh, made, freed };
}
const LIV = { c1: [0.8, 0.1, 0.1], c2: [0.9, 0.9, 0.9], accent: [1, 0.8, 0] };

function bounds(d) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < d.pos.length; i++) { mn[i % 3] = Math.min(mn[i % 3], d.pos[i]); mx[i % 3] = Math.max(mx[i % 3], d.pos[i]); }
  return { mn, mx };
}
// Is there a vertex at (x, y, z) within eps? The LCD's driver-side face is at z -0.031.
const hasVertex = (d, x, y, z, eps = 1e-6) => {
  for (let i = 0; i < d.pos.length; i += 3)
    if (Math.abs(d.pos[i] - x) < eps && Math.abs(d.pos[i + 1] - y) < eps && Math.abs(d.pos[i + 2] - z) < eps) return true;
  return false;
};

test("each choice defaults to what shipped, persists, falls back, and takes a URL override", () => {
  const { opts, store } = loadOpts({});
  assert.deepEqual([...opts.CHOICES.wheel.values], ["f1", "gt", "butterfly", "yoke", "endurance", "retro", "round", "none"]);
  assert.deepEqual([...opts.CHOICES.seat.values], ["std", "low", "high", "fwd"]);
  assert.deepEqual([...opts.CHOICES.interior.values], ["carbon", "team", "suede", "ribbed", "classic"]);
  assert.deepEqual([opts.wheel(), opts.seat(), opts.interior(), opts.haloSize()], ["f1", "std", "carbon", 2], "an untouched install is the cockpit that shipped");
  opts.setWheel("retro"); opts.setSeat("high"); opts.setInterior("team");
  assert.deepEqual([store.get("apex26.cockpitWheel"), store.get("apex26.cockpitSeat"), store.get("apex26.cockpitInterior")], ["retro", "high", "team"], "written raw");
  assert.equal(loadOpts({ "apex26.cockpitSeat": "low" }).opts.seat(), "low", "a stored choice survives a reload");
  assert.equal(loadOpts({ "apex26.cockpitWheel": "unknown" }).opts.wheel(), "f1", "an unknown wheel falls back to F1 2026");
  assert.equal(opts.setInterior("banana"), "carbon");
  const url = loadOpts({ "apex26.cockpitWheel": "retro" }, "?ckwheel=none&ckseat=fwd&ckint=classic").opts;
  assert.deepEqual([url.wheel(), url.seat(), url.interior()], ["none", "fwd", "classic"], "URL overrides for shots");
});

test("HALO has four sizes plus a faired style and still reads the old ON/OFF switch", () => {
  assert.deepEqual([...loadOpts({}).opts.HALO_VALUES], ["0", "slim", "1", "thick", "fairing"]);
  const sizes = ["0", "slim", "1", "thick", "fairing"].map((v) => loadOpts({ "apex26.cockpitHalo": v }).opts.haloSize());
  assert.deepEqual(sizes, [0, 1, 2, 3, 4]);
  assert.equal(loadOpts({ "apex26.cockpitHalo": "0" }).opts.halo(), false, "a stored OFF stays off");
  assert.equal(loadOpts({ "apex26.cockpitHalo": "1" }).opts.halo(), true, "a stored ON is STANDARD");
  assert.equal(loadOpts({}, "?halo=off").opts.haloSize(), 0);
  assert.equal(loadOpts({}, "?halo=thick").opts.haloSize(), 3);
  assert.equal(loadOpts({}, "?halo=fairing").opts.haloSize(), 4);
  const { opts, store } = loadOpts({});
  opts.setHalo(false); assert.equal(store.get("apex26.cockpitHalo"), "0", "the boolean form still works");
  opts.setHalo("slim"); assert.equal(opts.haloSize(), 1);
});

test("a seat moves the eye and the wheel together; every wheel stays clear of the near plane", () => {
  const { opts } = loadOpts({});
  const std = opts.layout("f1", "std");
  assert.deepEqual([std.eyeF, std.eyeU, std.wheelY, std.wheelZ, std.wheelS], [-0.20, 0.82, 0.70, 0.26, 0.80], "STANDARD + F1 2026 mounts the wheel inside the raised cockpit surround");
  for (const w of opts.CHOICES.wheel.values) {
    const base = opts.layout(w, "std");
    for (const s of opts.CHOICES.seat.values) {
      const L = opts.layout(w, s);
      assert.ok(Math.abs((L.wheelZ - L.eyeF) - (base.wheelZ - base.eyeF)) < 1e-9 && Math.abs((L.wheelY - L.eyeU) - (base.wheelY - base.eyeU)) < 1e-9,
        `${w}/${s}: the wheel moved with the seat`);
      assert.ok(L.wheelZ - L.eyeF >= 0.40, `${w}/${s}: the hub is ${(L.wheelZ - L.eyeF).toFixed(2)} m ahead of the eye (near plane 0.30)`);
    }
  }
  assert.ok(opts.layout("f1", "low").eyeU < std.eyeU && opts.layout("f1", "high").eyeU > std.eyeU && opts.layout("f1", "fwd").eyeF > std.eyeF, "LOW is lower, HIGH higher, FORWARD further forward");
  assert.equal(opts.layout("f1", "high"), opts.layout("f1", "high"), "cached: the per-frame read allocates nothing");
});

test("the camera eye is the chosen seat; VISOR keeps its own", () => {
  const { opts, cams } = loadOpts({}, "", true);
  assert.deepEqual([cams.seatFwd("cockpit"), cams.seatUp("cockpit")], [cams.COCKPIT_EYE_FWD, cams.COCKPIT_EYE_UP], "STANDARD is vantage.js's cockpit eye");
  opts.setSeat("high");
  assert.ok(Math.abs(cams.seatUp("cockpit") - opts.layout().eyeU) < 1e-12 && cams.seatUp("cockpit") > cams.COCKPIT_EYE_UP);
  opts.setSeat("fwd");
  assert.ok(Math.abs(cams.seatFwd("cockpit") - opts.layout().eyeF) < 1e-12);
  assert.deepEqual([cams.seatFwd("visor"), cams.seatUp("visor")], [cams.VISOR_EYE_FWD, cams.VISOR_EYE_UP], "the phone's VISOR ignores SEAT");
});

test("all modern wheels carry the readouts, and a change reaches listeners", () => {
  const { opts } = loadOpts({});
  assert.deepEqual([...opts.CHOICES.wheel.values].map((w) => opts.wheelHasScreen(w)), [true, true, true, true, true, false, false, false]);
  const seen = [];
  opts.onWheel((name, v) => seen.push(name + ":" + v));
  opts.setWheel("round"); opts.setSeat("low");
  assert.equal(opts.wheelHasScreen(), false, "no argument = the chosen wheel");
  assert.deepEqual(seen, ["wheel:round", "seat:low"]);
});

test("the refined wheel styles fit their mounts and keep the shared LCD and hand clearance", () => {
  const { CarMesh } = loadMesh();
  const f1 = CarMesh.getCockpitWheel(LIV, "f1").d;
  assert.equal(CarMesh.getCockpitWheel(LIV), CarMesh.getCockpitWheel(LIV, "f1"), "no style uses the modern wheel cache");
  const lcd = [-0.056, -0.01, -0.031];
  assert.ok(hasVertex(f1, ...lcd), "F1 2026 carries the display the telemetry is drawn on");
  for (const st of ["retro", "round"]) {
    const d = CarMesh.getCockpitWheel(LIV, st).d, { mn, mx } = bounds(d);
    assert.ok(!hasVertex(d, ...lcd), `${st} has no big screen`);
    assert.ok(mx[0] <= 0.224 && mn[0] >= -0.224 && mx[1] <= 0.19 && mn[1] >= -0.19, `${st} fits the F1 wheel's footprint`);
    assert.ok(mn[2] >= -0.072, `${st}: nothing nearer the driver than the F1 wheel's wrists (${mn[2]})`);
    // The shaped palms must still cover the nine-and-three grip points.
    for (const side of [-1,1]) assert.ok(d.pos.some((v,i) => i%3===0 && Math.abs(v-side*0.165)<0.025
      && Math.abs(d.pos[i+1])<0.060 && d.pos[i+2]<-0.02), `${st}: a palm at the ${side<0?"left":"right"} grip`);
  }
  assert.deepEqual([...CarMesh.COCKPIT_WHEELS], ["f1", "gt", "butterfly", "yoke", "endurance", "retro", "round"], "NONE is getCockpitDash, not a wheel");
});

test("the interiors build inside the tub, keyed by livery, and only CLASSIC has glass", () => {
  const { CarMesh, freed } = loadMesh();
  for (const kind of ["carbon", "team", "suede", "ribbed", "classic"]) {
    const d = CarMesh.getCockpitCabin(kind, LIV).d, { mn, mx } = bounds(d);
    assert.ok(d.pos.length > 0 && d.idx.length % 3 === 0, `${kind} builds`);
    assert.ok(mn[0] >= -0.33 && mx[0] <= 0.33, `${kind} stays between the tub walls (±0.315): ${mn[0].toFixed(3)}..${mx[0].toFixed(3)}`);
    // Nothing may crowd the eye: CLASSIC's scuttle starts ahead of it (run back
    // past it, the rails filled the lower corners); TEAM's pads run alongside the
    // driver but stay under the LOW seat's eye (0.76).
    if (kind === "classic") assert.ok(mn[2] >= -0.20, `classic starts at or ahead of the STANDARD eye (z -0.20): ${mn[2].toFixed(3)}`);
    else assert.ok(mx[1] < 0.76, `team stays under the LOW seat's eye: top ${mx[1].toFixed(3)}`);
  }
  const a = CarMesh.getCockpitCabin("team", LIV);
  assert.equal(CarMesh.getCockpitCabin("team", LIV), a, "cached");
  CarMesh.getCockpitCabin("team", { ...LIV, c1: [0.1, 0.1, 0.8] });
  assert.ok(freed.includes(a), "a livery change frees and rebuilds");
  const glass = CarMesh.getCockpitGlass("classic").d;
  assert.equal(glass.pos.length / 3, 12, "three aeroscreen panels");
  const { mx } = bounds(glass);
  assert.ok(mx[1] < 0.90, "the screen's top stays under the HIGH seat's eye line");
});

test("the rig draws the chosen wheel, seat and interior; a screenless wheel gives the HUD back", () => {
  const draw = read("js/car/car-draw.js");
  const rig = draw.slice(draw.indexOf("function drawCockpitRig("), draw.indexOf("function playerBodyMesh("));
  assert.match(rig, /const wheelStyle = noWheel \? "none" : CockpitOpts\.wheel\(\), lay = CockpitOpts\.layout\(wheelStyle, noWheel \? "std" : null\);/);
  assert.match(rig, /_rigT\[0\] = _rigT\[5\] = _rigT\[10\] = lay\.wheelS; _rigT\[13\] = lay\.wheelY; _rigT\[14\] = lay\.wheelZ;/, "the wheel mount follows the seat");
  assert.match(rig, /G\.gfx\.draw\(getCockpitCabin\(cab, deps\.resolveLivery\(c\.team\)\), base, opt\);/, "every interior draws its trim, including CARBON");
  const none = rig.indexOf('if (wheelStyle === "none") {'), wheel = rig.indexOf("getCockpitWheel(deps.resolveLivery(c.team), wheelStyle)");
  const gate = rig.indexOf("if (!CockpitOpts.wheelHasScreen(wheelStyle)) return;"), gear = rig.indexOf("getGearDigit(");
  assert.ok(none > 0 && none < wheel, "NONE (and VISOR) return with the column and bulkhead before any wheel");
  assert.ok(wheel < gate && gate < gear, "no screen, no gear/LED/speed/ERS/OT draws");
  assert.match(draw, /":H" \+ haloSz \+ ":B" \+ CockpitOpts\.body\(\)/, "the cockpit body is cached per halo size");
  assert.match(read("js/car/car3d.js"), /opts\.halo === true \? 1 : \[0, 0\.64, 1, 1\.44\]/, "car3d sizes the first-person hoop");
  const ms = read("js/camera/mode-switch.js");
  assert.match(ms, /"cockpit-cam", CAM_MODES\[G\.camMode\]\.id === "cockpit"\s*&& \(typeof CockpitOpts === "undefined" \|\| CockpitOpts\.wheelHasScreen\(\)\)\);/,
    "body.cockpit-cam (which hides the HUD gear/speed) needs a wheel with a screen");
  assert.match(ms, /CockpitOpts\.onWheel\(refreshCamBtn\);/, "a mid-race change re-evaluates it");
  const exp = read("js/ui/settings-export.js");
  for (const [k, def, one] of [["cockpitWheel", "f1", '"f1", "gt", "butterfly", "yoke", "endurance", "retro", "round", "none"'], ["cockpitSeat", "std", '"std", "low", "high", "fwd"'],
    ["cockpitInterior", "carbon", '"carbon", "team", "suede", "ribbed", "classic"']])
    assert.ok(exp.includes(`k: "${k}", lane: "raw", group: "camera", def: "${def}"`) && exp.includes(`oneOf: [${one}]`), `${k} is exported and imported`);
  assert.ok(exp.includes('oneOf: ["0", "slim", "1", "thick", "fairing"]'), "cockpitHalo accepts the sizes and faired style");
});

// These are geometric safety contracts, rather than a frozen vertex count:
// malformed panels or a near-plane regression break actual rendering.
test("all cockpit geometry has finite unit normals, valid indices and non-degenerate triangles", () => {
  const { CarMesh } = loadMesh();
  const meshes = [...CarMesh.COCKPIT_WHEELS.map(w => CarMesh.getCockpitWheel(LIV,w).d),
    ...["carbon","team","suede","ribbed","classic"].map(k=>CarMesh.getCockpitCabin(k,LIV).d), CarMesh.getCockpitDash().d];
  for(const d of meshes) {
    assert.equal(d.pos.length,d.nrm.length); assert.equal(d.pos.length,d.col.length);
    assert.ok(d.pos.every(Number.isFinite) && d.nrm.every(Number.isFinite));
    assert.ok(d.idx.every(i=>Number.isInteger(i)&&i>=0&&i<d.pos.length/3));
    for(let i=0;i<d.nrm.length;i+=3) assert.ok(Math.abs(Math.hypot(...d.nrm.slice(i,i+3))-1)<1e-6,"normal is unit length");
    for(let i=0;i<d.idx.length;i+=3) {
      const [a,b,c]=d.idx.slice(i,i+3).map(j=>d.pos.slice(j*3,j*3+3));
      const u=b.map((v,j)=>v-a[j]),v=c.map((n,j)=>n-a[j]);
      assert.ok(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>1e-12,"triangle has area");
    }
  }
});

test("fifteen shift lenses keep the existing ramp/flash states, with the original aligned LCD gear", () => {
  const { CarMesh }=loadMesh();
  const off=CarMesh.getLedStrip(0).d, full=CarMesh.getLedStrip(8).d, flash=CarMesh.getLedStrip(9).d;
  assert.equal(off.pos.length/3,15*9,"15 eight-sided round lenses");
  assert.equal(full.pos.length,off.pos.length); assert.equal(flash.pos.length,off.pos.length);
  assert.ok(full.col.some(c=>c>1)); assert.ok(off.col.every(c=>c<0.1));
  const gear=CarMesh.getGearDigit(8).d, {mn,mx}=bounds(gear);
  assert.ok(Math.abs((mn[0]+mx[0])/2-0.014)<1e-9,"gear keeps its original LCD cell");
  assert.ok(mn[0]>-0.056&&mx[0]<0.056&&mn[1]>-0.010&&mx[1]<0.058,"glyph stays on LCD");
  assert.ok(gear.col.every((c,i)=>i%3!==0||c>gear.col[i+1]),"gear retains its original orange colour");
});

// Trace the driver's sightline, not a screenshot colour: the glass can look
// grey while a dark stay pierces its lower half. This checks actual occlusion.
function firstMaterial(mesh, eye, target) {
  const sub=(a,b)=>a.map((v,i)=>v-b[i]), dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const point=(i)=>mesh.pos.slice(i*3,i*3+3), d=sub(target,eye);
  let nearest=Infinity, material=null;
  for(let i=0;i<mesh.idx.length;i+=3){
    const a=mesh.idx[i], p=point(a), e1=sub(point(mesh.idx[i+1]),p), e2=sub(point(mesh.idx[i+2]),p);
    const h=cross(d,e2), det=dot(e1,h); if(Math.abs(det)<1e-10)continue;
    // Inclusive edges avoid missing both triangles on a shared diagonal.
    const v=sub(eye,p), u=dot(v,h)/det; if(u < -1e-12 || u > 1+1e-12)continue;
    const q=cross(v,e1), w=dot(d,q)/det; if(w < -1e-12 || u+w > 1+1e-12)continue;
    const t=dot(e2,q)/det;
    if(t>0&&t<nearest){nearest=t;material=mesh.mat[a];}
  }
  return material;
}

test("both cockpit mirror lenses remain clear of their stays from every seat",()=>{
  const {Car3D,Teams,Parts}=loadCar3D(), {opts}=loadOpts({});
  for(const team of Teams.LIST.slice(0,2))for(const setup of [Parts.DEFAULTS,Parts.getFactorySetup(team)])for(const cockpitBody of opts.CHOICES.body.values){
  const mesh=Car3D.build(team.color,team.color2,{teamId:team.id,parts:Parts.getVisualTiers(setup,team),
    cockpit:true,cockpitBody,noWheels:true,noDriver:true,measure:true});
  let start=0;
  for(const p of mesh.parts){if(p.name==='mirrors')break;start+=p.vertices;}
  const end=start+mesh.parts.find(p=>p.name==='mirrors').vertices;
  const lenses=[];
  for(let v=start;v<end;v+=6){
    if(mesh.mat[v]===Car3D.SURFACES.glass&&mesh.nrm[v*3+2]<-0.5)
      lenses.push([0,1,2,5].map(i=>mesh.pos.slice((v+i)*3,(v+i)*3+3)));
  }
  assert.equal(lenses.length,2,"one driver-facing lens on each side");
  for(const seat of opts.CHOICES.seat.values){
    const l=opts.layout('f1',seat), eye=[0,l.eyeU,l.eyeF];
    for(const lens of lenses)for(const u of [0.05,0.25,0.5,0.75,0.95])for(const v of [0.05,0.25,0.5,0.75,0.95]){
      const target=lens[0].map((_,i)=>(1-u)*(1-v)*lens[0][i]+u*(1-v)*lens[1][i]+u*v*lens[2][i]+(1-u)*v*lens[3][i]);
      assert.equal(firstMaterial(mesh,eye,target),Car3D.SURFACES.glass,`${team.id}/${seat}: mirror glass obscured at ${u}/${v}`);
    }
  }
  }
});

test("the faired halo adds a broad carbon crown with bounded geometry cost",()=>{
  const {Car3D}=loadCar3D();
  const build=halo=>Car3D.build(LIV.c1,LIV.c2,{cockpit:true,noWheels:true,noDriver:true,halo});
  const tube=build(2), fair=build(4);
  assert.ok(fair.idx.length<=tube.idx.length+60,"fairing adds at most twenty triangles over the tubular halo");
  assert.ok(fair.pos.every(Number.isFinite)&&fair.nrm.every(Number.isFinite),"all roof station normals are finite");
  const crown=fair.pos.filter((_,i)=>i%3===1&&fair.pos[i]>1.05);
  assert.ok(crown.length>0,"faired crown sits above the driver's eye");
  assert.ok(fair.mat.some((m,i)=>m===Car3D.SURFACES.carbon&&fair.pos[i*3+1]>1.05),"roof has a carbon fairing");
});

test("the cockpit shoulders wrap the wheel while staying below the low-seat eye",()=>{
  const {Car3D}=loadCar3D(), {opts}=loadOpts({});
  const mesh=Car3D.build(LIV.c1,LIV.c2,{cockpit:true,noWheels:true,noDriver:true,measure:true});
  let start=0;
  for(const p of mesh.parts){if(p.name==='bolsters')break;start+=p.vertices;}
  const count=mesh.parts.find(p=>p.name==='bolsters').vertices;
  const {mx}=bounds({pos:mesh.pos.slice(start*3,(start+count)*3)});
  assert.ok(mx[1]>opts.layout('f1','std').wheelY+0.045,"shoulders enclose the wheel at hand height");
  assert.ok(mx[1]<opts.layout('f1','low').eyeU,"raised walls stay below even the LOW eye");
});


test("body designs persist, export and take URL overrides without changing the default", () => {
  const { opts, store } = loadOpts({});
  assert.equal(opts.body(), "standard");
  opts.setBody("wide");
  assert.equal(store.get("apex26.cockpitBody"), "wide");
  assert.equal(loadOpts({ "apex26.cockpitBody": "wide" }).opts.body(), "wide");
  assert.equal(loadOpts({ "apex26.cockpitBody": "wide" }, "?ckbody=sculpted").opts.body(), "sculpted");
  assert.equal(opts.setBody("unknown"), "standard");
  assert.match(read("js/ui/settings-export.js"), /k: "cockpitBody".*oneOf: \["standard", "sculpted", "wide", "tapered", "stepped"\]/);
});

test("modern wheel alternatives retain the shared live LCD and have distinct shapes", () => {
  const { CarMesh } = loadMesh();
  const meshes = ["f1", "gt", "butterfly", "yoke", "endurance"].map(w => CarMesh.getCockpitWheel(LIV, w).d);
  for (const d of meshes) {
    assert.ok(hasVertex(d, -0.056, -0.01, -0.031), "live LCD face stays at its telemetry mount");
    const { mn, mx } = bounds(d);
    assert.ok(mn[2] >= -0.072 && mx[0] <= 0.224 && mn[0] >= -0.224, "hands and near-plane clearance");
    assert.ok(mx[1] * 0.80 + 0.70 < 0.82, "modern rim stays below the STANDARD eye");
  }
  for (let i=0;i<meshes.length;i++) for (let j=0;j<i;j++) assert.notDeepEqual(meshes[i].pos, meshes[j].pos);
});

test("body alternatives change shoulders but retain cockpit clearance and geometry budget", () => {
  const { Car3D } = loadCar3D(), { opts } = loadOpts({});
  const shapes = opts.CHOICES.body.values.map(cockpitBody => Car3D.build(LIV.c1, LIV.c2,
    { cockpit: true, cockpitBody, noWheels: true, noDriver: true, measure: true }));
  for (const mesh of shapes) {
    assert.ok(mesh.pos.every(Number.isFinite) && mesh.nrm.every(Number.isFinite));
    assert.ok(mesh.idx.length / 3 <= 1500, "body-only cockpit triangle budget");
    let start = 0;
    for (const part of mesh.parts) { if (part.name === "bolsters") break; start += part.vertices; }
    const count = mesh.parts.find(p => p.name === "bolsters").vertices;
    const { mx } = bounds({ pos: mesh.pos.slice(start * 3, (start + count) * 3) });
    assert.ok(mx[1] < opts.layout("f1", "low").eyeU, "walls stay below the LOW-seat eye");
  }
  for (let i=0;i<shapes.length;i++) for (let j=0;j<i;j++) assert.notDeepEqual(shapes[i].pos, shapes[j].pos);
});
