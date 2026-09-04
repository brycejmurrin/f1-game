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
import { BOOT_MS } from "../helpers/fixtures.js";

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
// A19: this used to stop at the bottom-bar readouts, so a HUD cluster that
// overflowed UPWARD (A17's failure mode — wrap-reverse stacked the docks into
// a column that grew out of the top of the phone) had nothing above it to
// collide with in this spec. The rejected alternative fix for A17 would have
// landed the cluster on `.hud-gaps` at 852x393 and this file would still have
// gone green. `.hud-top`/`.hud-gaps` are checked as CONTAINERS — each has
// padding and a background in css/hud.css, so it always has a box even if a
// gap indicator's text is momentarily empty (nobody directly ahead/behind);
// checking the two leaf spans instead would silently skip that case.
const HUD = ["hud-aero", "hud-ot", "hud-gearbox", "hud-energy", "hud-speed"];
// LANDSCAPE ONLY. Added `.hud-top`/`.hud-gaps`/`#minimap`/`#hud-sectors` here
// first and every PORTRAIT case failed on the same pair: `.hud-top` (the
// POS/LAP/TIME/BEST row) genuinely overlaps `#pausebtn` — measured directly,
// notched-portrait, x=[53.3,339.7] vs [331,383], y=[68.2,117.4] vs [67,119],
// an 8.7px real collision, not a rounding artefact.
//
// It is invisible to every player, and not by luck: `#rotate-device` (CSS
// `body.in-race #rotate-device { display: flex }`) is a FULL-SCREEN
// `z-index: 9000` block, confirmed live in the exact failing state
// (bodyInRace: true, display: "flex", box 0,0 -> viewport). Nothing under it
// can be seen or touched while it is up, and it is not gated on a timing
// window or an animation — it is unconditional on being in a race in
// portrait, which is the only state this spec's `race()` helper produces.
// Same shape as the "screen-edge system gestures" finding in
// docs/research/PLATFORM-INPUT-NOTES.md §9: a real geometric fact that does
// not reach the player because something else sits in front of it, and the
// fix is to stop asserting on it, not to move CSS nobody will ever see move.
const HUD_LANDSCAPE_ONLY = [".hud-top", ".hud-gaps", "#minimap", "#hud-sectors"];

async function race(page, steer, manual, ins) {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 15 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(([s, m]) => {
    localStorage.setItem("apex26.steerMode", JSON.stringify(s));
    localStorage.setItem("apex26.manual", JSON.stringify(m));
  }, [steer, manual]);
  await page.reload();
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.addStyleTag({ content:
    `:root{--sal:${ins.sal}px;--sar:${ins.sar}px;--sat:${ins.sat}px;--sab:${ins.sab}px;}` });
  await page.evaluate(() => window.__apex.race("monza"));
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => { window.__apex.go(); window.__apex.jump(0.1, 60, 0); });
  await page.waitForTimeout(300);
}

