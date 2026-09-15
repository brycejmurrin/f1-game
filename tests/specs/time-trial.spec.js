// @ts-check
// Time Trial mode: ghost recording, ghost delta HUD, sector-split announces,
// and the TT results panel. Uses __apex.tt() to enter TT mode programmatically.
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };

async function enterTT(page, trackId = "monza") {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 8 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate((id) => window.__apex.tt(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
}

// ── Mode flags ────────────────────────────────────────────────────────────────

test.describe("Time Trial — mode flags", () => {
  test.use({ viewport: LANDSCAPE });

  test("info() reports timeTrial:true when started via __apex.tt()", async ({ page }) => {
    await enterTT(page);
    const info = await page.evaluate(() => window.__apex.info());
    expect(info.timeTrial).toBe(true);
    expect(info.seasonMode).toBe(false);
  });

  test("HUD shows TT position label", async ({ page }) => {
    await enterTT(page);
    await page.evaluate(() => window.__apex.park(0));
    await page.waitForTimeout(100);
    const posText = await page.locator("#hud-pos").innerText();
    expect(posText).toBe("TT");
  });
});

// ── Ghost delta HUD ───────────────────────────────────────────────────────────

test.describe("Time Trial — ghost delta HUD", () => {
  test.use({ viewport: LANDSCAPE });

  test("gap-behind shows REC placeholder when no record exists yet", async ({ page }) => {
    await enterTT(page);
    await page.evaluate(() => window.__apex.park(0));
    await page.waitForTimeout(100);
    const gapB = await page.locator("#hud-gap-behind").innerText();
    // Should show "REC —" when no time set yet
    expect(gapB).toMatch(/REC/);
  });

// WAIT FOR THE GHOST TO BE WRITTEN. Ghost.finishLap() does not save — it calls
// scheduleSave(), which defers the write to requestIdleCallback(…, {timeout:
// 2000}). That is deliberate and correct: a localStorage write is not something
// to do inside a frame. But it means reading the store on the next line finds
// NOTHING, which is what both ghost specs did — they failed on `saved.s` with
// `saved` undefined, on a page whose ghost recording was working perfectly.
//
// Same shape as __apex.race() not awaiting startRace(): a deferred write read
// synchronously. The product is right; the read has to wait for it.
async function ghostSaved(page, trackId) {
  await page.waitForFunction((id) => {
    try {
      const st = JSON.parse(localStorage.getItem("apex26.ghost.v1") || "null");
      const key = Ghost.context() == null ? id : "v2:" + id + ":" + Ghost.context();
      return !!(st && st[key]);
    } catch (_) { return false; }
  }, trackId, { polling: 50, timeout: 15000 });
  return page.evaluate((id) => {
    const key = Ghost.context() == null ? id : "v2:" + id + ":" + Ghost.context();
    return JSON.parse(localStorage.getItem("apex26.ghost.v1"))[key];
  }, trackId);
}

  test("records only one monotonic flying lap in the persisted ghost", async ({ page }) => {
    await enterTT(page);
    const result = await page.evaluate(() => {
      // This checks persisted samples, not pixels. Keep SwiftShader from
      // starving the deferred save and the storage polling on CI.
      window.__apex.headless(true);
      localStorage.removeItem("apex26.ghost.v1");

      // Run the real countdown from the grid, then cross once to begin the
      // flying lap. Sampling staged points makes the regression deterministic.
      window.__apex.step(1 / 60, 480);
      window.__apex.jump(0.999, 80, 0);
      window.__apex.step(1 / 60, 10);

      for (const frac of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.999]) {
        window.__apex.jump(frac, 80, 0);
        window.__apex.step(1 / 60, frac === 0.999 ? 10 : 4);
      }

      return { total: window.__apex.info().total };
    });
    const ghost = await ghostSaved(page, "monza");
    result.ghost = ghost;

    expect(result.ghost.s.length).toBeGreaterThanOrEqual(8);
    expect(result.ghost.s[0]).toBeLessThan(result.total * 0.02);
    expect(result.ghost.s.every((s, i) => i === 0 || s >= result.ghost.s[i - 1])).toBe(true);
  });

  test("drops reverse-progress samples from ghost recording and delta lookup", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof Ghost !== "undefined");
    await page.evaluate(() => {
      Ghost.clear("monza");
      Ghost.setTrack("monza");
      Ghost.startLap();
      [0, 100, 200, 150, 300, 400, 500, 600, 700, 800].forEach((s, i) => {
        Ghost.record(i * 0.06, s, 0);
      });
      Ghost.finishLap(1);
    });
    const saved = await ghostSaved(page, "monza");
    const result = {
      distances: saved.s,
      timeAt250: await page.evaluate(() => Ghost.timeAt(250)),
    };

    expect(result.distances).not.toContain(150);
    expect(result.distances.every((s, i) => i === 0 || s >= result.distances[i - 1])).toBe(true);
    expect(result.timeAt250).toBeCloseTo(0.18, 2);
  });
});

