import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";
import { loadRig, makeTrack, BEND } from "../helpers/camera-rig.mjs";
import { absSrc } from "../helpers/abs-src.mjs";
import { gameSource } from "../helpers/game-source.mjs";

const root = path.resolve(import.meta.dirname, "../..");

// Drive the REAL chase/heli rig round the left hairpin of the shared curved-track fixture, easing in over
// 60 frames (a one-shot solve has no hang to ease), with the CamTune stub answering `tune`.
function bendSolve(mode, tune) {
  const r = loadRig(), tr = makeTrack(BEND), smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
  Object.assign(r.state, tune);
  r.feel.resetFollow(); r.cams.resetSmoothing();
  let v = null;
  for (let j = -60; j <= 0; j++) {
    r.ctx.Tracks.sample(tr, 500 + j, smp);
    v = r.cams.vantage(tr, mode, 500 + j, 0, 60, 0, { att: {}, carPos: [smp.p[0], smp.p[2]],
      carHead: Math.atan2(smp.t[0], smp.t[2]), dt: 1 / 60, snap: j === -60 });
  }
  return v;
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test("CAM touch release preserves the long-press picker; cancelled holds never consume the next tap", () => {
  for (const ending of ["release", "pointercancel", "lostpointercapture"]) {
    const dom = makeDom(), timers = new Map();
    let serial = 0;
    const ctx = { document: dom.document, Log: { info() {} }, CamTunerPanel: { refresh() {} },
      setTimeout(fn) { timers.set(++serial, fn); return serial; }, clearTimeout(id) { timers.delete(id); } };
    ctx.window = ctx;
    vm.runInNewContext(fs.readFileSync(path.join(root, "js/camera/cam-picker.js"), "utf8"), ctx, { filename: absSrc("js/camera/cam-picker.js") });
    vm.runInNewContext(fs.readFileSync(path.join(root, "js/camera/mode-switch.js"), "utf8"), ctx, { filename: absSrc("js/camera/mode-switch.js") });
    const G = { $: dom.byId, camMode: 0, store: { set() {} }, state: "race" };
    const cams = ctx.CamModes.create(G), button = dom.byId("btn-cam");
    const fire = type => dom.dispatch(button, { type, pointerType: "touch", pointerId: 1 });
    fire("pointerdown");
    if (ending === "release") {
      for (const fn of timers.values()) fn();
      assert.equal(dom.byId("campicker").hidden, false);
      fire("pointerup"); fire("lostpointercapture"); button.onclick();
      assert.equal(dom.byId("campicker").hidden, false, "normal implicit capture loss must not close the picker");
      assert.equal(G.camMode, 0);
      cams.hideCamPicker();
    } else {
      fire(ending);
      assert.equal(timers.size, 0, "abandoned holds cannot open later");
    }
    fire("pointerdown"); fire("pointerup"); fire("lostpointercapture"); button.onclick();
    assert.equal(G.camMode, 1, "the next short tap still cycles");
  }
});

// UI hunt 2026-10-29 rows 2-3: a tap whose pointerup queued behind a long frame
// (timer first) opened the picker; an open picker outlived its hidden button.
function camHarness() {
  const dom = makeDom(), timers = new Map(), observers = [];
  let serial = 0;
  const ctx = { document: dom.document, Log: { info() {} }, CamTunerPanel: { refresh() {} },
    setTimeout(fn) { timers.set(++serial, fn); return serial; }, clearTimeout(id) { timers.delete(id); },
    MutationObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe(el, opts) { this.el = el; this.opts = opts; } } };
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(root, "js/camera/cam-picker.js"), "utf8"), ctx, { filename: absSrc("js/camera/cam-picker.js") });
  vm.runInNewContext(fs.readFileSync(path.join(root, "js/camera/mode-switch.js"), "utf8"), ctx, { filename: absSrc("js/camera/mode-switch.js") });
  const G = { $: dom.byId, camMode: 0, store: { set() {} }, state: "race" };
  const cams = ctx.CamModes.create(G), button = dom.byId("btn-cam");
  const fire = (type, timeStamp) => dom.dispatch(button, { type, pointerType: "touch", pointerId: 1, timeStamp });
  const runTimers = () => { for (const fn of [...timers.values()]) fn(); };
  return { dom, G, cams, button, fire, runTimers, observers };
}

test("CAM hold is judged by event times: a late-delivered short tap cycles, a real hold opens", () => {
  const h = camHarness();
  h.fire("pointerdown", 1000); h.runTimers();   // the timer ran first: the up was queued behind a long frame
  assert.equal(h.dom.byId("campicker").hidden, false);
  h.fire("pointerup", 1080); h.fire("lostpointercapture"); h.button.onclick();
  assert.equal(h.dom.byId("campicker").hidden, true, "an 80 ms press is a tap, not a hold");
  assert.equal(h.G.camMode, 1, "…and the tap cycles the camera");
  h.fire("pointerdown", 5000); h.runTimers();
  h.fire("pointerup", 5700); h.fire("lostpointercapture"); h.button.onclick();
  assert.equal(h.dom.byId("campicker").hidden, false, "a 700 ms press keeps the picker");
  assert.equal(h.G.camMode, 1);
});

test("an open CAM picker hides when #btn-cam hides (race end), not only on pause", () => {
  const h = camHarness();
  h.fire("pointerdown", 0); h.runTimers(); h.fire("pointerup", 500);
  assert.equal(h.dom.byId("campicker").hidden, false);
  const mo = h.observers.find((o) => o.el === h.button);
  assert.ok(mo && mo.opts.attributeFilter.includes("hidden"), "the button's hidden attribute is observed");
  h.button.hidden = true; mo.fn([]);   // endRace: els.btnCam.hidden = true
  assert.equal(h.dom.byId("campicker").hidden, true);
  assert.equal(h.button.getAttribute("aria-expanded"), "false");
});

