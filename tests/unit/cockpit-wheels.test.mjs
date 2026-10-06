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

function loadMesh(extra = {}, gfxExtra = {}) {
  const made = [], freed = [], draws = [];
  const ctx = { Log: { info() {}, warn() {}, error() {} }, GaragePrims: { block() {} }, ...extra };
  ctx.window=ctx;
  vm.createContext(ctx);
  vm.runInContext(read("js/core/mat4.js"),ctx);
  vm.runInContext(read("js/physics/consts.js"),ctx);
  vm.runInContext(read("js/car/car-mesh.js") + "\n;this.CarMesh = CarMesh;", ctx, { filename: "car-mesh.js" });
  ctx.CarMesh.init({
    createMesh(d) { const m = { d }; made.push(m); return m; },
    freeMesh(m) { freed.push(m); },
    draw(m,mat,opt) { draws.push({mesh:m.d,mat:[...mat],opt:{...opt}}); },
    ...gfxExtra,
  });
  return { CarMesh: ctx.CarMesh, made, freed, draws };
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
  assert.deepEqual([...opts.CHOICES.wheel.values].map((w) => opts.wheelHasScreen(w)), [true, true, true, true, true, true, false, false]);
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
  const { CarMesh, freed } = loadMesh(), { opts } = loadOpts({});
  const rearLimit = Math.min(...opts.CHOICES.seat.values.map(s => opts.layout("f1", s).eyeF)) - 0.35;
  for (const kind of ["carbon", "team", "suede", "ribbed", "classic"]) {
    const d = CarMesh.getCockpitCabin(kind, LIV).d, { mn, mx } = bounds(d);
    assert.ok(d.pos.length > 0 && d.idx.length % 3 === 0, `${kind} builds`);
    assert.ok(mn[0] >= -0.33 && mx[0] <= 0.33, `${kind} stays between the tub walls (±0.315): ${mn[0].toFixed(3)}..${mx[0].toFixed(3)}`);
    // Tall rear headrests must stay well behind every eye and its near plane.
    // Alongside the eye, modern trim still stays below even the LOW seat.
    for (let i=0;i<d.pos.length;i+=3) if (d.pos[i+1] >= 0.76)
      assert.ok(d.pos[i+2] <= rearLimit || (kind === "classic" && d.pos[i+2] >= -0.20),
        `${kind}: tall trim crowds the eye at z ${d.pos[i+2]}`);
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
  // No forearm sleeves in the cockpit (removed 2026-10-04): the tubes from the
  // cuffs to the bottom of the frame read as pipes meeting the wheel. The
  // gloves stay on the grips; neither the race cockpit nor the preview draws arms.
  assert.ok(!/CarMesh\.drawForearms\(/.test(rig), "the race cockpit draws no forearm sleeves");
  assert.ok(!/CarMesh\.drawForearms\(/.test(read("js/camera/cockpit-preview.js")), "the cockpit preview draws none either");
  // The lock: progressive, through the shared roll curve, behind a λ12 damp (was a flat 0.80 rad behind λ6).
  assert.match(rig, /deps\.damp\(c\._whlVis == null \? 0 : c\._whlVis, M4\.clamp\(c\.steerVis \|\| 0, -1, 1\), CarMesh\.WHEEL_ROLL_LAMBDA, dt\);/);
  assert.match(rig, /const a = CarMesh\.cockpitWheelRoll\(c\._whlVis\);/);
  assert.match(rig, /getLedStrip\([^;]*, wheelStyle\), _rigB, fx\)/, "each fascia gets its own shift-light row");
  assert.match(draw, /":H" \+ haloSz \+ ":B" \+ CockpitOpts\.body\(\)/, "the cockpit body is cached per halo size");
  assert.match(read("js/car/car3d.js"), /opts\.halo === true \? 1 : \[0, 0\.64, 1, 1\.44\]/, "car3d sizes the first-person hoop");
  const ms = read("js/camera/mode-switch.js");
  assert.match(ms, /"cockpit-cam", camId === "cockpit"\s*&& \(typeof CockpitOpts === "undefined" \|\| CockpitOpts\.wheelHasScreen\(\)\)\);/,
    "body.cockpit-cam (which hides the HUD gear/speed) needs a wheel with a screen — in COCKPIT only: HELMET is the visor HUD (js/camera/cam-groups.js)");
  assert.match(ms, /CockpitOpts\.onWheel\(refreshCamBtn\);/, "a mid-race change re-evaluates it");
  const exp = read("js/ui/settings-export.js");
  for (const [k, def, one] of [["cockpitWheel", "f1", '"f1", "gt", "butterfly", "yoke", "endurance", "retro", "round", "none"'], ["cockpitSeat", "std", '"std", "low", "high", "fwd"'],
    ["cockpitInterior", "team", '"carbon", "team", "suede", "ribbed", "classic"']])
    assert.ok(exp.includes(`k: "${k}", lane: "raw", group: "camera", def: "${def}"`) && exp.includes(`oneOf: [${one}]`), `${k} is exported and imported`);
  assert.ok(exp.includes('oneOf: ["0", "slim", "1", "thick", "fairing"]'), "cockpitHalo accepts the sizes and faired style");
});

