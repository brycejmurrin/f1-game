// @ts-check
// skid-probe — WHY DOES `GLX.__tlx.fxState().skidVerts` STAY ZERO?
//
// tests/specs/tlx-probes.spec.js "M6 skid batch records after a hard driven stint"
// has never passed. Four mechanisms have already been proposed and disproved:
// act() hangs (measured 309 ms), a slow ~30 s prediction, arithmetic in an
// un-timeouted evaluate, and rAF starvation of the wait (the `polling: 100`
// fix landed and the test still failed at 360 s). Every one of those was a
// theory about the WAIT. None of them asked the only question that decides the
// case: does the value the test waits for ever have a chance to become
// non-zero?
//
// The pipeline has four links and the failure is in exactly one of them:
//
//   1. the car slips           js/game.js:6064  skids.stamp(mat, skid > 0.25 ||
//                              c.offroad, and c.speed > 10) — no slip, no mark
//   2. marks accumulate        js/game/skidmarks.js  `active` counts them
//   3. the batch is drawn      skidmarks.js:87  draw() -> gfx.drawSkidBatch(...)
//                              BUT drawSkidBatch returns early when
//                              `!(vertCount > 0)` — with zero marks it is a
//                              no-op that still returns true
//   4. the probe latches it    tlx.js:1032 sets _fxFrame.skidVerts, and
//                              tlx.js:1151 copies _fxFrame -> _fxLast at the
//                              END of a presented frame. fxState() reads
//                              _fxLast, so a frame that never presents never
//                              publishes.
//
// Link 3 is the one no assertion can see from outside: "called with 0" and
// "never called at all" both leave `skidVerts` at 0, and they have opposite
// fixes. So this probe WRAPS `GLX.drawSkidBatch` before driving and records
// every call — count, argument, and the max vertCount ever offered. That single
// number splits the four links into two halves in one run.
//
// Bounded on purpose. Every wait passes `polling`, the sampling loop runs
// test-side with explicit small waits rather than inside one long evaluate, and
// the whole thing is capped — because the reason this failure survived four
// investigations is that unbounded waits kept reporting the budget instead of
// the fault. Console output is the result; the assertions only check that data
// was produced, so a probe that finds nothing cannot read as "nothing wrong".
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.tlxForceGL", "1");
    } catch (_) {}
  });
});

test("where does the M6 skid pipeline stop?", async ({ page }) => {
  test.setTimeout(300_000);
  const t0 = Date.now();
  const mark = (label) => console.log(`[${String(Date.now() - t0).padStart(7)} ms] ${label}`);

  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { polling: 100, timeout: 30_000 });
  mark("__apex present");

  await page.evaluate(() => window.__apex.race("monza"));
  await page.waitForFunction(() => window.__apex.info().track != null,
    { polling: 100, timeout: 60_000 });
  mark("monza built");

  // LINK 3'S INSTRUMENT. Wrap before driving so the very first frame after the
  // stint is recorded. Records the argument as offered, not as interpreted.
  await page.evaluate(() => {
    const w = /** @type {any} */ (window);
    w.__skidLog = { calls: 0, zeroCalls: 0, maxVerts: 0, lastDirty: null, firstNonZeroCall: -1 };
    const inner = GLX.drawSkidBatch;
    GLX.drawSkidBatch = function (verts, vertCount, dirty) {
      const L = w.__skidLog;
      L.calls++;
      L.lastDirty = dirty;
      if (!(vertCount > 0)) L.zeroCalls++;
      else if (L.firstNonZeroCall < 0) L.firstNonZeroCall = L.calls;
      if (vertCount > L.maxVerts) L.maxVerts = vertCount;
      return inner.apply(this, arguments);
    };
  });
  mark("drawSkidBatch wrapped");

  // Exactly the M6 stint. `jump(0.1, 70)` — two args, as M6 writes it: jump
  // only writes lateral when the third argument is passed, so a three-arg
  // version is a DIFFERENT experiment (a probe that used one cleared act()
  // under a car that was never in the same place).
  const drive = await page.evaluate(() => {
    const t = performance.now();
    window.__apex.jump(0.1, 70);
    window.__apex.act({ steer: 1, throttle: true }, 1 / 60, 120);
    return { ms: performance.now() - t, after: window.__apex.physState() };
  });
  mark(`stint done in ${drive.ms.toFixed(0)} ms`);
  console.log("physState after the stint:", JSON.stringify(drive.after, null, 2));

  await page.evaluate(() => window.__apex.freeze(true));

  // Sample test-side, not in one long evaluate: each read is its own bounded
  // round trip, so a stalled page shows up as a short log rather than as the
  // test budget.
  const samples = [];
  for (let i = 0; i < 20; i++) {
    const s = await page.evaluate(() => ({
      fx: GLX.__tlx.fxState(),
      log: /** @type {any} */ (window).__skidLog,
    }));
    samples.push(s);
    if (i === 0 || i === 19 || s.fx.skidVerts > 0)
      console.log(`sample ${i}: skidVerts=${s.fx.skidVerts} marks=${s.fx.marks} ` +
        `calls=${s.log.calls} zeroCalls=${s.log.zeroCalls} maxVerts=${s.log.maxVerts} ` +
        `firstNonZeroCall=${s.log.firstNonZeroCall}`);
    if (s.fx.skidVerts > 0) break;
    await page.waitForTimeout(250);
  }
  mark("sampling done");

  const last = samples[samples.length - 1];
  console.log("VERDICT INPUT:", JSON.stringify(last, null, 2));
  // The reading, in the terms of the four links:
  //   calls === 0                     -> link 1 or 2: draw() never reached
  //   calls > 0 && maxVerts === 0     -> link 1 or 2: no marks were ever laid
  //   maxVerts > 0 && skidVerts === 0 -> link 4: the frame never presents
  //   skidVerts > 0                   -> the pipeline works; M6's WAIT is wrong
  console.log(
    last.log.calls === 0 ? "VERDICT: drawSkidBatch was NEVER CALLED (links 1-3)"
    : last.log.maxVerts === 0 ? "VERDICT: called, always with vertCount 0 — NO MARKS LAID (links 1-2)"
    : last.fx.skidVerts === 0 ? "VERDICT: marks exist but fxState never publishes them (link 4)"
    : "VERDICT: the pipeline works — M6's failure is in its wait, not the renderer");

  // A probe that returns nothing must not read as a pass.
  expect(samples.length).toBeGreaterThan(0);
  expect(last.log, "the wrapper survived the run").toBeTruthy();
});