test("setCamMode refuses NaN / Infinity so a poisoned index cannot stick", () => {
  const dom = makeDom();
  const stored = [];
  const ctx = { document: dom.document, Log: { info() {} }, CamTunerPanel: { refresh() {} },
    setTimeout() { return 0; }, clearTimeout() {} };
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(root, "js/camera/cam-picker.js"), "utf8"), ctx, { filename: absSrc("js/camera/cam-picker.js") });
    vm.runInNewContext(fs.readFileSync(path.join(root, "js/camera/mode-switch.js"), "utf8"), ctx, { filename: absSrc("js/camera/mode-switch.js") });
  const G = { $: dom.byId, camMode: 3, store: { set(_k, v) { stored.push(v); } }, state: "race", camCutT: 0 };
  const cams = ctx.CamModes.create(G);
  const n = ctx.CamModes.CAM_MODES.length;
  assert.equal(cams.setCamMode(NaN), ctx.CamModes.CAM_MODES[3].id, "NaN keeps the current mode");
  assert.equal(G.camMode, 3);
  assert.equal(cams.setCamMode(Infinity), "cockpit", "Infinity falls back through the current index");
  assert.ok(Number.isFinite(G.camMode) && G.camMode >= 0 && G.camMode < n);
  G.camMode = NaN;
  G.camCutT = 9;
  assert.equal(cams.setCamMode(NaN), ctx.CamModes.CAM_MODES[0].id, "both poisoned → chase (index 0)");
  assert.equal(G.camMode, 0);
  assert.equal(G.camCutT, ctx.CamModes.CAM_MODES[0].cut, "recovery from a poisoned index still cuts");
  assert.equal(cams.setCamMode(-1), ctx.CamModes.CAM_MODES[n - 1].id, "negative wraps");
  assert.ok(stored.every((v) => Number.isFinite(v)), "store never receives NaN");
});

function loadCockpitOpts(disk) {
  const store = new Map(Object.entries(disk || {}));
  const ctx = {
    GameStore: {
      store: {
        raw(k) { return store.has(k) ? store.get(k) : null; },
        rawSet(k, v) { store.set(k, v); return true; },
      },
    },
    Log: { info() {} },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "js/camera/cockpit-opts.js"), "utf8") + "\nthis.exported = CockpitOpts;",
    ctx, { filename: absSrc("js/camera/cockpit-opts.js") });
  return ctx.exported;
}

function loadCamTune(disk = new Map(), hooks = null) {
  const store = {
    rev: 0,
    get(k, d) { return disk.has(k) ? disk.get(k) : d; },
    set(k, v) { disk.set(k, v); this.rev++; return true; },
  };
  if (hooks) hooks.store = store;
  const ctx = {
    GameStore: { store },
    Teams: { LIST: [{ id: "mclaren" }, { id: "ferrari" }] },
    M4: { clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v) },
    Log: { info() {}, debug() {}, enabled() { return false; } },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "js/camera/offsets.js"), "utf8") + "\nthis.exported = CamTune;",
    ctx, { filename: absSrc("js/camera/offsets.js") });
  return ctx.exported;
}

// CORNER LEAD is the one knob whose def is NOT 0, and it has to stay that way.
// "Not stored" means "use the shipped
// default" — so while def was 0 the two zeroes collided and the slider's whole
// flat end was unreachable: dragging to 0 deleted the key and the rig went back
// to 0.54. That shipped, and the help text promised the opposite.
test("CORNER LEAD's registry default is the shipped lead, so 0 is storable", () => {
  const vantage = fs.readFileSync(path.join(root, "js/camera/vantage.js"), "utf8");
  const shipped = Number(/CHASE_CORNER_LEAD_DEFAULT\s*=\s*([\d.]+)/.exec(vantage)[1]);
  const CamTune = loadCamTune();
  const def = CamTune.CAM_TUNE_DEFS.find((d) => d.id === "cornerLead");
  assert.equal(def.def, shipped,
    "the registry def and vantage.js's shipped lead must be the same number");

  // untouched: nothing stored, so vantage.js falls back to its own constant
  assert.equal(CamTune.cornerLead("chase"), null);
  assert.equal(CamTune.values("chase").cornerLead, shipped,
    "the panel must open on the lead that is actually live, not on a 0 it is not using");

  // THE BUG: an explicit 0 has to survive the round trip
  CamTune.set("chase", "cornerLead", 0);
  assert.equal(CamTune.stored("chase", "cornerLead"), true,
    "0 must be stored, not deleted as if it were the default");
  assert.equal(CamTune.cornerLead("chase"), 0,
    "0 must reach vantage.js as a real 0 — this is the flat-behind-the-car end of the slider");

  // Setting the shipped amount is an explicit override; RESET clears it.
  CamTune.set("chase", "cornerLead", shipped);
  assert.equal(CamTune.cornerLead("chase"), shipped);
  CamTune.reset("chase");
  assert.equal(CamTune.stored("chase", "cornerLead"), false);
  assert.equal(CamTune.cornerLead("chase"), null);

  // non-chase modes never read it, whatever is stored
  CamTune.set("cockpit", "cornerLead", 1);
  assert.equal(CamTune.cornerLead("cockpit"), null);
});