// These are geometric safety contracts, rather than a frozen vertex count:
// malformed panels or a near-plane regression break actual rendering.
test("all cockpit geometry has finite unit normals, valid indices and non-degenerate triangles", () => {
  const { CarMesh } = loadMesh();
  const meshes = [...CarMesh.COCKPIT_WHEELS.map(w => CarMesh.getCockpitWheel(LIV,w).d),
    ...["carbon","team","suede","ribbed","classic"].map(k=>CarMesh.getCockpitCabin(k,LIV).d), CarMesh.getCockpitDash().d,
    CarMesh.getForearm(LIV).d, ...[0, 8, 9].flatMap((n) => ["f1", "gt", "yoke"].map((s) => CarMesh.getLedStrip(n, s).d))];
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
  // BIG ENOUGH TO READ at the wheel's 0.46 m: ~5 mm lenses (were 3.4), never
  // touching, each row inside its own fascia's top edge (the _wheelScreen
  // outline), above the LCD and clear of the side buttons.
  for (const style of ["f1", "gt", "butterfly", "yoke", "endurance"]) {
    const d = CarMesh.getLedStrip(0, style).d, lens = (i) => bounds({ pos: d.pos.slice(i * 27, i * 27 + 27) });
    const r = (lens(0).mx[0] - lens(0).mn[0]) / 2, gap = lens(1).mn[0] - lens(0).mx[0], all = bounds(d);
    assert.ok(r >= 0.0044 && r <= 0.0052, `${style}: lens radius ${(r * 1000).toFixed(1)} mm`);
    assert.ok(gap > 0.0005, `${style}: lenses ${(gap * 1000).toFixed(2)} mm apart — a row of lamps, not a bar`);
    // The fascia plate's driver-side face (_rigPlate z 0.014, depth 0.042) is
    // the only geometry at z -0.007 inboard of the gloves (|x| >= 0.169); its
    // convex outline must hold the row.
    const wheel = CarMesh.getCockpitWheel(LIV, style).d, plate = [];
    for (let i = 0; i < wheel.pos.length; i += 3)
      if (Math.abs(wheel.pos[i + 2] + 0.007) < 1e-9 && Math.abs(wheel.pos[i]) < 0.15) plate.push([wheel.pos[i], wheel.pos[i + 1]]);
    // Convex hull (monotone chain, counter-clockwise), then every edge must
    // have the point on its inner side — with a millimetre's grace.
    const pts = plate.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const half = (list) => { const h = []; for (const p of list) { while (h.length > 1 && turn(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); } h.pop(); return h; };
    const hull = [...half(pts), ...half(pts.slice().reverse())];
    const inside = (x, y) => hull.every((a, i) => {
      const b = hull[(i + 1) % hull.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return turn(a, b, [x, y]) / L >= -0.001;
    });
    for (const [x, y] of [[all.mx[0], all.mx[1]], [all.mn[0], all.mx[1]], [all.mx[0], all.mn[1]], [all.mn[0], all.mn[1]]])
      assert.ok(inside(x, y), `${style}: the row's corner (${x.toFixed(3)}, ${y.toFixed(3)}) overhangs the fascia`);
    assert.ok(all.mn[1] >= 0.0575, `${style}: the row sits above the LCD, not on it`);
    assert.equal(CarMesh.getLedStrip(0, style), CarMesh.getLedStrip(0, style), "cached per row");
  }
  const gear=CarMesh.getGearDigit(8).d, {mn,mx}=bounds(gear);
  assert.ok(Math.abs((mn[0]+mx[0])/2-0.014)<1e-9,"gear keeps its original LCD cell");
  assert.ok(mn[0]>-0.056&&mx[0]<0.056&&mn[1]>-0.010&&mx[1]<0.058,"glyph stays on LCD");
  assert.ok(gear.col.every((c,i)=>i%3!==0||c>gear.col[i+1]),"gear retains its original orange colour");
});

// Trace the driver's sightline, not a screenshot colour: the glass can look
// grey while a dark stay pierces its lower half. This checks actual occlusion.
function firstMaterial(mesh, eye, target, maxT = Infinity, frontOnly = false) {
  const sub=(a,b)=>a.map((v,i)=>v-b[i]), dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const point=(i)=>mesh.pos.slice(i*3,i*3+3), d=sub(target,eye);
  let nearest=maxT, material=null;
  for(let i=0;i<mesh.idx.length;i+=3){
    const a=mesh.idx[i], p=point(a), e1=sub(point(mesh.idx[i+1]),p), e2=sub(point(mesh.idx[i+2]),p);
    const h=cross(d,e2), det=dot(e1,h); if(Math.abs(det)<1e-10 || (frontOnly && det <= 0))continue;
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
    if(mesh.mat[v]===Car3D.SURFACES.mirror&&mesh.nrm[v*3+2]<-0.5)
      lenses.push([0,1,2,5].map(i=>mesh.pos.slice((v+i)*3,(v+i)*3+3)));
  }
  assert.equal(lenses.length,2,"one driver-facing lens on each side");
  for(const seat of opts.CHOICES.seat.values){
    const l=opts.layout('f1',seat), eye=[0,l.eyeU,l.eyeF];
    for(const lens of lenses)for(const u of [0.05,0.25,0.5,0.75,0.95])for(const v of [0.05,0.25,0.5,0.75,0.95]){
      const target=lens[0].map((_,i)=>(1-u)*(1-v)*lens[0][i]+u*(1-v)*lens[1][i]+u*v*lens[2][i]+(1-u)*v*lens[3][i]);
      assert.equal(firstMaterial(mesh,eye,target),Car3D.SURFACES.mirror,`${team.id}/${seat}: mirror glass obscured at ${u}/${v}`);
    }
  }
  }
});

