// @ts-check
/**
 * THE UNDERSTEER CUE — the short haptic pulse `updateCar()` fires when the FRONT
 * axle is saturated (js/game.js, search `uslipHapT`).
 *
 * The interesting content here is the TRIGGER CONDITION, not the buzz. A real
 * wheel goes light as the front lets go; on a phone or a pad there is no wheel,
 * so the game says it with a pulse instead. That only earns its place if it
 * fires when the front has actually stopped answering more steering with more
 * grip, and stays quiet when the car is doing what it is told — a cue that
 * fires all the time is noise, and a cue that never fires is dead code.
 *
 * Everything asserted below is read off the cue block itself rather than
 * guessed, so a retune of the physics moves the car but not these numbers:
 *
 *   gate    c.isPlayer && !c.offroad && sp > 0.5   (sp = clamp(|speed|/3, 0, 1))
 *   ask     Math.abs(steer) > 0.15                 (raw driver input, pre-expo)
 *   fire    sat > 1.15                             sat = |CS_FRONT*slipF| / muF
 *   depth   bite = clamp((sat - 1.15) / 0.85, 0, 1)
 *   repeat  uslipHapT = 0.16 - bite * 0.06         → 0.16 s shallow, 0.10 s deep
 *
 * OBSERVATION. The cue has two output channels and no state hook, so the spec
 * stubs both: `navigator.vibrate` and `Input.rumble`. Four call sites in
 * js/game.js reach `Input.rumble`, and only the understeer cue passes a
 * duration of 70 ms (kerb 90, wall scrape 100, impact 120) — that duration is
 * the discriminator. The tests still steer clear of kerbs and walls so the
 * discriminator never has to work hard, and they assert that no OTHER haptic
 * fired during a run rather than trusting the filter blindly.
 *
 * CONSTRUCTION. Saturation depth is dialled with `__apex.setPhysics({playerGrip})`
 * — PLAYER_GRIP scales `muBase`, hence both `muF` and `muR`, so it moves the car
 * through its own grip envelope without changing the front/rear balance (dropping
 * FRONT_GRIP alone does change it, and tips the car into oversteer instead).
 * That is the documented A/B seam, and it makes "shallow" and "deep" two points
 * on one monotone axis instead of two hand-picked corners.
 *
 * Imports from ./fixtures.js so a failure arrives with apex-state, the Log ring
 * and the page console attached.
 */
import { test, expect } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };

// --- constants lifted from the cue block in js/game.js -----------------------
const ASK_FLOOR = 0.15;      // |steer| must exceed this for the cue to consider firing
const SPEED_FLOOR = 1.5;     // m/s — `sp > 0.5` with sp = clamp(|speed|/3, 0, 1)
const CUE_RUMBLE_MS = 70;    // Input.rumble duration unique to this cue
// The repeat cooldown is decremented by dt on every tick that qualifies, so the
// gap between two pulses in TICKS is ceil(interval / dt):
//   bite = 1 → 0.10 s → 6 ticks   (the tightest the cue can ever machine-gun)
//   bite = 0 → 0.16 s → 10 ticks  (the loosest, right at the trigger threshold)
const MIN_GAP_TICKS = 6;
const MAX_GAP_TICKS = 10;

/**
 * Boot the game on a track, install the haptic recorders, and prove they work.
 * The proof matters: every "it stays silent" assertion below is vacuously true
 * if the stub never took, so the rig is checked before anything is measured.
 */
