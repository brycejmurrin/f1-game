/* ai-vmax-stage-trace-vm.test.mjs — every AI vmax stage, per car per tick, byte-identical across the AiPace move (#7258).
 *
 * Member 1 of batch #7258 (decision 7244-1 B on #7148): the AI-only vmax stages in game.js updateCar /
 * updateCarBrakePlan move into the new AiPace module, and this pin proves the move changed no number. It was
 * captured on the tip BEFORE the move (3c41affc) and must pass there and on the branch with the same bytes.
 *
 * What it records, at full float precision, per AI car per 1/60 step on bahrain and monza, seeds 1-2:
 *   - each AiDrive stage multiplier/ease as game.js (or AiPace) calls it: pacePhase, trailStep,
 *     mistakeGatherMul, tyrePace, trailYieldEase, letPassEase, squeezeEase, towGain, queueFloor
 *     (spied in place on the AiDrive object, so the call order is pinned too);
 *   - the vmax every tick hands AiDrive.paceSample (the stamped stage output), c._vmaxNow and c._bandNow;
 *   - the car's speed, s and x (what the brake-plan stages feed).
 * Seed 1 runs TYRE WEAR off (the AiDrive.tyrePace curve), seed 2 runs it real (the shared wear model), so both
 * tyre-pace branches are pinned.
 * paceTrim is NOT spied: it is pure, so a later dedupe of its two calls per tick moves no vmax.
 * Each stream is hashed (sha256); a red names the stream that moved.
 * To re-capture after a DELIBERATE pace change: APEX_PRINT_GOLDEN=1 node --test tests/unit/ai-vmax-stage-trace-vm.test.mjs
 *
 * Run: node --test tests/unit/ai-vmax-stage-trace-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import vm from "node:vm";
import { createRequire } from "node:module";

const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");

const CASES = [["bahrain", 1], ["bahrain", 2], ["monza", 1], ["monza", 2]];
const FRAMES = 3600;   // 60 s of race: the launch, the band, the first corners, traffic and a mistake or two
const DT = 1 / 60;
const SPIED = ["pacePhase", "trailStep", "mistakeGatherMul", "tyrePace", "trailYieldEase", "letPassEase", "squeezeEase", "towGain", "queueFloor", "paceSample"];

// Captured on 3c41affc (the tip before the move), 2026-11-27.
const GOLDEN = {
  "bahrain:1": {"counts":{"pacePhase":75600,"trailStep":75600,"mistakeGatherMul":216,"tyrePace":75600,"trailYieldEase":0,"letPassEase":0,"squeezeEase":70,"towGain":32507,"queueFloor":20653,"paceSample":75600,"car":75600},"sha":{"pacePhase":"0fdd42e2e179c5d881ccefb2","trailStep":"67c015ee0b9be620af5a9db5","mistakeGatherMul":"55923389c5318804b56bc136","tyrePace":"721a1c371d38279fa0b3af91","trailYieldEase":"e3b0c44298fc1c149afbf4c8","letPassEase":"e3b0c44298fc1c149afbf4c8","squeezeEase":"770493594fec845abc8102fe","towGain":"fce8d92023b99efac78e0b53","queueFloor":"9d2704ebaeecfdca0fbcd7c6","paceSample":"b30e3889c4691e3d72c68b92","car":"e3420ea326a0529d339614af"}},
  "bahrain:2": {"counts":{"pacePhase":75600,"trailStep":75600,"mistakeGatherMul":229,"tyrePace":0,"trailYieldEase":2809,"letPassEase":0,"squeezeEase":60,"towGain":31552,"queueFloor":21042,"paceSample":75600,"car":75600},"sha":{"pacePhase":"2fa2b17038cc6f1707d1c514","trailStep":"4b40750bedfb8aaf959a9539","mistakeGatherMul":"3d9420c1bdbadb6e33e71ef0","tyrePace":"e3b0c44298fc1c149afbf4c8","trailYieldEase":"87c63493d7eda2fd977d3d79","letPassEase":"e3b0c44298fc1c149afbf4c8","squeezeEase":"b0fa0387c9e612bb27eb58bf","towGain":"8760afd46952839ca771d003","queueFloor":"f4ba49887b1252b601bf7dc6","paceSample":"797e925ee36310287fe4e28a","car":"c4d6523a33d3a9aff8c21b1e"}},
  "monza:1": {"counts":{"pacePhase":75600,"trailStep":75600,"mistakeGatherMul":0,"tyrePace":75600,"trailYieldEase":4262,"letPassEase":0,"squeezeEase":76,"towGain":39554,"queueFloor":19215,"paceSample":75600,"car":75600},"sha":{"pacePhase":"0fdd42e2e179c5d881ccefb2","trailStep":"f786bfc4ba721d10282b9972","mistakeGatherMul":"e3b0c44298fc1c149afbf4c8","tyrePace":"721a1c371d38279fa0b3af91","trailYieldEase":"43252b1a370ab9b6f4eff221","letPassEase":"e3b0c44298fc1c149afbf4c8","squeezeEase":"914d7c854bb9e883127e8a86","towGain":"126f95b797183ac44bd2994e","queueFloor":"08bfc3dc5800edfea79d463f","paceSample":"c2180845ae84c3d57fb8e051","car":"6c99437353a03290a0302a7c"}},
  "monza:2": {"counts":{"pacePhase":75600,"trailStep":75600,"mistakeGatherMul":432,"tyrePace":0,"trailYieldEase":5781,"letPassEase":0,"squeezeEase":240,"towGain":35679,"queueFloor":19024,"paceSample":75600,"car":75600},"sha":{"pacePhase":"2fa2b17038cc6f1707d1c514","trailStep":"873ce264992443a8a812824b","mistakeGatherMul":"939f00b349e375c331f8711c","tyrePace":"e3b0c44298fc1c149afbf4c8","trailYieldEase":"b9ea8b55956cafa26d013b8f","letPassEase":"e3b0c44298fc1c149afbf4c8","squeezeEase":"326c5d45212c0a09885a723f","towGain":"f71a1a670461c5897bd0eabd","queueFloor":"0004d01b95782edf7435c31e","paceSample":"356bd8632f8e015c2f1796a0","car":"0c220727fe956ff260756324"}},
};

const num = (v) => (typeof v === "number" ? (Object.is(v, -0) ? "-0" : String(v)) : typeof v === "boolean" ? (v ? "T" : "F") : v == null ? "_" : "o");

async function trace(track, seed) {
  const streams = Object.fromEntries([...SPIED, "car"].map((k) => [k, crypto.createHash("sha256")]));
  const counts = Object.fromEntries([...SPIED, "car"].map((k) => [k, 0]));
  let live = false;
  const onEval = (f, ctx) => {
    if (f !== "js/physics/ai-drive.js") return;
    const A = vm.runInContext("AiDrive", ctx);
    for (const name of SPIED) {
      const orig = A[name];
      assert.equal(typeof orig, "function", "AiDrive." + name);
      A[name] = function () {
        const r = orig.apply(this, arguments);
        if (live) {
          // paceSample's vmax is argument 3 (ref, node, c, vmax, clean, dt); the rest log their numeric args and result.
          const args = []; for (let i = 0; i < arguments.length; i++) args.push(num(arguments[i]));
          streams[name].update(args.join(",") + "=" + num(r) + ";"); counts[name]++;
        }
        return r;
      };
    }
  };
  const g = await createGame({ track, carMeshes: false, onEval, storage: { difficulty: "hard", tyreWear: seed === 1 ? "off" : "real", raceGrid: null } });
  try {
    g.apex.seed(seed); await g.race(track, null, null, { laps: 3 });
    const player = g.G.cars.find((c) => c.isPlayer || c.human);
    g.aiOnly();
    const ai = g.G.cars.filter((c) => c !== player && !c.human);
    live = true;
    for (let fr = 0; fr < FRAMES; fr++) {
      g.step(1, DT);
      for (let i = 0; i < ai.length; i++) {
        const c = ai[i];
        streams.car.update(i + ":" + [c._vmaxNow, c._bandNow, c.speed, c.s, c.x].map(num).join(",") + ";"); counts.car++;
      }
    }
    live = false;
  } finally { g.close(); }
  const sha = Object.fromEntries(Object.entries(streams).map(([k, h]) => [k, h.digest("hex").slice(0, 24)]));
  return { counts, sha };
}

for (const [track, seed] of CASES) {
  test(`${track} seed ${seed}: every AI vmax stage is byte-identical to the pre-AiPace tip`, { timeout: 240_000 }, async () => {
    const t = await trace(track, seed);
    if (process.env.APEX_PRINT_GOLDEN) console.log("GOLDEN " + JSON.stringify([track + ":" + seed, t]));
    assert.ok(GOLDEN, "no golden trace captured");
    const want = GOLDEN[track + ":" + seed];
    assert.ok(want, "no golden for " + track + ":" + seed);
    assert.deepEqual(t.counts, want.counts, "a stage was called a different number of times");
    for (const k of Object.keys(want.sha)) assert.equal(t.sha[k], want.sha[k], `stream ${k} moved`);
  });
}
