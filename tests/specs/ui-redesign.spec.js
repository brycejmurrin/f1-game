// @ts-check
// Focused browser contract for the redesign foundation. One page visits every
// changed surface so SwiftShader boot cost is paid once rather than per assertion.
import { test, expect } from "../helpers/fixtures.js";

test.use({ viewport: { width: 852, height: 393 }, hasTouch: true });

async function waitReady(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race,
    null, { polling: 100, timeout: 20_000 });
  await page.evaluate(() => window.__apex.headless(true));
}

test("catalogue, garage, settings, data table, and compact multiplayer fit", async ({ page }) => {
  await waitReady(page);

  // Circuit Select: search filters in place without rebuilding/focusing away.
  await page.evaluate(() => document.getElementById("mb-race").click());
  await page.waitForFunction(() => document.querySelectorAll("#sel-tracks .track-row").length > 20,
    null, { polling: 100, timeout: 10_000 });
  await page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => window.SheetShape?.reclassify());
  const initialSelect = await page.evaluate(() => {
    const sel = document.getElementById("sel-inner");
    const map = /** @type {HTMLCanvasElement} */ (document.getElementById("sel-preview-map"));
    const r = map.getBoundingClientRect();
    const zoom = map.currentCSSZoom || 1;
    const bufferAspect = map.width / Math.max(1, map.height);
    const boxH = r.height / zoom;
    const boxW = r.width / zoom;
    const boxAspect = boxW / Math.max(1, boxH);
    return {
      pair: sel.dataset.pair,
      density: sel.dataset.density,
      buffer: [map.width, map.height],
      box: [boxW, boxH],
      display: getComputedStyle(map).display,
      skew: Math.abs(bufferAspect - boxAspect) / Math.max(bufferAspect, boxAspect, 0.001),
    };
  });
  // 852×393 is under #sel-inner --compact-at 480, but the sheet is wide, so
  // --pair-compact: wide keeps the catalogue in the right column.
  expect(initialSelect.density, JSON.stringify(initialSelect)).toBe("compact");
  expect(initialSelect.pair).toBe("on");
  // Match a landscape iPhone's notched safe area at a larger user-selected UI
  // size. That reproducibly enters the compact single-column layout; at the
  // default size this viewport correctly retains the roomy paired catalogue.
  // The filter must not consume the whole list viewport: a real circuit needs
  // to be visible before the player scrolls either nested pane.
  await page.evaluate(() => {
    const root = document.documentElement.style;
    root.setProperty("--sal", "59px"); root.setProperty("--sar", "59px");
    root.setProperty("--sab", "21px");
    if (window.__apex && window.__apex.uiScale) window.__apex.uiScale(150);
  });
  await page.waitForFunction(() => {
    const sel = document.getElementById("sel-inner");
    return sel?.dataset.pair === "on" && sel.dataset.density === "compact"
      && sel.dataset.shape !== "tall";
  }, null, { polling: 100, timeout: 10_000 });
  const compactCatalogue = await page.evaluate(() => {
    const list = document.getElementById("sel-tracks").getBoundingClientRect();
    const first = document.querySelector("#sel-tracks .track-row:not([hidden])").getBoundingClientRect();
    const body = document.getElementById("sel-body").getBoundingClientRect();
    const preview = document.getElementById("sel-track-section").getBoundingClientRect();
    const filter = document.getElementById("sel-track-filter").getBoundingClientRect();
    const controls = [...document.querySelectorAll("#sel-track-filter .sel-chip, #sel-track-search")]
      .map((el) => el.getBoundingClientRect());
    return {
      firstVisible: Math.max(0, Math.min(list.bottom, first.bottom) - Math.max(list.top, first.top)),
      oneRow: Math.max(...controls.map((r) => r.top)) - Math.min(...controls.map((r) => r.top)) < 2,
      geometry: {
        body: [body.top, body.bottom, body.height], preview: [preview.top, preview.bottom, preview.height],
        filter: [filter.top, filter.bottom, filter.height], list: [list.top, list.bottom, list.height],
        first: [first.top, first.bottom, first.height],
      },
    };
  });
  expect(compactCatalogue.oneRow, "compact filter oneRow").toBe(true);
  expect(compactCatalogue.firstVisible, JSON.stringify(compactCatalogue.geometry)).toBeGreaterThanOrEqual(24);
  // At the slider maximum the toolbar becomes horizontally pannable and stops
  // being sticky, so vertical scrolling can still reveal real circuit rows.
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
    list.scrollTop = filter.scrollHeight;
    const lr = list.getBoundingClientRect();
    const rr = document.querySelector("#sel-tracks .track-row:not([hidden])").getBoundingClientRect();
    const cs = getComputedStyle(filter);
    return {
      horizontalToolbar: filter.scrollWidth > filter.clientWidth,
      firstVisible: Math.max(0, Math.min(lr.bottom, rr.bottom) - Math.max(lr.top, rr.top)),
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
  expect(maxScaleCatalogue.horizontalToolbar, "200% pan-x toolbar " + JSON.stringify(maxScaleCatalogue.dump)).toBe(true);
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
      shown: rows.filter((row) => !row.hidden).map((row) => row.textContent.trim()),
      hidden: rows.filter((row) => row.hidden).length,
      emptyHidden: document.getElementById("sel-track-empty").hidden,
    };
  });
  expect(searched.active, "search focused").toBe(true);
  expect(searched.shown.length).toBeGreaterThan(0);
  expect(searched.shown.every((name) => /monaco/i.test(name)), "all monaco").toBe(true);
  expect(searched.hidden).toBeGreaterThan(20);
  expect(searched.emptyHidden, "empty hidden").toBe(true);

  // Short landscape select: still wide-shaped, so --pair-compact: wide
  // keeps pair-on (list on the right). Body is not a scroller.
  await page.evaluate(() => {
    const input = /** @type {HTMLInputElement} */ (document.getElementById("sel-track-search"));
    input.value = ""; input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.setViewportSize({ width: 568, height: 320 });
  await page.waitForFunction(() => {
    const inner = document.getElementById("sel-inner");
    const list = document.getElementById("sel-tracks");
    return inner && inner.dataset.pair === "on" && list && list.getBoundingClientRect().height > 80;
  }, null, { polling: 100, timeout: 10_000 });
  await page.evaluate(() => window.ScrollFade && window.ScrollFade.refresh());
  const stackedSel = await page.evaluate(() => {
    const body = document.getElementById("sel-body");
    const list = document.getElementById("sel-tracks");
    const preview = document.getElementById("sel-track-section");
    const input = /** @type {HTMLInputElement} */ (document.getElementById("sel-track-search"));
    const out = {
      pair: document.getElementById("sel-inner").dataset.pair,
      bodyOY: getComputedStyle(body).overflowY,
      listOY: getComputedStyle(list).overflowY,
      listMaxH: getComputedStyle(list).maxHeight,
      bodyH: body.getBoundingClientRect().height,
      listH: list.getBoundingClientRect().height,
      previewH: preview.getBoundingClientRect().height,
      previewTop: preview.getBoundingClientRect().top,
      listTop: list.getBoundingClientRect().top,
      bodySf: body.classList.contains("sf-scroll"),
      listSf: list.classList.contains("sf-scroll"),
      innerSf: [...document.querySelectorAll("#sel-inner .sf-scroll")].map((el) => el.id),
    };
    input.focus(); input.value = "spa";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const shown = [...document.querySelectorAll("#sel-tracks .track-row")]
      .filter((row) => !row.hidden).length;
    return { ...out, active: document.activeElement === input, shown };
  });
  expect(stackedSel.pair).toBe("on");
  expect(["auto", "scroll"]).not.toContain(stackedSel.bodyOY);
  expect(["auto", "scroll", "overlay"]).toContain(stackedSel.listOY);
  expect(stackedSel.bodySf).toBe(false);
  expect(stackedSel.innerSf).toEqual(["sel-tracks"]);
  expect(stackedSel.listMaxH).toBe("none");
  expect(stackedSel.listH).toBeGreaterThan(80);
  expect(stackedSel.listH / stackedSel.bodyH).toBeGreaterThan(0.45);
  expect(stackedSel.listH).toBeGreaterThan(stackedSel.previewH);
  expect(stackedSel.active).toBe(true);
  expect(stackedSel.shown).toBeGreaterThan(0);

  // Compact-wide garage: 852×393 is over --pair-at 400 but under --compact-at
  // 480, so without the compact stack the rail/list split still fires.
  await page.setViewportSize({ width: 852, height: 393 });
  await page.evaluate(() => {
    const input = /** @type {HTMLInputElement} */ (document.getElementById("sel-track-search"));
    input.value = ""; input.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("sel-go").click();
  });
  await page.waitForFunction(() => {
    const setup = document.getElementById("carsetup");
    const inner = document.getElementById("cs-inner");
    return setup && !setup.hidden && inner?.dataset.pair === "off" && inner.dataset.density === "compact";
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
      optsOY: getComputedStyle(opts).overflowY,
    };
  });
  expect(compactWideGarage.pair).toBe("off");
  expect(compactWideGarage.density).toBe("compact");
  expect(["auto", "scroll"]).not.toContain(compactWideGarage.tabsOY);
  expect(["auto", "scroll"]).toContain(compactWideGarage.tabsOX);
  expect(["auto", "scroll", "overlay"]).toContain(compactWideGarage.optsOY);

  // Garage stacked: portrait sheet is under --pair-at 400 — a strip, not a grid.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => {
    const setup = document.getElementById("carsetup");
    const inner = document.getElementById("cs-inner");
    return setup && !setup.hidden && inner && inner.dataset.pair !== "on";
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
    return {
      pair: document.getElementById("cs-inner").dataset.pair,
      tabsOY: tcs.overflowY,
      tabsOX: tcs.overflowX,
      optsOY: getComputedStyle(opts).overflowY,
      bodyOY: getComputedStyle(body).overflowY,
      tabsSf: tabsEl.classList.contains("sf-scroll"),
      optsSf: opts.classList.contains("sf-scroll"),
      role: tabsEl.getAttribute("role"),
    };
  });
  expect(stackedGarage.pair).not.toBe("on");
  expect(["auto", "scroll"]).not.toContain(stackedGarage.tabsOY);
  expect(["auto", "scroll"]).toContain(stackedGarage.tabsOX);
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
    const nav = document.getElementById("pm-category-tabs");
    const body = document.getElementById("pm-settings-body");
    const first = nav.firstElementChild.getBoundingClientRect();
    const last = nav.lastElementChild.getBoundingClientRect();
    const active = document.querySelector("#pm-settings-body [role=tabpanel]:not([hidden])");
    const ar = active.getBoundingClientRect();
    return {
      oneRow: Math.abs(first.top - last.top) < 2,
      panelPainted: ar.width > 0 && ar.height > 0,
      bodyH: body.getBoundingClientRect().height,
      navH: nav.getBoundingClientRect().height,
      overflowX: document.documentElement.scrollWidth - innerWidth,
    };
  });
  expect(settings.oneRow).toBe(true);
  expect(settings.panelPainted).toBe(true);
  expect(settings.navH).toBeLessThan(settings.bodyH);
  expect(settings.overflowX).toBeLessThanOrEqual(1);
  await page.evaluate(() => {
    document.getElementById("pm-tab-more").click();
    document.getElementById("pm-advanced").click();
  });
  await page.waitForSelector("#advanced:not([hidden])");
  await page.evaluate(() => window.SheetShape?.reclassify());
  const advanced = await page.evaluate(() => {
    const inner = document.getElementById("advanced-inner");
    return { fit: inner.dataset.fit, h: inner.getBoundingClientRect().height };
  });
  expect(advanced.fit, "advanced 200% short landscape").toBe("on");
  expect(advanced.h).toBeGreaterThan(80);
  await page.evaluate(() => {
    document.getElementById("adv-close").click();
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
  const versus = await page.evaluate(() => {
    const rect = (id) => document.getElementById(id).getBoundingClientRect();
    const body = rect("vs-body"), host = rect("vs-host"), join = rect("vs-join");
    const head = document.querySelector("#vsfriend .sheet-head").getBoundingClientRect();
    const close = rect("vs-close");
    return {
      hostInside: host.left >= body.left - 1 && host.right <= body.right + 1,
      joinInside: join.left >= body.left - 1 && join.right <= body.right + 1,
      sameRow: Math.abs(host.top - join.top) < 2,
      closeInHead: close.top >= head.top - 1 && close.bottom <= head.bottom + 2,
      overflowX: document.documentElement.scrollWidth - innerWidth,
    };
  });
  expect(versus.hostInside).toBe(true);
  expect(versus.joinInside).toBe(true);
  expect(versus.sameRow).toBe(true);
  expect(versus.closeInHead).toBe(true);
  expect(versus.overflowX).toBeLessThanOrEqual(1);

  // Camera picker: the popup exposes a radio-menu contract, wraps keyboard
  // focus, restores focus on Escape, and an input-free pause still closes it.
  await page.evaluate(async () => {
    document.getElementById("vs-close").click();
    await window.__apex.race("monza");
  });
  await page.waitForFunction(() => window.__apex.info().track === "monza",
    null, { polling: 100, timeout: 40_000 });
  await page.evaluate(() => { window.__apex.go(); window.__apex.jump(0.2, 40); });
  // Lighting tuner is race-only (`pm-lighting` is disabled on the title). Open
  // it from pause → settings → MORE at 200% on the short landscape sheet.
  await page.waitForSelector("#pausebtn:not([hidden])", { timeout: 10_000 });
  await page.setViewportSize({ width: 852, height: 393 });
  const compactHud = await page.evaluate(() => {
    const mm = document.getElementById("minimap");
    return {
      density: document.body.dataset.density,
      mmCss: mm ? getComputedStyle(mm).width : "",
    };
  });
  expect(compactHud.density, "short landscape body density").toBe("compact");
  expect(compactHud.mmCss).toBe("96px");
  await page.evaluate(() => {
    window.__apex.uiScale(200);
    document.getElementById("pausebtn").click();
    document.getElementById("pm-settings").click();
    document.getElementById("pm-tab-more").click();
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
      links: document.querySelectorAll("#htp-contents a").length,
      navAboveBody: nav.bottom <= body.top + 1,
      bodyOverflow: getComputedStyle(document.querySelector("#howtoplay .sheet-body")).overflowY,
      firstReachable: first.left >= nav.left - 1 && first.right <= nav.right + 1,
      navBelowSafeArea: nav.top >= 59,
    };
  });
  expect(before.links).toBe(5);
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
    const children = [...host.children].filter((el) => !el.hidden && getComputedStyle(el).display !== "none");
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

  // Runtime visibility changes the title group from four to five actions.
  await page.setViewportSize({ width: 860, height: 560 });
  await page.evaluate(() => { document.getElementById("mb-standings").hidden = false; });
  const title = await report("#menu-secondary");
  expect(title.display).toBe("flex");
  expect(title.rowCounts).toEqual([2, 2, 1]);
  expect(title.lastFill).toBeGreaterThan(0.9);

  // The same primitive makes three settings categories 2 + a full-width final
  // action when the sheet is locally narrow; no viewport-specific rule decides.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click("#mb-settings");
  await page.waitForSelector("#pmsettings:not([hidden])");
  const settings = await report("#pm-category-tabs");
  expect(settings.display).toBe("flex");
  expect(settings.rowCounts).toEqual([2, 1]);
  expect(settings.lastFill).toBeGreaterThan(0.9);
});