const measure = (page, ctrl, hud, W, H, ins) => page.evaluate(([c, h, w, ht, i]) => {
  // CTRL is bare ids (buttons: getElementById is enough, and every one is #id
  // in practice); HUD can name a CONTAINER by class (see the comment on HUD
  // above), so resolve through querySelector with an implicit `#` for a bare id.
  const box = (id) => {
    const el = document.querySelector(id.startsWith(".") || id.startsWith("#") ? id : "#" + id);
    if (!el) return null;
    const cs = getComputedStyle(el);
    if (el.hidden || cs.display === "none" || cs.visibility === "hidden"
        || parseFloat(cs.opacity) === 0) return null;
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) return null;
    // Round buttons are compared as CIRCLES, not as boxes. The controls are
    // border-radius:50%, and they sit on an arc — i.e. diagonally offset from
    // each other — where two bounding rects can overlap while the circles they
    // contain are comfortably apart. Testing rects there fails a layout that is
    // visually and physically fine, and would have forced the arc back into a
    // column for no reason.
    const rad = parseFloat(cs.borderRadius) || 0;
    const round = rad >= b.width * 0.45;
    return { id, x: b.x, y: b.y, r: b.right, b: b.bottom,
             round, cx: b.x + b.width / 2, cy: b.y + b.height / 2, rr: b.width / 2 };
  };
  const vis = c.map(box).filter(Boolean), hb = h.map(box).filter(Boolean);
  const hit = (a, d) => !(a.r <= d.x + 0.5 || d.r <= a.x + 0.5 || a.b <= d.y + 0.5 || d.b <= a.y + 0.5);
  // Two circles touch only when their centres are closer than the sum of radii.
  const clash = (a, d) => (a.round && d.round)
    ? Math.hypot(a.cx - d.cx, a.cy - d.cy) < a.rr + d.rr - 0.5
    : hit(a, d);
  const overlaps = [], hudClash = [];
  for (let x = 0; x < vis.length; x++)
    for (let y = x + 1; y < vis.length; y++)
      if (clash(vis[x], vis[y])) overlaps.push(`${vis[x].id}+${vis[y].id}`);
  // HUD readouts keep the CONSERVATIVE rect test against buttons: a number
  // drawn across a circle's bounding corner is still a number you cannot read.
  for (const a of hb) for (const d of vis) if (hit(a, d)) hudClash.push(`${a.id}+${d.id}`);
  // …AND AGAINST EACH OTHER. This pair was missing, and that is exactly how the
  // gap strip shipped painting over the POS/LAP/TIME/BEST plates on a notched
  // landscape phone: .hud-gaps and .hud-top share a `top`, neither sets a
  // z-index, and nothing here ever compared two HUD boxes. A defect ledger
  // entry claimed this coverage was closed when only HUD-vs-buttons was.
  for (let x = 0; x < hb.length; x++)
    for (let y = x + 1; y < hb.length; y++)
      if (hit(hb[x], hb[y])) hudClash.push(`${hb[x].id}+${hb[y].id}`);
  // The safe area binds the HUD clusters too — they are inset by --sal/--sar in
  // their own CSS, so a miss there is a real clip on the notch side.
  const unsafe = [...vis, ...hb].filter((e) => e.x < i.sal - 0.5 || e.r > w - i.sar + 0.5
                                || e.y < i.sat - 0.5 || e.b > ht - i.sab + 0.5)
                    .map((e) => e.id);
  return { overlaps, hudClash, unsafe, count: vis.length };
}, [ctrl, hud, W, H, ins]);

for (const v of VIEWS) {
  test.describe(v.name, () => {
    // DECLARE THE BUDGET. Every test below boots a full race — 22 cars, a built
    // circuit, the maps pass — just to measure HUD box geometry, and the page
    // log puts that fixture at 76-80 s before the body starts on a CI runner.
    //
    // With nothing declared, tools/ci/select-specs.mjs had no way to know: its
    // `EXCLUDED (declares Ns test budget > gate 120s)` guard keys on
    // test.setTimeout, so this spec alone slipped through into the 120 s
    // change-aware gate that every other race-fixture spec is excluded from.
    // It then failed 6 of its first 7 tests at exactly "Test timeout of
    // 120000ms exceeded" and burned the job's whole 26-minute cap, which
    // CANCELLED Pages #1967 (run 33822785596, job 100868882762) — a deploy
    // stopped by a spec that never had a chance to pass.
    //
    // 300 s is the value its peers on this same fixture already carry
    // (bahrain/cota/monaco/montreal-foundation, autopilot), and MEASURED here
    // rather than only inherited: a local run of the notched-landscape block
    // (6/6 passed, 2026-09-04) timed `tilt / auto gears` at 149 s — already
    // past the 120 s gate on a quiet box, against 134.3 s when CI killed it.
    // The number is the spec saying what it costs; the gate then decides
    // whether it can afford it.
    test.setTimeout(300_000);
    test.use({ viewport: { width: v.w, height: v.h }, hasTouch: true });
    for (const steer of ["tilt", "buttons", "touch"]) {
      for (const manual of [false, true]) {
        test(`${steer} / ${manual ? "manual" : "auto"} gears`, async ({ page }) => {
          await race(page, steer, manual, v);
          const hud = v.name.includes("landscape") ? [...HUD, ...HUD_LANDSCAPE_ONLY] : HUD;
          const r = await measure(page, CTRL, hud, v.w, v.h, v);
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
