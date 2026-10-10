import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "../..");

function loadExtraRigs() {
  const disk = new Map();
  const ctx = {
    M4: {
      clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v),
      lerp: (a, b, t) => a + (b - a) * t,
    },
    Tracks: {
      sample(track, s, out) {
        const L = track.total || 1000;
        let v = s % L; if (v < 0) v += L;
        out.p[0] = v; out.p[1] = 0; out.p[2] = 0;
        out.t[0] = 1; out.t[1] = 0; out.t[2] = 0;
        out.r[0] = 0; out.r[1] = 0; out.r[2] = 1;
        out.hw = 7;
      },
      curvature() { return 0; },
      pitLaneAt() { return null; },
    },
    Broadcast: undefined,
    CamTune: { cornerLead() { return null; } },
    CamModes: {
      CAM_MODES: [
        { id: "chase" }, { id: "far" }, { id: "visor" },
        { id: "rival" }, { id: "pitwall" }, { id: "drone" },
      ],
    },
    GameStore: {
      store: {
        get(k, d) { return disk.has(k) ? disk.get(k) : d; },
        set(k, v) { disk.set(k, v); return true; },
      },
    },
    Log: { info() {} },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "js/camera/extra-rigs.js"), "utf8") +
      "\nthis.exported = ExtraRigs;",
    ctx);
  return { ExtraRigs: ctx.exported, disk, ctx };
}

test("CAM_MODES appends rival, pitwall, drone after trackside (save-format contract)", () => {
  const src = fs.readFileSync(path.join(root, "js/camera/mode-switch.js"), "utf8");
  const ids = [...src.matchAll(/id:\s*"([a-z]+)"/g)].map((m) => m[1]);
  // TRACKSIDE (#702) landed on ship first at index 14; our three append after it.
  // TV (the live director) then HELMET append after drone; never reorder earlier ids.
  assert.deepEqual(ids.slice(-7), ["visor", "trackside", "rival", "pitwall", "drone", "tv", "helmet"],
    "new cams must append — apex26.camMode is an index (TV at 18, HELMET at 19)");
  assert.equal(ids.length, 20);
});

test("ExtraRigs.pickRival uses Broadcast.battles when present", () => {
  const { ExtraRigs, ctx } = loadExtraRigs();
  const a = { prog: 100, speed: 50, s: 100, x: 0 };
  const b = { prog: 80, speed: 50, s: 80, x: 0 };
  const player = a;
  ctx.Broadcast = {
    battles(cars) {
      return [{ key: b, ahead: a, gapS: 0.4, score: 0.4 }];
    },
  };
  // Re-load so Broadcast is visible... pickRival reads Broadcast at call time.
  assert.equal(ExtraRigs.pickRival([a, b], player), b);
  assert.equal(ExtraRigs.pickRival([a, b], b), a);
});

test("ExtraRigs.pickRival falls back to nearest car within FALLBACK_S", () => {
  const { ExtraRigs } = loadExtraRigs();
  const player = { prog: 100, speed: 40, s: 100, x: 0 };
  const near = { prog: 60, speed: 40, s: 60, x: 0 };   // 1.0 s gap
  const far = { prog: 0, speed: 40, s: 0, x: 0 };      // 2.5 s gap — on the edge
  assert.equal(ExtraRigs.pickRival([player, near, far], player), near);
  assert.equal(ExtraRigs.pickRival([player], player), null);
});

test("ExtraRigs.solve returns finite eye/tgt/fov for rival, pitwall, drone", () => {
  const { ExtraRigs } = loadExtraRigs();
  const track = { total: 1000, pit: { side: 1 }, def: {} };
  const eye = [0, 0, 0], tgt = [0, 0, 0];
  for (const mode of ["rival", "pitwall", "drone"]) {
    const fov = ExtraRigs.solve(mode, track, 100, 0, 50, 0, {
      bankDy: 0, reduceMotion: false, carPos: [100, 0], carHead: 0, snap: true,
    }, eye, tgt);
    assert.ok(Number.isFinite(fov) && fov > 20 && fov < 110, mode + " fov");
    assert.ok(eye.every(Number.isFinite), mode + " eye");
    assert.ok(tgt.every(Number.isFinite), mode + " tgt");
    assert.ok(Math.hypot(eye[0] - tgt[0], eye[2] - tgt[2]) > 1, mode + " has a view distance");
  }
});