test("is there a step window where the stamp condition actually holds?", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { polling: 100, timeout: 30_000 });
  await page.evaluate(() => window.__apex.race("monza"));
  await page.waitForFunction(() => window.__apex.info().track != null,
    { polling: 100, timeout: 60_000 });

  // js/game.js:6064 lays a mark when `(skidIntensity > 0.25 || offroad) &&
  // speed > 10`. skidIntensity is clamp((slipAng - 0.10) / 0.20, 0, 1) with
  // slipAng in radians (js/game.js:4082), so > 0.25 means slipAng > 0.15 rad =
  // 8.59 deg — a number physState() already reports as `slipDeg`. Walk the
  // stint ONE step at a time and print the window, if there is one.
  //
  // ABS, NOT >. slipAng at js/game.js:4081 is Math.abs(atan2(vLat, ...)) and
  // `slipDeg` is SIGNED — steering right makes it negative. The first version
  // of this probe compared `slipDeg > 8.59` and reported "0 of 120 steps",
  // i.e. that no window exists, while the printed rows underneath it showed
  // -11.73. A probe answering the wrong question confidently is worse than no
  // probe: that reading would have been the fifth wrong mechanism.
  const rows = await page.evaluate(() => {
    window.__apex.jump(0.1, 70);
    const out = [];
    for (let i = 0; i < 120; i++) {
      window.__apex.act({ steer: 1, throttle: true }, 1 / 60, 1);
      const p = window.__apex.physState();
      out.push({
        i, speed: +p.speed.toFixed(2), slipDeg: +p.slipDeg.toFixed(2),
        x: +p.x.toFixed(1), rescueT: +p.rescueT.toFixed(2),
        stamps: Math.abs(p.slipDeg) > 8.59 && p.speed > 10,
      });
    }
    return out;
  });

  const stamping = rows.filter((r) => r.stamps);
  console.log(`steps where a mark WOULD be laid: ${stamping.length} of ${rows.length}`);
  if (stamping.length)
    console.log(`window: steps ${stamping[0].i}..${stamping[stamping.length - 1].i}`);
  for (const r of rows)
    if (r.i % 5 === 0 || r.stamps)
      console.log(`  step ${String(r.i).padStart(3)}  speed ${String(r.speed).padStart(6)}  ` +
        `slipDeg ${String(r.slipDeg).padStart(6)}  x ${String(r.x).padStart(6)}  ` +
        `rescueT ${String(r.rescueT).padStart(5)}  ${r.stamps ? "<-- STAMPS" : ""}`);

  expect(rows).toHaveLength(120);
});
