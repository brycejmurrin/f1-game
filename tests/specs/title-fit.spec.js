// @ts-check
// TITLE FIT — the landscape title screen never scrolls (#5150).
//
// Bryce, 2026-11-06, on the iPhone home-screen app at 852x393: "Things are
// still broken. Let's reconsider from scratch. The title page should not be
// scrollable." On the Tuesday-night tree his stored TITLE LAYOUT (WIDTH 20)
// made #menu-buttons a scroller — scrollHeight 569 in a 343px box, USE AS
// CONTROLLER below the fold — and the Nov 4–5 values (WIDTH 40, STACK) the
// same (the #5139 sweep: 563 in 343). The fix is by construction
// (js/ui/title-layout.js fit(): every size and offset is a request, the
// overlay's content box is the law); this spec is the matrix the issue pins:
// four phone geometries with CDP safe-area insets, three boot profiles, and
// every stored layout value applied in-page, each cell held to the five
// requirements in tests/helpers/title-fit.mjs judge(). Cells are never dropped
// and tolerances never widen: 1px on containment, 0 on scroll extents.
//
// Not emulated: iOS itself (display-mode: standalone and the visual-viewport
// quirk behind the ~58px band). What CAN be held is that #overlay and #game
// are exactly the viewport (`fixed; inset: 0`, no vh), which requirement 4
// does; the band's other candidate — the sticky utility-row scrim #menu-buttons
// paints only as a scroller (.sf-scroll) — cannot appear once nothing scrolls.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { GEOS, profiles, sweep, settleInPage, measureInPage, judge, judgeStored, judgeFloor, liveStore, LIVE_TITLE, staleLaunchInPage, firstFlagsInPage } from "../helpers/title-fit.mjs";

const SETTLE_FRAMES = 12;

/** @param {import("@playwright/test").Page} page @param {{ json: object, raw: object }} store */
async function seed(page, store) {
  await page.addInitScript(({ json, raw }) => {
    try {
      for (const [k, v] of Object.entries(json)) localStorage.setItem("apex26." + k, JSON.stringify(v));
      for (const [k, v] of Object.entries(raw)) localStorage.setItem("apex26." + k, v);
    } catch (_) { /* storage off */ }
  }, store);
}

/** @param {import("@playwright/test").Page} page @param {{ top: number, left: number, bottom: number, right: number }} insets */
async function insets(page, insets) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets });
}

/** @param {import("@playwright/test").Page} page */
async function bootTitle(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.SheetShape && typeof TitleLayout !== "undefined", null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => {
    window.__apex.headless(true);
    document.documentElement.dataset.titleIntro = "off";
    document.getElementById("overlay")?.removeAttribute("data-intro");
  });
  // Web fonts and the boot stamp land first (the brand's box moves with the
  // wordmark's font); measure() then waits for the fit itself to hold still.
  await page.waitForFunction(() => document.fonts.status === "loaded" && document.documentElement.hasAttribute("data-booted"),
    null, { polling: 100, timeout: BOOT_MS });
}

/** @param {import("@playwright/test").Page} page */
async function measure(page) {
  const frames = await page.evaluate(settleInPage, SETTLE_FRAMES);
  const m = await page.evaluate(measureInPage);
  return { frames, m };
}

