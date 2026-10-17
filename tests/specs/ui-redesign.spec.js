// @ts-check
// Focused browser contract for the redesign foundation. One page visits every
// changed surface so SwiftShader boot cost is paid once rather than per assertion.
import { test, expect, BOOT_MS, awaitTrackBuild } from "../helpers/fixtures.js";

test.use({ viewport: { width: 852, height: 393 }, hasTouch: true });

// Shipped HELMET cam + large type change compact HUD geometry. Pin the previous
// look so this file stays a redesign-fit contract, not a camera-default test.
const PIN_PREVIOUS_LOOK = () => {
  try {
    localStorage.setItem("apex26.textSize", '"normal"');
    localStorage.setItem("apex26.uiContrast", '"off"');
    localStorage.setItem("apex26.homeScene", '"garage"');
    localStorage.setItem("apex26.camMode", "3");
  } catch (_) {}
};

async function waitReady(page) {
  await page.addInitScript(PIN_PREVIOUS_LOOK);
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 20 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex && window.__apex.race,
    null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.headless(true));
}

test("circuit picker initially exposes portrait search and short-landscape selected name", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 659 });
  await waitReady(page);
  await page.click("#mb-race");
  await expect(page.locator("#sel-inner")).toHaveAttribute("data-shape", "tall");

  // Measure before focusing/clicking: either action can scroll a clipped
  // field into view and conceal the initial-state regression.
  const visibleFraction = (selector) => page.evaluate((selector) => {
    const el = document.querySelector(selector);
    const r = el.getBoundingClientRect();
    let left = Math.max(0, r.left), right = Math.min(innerWidth, r.right);
    let top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p), pr = p.getBoundingClientRect();
      if (/^(auto|scroll|hidden|clip)$/.test(cs.overflowX)) {
        left = Math.max(left, pr.left); right = Math.min(right, pr.right);
      }
      if (/^(auto|scroll|hidden|clip)$/.test(cs.overflowY)) {
        top = Math.max(top, pr.top); bottom = Math.min(bottom, pr.bottom);
      }
    }
    return r.width > 0 && r.height > 0
      ? Math.max(0, right - left) * Math.max(0, bottom - top) / (r.width * r.height) : 0;
  }, selector);
  await expect.poll(() => visibleFraction("#sel-track-search")).toBeGreaterThan(0.98);
  await page.locator("#sel-track-search").fill("monaco");
  await expect(page.locator("#sel-tracks .track-row:not([hidden])")).toHaveCount(1);
  await page.locator("#sel-track-search").fill("");
  await page.locator("#sel-track-search").blur();

  await page.setViewportSize({ width: 734, height: 343 });
  await expect(page.locator("#sel-inner")).toHaveAttribute("data-density", "compact");
  await expect(page.locator("#sel-inner")).not.toHaveAttribute("data-shape", "tall");
  // A previous focus must not carry a scroll offset into this initial view.
  await page.evaluate(() => {
    document.getElementById("sel-track-section").scrollTop = 0;
    document.getElementById("sel-track-filter").scrollLeft = 0;
  });
  await expect.poll(() => visibleFraction("#sel-preview-name")).toBeGreaterThan(0.98);
  await expect.poll(() => visibleFraction("#sel-go")).toBeGreaterThan(0.98);
});