async function loadRig(page, id = "monza") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 10_000 });
  await page.evaluate((t) => window.__apex.race(t), id);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 30_000 });

  const rig = await page.evaluate(() => {
    window.__cue = [];
    const rec = (ch, v) => window.__cue.push({ ch, v });
    // navigator.vibrate is a prototype accessor in Chromium; shadow it with an
    // own property, and fall back to the prototype if that is refused.
    const stub = (ms) => { rec("vibrate", ms); return true; };
    try { Object.defineProperty(navigator, "vibrate", { configurable: true, writable: true, value: stub }); }
    catch (_) {
      try { Object.defineProperty(Object.getPrototypeOf(navigator), "vibrate", { configurable: true, writable: true, value: stub }); }
      catch (__) { /* reported as a rig failure below */ }
    }
    // Input.rumble is a plain writable property of the module's public object
    // and game.js looks it up on every call, so assignment is enough. `Input` is
    // a top-level `const`, i.e. a global LEXICAL binding — it is reachable by
    // name but never as `window.Input`. Not chained through to the real
    // actuator: there is no pad in a headless run and playEffect() would only
    // add a failure mode.
    Input.rumble = (intensity, ms) => rec("rumble", { intensity, ms });

    let vibrateOk = false, rumbleOk = false;
    try { navigator.vibrate(999); vibrateOk = window.__cue.some((e) => e.ch === "vibrate" && e.v === 999); } catch (_) {}
    try { Input.rumble(0.5, 999); rumbleOk = window.__cue.some((e) => e.ch === "rumble" && e.v.ms === 999); } catch (_) {}
    window.__cue.length = 0;

    window.__apex.headless(true);   // no render — physics only, and much faster
    window.__apex.go();
    // DRIVING HELP is opt-in and ships at 0, but a stored profile could turn it
    // on; pinned here so the only thing steering the car is this spec.
    window.__apex.setPhysics({ roadFollow: 0 });
    window.__apex.seed(42);
    return { vibrateOk, rumbleOk };
  });
  expect(rig.vibrateOk, "navigator.vibrate recorder installed").toBe(true);
  expect(rig.rumbleOk, "Input.rumble recorder installed").toBe(true);
}

/**
 * Pick the longest ACTIVATION ZONE that is well clear of the start line. A zone
 * is by definition a straight over 210 m, which is exactly what this spec wants:
 * maximum lateral room, no track curvature helping or hindering the front axle,
 * and — because `__apex.reset()` rebuilds the grid at s ≈ 0 — no AI pack within
 * reach of the car during a one-second run.
 */
async function longStraight(page) {
  const spot = await page.evaluate(() => {
    const zones = window.__apex.aeroZones() || [];
    const clear = zones.filter((z) => z.midFrac > 0.12 && z.midFrac < 0.88);
    if (!clear.length) return null;
    clear.sort((a, b) => b.len - a.len);
    return { frac: clear[0].midFrac, len: clear[0].len };
  });
  expect(spot, "a long straight clear of the start line").not.toBeNull();
  return spot.frac;
}

/**
 * Drive one deterministic episode and report what the cue did.
 *
 * @returns pulse tick indices, the gaps between them, and enough surrounding
 *          state (speed, lateral position, other haptics) that a failure says
 *          WHY rather than just "expected 0 to be greater than 0".
 */