// HELMET (js/camera/mode-switch.js) is its own camera to the CAMERA TUNER: the
// panel edits CAM_MODES[camMode].id (tuner-panel.js curMode), so looking
// through HELMET tunes "helmet" — never the cockpit it shares a rig with.
test("the CAMERA TUNER tunes HELMET as its own camera, apart from COCKPIT", () => {
  const CamTune = loadCamTune();
  CamTune.set("helmet", "height", 0.5);
  assert.equal(CamTune.getModeOnly("helmet", "height"), 0.5);
  assert.equal(CamTune.stored("cockpit", "height"), false, "the cockpit is untouched");
  const eye = [0, 1, 0], tgt = [0, 1, 30];
  CamTune.apply("helmet", eye, tgt, 64);
  assert.ok(Math.abs(eye[1] - 1.5) < 1e-9, "the helmet solve takes its own HEIGHT");
  const ce = [0, 1, 0];
  CamTune.apply("cockpit", ce, [0, 1, 30], 64);
  assert.equal(ce[1], 1, "and the cockpit solve does not");
  const panel = fs.readFileSync(path.join(root, "js/camera/tuner-panel.js"), "utf8");
  assert.match(panel, /function curMode\(\) \{ return \(CAM_MODES\[G\.camMode\] \|\| CAM_MODES\[0\]\)\.id; \}/, "the panel edits the live mode's id");
  assert.match(panel, /CamTune\.set\(curMode\(\), d\.id/);
});

test("CORNER HANG ships at 1 and 0 stays stored", () => {
  const CamTune = loadCamTune();
  const def = CamTune.CAM_TUNE_DEFS.find((d) => d.id === "cornerHang");
  assert.equal(def.def, 1);
  assert.ok(def.modes.indexOf("chase") >= 0);
  assert.ok(def.modes.indexOf("heli") >= 0);
  assert.ok(def.modes.indexOf("drone") >= 0);
  assert.equal(def.modes.indexOf("far"), -1, "far has no second hang");
  assert.equal(def.modes.indexOf("pitwall"), -1, "the pit wall stays put");
  assert.equal(CamTune.cornerHang("chase"), null, "unset means the rig uses its shipped hang");
  assert.equal(CamTune.values("chase").cornerHang, 1);
  CamTune.set("chase", "cornerHang", 0);
  assert.equal(CamTune.stored("chase", "cornerHang"), true);
  assert.equal(CamTune.cornerHang("chase"), 0);
  CamTune.set("chase", "cornerHang", 1);
  assert.equal(CamTune.cornerHang("chase"), 1);
  CamTune.reset("chase");
  assert.equal(CamTune.stored("chase", "cornerHang"), false);
  assert.equal(CamTune.cornerHang("cockpit"), null);
});

test("the stored CORNER HANG moves the chase and heli eyes in a bend; an unset one is the shipped full hang", () => {
  for (const mode of ["chase", "heli"]) {
    const shipped = bendSolve(mode, { hang: null }).eye, full = bendSolve(mode, { hang: 1 }).eye, none = bendSolve(mode, { hang: 0 }).eye;
    assert.ok(dist(shipped, full) < 1e-6, `${mode}: unset hang is the full hang`);
    assert.ok(dist(none, full) > 1, `${mode}: hang 0 pulls the eye off the bend side (${dist(none, full).toFixed(2)} m)`);
  }
});

test("the six geometric knobs stay deltas defaulting to 0", () => {
  const CamTune = loadCamTune();
  for (const id of ["height", "dist", "side", "pitch", "yaw", "fov"]) {
    const d = CamTune.CAM_TUNE_DEFS.find((k) => k.id === id);
    assert.equal(d.def, 0, id + " is an offset on the solved rig; its zero means \"shipped\"");
  }
});

test("the stored CORNER LEAD swings the chase aim into the bend", () => {
  const off = bendSolve("chase", { lead: 0 }), on = bendSolve("chase", { lead: 1 });
  assert.ok(dist(off.tgt, on.tgt) > 0.3, `lead 0 vs 1 moves the aim point (${dist(off.tgt, on.tgt).toFixed(2)} m)`);
});

test("cockpit turn chasing is a 0–1 look-ahead blend, shipped at 0.4", () => {
  const src = fs.readFileSync(path.join(root, "js/camera/cockpit-opts.js"), "utf8");
  assert.match(src, /LEAD_DEFAULT\s*=\s*0\.4/,
    "0.4 since 2026-09-08 (the owner's own setting; it was 0.35, what the old ON switch blended)");
  assert.match(src, /KEY_LEAD\s*=\s*"apex26\.cockpitTurnChaseLead"/,
    "the live value is a new key so a stored \"1\" is not read as 100%");
  assert.match(src, /inp\.type\s*=\s*"range"/,
    "SETTINGS > COCKPIT exposes TURN CHASING as a slider, not an ON/OFF");
  const Opts = loadCockpitOpts();
  assert.equal(Opts.parseLead("1", null), 1,
    "the new key stores a real 0–1; \"1\" is full look-ahead");
  assert.equal(Opts.parseLead("0", null), 0);
  assert.equal(Opts.parseLead("0.8", null), 0.8);
  assert.equal(Opts.parseLead("80", null), 0.8);
  assert.equal(Opts.parseLead(null, "1"), 0.35,
    "?turnchase=1 keeps the old ON meaning");
  assert.equal(Opts.parseLead(null, "100"), 1);
  assert.equal(Opts.parseLead(null, null), null,
    "parseLead leaves the default to readLead() when nothing is stored");
  assert.equal(loadCockpitOpts({ "apex26.cockpitTurnChase": "1" }).turnChaseLead(), 0.35,
    "legacy ON migrates to the shipped 0.35 blend");
  assert.equal(loadCockpitOpts({ "apex26.cockpitTurnChase": "0" }).turnChaseLead(), 0,
    "legacy OFF stays locked to the nose");
  assert.equal(loadCockpitOpts({
    "apex26.cockpitTurnChaseLead": "0.8",
    "apex26.cockpitTurnChase": "0",
  }).turnChaseLead(), 0.8, "the new key wins over the old flag");
  // The shipped amount and the LEGACY ON amount parted on 2026-09-08: an
  // untouched install gets 0.4 (the owner's own setting, now the default), while
  // a stored "1" from the old ON/OFF switch still resolves to the 0.35 it meant
  // when it was written.
  assert.equal(loadCockpitOpts({}).turnChaseLead(), 0.4,
    "an untouched install gets the shipped amount");
});

test("VISOR BEAMS is a 0..2 slider factor stored as a percent, with level words and percents both accepted", () => {
  const Opts = loadCockpitOpts({});
  assert.equal(Opts.visorBeams(), 1, "an untouched install is 100 %: the shipped look");
  assert.equal(Opts.BEAMS_DEFAULT, 1); assert.equal(Opts.BEAMS_MAX, 2);
  assert.equal(Opts.setVisorBeams(1.6), 1.6, "a factor");
  assert.equal(Opts.setVisorBeams("160"), 1.6, "a percent string (the stored form, the capture recipes)");
  assert.equal(Opts.setVisorBeams(250), 2, "clamped to 200 %");
  assert.equal(Opts.setVisorBeams(-1), 0);
  assert.equal(Opts.setVisorBeams("strong"), 1.6, "a level word from an old URL or recipe");
  assert.equal(Opts.setVisorBeams("nope"), 1, "garbage falls back to the default");
  assert.equal(loadCockpitOpts({ "apex26.helmetVisorBeams": "60" }).visorBeams(), 0.6, "the stored percent reads back as a factor");
  assert.equal(loadCockpitOpts({ "apex26.helmetVisorBeams": "off" }).visorBeams(), 0, "a stored level word still reads");
  const seen = [];
  const O2 = loadCockpitOpts({});
  O2.onWheel((name, v) => seen.push([name, v]));
  O2.setVisorBeams(0.5);
  assert.deepEqual(seen, [["visorBeams", 0.5]], "a change notifies the visor consumers like every other visor setting");
  assert.ok(!("visorBeams" in O2.CHOICES), "not a choice row: the cockpit panel builds it as a slider");
});

// Read off the LOADED CAM_MODES and the cut setCamMode() actually starts: a
// `id:"cinematic"[\s\S]*cut:0.6` regex matched any later entry's cut too.
test("broadcast cameras carry per-mode cut ease durations", () => {
  const dom = makeDom();
  const ctx = { document: dom.document, Log: { info() {} }, CamTunerPanel: { refresh() {} }, setTimeout() { return 0; }, clearTimeout() {} };
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(root, "js/camera/cam-picker.js"), "utf8"), ctx, { filename: absSrc("js/camera/cam-picker.js") });
    vm.runInNewContext(fs.readFileSync(path.join(root, "js/camera/mode-switch.js"), "utf8"), ctx, { filename: absSrc("js/camera/mode-switch.js") });
  const modes = ctx.CamModes.CAM_MODES, idx = (id) => modes.findIndex((m) => m.id === id);
  assert.equal(modes[idx("cinematic")].cut, 0.6);
  assert.equal(modes[idx("heli")].cut, 0.55);
  const G = { $: dom.byId, camMode: 0, store: { set() {} }, state: "race", camCutT: 0 };
  const cams = ctx.CamModes.create(G);
  const cutTo = (id) => { G.camMode = id === "chase" ? idx("cockpit") : idx("chase"); cams.setCamMode(idx(id)); return G.camCutT; };
  assert.equal(cutTo("cinematic"), 0.6);
  assert.equal(cutTo("heli"), 0.55);
  assert.equal(cutTo("side"), 0.45, "each mode's own cut, not the cinematic one");
  for (const id of ["cockpit", "hood", "tcam", "visor", "helmet"]) {
    G.camCutT = 9;   // a stale glide must be cleared, and `cut: 0` is an instant cut, not a 0.35 s ease
    assert.equal(cutTo(id), 0, `${id} declares cut: 0`);
  }
});