test("ExtraRigs.tickPitAuto cuts to pitwall on entry and restores on exit", () => {
  const { ExtraRigs } = loadExtraRigs();
  let mode = 0;
  const G = {
    player: { pitState: "none" },
    get camMode() { return mode; },
    set camMode(v) { mode = v; },
    setCamMode(i) { mode = i; return "x"; },
    store: { get: () => true, set() {} },
  };
  // Enter the pits from chase (index 0) → ephemeral cut to pitwall (index 4 in our stub).
  G.player.pitState = "lane";
  assert.equal(ExtraRigs.tickPitAuto(G), "pitwall");
  assert.equal(mode, 4);
  // Leave the pits → restore chase.
  G.player.pitState = "none";
  assert.equal(ExtraRigs.tickPitAuto(G), "chase");
  assert.equal(mode, 0);
});

test("ExtraRigs.tickPitAuto leaves the camera alone by default (opt-in only)", () => {
  const { ExtraRigs } = loadExtraRigs();
  let mode = 0;
  const G = {
    player: { pitState: "none" },
    get camMode() { return mode; },
    set camMode(v) { mode = v; },
    setCamMode(i) { mode = i; return "x"; },
    // A store that has never seen the key: get() hands back its default.
    store: { get: (k, d) => d, set() {} },
  };
  G.player.pitState = "lane";
  assert.equal(ExtraRigs.tickPitAuto(G), null, "no cut on pit entry unless pitCamAuto is set");
  assert.equal(mode, 0, "the player's camera stays put in the pit lane");
  G.player.pitState = "none";
  assert.equal(ExtraRigs.tickPitAuto(G), null);
  assert.equal(mode, 0);
});

test("ExtraRigs.pitCamAuto persists through GameStore", () => {
  const { ExtraRigs, disk } = loadExtraRigs();
  assert.equal(ExtraRigs.pitCamAuto(null), false, "off until the player opts in");
  assert.equal(ExtraRigs.pitCamAuto(null, false), false);
  assert.equal(disk.get("pitCamAuto"), false);
  assert.equal(ExtraRigs.pitCamAuto(null), false);
  assert.equal(ExtraRigs.pitCamAuto(null, true), true);
});

test("drone cornerLead is gated in CamTune.modes", () => {
  const src = fs.readFileSync(path.join(root, "js/camera/offsets.js"), "utf8");
  assert.match(src, /modes:\s*\["chase",\s*"far",\s*"drone"\]/);
});

// bug-hunt 9.8: pickRival ran every rendered frame in RIVAL mode, allocating a
// row per car + an array + a sort; the rows are now pooled.
test("ExtraRigs.pickRival reuses its running-car rows and array across calls", () => {
  const { ExtraRigs, ctx } = loadExtraRigs();
  const a = { prog: 100, speed: 50, s: 100, x: 0 };
  const b = { prog: 80, speed: 50, s: 80, x: 0 };
  const seen = [];
  ctx.Broadcast = { battles(cars) { seen.push({ arr: cars, rows: cars.slice() }); return []; } };
  ExtraRigs.pickRival([a, b], a);
  ExtraRigs.pickRival([b, a], a);   // different order: still the same pooled rows
  assert.equal(seen[0].arr, seen[1].arr, "the same running array is reused");
  assert.ok(seen[1].rows.every((r) => seen[0].rows.includes(r)), "the same row objects are reused");
  assert.equal(seen[1].arr.length, 2);
  assert.equal(seen[1].arr[0].key, a, "rows are re-filled and re-sorted (a leads on prog)");
});