// MIRROR GLASS FALLBACK (owner, 2026-10-02: MIRROR AUTO on a software GPU left
// the housings "flat black slabs"): with the HUD mirror pass off, car-draw.js
// lays a sky-tint gradient over each lens. It must sit ON the lens, just
// driver-side of it, and the LED strip must never go dark at the limiter.
test("the mirror fallback covers each cockpit lens just driver-side, and the limiter strip stays lit",()=>{
  const {Car3D,Teams,Parts}=loadCar3D(), {CarMesh}=loadMesh();
  for(const team of Teams.LIST.slice(0,3))for(const setup of [Parts.DEFAULTS,Parts.getFactorySetup(team)]){
    const tiers=Parts.getVisualTiers(setup,team), sc=tiers._visual&&tiers._visual.cockpit&&tiers._visual.cockpit.mirror;
    const mesh=Car3D.build(team.color,team.color2,{teamId:team.id,parts:tiers,cockpit:true,noWheels:true,noDriver:true,measure:true});
    const quads=Car3D.cockpitMirrorGlass(sc);
    assert.equal(quads,Car3D.cockpitMirrorGlass(sc),"cached per scale");
    const fb=CarMesh.getMirrorFallback(quads).d;
    assert.equal(fb.pos.length/3,16,"two gradient bands per side");
    for(let i=0;i<fb.pos.length;i+=3){
      const p=[fb.pos[i],fb.pos[i+1],fb.pos[i+2]], tgt=[p[0],p[1],p[2]+0.004];
      // The lens is SURFACES.mirror since the cockpit redesign (#781); glass before it.
      assert.equal(firstMaterial(mesh,[p[0],p[1],p[2]-0.0005],tgt),Car3D.SURFACES.mirror,`${team.id}: fallback vertex ${i/3} lies on the lens`);
    }
    assert.ok(fb.col.some(c=>c>0.6)&&fb.col.every(c=>c<0.9),"pale sky top, no white-out");
  }
  const draw=read("js/car/car-draw.js");
  assert.match(draw,/getLedStrip\(rpmF > 0\.965 \? \(motionReduced\(\) \|\| [^)]*\? 9 : 8\)/,"limiter alternates SHIFT and full ramp, never 0");
  // The live glass is TRIED only while the pass draws; the fallback is drawn
  // whenever it is not shown (car-presentation-canary runs the either/or).
  assert.match(draw,/mp && mp\.drawing\(\) && typeof gfx\.drawMirrorGlass === "function" \? getMirrorGlass\(quads\)/,
    "the live glass only while the mirror pass is drawing");
});

// LIVE MIRROR GLASS (2026-10-03): while the HUD mirror pass draws, each lens
// shows THAT pass's image (gfx.drawMirrorGlass) on getMirrorGlass — the same
// lens quads UV'd onto the RAW rear-camera target, the glass flip baked into U.
// It must lie ON the lens, map each glass to its own side of the image, and
// keep the target's texels square on the 3.75:1 lens.
test("the live mirror glass lies on each lens, flips per side in U, and keeps texels square",()=>{
  const {Car3D,Teams,Parts}=loadCar3D();
  const {CarMesh}=loadMesh({}, { createTexMesh(d) { return { d, tex: true }; } });
  // The target's aspect, from the frame the pass sizes it from (css/hud.css).
  const css=read("css/hud.css").match(/#hud-mirror \{[^}]*height: calc\(var\(--mir-w\) \* (\d+) \/ (\d+)\)/);
  assert.ok(css,"#hud-mirror's height rule moved");
  const targetAspect=Number(css[2])/Number(css[1]);
  assert.equal(targetAspect,3.5,"the HUD mirror frame is 7:2");
  const len=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  for(const team of Teams.LIST.slice(0,3))for(const setup of [Parts.DEFAULTS,Parts.getFactorySetup(team)]){
    const tiers=Parts.getVisualTiers(setup,team), sc=tiers._visual&&tiers._visual.cockpit&&tiers._visual.cockpit.mirror;
    const mesh=Car3D.build(team.color,team.color2,{teamId:team.id,parts:tiers,cockpit:true,noWheels:true,noDriver:true,measure:true});
    const quads=Car3D.cockpitMirrorGlass(sc), g=CarMesh.getMirrorGlass(quads);
    assert.equal(CarMesh.getMirrorGlass(quads),g,"cached per quads");
    const d=g.d;
    assert.equal(d.pos.length/3,8,"one quad per glass");
    assert.deepEqual([...d.idx],[0,1,2,0,2,3,4,5,6,4,6,7]);
    for(let i=0;i<8;i++){
      const p=d.pos.slice(i*3,i*3+3);
      assert.deepEqual([...p],[...quads[i>>2][i&3]],`${team.id}: glass vertex ${i} is lens corner ${i&3}`);
      assert.equal(firstMaterial(mesh,[p[0],p[1],p[2]-0.0005],[p[0],p[1],p[2]+0.004]),Car3D.SURFACES.mirror,`${team.id}: glass vertex ${i} lies on the lens`);
    }
    // [a inboard-low, b outboard-low, c outboard-high, d inboard-high] per glass.
    // The target is the RAW rear image (the HUD composite flips it): the LEFT
    // glass reads the image's right side, outboard edge u = 1; the right glass
    // the left, outboard u = 0; each a tenth past the centre line inboard.
    const uv=(i)=>[d.uv[i*2],d.uv[i*2+1]];
    const want=[[0.4,0.22],[1,0.22],[1,0.78],[0.4,0.78],[0.6,0.22],[0,0.22],[0,0.78],[0.6,0.78]];
    for(let i=0;i<8;i++)for(let k=0;k<2;k++)
      assert.ok(Math.abs(uv(i)[k]-want[i][k])<1e-9,`${team.id}: glass vertex ${i} uv ${uv(i)} (want ${want[i]})`);
    assert.ok(quads[0][1][0]<quads[0][0][0]&&quads[0][0][0]<0,"quad 0 is the left glass, b outboard of a");
    assert.ok(quads[1][1][0]>quads[1][0][0]&&quads[1][0][0]>0,"quad 1 is the right glass, b outboard of a");
    // SQUARE TEXELS: texels across / texels up, scaled by the lens's own
    // width / height, is 1 — the glass shows the rear view undistorted.
    for(let q=0;q<2;q++){
      const [a,b,,dd]=quads[q], o=q*4;
      const du=Math.abs(uv(o+1)[0]-uv(o)[0]), dv=Math.abs(uv(o+3)[1]-uv(o)[1]);
      const texAspect=du*targetAspect/dv, lensAspect=len(a,b)/len(a,dd);
      assert.ok(Math.abs(texAspect/lensAspect-1)<0.02,`${team.id} glass ${q}: texel aspect ${(texAspect/lensAspect).toFixed(4)} (lens ${lensAspect.toFixed(3)}:1)`);
    }
  }
  // A backend without textured meshes gets no glass mesh (car-draw.js lays the fallback).
  assert.equal(loadMesh().CarMesh.getMirrorGlass(Car3D.cockpitMirrorGlass(1)),null);
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
    assert.ok(mesh.idx.length / 3 <= 1580, "body-only cockpit triangle budget");
    let start = 0;
    for (const part of mesh.parts) { if (part.name === "bolsters") break; start += part.vertices; }
    const count = mesh.parts.find(p => p.name === "bolsters").vertices;
    const { mx } = bounds({ pos: mesh.pos.slice(start * 3, (start + count) * 3) });
    assert.ok(mx[1] < opts.layout("f1", "low").eyeU, "walls stay below the LOW-seat eye");
  }
  for (let i=0;i<shapes.length;i++) for (let j=0;j<i;j++) assert.notDeepEqual(shapes[i].pos, shapes[j].pos);
});