// ── Sector splits ─────────────────────────────────────────────────────────────

test.describe("Time Trial — sector splits", () => {
  test.use({ viewport: LANDSCAPE });

  test("initializes sector timing from the player's grid sector", async ({ page }) => {
    await enterTT(page);
    const sector = await page.evaluate(() => window.__apex.sectorState());
    expect(sector.idx).toBe(2);
  });

  test("does not record formation-lap S3 when first crossing the start line", async ({ page }) => {
    await enterTT(page);
    const result = await page.evaluate(() => {
      window.__apex.go();
      window.__apex.jump(0.999, 80, 0);
      window.__apex.step(1 / 60, 10);
      return {
        timing: window.__apex.timing(),
        sectors: window.__apex.sectorState()
      };
    });
    expect(result.timing.lap).toBeGreaterThanOrEqual(1);
    expect(result.sectors.idx).toBe(0);
    // Grid sits in S3; the first S/F crossing only starts the flying lap.
    expect(result.sectors.last[2]).toBeNull();
    expect(result.sectors.bests[2]).toBeNull();
  });

  test("records S3 before resetting timing at the finish line", async ({ page }) => {
    await enterTT(page);
    const result = await page.evaluate(() => {
      window.__apex.go();
      // Already on a flying lap — the S3→S1 wrap must stamp the split.
      window.__apex.setLap(1);
      window.__apex.jump(0.999, 80, 0);
      window.__apex.step(1 / 60, 10);
      return {
        timing: window.__apex.timing(),
        sectors: window.__apex.sectorState()
      };
    });
    expect(result.timing.lap).toBeGreaterThanOrEqual(1);
    expect(result.sectors.idx).toBe(0);
    expect(result.sectors.last[2]).not.toBeNull();
    expect(result.sectors.last[2]).toBeGreaterThan(0);
  });

  test("sector strip updates when crossing S1→S2 boundary", async ({ page }) => {
    await enterTT(page);

    // Start just before this track's curated S1→S2 boundary at low speed so the
    // car crosses cleanly without triggering auto-rescue (which would overwrite
    // the "S1" announce with "RECOVERED").
    await page.evaluate(async () => {
      window.__apex.headless(true);
      window.__apex.go();
      const sec = window.__apex.info().sectors || [1 / 3, 2 / 3];
      const s1 = sec[0];
      window.__apex.reset(Math.max(0.01, s1 - 0.008), 10);
      window.__apex.setLap(1); // flying lap — sector splits only stamp after lap ≥ 1
      const total = window.__apex.info().total || 5000;
      for (let i = 0; i < 300; i++) {
        window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 3);
        if (window.__apex.physState().s / total > s1 + 0.005) break;
      }
      window.__apex.headless(false);
    });

    const split = await page.evaluate(() => {
      const last = window.__apex.sectorState().last;
      const flash = document.querySelector("#hud-sectors .sec-flash, #hud-sectors .sec-flash-pb");
      return { s1: last[0], flashed: !!flash };
    });
    expect(split.s1).not.toBeNull();
    expect(split.s1).toBeGreaterThan(0);
  });
});

// ── TT results panel ──────────────────────────────────────────────────────────

