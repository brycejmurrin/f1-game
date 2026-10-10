import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "../..");

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
    ctx);
  return ctx.exported;
}

function loadCamTune() {
  const disk = new Map();
  const ctx = {
    GameStore: {
      store: {
        get(k, d) { return disk.has(k) ? disk.get(k) : d; },
        set(k, v) { disk.set(k, v); return true; },
      },
    },
    M4: { clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v) },
    Log: { info() {}, debug() {}, enabled() { return false; } },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "js/camera/offsets.js"), "utf8") + "\nthis.exported = CamTune;",
    ctx);
  return ctx.exported;
}

// CORNER LEAD is the one knob whose def is NOT 0, and it has to stay that way.
// set() deletes a knob equal to its def, and "not stored" means "use the shipped
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

  // and setting it back to the shipped amount is what clears it
  CamTune.set("chase", "cornerLead", shipped);
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
  assert.equal(CamTune.stored("chase", "cornerHang"), false);
  assert.equal(CamTune.cornerHang("cockpit"), null);
  const src = fs.readFileSync(path.join(root, "js/camera/vantage.js"), "utf8");
  assert.match(src, /hangScale\("chase"\)/);
  assert.match(src, /hangScale\("heli"\)/);
  assert.match(src, /CamTune\.cornerHang\(mode\)/);
});

test("the six geometric knobs stay deltas defaulting to 0", () => {
  const CamTune = loadCamTune();
  for (const id of ["height", "dist", "side", "pitch", "yaw", "fov"]) {
    const d = CamTune.CAM_TUNE_DEFS.find((k) => k.id === id);
    assert.equal(d.def, 0, id + " is an offset on the solved rig; its zero means \"shipped\"");
  }
});

test("shipped chase corner lead is baked into vantage.js", () => {
  const src = fs.readFileSync(path.join(root, "js/camera/vantage.js"), "utf8");
  // 0.54 since 2026-09-08 — the owner's CAMERA TUNER corner lead became the
  // shipped amount. It was 0.18.
  assert.match(src, /CHASE_CORNER_LEAD_DEFAULT\s*=\s*0\.54/);
  assert.match(src, /CamTune\.cornerLead\(mode\)/);
});

test("cockpit interior uses the heading viewmodel, not a road-locked basis", () => {
  const src = fs.readFileSync(path.join(root, "js/game.js"), "utf8");
  assert.match(src, /GameCams\.cockpitViewmodelAxes/,
    "the cockpit draw must yaw with the body; a raw smp2.t basis crabs through turns");
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, ""),
    /cockpitRigOnly[\s\S]{0,250}basisMat\(sR, _cockU, sF/,
    "do not restore the road-tangent cockpit basis");
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

test("broadcast cameras carry per-mode cut ease durations", () => {
  const src = fs.readFileSync(path.join(root, "js/camera/mode-switch.js"), "utf8");
  assert.match(src, /id:\s*"cinematic"[\s\S]*cut:\s*0\.6/);
  assert.match(src, /id:\s*"heli"[\s\S]*cut:\s*0\.55/);
  assert.match(src, /\.cut\s*\|\|\s*0\.35/);
});

test("a camera cut publishes HUD classes without waiting for rAF", () => {
  const cam = fs.readFileSync(path.join(root, "js/camera/mode-switch.js"), "utf8");
  const apex = fs.readFileSync(path.join(root, "js/agent/apex.js"), "utf8");
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
  vm.runInNewContext(fs.readFileSync(path.join(root, "js/camera/offsets.js"), "utf8") + "\nthis.exported = CamTune;", ctx);
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

test("vantage.js FOV blends use comfort speedFov; corner-lead comment matches 0.54", () => {
  const src = fs.readFileSync(path.join(root, "js/camera/vantage.js"), "utf8");
  assert.match(src, /const spFov = spN \* \(typeof CamTune/);
  // Chase/far FOV goes through CamFeel.modeFov(..., spFov, ...) when CamFeel is
  // loaded; the bare lerp stays as the no-CamFeel fallback. Either form must
  // still blend on comfort-scaled spFov (never raw spN).
  assert.match(src, /CamFeel\.modeFov\(\s*far \? "far" : "chase",\s*spFov/);
  assert.match(src, /lerp\(57, 63, spFov\)/);
  assert.doesNotMatch(src, /lerp\(57, 63, spN\)/);
  assert.match(src, /shipped 0\.54/);
  assert.doesNotMatch(src, /shipped 0\.18\)/);
});

// Announcement filtering across these cameras is exercised as behavior in
// pause-hud-layout.test.mjs, including the driving warnings that stay visible.


test("broadcast HUD profile keeps two-decimal gaps", () => {
  const src = fs.readFileSync(path.join(root, "js/ui/hud.js"), "utf8");
  assert.match(src, /function gapDecimals\(/);
  // Standard shares hundredths under ~10 s via HudReadouts; broadcast stays at 2 always.
  assert.match(src, /_ro\.fmtGapSec|_ro\.gapDecimals/);
  // The two-decimal broadcast rule itself now lives in HudReadouts.gapDecimals (and hud.js's boot fallback).
  assert.match(fs.readFileSync(path.join(root, "js/ui/hud-readouts.js"), "utf8"), /p === "broadcast"\) return 2/);
  assert.match(src, /=== "broadcast" \? 2 :/);
  const css = fs.readFileSync(path.join(root, "css/hud.css"), "utf8");
  assert.match(css, /body\.hud-prof-broadcast \.hud-top/);
  assert.match(css, /body\.hud-prof-broadcast\.hud-bcam \.hud-bottom/);
});