for (const geo of GEOS) {
  test.describe(`title fit ${geo.name}`, () => {
    test.use({ viewport: { width: geo.w, height: geo.h }, hasTouch: true, isMobile: true });

    for (const prof of profiles()) {
      test(`boots ${prof.name} without a scroll${prof.sweep ? ", then every stored layout" : ""}`, async ({ page }) => {
        test.setTimeout(prof.sweep ? 420_000 : 150_000);
        await insets(page, geo.insets);
        await seed(page, prof.store);
        await bootTitle(page);
        const sal = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--sal").trim());
        expect(sal, "the CDP insets reached env(safe-area-inset-left)").toBe(`${geo.insets.left}px`);

        const boot = await measure(page);
        expect(boot.frames, "the fit settled").toBeGreaterThan(0);
        // THE ROWS (#5199): one composition on every landscape phone, whatever the profile.
        // CONTINUE is shown so the retention pair is whole (a fresh profile has no last session).
        if (!prof.sweep) {
          await page.evaluate(() => { document.getElementById("mb-continue").hidden = false; });
          const withContinue = await measure(page);
          const rows = {};
          for (const d of withContinue.m.doors) (rows[Math.round(d.t)] ||= []).push(d.id);
          expect(Object.values(rows).map((r) => r.length), `${geo.name} ${prof.name} rows ${JSON.stringify(rows)}`).toEqual(geo.rows);
          expect(judge(withContinue.m, { offsets: prof.offsets }), `${geo.name} ${prof.name} with CONTINUE`).toEqual([]);
          if (geo.floor) expect(judgeFloor(withContinue.m), `${geo.name} ${prof.name} with CONTINUE: the touch paint floor`).toEqual([]);
          await page.evaluate(() => { document.getElementById("mb-continue").hidden = true; });
          await measure(page);
        }
        expect(judge(boot.m, { offsets: prof.offsets }), `${geo.name} boot ${prof.name}: ${JSON.stringify({ fit: boot.m.fit, mb: boot.m.mb, ov: boot.m.ov })}`).toEqual([]);
        if (prof.name === "export") {
          // The stored WIDTH 20 at Bryce's geometries (#5167 part F): the
          // cluster fills its track, two doors to a row, the small print back.
          expect(boot.m.tl, "the stored layout reached the page").toMatchObject({ layout: "on", btnw: "on" });
          expect(judgeStored(boot.m), `${geo.name} boot export (stored WIDTH 20): ${JSON.stringify({ track: boot.m.track, mbW: boot.m.mb.rect.w, raceFs: boot.m.raceFs, fit: boot.m.fit })}`).toEqual([]);
        }
        if (prof.name === "export-w40-stack") {
          // The repro cell: this is the layout that scrolled (563/343) before the fit.
          expect(boot.m.tl, "the stored layout reached the page").toMatchObject({ layout: "on", btns: "stack", btnw: "on" });
        }
        if (!prof.sweep) return;

        const failures = [];
        for (const cell of sweep()) {
          await page.evaluate(({ layout, ui }) => {
            if (ui !== undefined) window.__apex.uiScale(ui);
            TitleLayout.set(layout, "wide");
          }, { layout: cell.layout, ui: cell.ui });
          const { frames, m } = await measure(page);
          const bad = judge(m, { offsets: cell.offsets });
          if (frames <= 0) bad.push(`did not settle in ${-frames} frames`);
          if (bad.length) failures.push(`${cell.name} [fit ${m.fit.mb || 1}/${m.fit.br || 1}, ui ${m.uiScale}]: ${bad.join("; ")}`);
        }
        expect(failures, `${geo.name}: cells that scroll, clip or leave the box`).toEqual([]);
      });
    }
  });
}

// STALE LAUNCH — the iOS Home Screen app opened in landscape (#5167 part E). CSS lays out 852x393
// while innerWidth/innerHeight still hold 393x852 and no resize ever follows. Measured 2026-11-09
// (Chromium, DPR 3, insets 59/21/59, Bryce's export): the pre-paint boot and SheetShape classify
// body compact + wide from the ICB either way (#5152), but the keyboard band read
// `innerHeight − visualViewport.height` = 852 − 393 = 459 and wrote --kb: 459px — every .screen
// opened from the title carried 459 px of padding-bottom in a 393 px window. The band's minuend is
// the ICB now; this cell holds both: the flags the first paint got and no band, under both stale
// shapes (visualViewport right while inner* lies, and the strict iOS case where both lie).
test.describe("title fit stale landscape launch 852x393-standalone", () => {
  const geo = GEOS[0];
  test.use({ viewport: { width: geo.w, height: geo.h }, hasTouch: true, isMobile: true });

  for (const stale of [{ name: "inner* stale, visualViewport right", vv: false }, { name: "inner* and visualViewport stale", vv: true }]) {
    test(`boots the export with ${stale.name}: ICB flags, no keyboard band, no scroll`, async ({ page }) => {
      test.setTimeout(150_000);
      const prof = profiles().find((p) => p.name === "export");
      await insets(page, geo.insets);
      await seed(page, prof.store);
      await page.addInitScript(firstFlagsInPage);
      await page.addInitScript(staleLaunchInPage, { w: geo.h, h: geo.w, vv: stale.vv });
      await bootTitle(page);
      // The band latched at SheetShape.init's own first ask (the broken tree wrote --kb before
      // the title was interactive), so the boot wait above is the window; measure() then settles the fit.
      const { frames, m } = await measure(page);
      expect(frames, "the fit settled").toBeGreaterThan(0);
      const first = await page.evaluate(() => ({ ...window.__apexFirstFlags, inner: [innerWidth, innerHeight], icb: [document.documentElement.clientWidth, document.documentElement.clientHeight] }));
      expect(first.inner, "precondition: the stale pair held").toEqual([geo.h, geo.w]);
      expect(first.icb, "precondition: CSS laid out landscape").toEqual([geo.w, geo.h]);
      expect(first, "the FIRST paint classified from the ICB").toMatchObject({ density: "compact", shape: "wide" });
      expect({ density: m.density, shape: m.shape }, "and SheetShape kept it").toEqual({ density: "compact", shape: "wide" });
      expect(m.kb, "no phantom keyboard band from the stale innerHeight").toBeNull();
      expect(judge(m, { offsets: prof.offsets }), `${geo.name} stale launch: ${JSON.stringify({ fit: m.fit, mb: m.mb, ov: m.ov })}`).toEqual([]);
    });
  }
});

