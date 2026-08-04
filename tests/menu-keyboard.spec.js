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

    for (const sel of ["#sel-preview-map", "#sel-preview-info", ".sheet-head", "#sel-left", ".sheet-foot"]) {
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
    await page.evaluate(() => document.getElementById("sel-setup").focus());
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
    await page.locator("#sel-setup").click();
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
