// @ts-check
// Data hub TELEMETRY compare view FIT on a phone: the popup card stays inside
// the screen (header not clipped off the top), the gauge labels never collide,
// the trace takes the free width, and the whole body scrolls as ONE column so
// the last row (map key, legend toggles) is reachable above the bottom edge.
// Notch insets are injected (headless reports env(safe-area-inset-*) as 0).
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";

// The owner's LOAD SETTINGS export (TEXT large, UI 109 %): the UI scaling
// contract (PR #5154, on the deploy tip) measures at it.
const OWNER = JSON.parse(readFileSync(new URL("../data/settings-defaults-export.json", import.meta.url), "utf8"));

const VIEWS = [
  { name: "landscape-852x393", w: 852, h: 393, sal: 59, sar: 59, sat: 0, sab: 21 },
  { name: "portrait-390x844", w: 390, h: 844, sal: 0, sar: 0, sat: 47, sab: 34 },
];

async function openCompare(page, v) {
  await page.addInitScript((css) => {
    const add = () => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); };
    document.head ? add() : document.addEventListener("DOMContentLoaded", add, { once: true });
  }, `:root{--sal:${v.sal}px!important;--sat:${v.sat}px!important;--sar:${v.sar}px!important;--sab:${v.sab}px!important}`);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.click("#mb-data");
  await page.waitForSelector("#datahub:not([hidden])");
  await page.waitForFunction(() => typeof F1API !== "undefined" && document.getElementById("dh-tab-telemetry"), null, { polling: 100 });
  await page.evaluate(() => {
    const SESSION = { sessionKey: 9999, meetingKey: 1234, year: 2026, name: "Race", type: "Race", circuit: "Singapore", country: "Singapore" };
    const DRIVERS = [
      { num: 1, code: "VER", name: "Max Verstappen", color: "3671C6", team: "Red Bull" },
      { num: 18, code: "STR", name: "Lance Stroll", color: "229971", team: "Aston Martin" },
      { num: 27, code: "HUL", name: "Nico Hulkenberg", color: "52E252", team: "Audi" }];
    const base = { 1: 95.1, 18: 96.0, 27: 97.05 };
    function lap(dur) {
      const car = [], loc = [], t0 = 1e12;
      for (let i = 0; i * 0.1 <= dur; i++) { const t = i * 0.1, a = (t / dur) * 2 * Math.PI;
        car.push({ t, date: t0 + t * 1000, speed: 200 + 90 * Math.sin(a * 3), throttle: 50 + 50 * Math.sin(a * 2), brake: 0, gear: 6, rpm: 11000, drs: 8 }); }
      for (let i = 0; i * 0.27 <= dur; i++) { const t = i * 0.27, a = (t / dur) * 2 * Math.PI;
        loc.push({ x: 3000 + 1600 * Math.cos(a), y: 4000 + 1400 * Math.sin(a), date: t0 + t * 1000 }); }
      return { car, loc };
    }
    const none = () => Promise.resolve([]);
    Object.assign(F1API, {
      schedule: none, driverStandings: none, constructorStandings: none, sessionResult: none, stints: none, pits: none,
      latestSession: () => Promise.resolve(SESSION),
      meetings: () => Promise.resolve([{ meetingKey: 1234, name: "Singapore GP", year: 2026 }]),
      sessionsForMeeting: () => Promise.resolve([SESSION]),
      sessionDrivers: () => Promise.resolve(DRIVERS.slice()),
      fastestLap: (sk, n) => Promise.resolve({ lapNumber: 60, lapDuration: base[n], s1: 28.792, s2: 41.089, s3: 27.174, dateStart: new Date(1e12).toISOString() }),
      carData: (sk, n) => Promise.resolve(lap(base[n]).car),
      locationData: (sk, n) => Promise.resolve(lap(base[n]).loc),
    });
    document.getElementById("dh-tab-telemetry").click();
  });
  const chips = page.locator(".dh-dchip");
  await expect(chips.first()).toBeVisible();
  for (const code of ["VER", "STR", "HUL"]) await chips.filter({ hasText: code }).first().click();
  await page.locator(".dh-livebtn", { hasText: "COMPARE 3 LAPS" }).evaluate((b) => b.click());
  await expect(page.locator(".dh-tpopup[open] .dh-dash")).toBeVisible();
  await expect(page.locator(".dh-tpopup[open] canvas.dh-map")).toBeVisible();
}