// UI SIZE DOES NOT PICK THE TITLE (#5199). Bryce's phone showed the 11-row fallback, which a
// landscape phone only reaches at body[data-density="normal"] (UI SIZE under ~66 % at 393 px), and
// his pause-sheet screenshots reproduce only near UI SIZE 51 % (#5207) although his export stores
// none. Whatever the phone's effective zoom, the Home is the same eight rows at a readable size:
// before the floor the doors at 51 % were a 129 px strip with 6.9 px labels in a 356 px box.
test.describe("title fit at a small UI SIZE 852x393-standalone", () => {
  const geo = GEOS[0];
  test.use({ viewport: { width: geo.w, height: geo.h }, hasTouch: true, isMobile: true });

  for (const ui of [40, 51, 60]) {
    for (const name of ["fresh", "export"]) {
      test(`UI SIZE ${ui} % boots ${name} to the same rows, doors 44 px and labels readable`, async ({ page }) => {
        test.setTimeout(150_000);
        const prof = profiles().find((p) => p.name === name);
        await insets(page, geo.insets);
        await seed(page, { json: { ...prof.store.json, uiScale: ui }, raw: prof.store.raw });
        await bootTitle(page);
        await page.evaluate(() => { document.getElementById("mb-continue").hidden = false; });
        const { frames, m } = await measure(page);
        expect(frames, "the fit settled").toBeGreaterThan(0);
        expect(m.uiScale, "precondition: the stored UI SIZE reached --ui-scale").toBe(String(ui / 100));
        const rows = {};
        for (const d of m.doors) (rows[Math.round(d.t)] ||= []).push(d.id);
        expect(Object.values(rows).map((r) => r.length), `rows ${JSON.stringify(rows)}`).toEqual(geo.rows);
        expect(judge(m, { offsets: prof.offsets }), JSON.stringify({ fit: m.fit, mb: m.mb.rect })).toEqual([]);
        expect(judgeFloor(m), "the touch paint floor").toEqual([]);
        expect(m.raceFs, "RACE paints at a readable size").toBeGreaterThanOrEqual(12);
        expect(m.mb.rect.h, "the cluster is not a strip").toBeGreaterThanOrEqual(240);
      });
    }
  }
});