function drive(page, opts) {
  return page.evaluate((o) => {
    const CUE_MS = o.cueMs;
    const A = window.__apex;
    A.setPhysics({ pace: o.pace != null ? o.pace : 1, playerGrip: o.playerGrip != null ? o.playerGrip : 1.15 });
    A.seed(42);

    // Two resets: the first only to read the road half-width here, so the start
    // position can be expressed RELATIVE to the road edge instead of as a magic
    // metre count that goes stale when a circuit is re-splined.
    //   xInside — metres inside the LEFT edge, i.e. as far from the +x edge as
    //             the run can start while staying clear of the kerb band
    //   xAbs    — an absolute lateral offset, for placing the car off-track
    A.reset(o.frac, o.speed, 0);
    const hw = A.probe().hw;
    const x = o.xAbs != null ? o.xAbs : (o.xInside != null ? -(hw - o.xInside) : 0);
    A.reset(o.frac, o.speed, x);

    let speed = o.speed;
    if (o.speedFrac != null) {          // …as a fraction of THIS car's own top speed
      A.step(1 / 60, 1);
      speed = o.speedFrac * A.physState().vmaxNow;
      A.reset(o.frac, speed, x);
    }

    A.setInput({ steer: o.steer, throttle: !!o.throttle, brake: false });
    window.__cue.length = 0;

    const pulses = [];          // tick index of each understeer pulse
    let paired = 0;             // …that had a navigator.vibrate immediately before
    let other = 0;              // any OTHER Input.rumble (kerb / wall / impact)
    let minSpeed = Infinity, maxSpeed = 0, minOffset = Infinity, ticks = 0, stopped = "ran";

    for (; ticks < o.ticks; ticks++) {
      const before = window.__cue.length;
      A.step(1 / 60, 1);
      for (let i = before; i < window.__cue.length; i++) {
        const e = window.__cue[i];
        if (e.ch !== "rumble") continue;
        if (e.v.ms === CUE_MS) {
          pulses.push(ticks);
          const prev = window.__cue[i - 1];
          if (prev && prev.ch === "vibrate") paired++;
        } else other++;
      }
      const p = A.probe();
      minSpeed = Math.min(minSpeed, Math.abs(p.speed));
      maxSpeed = Math.max(maxSpeed, Math.abs(p.speed));
      minOffset = Math.min(minOffset, Math.abs(p.x) - p.hw);
      // Stop a whisker inside the road edge: the kerb band starts at hw - 0.6,
      // and a kerb would fire its own haptic and change the surface grip.
      if (o.edgeStop !== false && Math.abs(p.x) > p.hw - 0.8) { ticks++; stopped = "edge"; break; }
    }

    const gaps = pulses.slice(1).map((t, i) => t - pulses[i]);
    const sorted = gaps.slice().sort((a, b) => a - b);
    const end = A.probe();
    return {
      pulses: pulses.length,
      gaps,
      minGap: sorted.length ? sorted[0] : null,
      maxGap: sorted.length ? sorted[sorted.length - 1] : null,
      medianGap: sorted.length ? sorted[sorted.length >> 1] : null,
      allPaired: pulses.length > 0 && paired === pulses.length,
      other, ticks, seconds: +(ticks / 60).toFixed(3), stopped,
      minSpeed: +minSpeed.toFixed(2), maxSpeed: +maxSpeed.toFixed(2),
      minOffset: +minOffset.toFixed(2),
      speed: +end.speed.toFixed(2), x: +end.x.toFixed(2), hw: +end.hw.toFixed(2),
      startSpeed: +speed.toFixed(2),
    };
  }, { cueMs: CUE_RUMBLE_MS, ...opts });
}

// A full-lock episode. Full lock is +x, so the car starts 1.2 m inside the FAR
// (-x) edge and has the whole road width to wash across before the edge stop
// ends the run — 1.2 m clears both the kerb band and the edge stop itself, so
// the run never ends on its very first tick on a narrow circuit.
const SATURATED = { steer: 1, xInside: 1.2, speed: 50, ticks: 120 };

