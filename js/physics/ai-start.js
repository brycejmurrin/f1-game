/* Apex 26 — AI START: the lights-out getaway plan and the lap-1 calm/headway policy, split from ai-drive.js (#6920 U4.2). Pure, hash-driven (no simRnd); AiDrive re-exports these names. */
const AiStart = (function () {
  "use strict";

  const { clamp, lerp } = M4;

  // THE LAUNCH. Real lights-out is a reaction (a driver-dependent fraction of a
  // second) and a getaway that varies car to car; the model had neither, so a
  // 22-car field held its 8 m grid pitch for fifteen seconds and braked for T1
  // as one train (measured: median gap 8.0-8.6 m from t=1 to t=15, every speed
  // within 2 m/s of every other). The plan is drawn once per car per race from
  // a hash, NOT from simRnd(): the seeded stream's draw count is a contract.
  //   react — seconds after lights-out before the throttle goes down; awareness
  //           reads the lights, the roll is the day.
  //   grip  — the getaway's acceleration multiplier, fading to 1 over 3 s; craft
  //           and skill manage the wheelspin, the roll is the clutch bite.
  const _launch = { react: 0, grip: 1 };
  function launchPlan(t, roll) {
    const r = roll || 0, r2 = (r * 7919) % 1;
    _launch.react = clamp(lerp(0.54, 0.15, t.awareness) + (r - 0.5) * 0.26, 0.05, 0.78);
    const hands = 0.5 * t.craft + 0.5 * clamp((t.skill - 0.9) * 10, 0, 1);
    _launch.grip = clamp(lerp(0.79, 1.0, hands) + (r2 - 0.5) * 0.22, 0.69, 1.08);
    return { react: _launch.react, grip: _launch.grip };
  }
  const LAUNCH_FADE = 3.2;   // seconds over which the getaway becomes ordinary acceleration
  function launchMul(tSince, plan) {
    if (!plan) return 1;
    if (tSince < plan.react) return 0;
    return lerp(plan.grip, 1, clamp((tSince - plan.react) / LAUNCH_FADE, 0, 1));
  }
  function launchDone(tSince, plan) { return !plan || tSince > plan.react + LAUNCH_FADE; }

  // THE FIRST LAP IS NOT THE RACE. Off a standing start the whole field
  // arrived at turn 1 as one train (ai-tactics, 2026-10-01: lap 1 with 85 % of
  // intervals under a second, trains of 12, and the most contact of the race)
  // and attacked into it as if it were lap 20. A launching car — and for
  // START_CALM s from the green — leaves START_GAP_T s more headway and
  // attacks at START_ATTACK of the quality (attackOK); calm fades over the
  // last 10 s and nothing changes after. `until` is game.js's c.calmUntil,
  // set when the launch ends, so a car placed at speed (a test rig, a rolling
  // start) never had a launch and is never calm.
  const START_CALM = 24, START_GAP_T = 0.42, START_ATTACK = 0.45;
  function startCalm(launching, until, t) {
    if (launching) return 1;
    return until > t ? clamp((until - t) / 10, 0, 1) : 0;
  }
  function startCalmS() { return START_CALM; }
  function startGapT(calm) { return START_GAP_T * (calm || 0); }
  // No qWin bonus on calm: widening qWin during the opening seconds reshaped the
  // whole race (measured: +0.7 s Bahrain normal ai-pace). Lap-1 headway is startGapT only.

  return Object.freeze({
    launchPlan, launchMul, launchDone, startCalm, startCalmS, startGapT,
    START_CALM, START_GAP_T, START_ATTACK, LAUNCH_FADE,
  });
})();
