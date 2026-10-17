// @ts-check
// Data hub TELEMETRY compare view FIT on a phone: the popup card stays inside
// the screen (header not clipped off the top), the gauge labels never collide,
// the trace takes the free width, and the whole body scrolls as ONE column so
// the last row (map key, legend toggles) is reachable above the bottom edge.
// Notch insets are injected (headless reports env(safe-area-inset-*) as 0).
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";

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

for (const v of VIEWS) {
  test.describe(v.name, () => {
    test.use({ viewport: { width: v.w, height: v.h }, hasTouch: true });

    test("telemetry compare view is not clipped, overlapped or narrower than its column", async ({ page }) => {
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
    });
  });
}
