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
//
// ONE BOOT PER WORKER (sharedTest): nineteen boots became none. race() walks
// the shared page back to the title — which stops the previous test's loopback
// session (quitToMenu calls netPlay.stop; netStop() drops the fake peer too) —
// pins the default car (McLaren seat 0: the loopback peers below sit in Red
// Bull and Ferrari seats, and the seat rule would move a colliding local car),
// and races. UNVERIFIED IN A BROWSER at conversion time.
import { sharedTest as test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { toMenu, pinFreePlay } from "../helpers/shared-page.js";

const LANDSCAPE = { width: 844, height: 390 };

async function race(page, trackId = "monza") {
  await toMenu(page);
  await page.evaluate(() => window.__apex.netStop());
  await pinFreePlay(page, { race: [trackId] });
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
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
      // SEEDED: without `seed` the loss pattern is Math.random, and this spec
      // then fails a few runs in a hundred for a reason that has nothing to do
      // with tracking — the clock handshake happens to lose both legs of every
      // round trip. Ping/pong ride the same lossy channel as the snapshots.
      const s = A.netLoopback({ nowMs: 1000, latencyMs: 20, loss: 0.5, interpDelayMs: 50, seed: 7 });
      const total = A.info().total;
      let T = 1000;
      // Let the clock land before measuring TRACKING, which is what this test
      // is about. A real session pumps from the moment it connects and races
      // seconds later; asserting on packets sent while synced() is still false
      // measures the handshake instead.
      // 4 s of virtual warm-up: measured offline over 500 seeded links at 50%
      // loss, 1 s syncs 473 and 4 s syncs 500 of 500. Virtual time, so this
      // costs nothing but loop iterations.
      while (T < 5000 && !A.net().net.synced) { T += 25; A.netTick(T); }
      const synced = A.net().net.synced;
      const first = total * 0.20;
      for (let i = 0; i < 40; i++) {
        A.netPeerSend({ s: total * (0.20 + i * 0.002), x: 0, speed: 0 }, T);
        T += 25;
        A.netTick(T);
      }
      return { first, synced, last: A.carAt(s.remoteId).s, active: A.net().active, total };
    });

    expect(out.active).toBe(true);
    expect(out.synced).toBe(true);
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

  test("a peer that arrives late still sees the lights, not just the green", async ({ page }) => {
    // Reported from a desktop-hosts / iPhone-joins race: the host saw the
    // lights go out and the guest saw nothing at all.
    //
    // The guest arms only when it PUMPS the start event, and pump() rides the
    // game loop — which is blocked solid building the circuit. On a phone that
    // build outlasts the host's lead, so the named instant is already in the
    // past on arrival and countT begins part-way through (or past the end of)
    // the sequence. The gantry then lit only the newest lamp, so every lamp
    // before it stayed dark for good.
    await race(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      A.netLoopback({ nowMs: 1000, latencyMs: 0, interpDelayMs: 0 });
      // Arm at t=1000 for an instant only 1.2 s out, with 5 s of lights to
      // fit into it — i.e. we join the sequence already three lights down.
      A.netStartArm(1000, 2200, 0.5);
      A.netTick(1400); A.step(1 / 60, 1);
      const lit = () => [...document.querySelectorAll("#lights > *")]
        .filter((e) => e.classList.contains("on")).length;
      const partWay = lit();
      A.netTick(2400); A.step(1 / 60, 1);
      return { partWay, state: A.info().state };
    });
    // Every lamp up to the current count, not just the last one.
    expect(out.partWay).toBeGreaterThanOrEqual(3);
    expect(out.state).toBe("race");
  });

  // The four below cover the countdown's SECOND branch — holding the gantry
  // unlit until somebody names the moment. Everything above arms netStart
  // directly, so until now nothing executed that branch, and nothing at all
  // executed the host's nameTheMoment(): the lead that decides whether a
  // countdown is watchable was reachable only from the lobby.
  //
  // They run on the virtual clock like the rest of the file. netTick(t) is what
  // advances it — the netStart branch reads netStart.now(), which IS that clock
  // — so one physics substep per sample is enough.

  test("a peer waiting on the moment holds the gantry dark", async ({ page }) => {
    // Counting down locally is what released the two grids seconds apart. The
    // price is a dark gantry until the moment is named, and it must really be
    // dark: a peer that quietly accumulates dt here looks identical right up
    // until race day.
    await race(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      const lit = () => [...document.querySelectorAll("#lights > *")]
        .filter((e) => e.classList.contains("on")).length;
      A.netLoopback({ nowMs: 1000, latencyMs: 0, interpDelayMs: 0, role: "guest" });
      const armed = A.netStartArm(1000);        // in the countdown, nothing named
      const seen = [];
      for (let t = 1000; t <= 13000; t += 250) { A.netTick(t); A.step(1 / 60, 1); seen.push(lit()); }
      return { awaiting: armed.awaiting, max: Math.max(...seen), state: A.info().state };
    });

    expect(out.awaiting).toBe(true);
    // Twelve seconds — twice the whole sequence — and not one lamp.
    expect(out.max).toBe(0);
    expect(out.state).toBe("count");
  });

  test("the host waits for its guest's circuit instead of counting down alone", async ({ page }) => {
    // The host used to be exempt from the hold, which is why it never saw this
    // bug: it free-ran countT from startRace and lit its lamps organically. And
    // it ALWAYS free-ran — start() clears armedPeers and lobby.js calls
    // hostStart() with no pump in between, so allArmed() is false on the first
    // call every single race. Harmless while the lead was shorter than the
    // sequence; with the moment now named a whole countdown out, a free-running
    // host would be lamps deep when the shared instant landed, countT would
    // drop backwards, and lightsLit being monotonic the gantry would sit frozen
    // mid-count before resuming.
    await race(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      const lit = () => [...document.querySelectorAll("#lights > *")]
        .filter((e) => e.classList.contains("on")).length;
      A.netLoopback({ nowMs: 1000, latencyMs: 0, interpDelayMs: 0, role: "host",
                      peer: { team: "redbull", driver: 0 } });
      A.netStartArm(1000);
      A.netHostStart();                        // the peer never ARMs: still building
      const seen = [];
      for (let t = 1000; t <= 13000; t += 250) { A.netTick(t); A.step(1 / 60, 1); seen.push(lit()); }
      return { max: Math.max(...seen), state: A.info().state };
    });

    expect(out.max).toBe(0);
    expect(out.state).toBe("count");
  });

  test("the arm deadline releases a host whose guest never reports in", async ({ page }) => {
    // ARM_WAIT_MS is the only thing between a guest that never finishes
    // building and a host holding a dark gantry for good. Assertable at all
    // only because the deadline is now read off the same clock the countdown
    // is — naming the moment on performance.now() put it on wall time, where
    // no test could reach it, which is why it has never had one.
    await race(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      A.netLoopback({ nowMs: 1000, latencyMs: 0, interpDelayMs: 0, role: "host",
                      peer: { team: "redbull", driver: 0 } });
      A.netStartArm(1000);
      A.netHostStart();
      let named = null, t = 1000;
      for (; t <= 45000; t += 250) {
        A.netTick(t); A.step(1 / 60, 1);
        if (named == null && A.net().startPending) named = t;
        if (A.info().state === "race") break;
      }
      return { named, state: A.info().state };
    });

    // Waited out the full ARM_WAIT (20 s from the first tick) and no longer.
    expect(out.named).toBeGreaterThanOrEqual(21000);
    expect(out.named).toBeLessThan(22000);
    expect(out.state).toBe("race");             // and the race did eventually start
  });

  test("a host-named moment plays all five lamps in sequence, not backfilled", async ({ page }) => {
    // THE REPORTED BUG, from a real race, by the guest: "the timing was correct
    // for the start of the race but I didn't get lights." The moment was named
    // 2500 ms out against a 5.2-7.0 s sequence, so countT began at ~2.7-4.5 —
    // two to four lamps snapped on in a single frame and a second or so of
    // countdown was all that remained, on a device still painting its first
    // frames after a circuit build.
    //
    // Driven through the REAL naming path, because the lead is the thing under
    // test and arming netStart by hand is exactly what hides it.
    await race(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      const lit = () => [...document.querySelectorAll("#lights > *")]
        .filter((e) => e.classList.contains("on")).length;
      A.netLoopback({ nowMs: 1000, latencyMs: 0, interpDelayMs: 0, role: "host",
                      peer: { team: "redbull", driver: 0 } });
      A.netStartArm(1000);
      A.netHostStart();                        // holds, waiting for ARMED
      A.netPeerEvent("armed", {}, 1000);       // the guest's circuit is up
      A.netTick(1050); A.step(1 / 60, 1);      // pumped -> nameTheMoment()
      const atNaming = lit();
      const seen = [];
      for (let t = 1050; t <= 14000; t += 100) {
        A.netTick(t); A.step(1 / 60, 1); seen.push(lit());
        if (A.info().state === "race") break;
      }
      return { named: A.net().startPending || A.info().state === "race", atNaming, seen, state: A.info().state };
    });

    expect(out.named).toBe(true);
    // Nothing lit at the instant the moment is named — the whole sequence is
    // still ahead, which is what "a whole countdown away" buys.
    expect(out.atNaming).toBe(0);
    // It STEPS. A jump of two or more is the bug: lamps backfilled in one frame.
    const steps = out.seen.slice(1).map((n, i) => n - out.seen[i]);
    expect(Math.max(...steps)).toBe(1);
    expect(Math.max(...out.seen)).toBe(5);
    // ...and each lamp was up long enough to SEE. A second is ten samples at
    // 100 ms; five still fails a half-second flash.
    for (let k = 1; k <= 4; k++) {
      expect(out.seen.filter((n) => n === k).length).toBeGreaterThanOrEqual(5);
    }
    expect(out.state).toBe("race");
  });

  test("a lap time reaches the rival over the reliable channel", async ({ page }) => {
    // Lap times decide the RESULT, so they cannot ride the lossy channel.
    await race(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      const s = A.netLoopback({ nowMs: 1000, latencyMs: 20, loss: 0.9, interpDelayMs: 0, seed: 5 });
      // The lap must carry the identity of the driver the SENDER owns. A host
      // accepts a lap time only from the peer that holds that seat
      // (sendersOwnDriver in js/net/netplay.js) — a placeholder code is
      // spoofing, and is rejected exactly as it should be.
      const rival = A.carAt(s.remoteId);
      A.netPeerEvent("lap", { lap: 1, time: 81.23, driverId: rival.driverId, code: rival.code }, 1000);
      A.netPeerEvent("lap", { lap: 2, time: 80.11, driverId: rival.driverId, code: rival.code }, 1020);
      for (let t = 1040; t <= 1400; t += 20) A.netTick(t);
      return { laps: A.netPeerLaps(), count: A.net().peerLaps };
    });
    // 90% loss on the STATE channel must not touch these.
    expect(out.count).toBe(2);
    expect(out.laps[0].time).toBeCloseTo(81.23, 2);
    expect(out.laps[1].lap).toBe(2);
  });

  test("a lap time for a driver the peer does not own is refused", async ({ page }) => {
    // The other half of the rule above, and the reason the previous version of
    // that test could never pass: a host must not take a lap time attributed
    // to a driver its peer does not hold, or a peer could write results for
    // anyone on the grid. Same shape, one field changed.
    await race(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      const s = A.netLoopback({ nowMs: 1000, latencyMs: 20, interpDelayMs: 0, seed: 5 });
      const rival = A.carAt(s.remoteId);
      A.netPeerEvent("lap", { lap: 1, time: 81.23, driverId: rival.driverId, code: rival.code }, 1000);
      A.netPeerEvent("lap", { lap: 2, time: 60.00, driverId: "not-theirs", code: "XYZ" }, 1020);
      for (let t = 1040; t <= 1400; t += 20) A.netTick(t);
      return { count: A.net().peerLaps, laps: A.netPeerLaps() };
    });
    expect(out.count).toBe(1);
    expect(out.laps[0].lap).toBe(1);
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
      //
      // Keyed by driverId, not by grid index. The two peers' cars[] arrays are
      // not the same length or in the same order — makeCars() drops the custom
      // team unless the local player selected it — so an index means a
      // different car on each screen, and adopting one silently reorders the
      // wrong cars. Which is precisely what a close finish looks like when the
      // classification goes wrong, and precisely where nobody would notice.
      const verdict = [];
      for (let i = n - 1; i >= 0; i--) {
        verdict.push({ d: A.carAt(i).driverId, t: 100 + (n - i), p: 0, lap: 3 });
      }
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