async function checkFit(page, v) {
      await openCompare(page, v);
      const r = await page.evaluate((ins) => {
        const q = (s) => /** @type {HTMLElement[]} */ ([...document.querySelectorAll(s)]);
        const box = (e) => e.getBoundingClientRect();
        const vw = innerWidth, vh = innerHeight;
        const card = box(q(".dh-tpopup-card")[0]), hdr = box(q(".dh-tpopup-hdr")[0]);
        const body = q(".dh-tpopup-body")[0];
        const labels = q(".dh-telem-side .dh-glabel");
        const overlaps = [];
        for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
          const a = box(labels[i]), b = box(labels[j]);
          if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps.push(labels[i].textContent + "/" + labels[j].textContent);
        }
        const labelClip = labels.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent);
        // scroll the single body scroller to its end, then read the last rows
        body.scrollTop = body.scrollHeight;
        const key = q(".dh-maplegend")[0], toggles = q(".dh-legend")[0];
        const main = q(".dh-telem-main")[0], chart = q("canvas[aria-label^='Telemetry trace chart']")[0];
        const mainCs = getComputedStyle(main);
        const inner = box(main).width - parseFloat(mainCs.paddingLeft) - parseFloat(mainCs.paddingRight);
        const separateScrollers = q(".dh-telem-main, .dh-telem-side")
          .filter((e) => ["auto", "scroll"].includes(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1).length;
        return {
          card: { l: card.left, t: card.top, r: card.right, b: card.bottom }, hdrTop: hdr.top, vw, vh, ins,
          overlaps, labelClip, separateScrollers,
          keyBottom: box(key).bottom, toggleBottom: box(toggles).bottom, bodyBottom: box(body).bottom, bodyTop: box(body).top,
          keyRight: box(key).right, bodyRight: box(body).right,
          chartW: box(chart).width, inner, mainScrollW: main.scrollWidth, mainClientW: main.clientWidth,
        };
      }, v);
      expect(r.card.t, "card top inside the screen").toBeGreaterThanOrEqual(v.sat - 1);
      expect(r.card.b, "card bottom above the home indicator").toBeLessThanOrEqual(r.vh - v.sab + 1);
      expect(r.card.l).toBeGreaterThanOrEqual(v.sal - 1);
      expect(r.card.r).toBeLessThanOrEqual(r.vw - v.sar + 1);
      expect(r.hdrTop, "header not scrolled or pushed off the top").toBeGreaterThanOrEqual(v.sat - 1);
      expect(r.overlaps, "gauge labels overlap").toEqual([]);
      expect(r.labelClip, "gauge labels clipped").toEqual([]);
      expect(r.separateScrollers, "no column scrolls on its own").toBe(0);
      expect(r.keyBottom, "map key reachable inside the card").toBeLessThanOrEqual(r.bodyBottom + 1);
      expect(r.keyBottom).toBeGreaterThan(r.bodyTop);
      expect(r.toggleBottom, "legend toggles reachable inside the card").toBeLessThanOrEqual(r.bodyBottom + 1);
      expect(r.keyRight).toBeLessThanOrEqual(r.bodyRight + 1);
      expect(r.mainScrollW, "no sideways overflow").toBeLessThanOrEqual(r.mainClientW + 1);
      expect(r.chartW, "trace uses the column width").toBeGreaterThanOrEqual(r.inner - 4);
}

