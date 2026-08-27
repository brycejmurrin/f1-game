// @ts-check
// ACTIVE AERO (2026 X-mode / Z-mode) — the moveable-wing mode that trades
// downforce for drag. Distinct from BOOST (spends the battery) and OVERTAKE
// (a free, proximity-gated push): it spends CORNERING GRIP.
//
// What these tests pin down, in the order the mechanic actually works:
//   1. the state surfaces at all (__apex.aero / obs / physState / carAt)
//   2. it ARMS only where there is straight road ahead, and never in a corner
//   3. the flap TRAVELS, and closes faster than it opens
//   4. braking shuts it
//   5. it is worth something down a straight, and costs something in a corner
//   6. the AI uses it too
// Imports from ./fixtures.js, NOT from @playwright/test, so a failure attaches
// apex-state / apex-logs / page-console — a bare "expected 43 to be greater than
// 50" arrives with the car's state and the retained log ring beside it.
import { test, expect } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };

async function load(page, trackId = "monza") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 10_000 });
  await page.evaluate(() => {
    window.__apex.headless(true);
    window.__apex.go();
    window.__apex.jump(0.1, 60, 0);
  });
}

// Find a point on the loaded track to test from. X-mode is gated on fixed
// ACTIVATION ZONES now, so "straight" is not a curvature guess — it is a
// question with an authoritative answer, and the test asks the game for it
// rather than re-deriving it and hoping the two agree. "corner" is anywhere
// OUTSIDE every zone, which is what the mode being unavailable actually means.
async function fracWhere(page, pick) {
  return page.evaluate((p) => {
    const zones = window.__apex.aeroZones();
    if (!zones.length) throw new Error("track has no activation zones");
    // Everything here is in lap FRACTIONS, which is what jump() takes and the
    // only frame that is wrap-safe without knowing the lap length.
    if (p === "straight") {
      // Prefer the longest NON-wrapping zone. A wrap zone's midFrac can sit
      // metres from the exit (Monza's main straight midFrac ≈ 0.99 → T1), so a
      // short settle+steer window disarms mid-assert and reads aeroX as 0.
      const sorted = zones.slice().sort((a, b) => b.len - a.len);
      const z = sorted.find((q) => q.endFrac > q.startFrac) || sorted[0];
      return z.midFrac;
    }
    // "corner" = the middle of the longest stretch covered by NO zone. Built as
    // a coverage mask rather than by sorting gaps, because a zone may WRAP the
    // start line (Monza's main straight does, endFrac < startFrac) and every
    // interval-arithmetic shortcut gets that one backwards.
    const N = 2000, covered = new Array(N).fill(false);
    for (const z of zones) {
      const a = Math.floor(z.startFrac * N), b = Math.floor(z.endFrac * N);
      if (b >= a) { for (let i = a; i <= b && i < N; i++) covered[i] = true; }
      else { for (let i = a; i < N; i++) covered[i] = true;
             for (let i = 0; i <= b; i++) covered[i] = true; }
    }
    let bestStart = 0, bestLen = 0, curStart = -1, cur = 0;
    for (let i = 0; i < N * 2; i++) {          // twice round, so a run can wrap
      if (!covered[i % N]) {
        if (cur === 0) curStart = i;
        cur++;
        if (cur > bestLen && cur <= N) { bestLen = cur; bestStart = curStart; }
      } else cur = 0;
    }
    if (!bestLen) throw new Error("every metre of this circuit is an aero zone");
    return ((bestStart + bestLen / 2) % N) / N;
  }, pick);
}

test.describe("active aero — state surface", () => {
  test.use({ viewport: LANDSCAPE });

  test("aero() reports mode, flap travel, request and arming", async ({ page }) => {
    await load(page);
    const a = await page.evaluate(() => window.__apex.aero());
    expect(typeof a.aeroX).toBe("number");
    expect(typeof a.xOn).toBe("boolean");
    expect(typeof a.xArmed).toBe("boolean");
    expect(["X", "Z"]).toContain(a.mode);
  });

  test("the car starts in Z-mode with the flaps shut", async ({ page }) => {
    await load(page);
    const a = await page.evaluate(() => window.__apex.aero());
    expect(a.aeroX).toBe(0);
    expect(a.xOn).toBe(false);
    expect(a.mode).toBe("Z");
  });

  test("obs(), physState() and carAt() all expose the flap travel", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => ({
      obs: window.__apex.obs(),
      phys: window.__apex.physState(),
      car0: window.__apex.carAt(0),
    }));
    for (const src of [r.obs, r.phys, r.car0]) {
      expect(typeof src.aeroX).toBe("number");
      expect(typeof src.xOn).toBe("boolean");
      expect(typeof src.xArmed).toBe("boolean");
    }
  });

  test("aero() returns null with no player on track", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
    expect(await page.evaluate(() => window.__apex.aero())).toBeNull();
  });
});