test("every interior blocks road rays through the lower footwell from every seat", () => {
  const { CarMesh } = loadMesh(), { opts } = loadOpts({});
  for (const interior of opts.CHOICES.interior.values) {
    const d = CarMesh.getCockpitCabin(interior, LIV).d;
    const mesh = { ...d, mat: Array(d.pos.length / 3).fill(1) };
    for (const seat of opts.CHOICES.seat.values) {
      const l = opts.layout("f1", seat);
      for (const eye of [[0, l.eyeU, l.eyeF], ...headEyes(l)])   // the seat at rest, and the head shifted (vantage.js HEAD_*)
        for (const x of [-0.55,-0.28,0,0.28,0.55]) for (const z of [-0.10,0.25,0.65,1.25,2.0])
          assert.equal(firstMaterial(mesh, eye, [x,0,z], 1, true), 1, `${interior}/${seat} eye ${eye.map((v) => v.toFixed(3))}: road leak toward ${x},${z}`);
    }
  }
});


test("cockpit shoulders continue behind every seat when looking sideways or into a spin", () => {
  const { Car3D } = loadCar3D(), { opts } = loadOpts({}), { CarMesh } = loadMesh();
  const cabin = CarMesh.getCockpitCabin("carbon", LIV).d;
  for (const cockpitBody of opts.CHOICES.body.values) {
    const mesh = Car3D.build(LIV.c1, LIV.c2, { cockpit: true, cockpitBody, noWheels: true, noDriver: true, measure: true });
    let start = 0;
    for (const p of mesh.parts) { if (p.name === "bolsters") break; start += p.vertices; }
    const end = start + mesh.parts.find(p => p.name === "bolsters").vertices;
    const idx = mesh.idx.filter((_, i) => mesh.idx[Math.floor(i / 3) * 3] >= start && mesh.idx[Math.floor(i / 3) * 3] < end);
    const shoulders = { pos: mesh.pos.concat(cabin.pos), idx: idx.concat(cabin.idx.map(i => i + mesh.pos.length / 3)),
      mat: mesh.mat.concat(Array(cabin.pos.length / 3).fill(1)) };
    const rear = Math.min(...mesh.pos.slice(start * 3, end * 3).filter((_, i) => i % 3 === 2));
    for (const seat of opts.CHOICES.seat.values) {
      const l = opts.layout("f1", seat);
      assert.ok(rear < l.eyeF - 2.0, `${cockpitBody}/${seat}: shoulders terminate too close behind the eye`);
      for (const eye of [[0, l.eyeU, l.eyeF], ...headEyes(l)]) for (const sign of [-1, 1]) for (const deg of [70, 90, 110, 130, 150]) {
        const a = deg * Math.PI / 180;
        const target = [eye[0] + sign * 1.5 * Math.sin(a), 0.10, eye[2] + 1.5 * Math.cos(a)];
        assert.notEqual(firstMaterial(shoulders, eye, target, 1, true), null, `${cockpitBody}/${seat} eye ${eye.map((v) => v.toFixed(3))}: exposed shoulder end at ${sign * deg} degrees`);
      }
    }
  }
});

