// @ts-check
// SHIPPED DEFAULTS — the product a player actually boots, with NO pins.
//
// tests/helpers/fixtures.js pins three things for every other spec: the
// hand-written WebGL2 renderer (GLX), TYRE WEAR off and WIND off; loadTrack and
// many specs also pin the factory McLaren seat. The product ships three.js
// (TLX), wear and wind on, and the GarageDefaults seat, so a regression only on
// the shipped default was out of reach of nearly every spec. Every test here is
// tagged SHIPPED_DEFAULTS_TAG, which is the fixture's one opt-out: none of
// those pins is written, and nothing below writes a setting either.
//
// Representative, not exhaustive: boot, the garage, one race from START to the
// results sheet, a pit stop, and the phone HUD layout. Each subject keeps its
// deep coverage in its own topical spec; this file is the "does the shipped
// combination still work at all" floor, in its own group (test:shipped-defaults)
// so the nightly rotation runs it.
//
// The ONE storage write is apex26.gfxBootStepMs, the renderer-boot watchdog.
// It only lets a slow software-GL box finish TLX init instead of falling back
// mid-boot (renderer-boot.js lets a spec raise it, never lower it), the same
// value and reason as tlx-probes.spec.js. It changes no product choice.
import { test, expect, BOOT_MS, RACE_BUILD_MS, SHIPPED_DEFAULTS_TAG, awaitTrackBuild } from "../helpers/fixtures.js";
import { analyzeOverlap, probeHudElements } from "../../tools/lib/hud-geometry.mjs";

const TAG = { tag: SHIPPED_DEFAULTS_TAG };
const PHONE = { width: 844, height: 390 };
const PINNED_KEYS = ["apex26.gfxBackend", "apex26.tyreWear", "apex26.wind", "apex26.team", "apex26.parts.mclaren"];

// Each test boots TLX and builds a circuit on software GL: the peers on the
// race fixture (hud-layout, results-flow) declare the same budget.
test.setTimeout(300_000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem("apex26.gfxBootStepMs", "45000"); } catch (_) {}
  });
});

async function boot(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null && !!window.__apex.race, null, { polling: 100, timeout: BOOT_MS })
    .catch(async (e) => {
      // Same wait, same BOOT_MS: this only names what the boot was doing when it ran out. CI run 43478086963
      // (job 132069209092) timed out here with the title DOM built and __apex.race missing, and recorded nothing else.
      const s = await page.evaluate(() => {
        const gfx = (st) => { const o = {}; try { for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && k.startsWith("apex26.gfx")) o[k] = st.getItem(k); } } catch (_) { o.unreadable = true; } return o; };
        return {
          apex: typeof window.__apex, race: !!(window.__apex && window.__apex.race),
          backend: typeof GLX !== "undefined" ? (GLX.backend || "glx") : "no GLX global",
          readyState: document.readyState, session: gfx(sessionStorage), local: gfx(localStorage),
        };
      }).catch((x) => ({ evaluateFailed: String(x && x.message) }));
      throw new Error(`${e && e.message} | boot state at the timeout: ${JSON.stringify(s)}`, { cause: e });
    });
}

/** Wait for a race started any way (UI or hook) to reach its grid. */
async function awaitGrid(page) {
  await page.waitForFunction(() => !!window.__apex.info().track
    && ["count", "race"].includes(window.__apex.info().state), null, { polling: 100, timeout: RACE_BUILD_MS });
}