test("catalogue, garage, settings, data table, and compact multiplayer fit", async ({ page }) => {
  await waitReady(page);

  // Circuit Select (2026-09 redesign): a flag strip across the top, the hero
  // (still + outline + numbers) under it. Search filters tiles in place
  // without rebuilding/focusing away.
  await page.evaluate(() => document.getElementById("mb-race").click());
  await page.waitForFunction(() => document.querySelectorAll("#sel-tracks .track-row").length > 20,
    null, { polling: 100, timeout: 10_000 });
  await page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => window.SheetShape?.reclassify());
  const initialSelect = await page.evaluate(() => {
    const sel = document.getElementById("sel-inner");
    const map = /** @type {HTMLCanvasElement} */ (document.getElementById("sel-preview-map"));
    const hero = document.getElementById("sel-hero").getBoundingClientRect();
    const strip = document.getElementById("sel-tracks");
    const sr = strip.getBoundingClientRect();
    const r = map.getBoundingClientRect();
    const zoom = map.currentCSSZoom || 1;
    const bufferAspect = map.width / Math.max(1, map.height);
    const boxAspect = (r.width / zoom) / Math.max(1, r.height / zoom);
    return {
      pair: sel.dataset.pair,
      density: sel.dataset.density,
      classes: sel.className,
      stripPans: strip.scrollWidth - strip.clientWidth > 1,
      stripAboveHero: sr.bottom <= hero.top + 1,
      heroH: hero.height,
      mapInsideHero: r.top >= hero.top - 1 && r.bottom <= hero.bottom + 1 && r.left >= hero.left - 1 && r.right <= hero.right + 1,
      skew: Math.abs(bufferAspect - boxAspect) / Math.max(bufferAspect, boxAspect, 0.001),
    };
  });
  // 852×393 is under #sel-inner's --compact-at 480; there is no pane to pair.
  expect(initialSelect.density, JSON.stringify(initialSelect)).toBe("compact");
  expect(initialSelect.pair, "SELECT left the pane-pair primitive").toBeUndefined();
  expect(initialSelect.classes).not.toContain("pane-pair");
  expect(initialSelect.stripPans, "40 flags pan sideways on a landscape phone").toBe(true);
  expect(initialSelect.stripAboveHero, "the strip sits above the hero").toBe(true);
  expect(initialSelect.heroH, "the hero keeps a real still slot").toBeGreaterThan(80);
  expect(initialSelect.mapInsideHero, "the outline is drawn inside the hero").toBe(true);
  expect(initialSelect.skew, "the outline canvas is not CSS-squashed").toBeLessThan(0.05);
  // Match a landscape iPhone's notched safe area at a larger user-selected UI
  // size. The toolbar must stay one pannable row and the strip must keep at
  // least one whole tile in view before the player scrolls anything.
  await page.evaluate(() => {
    const root = document.documentElement.style;
    root.setProperty("--sal", "59px"); root.setProperty("--sar", "59px");
    root.setProperty("--sab", "21px");
    if (window.__apex && window.__apex.uiScale) window.__apex.uiScale(150);
  });
  await page.waitForFunction(() => {
    const sel = document.getElementById("sel-inner");
    return sel?.dataset.density === "compact" && sel.dataset.shape !== "tall";
  }, null, { polling: 100, timeout: 10_000 });
  const compactCatalogue = await page.evaluate(() => {
    const list = document.getElementById("sel-tracks").getBoundingClientRect();
    const first = document.querySelector("#sel-tracks .track-row:not([hidden])").getBoundingClientRect();
    const hero = document.getElementById("sel-hero").getBoundingClientRect();
    const filter = document.getElementById("sel-track-filter").getBoundingClientRect();
    const controls = [...document.querySelectorAll("#sel-track-filter .sel-chip, #sel-track-search")]
      .map((el) => el.getBoundingClientRect());
    return {
      firstVisible: Math.max(0, Math.min(list.right, first.right) - Math.max(list.left, first.left)),
      oneRow: Math.max(...controls.map((r) => r.top)) - Math.min(...controls.map((r) => r.top)) < 2,
      heroH: hero.height,
      geometry: {
        filter: [filter.top, filter.bottom, filter.height], list: [list.top, list.bottom, list.height],
        first: [first.left, first.right, first.width], hero: [hero.top, hero.bottom, hero.height],
      },
    };
  });
  expect(compactCatalogue.oneRow, "compact filter oneRow").toBe(true);
  expect(compactCatalogue.firstVisible, JSON.stringify(compactCatalogue.geometry)).toBeGreaterThanOrEqual(24);
  expect(compactCatalogue.heroH, "the still survives 150% on a notched phone").toBeGreaterThan(60);
  // At the slider maximum the toolbar stays ONE row (nowrap; it pans rather
  // than wrap into the hero's height) and the strip still shows whole flags.
  await page.evaluate(() => {
    window.__apex.uiScale(200);
    window.SheetShape?.reclassify();
  });
  await page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const maxScaleCatalogue = await page.evaluate(() => {
    window.SheetShape?.reclassify();
    const sel = document.getElementById("sel-inner");
    const list = document.getElementById("sel-tracks");
    const filter = document.getElementById("sel-track-filter");
    const lr = list.getBoundingClientRect();
    const rr = document.querySelector("#sel-tracks .track-row:not([hidden])").getBoundingClientRect();
    const cs = getComputedStyle(filter);
    return {
      horizontalToolbar: filter.scrollWidth > filter.clientWidth,
      firstVisible: Math.max(0, Math.min(lr.right, rr.right) - Math.max(lr.left, rr.left)),
      dump: {
        localW: sel.clientWidth,
        zoom: getComputedStyle(sel).zoom,
        sheetScale: sel.style.getPropertyValue("--sheet-scale"),
        fit: sel.dataset.fit,
        scrollW: filter.scrollWidth,
        clientW: filter.clientWidth,
        wrap: cs.flexWrap,
        overflowX: cs.overflowX,
      },
    };
  });
  expect(maxScaleCatalogue.dump.wrap, "200% one-row toolbar " + JSON.stringify(maxScaleCatalogue.dump)).toBe("nowrap");
  expect(maxScaleCatalogue.dump.overflowX).toBe("auto");
  expect(maxScaleCatalogue.firstVisible).toBeGreaterThanOrEqual(24);
  await page.evaluate(() => {
    const root = document.documentElement.style;
    root.removeProperty("--sal"); root.removeProperty("--sar"); root.removeProperty("--sab");
    if (window.__apex && window.__apex.uiScale) window.__apex.uiScale(null);
  });
  const searched = await page.evaluate(() => {
    const input = /** @type {HTMLInputElement} */ (document.getElementById("sel-track-search"));
    input.focus(); input.value = "monaco";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const rows = [...document.querySelectorAll("#sel-tracks .track-row")];
    return {
      active: document.activeElement === input,
      shown: rows.filter((row) => !row.hidden).map((row) => row.getAttribute("aria-label")),
      hidden: rows.filter((row) => row.hidden).length,
      emptyHidden: document.getElementById("sel-track-empty").hidden,
    };
  });
  expect(searched.active, "search focused").toBe(true);
  expect(searched.shown.length).toBeGreaterThan(0);
  expect(searched.shown.every((name) => /monaco/i.test(name)), "all monaco").toBe(true);
  expect(searched.hidden).toBeGreaterThan(20);
  expect(searched.emptyHidden, "empty hidden").toBe(true);

  // Short landscape select: the body is not a scroller; the strip stays a
  // sideways strip; the hero section is the ONLY vertical scroll region and the
  // foot spans the sheet.
  await page.evaluate(() => {
    const input = /** @type {HTMLInputElement} */ (document.getElementById("sel-track-search"));
    input.value = ""; input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.setViewportSize({ width: 568, height: 320 });
  await page.waitForFunction(() => {
    const hero = document.getElementById("sel-hero");
    return hero && hero.getBoundingClientRect().height > 40;
  }, null, { polling: 100, timeout: 10_000 });
  await page.evaluate(() => window.ScrollFade && window.ScrollFade.refresh());
  const stackedSel = await page.evaluate(() => {
    const inner = document.getElementById("sel-inner");
    const body = document.getElementById("sel-body");
    const list = document.getElementById("sel-tracks");
    const section = document.getElementById("sel-track-section");
    const foot = inner.querySelector(".sheet-foot");
    const input = /** @type {HTMLInputElement} */ (document.getElementById("sel-track-search"));
    const vertical = [...inner.querySelectorAll("*")].filter((el) => {
      const oy = getComputedStyle(el).overflowY;
      return (oy === "auto" || oy === "scroll") && el.scrollHeight - el.clientHeight > 1;
    }).map((el) => el.id || el.className);
    const out = {
      bodyOY: getComputedStyle(body).overflowY,
      listOX: getComputedStyle(list).overflowX,
      listOY: getComputedStyle(list).overflowY,
      sectionOY: getComputedStyle(section).overflowY,
      vertical,
      innerH: inner.getBoundingClientRect().height,
      innerW: inner.getBoundingClientRect().width,
      footW: foot.getBoundingClientRect().width,
      stripTop: list.getBoundingClientRect().top,
      heroTop: document.getElementById("sel-hero").getBoundingClientRect().top,
    };
    input.focus(); input.value = "spa";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const shown = [...document.querySelectorAll("#sel-tracks .track-row")]
      .filter((row) => !row.hidden).length;
    return { ...out, active: document.activeElement === input, shown };
  });
  expect(["auto", "scroll"]).not.toContain(stackedSel.bodyOY);
  expect(["auto", "scroll", "overlay"]).toContain(stackedSel.listOX);
  expect(stackedSel.listOY).toBe("hidden");
  expect(["auto", "scroll", "overlay"]).toContain(stackedSel.sectionOY);
  // Whatever scrolls vertically here is the hero section (or its numbers
  // column) — never the body, never the strip.
  expect(stackedSel.vertical.every((id) => id === "sel-track-section" || id === "sel-preview-info"), JSON.stringify(stackedSel.vertical)).toBe(true);
  expect(stackedSel.stripTop).toBeLessThan(stackedSel.heroTop);
  expect(stackedSel.footW / stackedSel.innerW).toBeGreaterThan(0.95);
  expect(stackedSel.active).toBe(true);
  expect(stackedSel.shown).toBeGreaterThan(0);

  // Compact-wide garage: 852×393 is over --pair-at 400 but under --compact-at
  // 480, so without the compact stack the rail/list split still fires.
  await page.setViewportSize({ width: 852, height: 393 });
  await page.evaluate(() => {
    const input = /** @type {HTMLInputElement} */ (document.getElementById("sel-track-search"));
    input.value = ""; input.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("sel-car").click();
  });
  // openSetup() unhides #carsetup and sets aria-busy, then buildSetup() runs
  // after two rAFs (so Change Car never freezes on the click stack). Pair /
  // density can classify while busy is still set and #cs-tabs is empty —
  // CI 37680910253 (#1243 tip) hit tabs.count === 0 at the tall assert below
  // because this wait returned one frame early. Wait out busy + real tabs.
  await page.waitForFunction(() => {
    const setup = document.getElementById("carsetup");
    const inner = document.getElementById("cs-inner");
    return setup && !setup.hidden && !setup.hasAttribute("aria-busy")
      && inner?.dataset.pair === "off" && inner.dataset.density === "compact"
      && document.querySelectorAll('#cs-tabs [role="tab"]').length > 10;
  }, null, { polling: 100, timeout: 10_000 });
  const compactWideGarage = await page.evaluate(() => {
    const tabsEl = document.getElementById("cs-tabs");
    const opts = document.getElementById("cs-options");
    const tcs = getComputedStyle(tabsEl);
    return {
      pair: document.getElementById("cs-inner").dataset.pair,
      density: document.getElementById("cs-inner").dataset.density,
      tabsOY: tcs.overflowY,
      tabsOX: tcs.overflowX,
      rowDisplay: [...tabsEl.querySelectorAll(".cs-tab-row")].map((row) => getComputedStyle(row).display),
      optsOY: getComputedStyle(opts).overflowY,
    };
  });
  expect(compactWideGarage.pair).toBe("off");
  expect(compactWideGarage.density).toBe("compact");
  expect(["auto", "scroll"]).not.toContain(compactWideGarage.tabsOY);
  // A COMPACT stacked garage is ONE pan-x strip: #cs-tabs is the sideways
  // scroller and both named rows are `display: contents`, so they flatten into
  // it with no scroll of their own (the pair rail's mechanism). It replaced the
  // 7×2 grid of 31px tabs because one 52px-floor strip, with BACK/DONE riding
  // beside it, gives the options list ~2× the height — measured 2026-10-05
  // (layout-audit): #cs-options 80 -> 182 px landscape, 62 -> 229 px portrait.
  // This assertion was last rewritten when the grid landed; it moves with the
  // design, never the CSS with it.
  expect(["auto", "scroll"]).toContain(compactWideGarage.tabsOX);
  expect(compactWideGarage.rowDisplay.every((d) => d === "contents"), JSON.stringify(compactWideGarage.rowDisplay)).toBe(true);
  expect(["auto", "scroll", "overlay"]).toContain(compactWideGarage.optsOY);

  // Garage stacked: portrait sheet is under --pair-at 400 — a strip, not a grid.
  await page.setViewportSize({ width: 390, height: 844 });
  // Wait for the SHAPE to settle, not just the pair flag: pair was already
  // "off" in the compact-wide state above, so a pair-only wait passes before
  // SheetShape's ResizeObserver reclassifies — and the measure below then
  // still sees the compact 7×2 grid (overflow hidden) instead of the strip.
  // Also require tabs still present: a shape-only wait can win the same
  // openSetup rAF race if the compact wait above ever regresses.
  await page.waitForFunction(() => {
    const setup = document.getElementById("carsetup");
    const inner = document.getElementById("cs-inner");
    return setup && !setup.hidden && !setup.hasAttribute("aria-busy")
      && inner && inner.dataset.pair !== "on" && inner.dataset.shape === "tall"
      && document.querySelectorAll('#cs-tabs [role="tab"]').length > 10;
  }, null, { polling: 100, timeout: 10_000 });
  const tabs = await page.evaluate(() => {
    const all = [...document.querySelectorAll('#cs-tabs [role="tab"]')];
    const selected = all.filter((tab) => tab.getAttribute("aria-selected") === "true");
    return {
      count: all.length,
      stops: all.filter((tab) => tab.tabIndex === 0).length,
      selected: selected.length,
      controls: selected[0]?.getAttribute("aria-controls"),
      labelled: document.getElementById("cs-options").getAttribute("aria-labelledby"),
      selectedId: selected[0]?.id,
    };
  });
  expect(tabs.count).toBeGreaterThan(10);
  expect(tabs.stops).toBe(1);
  expect(tabs.selected).toBe(1);
  expect(tabs.controls).toBe("cs-options");
  expect(tabs.labelled).toBe(tabs.selectedId);
  await page.evaluate(() => window.ScrollFade && window.ScrollFade.refresh());
  const stackedGarage = await page.evaluate(() => {
    const tabsEl = document.getElementById("cs-tabs");
    const opts = document.getElementById("cs-options");
    const body = document.getElementById("cs-body");
    const tcs = getComputedStyle(tabsEl);
    const rowOX = [...tabsEl.querySelectorAll(".cs-tab-row")].map((row) => getComputedStyle(row).overflowX);
    const rowDisplay = [...tabsEl.querySelectorAll(".cs-tab-row")].map((row) => getComputedStyle(row).display);
    return {
      pair: document.getElementById("cs-inner").dataset.pair,
      density: document.getElementById("cs-inner").dataset.density,
      rowDisplay,
      tabsOY: tcs.overflowY,
      tabsOX: tcs.overflowX,
      rowOX,
      optsOY: getComputedStyle(opts).overflowY,
      bodyOY: getComputedStyle(body).overflowY,
      tabsSf: tabsEl.classList.contains("sf-scroll"),
      optsSf: opts.classList.contains("sf-scroll"),
      role: tabsEl.getAttribute("role"),
    };
  });
  expect(stackedGarage.pair).not.toBe("on");
  expect(["auto", "scroll"]).not.toContain(stackedGarage.tabsOY);
  // Tall stacked is ONE pan-x strip at every density: #cs-tabs scrolls
  // sideways and both named rows are `display: contents`. A roomy tall sheet
  // (this 390×844 window) used to keep two sideways rows inside a clipped
  // #cs-tabs — measured SUSP mid-clip + #cs-options 145px with DRIVER on
  // CLOSE. Compact already used the strip; tall extends it (css/carsetup.css).
  expect(["auto", "scroll"]).toContain(stackedGarage.tabsOX);
  expect(stackedGarage.rowDisplay.every((d) => d === "contents")).toBe(true);
  expect(["auto", "scroll", "overlay"]).toContain(stackedGarage.optsOY);
  expect(["auto", "scroll"]).not.toContain(stackedGarage.bodyOY);
  expect(stackedGarage.tabsSf).toBe(false);
  expect(stackedGarage.role).toBe("tablist");
  await page.evaluate(() => /** @type {HTMLElement} */ (document.querySelector('#cs-tabs [role="tab"]')).focus());
  await page.keyboard.press("End");
  const endTab = await page.evaluate(() => ({
    id: document.activeElement?.id,
    selected: document.activeElement?.getAttribute("aria-selected"),
    labelled: document.getElementById("cs-options").getAttribute("aria-labelledby"),
  }));
  expect(endTab.id).toBe("cs-tab-livery");
  expect(endTab.selected).toBe("true");
  expect(endTab.labelled).toBe("cs-tab-livery");

  // Settings: at 200%, landscape still spends one row on its three categories.
  await page.setViewportSize({ width: 852, height: 393 });
  await page.evaluate(() => {
    document.getElementById("cs-back").click();
    document.getElementById("sel-back").click();
    document.getElementById("mb-settings").click();
    const scale = /** @type {HTMLInputElement} */ (document.getElementById("pm-uiscale"));
    scale.value = "200"; scale.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(() => {
    const sheet = document.getElementById("pmsettings");
    const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale"));
    return sheet && !sheet.hidden && scale >= 1.9;
  }, null, { polling: 100, timeout: 5_000 });
  const settings = await page.evaluate(() => {
    const nav = document.getElementById("pm-settings-index");
    const doors = [...nav.querySelectorAll("button")];
    return {
      doorIds: doors.map((d) => d.id),
      allPainted: doors.every((d) => {
        const r = d.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }),
      overflowX: document.documentElement.scrollWidth - innerWidth,
    };
  });
  // The SETTINGS doors, NAMED rather than counted. This used to be
  // `toBe(6)`, and two shipped features walked past it: b8aa0b6 added the
  // DRIVING door and nothing here moved, so the spec sat red on the deploy
  // branch until an unrelated change happened to select it. A bare count
  // fails with "expected 6, received 7", which says a door appeared but not
  // WHICH — so the next session has to go and find it. This list says it.
  // FIVE on this branch, not the trunk's seven: LIGHTING TUNER and CAMERA TUNER
  // moved OUT of the index and under DISPLAY -> ADVANCED VISUALS. They are
  // relocated, not removed — tests/unit/ui-sheets-audit.test.mjs asserts both
  // ids still exist nested under #pm-panel-display, and this list is the same
  // one it pins, so the two files cannot drift apart.
  // BACKUP & RESTORE (#pm-open-files) became its own door when the settings
  // pages were consolidated — the unit list in ui-sheets-audit.test.mjs has it.
  expect(settings.doorIds).toEqual([
    "pm-open-controls", "pm-open-driving", "pm-open-display",
    "pm-open-appearance", "pm-open-a11y", "pm-audio", "pm-open-files", "pm-open-graphics", "pm-open-visual", "pm-open-progress",
  ]);
  expect(settings.allPainted).toBe(true);
  expect(settings.overflowX).toBeLessThanOrEqual(1);
  await page.evaluate(() => {
    document.getElementById("pm-open-controls").click();
    document.getElementById("pm-advanced").click();
  });
  await page.waitForSelector("#advanced:not([hidden])");
  await page.evaluate(() => window.SheetShape?.reclassify());
  const advanced = await page.evaluate(() => {
    const inner = document.getElementById("pmsettings-inner");
    const panel = document.getElementById("advanced");
    return { fit: inner.dataset.fit, h: panel.getBoundingClientRect().height };
  });
  expect(advanced.fit, "settings 200% short landscape").toBe("on");
  expect(advanced.h).toBeGreaterThan(80);
  await page.evaluate(() => {
    document.getElementById("pm-settings-close").click();
    document.getElementById("pm-settings-close").click();
    document.getElementById("pm-settings-close").click();
  });

  // Last Race: reproduce the production table shape at phone portrait width.
  await page.setViewportSize({ width: 393, height: 844 });
  const tableFit = await page.evaluate(() => {
    const host = document.createElement("div"); host.className = "dh-card";
    host.style.width = "100%"; host.style.position = "fixed"; host.style.inset = "0";
    const content = document.createElement("div"); content.className = "dh-content";
    const table = document.createElement("table"); table.className = "dh-table";
    table.innerHTML = `<thead><tr><th>POS</th><th>DRIVER</th><th class="dh-th-team">TEAM</th><th class="dh-th-grid">GRID</th><th>TIME</th><th>PTS</th></tr></thead>
      <tbody><tr class="dh-lr-p1"><td class="dh-td-pos">1</td><td class="dh-td-driver"><span class="dh-codechip">NOR</span><span class="dh-name">Lando Norris</span></td><td class="dh-td-team">McLaren</td><td class="dh-td-grid">1</td><td class="dh-td-time">1:39:56.180</td><td class="dh-td-pts">25</td></tr></tbody>`;
    content.appendChild(table); host.appendChild(content); document.body.appendChild(host);
    const tr = table.getBoundingClientRect(), cr = content.getBoundingClientRect();
    return { tableLeft: tr.left, tableRight: tr.right, contentLeft: cr.left, contentRight: cr.right,
      docOverflow: document.documentElement.scrollWidth - innerWidth };
  });
  expect(tableFit.tableLeft).toBeGreaterThanOrEqual(tableFit.contentLeft - 1);
  expect(tableFit.tableRight).toBeLessThanOrEqual(tableFit.contentRight + 1);
  expect(tableFit.docOverflow).toBeLessThanOrEqual(1);

  // VS Friend: at 200% on the short landscape viewport the landing actions are
  // sheet-local, both visible in one row, and CLOSE lives in header chrome.
  await page.setViewportSize({ width: 734, height: 343 });
  await page.evaluate(() => {
    document.querySelector("body > .dh-card")?.remove();
    document.getElementById("pmsettings").hidden = true;
    document.getElementById("overlay").hidden = false;
    document.getElementById("mb-vs").click();
  });
  await page.waitForFunction(() => !document.getElementById("vsfriend").hidden,
    null, { polling: 100, timeout: 10_000 });
  // Compact density is what puts HOST/JOIN on one row and CLOSE in the head.
  // `hidden === false` is not enough: Selected specs 2026-09-04 failed this
  // in 10.7s (same body passed in 36.8s the run before) after a slider-only
  // CSS merge that cannot move these boxes. SheetShape's RO had not fired.
  await page.evaluate(() => window.SheetShape?.reclassify());
  // HOST/JOIN same-row was not enough: Selected specs packed-3 on tip 78aa471f
  // (and a local SwiftShader pass) still saw CLOSE 5–6 px under the title band
  // while foot padding/absolute park finished settling after compact reclassify.
  // Wait for closeInHead too — same 10 s / 100 ms poll as the row gate.
  await page.waitForFunction(() => {
    const inner = document.getElementById("vsfriend-inner");
    const host = document.getElementById("vs-host");
    const join = document.getElementById("vs-join");
    const headEl = document.querySelector("#vsfriend .sheet-head");
    const closeEl = document.getElementById("vs-close");
    if (!inner || inner.dataset.density !== "compact" || !host || !join || !headEl || !closeEl) return false;
    const hr = host.getBoundingClientRect();
    const jr = join.getBoundingClientRect();
    const head = headEl.getBoundingClientRect();
    const close = closeEl.getBoundingClientRect();
    const sameRow = hr.width > 0 && jr.width > 0 && Math.abs(hr.top - jr.top) < 2;
    const closeInHead = close.top >= head.top - 1 && close.bottom <= head.bottom + 2;
    return sameRow && closeInHead;
  }, null, { polling: 100, timeout: 10_000 });
  // Head-parked CLOSE needs the deferred overlays/dialogs foot rule (padding
  // longhands 0 + absolute top:0). selected-3 2026-10-11 asserted before the
  // pad zero stuck and saw 0.35*pad overhang past head.bottom.
  await page.waitForFunction(() => {
    const inner = document.getElementById("vsfriend-inner");
    const foot = inner && inner.querySelector(":scope > .sheet-foot");
    if (!inner || inner.dataset.density !== "compact" || !foot) return false;
    if (inner.dataset.shape === "tall") return true;
    const s = getComputedStyle(foot);
    return s.position === "absolute" && parseFloat(s.paddingTop) === 0
      && parseFloat(s.paddingBottom) === 0;
  }, null, { polling: 100, timeout: 10_000 });
  const versus = await page.evaluate(() => {
    const rect = (id) => document.getElementById(id).getBoundingClientRect();
    const body = rect("vs-body"), host = rect("vs-host"), join = rect("vs-join");
    const head = document.querySelector("#vsfriend .sheet-head").getBoundingClientRect();
    const close = rect("vs-close");
    const inner = document.getElementById("vsfriend-inner");
    return {
      density: inner.dataset.density,
      hostInside: host.left >= body.left - 1 && host.right <= body.right + 1,
      joinInside: join.left >= body.left - 1 && join.right <= body.right + 1,
      sameRow: Math.abs(host.top - join.top) < 2,
      closeInHead: close.top >= head.top - 1 && close.bottom <= head.bottom + 2,
      overflowX: document.documentElement.scrollWidth - innerWidth,
      boxes: { body, host, join, head, close },
    };
  });
  const versusDump = JSON.stringify(versus);
  expect(versus.hostInside, "vs host inside body " + versusDump).toBe(true);
  expect(versus.joinInside, "vs join inside body " + versusDump).toBe(true);
  expect(versus.sameRow, "vs host/join one row " + versusDump).toBe(true);
  expect(versus.closeInHead, "vs CLOSE in head " + versusDump).toBe(true);
  expect(versus.overflowX, versusDump).toBeLessThanOrEqual(1);

  // Camera picker: the popup exposes a radio-menu contract, wraps keyboard
  // focus, restores focus on Escape, and an input-free pause still closes it.
  // race() is sync and only KICKS startRace (async ensureScenery). A 45 s
  // info().track poll died on Selected specs after VS FRIEND — startRace was
  // still building (maps/DebrisWorld in the ring, no `race monza` line yet)
  // when BOOT_MS expired. Close the lobby first, then wait on build progress.
  await page.evaluate(() => document.getElementById("vs-close").click());
  await page.waitForFunction(() => document.getElementById("vsfriend").hidden,
    null, { polling: 100, timeout: 10_000 });
  await page.evaluate(() => window.__apex.race("monza"));
  await awaitTrackBuild(page);
  await page.evaluate(() => { window.__apex.go(); window.__apex.jump(0.2, 40); });
  // Lighting tuner is race-only (`pm-lighting` is disabled on the title). Open
  // it from pause → settings → MORE at 200% on the short landscape sheet.
  await page.waitForSelector("#pausebtn:not([hidden])", { timeout: 10_000 });
  await page.setViewportSize({ width: 852, height: 393 });
  await page.evaluate(() => {
    if (typeof GameHud !== "undefined" && GameHud.invalidateFit) GameHud.invalidateFit();
  });
  // SETTLE BEFORE MEASURING. The race HUD was fitted at 734x343 a moment ago,
  // and fitHud re-caps --hud-z-top on its next 10 Hz tick at the new size.
  // Reading straight after the resize caught the map BETWEEN the two (CI
  // 37245582225, PR #904): --hud-z-top already gone from :root, the map still
  // styled at the old 0.864 cap, so the resolved width came back as its laid-out
  // 110px over that stale zoom — 127.315px.
  //
  // A TRANSITION IS THE OTHER HALF. This project pins reduced motion, and
  // css/hud.css gives every #hud descendant `transition-duration: 0.01ms` under
  // :root[data-motion="reduce"]; transition-property stays at its default
  // `all`, which includes `zoom` and `width`. So each --hud-z-top write starts
  // CSSTransitions on #minimap, and until they retire the map's rect,
  // currentCSSZoom and getComputedStyle can disagree. Three widths seen against
  // 110 on 2026-10-07:
  //   124 - Pages 37714419183 selected-4 (f9cda6b52): mmCss 123.735 = rect
  //         87.109 (110 x zTop 0.792) / stale zoom 0.704 (also 102 = 44 / 0.433
  //         against a 0.4 fit, and 122);
  //   107 - ship CI 37718135591 on 73648b665 (#1267): mmCss = rect = 107.469 at
  //         zoom 1 with --hud-z-top unset, consistent with a width transition
  //         still holding 110 x the previous ~0.977 cap after the cap dropped.
  // The fit also republishes the cap after the map first matches (measured
  // locally: 0.714 -> 0.4 -> 0.709 -> 0.4 inside ~0.4 s, then 0.4 -> 0.709
  // again ~3 s later), and a transition's start value can sit still for more
  // than one frame, so neither "zoom == cap, then read in a later evaluate" nor
  // #1267's "unchanged across two frames" is enough (locally #1267's wait passed
  // with a zoom transition still running, zoom 0.53 vs zTop 0.806, 4 of 4 runs).
  //
  // So check and read in ONE synchronous snapshot, polled IN the page (a frame,
  // then 100 ms, 10 s cap): the map's zoom must equal the zoom fitHud published
  // (--hud-z-top when the fit caps the band, --hud-scale when it does not), no
  // transition/animation of any property may be pending or running on the map,
  // and the computed width must round-trip through that zoom to the laid-out
  // rect. CAPPED OR NOT, the rule under test is the same: compact density makes
  // the map 110 CSS px, painted at 110 x that effective zoom. Both are asserted
  // below from the settled snapshot; the 110 expectation is unchanged, and if
  // the map never settles inside 10 s the spec fails here, loudly, with the
  // last snapshot.
  //
  // #minimap rides `zoom: var(--hud-z)`, so its COMPUTED width is a zoomed
  // round-trip and 96px can come back as 95.99xx. Dump the zoom, both scales,
  // the fit pass's cap and any live animation alongside it, so the next failure
  // names its own cause instead of leaving a bare number to bisect (this one
  // cost a day).
  const compactHud = await page.evaluate(async () => {
    const snap = () => {
      const mm = document.getElementById("minimap"), root = document.documentElement;
      const cs = getComputedStyle(root);
      const mmCs = mm ? getComputedStyle(mm) : null;
      const mmCss = mmCs ? mmCs.width : "";
      const mmRect = mm ? mm.getBoundingClientRect().width : null;
      const anims = mm ? mm.getAnimations()
        .filter((a) => a.playState === "running" || a.pending)
        .map((a) => (a.transitionProperty || a.animationName || "?") + ":" + a.playState) : [];
      const zoom = mm ? mm.currentCSSZoom : null;
      const zTop = root.style.getPropertyValue("--hud-z-top");
      const want = +zTop || +cs.getPropertyValue("--hud-scale") || 1;
      const density = document.body.dataset.density;
      const settled = !!mm && innerWidth === 852 && density === "compact"
        && anims.length === 0
        && Math.abs((zoom || 1) - want) < 1e-3
        && Math.abs(parseFloat(mmCss) * (zoom || 1) - mmRect) < 0.5;
      return {
        settled,
        want,
        capped: !!zTop,
        density,
        mmCss,
        mmRect,
        zoom,
        zTop,
        hudScale: cs.getPropertyValue("--hud-scale").trim(),
        uiScale: cs.getPropertyValue("--ui-scale").trim(),
        gapShort: "gapShort" in root.dataset,
        gapDrop: "gapDrop" in root.dataset,
        anims,
      };
    };
    const t0 = performance.now();
    for (;;) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const s = snap();
      if (s.settled || performance.now() - t0 > 10_000) return s;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  });
  expect(compactHud.settled,
    "compact minimap zoom never settled on the published HUD zoom within 10 s "
    + JSON.stringify(compactHud)).toBe(true);
  const compactDump = JSON.stringify(compactHud);
  expect(compactHud.density, "short landscape body density " + compactDump).toBe("compact");
  // ROUNDED, and the rounding is the platform's, not a slackened bound. Chromium
  // lays a zoomed subtree out on the 1/64 px LayoutUnit grid and getComputedStyle
  // divides back out, so an exact answer only survives a zoom that divides 96
  // evenly. It used to: --hud-scale followed --ui-scale, which this spec leaves at
  // 2, and 96 x 2 = 192 is on the grid. The owner's baked coarse default pins it to
  // 1.24 instead — 96 x 1.24 = 119.04, snapped DOWN to 119.03125, back over 1.24 =
  // 95.99294. The rule under test is which of 110 / 128 / 160 applies, and those are
  // 18px+ apart, so a nearest-px read discriminates exactly as well as equality did.
  expect(Math.round(parseFloat(compactHud.mmCss)),
    "compact minimap width " + compactDump).toBe(110);
  // And the PAINTED size follows whichever zoom applies: 110 x --hud-z-top when
  // the fit caps the band, 110 x --hud-scale when it does not. Half a px is
  // the LayoutUnit (1/64 px) snap with room to spare, not slack: the competing
  // rule sizes (128 / 160) are 18 x zoom px away.
  expect(Math.abs(compactHud.mmRect - 110 * compactHud.want),
    `compact minimap painted width = 110 x ${compactHud.capped ? "--hud-z-top" : "--hud-scale"} `
    + compactDump).toBeLessThan(0.5);
  await page.evaluate(() => {
    window.__apex.uiScale(200);
    document.getElementById("pausebtn").click();
    document.getElementById("pm-settings").click();
    document.getElementById("pm-open-visual").click();
    document.getElementById("pm-lighting").click();
    window.SheetShape?.reclassify();
  });
  await page.waitForFunction(() => {
    const el = document.getElementById("lighting-inner");
    return el && !document.getElementById("lighting").hidden && el.dataset.density === "compact";
  }, null, { polling: 100, timeout: 10_000 });
  const lighting = await page.evaluate(() => {
    const el = document.getElementById("lighting-inner");
    const tabs = document.getElementById("lt-tabs");
    const rows = document.getElementById("lt-rows");
    const toggle = el.querySelector(".lt-help-toggle");
    return {
      density: el.dataset.density,
      rail: el.dataset.rail,
      wrap: getComputedStyle(tabs).flexWrap,
      panelOY: getComputedStyle(el).overflowY,
      rowsOY: getComputedStyle(rows).overflowY,
      rowsH: rows.getBoundingClientRect().height,
      helpOff: !toggle || getComputedStyle(toggle).display === "none",
    };
  });
  expect(lighting.density, "lighting compact").toBe("compact");
  expect(lighting.rail).not.toBe("on");
  expect(lighting.wrap).toBe("nowrap");
  expect(["hidden", "clip"]).toContain(lighting.panelOY);
  expect(["auto", "scroll", "overlay"]).toContain(lighting.rowsOY);
  expect(lighting.rowsH).toBeGreaterThanOrEqual(24);
  expect(lighting.helpOff).toBe(true);
  await page.evaluate(() => {
    document.getElementById("lt-close").click();
    document.getElementById("pm-settings-close").click();
    document.getElementById("pm-resume").click();
  });
  await page.waitForSelector("#btn-cam:not([hidden])", { timeout: 10_000 });
  await page.evaluate(() => document.getElementById("btn-cam")
    .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
  const cameraMenu = await page.evaluate(() => ({
    role: document.getElementById("campicker").getAttribute("role"),
    radios: document.querySelectorAll('#campicker [role="menuitemradio"]').length,
    selected: document.querySelectorAll('#campicker [aria-checked="true"]').length,
    expanded: document.getElementById("btn-cam").getAttribute("aria-expanded"),
  }));
  expect(cameraMenu.role).toBe("menu");
  expect(cameraMenu.radios).toBeGreaterThan(10);
  expect(cameraMenu.selected).toBe(1);
  expect(cameraMenu.expanded).toBe("true");
  await page.keyboard.press("End");
  expect(await page.evaluate(() => document.activeElement === document.querySelector("#campicker button:last-child"))).toBe(true);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => ({
    hidden: document.getElementById("campicker").hidden,
    expanded: document.getElementById("btn-cam").getAttribute("aria-expanded"),
    restored: document.activeElement === document.getElementById("btn-cam"),
  }))).toEqual({ hidden: true, expanded: "false", restored: true });
  await page.evaluate(() => {
    document.getElementById("btn-cam")
      .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    document.getElementById("pausebtn").click();
  });
  expect(await page.evaluate(() => document.getElementById("campicker").hidden)).toBe(true);
});

test("race settings uses a duel rival sheet, whole roster, no search", async ({ page }) => {
  await waitReady(page);
  await page.locator("#mb-race").click();
  await page.locator("#sel-go").click();
  await expect(page.locator("#race-settings")).toBeVisible();
  // DUEL lives in the FIELD fold (2026-09-18), and folds start closed — opened
  // through its summary, the way a player opens it.
  await page.locator("#rs-fold-field-sum").click();
  await page.locator("#rs-duel-open").click();
  await expect(page.locator("#duel-picker")).toBeVisible();
  // THE WHOLE ROSTER, ALWAYS. The search field is gone (2026-09-20): fourteen
  // options is a list you read, not one you filter.
  await expect(page.locator("#duel-list .duel-option")).toHaveCount(14);
  await expect(page.locator("#duel-search")).toHaveCount(0);
  // Opening focuses the CURRENT pick rather than a text field, so the keyboard
  // starts where the player already is.
  await expect(page.locator("#duel-list .duel-option.active")).toBeFocused();
  await page.locator("#duel-list .duel-option", { hasText: "AYRTON SENNA" }).click();
  await expect(page.locator("#duel-picker")).toBeHidden();
  await expect(page.locator("#rs-duel-value")).toHaveText("AYRTON SENNA");
  await expect(page.locator("#rs-duel-open")).toHaveAttribute("aria-label", "Duel rival: AYRTON SENNA");
});

test("garage categories separate performance from finishing and setup", async ({ page }) => {
  await waitReady(page);
  await page.locator("#mb-garage").click();
  await expect(page.locator("#carsetup")).toBeVisible();
  const rows = page.locator("#cs-tabs .cs-tab-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute("aria-label", "Performance categories");
  await expect(rows.nth(1)).toHaveAttribute("aria-label", "Finishing and setup categories");
  await expect(rows.nth(0)).toContainText("ENGINE");
  for (const label of ["FLOOR", "COCKPIT", "WHEELS", "SETUP", "LIVERY"])
    await expect(rows.nth(1)).toContainText(label);
  await expect(page.locator("#cs-tab-livery")).toHaveAttribute("aria-label", /LIVERY — (DEFAULT|CUSTOM)/);
});

test("How to Play contents rail jumps within its single scroller", async ({ page }) => {
  await waitReady(page);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.evaluate(() => {
    const root = document.documentElement.style;
    root.setProperty("--sat", "59px"); root.setProperty("--sab", "34px");
  });
  await page.click("#mb-help");
  await page.waitForSelector("#howtoplay:not([hidden])");

  const before = await page.evaluate(() => {
    const nav = document.getElementById("htp-contents").getBoundingClientRect();
    const body = document.querySelector("#howtoplay .sheet-body").getBoundingClientRect();
    const first = document.querySelector("#htp-contents a").getBoundingClientRect();
    return {
      links: [...document.querySelectorAll("#htp-contents a")].map((a) => a.getAttribute("href")),
      navAboveBody: nav.bottom <= body.top + 1,
      bodyOverflow: getComputedStyle(document.querySelector("#howtoplay .sheet-body")).overflowY,
      firstReachable: first.left >= nav.left - 1 && first.right <= nav.right + 1,
      navBelowSafeArea: nav.top >= 59,
      linkTargetsExist: [...document.querySelectorAll("#htp-contents a")]
        .every((a) => document.querySelector(a.getAttribute("href"))),
    };
  });
  // Named for the same reason as the SETTINGS doors above: this was `toBe(5)`
  // and went red when 9e14f5f added PIT STOPS and b8aa0b6 added DRIVING.
  // Every href here must also EXIST in the sheet — a rail entry pointing at a
  // removed section is a dead link, which is how a restructure loses a
  // section without anything failing.
  expect(before.links).toEqual([
    "#htp-controls", "#htp-racing", "#htp-pits",
    "#htp-driving", "#htp-setup", "#htp-modes", "#htp-friends",
  ]);
  expect(before.linkTargetsExist).toBe(true);
  expect(before.navAboveBody).toBe(true);
  expect(["auto", "scroll", "overlay"]).toContain(before.bodyOverflow);
  expect(before.firstReachable).toBe(true);
  expect(before.navBelowSafeArea).toBe(true);

  await page.click('#htp-contents a[href="#htp-friends"]');
  await page.waitForFunction(() => {
    const body = document.querySelector("#howtoplay .sheet-body");
    const target = document.getElementById("htp-friends");
    if (!body || !target) return false;
    const br = body.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    return body.scrollTop > 0 && tr.top >= br.top - 1 && tr.bottom <= br.bottom + 1;
  }, null, { polling: 100, timeout: 5_000 });
  const after = await page.evaluate(() => {
    const link = document.querySelector('#htp-contents a[href="#htp-friends"]');
    return {
      heading: document.getElementById("htp-friends")?.textContent || "",
      activeColor: getComputedStyle(link).backgroundColor,
    };
  });
  expect(after.heading).toContain("RACE A FRIEND");

  await page.evaluate(() => document.getElementById("htp-close").click());
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.click("#mb-help");
  await page.waitForSelector("#howtoplay:not([hidden])");
  await page.evaluate(() => window.SheetShape?.reclassify());
  const wideHelp = await page.evaluate(() => {
    const sheet = document.getElementById("howtoplay-inner");
    const nav = document.getElementById("htp-contents").getBoundingClientRect();
    const body = document.querySelector("#howtoplay .sheet-body").getBoundingClientRect();
    return {
      shape: sheet.dataset.shape,
      density: sheet.dataset.density,
      navLeftOfBody: nav.right <= body.left + 2,
      sameBand: Math.abs(nav.top - body.top) < 80,
    };
  });
  expect(wideHelp.shape).toBe("wide");
  expect(wideHelp.density).not.toBe("compact");
  expect(wideHelp.navLeftOfBody).toBe(true);
  expect(wideHelp.sameBand).toBe(true);
});

test("Career guide contents rail and standings leftover height", async ({ page }) => {
  await waitReady(page);

  // Standings is season-gated on the title. Unhide and open: the body is the
  // one pane scroller and must not carry a zoom-blind 55svh cap.
  await page.setViewportSize({ width: 852, height: 393 });
  await page.evaluate(() => {
    document.getElementById("mb-standings").hidden = false;
    document.getElementById("mb-standings").click();
    window.SheetShape?.reclassify();
  });
  await page.waitForSelector("#standings:not([hidden])");
  const standings = await page.evaluate(() => {
    const body = document.getElementById("standings-body");
    return {
      maxH: getComputedStyle(body).maxHeight,
      minH: getComputedStyle(body).minHeight,
      bodyOY: getComputedStyle(body).overflowY,
    };
  });
  expect(standings.maxH).toBe("none");
  expect(standings.minH).toBe("0px");
  expect(["auto", "scroll", "overlay"]).toContain(standings.bodyOY);
  await page.evaluate(() => document.getElementById("standings-close").click());

  // Modes screen → HOW CAREER WORKS. The 560px guide is landscape-shaped on a
  // mid desktop (wide rail) and tall on phone portrait (strip above the body).
  await page.click("#mb-career");
  await page.waitForSelector("#cr-guide-driver");
  await page.setViewportSize({ width: 1100, height: 580 });
  await page.click("#cr-guide-driver");
  await page.waitForSelector("#career-guide:not([hidden])");
  await page.evaluate(() => window.SheetShape?.reclassify());
  const wideGuide = await page.evaluate(() => {
    const sheet = document.querySelector("#career-guide .sheet");
    const nav = document.getElementById("cg-contents").getBoundingClientRect();
    const body = document.getElementById("cg-body").getBoundingClientRect();
    return {
      shape: sheet.dataset.shape,
      density: sheet.dataset.density,
      links: document.querySelectorAll("#cg-contents a").length,
      navLeftOfBody: nav.right <= body.left + 2,
      sameBand: Math.abs(nav.top - body.top) < 80,
    };
  });
  expect(wideGuide.links).toBeGreaterThan(4);
  expect(wideGuide.shape, JSON.stringify(wideGuide)).toBe("wide");
  expect(wideGuide.density).not.toBe("compact");
  expect(wideGuide.navLeftOfBody).toBe(true);
  expect(wideGuide.sameBand).toBe(true);

  await page.click('#cg-contents a[href="#cg-qualifying"]');
  await page.waitForFunction(() => {
    const body = document.getElementById("cg-body");
    const target = document.getElementById("cg-qualifying");
    if (!body || !target) return false;
    const br = body.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    return body.scrollTop > 0 && tr.top >= br.top - 1 && tr.bottom <= br.bottom + 1;
  }, null, { polling: 100, timeout: 5_000 });

  await page.evaluate(() => document.getElementById("cg-back").click());
  await page.setViewportSize({ width: 393, height: 852 });
  await page.click("#cr-guide-driver");
  await page.waitForSelector("#career-guide:not([hidden])");
  await page.evaluate(() => window.SheetShape?.reclassify());
  const tallGuide = await page.evaluate(() => {
    const sheet = document.querySelector("#career-guide .sheet");
    const nav = document.getElementById("cg-contents").getBoundingClientRect();
    const body = document.getElementById("cg-body").getBoundingClientRect();
    const first = document.querySelector("#cg-contents a")?.getBoundingClientRect();
    return {
      shape: sheet.dataset.shape,
      navAboveBody: nav.bottom <= body.top + 1,
      firstReachable: !!(first && first.left >= nav.left - 1 && first.right <= nav.right + 1),
    };
  });
  expect(tallGuide.shape).not.toBe("wide");
  expect(tallGuide.navAboveBody).toBe(true);
  expect(tallGuide.firstReachable).toBe(true);
});

test("balanced control rows derive their shape from local room", async ({ page }) => {
  await waitReady(page);
  const report = async (selector) => page.evaluate((sel) => {
    const host = document.querySelector(sel);
    // FIND A SETTING (SettingsSearch) heads the settings index as its own
    // full-bleed row; it is not a door, so it never counts toward the balance.
    const children = [...host.children].filter((el) => !el.hidden && getComputedStyle(el).display !== "none"
      && !el.matches("[data-settings-search]"));
    const rows = [];
    for (const el of children) {
      const r = el.getBoundingClientRect();
      let row = rows.find((candidate) => Math.abs(candidate.top - r.top) < 2);
      if (!row) { row = { top: r.top, widths: [] }; rows.push(row); }
      row.widths.push(r.width);
    }
    rows.sort((a, b) => a.top - b.top);
    const last = rows.at(-1);
    const box = host.getBoundingClientRect();
    return {
      display: getComputedStyle(host).display,
      rowCounts: rows.map((row) => row.widths.length),
      lastFill: last && last.widths.length === 1 ? last.widths[0] / box.width : 1,
    };
  }, selector);

  // Utilities includes the controller door on this touch-capable page.
  await page.setViewportSize({ width: 860, height: 560 });
  const title = await report("#menu-secondary");
  expect(title.display).toBe("flex");
  const shownTitleDoors = await page.evaluate(() => ["mb-settings", "mb-phonepad", "mb-help", "mb-saves"]
    .filter((id) => !document.getElementById(id).hidden).length);
  expect(shownTitleDoors, "the touch page shows the controller door").toBe(4);
  expect(title.rowCounts.reduce((n, c) => n + c, 0)).toBe(shownTitleDoors);
  expect(title.lastFill).toBeGreaterThan(0.9);

  // Watch and Data Hub share the Explore group.
  const explore = await report("#menu-explore");
  expect(explore.display).toBe("flex");
  expect(explore.rowCounts.reduce((n, c) => n + c, 0)).toBe(2);
  expect(explore.lastFill).toBeGreaterThan(0.9);

  // Settings home is a .pm-doors list. The guard this test keeps is full
  // rows with no sliver, which lastFill still holds.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click("#mb-settings");
  await page.waitForSelector("#pmsettings:not([hidden])");
  const settings = await report("#pm-settings-index");
  expect(settings.display).toBe("flex");
  // DERIVED, not a literal. What this line is for is "every door is laid out,
  // none dropped into a sliver" — so it asks the DOM how many doors there are
  // rather than restating a number that has to be edited every time SETTINGS
  // gains one. The literal 6 here went stale the same day the two above did.
  const doorTotal = await page.evaluate(
    () => document.querySelectorAll("#pm-settings-index button").length);
  expect(doorTotal).toBeGreaterThan(0);
  expect(settings.rowCounts.reduce((n, c) => n + c, 0)).toBe(doorTotal);
  expect(settings.lastFill).toBeGreaterThan(0.9);
});

test("settings offers concise throttle help and separate backup actions", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 659 });
  await waitReady(page);
  await page.click("#mb-settings");
  await page.click("#pm-open-controls");
  for (const mode of ["hold", "latch", "auto"]) {
    await page.locator("#pm-throttlemode-sel").selectOption(mode);
    await expect(page.locator("#pm-throttle-note")).toContainText(mode.toUpperCase() + ":");
  }
  await expect(page.locator("#pm-throttle-compare")).not.toHaveAttribute("open", "");
  await page.locator("#pm-throttle-compare summary").click();
  await expect(page.locator("#pm-throttle-compare")).toHaveAttribute("open", "");
  await page.locator("#pm-throttle-compare summary").click();
  await page.click("#pm-settings-close");
  await page.click("#pm-open-files");
  for (const viewport of [{ width: 393, height: 659 }, { width: 734, height: 343 }, { width: 1280, height: 800 }]) {
  await page.setViewportSize(viewport);
  for (const section of ["save", "restore", "share"]) {
    const button = page.locator("#pm-files-show-" + section);
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#pm-files-" + section)).toBeVisible();
    const layout = await page.evaluate((section) => {
      const nav = document.getElementById("pm-files-nav").getBoundingClientRect();
      const content = document.getElementById("pm-files-" + section).getBoundingClientRect();
      return { navBottom: nav.bottom, contentTop: content.top, leftDelta: Math.abs(nav.left - content.left), widthDelta: Math.abs(nav.width - content.width) };
    }, section);
    expect(layout.contentTop).toBeGreaterThanOrEqual(layout.navBottom);
    expect(layout.leftDelta).toBeLessThanOrEqual(1);
    expect(layout.widthDelta).toBeLessThanOrEqual(1);
    for (const other of ["save", "restore", "share"].filter((s) => s !== section)) {
      await expect(page.locator("#pm-files-" + other)).toBeHidden();
    }
  }
  }
  await page.locator("#pm-share-code-in").fill("harmless invalid fixture");
  await page.locator("#pm-share-code-import").click();
  await expect(page.locator("#pm-share-code-status")).not.toBeEmpty();
});