test.describe("Time Trial — results panel", () => {
  test.use({ viewport: LANDSCAPE });

  test("results panel appears after finishRace() in TT mode", async ({ page }) => {
    await enterTT(page);
    await page.evaluate(() => window.__apex.park(0));
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__apex.finishRace());
    await page.waitForTimeout(300);

    await expect(page.locator("#results")).toBeVisible({ timeout: 5000 });
    const title = await page.locator("#results-title").innerText();
    expect(title).toContain("TIME TRIAL");
  });

  test("TRY AGAIN button shown in TT results", async ({ page }) => {
    await enterTT(page);
    await page.evaluate(() => window.__apex.park(0));
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__apex.finishRace());
    await expect(page.locator("#results")).toBeVisible({ timeout: 5000 });
    const nextText = await page.locator("#res-next").innerText();
    expect(nextText).toBe("TRY AGAIN");
  });

  test("clearing the ghost retains the persisted leaderboard record", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("apex26.ttlb.monza", JSON.stringify([
        { t: 75, teamId: "mclaren", code: "NOR", name: "Lando Norris", ts: 1 },
      ]));
      localStorage.setItem("apex26.ghost.v1", JSON.stringify({
        monza: {
          time: 75,
          t: [0, 10, 20, 30, 40, 50, 60, 75],
          s: [0, 700, 1400, 2100, 2800, 3500, 4200, 5000],
          x: [0, 0, 0, 0, 0, 0, 0, 0],
        },
      }));
    });
    await enterTT(page);
    await page.evaluate(() => {
      window.__apex.park(0);
      // Seed a record in this car/physics class; the init-script rows stay legacy.
      GameStore.ttBoardAdd("monza", { t:75, teamId:"mclaren", code:"NOR", name:"Lando Norris", ts:2, context:Ghost.context() });
      Ghost.startLap();
      for(let i=0;i<8;i++) Ghost.record(i*10,i*700,0);
      Ghost.finishLap(75);
      window.__apex.finishRace();
    });
    await page.getByRole("button", { name: "✕ CLEAR GHOST" }).click();
    expect(await page.evaluate(() => GameStore.ttBoard("monza",null).length)).toBe(1);
    await page.locator("#res-next").click();
    await page.evaluate(() => window.__apex.park(0.1));
    await expect(page.locator("#hud-gap-behind")).toContainText("REC 1:15.00");
  });
});