test.describe("shipped defaults", () => {
  // FIRST, on purpose (coordinator, 2026-11-10): on the default backend (three.js
  // WebGPU) the tab reloaded to the title a few seconds after every race finish —
  // a caught TypeError in three's vertex-layout key after the car-shadow mirror
  // sweep nulls arrays, which renderer-boot answers with apex26.gfxTlxFail and a
  // reload. Every other driven race to the flag runs GLX, so nothing saw it.
  // Expected RED on the deploy branch until PR #5270 lands; it is not quarantined.
  test("a race on the shipped renderer finishes and the results sheet stays up (no TLX-fail reload)", TAG, async ({ page, pageErrors, consoleLines }) => {
    let navigations = 0;
    await boot(page);
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) navigations++; });
    await page.evaluate(() => { window.__shippedMarker = 1; window.__apex.race("monza"); });
    await awaitGrid(page);
    await page.evaluate(() => {
      const a = window.__apex;
      a.go();
      for (let i = 0; i < 60 * 3; i++) { a.setInput({ steer: 0, throttle: true, brake: false }); a.step(1 / 60, 1); }
      a.clearInput();
    });
    expect(await page.evaluate(() => window.__apex.finishRace())).toBeTruthy();
    await expect(page.locator("#results")).toBeVisible();
    // The reload came "a few seconds" after the flag: hold the results screen 20 s
    // with the renderer running (headless off), then look again.
    await page.evaluate(() => window.__apex.headless(false));
    // Wait FOR the failure: a reload drops the marker or leaves results. Only a
    // timeout (the 20 s passed with neither) is the pass; anything else is a fail.
    const broke = await page.waitForFunction(() => window.__shippedMarker !== 1
      || !window.__apex || window.__apex.info().state !== "results", null, { polling: 250, timeout: 20_000 })
      .then(() => "left the results screen", (e) => (/Timeout/i.test(String(e && e.message)) ? null : String(e && e.message)));
    expect(broke, "within 20 s of the flag").toBeNull();
    const after = await page.evaluate(() => ({
      marker: window.__shippedMarker === 1,
      state: window.__apex && window.__apex.info().state,
      tlxFail: (() => { try { return localStorage.getItem("apex26.gfxTlxFail"); } catch (_) { return "unreadable"; } })(),
    }));
    expect(navigations, "the page navigated or reloaded on the results screen").toBe(0);
    expect(after.marker, "the page was reloaded (window state lost)").toBe(true);
    expect(after.state).toBe("results");
    await expect(page.locator("#results")).toBeVisible();
    expect(after.tlxFail, "renderer-boot recorded a TLX failure").toBeNull();
    expect(consoleLines.filter((l) => /present failed/.test(l)), "TLX present failed").toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("boots the shipped renderer with wear and wind on and no pin written", TAG, async ({ page, pageErrors }) => {
    await boot(page);
    const s = await page.evaluate(async (keys) => {
      let hasAdapter = false;
      try {
        if (navigator.gpu && navigator.gpu.requestAdapter) hasAdapter = !!(await navigator.gpu.requestAdapter());
      } catch (_) { hasAdapter = false; }
      const store = (k) => { try { return GameStore.store.get(k); } catch (_) { return undefined; } };
      return {
        pinned: keys.filter((k) => localStorage.getItem(k) != null),
        backend: typeof GLX !== "undefined" ? GLX.backend : undefined,
        hasAdapter,
        // What the BOOT's own capped probe saw (renderer-boot), and what it bound: the authority, not the
        // uncapped probe above, which runs long after boot and can find an adapter the boot timed out on.
        bootAdapterWhy: (() => { try { return sessionStorage.getItem("apex26.gfxAdapterWhy"); } catch (_) { return null; } })(),
        bound: (() => { try { return sessionStorage.getItem("apex26.gfxBound"); } catch (_) { return null; } })(),
        fallbackWhy: (() => { try { return sessionStorage.getItem("apex26.gfxFallbackWhy"); } catch (_) { return null; } })(),
        tyreWear: store("tyreWear"),
        wind: typeof Wind !== "undefined" ? Wind.level() : null,
      };
    }, PINNED_KEYS);
    expect(s.pinned, "the shipped-defaults opt-out must write none of the fixture pins").toEqual([]);
    // Unset backend: TLX when a GPU adapter resolves (this launch enables
    // software WebGPU), otherwise renderer-boot's GLX fallback, which is also
    // what a player without WebGPU gets (tlx-probes.spec.js asserts the same).
    // The boot's own probe decides: it found an adapter → TLX, with no fallback reason. It found none (null, threw,
    // or its 4 s cap under a loaded runner) → the unset default binds GLX, which is what that player gets too.
    // A later uncapped requestAdapter() finding one does not change what this boot saw (first CI run, 2026-11-10).
    if (s.bootAdapterWhy == null && s.hasAdapter) {
      expect(s.backend, JSON.stringify(s)).toBe("three");
      expect(s.fallbackWhy, JSON.stringify(s)).toBeNull();
    } else if (s.bootAdapterWhy != null) {
      expect(s.backend, JSON.stringify(s)).toBeUndefined();
    }
    expect(s.tyreWear, "TYRE WEAR ships on").toBe("real");
    if (s.wind !== null) expect(s.wind, "WIND ships on").toBe("real");
    expect(pageErrors).toEqual([]);
  });

  test("the garage opens on the shipped seat and a race runs from START to the results sheet", TAG, async ({ page, pageErrors }) => {
    await boot(page);
    // Quiet the title render for the menu clicks only (smoke.spec.js measured
    // menu clicks behind a live SwiftShader redraw at minutes each).
    await page.evaluate(() => window.__apex.headless(true));
    await page.locator("#mb-race").click();
    await expect(page.locator("#select")).toBeVisible();
    await page.locator("#sel-car").click();
    await expect(page.locator("#carsetup")).toBeVisible();
    await expect(page.locator("#cs-tabs [data-cs-cat]").first()).toBeVisible();
    await page.locator("#cs-done").click();
    await expect(page.locator("#race-settings")).toBeVisible();
    await page.locator("#rs-go").click();
    await page.evaluate(() => window.__apex.headless(false));
    await awaitGrid(page);

    const drive = await page.evaluate(() => {
      const a = window.__apex;
      a.go();
      a.headless(true);
      a.freeze(true);
      let peak = 0;
      for (let i = 0; i < 60 * 6; i++) {
        a.setInput({ steer: 0, throttle: true, brake: false });
        a.step(1 / 60, 1);
        peak = Math.max(peak, a.physState().speed);
      }
      a.clearInput();
      a.freeze(false);
      return { peak, state: a.info().state, n: a.cars().length };
    });
    expect(drive.state).toBe("race");
    expect(drive.n, "the shipped grid has a field").toBeGreaterThan(1);
    expect(drive.peak, "held throttle moves the shipped car").toBeGreaterThan(10);

    expect(await page.evaluate(() => window.__apex.finishRace())).toBeTruthy();
    await expect(page.locator("#results")).toBeVisible();
    expect(await page.evaluate(() => window.__apex.info().state)).toBe("results");
    expect(pageErrors).toEqual([]);
  });

  test("an AI car serves a pit stop under the shipped tyre wear", TAG, async ({ page }) => {
    // The AI half of pit-lane.spec.js, because the player half needs a scripted
    // approach tuned to the factory seat. Here nothing turns wear on: the lane
    // existing at all is the shipped default's doing.
    await boot(page);
    await page.evaluate(() => window.__apex.race("monza", "day", "dry", { laps: 25 }));
    await awaitTrackBuild(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      A.headless(true);
      A.go();
      const zone = A.pit();
      if (!zone || !zone.enabled) return { error: "no pit lane under the shipped TYRE WEAR", zone };
      // pit({car}) takes an INDEX, not field().id: find a non-player index by effect.
      let idx = -1;
      for (let i = 0; i < A.field().of; i++) {
        A.pit({ car: i, arm: true });
        if (!A.pit().armed) { idx = i; break; }
        A.pit({ car: i, arm: false });
      }
      if (idx < 0) return { error: "no rival found" };
      // The AI drives the player's car too: a player parked 60 s under green is retired (W26 row 5,
      // AiDrive.stallSweep), and the race that ends strands the rival's stop (CI run 42969890984:
      // "none -> lane", RetiredCard at raceT 135.6). Same hand-over as pit-lane.spec.js's AI stop.
      A.carRole(A.carRoles().findIndex((r) => r.local), { human: false });
      const states = [];
      let boxTicks = 0, stops = 0;
      for (let k = 0; k < 60 * 240; k++) {
        A.step(1 / 60, 1);
        const q = A.pit({ car: idx });
        if (states[states.length - 1] !== q.state) states.push(q.state);
        if (q.state === "box") boxTicks++;
        if (q.stops > stops) stops = q.stops;
        if (stops > 0 && q.state === "out") break;
      }
      return { idx, states, boxTicks, stops, boxS: A.pit({ car: idx }).boxS };
    });
    expect(out.error, `${out.error} ${JSON.stringify(out.zone || null)}`).toBeUndefined();
    expect(out.states.join(" -> "), "the AI never served its stop").toContain("box -> out");
    expect(out.stops).toBe(1);
    expect(out.boxTicks, "the car was never held in the box").toBeGreaterThan(out.boxS * 60 * 0.9);
  });

  test.describe("phone landscape", () => {
    test.use({ viewport: PHONE, hasTouch: true });

    test("no HUD readout or control sits on another at 844x390", TAG, async ({ page }) => {
      await boot(page);
      await page.evaluate(() => window.__apex.race("bahrain"));
      await awaitTrackBuild(page);
      await page.evaluate(() => { window.__apex.go(); window.__apex.park(0.1); });
      const CTRL = ["btn-throttle", "btn-brake", "btn-boost", "btn-ot", "btn-aero",
                    "shift-up", "shift-down", "btn-steer-left", "btn-steer-right", "pausebtn"];
      const HUD = ["hud-aero", "hud-ot", "hud-gearbox", "hud-energy", "hud-speed",
                   ".hud-top", "#minimap", "#hud-sectors"];
      const targets = [...CTRL.map((k) => ({ key: k, sel: k, role: "ctrl" })),
                       ...HUD.map((k) => ({ key: k, sel: k, role: "hud" }))];
      // A fit pass lands over a few HUD ticks (hud-layout.spec.js waits on its
      // published --hud-fit-stamp): re-fit and re-measure until the layout is
      // clean or the budget runs out, then assert on the LAST measurement. A
      // collision that persists still fails, naming every pair.
      let r = null;
      const until = Date.now() + 45_000;
      for (;;) {
        await page.evaluate(() => {
          try { window.__apex.jump(0.1, 60, 0); } catch (_) {}
          if (typeof GameHud !== "undefined" && GameHud.syncPhoneFit) GameHud.syncPhoneFit();
        });
        await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
        const stamp = await page.evaluate(() => document.documentElement.style.getPropertyValue("--hud-fit-stamp"));
        const recs = await page.evaluate(probeHudElements, { targets });
        r = analyzeOverlap(recs, PHONE.width, PHONE.height);
        const clean = !r.overlaps.length && !r.hudClash.length && !r.unsafe.length;
        if ((/^\d+$/.test(stamp) && clean) || Date.now() > until) break;
        // Poll interval on the Node side: the next pass re-fits and waits two
        // frames, so this is pacing, not a wait for the layout.
        await new Promise((res) => setTimeout(res, 500));
      }
      const dump = " " + JSON.stringify(r);
      expect(r.count, "touch controls are on screen" + dump).toBeGreaterThan(3);
      expect(r.overlaps, "controls must not sit on each other" + dump).toEqual([]);
      expect(r.hudClash, "no HUD readout may sit on a control or another readout" + dump).toEqual([]);
      expect(r.unsafe, "nothing may leave the viewport" + dump).toEqual([]);
    });
  });
});