test.describe("landscape 852x393 notch", () => {
  test.use({ viewport: { width: VIEWS[0].w, height: VIEWS[0].h }, hasTouch: true });
  test("telemetry compare view is not clipped, overlapped or narrower than its column", async ({ page }) => { await checkFit(page, VIEWS[0]); });
});
test.describe("portrait 390x844", () => {
  test.use({ viewport: { width: VIEWS[1].w, height: VIEWS[1].h }, hasTouch: true });
  test("telemetry compare view is not clipped, overlapped or narrower than its column", async ({ page }) => { await checkFit(page, VIEWS[1]); });
});

/* ── THE DATA HUB HEAD on a phone held sideways (UI contract gap 15, PR #5156) ──
 * The contract's windows: A an iPhone 15 Pro (notch left, home indicator), C the
 * same in Safari with its toolbar up (283 px tall), D a notch-less 844x390. At
 * every cell the head is ONE row — title, the tab strip, ⋯, ✕ — the ✕ is the
 * LAST thing on it, and the strip is the row's scroller (nowrap, overflow-x
 * auto, pan-x) instead of wrapping under the title or pushing ✕ off the card.
 * Measured 2026-11-07 (probe at the export): ✕ right 775 of 793 safe (A), card
 * bottom 275 of 283 (C), one row in all 15 cells. */
const HEAD_WINDOWS = [
  { name: "A 852x393 notch", w: 852, h: 393, sal: 59, sar: 59, sat: 0, sab: 21 },
  { name: "C 852x283 Safari toolbar", w: 852, h: 283, sal: 59, sar: 59, sat: 0, sab: 0 },
  { name: "D 844x390", w: 844, h: 390, sal: 47, sar: 47, sat: 0, sab: 21 },
];
// [textSize, uiScale %]: the export's own (large, UI 109 % by the coarse-pointer default), then the grid.
const HEAD_KNOBS = [["large", null], ["normal", 100], ["large", 100], ["normal", 130], ["large", 130]];

async function openHubAtExport(page, v) {
  await page.addInitScript((css) => {
    const add = () => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); };
    document.head ? add() : document.addEventListener("DOMContentLoaded", add, { once: true });
  }, `:root{--sal:${v.sal}px!important;--sat:${v.sat}px!important;--sar:${v.sar}px!important;--sab:${v.sab}px!important}`);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  const imp = await page.evaluate((d) => SettingsExport.applySettings(d, {}), OWNER);
  expect(imp.ok, "owner export imports: " + JSON.stringify(imp)).toBe(true);
  await page.reload();
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.headless(true));
  await page.click("#mb-data");
  await page.waitForSelector("#datahub:not([hidden])");
  await page.waitForFunction(() => document.querySelectorAll("#datahub .dh-tabs .dh-tab").length > 3, null, { polling: 100, timeout: 30000 });
}

async function setKnobs(page, text, ui) {
  await page.evaluate(async ([t, u]) => {
    if (window.AppearanceOpts && typeof AppearanceOpts.setTextSize === "function") AppearanceOpts.setTextSize(t);
    if (t === "normal") delete document.documentElement.dataset.textSize; else document.documentElement.dataset.textSize = t;
    if (u != null) window.__apex.uiScale(u);
    const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (window.SheetShape) SheetShape.reclassify();
    await raf2();
    if (window.SheetShape) SheetShape.reclassify();
    await raf2();
  }, [text, ui]);
}