for (const device of [
  { viewport:{width:1280,height:800}, touch:false, scale:100 },
  { viewport:LANDSCAPE, touch:true, scale:100 },
  { viewport:LANDSCAPE, touch:true, scale:200 },
]) {
  const {viewport,touch,scale}=device;
  test.describe(`Practice controls at ${viewport.width}x${viewport.height} ${scale}%`, () => {
    test.use({viewport,hasTouch:touch,isMobile:touch});
    test("coach, unscored checkpoint and compound selection work through the pause menu", async ({page}, info) => {
      const errors=[]; page.on("pageerror", e=>errors.push(e.message));
      const press = async selector => touch ? page.locator(selector).tap() : page.locator(selector).click();
      await enterTT(page);
      // Match menu-keyboard's pause test: skip only the 3D render loop so
      // locator actionability can settle; DOM controls and physics stay live.
      await page.evaluate(pct=>{window.__apex.headless(true);window.__apex.uiScale(pct);},scale);
      await expect(page).toHaveTitle(/Apex 26/i);
      await page.evaluate(()=>{window.__apex.go();window.__apex.tyres({level:"light"});});
      await page.getByRole("button",{name:"Pause",exact:true}).click();
      await press("#pm-driving");
      await expect(page.locator("#dlg-settings")).toHaveText("DRIVING");
      await expect(page.locator("#pausemenu")).toBeHidden();
      for (const selector of ['#announce', '#lights', '.hud-top', '#minimap'])
        await expect(page.locator(selector)).toHaveCSS('visibility', 'hidden');
      await expect(page.locator("#pm-coach-help")).toContainText(/text tips/i);
      for (const id of ["pm-practice-panel", "pm-pit-panel", "pm-session-review"])
        await expect(page.locator("#" + id)).not.toHaveAttribute("open", "");
      await expect(page.locator("#pm-drill-sel")).toBeHidden();
      await expect(page.locator("#pm-pit-choice-sel")).toBeHidden();
      await page.locator("#pm-coach-sel").selectOption("on");
      await expect(page.locator("#pm-coach-sel")).toHaveValue("on");
      const initialCoach = await page.evaluate(() => window.__apex.physState().driving.coach);
      expect(initialCoach.enabled).toBe(true);
      expect(initialCoach.state).toBe("paused");
      await expect(page.locator("#pm-coach-status")).toContainText(/paused/i);
      expect(initialCoach.latest).toBeNull();
      expect(initialCoach.total).toBe(0);
      await expect(page.locator("#pm-coach-tip")).toContainText(/next tip.*after you drive/i);
      await press("#pm-practice-panel > summary");
      await expect(page.locator("#pm-drill-sel")).toBeVisible();
      await page.locator("#pm-drill-sel").selectOption("sector");
      await expect(page.locator("#pm-drill-status")).toContainText("Finish the next sector");
      await press("#pm-practice-set");
      await page.locator("#pm-drill-sel").selectOption("slalom");
      await expect(page.locator("#pm-drill-status")).toContainText("six direction changes");
      await expect(page.locator("#pm-practice-retry")).toBeEnabled();
      await press("#pm-practice-retry");
      await expect(page.locator("#pm-drill-sel")).toHaveValue("sector");
      await expect(page.locator("#pm-drill-status")).toContainText("Finish the next sector");
      const driving=await page.evaluate(()=>window.__apex.physState().driving);
      expect(driving.practice).toBe(true);
      expect(driving.insights.drill.mode).toBe("sector");
      await press("#pm-practice-panel > summary");
      await expect(page.locator("#pm-practice-set")).toBeHidden();
      await press("#pm-pit-panel > summary");
      const select=page.locator("#pm-pit-choice-sel");
      await expect(select).toBeEnabled();
      const value=await select.locator("option").nth(1).getAttribute("value");
      await select.selectOption(value);
      await expect(select).toHaveValue(value);
      const compound=await select.locator('option:checked').innerText();
      await expect(page.locator("#pm-pit-help")).toContainText(compound.split(" · ")[1]);
      await expect(page.locator("#pm-pit-help")).toContainText("Choosing tyres does not call you into the pits");
      await expect(page.locator("#pm-pit-estimate")).toContainText("Estimated pit loss:");
      await press("#pm-pit-panel > summary");
      await press("#pm-practice-panel > summary");
      await page.locator("#pm-practice-retry").scrollIntoViewIfNeeded();
      await page.screenshot({path:info.outputPath("practice-controls.png")});
      await press("#pm-practice-panel > summary");
      await press("#pm-pit-panel > summary");
      await select.scrollIntoViewIfNeeded();
      await page.screenshot({path:info.outputPath("pit-controls.png")});
      await press("#pm-pit-panel > summary");
      await press("#pm-session-review > summary");
      await expect(page.locator("#pm-coach-summary")).toContainText(/no tips|0 tips/i);
      await press("#pm-session-review > summary");
      await press("#pm-settings-close");
      await expect(page.locator("#pm-settings-index")).toBeVisible();
      await press("#pm-settings-close");
      await press("#pm-howto");
      await page.locator('#htp-contents a[href="#htp-driving"]').click();
      await expect(page.locator("#htp-driving")).toBeInViewport();
      await expect(page.locator("#howtoplay")).toContainText("Short text tips appear");
      await expect(page.locator("#howtoplay")).toContainText("This makes the session unscored");
      expect(errors).toEqual([]);
    });
  });
}

