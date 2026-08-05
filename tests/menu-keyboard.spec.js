// @ts-check
// Desktop menu input — js/game/menunav.js.
//
// Two behaviours, both invisible on a phone and both load-bearing on a laptop:
//
//   1. WHEEL REDIRECTION. The select screen's only scrollable box is the circuit
//      list; everything a trackpad user is likely to be pointing at while they
//      swipe (the preview map, the sheet title, the left column) sits outside it
//      inside an overflow:hidden chain. Those gestures must reach the list.
//   2. ARROW-KEY NAVIGATION. Up/Down/Left/Right move focus through the open menu
//      and pull the focused row into view — and, critically, must NOT also be
//      steering the car once a race is running.
//
// Wheel events are dispatched in-page rather than with mouse.wheel(): Playwright's
// wheel helper hangs in this app when the point under the cursor has no scrollable
// ancestor at all, which is exactly the case under test.
import { test, expect } from "./fixtures.js";

const DESKTOP = { width: 1440, height: 760 };

async function waitReady(page) {
  await page.waitForFunction(() => window.__apex && window.__apex.race, { timeout: 15_000 });
}

async function openSelect(page) {
  await page.evaluate(() => document.getElementById("mb-race").click());
  await page.waitForFunction(() => !document.getElementById("select").hidden, null, { timeout: 8_000 });
  // the circuit list is filled by menus.js; wait for rows before measuring
  await page.waitForFunction(() => document.querySelectorAll("#sel-tracks .track-row").length > 5, null, { timeout: 8_000 });
}

// Dispatch a wheel over the centre of `sel` and report what the track list did.
const wheelOver = (page, sel, deltaY = 300) =>
  page.evaluate(({ sel, deltaY }) => {
    const el = document.querySelector(sel);
    if (!el) return { missing: true };
    const list = document.getElementById("sel-tracks");
    list.scrollTop = 0;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const target = document.elementFromPoint(x, y) || el;
    const ev = new WheelEvent("wheel", {
      deltaY, deltaMode: 0, clientX: x, clientY: y, bubbles: true, cancelable: true,
    });
    target.dispatchEvent(ev);
    return { top: list.scrollTop, prevented: ev.defaultPrevented };
  }, { sel, deltaY });

const focusInfo = (page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    return {
      id: a.id || "",
      cls: String(a.className || ""),
      text: (a.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40),
      listTop: document.getElementById("sel-tracks").scrollTop,
    };
  });