test("a camera cut publishes HUD classes without waiting for rAF", () => {
  const cam = fs.readFileSync(path.join(root, "js/camera/mode-switch.js"), "utf8");
  const apex = fs.readFileSync(path.join(root, "js/agent/apex-cam.js"), "utf8");
  const refreshCam = cam.slice(cam.indexOf("function refreshCamBtn"), cam.indexOf("function setCamMode"));
  assert.match(refreshCam, /G\.refreshHud\(true\)/,
    "refreshCamBtn must paint hud-bcam / --hud-top-h on the cut, not the next HUD tick");
  const cameraHook = apex.slice(apex.indexOf("camera(m) {"), apex.indexOf("snapCam(paint)"));
  assert.match(cameraHook, /G\.refreshHud\(true\)/,
    "__apex.camera must refreshHud like jump() so layout probes are not starved by the next GL frame");
});

test("HUD applies camera/profile body classes", () => {
  const src = fs.readFileSync(path.join(root, "js/ui/hud.js"), "utf8");
  assert.match(src, /hud-bcam/);
  assert.match(src, /hud-hide-map/);
  assert.match(src, /hud-prof-minimal/);
  const css = fs.readFileSync(path.join(root, "css/hud.css"), "utf8");
  assert.match(css, /body\.hud-bcam #hud-gearbox/);
  assert.match(css, /body\.hud-hide-map #minimap/);
  assert.match(css, /body\.hud-map-low #minimap/);
});

// THE ASSERTION THIS REPLACED WAS THE BUG'S ONLY GUARD. It read
// `assert.match(src, /hud-onboard/)` — the class name still appears in hud.js —
// while the CSS rule that gave the class meaning had been deleted the same day
// it shipped (2026-09-04: `aaa4954f3` replaced the onboard minimap/gaps strip
// with the per-widget MAP/GAPS settings and left the write behind). A test that
// only proves a string is still typed passes forever over a toggle nobody reads.
//
// So assert the RELATION instead: a body class hud.js toggles must be one some
// stylesheet keys a rule on. `hud-met-full` is the one exemption and a real one
// — AUTO is defined as the layout that hides nothing, so its class exists only
// to keep exactly one hud-met-* present, and a rule for it would be a bug.
test("every body class the HUD toggles has a rule that reads it", () => {
  const src = fs.readFileSync(path.join(root, "js/ui/hud.js"), "utf8");
  const css = fs.readdirSync(path.join(root, "css"))
    .filter((f) => f.endsWith(".css"))
    .map((f) => fs.readFileSync(path.join(root, "css", f), "utf8")).join("\n");
  const NO_RULE_BY_DESIGN = new Set(["hud-met-full"]);
  const toggled = [...src.matchAll(/body\.classList\.toggle\(\s*"([\w-]+)"/g)].map((m) => m[1]);
  // The layout classes are built as "hud-met-" + name; take the names from the
  // list the resolver iterates so a new layout cannot slip past this.
  const layouts = (src.match(/const MET_LAYOUTS = \[([^\]]*)\]/) || [, ""])[1]
    .split(",").map((x) => x.trim().replace(/"/g, "")).filter(Boolean)
    .map((x) => "hud-met-" + x);
  assert.ok(layouts.length >= 4, "MET_LAYOUTS did not parse — this guard is measuring nothing");
  const orphans = [...new Set([...toggled, ...layouts])]
    .filter((c) => !NO_RULE_BY_DESIGN.has(c))
    .filter((c) => !new RegExp("\\." + c + "\\b").test(css))
    .sort();
  assert.deepStrictEqual(orphans, [],
    "js/ui/hud.js toggles these body classes and no css/ rule reads them — a " +
    "write with no reader, which is what hud-onboard was: " + orphans.join(", "));
});

test("CamTune exports player edits as window.CameraEdits and imports them back", () => {
  const src = fs.readFileSync(path.join(root, "js/camera/offsets.js"), "utf8");
  assert.match(src, /function exportEdits\(\)/);
  assert.match(src, /function importText\(/);
  assert.match(src, /SHARE_MAGIC\s*=\s*"APXC1"/);
  const panel = fs.readFileSync(path.join(root, "js/camera/tuner-panel.js"), "utf8");
  assert.match(panel, /window\.CameraEdits/);
  assert.match(panel, /ct-import/);

  const CamTune = loadCamTune();
  CamTune.set("chase", "dist", 2.5);
  CamTune.setGlobal("fov", 4);
  CamTune.comfortSet("bob", 0.3);
  const pack = CamTune.exportPack();
  assert.equal(pack.v, 1);
  assert.equal(pack.modes.chase.dist, 2.5);
  assert.equal(pack.global.fov, 4);
  assert.equal(pack.comfort.bob, 0.3);

  const share = CamTune.encodeShare(pack);
  assert.match(share, /^APXC1\./);

  CamTune.resetAll();
  assert.equal(Object.keys(CamTune.exportEdits()).length, 0);
  const r = CamTune.importText(share);
  assert.equal(r.ok, true);
  assert.equal(CamTune.getModeOnly("chase", "dist"), 2.5);
  assert.equal(CamTune.getGlobal("fov"), 4);
  assert.equal(CamTune.bob(), 0.3);

  // Legacy CameraEdits snippet
  CamTune.resetAll();
  const legacy = CamTune.importText('window.CameraEdits = {\n  "hood": {"height": 0.5}\n};');
  assert.equal(legacy.ok, true);
  assert.equal(CamTune.getModeOnly("hood", "height"), 0.5);

  // Clamping: out-of-range values are clamped, non-numbers dropped
  CamTune.resetAll();
  CamTune.importPack({ v: 1, modes: { chase: { dist: 999, height: "nope" } }, comfort: { bob: -2 } });
  assert.equal(CamTune.getModeOnly("chase", "dist"), 24);
  assert.equal(CamTune.stored("chase", "height"), false);
  assert.equal(CamTune.bob(), 0);
});

// The COPY VALUES button writes a readable window.CameraEdits snippet, `//` comments,
// the pack JSON and the APXC1 share code into ONE box. The whole block is what a
// player pastes back, and decodeShare used to accept only a leading APXC1. or bare
// JSON, so the block the panel itself produced read "BAD PASTE".
test("malformed camera imports reject atomically without clearing saved tuning", () => {
  const C = loadCamTune();
  C.set("chase", "dist", 2.5); C.setGlobal("fov", 6); C.comfortSet("bob", 0.3);
  const before = JSON.stringify(C.exportPack());
  for (const pack of [[], { v: 1, modes: "oops" }, { v: 2, global: [] },
    { v: 1, comfort: false }, { v: 2, tracks: null }, { v: 2, cars: 7 },
    { chase: [] }, { v: 1, modes: { chase: "oops" } },
    { v: 2, tracks: { monaco: { modes: [] } } }]) {
    assert.equal(C.importText(JSON.stringify(pack)).ok, false, JSON.stringify(pack));
    assert.equal(JSON.stringify(C.exportPack()), before, "invalid imports leave every store unchanged");
  }
  assert.equal(C.importText("{}").ok, true, "empty legacy maps remain valid");
  assert.equal(C.count("chase"), 0);
  assert.equal(C.countGlobal(), 1, "legacy maps preserve global settings");
  assert.equal(C.importText('{"v":2,"modes":{}}').ok, true, "empty authoritative packs remain valid");
  assert.equal(C.countGlobal(), 0);
});

test("the whole COPY VALUES block imports back (APXC1 token found anywhere)", () => {
  const A = loadCamTune();
  A.set("chase", "dist", 2.5);
  A.set("hood", "height", 0.4);
  A.setGlobal("fov", 4);
  A.comfortSet("bob", 0.3);
  const pack = A.exportPack();
  // The same shape tuner-panel.js's ct-copy handler joins (kept literal on purpose).
  const block = [
    "window.CameraEdits = {",
    "  // THIS MODE — CHASE  (1 tuned)",
    '  "chase": ' + JSON.stringify(pack.modes.chase) + ",",
    "  // EVERY OTHER TUNED MODE — 1 mode",
    '  "hood": ' + JSON.stringify(pack.modes.hood),
    "};",
    "",
    "// Pack (JSON) — paste into IMPORT, or use the share code below",
    JSON.stringify(pack),
    "",
    "// Share code",
    A.encodeShare(pack),
  ].join("\n");
  assert.equal(A.decodeShare(block).ok, true, "the block COPY VALUES produced must decode");
  assert.equal(A.decodeShare(block).kind, "share");

  const B = loadCamTune();
  const r = B.importText(block);
  assert.equal(r.ok, true);
  assert.equal(B.getModeOnly("chase", "dist"), 2.5);
  assert.equal(B.getModeOnly("hood", "height"), 0.4);
  assert.equal(B.getGlobal("fov"), 4);
  assert.equal(B.bob(), 0.3);

  // A bare code, a code with trailing text, and a code after a label still work.
  const code = A.encodeShare(pack);
  assert.equal(A.decodeShare("  " + code + "  \n").ok, true);
  assert.equal(A.decodeShare(code + "\n// thanks!").pack.modes.chase.dist, 2.5);
  assert.equal(A.decodeShare("Share code: " + code).ok, true);
  // Without any token a mangled paste is still refused.
  assert.equal(A.decodeShare("window.CameraEdits = {").ok, false);
});

// A modes-only snippet (the legacy window.CameraEdits shape) says nothing about
// the global baseline or the accessibility COMFORT knobs, so importing one must
// leave both alone. importPack's legacy branch used to pass null to importGlobal
// and importComfort, which wiped them.
test("a modes-only import keeps the global baseline and COMFORT knobs", () => {
  const CamTune = loadCamTune();
  CamTune.setGlobal("fov", 6);
  CamTune.comfortSet("bob", 0.3);
  CamTune.comfortSet("fovBias", 3);
  CamTune.set("chase", "dist", 2);

  const r = CamTune.importText('window.CameraEdits = {\n  "hood": {"height": 0.5}\n};');
  assert.equal(r.ok, true);
  assert.equal(CamTune.getModeOnly("hood", "height"), 0.5, "the snippet's modes are applied");
  assert.equal(CamTune.stored("chase", "dist"), false, "modes are still replaced wholesale");
  assert.equal(CamTune.getGlobal("fov"), 6, "global baseline survives");
  assert.equal(CamTune.bob(), 0.3, "comfort bob survives");
  assert.equal(CamTune.fovBias(), 3, "comfort FOV bias survives");

  // A full pack (v:1) is still authoritative for all three.
  CamTune.importPack({ v: 1, modes: { chase: { dist: 1 } } });
  assert.equal(CamTune.getGlobal("fov"), 0, "a pack without global clears it");
  assert.equal(CamTune.bob(), 1, "and without comfort resets it");
});

// persist() writes localStorage. The sliders fire it on every input event, so it
// takes the store that changed and leaves the other two alone.
test("persist(which) writes only the named CamTune store", () => {
  const disk = new Map();
  const writes = [];
  const ctx = {
    GameStore: { store: {
      get(k, d) { return disk.has(k) ? disk.get(k) : d; },
      set(k, v) { writes.push(k); disk.set(k, JSON.parse(JSON.stringify(v))); return true; },
    } },
    M4: { clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v) },
    Log: { info() {}, debug() {}, enabled() { return false; } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "js/camera/offsets.js"), "utf8") + "\nthis.exported = CamTune;", ctx, { filename: absSrc("js/camera/offsets.js") });
  const CamTune = ctx.exported;
  CamTune.set("chase", "dist", 2); CamTune.setGlobal("fov", 5); CamTune.comfortSet("bob", 0.5);

  writes.length = 0; CamTune.persist("modes");
  assert.deepEqual(writes, [CamTune.KEY], "a per-mode slider writes only camTune");
  writes.length = 0; CamTune.persist("global");
  assert.deepEqual(writes, [CamTune.KEY_GLOBAL]);
  writes.length = 0; CamTune.persist("comfort");
  assert.deepEqual(writes, [CamTune.KEY_COMFORT]);
  assert.equal(disk.get(CamTune.KEY_COMFORT).bob, 0.5);
  writes.length = 0; CamTune.persist();
  assert.deepEqual(writes.slice().sort(), [CamTune.KEY, CamTune.KEY_COMFORT, CamTune.KEY_GLOBAL].sort(),
    "no argument = all three (presets, import, reset)");

  // The panel's slider handlers name the store they changed.
  const panel = fs.readFileSync(path.join(root, "js/camera/tuner-panel.js"), "utf8");
  assert.match(panel, /CamTune\.persist\("comfort"\)/);
  assert.match(panel, /CamTune\.persist\(_scope === "global" \? "global" : "modes"\)/);
});

test("CamTune comfort knobs are independent of reduce-motion and default to shipped", () => {
  const CamTune = loadCamTune();
  for (const d of CamTune.COMFORT_DEFS) {
    assert.equal(CamTune.comfortGet(d.id), d.def, d.id + " ships at its registry default");
  }
  assert.equal(CamTune.shakeOffset(1, true), 0, "camComfort/reduce-motion still zeroes shake");
  assert.equal(CamTune.shakeOffset(1, false), 0.9, "shipped bob=1 keeps the old 0.9×shake²");
  CamTune.comfortSet("bob", 0.5);
  assert.equal(CamTune.shakeOffset(1, false), 0.45);
  assert.equal(CamTune.buzzAmp(1, false, true, 1), 0, "reduce-motion zeroes buzz");
  assert.ok(CamTune.buzzAmp(1, false, false, 1) > 0);
  assert.equal(CamTune.rollTarget(0.1, 0, 0, true), 0, "reduce-motion zeroes roll");
  CamTune.comfortSet("rollLean", 0.5);
  assert.equal(CamTune.rollTarget(0.2, 0, 0, false), 0.1);
});

test("CamTune global baseline layers under per-mode; copyFrom and presets work", () => {
  const CamTune = loadCamTune();
  CamTune.setGlobal("fov", 6);
  assert.equal(CamTune.values("chase").fov, 6, "untouched mode inherits global FOV");
  CamTune.set("chase", "fov", -2);
  assert.equal(CamTune.values("chase").fov, -2, "per-mode wins over global");
  assert.equal(CamTune.values("hood").fov, 6, "other modes still see the baseline");

  CamTune.set("hood", "height", 0.4);
  CamTune.copyFrom("hood", "tcam");
  assert.equal(CamTune.getModeOnly("tcam", "height"), 0.4);

  assert.equal(CamTune.applyPreset("flat"), true);
  assert.equal(CamTune.cornerLead("chase"), 0);
  assert.equal(CamTune.applyPreset("calm"), true);
  assert.equal(CamTune.bob(), 0.2);
  assert.equal(CamTune.applyPreset("stock"), true);
  assert.equal(CamTune.count("chase"), 0);
  assert.equal(CamTune.countGlobal(), 0);
  assert.equal(CamTune.bob(), 1);
});

test("chase FOV at speed follows the comfort speedFov scale, not the raw speed", () => {
  const fovAt = (spFov) => bendSolve("chase", { spFov }).fov;
  assert.ok(fovAt(1) - fovAt(0) > 1, `comfort speedFov 0 flattens the speed widening (${(fovAt(1) - fovAt(0)).toFixed(2)} deg)`);
});

// Announcement filtering across these cameras is exercised as behavior in
// pause-hud-layout.test.mjs, including the driving warnings that stay visible.


test("explicit camera defaults override global values through export/load until reset", () => {
  const disk = new Map();
  let C = loadCamTune(disk);
  C.setGlobal("fov", 8); C.setGlobal("cornerLead", 1);
  C.set("chase", "fov", 0); C.set("chase", "cornerLead", 0.54);
  const edits = C.exportEdits();
  C.load(edits); C.persist();
  C = loadCamTune(disk);
  assert.equal(C.values("chase").fov, 0);
  assert.equal(C.apply("chase", [0, 2, -8], [0, 1, 0], 60), 60);
  assert.equal(C.cornerLead("chase"), 0.54);
  assert.equal(C.values("far").fov, 8);
  C.reset("chase");
  assert.equal(C.values("chase").fov, 8);
  assert.equal(C.cornerLead("chase"), 1);
});

// Moved from cam-comfort.test.mjs (R1-16): CamTune override resolution and pack round-trip.
const plain = (value) => JSON.parse(JSON.stringify(value));

test("camera overrides resolve track over car over the existing global baseline", () => {
  const CamTune = loadCamTune();
  assert.equal(CamTune.importPack({
    v: 2,
    global: { dist: 1 },
    comfort: { bob: 0.8 },
    cars: {
      mclaren: { modes: { chase: { dist: 2 } }, comfort: { bob: 0.5 } },
    },
    tracks: {
      monza: { modes: { chase: { dist: 3 } }, comfort: { bob: 0.2 } },
    },
  }).ok, true);

  CamTune.setContext("monza", "mclaren");
  assert.equal(CamTune.get("chase", "dist"), 3);
  assert.equal(CamTune.comfortGet("bob"), 0.2);

  CamTune.setContext("spa", "mclaren");
  assert.equal(CamTune.get("chase", "dist"), 2);
  assert.equal(CamTune.comfortGet("bob"), 0.5);

  CamTune.setContext("spa", "ferrari");
  assert.equal(CamTune.get("chase", "dist"), 1);
  assert.equal(CamTune.comfortGet("bob"), 0.8);
});

test("live camera scopes override saved menu choices and follow world transitions", () => {
  const disk = new Map([["trackId", "monza"], ["team", 1]]);
  const hooks = {};
  const C = loadCamTune(disk, hooks);
  let live = { track: "spa", car: "mclaren" };
  C.bindContext(() => live);
  C.setContext("spa", "mclaren");
  C.setScoped("track", "chase", "height", 2);
  C.setScoped("car", "chase", "dist", 3);
  C.comfortSetScoped("track", "bob", 0.2);
  assert.deepEqual(plain(C.context()), { track: "spa", car: "mclaren" });
  assert.deepEqual(Object.keys(C.exportPack().tracks), ["spa"]);
  assert.deepEqual(Object.keys(C.exportPack().cars), ["mclaren"]);

  assert.equal(C.get("chase", "height"), 2);
  assert.equal(C.get("chase", "dist"), 3);
  assert.equal(C.bob(), 0.2);
  live = { track: "suzuka", car: "ferrari" }; // next round/car, without reopening the panel
  assert.equal(C.get("chase", "height"), 0);
  assert.equal(C.get("chase", "dist"), 0);
  assert.equal(C.bob(), 1);
  C.setScoped("track", "chase", "height", 4);
  assert.equal(C.exportPack().tracks.suzuka.modes.chase.height, 4);
  assert.equal(C.exportPack().tracks.spa.modes.chase.height, 2);

  live = { track: null, car: null };
  assert.deepEqual(plain(C.context()), { track: "monza", car: "ferrari" });
  hooks.store.set("trackId", "imola"); hooks.store.set("team", 0);
  assert.deepEqual(plain(C.context()), { track: "imola", car: "mclaren" }, "fallback follows saved changes");
  C.bindContext(null);
  C.setContext(null, null);
  hooks.store.set("trackId", null);
  assert.deepEqual(plain(C.context()), { track: null, car: "mclaren" }, "absent track never retains the prior fallback");
});

test("game camera context follows WATCH cuts and returns to the menu selection", () => {
  const source = gameSource();
  const statement = source.match(/CamTune\.bindContext\(\(\) => \(\{[\s\S]*?\}\)\);/);
  assert.ok(statement, "game binds the live camera context");
  let readContext;
  const G = { state: "race", track: { def: { id: "spa" } }, teamIdx: 0,
    player: { team: { id: "mclaren" } } };
  const ctx = { G, Teams: { LIST: [{ id: "mclaren" }, { id: "ferrari" }] },
    CamTune: { bindContext(read) { readContext = read; } } };
  vm.runInNewContext(statement[0], ctx, { filename: absSrc("js/game.js") });
  assert.equal(readContext().car, "mclaren");
  G.player = { team: { id: "ferrari" } }; // G.followCar does not change teamIdx
  assert.equal(readContext().car, "ferrari");
  G.state = "menu";
  assert.equal(readContext().car, "mclaren");
});

test("JSON and APXC1 camera packs round-trip track and car overrides", () => {
  const source = loadCamTune();
  source.importPack({
    v: 2,
    cars: { mclaren: { modes: { cockpit: { height: 0.25 } }, comfort: { rollLean: 0.4 } } },
    tracks: { spa: { modes: { chase: { fov: 5 } }, comfort: { speedFov: 0.3 } } },
  });
  const pack = plain(source.exportPack());
  assert.deepEqual(pack.cars.mclaren.modes.cockpit, { height: 0.25 });
  assert.deepEqual(pack.tracks.spa.comfort, { speedFov: 0.3 });

  const restored = loadCamTune();
  const decoded = restored.decodeShare(source.encodeShare(pack));
  assert.equal(decoded.ok, true);
  assert.equal(restored.importPack(decoded.pack).ok, true);
  assert.deepEqual(plain(restored.exportPack()), pack);
});


test("helmet inherits the production onboard SSR range and releases it outside race views", () => {
  const game = gameSource();
  // Execute the production classification and option assignments. Keeping
  // these statements together catches an omitted helmet mode as well as a
  // stale option left by a previous camera without duplicating either rule.
  const statements = [
    /^  const racing = .*;$/m, /^  const camId = .*;$/m, /^  const onboard = .*;$/m,
    /^  const _ssrLow = .*;$/m, /^  po\.ssrTopUV = .*;$/m, /^  po\.ssrNear  = .*;$/m,
  ].map(pattern => {
    const match = game.match(pattern);
    assert.ok(match, "production camera/SSR statement exists: " + pattern);
    return match[0];
  });
  const ctx = { document: null };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "js/camera/mode-switch.js"), "utf8") +
    "\nthis.CAM_MODES = CamModes.CAM_MODES;", ctx, { filename: absSrc("js/camera/mode-switch.js") });
  const run = new vm.Script("(() => {" + statements.join("\n") + "\nreturn onboard; })()",
    { filename: absSrc("js/game.js") });
  ctx.po = { ssrTopUV: -99, ssrNear: -99 };
  const cases = [
    ["helmet", "race", true, 0.82, -1],
    ["chase", "race", false, 0.62, -2.5],
    ["cockpit", "count", true, 0.82, -1],
    ["helmet", "count", true, 0.82, -1],
    ["helmet", "title", false, 0.62, -2.5],
    ["cockpit", "title", false, 0.62, -2.5],
    ["helmet", "race", true, 0.82, -1],
  ];
  for (const [id, state, onboard, top, near] of cases) {
    ctx.camMode = ctx.CAM_MODES.findIndex(mode => mode.id === id);
    assert.ok(ctx.camMode >= 0, "camera exists in production CAM_MODES: " + id);
    ctx.state = state;
    assert.equal(run.runInContext(ctx), onboard, id + " / " + state + " classification");
    assert.equal(ctx.po.ssrTopUV, top, id + " / " + state + " top boundary");
    assert.equal(ctx.po.ssrNear, near, id + " / " + state + " near boundary");
  }
});

test("inverse projection stays current at measured tier 4, through and after the SSR fade", () => {
  // TLX's main-view reconstruction reads _mInvProj even after tier 4 sheds all
  // view-space post, so the update is unconditional (PR #3670).
  const statement = gameSource().match(/^  M4\.invertTo\(_mInvProj, _mProj\);$/m);
  assert.ok(statement, "production inverse-projection update exists and is unconditional");
  const math = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, "js/core/mat4.js"), "utf8") +
    "\nthis.exported = M4;", math, { filename: absSrc("js/core/mat4.js") });
  const M4 = math.exported, projection = new Float32Array(16), inverse = new Float32Array(16);
  let calls = 0, tier = 0;
  const ctx = { _mProj: projection, _mInvProj: inverse,
    _roadReflectionTransition: { value: 1 }, PerfGov: { autoTier: () => tier },
    M4: { invertTo(out, input) { calls++; return M4.invertTo(out, input); } } };
  const run = new vm.Script(statement[0], { filename: absSrc("js/game.js") });
  vm.createContext(ctx);
  const assertCancels = label => {
    const identity = new Float32Array(16);
    M4.mulTo(identity, projection, inverse);
    for (let i = 0; i < 16; i++) {
      assert.ok(Math.abs(identity[i] - (i % 5 === 0 ? 1 : 0)) < 1e-5,
        label + ": projection and inverse cancel at element " + i);
    }
  };
  M4.perspectiveTo(projection, 1.1, 2.16, 0.3, 900);
  run.runInContext(ctx);
  const before = Array.from(inverse);
  // Switching from helmet to an external camera changes FOV and near plane
  // while the tier-4 transition can still be rendering wet-road SSR.
  tier = 4;
  ctx._roadReflectionTransition.value = 0.5;
  M4.perspectiveTo(projection, 0.8, 1.9, 0.9, 900);
  run.runInContext(ctx);
  assert.equal(calls, 2, "active fade refreshes the inverse at measured tier 4");
  assert.notDeepEqual(Array.from(inverse), before, "the camera change is reflected in the inverse");
  assertCancels("tier-4 fade");
  const faded = Array.from(inverse);
  ctx._roadReflectionTransition.value = 0;
  M4.perspectiveTo(projection, 1.3, 2.16, 0.3, 500);
  run.runInContext(ctx);
  assert.equal(calls, 3, "settled tier 4 still refreshes the inverse TLX reconstruction reads");
  assert.notDeepEqual(Array.from(inverse), faded, "settled tier-4 camera change is reflected");
  assertCancels("settled tier 4");
  tier = 0;
  M4.perspectiveTo(projection, 1.0, 2.16, 0.3, 900);
  run.runInContext(ctx);
  assert.equal(calls, 4, "restoring normal post work refreshes the camera inverse");
  assertCancels("restored tier 0");
});