// Same sheet, real routes and real preference writes at every supported scale.
// Screenshot geometry alone cannot prove that a control can be reached by touch.
const drivingDevices = [
  { name: 'small-phone', viewport: { width: 320, height: 568 }, touch: true, safe: [0,0,0,0] },
  { name: 'phone-portrait', viewport: { width: 393, height: 659 }, touch: true, safe: [59,0,34,0] },
  { name: 'phone-browser-landscape', viewport: { width: 852, height: 344 }, touch: true, safe: [0,59,21,59] },
  { name: 'tablet', viewport: { width: 834, height: 1194 }, touch: true, safe: [0,0,0,0] },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, touch: false, safe: [0,0,0,0] },
];
for (const device of drivingDevices) test.describe(`Driving zoom matrix ${device.name}`, () => {
  test.use({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch, deviceScaleFactor: 1 });
  test('settings, help and Back remain readable and reachable', async ({page}, info) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/');
    await page.waitForFunction(() => !!window.__apex, null, {polling:100, timeout:BOOT_MS});
    await page.evaluate(async safe => {
      window.__apex.headless(true);
      document.getElementById('game').style.visibility = 'hidden';
      for (const [i,k] of ['--sat','--sar','--sab','--sal'].entries()) document.documentElement.style.setProperty(k,safe[i]+'px');
      await document.fonts.ready;
    }, device.safe);
    const press = async selector => device.touch ? page.locator(selector).tap() : page.locator(selector).click();
    const rows = [];

    try {
      for (const pct of [40,80,100,130,150,200]) {
        await press('#mb-settings'); await press('#pm-open-display');
        await page.locator('#pm-uiscale').evaluate((e,n) => { e.value=String(n); e.dispatchEvent(new Event('input',{bubbles:true})); }, pct);
        await expect(page.locator('#pm-uiscale')).toHaveValue(String(pct));
        await press('#pm-settings-close'); await press('#pm-open-driving');
        await expect(page.locator('#pm-panel-driving')).toBeVisible();
        await page.waitForFunction(() => document.getElementById('pmsettings-inner').dataset.shape, null, {polling:100});
        await press('#pm-coach-next'); await expect(page.locator('#pm-coach-sel')).toHaveValue('on');
        await press('#pm-coach-next'); await expect(page.locator('#pm-coach-sel')).toHaveValue('off');
        await press('#pm-coach-next'); await expect(page.locator('#pm-coach-sel')).toHaveValue('on');
        await press('#pm-coach-prev'); await expect(page.locator('#pm-coach-sel')).toHaveValue('off');
        await expect(page.locator('#pm-coach-status')).toContainText(/coach off/i);
        await expect(page.locator('#pm-coach-tip')).toContainText(/next tip.*after you drive/i);
        for (const id of ['pm-practice-panel','pm-pit-panel','pm-session-review'])
          await expect(page.locator('#'+id)).not.toHaveAttribute('open','');
        await expect(page.locator('#pm-practice-set')).toBeHidden();
        await expect(page.locator('#pm-pit-choice-sel')).toBeHidden();
        const measure = async root => page.evaluate(selector => {
          const e=document.querySelector(selector), sheet=e.querySelector('.sheet'), pane=e.querySelector('.pane');
          const r=sheet.getBoundingClientRect(), pr=pane.getBoundingClientRect();
          const zoom=sheet.currentCSSZoom || 1;
          const focusables=[...e.querySelectorAll('select,button,summary,a[href]')].filter(n => n.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
          const overflow=focusables.filter(n => { const b=n.getBoundingClientRect(); return b.left < pr.left-1 || b.right > pr.right+1; })
            .filter(n=>!n.closest('.sheet-foot')).map(n=>n.id || n.tagName);
          return { root:selector,zoom,shape:sheet.dataset.shape,density:sheet.dataset.density,
            sheet:{x:r.x,y:r.y,w:r.width,h:r.height},paneHeight:pr.height,
            shortHelpChips:selector === '#howtoplay' && sheet.dataset.density === 'compact'
              ? [...e.querySelectorAll('#htp-contents a')].filter(n=>n.getBoundingClientRect().height<43.5).map(n=>n.textContent) : [],
            smallTargets:focusables.filter(n=>{const b=n.getBoundingClientRect();return b.width<23.5||b.height<23.5;}).map(n=>n.id||n.tagName),
            overflow,docOverflow:document.documentElement.scrollWidth-innerWidth,
            paneOverflow:pane.scrollWidth-pane.clientWidth };
        },root);
        rows.push({pct,...await measure('#pmsettings')});
        const m=rows[rows.length-1];
        expect(m.smallTargets).toEqual([]);
        expect(m.overflow,`${device.name} at ${pct}%`).toEqual([]);
        expect(m.docOverflow).toBeLessThanOrEqual(1); expect(m.paneOverflow).toBeLessThanOrEqual(1);
        expect(m.paneHeight).toBeGreaterThan(70);
        if ([100,150,200].includes(pct)) await page.screenshot({path:info.outputPath(`driving-${pct}.png`)});
        // Open the simplified sections by touch, so hidden content cannot make
        // an overflow measurement or disabled-control assertion pass vacuously.
        for (const id of ['pm-practice-panel','pm-pit-panel']) {
          await press('#'+id+' > summary');
          await expect(page.locator('#'+id)).toHaveAttribute('open','');
          if (id === 'pm-practice-panel') {
            await expect(page.locator('#pm-practice-set')).toBeVisible();
            await expect(page.locator('#pm-practice-set')).toBeDisabled();
            await expect(page.locator('#pm-practice-state')).toContainText('solo Time Trial');
            await page.locator('#pm-practice-state').scrollIntoViewIfNeeded();
          } else {
            await expect(page.locator('#pm-pit-choice-sel')).toBeVisible();
            await expect(page.locator('#pm-pit-choice-sel')).toBeDisabled();
            await page.locator('#pm-pit-help').scrollIntoViewIfNeeded();
          }
          const expanded=await measure('#pmsettings');
          expect(expanded.overflow,`${id} at ${pct}%`).toEqual([]);
          expect(expanded.smallTargets,`${id} at ${pct}%`).toEqual([]);
          expect(expanded.paneOverflow).toBeLessThanOrEqual(1);
          await press('#'+id+' > summary');
          await expect(page.locator('#'+id)).not.toHaveAttribute('open','');
        }
        await press('#pm-session-review > summary');
        await expect(page.locator('#pm-coach-summary')).toContainText(/no tips|0 tips/i);
        await expect(page.locator('#pm-session-review')).toHaveAttribute('open','');
        await expect(page.locator('#pm-driving-trace')).toBeHidden();
        await expect(page.locator('#pm-technical-data')).not.toHaveAttribute('open','');
        await press('#pm-technical-data > summary');
        await expect(page.locator('#pm-driving-trace')).toBeVisible();
        await page.locator('#pm-driving-trace').scrollIntoViewIfNeeded();
        const action=await page.locator('#pm-driving-trace').evaluate(e=>({w:e.clientWidth,sw:e.scrollWidth,h:e.clientHeight,sh:e.scrollHeight}));
        expect(action.sw).toBeLessThanOrEqual(action.w+1); expect(action.sh).toBeLessThanOrEqual(action.h+1);
        await press('#pm-technical-data > summary');
        await expect(page.locator('#pm-driving-trace')).toBeHidden();
        await press('#pm-session-review > summary');
        await expect(page.locator('#pm-driving-trace')).toBeHidden();
        await press('#pm-settings-close'); await expect(page.locator('#pm-settings-index')).toBeVisible();
        await press('#pm-settings-close'); await expect(page.locator('#pmsettings')).toBeHidden(); await press('#mb-help');
        await press('#htp-contents a[href="#htp-driving"]');
        await expect(page.locator('#htp-driving')).toBeInViewport();
        await expect(page.locator('#htp-contents a[href="#htp-driving"]')).toHaveAttribute('aria-current','true');
        rows.push({pct,...await measure('#howtoplay')});
        const h=rows[rows.length-1]; expect(h.docOverflow).toBeLessThanOrEqual(1); expect(h.paneOverflow).toBeLessThanOrEqual(1);
        expect(h.smallTargets).toEqual([]);
        expect(h.shortHelpChips).toEqual([]);
        expect(h.paneHeight).toBeGreaterThan(70);
        const paragraph=await page.locator('#htp-driving + dd').evaluate(e=>({w:e.getBoundingClientRect().width,body:e.parentElement.getBoundingClientRect().width}));
        expect(paragraph.w/paragraph.body,'instructions need at least half the reading pane').toBeGreaterThan(.5);
        if ([100,150,200].includes(pct)) await page.screenshot({path:info.outputPath(`help-${pct}.png`)});
        await press('#htp-close'); await expect(page.locator('#overlay')).toBeVisible();
      }
    } finally {
      await info.attach('zoom-measurements.json',{body:JSON.stringify(rows,null,2),contentType:'application/json'});
    }
    expect(errors).toEqual([]);
  });
});
