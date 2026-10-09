// @ts-check
// After Start Race, garage-out must finish before the race/session card appears
// on every path: reduce-motion (short version), view-transition / Home vt race,
// and quick start (warm race-settings). Card must never overlap the animation.
import { sharedTest as test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { toMenu } from "../helpers/shared-page.js";

async function clickId(page, id) {
  await page.evaluate((i) => {
    const el = document.getElementById(i);
    if (!el) throw new Error("garage-out-before-card: missing #" + i);
    el.click();
  }, id);
}

/** Arm a timeline of loading phase + #ld-card visibility + garageCam.on. */
async function armTimeline(page) {
  await page.evaluate(() => {
    const L = document.getElementById("loading");
    const card = document.getElementById("ld-card");
    if (window.__garageOutPoll) clearInterval(window.__garageOutPoll);
    window.__garageOutTL = [];
    const snap = (tag) => {
      if (!L || !card) return;
      const cs = window.getComputedStyle(card);
      const phase = L.dataset.phase || "";
      const op = parseFloat(cs.opacity);
      const cardShown = !L.hidden
        && ["run", "card", "build", "busy", "handoff"].includes(phase)
        && cs.visibility !== "hidden"
        && !(op === 0);
      const cam = window.__apex && window.__apex.garageCam && window.__apex.garageCam();
      window.__garageOutTL.push({
        t: performance.now(), tag, phase, hidden: !!L.hidden,
        cardVis: cs.visibility, cardOp: cs.opacity, cardShown,
        garageOn: !!(cam && cam.on),
      });
    };
    snap("arm");
    const mo = new MutationObserver(() => snap("mut"));
    mo.observe(L, { attributes: true, attributeFilter: ["data-phase", "hidden"] });
    window.__garageOutMo = mo;
    window.__garageOutPoll = setInterval(() => snap("poll"), 40);
  });
}

async function stopTimeline(page) {
  return page.evaluate(() => {
    if (window.__garageOutPoll) clearInterval(window.__garageOutPoll);
    if (window.__garageOutMo) window.__garageOutMo.disconnect();
    const tl = window.__garageOutTL || [];
    window.__garageOutTL = tl;
    return tl;
  });
}

function assertGarageThenCard(tl, label) {
  expect(tl.length, `${label}: timeline empty`).toBeGreaterThan(5);
  const garageSamples = tl.filter((s) => s.phase === "garage" || s.garageOn);
  expect(garageSamples.length, `${label}: garage-out never ran — ${JSON.stringify(tl.slice(0, 12))}`).toBeGreaterThan(0);
  const firstGarageT = garageSamples[0].t;
  const lastGarageT = garageSamples[garageSamples.length - 1].t;
  const cardSamples = tl.filter((s) => s.cardShown);
  expect(cardSamples.length, `${label}: race/session card never appeared`).toBeGreaterThan(0);
  const firstCardT = cardSamples[0].t;
  expect(firstCardT, `${label}: card at ${firstCardT} before garage start ${firstGarageT}`).toBeGreaterThanOrEqual(firstGarageT);
  // No overlap: while phase is garage, #ld-card must stay hidden.
  const overlap = tl.filter((s) => s.phase === "garage" && s.cardShown);
  expect(overlap, `${label}: card overlapped garage-out`).toEqual([]);
  // Card only after garage-out samples end (or at least after garage phase leaves).
  const garagePhaseEnd = (() => {
    let end = lastGarageT;
    for (let i = tl.length - 1; i >= 0; i--) {
      if (tl[i].phase === "garage") { end = tl[i].t; break; }
    }
    return end;
  })();
  expect(firstCardT, `${label}: card before garage-out finished`).toBeGreaterThanOrEqual(garagePhaseEnd - 80);
  return { firstGarageT, lastGarageT, firstCardT, garageMs: lastGarageT - firstGarageT };
}

async function openRaceSettings(page) {
  await toMenu(page);
  await clickId(page, "mb-race");
  await page.waitForFunction(() => {
    const s = document.getElementById("select");
    return !!(s && !s.hidden);
  }, null, { polling: 100, timeout: 30_000 });
  await clickId(page, "sel-go");
  await page.waitForFunction(() => {
    const rs = document.getElementById("race-settings");
    return !!(rs && !rs.hidden);
  }, null, { polling: 100, timeout: 30_000 });
}

async function startRaceFromSettings(page) {
  await armTimeline(page);
  await clickId(page, "rs-go");
  await page.waitForFunction(() => {
    const tl = window.__garageOutTL || [];
    return tl.some((s) => s.cardShown);
  }, null, { polling: 100, timeout: 120_000 });
  // One more poll sample after the card appears so garage-end timing is stable.
  await page.waitForFunction(() => {
    const tl = window.__garageOutTL || [];
    const cardAt = tl.findIndex((s) => s.cardShown);
    return cardAt >= 0 && tl.length > cardAt + 2;
  }, null, { polling: 100, timeout: 5_000 });
  return stopTimeline(page);
}

async function setMotion(page, on) {
  if (on) {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(() => {
      if (typeof GameStore !== "undefined" && GameStore.store) GameStore.store.set("motion", "on");
      document.documentElement.removeAttribute("data-motion");
    });
  } else {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => {
      if (typeof GameStore !== "undefined" && GameStore.store) GameStore.store.set("motion", "reduce");
      document.documentElement.dataset.motion = "reduce";
    });
  }
  // Ensure the garage-arrival tuner is enabled so drive-out can run.
  await page.evaluate(() => {
    if (typeof GameStore !== "undefined" && GameStore.store) {
      const cur = GameStore.store.get("garageArrival", null) || {};
      GameStore.store.set("garageArrival", Object.assign({}, cur, { enabled: true }));
    }
  });
}