const HEAD = () => {
  const head = document.querySelector("#datahub .dh-card > .sheet-head");
  const vis = (el) => !el.hidden && getComputedStyle(el).display !== "none";
  const kids = [...head.children].filter(vis);
  const mid = (el) => { const r = el.getBoundingClientRect(); return Math.round(r.top + r.height / 2); };
  const strip = head.querySelector(".dh-tabs"), close = head.querySelector(".dh-close");
  const cs = getComputedStyle(strip);
  const tabs = [...strip.querySelectorAll(".dh-tab")].filter(vis);
  const last = kids.reduce((a, b) => (b.getBoundingClientRect().right > a.getBoundingClientRect().right ? b : a));
  const card = document.querySelector("#datahub .dh-card").getBoundingClientRect(), cr = close.getBoundingClientRect();
  return { rows: new Set(kids.map(mid)).size, tabRows: new Set(tabs.map(mid)).size, tabs: tabs.length, lastIsClose: last === close,
    wrap: cs.flexWrap, overflowX: cs.overflowX, touch: cs.touchAction, stripFits: strip.scrollWidth <= strip.clientWidth + 1,
    closeRight: cr.right, cardLeft: card.left, cardRight: card.right, cardTop: card.top, cardBottom: card.bottom, vw: innerWidth, vh: innerHeight,
    ui: getComputedStyle(document.documentElement).getPropertyValue("--ui-scale").trim(), text: document.documentElement.dataset.textSize || "normal" };
};

for (const v of HEAD_WINDOWS) {
  test.describe(`data hub head · ${v.name}`, () => {
    test.use({ viewport: { width: v.w, height: v.h }, hasTouch: true });
    test("one row, ✕ last, the tab strip scrolls — at the owner's export and across TEXT SIZE x UI SIZE", async ({ page }) => {
      test.setTimeout(120000);
      await openHubAtExport(page, v);
      for (const [text, ui] of HEAD_KNOBS) {
        await setKnobs(page, text, ui);
        const h = await page.evaluate(HEAD);
        const cell = `${v.name} · text ${text} · UI ${ui ?? "export"} (${h.ui}/${h.text})`;
        expect(h.tabs, cell + ": tabs present").toBeGreaterThan(3);
        expect(h.rows, cell + ": the head is ONE row (title, strip, ⋯, ✕)").toBe(1);
        expect(h.tabRows, cell + ": no tab wrapped to a second line").toBe(1);
        expect(h.lastIsClose, cell + ": ✕ is the last thing on the row").toBe(true);
        expect(h.wrap, cell + ": the strip does not wrap").toBe("nowrap");
        expect(h.overflowX, cell + ": the strip is the scroller").toBe("auto");
        expect(h.touch, cell + ": a finger pans the strip sideways").toBe("pan-x");
        expect(h.closeRight, cell + ": ✕ inside the right safe inset").toBeLessThanOrEqual(h.vw - v.sar + 1);
        expect(h.cardLeft, cell + ": card clear of the notch").toBeGreaterThanOrEqual(v.sal - 1);
        expect(h.cardRight, cell + ": card inside the right inset").toBeLessThanOrEqual(h.vw - v.sar + 1);
        expect(h.cardTop, cell + ": card below the top inset").toBeGreaterThanOrEqual(v.sat - 1);
        expect(h.cardBottom, cell + ": card above the home indicator").toBeLessThanOrEqual(h.vh - v.sab + 1);
      }
    });
  });
}

/* ── THE TELEMETRY PLAYER'S ✕ on a phone held sideways (#5069) ──
 * The player's only exit painted 37x52 at 844x390 (a compact `width: 34px` rule
 * outranked the hub's --tap-paint ✕). At the owner's export and at UI SIZE 200%
 * it is a 44 px target on both axes, and the trace is reachable: the popup body
 * is the scroller, so the chart's bottom scrolls inside it.
 * Measured 2026-11-10 (probe at the export): ✕ 52x52 at every cell; body
 * scrollHeight 738 / clientHeight 213 at 200%. */