test.describe("Menu keyboard + trackpad (desktop)", () => {
  test.use({ viewport: DESKTOP });

  test("wheel outside the pane still scrolls the circuit list", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await openSelect(page);

    // Sanity: the list really is the only scroll region on this screen.
    const scrollers = await page.evaluate(() =>
      [...document.querySelectorAll("#select *")]
        .filter((el) => {
          const oy = getComputedStyle(el).overflowY;
          return (oy === "auto" || oy === "scroll") && el.scrollHeight - el.clientHeight > 1;
        })
        .map((el) => el.id || el.className));
    expect(scrollers).toContain("sel-tracks");

    for (const sel of ["#sel-preview-map", "#sel-preview-info", ".sheet-head", ".sheet-foot"]) {
      const r = await wheelOver(page, sel);
      expect(r.missing, `${sel} exists`).toBeFalsy();
      expect(r.top, `wheel over ${sel} scrolls the list`).toBeGreaterThan(0);
      expect(r.prevented, `wheel over ${sel} is consumed`).toBe(true);
    }
  });

  test("a pane already at the end does not swallow the gesture", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await openSelect(page);
    const r = await page.evaluate(() => {
      const list = document.getElementById("sel-tracks");
      list.scrollTop = list.scrollHeight;      // pinned at the bottom
      const head = document.querySelector(".sheet-head").getBoundingClientRect();
      const x = head.left + 10, y = head.top + 10;
      const ev = new WheelEvent("wheel", { deltaY: 300, clientX: x, clientY: y, bubbles: true, cancelable: true });
      (document.elementFromPoint(x, y) || document.body).dispatchEvent(ev);
      return { prevented: ev.defaultPrevented };
    });
    expect(r.prevented).toBe(false);
  });

  test("the first arrow press adopts the current selection", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await openSelect(page);
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press("ArrowDown");
    const f = await focusInfo(page);
    expect(f.id || f.cls, "focus entered the menu").not.toBe("");
    expect(await page.evaluate(() => document.getElementById("select").contains(document.activeElement))).toBe(true);
  });

  test("ArrowDown walks the circuit list and scrolls it into view", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await openSelect(page);
    // Left/right cross the select screen's two columns; up/down stay in one. Enter
    // the list the way a player would, then walk it. GARAGE is the only control
    // in the left column's action row now (MY TEAM and CAR SETUP were folded into
    // the garage itself), so one ArrowRight from it has nowhere to go but across.
    await page.evaluate(() => document.getElementById("sel-go").focus());
    await page.keyboard.press("ArrowRight");
    expect((await focusInfo(page)).cls, "ArrowRight crosses into the circuit column").toContain("track-row");

    const start = await focusInfo(page);
    let moved = start;
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press("ArrowDown");
      moved = await focusInfo(page);
      expect(moved.cls, "ArrowDown stays in the list").toContain("track-row");
      if (moved.listTop > 0) break;
    }
    expect(moved.text, "focus moved down the list").not.toBe(start.text);
    expect(moved.listTop, "the list scrolled to follow focus").toBeGreaterThan(0);
  });

  test("Home / End jump to the ends of the open menu", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await openSelect(page);
    await page.keyboard.press("End");
    const end = await focusInfo(page);
    await page.keyboard.press("Home");
    const home = await focusInfo(page);
    expect(end.text).not.toBe(home.text);
    expect(await page.evaluate(() => document.getElementById("select").contains(document.activeElement))).toBe(true);
  });

  test("left/right move along a chip row without leaving it", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await openSelect(page);
    // The DRIVER chips moved from the select screen into the GARAGE's TEAM tab
    // when the screens were split by question (who you are / where you race).
    await page.locator("#sel-go").click();
    await page.locator("#carsetup").waitFor({ state: "visible" });
    await page.locator('#cs-tabs [data-cs-cat="team"]').click();
    const chips = await page.evaluate(() => document.querySelectorAll("#cs-driver .sel-chip").length);
    test.skip(chips < 2, "team has a single driver chip");

    await page.evaluate(() => document.querySelector("#cs-driver .sel-chip").focus());
    const a = await focusInfo(page);
    await page.keyboard.press("ArrowRight");
    const b = await focusInfo(page);
    expect(b.cls, "still on a chip").toContain("sel-chip");
    expect(b.text, "moved to the other driver").not.toBe(a.text);
    await page.keyboard.press("ArrowLeft");
    expect((await focusInfo(page)).text).toBe(a.text);
  });

  test("Enter on a focused circuit selects it", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await openSelect(page);
    const picked = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#sel-tracks .track-row")];
      const row = rows.find((r) => !r.classList.contains("active"));
      row.focus();
      return row.textContent.trim().replace(/\s+/g, " ").slice(0, 20);
    });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    const active = await page.evaluate(() =>
      (document.querySelector("#sel-tracks .track-row.active") || {}).textContent?.trim().replace(/\s+/g, " ").slice(0, 20));
    expect(active).toBe(picked);
  });

  test("with a race running the arrow keys drive the car, not the menu", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => { try { return window.__apex.info().track === "monza"; } catch (_) { return false; } }, null, { timeout: 20_000 });
    await page.evaluate(() => { window.__apex.go(); window.__apex.jump(0.2, 40); });
    await page.waitForTimeout(300);

    // No menu layer is open, so MenuNav must be entirely out of the way.
    expect(await page.evaluate(() => { const l = window.MenuNav.activeLayer(); return l && l.id; })).toBeFalsy();

    // inputState() is the per-SOURCE snapshot: key.left is the keyboard latch
    // itself, so this asserts the key reached the driving handler rather than
    // asserting on a steering angle that grip and speed also move.
    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(400);
    const held = await page.evaluate(() => window.__apex.inputState().key.left);
    const steer = await page.evaluate(() => window.__apex.inputState());
    await page.keyboard.up("ArrowLeft");
    expect(held, `ArrowLeft still latches the steering input (${JSON.stringify(steer.key)})`).toBe(true);
    expect(await page.evaluate(() => window.__apex.inputState().key.left), "and clears on release").toBe(false);
  });

  /* A MODAL OUTRANKS EVERY z-index, and getting that wrong made the arrow keys
     dead inside most of the game's sheets. Every `.screen.dim` is a real
     <dialog> opened with showModal() (js/game/topmodal.js), and a top-layer
     dialog computes `z-index: auto` — so the old ranking, `parseInt(zIndex)`
     with a NaN fallback of 0, scored the open modal at 0 and handed the layer
     to whatever visible screen sat behind it with a real z-index. Measured on
     the code before this fix: with #standings open over the pause menu,
     activeLayer() returned #overlay. Because onKeyDown preventDefaults before
     it moves, focus() then targeted an inert background node and the browser's
     own fallback was swallowed too: nothing moved at all.
     #standings over #pausemenu (z 30) is the cheapest reproduction; the same
     pairing hit #advanced and #audioset over #pmsettings, the three career
     sheets over #career, #teampicker over #carsetup, and everything opened
     from the title over #overlay. */
  test("an open modal is the active layer, not the screen behind it", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => { try { return window.__apex.info().track === "monza"; } catch (_) { return false; } }, null, { timeout: 20_000 });
    await page.evaluate(() => {
      window.__apex.park(0.1);
      const rd = document.getElementById("rotate-device"); if (rd) rd.hidden = true;
      document.getElementById("pausemenu").hidden = false;
      document.getElementById("standings").hidden = false;
    });
    await page.waitForTimeout(250);

    const seen = await page.evaluate(() => ({
      layer: (window.MenuNav.activeLayer() || {}).id || null,
      modal: document.getElementById("standings").matches(":modal"),
      zIndex: getComputedStyle(document.getElementById("standings")).zIndex,
    }));
    expect(seen.modal, "the standings sheet really is in the top layer").toBe(true);
    expect(seen.zIndex, "…and therefore has no z-index to rank it by").toBe("auto");
    expect(seen.layer).toBe("standings");

    // …and the arrow key lands inside it, which is the behaviour that was lost.
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(200);
    expect(await page.evaluate(() =>
      document.getElementById("standings").contains(document.activeElement))).toBe(true);
  });

  test("with the pause menu up the arrow keys stop reaching the car", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => { try { return window.__apex.info().track === "monza"; } catch (_) { return false; } }, null, { timeout: 20_000 });
    await page.evaluate(() => {
      window.__apex.park(0.1);
      const rd = document.getElementById("rotate-device"); if (rd) rd.hidden = true;
      document.getElementById("pausemenu").hidden = false;
    });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => { const l = window.MenuNav.activeLayer(); return l && l.id; })).toBe("pausemenu");

    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(400);
    const held = await page.evaluate(() => window.__apex.inputState().key.left);
    await page.keyboard.up("ArrowLeft");
    expect(held, "a paused car is not being steered by the menu keys").toBe(false);
    // …and the key did something useful instead.
    expect(await page.evaluate(() => document.getElementById("pausemenu").contains(document.activeElement))).toBe(true);
  });
});

