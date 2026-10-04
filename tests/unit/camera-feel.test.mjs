import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "../..");

function loadCamFeel(disk) {
  const store = new Map(Object.entries(disk || {}));
  const ctx = {
    M4: { clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v) },
    GameStore: {
      store: {
        get(k, d) { return store.has(k) ? store.get(k) : d; },
        set(k, v) { store.set(k, v); return true; },
        raw() { return null; },
        rawSet() { return true; },
      },
    },
    Log: { info() {} },
    document: undefined,
  };
  vm.runInNewContext(
    ["drive-chase.js", "drive-broadcast.js", "drive-onboard.js", "feel.js"]
      .map((f) => fs.readFileSync(path.join(root, "js/camera", f), "utf8")).join("\n")
      + "\nthis.exported = CamFeel;",
    ctx);
  return { CamFeel: ctx.exported, store };
}

test("follow is exact with no dt and eases when a frame has one", () => {
  const { CamFeel } = loadCamFeel();
  CamFeel.resetFollow("t");
  assert.equal(CamFeel.follow("t", 1, 2, 0), 1, "a one-shot solve is the target");
  const mid = CamFeel.follow("t", -1, 2, 0.05);
  assert.ok(mid < 1 && mid > -1, "a live frame moves toward the new target, got " + mid);
  assert.ok(mid > 0, "it does not arrive in one short frame");
});

test("drive opens the lens with speed and does not move the eye", () => {
  const { CamFeel } = loadCamFeel();
  CamFeel.resetFollow();
  const eye = [0, 2, 0], tgt = [0, 1, 10];
  assert.equal(CamFeel.drive("chase", eye, tgt, 57, { dt: 0, att: {} }, 1), 57);
  assert.equal(eye[2], 0, "no dt means the rig does not move");
  const moved = CamFeel.drive("chase", eye, tgt, 57, { dt: 0.05, att: { yawRateCur: 0, baPitch: 0 }, slipLat: 0 }, 1);
  assert.equal(eye[0], 0, "the lens does not dolly");
  assert.equal(eye[1], 2, "the lens does not lift");
  assert.equal(eye[2], 0, "the lens does not pull back");
  assert.equal(tgt[2], 10, "the aim stays where the rig put it");
  assert.ok(moved > 57, "fov opens with speed");
  const locked = [0, 2, 0];
  assert.equal(CamFeel.drive("cockpit", locked, [0, 1, 10], 64, { dt: 0.05, att: {} }, 1), 65.5);
  assert.equal(locked[0], 0, "cockpit eye stays bolted");
  assert.equal(locked[1], 2, "cockpit eye stays bolted");
  assert.equal(locked[2], 0, "cockpit eye stays bolted");
  const still = [0, 2, 0];
  CamFeel.drive("chase", still, [0, 1, 10], 57, { dt: 0.05, reduceMotion: true, att: {} }, 1);
  assert.equal(still[2], 0, "reduce motion skips the lens");
  // Same inputs. The eye stays put for every mode; the lens is what differs.
  CamFeel.resetFollow();
  const chaseEye = [0, 2, -8], heliEye = [0, 2, -8], wallEye = [0, 2, -8];
  const aim = [0, 1, 0];
  const ex = { dt: 1, att: { yawRateCur: 0.8, baPitch: 0 }, slipLat: 0 };
  const chaseFov = CamFeel.drive("chase", chaseEye, aim.slice(), 57, ex, 1);
  const heliFov = CamFeel.drive("heli", heliEye, aim.slice(), 36, ex, 1);
  CamFeel.drive("trackside", wallEye, aim.slice(), 42, ex, 1);
  assert.ok(heliFov - 36 > chaseFov - 57, "the helicopter lens opens more than chase");
  assert.deepEqual(chaseEye, [0, 2, -8], "chase eye is the rig's");
  assert.deepEqual(heliEye, [0, 2, -8], "heli eye is the rig's");
  assert.equal(wallEye[0], 0, "trackside eye stays put");
  assert.equal(wallEye[1], 2, "trackside eye stays put");
  assert.equal(wallEye[2], -8, "trackside eye stays put");
});

test("speedFov is one shared curve scaled per mode", () => {
  const { CamFeel } = loadCamFeel();
  assert.equal(CamFeel.speedFov(64, 14, 0, 1), 64);
  assert.equal(CamFeel.speedFov(64, 14, 1, 1), 78);
  assert.equal(CamFeel.speedFov(46, 8, 1, 0.5, 2), 46 + 4 + 2);
  // tcam / heli / side used to ignore speed — they now share the curve at half scale
  assert.ok(CamFeel.modeFov("tcam", 1, 0) > CamFeel.modeFov("tcam", 0, 0));
  assert.ok(CamFeel.modeFov("heli", 1, 0) > CamFeel.modeFov("heli", 0, 0));
  assert.ok(CamFeel.modeFov("side", 1, 0) > CamFeel.modeFov("side", 0, 0));
  // cockpit at rest / top matches the old lerp(64, 78, spN)
  assert.equal(CamFeel.modeFov("cockpit", 0, 0), 64);
  assert.equal(CamFeel.modeFov("cockpit", 1, 0), 78);
  assert.equal(CamFeel.modeFov("cockpit", 1, 1), 81);
  // far = former lerp(57,63)+4
  assert.equal(CamFeel.modeFov("far", 0, 0), 61);
  assert.equal(CamFeel.modeFov("far", 1, 0), 67);
});