test.describe("active aero — arming", () => {
  test.use({ viewport: LANDSCAPE });

  test("arms on a straight and the flap opens", async ({ page }) => {
    await load(page);
    const frac = await fracWhere(page, "straight");
    const r = await page.evaluate(async (f) => {
      window.__apex.jump(f, 60, 0);
      window.__apex.step(1 / 60, 2);
      const armed = window.__apex.aero().xArmed;
      window.__apex.aero(true);
      window.__apex.act({ throttle: true }, 1 / 60, 60);   // ~1 s
      return { armed, after: window.__apex.aero() };
    }, frac);
    expect(r.armed).toBe(true);
    expect(r.after.aeroX).toBeGreaterThan(0.9);
    expect(r.after.mode).toBe("X");
  });

  test("does NOT arm in the tightest corner, and asking for X-mode there does nothing", async ({ page }) => {
    await load(page);
    const frac = await fracWhere(page, "corner");
    const r = await page.evaluate(async (f) => {
      window.__apex.jump(f, 30, 0);
      window.__apex.step(1 / 60, 2);
      window.__apex.aero(true);
      window.__apex.act({ throttle: true }, 1 / 60, 30);
      return window.__apex.aero();
    }, frac);
    expect(r.xArmed).toBe(false);
    expect(r.aeroX).toBe(0);
    expect(r.mode).toBe("Z");
  });

  test("un-arming drops the request, so the flap does not spring back open", async ({ page }) => {
    await load(page);
    const straight = await fracWhere(page, "straight");
    const corner = await fracWhere(page, "corner");
    const r = await page.evaluate(async (f) => {
      window.__apex.jump(f.straight, 60, 0);
      window.__apex.step(1 / 60, 2);
      window.__apex.aero(true);
      window.__apex.act({ throttle: true }, 1 / 60, 60);
      const open = window.__apex.aero();
      // teleport into the corner: the arming window is gone
      window.__apex.jump(f.corner, 30, 0);
      window.__apex.act({ throttle: true }, 1 / 60, 30);
      return { open, closed: window.__apex.aero() };
    }, { straight, corner });
    expect(r.open.aeroX).toBeGreaterThan(0.9);
    expect(r.closed.aeroX).toBe(0);
    expect(r.closed.xOn).toBe(false);
  });
});

test.describe("active aero — flap travel", () => {
  test.use({ viewport: LANDSCAPE });

  test("the flap takes time to open — it is not a step change", async ({ page }) => {
    await load(page);
    const frac = await fracWhere(page, "straight");
    const seq = await page.evaluate(async (f) => {
      window.__apex.jump(f, 60, 0);
      window.__apex.step(1 / 60, 2);
      window.__apex.aero(true);
      const out = [];
      for (let i = 0; i < 6; i++) {
        window.__apex.act({ throttle: true }, 1 / 60, 3);
        out.push(window.__apex.aero().aeroX);
      }
      return out;
    }, frac);
    expect(seq[0]).toBeGreaterThan(0);
    expect(seq[0]).toBeLessThan(1);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]);
    expect(seq[seq.length - 1]).toBeGreaterThan(seq[0]);
  });

  test("braking slams it shut, and faster than it opened", async ({ page }) => {
    await load(page);
    const frac = await fracWhere(page, "straight");
    const r = await page.evaluate(async (f) => {
      window.__apex.jump(f, 60, 0);
      window.__apex.step(1 / 60, 2);
      window.__apex.aero(true);
      // open over ~6 ticks and record how far it got
      window.__apex.act({ throttle: true }, 1 / 60, 6);
      const openedIn6 = window.__apex.aero().aeroX;
      window.__apex.act({ throttle: true }, 1 / 60, 60);
      const full = window.__apex.aero().aeroX;
      // now brake for the same 6 ticks
      window.__apex.act({ brake: true }, 1 / 60, 6);
      const afterBrake6 = window.__apex.aero().aeroX;
      return { openedIn6, full, afterBrake6 };
    }, frac);
    expect(r.full).toBeGreaterThan(0.9);
    // 6 ticks of braking removes more travel than 6 ticks of opening added
    expect(r.full - r.afterBrake6).toBeGreaterThan(r.openedIn6);
    expect(r.afterBrake6).toBeLessThan(0.7);
  });
});

