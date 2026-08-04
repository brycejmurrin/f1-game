// @ts-check
// TOUCH CONTROL + HUD LAYOUT, across every steering mode, gearbox mode,
// orientation and phone size — including a simulated NOTCH.
//
// This exists because adding one control silently broke the others. The
// landscape HUD strip used to be centred with a hand-tuned offset ("20px left
// of centre so OVERTAKE clears BOOST/OT"), a constant encoding both the strip's
// width and the button column's. Adding ACTIVE AERO widened the strip, and the
// AERO chip began sitting on top of the BRAKE button on a small landscape phone
// — a readout over a tap target, which is the worst kind of overlap. Nothing
// caught it: the strip was never measured against the buttons at any size.
//
// Safe-area insets are injected rather than emulated: headless Chromium reports
// env(safe-area-inset-*) as 0, so a notched phone is otherwise untestable, and
// the notch is exactly where a 59px inset eats the width these rules assume.
import { test, expect } from "@playwright/test";

const VIEWS = [
  // iPhone 15 Pro landscape: 59px of notch either side, 21px home indicator.
  { name: "notched-landscape", w: 852, h: 393, sal: 59, sar: 59, sat: 0, sab: 21 },
  { name: "notched-portrait", w: 393, h: 852, sal: 0, sar: 0, sat: 59, sab: 34 },
  // iPhone SE: the smallest screen still in service, and the tightest fit.
  { name: "small-landscape", w: 667, h: 375, sal: 0, sar: 0, sat: 0, sab: 0 },
  { name: "small-portrait", w: 375, h: 667, sal: 0, sar: 0, sat: 0, sab: 0 },
];
const CTRL = ["btn-throttle", "btn-brake", "btn-boost", "btn-ot", "btn-aero",
              "shift-up", "shift-down", "btn-steer-left", "btn-steer-right", "pausebtn"];
const HUD = ["hud-aero", "hud-ot", "hud-gearbox", "hud-energy", "hud-speed"];

async function race(page, steer, manual, ins) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 15000 });
  await page.evaluate(([s, m]) => {
    localStorage.setItem("apex26.steerMode", JSON.stringify(s));
    localStorage.setItem("apex26.manual", JSON.stringify(m));
  }, [steer, manual]);
  await page.reload();
  await page.waitForFunction(() => window.__apex != null, { timeout: 15000 });
  await page.addStyleTag({ content:
    `:root{--sal:${ins.sal}px;--sar:${ins.sar}px;--sat:${ins.sat}px;--sab:${ins.sab}px;}` });
  await page.evaluate(() => window.__apex.race("monza"));
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 40_000 });
  await page.evaluate(() => { window.__apex.go(); window.__apex.jump(0.1, 60, 0); });
  await page.waitForTimeout(300);
}

const measure = (page, ctrl, hud, W, H, ins) => page.evaluate(([c, h, w, ht, i]) => {
  const box = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const cs = getComputedStyle(el);
    if (el.hidden || cs.display === "none" || cs.visibility === "hidden"
        || parseFloat(cs.opacity) === 0) return null;
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) return null;
    return { id, x: b.x, y: b.y, r: b.right, b: b.bottom };
  };
  const vis = c.map(box).filter(Boolean), hb = h.map(box).filter(Boolean);
  const hit = (a, d) => !(a.r <= d.x + 0.5 || d.r <= a.x + 0.5 || a.b <= d.y + 0.5 || d.b <= a.y + 0.5);
  const overlaps = [], hudClash = [];
  for (let x = 0; x < vis.length; x++)
    for (let y = x + 1; y < vis.length; y++)
      if (hit(vis[x], vis[y])) overlaps.push(`${vis[x].id}+${vis[y].id}`);
  for (const a of hb) for (const d of vis) if (hit(a, d)) hudClash.push(`${a.id}+${d.id}`);
  const unsafe = vis.filter((e) => e.x < i.sal - 0.5 || e.r > w - i.sar + 0.5
                                || e.y < i.sat - 0.5 || e.b > ht - i.sab + 0.5)
                    .map((e) => e.id);
  return { overlaps, hudClash, unsafe, count: vis.length };
}, [ctrl, hud, W, H, ins]);

for (const v of VIEWS) {
  test.describe(v.name, () => {
    test.use({ viewport: { width: v.w, height: v.h }, hasTouch: true });
    for (const steer of ["tilt", "buttons", "touch"]) {
      for (const manual of [false, true]) {
        test(`${steer} / ${manual ? "manual" : "auto"} gears`, async ({ page }) => {
          await race(page, steer, manual, v);
          const r = await measure(page, CTRL, HUD, v.w, v.h, v);
          expect(r.count, "controls are on screen at all").toBeGreaterThan(3);
          // No control may sit on another — every one of these is a tap target.
          expect(r.overlaps).toEqual([]);
          // And no READOUT may sit on a tap target, which is the failure that
          // shipped: you cannot read what your thumb is covering, and you
          // cannot press what a number is drawn over.
          expect(r.hudClash).toEqual([]);
          // Everything inside the safe box, not merely inside the viewport —
          // a notch does not politely render behind a button.
          expect(r.unsafe).toEqual([]);
        });
      }
    }
  });
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false });
  test("hides the whole touch stack, keeping only the pause button", async ({ page }) => {
    await race(page, "tilt", false, { sal: 0, sar: 0, sat: 0, sab: 0 });
    const shown = await page.evaluate((ids) => ids.filter((id) => {
      const el = document.getElementById(id);
      if (!el) return false;
      const cs = getComputedStyle(el);
      return !el.hidden && cs.display !== "none" && cs.visibility !== "hidden";
    }), CTRL);
    expect(shown).toEqual(["pausebtn"]);
  });
});