test("LOOK BACK skips reverse and rear; latch toggles on rising edge", () => {
  const { CamFeel } = loadCamFeel();
  assert.equal(CamFeel.shouldLookBack("chase", true), true);
  assert.equal(CamFeel.shouldLookBack("reverse", true), false);
  assert.equal(CamFeel.shouldLookBack("rear", true), false);

  CamFeel.setLookBackLatch(true);
  assert.equal(CamFeel.lookBackLatch(), true);
  // rising edge while racing latches on
  CamFeel.tick({ mode: "cockpit", dt: 0.016, racing: true, lookHeld: true });
  assert.equal(CamFeel.shouldLookBack("cockpit", true), true);
  assert.equal(CamFeel.shouldLookBack("cockpit", false), true); // latched, hold released
  // second press clears
  CamFeel.tick({ mode: "cockpit", dt: 0.016, racing: true, lookHeld: false });
  CamFeel.tick({ mode: "cockpit", dt: 0.016, racing: true, lookHeld: true });
  assert.equal(CamFeel.shouldLookBack("cockpit", true), false);
  // reverse clears latch
  CamFeel.tick({ mode: "cockpit", dt: 0.016, racing: true, lookHeld: false });
  CamFeel.tick({ mode: "cockpit", dt: 0.016, racing: true, lookHeld: true });
  assert.equal(CamFeel.shouldLookBack("cockpit", false), true);
  CamFeel.tick({ mode: "reverse", dt: 0.016, racing: true, lookHeld: false });
  assert.equal(CamFeel.shouldLookBack("cockpit", false), false);
});

test("free-look accumulates on stick, recenters on release, respects comfort", () => {
  const { CamFeel } = loadCamFeel();
  CamFeel.resetFreeLook();
  CamFeel.tick({
    mode: "cockpit", dt: 0.05, racing: true, comfort: false,
    stickX: 1, stickY: 0, mouseDx: 0, mouseDy: 0,
  });
  const a = CamFeel.freeLookState();
  assert.ok(a.yaw > 0, "right stick yaws right");
  CamFeel.tick({
    mode: "cockpit", dt: 0.5, racing: true, comfort: false,
    stickX: 0, stickY: 0, mouseDx: 0, mouseDy: 0,
  });
  const b = CamFeel.freeLookState();
  assert.ok(Math.abs(b.yaw) < Math.abs(a.yaw), "recenters toward 0 when released");

  CamFeel.resetFreeLook();
  CamFeel.tick({
    mode: "cockpit", dt: 0.05, racing: true, comfort: true,
    stickX: 1, stickY: 0,
  });
  assert.equal(CamFeel.freeLookState().yaw, 0, "camComfort blocks free-look");

  CamFeel.resetFreeLook();
  CamFeel.tick({
    mode: "chase", dt: 0.05, racing: true, comfort: false,
    stickX: 1, stickY: 0,
  });
  assert.equal(CamFeel.freeLookState().yaw, 0, "chase is not a free-look mode");
});

test("applyFreeLook is additive yaw on the aim about the eye", () => {
  const { CamFeel } = loadCamFeel();
  CamFeel.resetFreeLook();
  CamFeel.tick({
    mode: "hood", dt: 0.2, racing: true, comfort: false,
    stickX: 1, stickY: 0,
  });
  const eye = [0, 1, 0], tgt = [0, 1, 10];
  CamFeel.applyFreeLook(eye, tgt);
  assert.ok(Math.abs(tgt[0]) > 0.01, "yaw moved the aim laterally");
  assert.equal(eye[0], 0, "eye stays put");
});

test("buzz / free-look scope tables stay aligned", () => {
  const { CamFeel } = loadCamFeel();
  assert.deepEqual([...CamFeel.BUZZ_MODES], [...CamFeel.FREELOOK_MODES]);
  assert.deepEqual([...CamFeel.LOOKBACK_SKIP], ["reverse", "rear"]);
  for (const m of CamFeel.BUZZ_MODES) assert.equal(CamFeel.isBuzzMode(m), true);
  assert.equal(CamFeel.isBuzzMode("chase"), false);
  // HELMET is bolted to the chassis like the cockpit it is: buzz, free-look and the cockpit's lens.
  assert.equal(CamFeel.isBuzzMode("helmet"), true);
  assert.equal(CamFeel.isFreeLookMode("helmet"), true);
  for (const sp of [0, 0.5, 1]) assert.equal(CamFeel.modeFov("helmet", sp, 1), CamFeel.modeFov("cockpit", sp, 1));
});