// EVERY TITLE LAYOUT CONTROL (#5199: "the sliders are wonky and backwards"). One test per slider,
// driven through the real <input type=range> from Bryce's stored layout at his geometry, low to
// high. Held per control: (1) direction — the rect it names never moves the wrong way; (2) no dead
// travel — every change of the STORED value moves that rect, and the thumb shows the stored value,
// so a request the box cannot give stops the slider at the edge instead of being stored (before:
// BUTTONS SIZE 110..200 moved nothing and ran slightly backwards, WIDTH 100 painted smaller doors
// than 90, half of each LEFT / RIGHT range was dead); (3) the right element — the other two pieces
// do not move; (4) it persists across a reload and a rotation to portrait and back.
test.describe("title layout controls 852x393-standalone", () => {
  const geo = GEOS[0];
  test.use({ viewport: { width: geo.w, height: geo.h }, hasTouch: true, isMobile: true });
  const CONTROLS = [
    // The 4th entry is the travel the whole range must show, where the #5213 floor leaves less
    // than the 20 px every other control clears (measured 2026-11-10 on this profile and screen):
    // a door runs 44.2 -> 47.3 px over SIZE 100..107 (the 388 px cluster at UI SIZE 109 %), and the
    // seven 44 px rows are 333 px of the 356 px box, so UP / DOWN has 17 px (stored -2..+2).
    ["btns", "size", "row", 2], ["btns", "width", "w"], ["btns", "x", "l"], ["btns", "y", "t", 10],
    ["title", "size", "h"], ["title", "x", "l"], ["title", "y", "t"],
    ["art", "size", "w"], ["art", "x", "l"], ["art", "y", "t"],
  ];
  const HELD = { size: "--tf", x: "--tf-dx", y: "--tf-dy" };
  const PIECE = { btns: "menu-buttons", title: "menu-brand", art: "title-car" };
  /** @param {import("@playwright/test").Page} page */
  const pieces = async (page) => {
    await page.evaluate(settleInPage, SETTLE_FRAMES);
    return page.evaluate((ids) => {
      const out = {};
      for (const [p, id] of Object.entries(ids)) {
        const el = document.getElementById(id), r = el.getBoundingClientRect();
        out[p] = { l: r.left, t: r.top, w: r.width, h: r.height, tok: { "--tf": el.style.getPropertyValue("--tf"), "--tf-dx": el.style.getPropertyValue("--tf-dx"), "--tf-dy": el.style.getPropertyValue("--tf-dy") } };
      }
      // BUTTONS SIZE is read off a door (#5213): under a finger a bigger SIZE re-flows the cluster
      // into fewer rows, so the cluster's own height is not monotone; the painted door is.
      out.btns.row = document.getElementById("mb-race").getBoundingClientRect().height;
      out.stored = TitleLayout.current("wide");
      return out;
    }, PIECE);
  };
  const near = (a, b, tol) => ["l", "t", "w", "h"].every((k) => Math.abs(a[k] - b[k]) <= tol);

  for (const [part, k, dim, travel = 20] of CONTROLS) {
    test(`${part} ${k}: moves its own piece the right way, no dead travel, persists`, async ({ page }) => {
      test.setTimeout(240_000);
      const prof = profiles().find((p) => p.name === "export");
      await insets(page, geo.insets);
      // Seeded ONCE: an init script runs again on reload, and would write the export back over the change.
      await page.addInitScript(({ json, raw }) => {
        try {
          if (sessionStorage.getItem("tl-seeded")) return;
          sessionStorage.setItem("tl-seeded", "1");
          for (const [k, v] of Object.entries(json)) localStorage.setItem("apex26." + k, JSON.stringify(v));
          for (const [k, v] of Object.entries(raw)) localStorage.setItem("apex26." + k, v);
        } catch (_) { /* storage off */ }
      }, prof.store);
      await bootTitle(page);
      const base = await pieces(page);
      const lim = await page.evaluate((k) => TitleLayout.LIM[k], k);
      const steps = [];
      for (let i = 0; i <= 10; i++) {
        const ask = Math.round(lim[0] + (lim[1] - lim[0]) * i / 10);
        const thumb = await page.evaluate(({ id, ask }) => {
          const inp = /** @type {HTMLInputElement} */ (document.getElementById(id));
          inp.value = String(ask);
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          return inp.value;
        }, { id: `pm-tl-${part}-${k}`, ask });
        steps.push({ ask, thumb, ...(await pieces(page)) });
      }
      const line = steps.map((s) => `${s.ask}→${s.stored[part][k]}:${Math.round(s[part][dim] * 10) / 10}`).join(" ");
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i], v = s.stored[part][k];
        expect(s.thumb, `the thumb shows the stored value at ask ${s.ask} [${line}]`).toBe(String(v));
        for (const other of Object.keys(PIECE)) {
          if (other === part) continue;
          // WIDTH moves the split between the doors and the brand, so the brand's own track narrows
          // with it (its origin stays); every other control leaves the other two pieces alone.
          const moved = k === "width" && other === "title" ? Math.abs(s[other].l - base[other].l) > 1 || Math.abs(s[other].t - base[other].t) > 1 || s[other].w > base[other].w + 1 : !near(s[other], base[other], 1);
          expect(moved, `${other} stayed put at ${part} ${k} ${s.ask}: ${JSON.stringify(s[other])} vs ${JSON.stringify(base[other])}`).toBe(false);
        }
        if (part !== "art" && HELD[k]) {
          const tok = s[part].tok[HELD[k]];
          expect(k === "size" ? !(parseFloat(tok) < 1) : !tok, `the box is not holding the stored ${k} ${v} (${HELD[k]}: "${tok}") [${line}]`).toBe(true);
        }
        if (!i) continue;
        const p = steps[i - 1], pv = p.stored[part][k], d = s[part][dim] - p[part][dim];
        expect(v, `stored value never runs backwards [${line}]`).toBeGreaterThanOrEqual(pv);
        if (v === pv || (k === "width" && pv === 0 && v === 20)) expect(Math.abs(d), `same stored value, same rect [${line}]`).toBeLessThanOrEqual(0.5);   // AUTO is the shipped column, which WIDTH 20 is on this screen
        else expect(d, `stored ${pv} → ${v} moved ${PIECE[part]}.${dim} the right way [${line}]`).toBeGreaterThan(0.5);
      }
      expect(steps[10][part][dim] - steps[0][part][dim], `the range does something [${line}]`).toBeGreaterThan(travel);

      // Persists: a mid-range stop, then a reload, then portrait and back.
      const mid = steps[5].stored[part][k];
      await page.evaluate(({ id, mid }) => {
        const inp = /** @type {HTMLInputElement} */ (document.getElementById(id));
        inp.value = String(mid);
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      }, { id: `pm-tl-${part}-${k}`, mid });
      const set = await pieces(page);
      expect(set.stored[part][k], "the mid stop stored").toBe(mid);
      await page.reload();
      await bootTitle(page);
      const reloaded = await pieces(page);
      expect(reloaded.stored, "the layout survived a reload").toEqual(set.stored);
      for (const p of Object.keys(PIECE)) expect(near(reloaded[p], set[p], 1), `${p} after reload: ${JSON.stringify(reloaded[p])} vs ${JSON.stringify(set[p])}`).toBe(true);
      await page.setViewportSize({ width: geo.h, height: geo.w });
      await page.waitForFunction(() => document.body.dataset.shape === "tall", null, { polling: 100, timeout: BOOT_MS });
      await page.setViewportSize({ width: geo.w, height: geo.h });
      await page.waitForFunction(() => document.body.dataset.shape === "wide", null, { polling: 100, timeout: BOOT_MS });
      const back = await pieces(page);
      expect(back.stored, "the landscape layout survived a rotation").toEqual(set.stored);
      for (const p of Object.keys(PIECE)) expect(near(back[p], set[p], 1), `${p} after rotation: ${JSON.stringify(back[p])} vs ${JSON.stringify(set[p])}`).toBe(true);
    });
  }
});