/* ESCAPE IS "BACK" — the contract in js/game/topmodal.js + js/game/uilayers.js.
 *
 * Escape used to be a bare alias for the pause key (js/game/input.js) with no
 * state check at all, so on a desktop keyboard it meant "pause" on screens
 * where the only sensible answer was "close this", and on the three screens
 * that are still plain <div>s it meant nothing whatsoever. Nothing in the suite
 * covered the `data-esc-close` path either — not for the sixteen <dialog>s that
 * had it, nor for the six screens that have just been given it.
 *
 * The contract: a layer names the control Escape should press, so Escape can
 * never do something no visible button does.
 */
test.describe("Escape is BACK", () => {
  test.use({ viewport: DESKTOP });

  // THE STRUCTURAL ONE, and the reason the next screen to be added cannot
  // silently ship without a back key: every layer that claims a back control
  // must actually name one that exists and can be pressed.
  test("every layer's data-esc-close names a real, pressable control", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    const bad = await page.evaluate(() => {
      const out = [];
      for (const id of window.UiLayers.LAYER_IDS) {
        const el = document.getElementById(id);
        if (!el) { out.push({ id, why: "no such element" }); continue; }
        const via = el.getAttribute("data-esc-close");
        if (!via) continue;                       // opting out is allowed
        const btn = document.getElementById(via);
        if (!btn) out.push({ id, why: "data-esc-close=" + via + " names nothing" });
        else if (btn.tagName !== "BUTTON") out.push({ id, why: via + " is a " + btn.tagName });
      }
      return out;
    });
    expect(bad).toEqual([]);
  });

  test("Escape on the circuit picker goes back to the title", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await openSelect(page);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => document.getElementById("select").hidden)).toBe(true);
    expect(await page.evaluate(() => document.getElementById("overlay").hidden)).toBe(false);
  });

  /* THE GARAGE, which had no back key at all — and could not simply be pointed
     at DONE, because DONE goes FORWARD: reached from the circuit picker it
     lands on race settings, so an Escape wired to it would have walked the
     player further INTO the flow. js/game.js grew a real BACK button
     (garageBack) that returns to whichever screen opened the garage, and
     data-esc-close points at that. */
  test("Escape in the GARAGE goes back to where it was opened from", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await openSelect(page);
    // START on the picker opens the GARAGE with garageReturn = "select" — the
    // exact path where DONE goes forward to race settings.
    await page.locator("#sel-go").click();
    await page.locator("#carsetup").waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.getElementById("carsetup").hidden)).toBe(true);
    // BACK, not DONE: race settings is what DONE would have opened.
    expect(await page.evaluate(() => document.getElementById("race-settings").hidden)).toBe(true);
    expect(await page.evaluate(() => document.getElementById("select").hidden)).toBe(false);
  });

  // Escape on the title screen has nothing to close and no race to pause, so it
  // must be an inert no-op rather than an exception or a phantom pause.
  test("Escape on the title screen does nothing at all", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => ({
      overlay: document.getElementById("overlay").hidden,
      pause: document.getElementById("pausemenu").hidden,
    }))).toEqual({ overlay: false, pause: true });
  });

  /* Mid-race with a sheet up, Escape closes the SHEET and leaves the race
     paused. The old code could not express this: #standings was in the overlay
     list so Escape was swallowed entirely, and for #lighting/#camtune — which
     were in NO list — it fell through to the pause toggle and RESUMED THE RACE
     instead of stepping back to SETTINGS. */
  test("Escape closes a sheet without resuming the race under it", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => { try { return window.__apex.info().track === "monza"; } catch (_) { return false; } }, null, { timeout: 20_000 });
    await page.evaluate(() => {
      window.__apex.park(0.1);
      const rd = document.getElementById("rotate-device"); if (rd) rd.hidden = true;
    });
    await page.locator("#pausebtn").click();
    await page.locator("#pausemenu").waitFor({ state: "visible" });
    // Shown rather than clicked open: #pm-standings ships hidden and is only
    // revealed part-way into a season, so a plain Grand Prix has no button for
    // it. The sheet's own open path is `hidden = false` either way (TopModal
    // mirrors that onto showModal), which is exactly what is under test here.
    await page.evaluate(() => { document.getElementById("standings").hidden = false; });
    await page.waitForTimeout(250);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => ({
      standings: document.getElementById("standings").hidden,
      pause: document.getElementById("pausemenu").hidden,
    }))).toEqual({ standings: true, pause: false });
  });
});