test.describe("garage-out before race/session card", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("reduce-motion: short garage-out completes before session card", async ({ page }) => {
    test.setTimeout(BOOT_MS + 180_000);
    await setMotion(page, false);
    await openRaceSettings(page);
    const tl = await startRaceFromSettings(page);
    const m = assertGarageThenCard(tl, "reduce");
    // Short version: well under the full ~7.6 s wall, but still a real beat.
    expect(m.garageMs, `reduce garageMs=${m.garageMs}`).toBeGreaterThan(400);
    expect(m.garageMs, `reduce garageMs=${m.garageMs} should be short`).toBeLessThan(6000);
  });

  test("view-transition / Home vt race: garage-out before flyby card", async ({ page }) => {
    test.setTimeout(BOOT_MS + 180_000);
    await setMotion(page, true);
    await openRaceSettings(page);
    const tl = await startRaceFromSettings(page);
    assertGarageThenCard(tl, "vt-home");
  });

  test("quick start (warm race-settings): garage-out before card", async ({ page }) => {
    test.setTimeout(BOOT_MS + 180_000);
    await setMotion(page, true);
    await openRaceSettings(page);
    // Let the menu warm the pick, then Start — the fast path when the world is ready.
    await page.waitForFunction(() => {
      const a = window.__apex;
      if (!a || !a.info) return false;
      const info = a.info();
      return !!(info && info.track);
    }, null, { polling: 100, timeout: 30_000 });
    const tl = await startRaceFromSettings(page);
    assertGarageThenCard(tl, "quick");
  });

  test("reduce-motion off then on: both keep card after garage-out", async ({ page }) => {
    test.setTimeout(BOOT_MS + 240_000);
    await setMotion(page, true);
    await openRaceSettings(page);
    let tl = await startRaceFromSettings(page);
    assertGarageThenCard(tl, "motion-on");
    // Back to menu and re-run under reduce without a full reload.
    await toMenu(page);
    await setMotion(page, false);
    await openRaceSettings(page);
    tl = await startRaceFromSettings(page);
    const m = assertGarageThenCard(tl, "motion-off-pair");
    expect(m.garageMs).toBeGreaterThan(400);
    expect(m.garageMs).toBeLessThan(6000);
  });
});