test("speed vignette defaults off and persists", () => {
  const { CamFeel, store } = loadCamFeel();
  assert.equal(CamFeel.speedVignette(), false);
  CamFeel.setSpeedVignette(true);
  assert.equal(CamFeel.speedVignette(), true);
  assert.equal(store.get("speedVignette"), true);
});

test("vantage.js routes FOV and look-back through CamFeel", () => {
  const src = fs.readFileSync(path.join(root, "js/camera/vantage.js"), "utf8");
  assert.match(src, /CamFeel\.modeFov/);
  // #700 COMFORT › SPEED FOV: vantage feeds CamTune-scaled spFov, not raw spN.
  assert.match(src, /CamFeel\.modeFov\([^)]*spFov/);
  assert.match(src, /CamFeel\.applyFreeLook/);
  assert.match(src, /CamFeel\.shouldLookBack/);
  // no leftover bare lerp FOV on the modes that must share the curve
  assert.doesNotMatch(src, /fov = lerp\(64, 78/);
});

test("game.js buzz uses CamFeel.isBuzzMode; Input exposes look axes", () => {
  const game = fs.readFileSync(path.join(root, "js/game.js"), "utf8");
  assert.match(game, /CamFeel\.tickRace/);
  assert.match(game, /CamFeel\.isBuzzMode/);
  const input = fs.readFileSync(path.join(root, "js/input/input.js"), "utf8");
  assert.match(input, /function lookStick\(/);
  assert.match(input, /function consumeLookMouse\(/);
});

test("settings export lists the new camera-feel keys", () => {
  const src = fs.readFileSync(path.join(root, "js/ui/settings-export.js"), "utf8");
  assert.match(src, /lookBackLatch/);
  assert.match(src, /speedVignette/);
});

// A snap (startRace / restart → snapGameCam) must also zero the eased bend
// hang: the first live frame used to ease from the previous race's hairpin
// and pop the chase eye ~4 m sideways off a straight grid.
test("a snapped chase frame clears the bend hang the next live frame eases from", () => {
  let K = 0;
  const n = 1000, total = 4000;
  const track = { total, n, px: new Float64Array(n), py: new Float64Array(n),
    pz: Float64Array.from({ length: n }, (_, k) => k * 4), rx: new Float64Array(n).fill(1),
    ry: new Float64Array(n), rz: new Float64Array(n), hw: new Float64Array(n).fill(6), def: {},
    surface: { heightAt: () => -0.12 } };
  const at = (arr, s) => { let v = s % total; if (v < 0) v += total; const fi = v / total * n, i = Math.floor(fi) % n, j = (i + 1) % n; return arr[i] + (arr[j] - arr[i]) * (fi - Math.floor(fi)); };
  const Tracks = {
    sample(t, s, o) { o.p[0] = at(t.px, s); o.p[1] = at(t.py, s); o.p[2] = at(t.pz, s); o.t[0] = 0; o.t[1] = 0; o.t[2] = 1; o.r[0] = 1; o.r[1] = 0; o.r[2] = 0; o.hw = 6; return o; },
    curvature: () => K,
    banking: (t, s, l, scr) => { if (scr) { scr.dy = 0; scr.roll = 0; return scr; } return { dy: 0, roll: 0 }; },
  };
  const ctx = vm.createContext({ Math, JSON, Object, Array, Number, Tracks,
    GameStore: { store: { get: (k, d) => d, set: () => true, raw: () => null, rawSet: () => true } },
    Log: { info() {}, debug() {}, warn() {}, error() {} }, document: undefined });
  vm.runInContext(["js/core/mat4.js", ...["drive-chase.js", "drive-broadcast.js", "drive-onboard.js", "feel.js"].map((f) => "js/camera/" + f), "js/camera/vantage.js"]
    .map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n") + "\nthis.GC = GameCams;", ctx);
  const live = (s) => ctx.GC.vantage(track, "chase", s, 0, 60, 0, { carPos: [0, s], carHead: 0, dt: 1 / 60, att: {} }).eye[0];
  K = 0.06; for (let i = 0; i < 180; i++) live(500);       // sit in a left hairpin
  K = 1e-5;
  const snap = ctx.GC.vantage(track, "chase", 100, 0, 0, 0, { carPos: [0, 100], carHead: 0, snap: true, att: {} }).eye[0];
  const first = live(100);
  assert.ok(Math.abs(first - snap) < 0.1, `first live frame ${first.toFixed(3)} vs snap ${snap.toFixed(3)}`);
});