test("every cockpit trim encloses the rear floor and bulkhead from all seats", () => {
  const { CarMesh } = loadMesh(), { opts } = loadOpts({});
  for (const interior of opts.CHOICES.interior.values) {
    const d = CarMesh.getCockpitCabin(interior, LIV).d, mesh = { ...d, mat: Array(d.pos.length / 3).fill(1) };
    for (const seat of opts.CHOICES.seat.values) {
      const l = opts.layout("f1", seat);
      for (const eye of [[0, l.eyeU, l.eyeF], ...headEyes(l)]) {
        for (const x of [-0.7, -0.3, 0, 0.3, 0.7]) for (const z of [-0.45, -0.9, -1.5, -2.5])
          assert.equal(firstMaterial(mesh, eye, [x, 0, z], 1, true), 1, `${interior}/${seat} eye ${eye.map((v) => v.toFixed(3))}: rear road leak toward ${x},${z}`);
        for (const x of [-0.35, 0, 0.35]) for (const y of [0.45, 0.65, 0.80])
          assert.equal(firstMaterial(mesh, eye, [x, y, -2], 1, true), 1, `${interior}/${seat} eye ${eye.map((v) => v.toFixed(3))}: open rear bulkhead toward ${x},${y}`);
      }
    }
  }
});


test("every enabled cockpit halo mounts behind the eye rather than ending beside it", () => {
  const { Car3D } = loadCar3D(), { opts } = loadOpts({});
  for (const halo of [1, 2, 3, 4]) {
    const mesh = Car3D.build(LIV.c1, LIV.c2, { cockpit: true, halo, noWheels: true, noDriver: true, measure: true });
    let start = 0;
    for (const part of mesh.parts) { if (part.name === "cockpit") break; start += part.vertices; }
    const count = mesh.parts.find(p => p.name === "cockpit").vertices;
    const { mn } = bounds({ pos: mesh.pos.slice(start * 3, (start + count) * 3) });
    for (const seat of opts.CHOICES.seat.values)
      assert.ok(mn[2] < opts.layout("f1", seat).eyeF - 0.50, `${halo}/${seat}: halo stops at the eye`);
  }
});


test("the rear enclosure covers the halo mounting ends during an oblique glance", () => {
  const { Car3D } = loadCar3D(), { CarMesh } = loadMesh(), { opts } = loadOpts({});
  for (const halo of [1, 2, 3, 4]) {
    const mesh = Car3D.build(LIV.c1, LIV.c2, { cockpit: true, halo, noWheels: true, noDriver: true, measure: true });
    let start = 0;
    for (const part of mesh.parts) { if (part.name === "cockpit") break; start += part.vertices; }
    const end = start + mesh.parts.find(p => p.name === "cockpit").vertices;
    const rear = Math.min(...mesh.pos.slice(start * 3, end * 3).filter((_, i) => i % 3 === 2));
    const mounts = [];
    for (let i=start;i<end;i++) if (mesh.pos[i*3+2] < rear + 0.05) mounts.push(mesh.pos.slice(i*3,i*3+3));
    assert.ok(mounts.length > 0);
    for (const interior of opts.CHOICES.interior.values) {
      const d = CarMesh.getCockpitCabin(interior, LIV).d, cabin = { ...d, mat: Array(d.pos.length / 3).fill(1) };
      for (const seat of opts.CHOICES.seat.values) {
        const l = opts.layout("f1", seat);
        for (const eye of [[0,l.eyeU,l.eyeF], ...headEyes(l, true)]) for (const target of mounts)   // the costliest sweep: the two widest eyes (all five pass, 2026-10-03)
          assert.equal(firstMaterial(cabin, eye, target, 1, true), 1, `${halo}/${interior}/${seat} eye ${eye.map((v) => v.toFixed(3))}: floating rear halo end`);
      }
    }
  }
});


test("coordinated presets preserve independent choices and saved halo values",()=>{
  const {opts,store}=loadOpts({});
  assert.equal(opts.preset(),"custom");
  assert.equal(opts.setPreset("modern"),"modern");
  assert.deepEqual([opts.body(),opts.interior(),opts.wheel(),opts.seat(),opts.haloSize()],["sculpted","carbon","f1","std",4]);
  opts.setSeat("low");assert.equal(opts.preset(),"custom");
  assert.equal(opts.setPreset("historic"),"historic");
  assert.deepEqual([opts.body(),opts.interior(),opts.wheel(),opts.haloSize()],["tapered","classic","round",0]);
  assert.equal(loadOpts(Object.fromEntries(store)).opts.preset(),"historic");
  const before=[opts.body(),opts.wheel(),opts.haloSize()];
  opts.setPreset("custom");opts.setPreset("unknown");
  assert.deepEqual([opts.body(),opts.wheel(),opts.haloSize()],before,"custom and invalid preset do not overwrite saved choices");
});