test.describe("active aero — the trade", () => {
  test.use({ viewport: LANDSCAPE });

  test("X-mode reaches a higher top speed down the same straight", async ({ page }) => {
    await load(page);
    const frac = await fracWhere(page, "straight");
    const r = await page.evaluate(async (f) => {
      const run = (x) => {
        window.__apex.reset(f, 55, 0);
        window.__apex.step(1 / 60, 2);
        window.__apex.aero(x);
        window.__apex.act({ throttle: true }, 1 / 60, 240);   // 4 s flat out
        return window.__apex.obs().speed;
      };
      const z = run(false);
      const xm = run(true);
      return { z, xm };
    }, frac);
    expect(r.xm).toBeGreaterThan(r.z);
  });

  test("X-mode costs aero grip: the same input turns the car less", async ({ page }) => {
    await load(page);
    const frac = await fracWhere(page, "straight");
    // Identical speed, identical steering input, flap shut vs flap open. Aero
    // load is what is different, so the low-drag car must generate less lateral
    // acceleration: it sweeps less heading and moves less across the road.
    // Kept short (0.42 s) so both runs stay on the tarmac — a barrier clamp
    // would pin `x` and make the two runs look identical.
    const r = await page.evaluate((f) => {
      const run = (x) => {
        window.__apex.reset(f, 65, 0);
        window.__apex.step(1 / 60, 2);
        window.__apex.aero(x);
        window.__apex.act({ throttle: true }, 1 / 60, 60);   // let the flap settle
        // Flap AFTER settle, BEFORE steer. Leaving the arming window (or a
        // speed drop under X_MIN_SPEED) snaps aeroX shut — reading it after
        // the steer measures disarm, not the trade under test.
        const flap = window.__apex.aero().aeroX;
        const before = window.__apex.obs();
        window.__apex.act({ steer: 1, throttle: true }, 1 / 60, 25);
        const after = window.__apex.obs();
        let dh = after.head - before.head;
        while (dh > Math.PI) dh -= 2 * Math.PI;
        while (dh < -Math.PI) dh += 2 * Math.PI;
        return { dHead: Math.abs(dh), dx: Math.abs(after.x - before.x), flap };
      };
      return { z: run(false), x: run(true) };
    }, frac);
    // the runs are only comparable if the flap really was where we asked
    expect(r.z.flap).toBe(0);
    expect(r.x.flap).toBeGreaterThan(0.9);
    expect(r.x.dHead).toBeLessThan(r.z.dHead);
    expect(r.x.dx).toBeLessThan(r.z.dx);
  });
});

test.describe("active aero — the field", () => {
  test.use({ viewport: LANDSCAPE });

  test("AI cars run X-mode too", async ({ page }) => {
    await load(page);
    const frac = await fracWhere(page, "straight");
    const any = await page.evaluate(async (f) => {
      // put the whole field on the straight, then let it run
      const n = window.__apex.cars().length;
      for (let i = 1; i < n; i++) window.__apex.aiPlace(i, f + i * 0.004, 60, 0);
      window.__apex.step(1 / 60, 90);
      return window.__apex.cars().some((c) => !c.p && c.ax > 0.5);
    }, frac);
    expect(any).toBe(true);
  });

  test("the agent world view reports the aero block and the affordance", async ({ page }) => {
    await load(page);
    const w = await page.evaluate(() => window.__apex.world({ detail: "full" }));
    expect(w.ego.aero).toBeTruthy();
    expect(["X", "Z"]).toContain(w.ego.aero.mode);
    expect(typeof w.ego.aero.armed).toBe("boolean");
    const ids = [...(w.affordances || []), ...(w.unavailable || [])].map((a) => a.id);
    expect(ids).toContain("active_aero_x_mode");
  });
});