test.describe("team picker on a landscape phone (isMobile)", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test("team picker tiles grow to their wrapped text instead of spilling", async ({ page }) => {
    // The picker tiles wrap their driver pairing (css/select.css); implicit auto
    // rows held them at the 52px min-height, so the text overflowed the tile
    // and painted over the next row (UI inspector sweep 2026-10-17).
    await waitReady(page);
    await page.click("#mb-garage"); await page.waitForSelector("#carsetup:not([hidden])");
    await page.evaluate(() => { const t = [...document.querySelectorAll("#cs-tabs .cs-tab")];
      (t.find((e) => /TEAM/i.test(e.textContent)) || t[0])?.click(); });
    await page.waitForSelector("#cs-team-card", { state: "attached" });
    await page.evaluate(() => document.getElementById("cs-team-card").click());
    await page.waitForSelector("#teampicker:not([hidden])");
    await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== "running"
      || !Number.isFinite(a.effect?.getComputedTiming?.().endTime)), null, { polling: 100, timeout: 10_000 });
    const spill = await page.evaluate(() => [...document.querySelectorAll("#sel-teams > .team-tile")].map(t => {
      const r = t.getBoundingClientRect(), b = t.querySelector(".tm-body").getBoundingClientRect();
      return { name: t.querySelector(".tm-name")?.textContent, over: Math.max(r.top - b.top, b.bottom - r.bottom) };
    }).filter(x => x.over > 0.5));
    expect(spill, "no team tile's text extends past the tile").toEqual([]);
  });
});

