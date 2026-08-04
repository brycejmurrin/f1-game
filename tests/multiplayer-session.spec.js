// @ts-check
// The GAME side of multiplayer: what a session does to the grid.
//
// The far end of the connection is an in-page loopback endpoint, not a second
// browser — __apex.netLoopback() starts a session against it, and
// netPeerSend()/netPeerClose() drive it. So a test can post a rival at an exact
// position, or drop the connection outright, and assert what the game does.
// No signalling, no second page, no network.
//
// Everything runs on a VIRTUAL clock the test owns: netTick(t) pumps the
// session and step() pumps physics. Nothing here waits on requestAnimationFrame.
// That is not only about speed — an assertion like "the rival did not move" is
// worthless if the simulation was not running at all, and under rAF those two
// outcomes are indistinguishable. Driving both clocks by hand makes latency,
// loss and interpolation reproducible, exactly as the physics specs drive step().
//
// The invariant being protected throughout is the authority rule: each peer
// owns its own car. A rival is posed from replicated state and must NOT also be
// simulated locally, or the two fight every frame — the same contract the
// incident sim already has with updateCar().
import { test, expect } from "./fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };

async function race(page, trackId = "monza") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 15_000 });
  await page.evaluate(() => {
    const A = window.__apex;
    A.headless(true);          // no rendering; we pump the sim ourselves
    // reset() puts the sim in state "race". jump() alone leaves it in the
    // countdown, where nothing moves and every "did it move?" assertion below
    // would pass for entirely the wrong reason.
    A.reset(0.05, 40, 0, 1);
  });
}

