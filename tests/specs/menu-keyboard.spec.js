// @ts-check
// Desktop menu input — js/ui/menu-nav.js.
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
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

const DESKTOP = { width: 1440, height: 760 };

async function waitReady(page) {
  // BOOT_MS, not a hand-rolled 15 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: BOOT_MS });
}

async function openSelect(page) {
  await page.evaluate(() => document.getElementById("mb-race").click());
  await page.waitForFunction(() => !document.getElementById("select").hidden, null, { polling: 100, timeout: 8_000 });
  // the circuit list is filled by menus.js; wait for rows before measuring
  await page.waitForFunction(() => document.querySelectorAll("#sel-tracks .track-row").length > 5, null, { polling: 100, timeout: 8_000 });
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

  test("PageDown travels about one pane-height at every UI scale", async ({ page }) => {
    // scrollPane takes viewport px and divides by the pane's zoom; feeding it
    // the local clientHeight uncorrected made a page step travel local/zoom²:
    // 45% of the pane at UI SIZE 200%, 225% at 40% — 1.35 pane-heights of
    // content skipped unseen. Relative assertion: the travel is PAGE_FRAC of
    // the pane in the pane's own units, whatever the zoom. Gamepad LT/RT
    // dispatch these same keys.
    await page.goto("/"); await waitReady(page);
    await openSelect(page);
    for (const pct of [100, 150, 200]) {
      await page.evaluate((p) => window.__apex.uiScale(p), pct);
      await page.waitForTimeout(150);
      const r = await page.evaluate(() => {
        const list = document.getElementById("sel-tracks");
        list.scrollTop = 0;
        const row = list.querySelector(".track-row");
        row.focus();
        row.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", bubbles: true, cancelable: true }));
        return { moved: list.scrollTop, pane: list.clientHeight,
                 max: list.scrollHeight - list.clientHeight };
      });
      if (r.max < r.pane) continue; // not enough content to measure a full page at this scale
      expect(r.moved / r.pane, `travel at ${pct}% is ~0.9 pane-heights`).toBeGreaterThan(0.7);
      expect(r.moved / r.pane, `travel at ${pct}% is not a double page`).toBeLessThan(1.05);
    }
    await page.evaluate(() => window.__apex.uiScale(null));
  });

  test("End reaches the last livery card, past the content-visibility render boundary", async ({ page }) => {
    // The livery grid rows are content-visibility:auto; rows outside the
    // render margin have zero rects, so a scope built through the shown()
    // rect gate would stop End ~1.5 viewports down instead of the last card.
    // 200% UI size, or on a desktop viewport the whole grid fits and there is
    // no scroller (End then correctly addresses the layer, not the grid).
    await page.goto("/"); await waitReady(page);
    await page.evaluate(() => window.__apex.uiScale(200));
    await page.evaluate(() => document.getElementById("mb-garage").click());
    await page.waitForFunction(() => !document.getElementById("carsetup").hidden, null, { polling: 100, timeout: 8_000 });
    await page.evaluate(() => {
      [...document.querySelectorAll("#cs-tabs .cs-tab")].find((e) => /LIVERY/i.test(e.textContent))?.click();
    });
    await page.waitForFunction(() => document.querySelectorAll("#cs-options .cs-liv-row .cs-liv").length > 20, null, { polling: 100, timeout: 8_000 });
    const r = await page.evaluate(() => {
      const opts = document.getElementById("cs-options");
      opts.scrollTop = 0;
      const rows = [...opts.querySelectorAll(".cs-liv-row")];
      const first = rows[0].querySelector(".cs-liv");
      first.focus();
      first.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
      const a = document.activeElement;
      const box = a.getBoundingClientRect();
      // The last focusable is the last row's focus-revealed EDIT affordance,
      // not the card button itself — either way, focus must be in the LAST
      // row, not stranded at the render boundary ~1.5 viewports down.
      return { scrolls: opts.scrollHeight > opts.clientHeight + 1,
               inLastRow: rows[rows.length - 1].contains(a),
               count: rows.length, rendered: box.height > 0 };
    });
    await page.evaluate(() => window.__apex.uiScale(null));
    test.skip(!r.scrolls, "the grid fits this viewport whole — no render boundary to cross");
    expect(r.count).toBeGreaterThan(20);
    expect(r.inLastRow, "End landed in the LAST row, not the render boundary").toBe(true);
    expect(r.rendered, "focus made the skipped row render").toBe(true);
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

  test("circuit filter tabs and selected circuit expose distinct semantics", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await openSelect(page);
    await expect(page.locator("#sel-tracks")).toHaveAttribute("role", "group");
    await expect(page.locator("#sel-tracks [role=listbox]")).toHaveCount(0);
    await expect(page.locator("#sel-tracks .track-row[aria-pressed=true]")).toHaveCount(1);

    await page.locator('#sel-track-filter [data-filter="all"]').focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('#sel-track-filter [data-filter="season"]')).toBeFocused();
    // aria-pressed, NOT aria-selected: the chips are plain buttons in a
    // role="group" (no listbox/tablist here — asserted above), and
    // aria-selected is only valid on option/tab/row/gridcell. This line
    // asserted aria-selected from its birth commit while menus.js has always
    // set aria-pressed on the filter chips — red on the base since 1496.
    await expect(page.locator('#sel-track-filter [data-filter="season"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('#sel-track-filter [data-filter="season"]')).not.toHaveAttribute("aria-selected", /./);
    await expect(page.locator("#sel-tracks .trb-classic")).toHaveCount(0);

    await page.locator('.track-row[aria-label="MONZA"]').click();
    await expect(page.locator('.track-row[aria-label="MONZA"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('#sel-tracks .track-row[aria-pressed="true"]')).toHaveCount(1);
  });

  test("with a race running the arrow keys drive the car, not the menu", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => { try { return window.__apex.info().track === "monza"; } catch (_) { return false; } }, null, { polling: 100, timeout: BOOT_MS });
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
     <dialog> opened with showModal() (js/ui/modal.js), and a top-layer
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
    await page.waitForFunction(() => { try { return window.__apex.info().track === "monza"; } catch (_) { return false; } }, null, { polling: 100, timeout: BOOT_MS });
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

  /* THE DEFECT THIS PINS: #track-detail used to be `role="dialog"
     aria-modal="true"` on a plain <div> — a claim the platform never
     enforced, since there was no showModal() and so no top layer and no
     inert background. Tab walked straight out of it into #select sitting
     behind it (docs/research/PLATFORM-INPUT-NOTES.md §9a). It is now a real
     <dialog> (js/ui/modal.js), so the platform makes the background
     genuinely inert.

     WHAT NOT TO ASSERT: #track-detail has exactly one focusable descendant
     (the close button), and a native modal with a single focusable control
     does not "wrap" Tab back onto itself — measured (real Chromium, this
     harness): Tab bounces close-button -> <body> -> close-button -> <body>,
     never landing in #track-detail. That is correct, spec-shaped <dialog>
     behaviour, not a leak, so asserting focus stays a DOM descendant of
     #track-detail on every single Tab is the wrong test — it fails on
     platform-correct behaviour the moment there is only one thing to tab to.
     The property that actually matters, and the one the old <div> broke, is
     that focus never reaches a CONTROL BEHIND the dialog: walked via Tab, and
     probed directly, since `showModal()` makes the background inert to
     scripted `.focus()` too, not just to keyboard navigation. */
  test("Tab cannot escape the track-detail dialog into the select screen behind it", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await openSelect(page);
    // Opens via openTrackDetail() in js/ui/select-screen.js — the circuit preview
    // map on the select screen, same trigger tests/specs/ui-audit.spec.js uses.
    await page.locator("#sel-preview-map").click();
    await page.locator("#track-detail").waitFor({ state: "visible" });
    /* WAIT FOR MODAL, DO NOT SLEEP TOWARD IT.
       This was `waitForTimeout(300)` and it produced a red `:modal` assertion
       under load — the ui group at two workers — which read as a product bug
       for hours. It is a race. openTrackDetail() reveals the dialog through
       vt() (js/ui/select-screen.js), a startViewTransition wrapper with a 60 ms
       setTimeout safety net, so `hidden` clears asynchronously; TopModal's
       MutationObserver then calls showModal(). Visible therefore arrives
       BEFORE modal, and 300 ms is a guess about how much before.
       `polling: 100` is required rather than decorative here: this screen is
       the worst case for the default rAF polling, because vt()'s own comment
       records that the game PARKS ITS rAF LOOP behind a menu — a raf-polled
       predicate on a document that has stopped producing frames is not slow,
       it is stopped. See docs/TESTING.md. */
    await page.waitForFunction(
      () => document.getElementById("track-detail")?.matches(":modal") === true,
      null, { polling: 100, timeout: 5_000 });

    expect(await page.evaluate(() =>
      document.getElementById("track-detail").matches(":modal")), "real top-layer dialog").toBe(true);
    expect(await page.evaluate(() =>
      document.getElementById("track-detail").contains(document.activeElement)),
      "showModal() parked focus inside the dialog").toBe(true);

    // The failure mode being pinned: focus must never reach a control on the
    // (still open, still painted) #select screen sitting behind the dialog —
    // walked with repeated Tabs, in either direction.
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      const inSelect = await page.evaluate(() =>
        document.getElementById("select").contains(document.activeElement));
      expect(inSelect, `Tab #${i + 1} did not land on a control in #select`).toBe(false);
    }

    // The stronger form of the same claim: the background is INERT, not just
    // unreached by Tab — a direct scripted focus() on a #select control must
    // also fail while the dialog is modal, or a keyboard shortcut / script
    // could still reach behind the "modal" the way it always could on a div.
    const stolen = await page.evaluate(() => {
      const btn = document.getElementById("sel-go");
      btn.focus();
      return document.activeElement === btn;
    });
    expect(stolen, "a direct focus() on a background control fails while the dialog is modal").toBe(false);
  });

  test("with the pause menu up the arrow keys stop reaching the car", async ({ page }) => {
    await page.goto("/"); await waitReady(page);
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => { try { return window.__apex.info().track === "monza"; } catch (_) { return false; } }, null, { polling: 100, timeout: BOOT_MS });
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

/* ESCAPE IS "BACK" — the contract in js/ui/modal.js + js/ui/layers.js.
 *
 * Escape used to be a bare alias for the pause key (js/input/input.js) with no
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
    await page.waitForFunction(() => { try { return window.__apex.info().track === "monza"; } catch (_) { return false; } }, null, { polling: 100, timeout: BOOT_MS });
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