test.describe("understeer cue — front-axle saturation haptic", () => {
  test.use({ viewport: LANDSCAPE });

  test("fires when the front axle is saturated, on both channels", async ({ page }) => {
    await loadRig(page);
    const frac = await longStraight(page);
    const run = await drive(page, { ...SATURATED, frac });

    // The car is asked for far more lateral grip than the front can make, so it
    // washes wide — that is the whole failure mode this cue exists to announce.
    expect(run.pulses, JSON.stringify(run)).toBeGreaterThan(0);
    // Both output channels, together: a pad rumble alone leaves a phone silent.
    expect(run.allPaired, JSON.stringify(run)).toBe(true);
    // …and nothing else was buzzing, so the 70 ms filter is not doing the work.
    expect(run.other, "no kerb / wall / impact haptic contaminated the run").toBe(0);
    expect(run.minSpeed).toBeGreaterThan(SPEED_FLOOR);
  });

  test("stays silent when the car is doing what it is told", async ({ page }) => {
    await loadRig(page);
    const frac = await longStraight(page);

    // Positive control FIRST, in the same page: if the rig were dead the two
    // silence checks below would pass for the wrong reason.
    const hard = await drive(page, { ...SATURATED, frac });
    expect(hard.pulses, "positive control: full lock must fire").toBeGreaterThan(0);

    // Gentle steering at the SAME speed and place. Twice the "asking" floor, so
    // this isolates saturation — the cue is silent because the front is
    // answering, not because the driver was judged not to be steering at all.
    const gentle = await drive(page, { ...SATURATED, frac, steer: ASK_FLOOR * 2 });
    expect(gentle.pulses, JSON.stringify(gentle)).toBe(0);
    expect(gentle.minSpeed).toBeGreaterThan(SPEED_FLOOR);

    // Straight-line running: nothing asked of the front axle at all.
    const straight = await drive(page, { ...SATURATED, frac, steer: 0 });
    expect(straight.pulses, JSON.stringify(straight)).toBe(0);
    expect(straight.minSpeed).toBeGreaterThan(SPEED_FLOOR);
  });

  test("is silent below the speed floor however saturated the front is", async ({ page }) => {
    await loadRig(page);
    const frac = await longStraight(page);

    // The gate is `sp > 0.5` where sp = clamp(|speed|/3, 0, 1), i.e. 1.5 m/s.
    // Grip is taken almost entirely away so the front is deep in saturation at
    // ANY speed — the only thing that can explain silence is the floor itself.
    const crawl = await drive(page, {
      frac, steer: 1, speed: 1.0, playerGrip: 0.05, ticks: 25, edgeStop: false,
    });
    expect(crawl.maxSpeed, "never rose above the floor").toBeLessThan(SPEED_FLOOR);
    expect(crawl.pulses, JSON.stringify(crawl)).toBe(0);

    // Same car, same lock, same missing grip — just above the floor. This is the
    // control that proves the silence above was the floor and not the setup.
    const rolling = await drive(page, {
      frac, steer: 1, speed: 6, throttle: true, playerGrip: 0.05, ticks: 30, edgeStop: false,
    });
    expect(rolling.minSpeed, "stayed above the floor").toBeGreaterThan(SPEED_FLOOR);
    expect(rolling.pulses, JSON.stringify(rolling)).toBeGreaterThan(0);
  });

  test("is silent off-track, where the driver has bigger problems", async ({ page }) => {
    await loadRig(page);
    const frac = await longStraight(page);

    const onTrack = await drive(page, { ...SATURATED, frac });
    expect(onTrack.pulses, "positive control: on-track full lock must fire").toBeGreaterThan(0);

    // Parked past the road edge and steering FURTHER out (+x), so the car cannot
    // wander back on. hw + 2.5 clears the kerb band (hw - 0.6 … hw + 1.1), which
    // matters: a kerb is drivable and is explicitly NOT offroad.
    const beyond = await drive(page, {
      frac, steer: 1, speed: 45, ticks: 45, edgeStop: false,
      xAbs: onTrack.hw + 2.5,
    });
    expect(beyond.pulses, JSON.stringify(beyond)).toBe(0);
    // Silence is attributable to the offroad gate and nothing else: the car never
    // came back inside the kerb band, and the grass crawl floor (GRASS_V * 0.6)
    // keeps it far above the speed gate the whole way.
    expect(beyond.minOffset, "stayed clear of the kerb band").toBeGreaterThan(1.1);
    expect(beyond.minSpeed).toBeGreaterThan(SPEED_FLOOR);
  });

  test("repeats at a bounded rate, not once per frame", async ({ page }) => {
    await loadRig(page);
    const frac = await longStraight(page);
    const run = await drive(page, { ...SATURATED, frac });

    expect(run.pulses, JSON.stringify(run)).toBeGreaterThanOrEqual(3);

    // The hard bound, straight out of the cooldown: `uslipHapT` is set to at
    // least 0.10 s and loses dt per qualifying tick, so two pulses can never be
    // closer than six ticks. This one cannot drift with a physics retune.
    expect(run.minGap, JSON.stringify(run)).toBeGreaterThanOrEqual(MIN_GAP_TICKS);
    // The other end of the same expression, with a tick of slack for a momentary
    // dip back under the trigger threshold mid-slide.
    expect(run.maxGap, JSON.stringify(run)).toBeLessThanOrEqual(MAX_GAP_TICKS + 2);
    // And the shape of the claim, said the blunt way: a cue that fired every
    // frame would be noise, not information.
    expect(run.pulses).toBeLessThan(run.ticks / 4);
  });

  test("deeper saturation pulses more often than shallow saturation", async ({ page }) => {
    await loadRig(page);
    const frac = await longStraight(page);

    // PLAYER_GRIP scales the whole friction ellipse, so walking it down walks the
    // car from "the front is answering" through the trigger threshold and on into
    // a deep slide, with the front/rear balance untouched the whole way. The
    // sweep is dense near the expected onset so at least one level lands shallow.
    const grips = [2.6, 2.4, 2.2, 2.0, 1.9, 1.8, 1.7, 1.6, 1.4, 1.15, 0.9];
    const rows = [];
    for (const playerGrip of grips) {
      const r = await drive(page, { ...SATURATED, frac, playerGrip });
      rows.push({ playerGrip, pulses: r.pulses, medianGap: r.medianGap, ticks: r.ticks });
    }
    const dump = JSON.stringify(rows);

    // Two firing levels are needed to have an ordering at all. If the sweep only
    // ever lands deep, this fails loudly rather than passing on one data point.
    const firing = rows.filter((r) => r.pulses >= 3);
    expect(firing.length, `levels that fired ≥3 times — ${dump}`).toBeGreaterThanOrEqual(2);

    const shallowest = firing[0];                    // highest grip that still fires
    const deepest = firing[firing.length - 1];       // lowest grip swept

    // THE ORDERING THAT MAKES IT A CUE. The interval is 0.16 − 0.06·bite, so a
    // firmer slide must pulse tighter. Relative, not absolute: no threshold here
    // goes stale when the physics is retuned.
    expect(deepest.medianGap, `deep vs shallow — ${dump}`).toBeLessThan(shallowest.medianGap);

    // …and every level stays inside the band the cooldown expression allows.
    for (const r of firing) {
      expect(r.medianGap, `grip ${r.playerGrip} — ${dump}`).toBeGreaterThanOrEqual(MIN_GAP_TICKS);
      expect(r.medianGap, `grip ${r.playerGrip} — ${dump}`).toBeLessThanOrEqual(MAX_GAP_TICKS);
    }
  });

  /**
   * PACE-INVARIANCE, stated the way it actually holds.
   *
   * The obvious version — "the cue fires at the same fraction of vTop() at every
   * pace" — is NOT the invariant, and asserting it would pin a bug into place.
   * PACE is a ground-speed scale while LAT_MAX is deliberately absolute, so at
   * half pace the same corner is taken at half the speed and needs a quarter of
   * the lateral acceleration against unchanged grip. The car really is further
   * from the limit, the front really is not saturated, and a cue that fired
   * anyway would be lying. AGENTS.md says as much: absolute force constants are
   * "what makes low pace more forgiving".
   *
   * What must not move is the cue's RESPONSE once the front IS at a given point
   * in the grip envelope — `sat` is built from a slip angle and an m/s² grip
   * limit, with no speed term anywhere in it. So the state is constructed by
   * saturation depth rather than by speed: PLAYER_GRIP is cut to 0.5 and full
   * lock applied at the same fraction of each car's OWN top speed, which puts
   * the demanded lateral acceleration well past the (halved) limit at both pace
   * settings. Both cars are therefore pinned at the deep end of the envelope,
   * and the pulse rate must match.
   */
  test("at the same depth in the grip envelope, pace does not change the cue", async ({ page }) => {
    await loadRig(page);
    const frac = await longStraight(page);

    const deep = { frac, steer: 1, xInside: 1.2, speedFrac: 0.7, speed: 40, playerGrip: 0.5, ticks: 150 };
    const full = await drive(page, { ...deep, pace: 1.0 });
    const half = await drive(page, { ...deep, pace: 0.5 });
    const dump = JSON.stringify({ full, half });

    // Pace scaled the car's ground speed, and only that.
    expect(half.startSpeed, dump).toBeLessThan(full.startSpeed * 0.75);

    // Both are deep in the envelope, so both must speak — and at the same rate.
    expect(full.pulses, `full pace — ${dump}`).toBeGreaterThanOrEqual(3);
    expect(half.pulses, `half pace — ${dump}`).toBeGreaterThanOrEqual(3);
    expect(half.medianGap, `pulse gap — ${dump}`).toBe(full.medianGap);
    expect(half.minGap, dump).toBeGreaterThanOrEqual(MIN_GAP_TICKS);
    expect(full.minGap, dump).toBeGreaterThanOrEqual(MIN_GAP_TICKS);
  });
});