test.describe("multiplayer session", () => {
  test.use({ viewport: LANDSCAPE });

  test("solo racing reports no session at all", async ({ page }) => {
    await race(page);
    expect((await page.evaluate(() => window.__apex.net())).active).toBe(false);
  });

  test("starting a session promotes a rival to a second human driver", async ({ page }) => {
    await race(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      const started = A.netLoopback({ nowMs: 1000, latencyMs: 0, interpDelayMs: 0 });
      const roles = A.carRoles();
      return { started, humans: roles.filter((r) => r.human), locals: roles.filter((r) => r.local) };
    });

    expect(out.started.ok).toBe(true);
    // Two humans on track, but still exactly one of them is mine.
    expect(out.humans).toHaveLength(2);
    expect(out.locals).toHaveLength(1);
    const remote = out.humans.find((h) => !h.local);
    expect(remote.id).toBe(out.started.remoteId);
    expect(out.started.localId).not.toBe(out.started.remoteId);
  });

  test("a rival is posed from packets, not simulated locally", async ({ page }) => {
    // The authority rule, made observable: with the session live but NOTHING
    // arriving, the rival must not move — while an identically-placed AI car,
    // stepped the same amount, does. Without that control the assertion would
    // hold trivially if the simulation were simply stopped.
    await race(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      const s = A.netLoopback({ nowMs: 1000, latencyMs: 0, interpDelayMs: 0 });
      const control = A.carRoles().find((r) => !r.human && r.id !== s.remoteId).id;

      A.aiPlace(s.remoteId, 0.30, 30, 0);
      A.aiPlace(control, 0.35, 30, 0);
      const rival0 = A.carAt(s.remoteId).s, ctrl0 = A.carAt(control).s;

      let T = 1000;
      for (let i = 0; i < 60; i++) { T += 16; A.step(1 / 60, 1); A.netTick(T); }

      return {
        state: A.info().state,
        rivalMoved: Math.abs(A.carAt(s.remoteId).s - rival0),
        controlMoved: Math.abs(A.carAt(control).s - ctrl0),
        net: A.net(),
      };
    });

    expect(out.state).toBe("race");
    expect(out.net.active).toBe(true);
    // The control car proves the simulation really was running.
    expect(out.controlMoved).toBeGreaterThan(5);
    // The rival, owned by the network and sent nothing, did not budge.
    expect(out.rivalMoved).toBeLessThan(0.01);
  });

  test("a packet moves the rival to where its owner says it is", async ({ page }) => {
    await race(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      const s = A.netLoopback({ nowMs: 1000, latencyMs: 0, interpDelayMs: 0 });
      const s0 = A.info().total * 0.42;

      A.netPeerSend({ s: s0, x: 2.5, head: 0.2, speed: 0, gear: 5, lap: 1 }, 1000);
      A.netTick(1010);           // deliver + pose

      const car = A.carAt(s.remoteId);
      return { s0, s: car.s, x: car.x, lap: car.lap, buffered: A.net().buffered };
    });

    expect(out.buffered).toBe(1);
    // Quantisation is 1 cm; anything larger means the pose did not land.
    expect(Math.abs(out.s - out.s0)).toBeLessThan(0.05);
    expect(Math.abs(out.x - 2.5)).toBeLessThan(0.05);
    expect(out.lap).toBe(1);
  });

  test("a rival's world position is rebuilt from its road position", async ({ page }) => {
    // A rival is authoritative in ROAD coordinates — the opposite of the local
    // car, whose world position is authoritative and whose (s, x) is read back
    // off it. Both are right for the same reason: authority follows whoever is
    // actually integrating the physics.
    await race(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      const s = A.netLoopback({ nowMs: 1000, latencyMs: 0, interpDelayMs: 0 });
      A.netPeerSend({ s: A.info().total * 0.6, x: -3, head: 1.0, speed: 0 }, 1000);
      A.netTick(1010);
      return { role: A.carRoles()[s.remoteId], car: A.carAt(s.remoteId) };
    });
    expect(out.role.hasPose).toBe(true);
    expect(Math.abs(out.car.x + 3)).toBeLessThan(0.05);
  });

  test("a rival with speed coasts along the road between packets", async ({ page }) => {
    // Extrapolation follows s, so a rival that goes quiet keeps moving ALONG
    // THE TRACK rather than drifting off it in a straight line.
    await race(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      const s = A.netLoopback({ nowMs: 1000, latencyMs: 0, interpDelayMs: 0 });
      const s0 = A.info().total * 0.5;
      A.netPeerSend({ s: s0, x: 0, speed: 50, lap: 0 }, 1000);
      A.netTick(1000);
      const at0 = A.carAt(s.remoteId).s;
      A.netTick(1100);                   // 100 ms of silence at 50 m/s
      const at100 = A.carAt(s.remoteId).s;
      return { s0, at0, at100 };
    });
    expect(Math.abs(out.at0 - out.s0)).toBeLessThan(0.05);
    expect(out.at100 - out.at0).toBeGreaterThan(4);    // ~5 m
    expect(out.at100 - out.at0).toBeLessThan(6);
  });

  test("when the rival drops, their car is handed back to the AI", async ({ page }) => {
    // A driverless car parked on the circuit is worse than an AI one. The AI
    // path already exists, so handing back is just clearing the role flags.
    await race(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      const s = A.netLoopback({ nowMs: 1000, latencyMs: 0, interpDelayMs: 0 });
      A.aiPlace(s.remoteId, 0.30, 30, 0);
      const during = A.carRoles()[s.remoteId];

      A.netPeerClose();
      A.netTick(1010);
      const after = A.carRoles()[s.remoteId];
      const netAfter = A.net();

      // ...and it must actually start driving again.
      const s0 = A.carAt(s.remoteId).s;
      let T = 1010;
      for (let i = 0; i < 60; i++) { T += 16; A.step(1 / 60, 1); A.netTick(T); }
      return { during, after, netAfter, moved: Math.abs(A.carAt(s.remoteId).s - s0) };
    });

    expect(out.during.human).toBe(true);
    expect(out.during.local).toBe(false);
    expect(out.after.human).toBe(false);
    expect(out.netAfter.active).toBe(false);
    expect(out.moved).toBeGreaterThan(5);
  });

  test("a session survives a lossy link", async ({ page }) => {
    // The state channel drops packets by design. A rival must keep tracking on
    // the ones that get through rather than freezing on the first gap.
    await race(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      const s = A.netLoopback({ nowMs: 1000, latencyMs: 20, loss: 0.5, interpDelayMs: 50 });
      const total = A.info().total;
      let T = 1000;
      const first = total * 0.20;
      for (let i = 0; i < 40; i++) {
        A.netPeerSend({ s: total * (0.20 + i * 0.002), x: 0, speed: 0 }, T);
        T += 25;
        A.netTick(T);
      }
      return { first, last: A.carAt(s.remoteId).s, active: A.net().active, total };
    });

    expect(out.active).toBe(true);
    // Half the packets never arrived, but it should still have tracked most of
    // the ~0.078 of a lap that was sent.
    expect(out.last).toBeGreaterThan(out.first + out.total * 0.04);
  });

  test("both grids are released at the same moment, not the same delay", async ({ page }) => {
    // Without this the two sides count down on their own clocks and are
    // released however far apart the handshake happened to take. netStart
    // names an absolute instant instead, so lights-out is a shared event.
    await race(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      A.netLoopback({ nowMs: 1000, latencyMs: 0, interpDelayMs: 0 });
      const armed = A.netStartArm(1000, 4000, 0.5);   // lights-out at t=4000
      // netTick() only pumps the SESSION; the countdown itself lives in
      // update(), so the sim has to be stepped for the clock to be read.
      const at = (t) => { A.netTick(t); A.step(1 / 60, 1); return A.info().state; };
      const early = at(2000);     // well before: still counting down
      const late = at(4200);      // past the named instant: released
      return { armed, early, late, cleared: A.net().startPending };
    });

    expect(out.armed.ok).toBe(true);
    expect(out.early).toBe("count");
    expect(out.late).toBe("race");
    // Consumed, so a second race cannot inherit a stale start time.
    expect(out.cleared).toBe(false);
  });

  test("a lap time reaches the rival over the reliable channel", async ({ page }) => {
    // Lap times decide the RESULT, so they cannot ride the lossy channel.
    await race(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      A.netLoopback({ nowMs: 1000, latencyMs: 20, loss: 0.9, interpDelayMs: 0 });
      A.netPeerEvent("lap", { lap: 1, time: 81.23, code: "XYZ" }, 1000);
      A.netPeerEvent("lap", { lap: 2, time: 80.11, code: "XYZ" }, 1020);
      for (let t = 1040; t <= 1400; t += 20) A.netTick(t);
      return { laps: A.netPeerLaps(), count: A.net().peerLaps };
    });
    // 90% loss on the STATE channel must not touch these.
    expect(out.count).toBe(2);
    expect(out.laps[0].time).toBeCloseTo(81.23, 2);
    expect(out.laps[1].lap).toBe(2);
  });

  test("the guest adopts the host's classification, not its own", async ({ page }) => {
    // Both peers can see both human cars, but only the host sees every AI
    // finish first-hand — and two independently-sorted orders disagree exactly
    // when it matters, in a close finish.
    await race(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      A.netLoopback({ nowMs: 1000, latencyMs: 0, interpDelayMs: 0, role: "guest" });
      const n = A.carRoles().length;
      // A verdict that REVERSES the natural order, so adopting it is visible.
      const verdict = [];
      for (let i = n - 1; i >= 0; i--) verdict.push({ i, t: 100 + (n - i), p: 0, lap: 3 });
      A.netPeerEvent("result", verdict, 1000);
      for (let t = 1020; t <= 1200; t += 20) A.netTick(t);

      const wantWinner = A.carAt(n - 1).code;

      A.setLap(3);
      A.finishRace();
      // The RESULTS SCREEN is the consumer of the classification — fieldState()
      // deliberately sorts by progress, not by finishing position, so it would
      // not show whether the verdict was adopted at all.
      const rows = Array.from(document.querySelectorAll("#results .res-row"))
        .map((r) => (r.querySelector(".res-name") || {}).textContent || "");
      return { rows, wantWinner, got: A.net().peerResult, n };
    });
    expect(out.got).toBe(true);
    expect(out.rows.length).toBeGreaterThan(1);
    // The host said the LAST grid slot finished first; the guest must agree.
    expect(out.rows[0]).toContain(out.wantWinner);
  });

  test("the guest flies the host's flags rather than deciding its own", async ({ page }) => {
    // Debris is generated locally and is NOT replicated, so two peers really do
    // see different hazards. Left to decide independently they would fly
    // different flags for the same race.
    await race(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      A.netLoopback({ nowMs: 1000, latencyMs: 0, interpDelayMs: 0, role: "guest" });
      const before = A.caution().level;
      A.netPeerEvent("caution", { level: 2, sector: 1, frac: 0.4, cause: "VSC", total: 7 }, 1000);
      for (let t = 1020; t <= 1200; t += 20) A.netTick(t);
      const after = A.caution();
      return { before, after };
    });
    expect(out.after).toBeTruthy();
    expect(out.after.level).toBe(2);
    expect(out.after.cause).toBe("VSC");
  });

  test("contact with a rival pushes MY car, and never theirs", async ({ page }) => {
    // The ownership rule under contact. A rival is posed from the wire and
    // re-posed on the next packet, so any separation impulse we apply to it is
    // thrown away a frame later. If the push were split 50/50 the pair would
    // stay overlapping frame after frame; the car we own has to absorb all of
    // it. This asserts both halves: mine moves, theirs does not.
    await race(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      const s = A.netLoopback({ nowMs: 1000, latencyMs: 0, interpDelayMs: 0 });
      const me = s.localId;

      // Park the rival square on top of the local car: same arc position, a
      // lateral offset well inside the ~2 m car width.
      const meCar = A.carAt(me);
      A.netPeerSend({ s: meCar.s, x: meCar.x + 0.6, head: meCar.head || 0, speed: 0 }, 1000);
      A.netTick(1010);

      const rival0 = A.carAt(s.remoteId), mine0 = A.carAt(me);
      const gap0 = Math.abs(mine0.x - rival0.x);

      // Resolve contact WITHOUT another packet arriving, so any movement of
      // the rival could only have come from our own collision pass.
      let T = 1010;
      for (let i = 0; i < 20; i++) { T += 16; A.step(1 / 60, 1); A.netTick(T); }

      const rival1 = A.carAt(s.remoteId), mine1 = A.carAt(me);
      return {
        gap0, gap1: Math.abs(mine1.x - rival1.x),
        rivalMoved: Math.abs(rival1.x - rival0.x),
        myMove: Math.abs(mine1.x - mine0.x),
      };
    });

    expect(out.gap0).toBeLessThan(1.2);                 // genuinely overlapped
    // The rival is immovable locally — its owner decides where it goes.
    expect(out.rivalMoved).toBeLessThan(0.001);
    // ...so the whole separation lands on my car, and they come apart.
    expect(out.myMove).toBeGreaterThan(0.05);
    expect(out.gap1).toBeGreaterThan(out.gap0);
  });

  test("the local car is still driven locally, with no correction", async ({ page }) => {
    // Multiplayer must not touch the car the player is actually steering: same
    // seed, same inputs, same trajectory whether or not a session is running.
    await race(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      A.headless(true);

      A.reset(0.05, 55, 0, 11);
      A.act({ steer: 0.3, throttle: true }, 1 / 60, 120);
      const solo = A.obs();
      A.clearInput();

      A.netLoopback({ nowMs: 1000, latencyMs: 0, interpDelayMs: 0 });
      A.reset(0.05, 55, 0, 11);
      A.act({ steer: 0.3, throttle: true }, 1 / 60, 120);
      const networked = A.obs();
      A.clearInput();
      A.netStop();

      return { solo, networked };
    });

    expect(out.networked.speedKph).toBeCloseTo(out.solo.speedKph, 3);
    expect(out.networked.x).toBeCloseTo(out.solo.x, 3);
  });
});