test("retro telemetry draws live speed, gear, battery and shift lamps without unbounded caching",()=>{
  const {CarMesh,draws,made}=loadMesh({AppearanceOpts:{speed:n=>Math.round(n*.621371),units:()=>"mph"}});
  const mat=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const c={gear:5,energy:.6,rpm:10000};
  CarMesh.drawRetroTelemetry(mat,c,200,0);
  assert.equal(draws.length,8,"speed, gear, battery, shift row, pedal/units and aero state");
  assert.ok(draws.slice(0,3).every(d=>d.mat[12]<0)&&draws[3].mat[12]>0,"speed occupies the left LCD cell, gear the right");
  const initial=draws[0].mesh, count=made.length;
  CarMesh.drawRetroTelemetry(mat,c,200,0);assert.equal(made.length,count,"same state reuses all digit meshes");
  const next=draws.length;
  CarMesh.drawRetroTelemetry(mat,{...c,gear:8,energy:0},-200,0);
  assert.notDeepEqual(draws[next].mesh,initial,"negative speed clamps to zero rather than creating an invalid digit");
  assert.ok(draws.every(d=>d.mat.every(Number.isFinite)),"all telemetry transforms remain finite");
  const dark=draws.length;
  CarMesh.drawRetroTelemetry(mat,{...c,aeroX:.8,otT:1,deploying:true,throttleDemand:1},200,.2);
  assert.equal(draws.length-dark,11,"active aero travel and overtake lamp remain available on retro");
  assert.ok(draws.at(-1).mesh.col.some(c=>c>1),"overtake emits a functioning indicator");
});

test("pedal indicators and speed-unit legends follow live state, with a bounded cache",()=>{
  const {CarMesh,draws,made}=loadMesh({AppearanceOpts:{units:()=>"mph"}});
  const mat=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  CarMesh.drawWheelExtras(mat,{throttleDemand:0,brakeDemand:0},0);const idle=draws[0].mesh;
  CarMesh.drawWheelExtras(mat,{throttleDemand:1,brakeDemand:0},0);const throttle=draws[2].mesh;
  CarMesh.drawWheelExtras(mat,{throttleDemand:0,brakeDemand:1},0);const brake=draws[4].mesh;
  assert.ok(throttle.idx.length>idle.idx.length && brake.idx.length>idle.idx.length,"real pedal demand fills its bar");
  assert.notDeepEqual(throttle.pos,brake.pos,"throttle and brake fill separate slots");
  const count=made.length;
  for(let i=0;i<30;i++)CarMesh.drawWheelExtras(mat,{throttleDemand:1,brakeDemand:0},i);
  assert.equal(made.length,count,"holding a pedal never rebuilds the status mesh");
});


test("classic instrument needles follow RPM, KPH and energy with one bounded shared mesh",()=>{
  const {CarMesh,draws,made}=loadMesh({AppearanceOpts:{units:()=>"mph"}});
  const mat=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const opt={roughness:.88};
  CarMesh.drawClassicTelemetry(mat,{rpm:0,energy:0},0,opt);
  assert.equal(draws.length,3);assert.equal(made.length,1);
  const angle=d=>Math.atan2(d.mat[1],d.mat[0]);
  assert.ok(draws.every(d=>Math.abs(angle(d)+Math.PI*.75)<1e-6),"zero is the lower-left tick");
  CarMesh.drawClassicTelemetry(mat,{rpm:8000,energy:.5},200,opt);
  assert.ok(draws.slice(3).every(d=>Math.abs(angle(d)-Math.PI*.5)<1e-6),"half scale is the upper tick, independent of speed-unit preference");
  CarMesh.drawClassicTelemetry(mat,{rpm:32000,energy:2},800,opt);
  assert.ok(draws.slice(6).every(d=>Math.abs(angle(d)+Math.PI*.25)<1e-6),"all readings clamp at their last tick");
  CarMesh.drawClassicTelemetry(mat,{rpm:NaN,energy:Infinity},-50,opt);
  assert.ok(draws.slice(9).every(d=>d.mat.every(Number.isFinite)&&Math.abs(angle(d)+Math.PI*.75)<1e-6));
  const start=draws.length;
  CarMesh.drawClassicTelemetry(mat,{rpm:16000,energy:0},200,opt);
  assert.ok(Math.abs(angle(draws[start])+Math.PI*.25)<1e-6,"RPM alone reaches redline");
  assert.ok(Math.abs(angle(draws[start+1])-Math.PI*.5)<1e-6,"speed remains at half scale");
  assert.ok(Math.abs(angle(draws[start+2])+Math.PI*.75)<1e-6,"empty energy stays at zero independently");
  for(let i=0;i<120;i++)CarMesh.drawClassicTelemetry(mat,{rpm:i*131,energy:i/120},i*3,opt);
  assert.equal(made.length,1,"changing telemetry never creates new meshes");
  assert.ok(draws.every(d=>d.mesh===draws[0].mesh),"three physical instruments share the same needle geometry");
  assert.deepEqual(draws.slice(0,3).map(d=>Number(d.mat[12].toFixed(3))),[0,-.15,.15]);
});

test("all cabin trims retain matte padding and carbon structure instead of texturing every surface as weave",()=>{
  const {CarMesh}=loadMesh();
  for(const kind of ["carbon","team","suede","ribbed","classic"]) {
    const d=CarMesh.getCockpitCabin(kind,LIV).d;
    assert.equal(d.mat.length,d.pos.length/3);
    assert.ok(d.mat.includes(21)&&d.mat.includes(22)&&d.mat.includes(26),kind+" separates carbon, soft padding and detail materials");
    const topPad=[];
    for(let i=0;i<d.mat.length;i++)if(d.pos[i*3+2]<-.70&&d.pos[i*3+1]>.84)topPad.push(d.mat[i]);
    assert.ok(topPad.includes(22),kind+" headrest stays matte rather than carbon weave");
  }
});