test("shared sheets reflow long labels and retain keyboard exits at narrow widths", async ({ page }) => {
  await waitReady(page);
  // 320 CSS pixels is the layout width of a 1280px window at 400% zoom.
  // This checks reflow; it does not claim native browser zoom emulation.
  for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    for (const scale of [100, 200]) {
      await page.evaluate((scale) => window.__apex.uiScale(scale), scale);
      await page.locator("#mb-help").focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("#howtoplay")).toBeVisible();
      const original = await page.evaluate(() => {
        const heading = document.getElementById("dlg-howtoplay"), exit = document.getElementById("htp-close");
        const original = { heading: heading.textContent, exit: exit.textContent };
        heading.textContent = "AccessibilityPreferencesWithoutAbbreviations";
        exit.textContent = "Close help and return to the main menu";
        window.SheetShape.reclassify();
        return original;
      });
      await expect.poll(() => page.evaluate(() => {
        const sheet = document.getElementById("howtoplay-inner");
        const body = sheet.querySelector(".sheet-body");
        const head = sheet.querySelector(".sheet-head").getBoundingClientRect();
        const foot = sheet.querySelector(".sheet-foot").getBoundingClientRect();
        const b = body.getBoundingClientRect(), s = sheet.getBoundingClientRect();
        return s.left >= 0 && s.right <= innerWidth + 1 && s.top >= 0 && s.bottom <= innerHeight + 1
          && b.height >= 44 && b.top >= head.bottom - 1 && b.bottom <= foot.top + 1
          && sheet.scrollWidth <= sheet.clientWidth + 1;
      })).toBe(true);
      const body = page.locator("#howtoplay-inner .sheet-body");
      await body.hover();
      await page.mouse.wheel(0, 100000);
      await expect.poll(() => body.evaluate((e) => e.scrollHeight - e.clientHeight - e.scrollTop)).toBeLessThanOrEqual(2);
      expect(await body.evaluate((e) => {
        const last = e.querySelector("dl dd:last-child").getBoundingClientRect();
        const pane = e.getBoundingClientRect();
        return last.bottom > pane.top && last.top < pane.bottom;
      }), "scroll end must still show content, not an empty spacer").toBe(true);
      await expect(page.locator("#howtoplay-inner #htp-controls-refresher")).toBeAttached();
      const exit = page.locator("#htp-close");
      expect(await exit.evaluate((e) => e.scrollHeight - e.clientHeight)).toBeLessThanOrEqual(1);
      await exit.focus();
      await expect(exit).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(0);
      await page.keyboard.press("Escape");
      await expect(page.locator("#howtoplay")).toBeHidden();
      await expect(page.locator("#mb-help")).toBeFocused();
      await page.evaluate((original) => {
        document.getElementById("dlg-howtoplay").textContent = original.heading;
        document.getElementById("htp-close").textContent = original.exit;
      }, original);
    }
  }
});