// THE TOUCH PAINT FLOOR (#5213). With what Bryce's phone stores (UI SIZE 61 %, BUTTONS SIZE 60,
// WIDTH 49) the eight rows were the right shape and painted 16.8-22.2 px tall with 6.1-8.9 px
// labels, the whole menu in y 8..175 of 393 (measured 2026-11-10 at all three geometries). Under a
// finger no door paints under 44 px and no label under 12, his position and WIDTH stay his, and
// storage is not rewritten. BUTTONS SIZE stays honest (#5229's rule: the range is what fits, the
// number is the painted size): its low end is the floor, it shows the painted 100 % over the
// stored 60, and from there every stored step paints a bigger door until the box stops the thumb.
const LIVE_GEOS = [GEOS[0], { name: "852x368", w: 852, h: 368, insets: GEOS[0].insets }, GEOS[2]];
for (const geo of LIVE_GEOS) {
  test.describe(`title touch floor ${geo.name}`, () => {
    test.use({ viewport: { width: geo.w, height: geo.h }, hasTouch: true, isMobile: true });

    test("the live stored layout paints 44 px doors, and BUTTONS SIZE runs from the floor to the box", async ({ page }) => {
      test.setTimeout(240_000);
      await insets(page, geo.insets);
      const store = liveStore();
      await page.addInitScript(({ json, raw }) => {
        try {
          if (sessionStorage.getItem("tl-seeded")) return;
          sessionStorage.setItem("tl-seeded", "1");
          for (const [k, v] of Object.entries(json)) localStorage.setItem("apex26." + k, JSON.stringify(v));
          for (const [k, v] of Object.entries(raw)) localStorage.setItem("apex26." + k, v);
        } catch (_) { /* storage off */ }
      }, store);
      await bootTitle(page);
      expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), "precondition: a touch context").toBe(true);
      const slider = () => page.evaluate(() => {
        const inp = /** @type {HTMLInputElement} */ (document.getElementById("pm-tl-btns-size"));
        return { min: inp.min, max: inp.max, value: inp.value, text: document.getElementById("pm-tl-btns-size-v").textContent, stored: TitleLayout.current("wide").btns };
      });
      for (const cont of [false, true]) {
        await page.evaluate((c) => { document.getElementById("mb-continue").hidden = !c; }, cont);
        const { frames, m } = await measure(page);
        const at = `${geo.name}${cont ? " with CONTINUE" : ""}: ${JSON.stringify({ fit: m.fit, mb: m.mb.rect, doors: m.doors.map((d) => `${d.id} ${Math.round(d.h * 10) / 10}/${d.fs}`) })}`;
        expect(frames, "the fit settled").toBeGreaterThan(0);
        expect(m.uiScale, "precondition: the stored UI SIZE reached --ui-scale").toBe("0.61");
        expect(judge(m, { offsets: true }), at).toEqual([]);
        expect(judgeFloor(m), at).toEqual([]);
        expect(m.fit.mb || "1", `the floor is not paid for by the fit ${at}`).toBe("1");
      }
      // His layout is still his: storage untouched, WIDTH 49 is the track, the cluster against the right edge.
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("apex26.titleLayout"))), "storage is not rewritten").toEqual(LIVE_TITLE);
      const boot = (await measure(page)).m;
      expect(Math.abs(boot.mb.rect.w - boot.track[boot.track.length - 1]), "his WIDTH is the cluster's track").toBeLessThanOrEqual(1);
      expect(Math.abs(boot.mb.rect.r - boot.ov.box.r), "his LEFT / RIGHT holds the cluster at the right edge").toBeLessThanOrEqual(1);
      expect(Math.abs(boot.mb.rect.t - boot.ov.box.t), "his UP / DOWN holds the cluster at the top edge").toBeLessThanOrEqual(1);

      // The slider: low end = the floor, number = the painted size, the stored 60 untouched until he moves it.
      expect(await slider(), "BUTTONS SIZE shows the painted size").toMatchObject({ min: "100", value: "100", text: "100%", stored: LIVE_TITLE.wide.btns });
      const steps = [];
      for (const ask of [50, 100, 105, 110, 120, 130, 150, 200]) {
        await page.evaluate((ask) => {
          const inp = /** @type {HTMLInputElement} */ (document.getElementById("pm-tl-btns-size"));
          inp.value = String(ask);
          inp.dispatchEvent(new Event("input", { bubbles: true }));
        }, ask);
        const { m } = await measure(page);
        const s = await slider();
        steps.push({ ask, ...s, size: s.stored.size, row: m.doors.find((d) => d.id === "mb-race").h, floor: judgeFloor(m), fit: m.fit.mb || "1", bad: judge(m, { offsets: true }) });
      }
      const line = steps.map((s) => `${s.ask}→${s.size}:${Math.round(s.row * 10) / 10}`).join(" ");
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        expect(s.value, `the thumb shows the stored value at ask ${s.ask} [${line}]`).toBe(String(s.size));
        expect(s.text, `the number is the painted size at ask ${s.ask} [${line}]`).toBe(`${s.size}%`);
        expect(s.size, `nothing under the floor is stored [${line}]`).toBeGreaterThanOrEqual(100);
        expect(s.floor, `44 px doors at ask ${s.ask} [${line}]`).toEqual([]);
        expect(s.bad, `inside the box, no scroll, at ask ${s.ask} [${line}]`).toEqual([]);
        expect(s.fit, `the box is not holding the stored SIZE ${s.size} [${line}]`).toBe("1");
        expect({ x: s.stored.x, y: s.stored.y, width: s.stored.width }, "SIZE moves nothing else of his").toEqual({ x: 50, y: -42, width: 49 });
        if (!i) continue;
        const p = steps[i - 1];
        expect(s.size, `stored value never runs backwards [${line}]`).toBeGreaterThanOrEqual(p.size);
        if (s.size === p.size) expect(Math.abs(s.row - p.row), `same stored value, same door [${line}]`).toBeLessThanOrEqual(0.5);
        else expect(s.row - p.row, `stored ${p.size} → ${s.size} paints a bigger door (no dead zone, not backwards) [${line}]`).toBeGreaterThan(0.5);
      }
      expect(steps[0].size, `a request under the floor stops at the floor [${line}]`).toBe(100);
      expect(steps[steps.length - 1].size, `the range has travel above the floor [${line}]`).toBeGreaterThan(100);
      expect(steps[steps.length - 1].size, `and stops where the box does [${line}]`).toBeLessThan(200);
    });
  });
}