test("pending CAM hold is retired on pause/hide/quit, hidden page and blur without pointer cancellation", () => {
  for (const ending of ["hide", "pause", "quit", "hidden", "blur", "pagehide"]) {
    const dom = makeDom(), timers = new Map(), listeners = new Map(); let serial = 0;
    const ctx = { document: dom.document, Log: { info() {} }, CamTunerPanel: { refresh() {} },
      addEventListener(type, fn) { listeners.set(type, fn); },
      setTimeout(fn) { timers.set(++serial, fn); return serial; }, clearTimeout(id) { timers.delete(id); } };
    ctx.window = ctx;
    vm.runInNewContext(fs.readFileSync(path.join(root, "js/camera/cam-picker.js"), "utf8"), ctx, { filename: absSrc("js/camera/cam-picker.js") });
    vm.runInNewContext(fs.readFileSync(path.join(root, "js/camera/mode-switch.js"), "utf8"), ctx, { filename: absSrc("js/camera/mode-switch.js") });
    const G = { $: dom.byId, camMode: 0, store: { set() {} }, state: "race", paused: false };
    const cams = ctx.CamModes.create(G), button = dom.byId("btn-cam");
    const fire = type => dom.dispatch(button, { type, pointerType: "touch", pointerId: 1 });
    fire("pointerdown");
    const late = [...timers.values()][0];
    assert.equal(typeof late, "function");
    // Pause/quit production paths invoke this exported hide while the first
    // thumb remains held. No pointerup/cancel is manufactured by this fixture.
    if (ending === "pause") { G.paused = true; cams.hideCamPicker(); }
    else if (ending === "quit") { G.state = "menu"; cams.hideCamPicker(); }
    else if (ending === "hide") cams.hideCamPicker();
    else if (ending === "hidden") { dom.document.hidden = true; dom.dispatch(dom.document, { type: "visibilitychange" }); }
    else listeners.get(ending)();
    assert.equal(timers.size, 0, ending + " cancels its pending timer");
    late(); // Even an already-queued stale callback cannot regain ownership.
    assert.equal(button.getAttribute("aria-expanded"), "false", ending);
    assert.equal(G.camMode, 0);
    dom.document.hidden = false; G.state = "race"; G.paused = false;
    fire("pointerup"); fire("lostpointercapture");
    fire("pointerdown"); fire("pointerup"); fire("lostpointercapture"); button.onclick();
    assert.equal(G.camMode, 1, ending + " does not consume the next genuine short tap");
  }
});