test("data hub constructor names stay readable in phone landscape", async ({ page }) => {
  // 844x390 touch, the constructors column is ~385px. The H2H bars used to share
  // the row and squeeze the team name to "Me…" / "F." / "N" (UI inspector sweep
  // 2026-10-17); the bars must wrap instead.
  const teams = [["Mercedes", "Andrea Kimi", "Antonelli", "ANT", "George", "Russell", "RUS"],
    ["Ferrari", "Lewis", "Hamilton", "HAM", "Charles", "Leclerc", "LEC"],
    ["McLaren", "Lando", "Norris", "NOR", "Oscar", "Piastri", "PIA"],
    ["Red Bull", "Max", "Verstappen", "VER", "Isack", "Hadjar", "HAD"]];
  const standings = (key, rows) => JSON.stringify({ MRData: { StandingsTable: { StandingsLists: [{ [key]: rows }] } } });
  const drivers = teams.flatMap(([team, g1, f1, c1, g2, f2, c2], i) => [
    { position: String(i * 2 + 1), points: String(300 - i * 40), wins: "1", Driver: { givenName: g1, familyName: f1, code: c1 }, Constructors: [{ name: team }] },
    { position: String(i * 2 + 2), points: String(280 - i * 40), wins: "0", Driver: { givenName: g2, familyName: f2, code: c2 }, Constructors: [{ name: team }] }]);
  const cons = teams.map(([team], i) => ({ position: String(i + 1), points: String(580 - i * 80), wins: String(4 - i), Constructor: { name: team } }));
  await page.route("**/driverstandings.json", (r) => r.fulfill({ contentType: "application/json", body: standings("DriverStandings", drivers) }));
  await page.route("**/constructorstandings.json", (r) => r.fulfill({ contentType: "application/json", body: standings("ConstructorStandings", cons) }));
  await page.setViewportSize({ width: 844, height: 390 });
  await waitReady(page);
  await page.click("#mb-data");
  await page.waitForSelector("#datahub:not([hidden])");
  await page.click("#dh-tab-standings");
  await page.waitForFunction(() => document.querySelectorAll(".dh-row-cons .dh-name").length === 4,
    null, { polling: 100, timeout: 15_000 });
  const names = await page.$$eval(".dh-row-cons .dh-name", (els) => els.map((e) => ({
    text: e.textContent, w: e.clientWidth, sw: e.scrollWidth })));
  for (const n of names) {
    expect(n.sw, `${n.text} is cut off (${n.w}px of ${n.sw}px)`).toBeLessThanOrEqual(n.w + 1);
  }
});

