/* Immutable inputs and column metadata only. Browser and VM execute their own
 * physics loops and compare against the browser-owned committed baseline. */
function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// Fixed scenarios. Each is a seed, a start state and a scripted input sequence.
// Kept small and varied rather than long: the point is to touch several regions
// of the model (steady state, cornering load, trail braking, off-track) so a
// change anywhere shows up, not to simulate a whole lap.
//
// The first four are the original gate and keep their 6-field rows, so their
// committed numbers never moved when the gate widened (2026-10-19, #2952 P2-11).
// The rest are `wide`: each row also carries yawRate, gear, aeroX and energy,
// and `ai` appends that AI car's [s, x, speed]. They reach regions the first
// four never touched — "steady corner load" at frac 0.28 sits on a straight
// (|k| < 3e-4), so nothing loaded a real right-hander; nothing pressed BOOST,
// opened X-mode, wetted the road, struck a kerb or drove an AI car. Optional
// fields: wx (weather chip, default "dry"), aero (X-mode requested), boost.
// Monza fracs, measured on the VM: 0.83 Parabolica (k ~ -0.012, right),
// 0.92 inside the main-straight activation zone, 0.368 Lesmo with kerb at
// x 8-9 m. Keep "wet" LAST: a wet chip must not reach a later dry scenario.
export const SCENARIOS = deepFreeze([
  { name: "straight-line accel", seed: 7, frac: 0.05, speed: 20,
    steps: [{ n: 120, in: { throttle: true, steer: 0 } }] },
  { name: "steady corner load", seed: 7, frac: 0.28, speed: 55,
    steps: [{ n: 90, in: { throttle: true, steer: 0.6 } }] },
  { name: "trail brake into rotation", seed: 11, frac: 0.28, speed: 70,
    steps: [{ n: 45, in: { brake: true, steer: 0.5 } }, { n: 45, in: { throttle: true, steer: 0.3 } }] },
  { name: "off-track recovery", seed: 3, frac: 0.5, speed: 45, x: 11,
    steps: [{ n: 90, in: { throttle: true, steer: -0.4 } }] },
  { name: "right-hand loaded corner", seed: 5, frac: 0.83, speed: 50, wide: true,
    steps: [{ n: 90, in: { throttle: true, steer: 0.75 } }] },
  { name: "boost and x-mode on the straight", seed: 9, frac: 0.92, speed: 60, wide: true, aero: true, boost: true,
    steps: [{ n: 120, in: { throttle: true, steer: 0 } }] },
  { name: "kerb strike", seed: 13, frac: 0.368, speed: 40, x: 8.5, wide: true,
    steps: [{ n: 90, in: { throttle: true, steer: 0.5 } }] },
  { name: "ai car launch", seed: 7, frac: 0.05, speed: 20, wide: true, ai: 1,
    steps: [{ n: 120, in: { throttle: true, steer: 0 } }] },
  { name: "wet right-hand corner", seed: 5, frac: 0.83, speed: 50, wide: true, wx: "wet",
    steps: [{ n: 90, in: { throttle: true, steer: 0.75 } }] },
]);

export const FIELDS = Object.freeze(["s", "x", "speed", "slipDeg", "head", "prog"]);
export const WIDE = Object.freeze(["yawRate", "gear", "aeroX", "energy"]);
export const AI = Object.freeze(["ai.s", "ai.x", "ai.speed"]);
export const fieldsOf = (s) => [...FIELDS, ...(s.wide ? WIDE : []), ...(s.ai != null ? AI : [])];