test("CAM context-menu and late hold cannot open on a paused, hidden or non-race screen", () => {
  for (const state of ["pause", "hidden", "menu"]) {
    const dom = makeDom(); let callback;
    const ctx = { document: dom.document, Log: { info() {} }, CamTunerPanel: { refresh() {} },
      setTimeout(fn) { callback = fn; return 1; }, clearTimeout() {} };
    ctx.window = ctx;
    vm.runInNewContext(fs.readFileSync(path.join(root, "js/camera/cam-picker.js"), "utf8"), ctx, { filename: absSrc("js/camera/cam-picker.js") });
    vm.runInNewContext(fs.readFileSync(path.join(root, "js/camera/mode-switch.js"), "utf8"), ctx, { filename: absSrc("js/camera/mode-switch.js") });
    const G = { $: dom.byId, camMode: 0, store: { set() {} }, state: "race", paused: false };
    ctx.CamModes.create(G);
    const button = dom.byId("btn-cam");
    dom.dispatch(button, { type: "pointerdown" });
    if (state === "pause") G.paused = true;
    else if (state === "hidden") dom.document.hidden = true;
    else G.state = "menu";
    callback(); dom.dispatch(button, { type: "contextmenu" });
    assert.equal(button.getAttribute("aria-expanded"), "false", state);
    G.paused = false; G.state = "count"; dom.document.hidden = false;
    dom.dispatch(button, { type: "contextmenu" });
    assert.equal(button.getAttribute("aria-expanded"), "true", "countdown remains a valid CAM owner");
  }
});