// THE ARMS AND THE LOCK (js/car/car-mesh.js cockpitWheelRoll / forearm*). The
// gloves ended at their cuffs and floated, worst at full lock; the wheel turned
// a flat ±46° a beat late. Checked in CAR space with the rig matrices the draw
// builds (base = identity), for every gloved wheel, seat, steer and side.
const _mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c*4+r] += a[k*4+r] * b[c*4+k]; return o; };
const _I = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function rigFor(CarMesh, L, steer) {
  const a = CarMesh.cockpitWheelRoll(steer), ca = Math.cos(a), sa = Math.sin(a);
  return _mul([L.wheelS,0,0,0, 0,L.wheelS,0,0, 0,0,L.wheelS,0, 0,L.wheelY,L.wheelZ,1], [ca,sa,0,0, -sa,ca,0,0, 0,0,1,0, 0,0,0,1]);
}

test("the wheel turns progressively to a real lock, with the shipped centre feel and a lighter lag", () => {
  const { CarMesh } = loadMesh();
  const roll = CarMesh.cockpitWheelRoll;
  assert.equal(Math.abs(roll(0)), 0, "centred steer, centred wheel");
  const lock = Math.abs(roll(1));
  assert.ok(lock >= 1.4 && lock <= 1.6, `full lock rolls ${lock.toFixed(2)} rad — a 2026 wheel turns ~±90°, not the old ±46°`);
  assert.ok(Math.abs(roll(-1) + roll(1)) < 1e-12 && Math.abs(roll(0.3) + roll(-0.3)) < 1e-12, "left and right are mirror images");
  assert.ok(Math.abs(roll(1e-4) / 1e-4 + 0.80) < 1e-3, "small corrections keep the shipped 0.80 rad slope (and its sign)");
  for (let v = 0.05; v <= 1; v += 0.05) assert.ok(Math.abs(roll(v)) > Math.abs(roll(v - 0.05)), "more steer is always more lock");
  assert.equal(Math.abs(roll(3)), lock, "steer past ±1 is clamped");
  assert.ok(CarMesh.WHEEL_ROLL_LAMBDA >= 10, "the visual damp stacked on steerVis is light (was λ6)");
});

test("each forearm runs from inside its cuff to a car-fixed elbow, clear of the near plane at any lock", () => {
  const { CarMesh } = loadMesh(), { opts } = loadOpts({});
  for (const style of CarMesh.COCKPIT_WHEELS) {
    // The sleeve starts INSIDE the glove: the cuff's lowest point is under the wrist anchor.
    const glove = CarMesh.getCockpitWheel(LIV, style).d, mid = [0, 0, 0];
    CarMesh.forearmEnds(_I, _I, { wheelY: 0, wheelZ: 0 }, 1, mid, [0, 0, 0]);
    let cuffLow = Infinity;
    for (let i = 0; i < glove.pos.length; i += 3)
      if (Math.abs(glove.pos[i] - mid[0]) < 0.03 && Math.abs(glove.pos[i + 2] - mid[2]) < 0.03 && glove.pos[i + 1] < -0.09) cuffLow = Math.min(cuffLow, glove.pos[i + 1]);
    assert.ok(cuffLow < mid[1] - 0.01, `${style}: the sleeve starts ${((cuffLow - mid[1]) * 1000).toFixed(0)} mm into the cuff`);
    for (const seat of opts.CHOICES.seat.values) {
      const L = opts.layout(style, seat);
      for (let steer = -1; steer <= 1.0001; steer += 0.25) for (const side of [-1, 1]) {
        const W = [0, 0, 0], E = [0, 0, 0];
        CarMesh.forearmEnds(rigFor(CarMesh, L, steer), _I, L, side, W, E);
        // From the seat AND from the most-forward head (HELMET eye under braking):
        // the wrist is past the 0.30 m near plane, and any stretch of sleeve that
        // comes nearer than it (plus the sleeve's own radius) is already under the
        // frame's bottom edge — 40.5° at the widest stock FOV — so the cut never shows.
        for (const eye of [[0, L.eyeU, L.eyeF], headEyes(L)[3]]) {
          assert.ok(W[2] - eye[2] >= 0.30, `${style}/${seat} steer ${steer}: the wrist is ${(W[2] - eye[2]).toFixed(3)} m ahead of the eye (near plane 0.30)`);
          for (let t = 0; t <= 1.0001; t += 0.05) {
            const p = W.map((v, k) => v + (E[k] - v) * t), depth = p[2] - eye[2];
            if (depth >= 0.30 + CarMesh.ARM_R * CarMesh.ARM_TAPER * 1.15) continue;
            const below = Math.atan2(eye[1] - p[1], depth) * 180 / Math.PI;
            assert.ok(below >= 42, `${style}/${seat} steer ${steer}: sleeve at ${(depth).toFixed(3)} m is only ${below.toFixed(1)}° under the eye — the near plane would cut it in frame`);
          }
        }
        assert.ok(Math.sign(E[0]) === side, "each elbow stays on its own side of the seat");
        const elbowBelow = Math.atan2(L.eyeU - E[1], E[2] - L.eyeF) * 180 / Math.PI;
        assert.ok(elbowBelow >= 42, `${style}/${seat}: the elbow end is ${elbowBelow.toFixed(1)}° under the eye — its cap would show at the frame's bottom edge`);
        const len = Math.hypot(E[0] - W[0], E[1] - W[1], E[2] - W[2]);
        assert.ok(len > 0.12 && len < 0.50, `${style}/${seat}: a ${len.toFixed(2)} m sleeve — an arm, never a rope, even at full lock`);
      }
    }
  }
  // The stretch: the unit sleeve's wrist and elbow land exactly on the two ends,
  // its cross-section is ARM_R and square to the axis, and the basis is right-handed.
  const W = [0.15, 0.59, 0.26], E = [0.215, 0.49, 0.11], m = CarMesh.forearmMatrix(W, E, [0, 1, 0], new Array(16));
  const at = (x, y, z) => [0, 1, 2].map((k) => m[k] * x + m[4 + k] * y + m[8 + k] * z + m[12 + k]);
  assert.deepEqual(at(0, 0, 0).map((v) => +v.toFixed(9)), W);
  assert.deepEqual(at(0, 0, 1).map((v) => +v.toFixed(9)), E);
  const X = m.slice(0, 3), Y = m.slice(4, 7), Z = m.slice(8, 11), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  assert.ok(Math.abs(Math.hypot(...X) - CarMesh.ARM_R) < 1e-12 && Math.abs(Math.hypot(...Y) - CarMesh.ARM_R) < 1e-12);
  assert.ok(Math.abs(dot(X, Z)) < 1e-12 && Math.abs(dot(Y, Z)) < 1e-12 && Math.abs(dot(X, Y)) < 1e-12);
  assert.ok(dot([X[1] * Y[2] - X[2] * Y[1], X[2] * Y[0] - X[0] * Y[2], X[0] * Y[1] - X[1] * Y[0]], Z) > 0, "right-handed, so the sleeve's winding is not mirrored");
  // Drawn twice a frame from one cached mesh, rebuilt only when the suit colour changes.
  const { CarMesh: M2, draws, made } = loadMesh();
  const L = opts.layout("f1", "std"), rig = rigFor(M2, L, 0.5);
  M2.drawForearms(rig, _I, L, LIV, {}); const n = made.length;
  M2.drawForearms(rig, _I, L, LIV, {});
  assert.equal(made.length, n, "no per-frame rebuild");
  assert.equal(draws.length, 4, "two sleeves a frame");
  assert.ok(draws.every((d) => d.mat.every(Number.isFinite)));
  assert.notEqual(M2.getForearm({ ...LIV, c2: [0.1, 0.2, 0.8] }).d, draws[0].mesh, "a livery change rebuilds the sleeve");
});