test.describe("phone emulation (isMobile)", () => {
  // The phone the sweep emulated (inspect --touch): a mobile, touch context.
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

test("compact VS Friend CLOSE keeps its skewed corners inside the head-parked foot", async ({ page }) => {
  // .bigbtn is skewX(-6deg): its painted corners overhang the box by
  // tan(6deg) * h / 2. The compact foot is overflow:hidden, so without room
  // for that overhang CLOSE was shaved 3px left and right (UI inspector sweep
  // 2026-10-17, 932x430 and 844x390 touch).
  await waitReady(page);
  // overlays.css / dialogs.css arrive in the deferred batch (media="print"
  // until loaded); the compact head-parked foot is defined there.
  await page.waitForFunction(() => [...document.querySelectorAll('link[rel="stylesheet"]')]
    .filter(l => /\/(overlays|dialogs)\.css/.test(l.href)).every(l => l.media !== "print" && l.sheet),
    null, { polling: 100, timeout: 15_000 });
  await page.evaluate(() => document.getElementById("mb-vs").click());
  await page.waitForFunction(() => !document.getElementById("vsfriend").hidden, null, { polling: 100, timeout: 10_000 });
  await page.evaluate(() => window.SheetShape?.reclassify());
  await page.waitForFunction(() => document.getElementById("vsfriend-inner").dataset.density === "compact",
    null, { polling: 100, timeout: 10_000 });
  // Measure the steady state: the sheet's entrance animation holds the base
  // foot padding until it finishes, and a player sees the frame after it.
  await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== "running"
    || !Number.isFinite(a.effect?.getComputedTiming?.().endTime)), null, { polling: 100, timeout: 10_000 });
  const fit = await page.evaluate(() => {
    const close = document.getElementById("vs-close").getBoundingClientRect();
    const foot = document.querySelector("#vsfriend-inner > .sheet-foot").getBoundingClientRect();
    return { left: close.left - foot.left, right: foot.right - close.right,
      overflow: getComputedStyle(document.querySelector("#vsfriend-inner > .sheet-foot")).overflow };
  });
  expect(fit.overflow, "the foot still clips (the clip is what makes the overhang visible)").toContain("hidden");
  expect(fit.left, "CLOSE's skewed left corner is inside the foot").toBeGreaterThanOrEqual(-0.5);
  expect(fit.right, "CLOSE's skewed right corner is inside the foot").toBeGreaterThanOrEqual(-0.5);
});
});