async function openFastestLap(page) {
  await page.waitForFunction(() => typeof F1API !== "undefined" && document.getElementById("dh-tab-telemetry"), null, { polling: 100 });
  await page.evaluate(() => {
    const SESSION = { sessionKey: 9999, meetingKey: 1234, year: 2026, name: "Race", type: "Race", circuit: "Singapore", country: "Singapore" };
    const t0 = 1e12, dur = 95.1, car = [], loc = [];
    for (let i = 0; i * 0.1 <= dur; i++) { const t = i * 0.1, a = (t / dur) * 2 * Math.PI;
      car.push({ t, date: t0 + t * 1000, speed: 200 + 90 * Math.sin(a * 3), throttle: 50 + 50 * Math.sin(a * 2), brake: 0, gear: 6, rpm: 11000, drs: 8 }); }
    for (let i = 0; i * 0.27 <= dur; i++) { const t = i * 0.27, a = (t / dur) * 2 * Math.PI;
      loc.push({ x: 3000 + 1600 * Math.cos(a), y: 4000 + 1400 * Math.sin(a), date: t0 + t * 1000 }); }
    const none = () => Promise.resolve([]);
    Object.assign(F1API, {
      schedule: none, driverStandings: none, constructorStandings: none, sessionResult: none, stints: none, pits: none,
      latestSession: () => Promise.resolve(SESSION),
      meetings: () => Promise.resolve([{ meetingKey: 1234, name: "Singapore GP", year: 2026 }]),
      sessionsForMeeting: () => Promise.resolve([SESSION]),
      sessionDrivers: () => Promise.resolve([{ num: 4, code: "NOR", name: "Lando Norris", color: "F47600", team: "McLaren" }]),
      fastestLap: () => Promise.resolve({ lapNumber: 60, lapDuration: dur, s1: 28.792, s2: 41.089, s3: 27.174, dateStart: new Date(t0).toISOString() }),
      carData: () => Promise.resolve(car), locationData: () => Promise.resolve(loc),
    });
    document.getElementById("dh-tab-telemetry").click();
  });
  await page.locator(".dh-dchip").filter({ hasText: "NOR" }).first().click();
  await page.locator(".dh-livebtn", { hasText: "LOAD FASTEST LAP" }).evaluate((b) => b.click());
  await expect(page.locator(".dh-tpopup[open] canvas[aria-label^='Telemetry trace chart']")).toBeVisible();
}

for (const v of [HEAD_WINDOWS[2], HEAD_WINDOWS[0]]) {
  test.describe(`telemetry player ✕ · ${v.name}`, () => {
    test.use({ viewport: { width: v.w, height: v.h }, hasTouch: true });
    for (const ui of [null, 200]) {
      test(`the close ✕ is ≥ 44 px on both axes and the trace is reachable · UI ${ui ?? "export"}`, async ({ page }) => {
        await openHubAtExport(page, v);
        if (ui != null) await setKnobs(page, "large", ui);
        await openFastestLap(page);
        const r = await page.evaluate(() => {
          const close = document.querySelector(".dh-tpopup[open] .dh-close").getBoundingClientRect();
          const body = document.querySelector(".dh-tpopup[open] .dh-tpopup-body");
          const chart = document.querySelector(".dh-tpopup[open] canvas[aria-label^='Telemetry trace chart']");
          chart.scrollIntoView({ block: "end" });
          const c = chart.getBoundingClientRect(), b = body.getBoundingClientRect();
          return { w: close.width, h: close.height, chartBottom: c.bottom, bodyBottom: b.bottom, chartTop: c.top, bodyTop: b.top };
        });
        const cell = `${v.name} · UI ${ui ?? "export"}`;
        expect(r.w, cell + ": ✕ width").toBeGreaterThanOrEqual(44);
        expect(r.h, cell + ": ✕ height").toBeGreaterThanOrEqual(44);
        expect(r.chartBottom, cell + ": the trace's bottom scrolls into the popup body").toBeLessThanOrEqual(r.bodyBottom + 1);
        expect(r.chartBottom, cell + ": and is on screen").toBeGreaterThan(r.bodyTop);
      });
    }
  });
}