// THE HEAD MOVES (js/camera/vantage.js HEAD_*): outward under lateral g,
// forward and down under braking, and HELMET seats the eye further forward
// still. Every sightline sweep that guards "the eye never sees past the trim"
// has to hold from those eyes too, not just from the seat at rest.
let _cams = null;
function headEyes(l, few = false) {
  const cams = _cams || (_cams = loadOpts({}, "", true).cams), H = cams.HEAD_MAX, f = H.fwd + cams.HELMET_EYE_FWD;
  // The sweeps below test both sides of the car, so one lateral sign stands
  // for both (mirror symmetry); `few` keeps the two that move the eye most.
  const all = [[H.lat, l.eyeU, l.eyeF], [-H.lat, l.eyeU, l.eyeF],
    [H.lat, l.eyeU - H.down, l.eyeF + H.fwd], [-H.lat, l.eyeU - H.down, l.eyeF + f], [H.lat, l.eyeU, l.eyeF + f]];
  return few ? [all[0], all[3]] : all;
}

test("the head shift is small and bounded, and the shifted eye stays well clear of every cockpit surface", () => {
  const { cams } = loadOpts({}, "", true), { opts } = loadOpts({}), { Car3D } = loadCar3D();
  assert.ok(cams.HEAD_MAX.lat >= 0.02 && cams.HEAD_MAX.lat <= 0.03, "2-3 cm outward at full lateral g");
  assert.ok(cams.HEAD_MAX.fwd > 0 && cams.HEAD_MAX.fwd <= 0.02 && cams.HEAD_MAX.down > 0 && cams.HEAD_MAX.down <= 0.01, "a nod, not a lunge");
  assert.ok(cams.HELMET_EYE_FWD > 0 && cams.HELMET_EYE_FWD <= 0.08, "HELMET is the cockpit eye moved forward slightly");
  // Nearest cockpit vertex (body x halo x seat) from every shifted eye: a head
  // needs room, and the closest thing today (the roll structure behind the
  // HIGH seat) is ~10 cm away.
  const near = (mesh, e) => {
    let best = Infinity;
    for (let i = 0; i < mesh.pos.length; i += 3) best = Math.min(best, Math.hypot(mesh.pos[i] - e[0], mesh.pos[i + 1] - e[1], mesh.pos[i + 2] - e[2]));
    return best;
  };
  for (const halo of [0, 2, 4]) for (const cockpitBody of opts.CHOICES.body.values) {
    const mesh = Car3D.build(LIV.c1, LIV.c2, { cockpit: true, halo, cockpitBody, noWheels: true, noDriver: true });
    for (const seat of opts.CHOICES.seat.values) {
      const l = opts.layout("f1", seat);
      for (const e of headEyes(l)) {
        const d = near(mesh, e);
        assert.ok(d >= 0.08, `${cockpitBody}/halo ${halo}/${seat}: a shifted eye is ${(d * 100).toFixed(1)} cm from the bodywork`);
      }
    }
  }
});
