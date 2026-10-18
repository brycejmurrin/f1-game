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
import { BOOT_MS, awaitTrackBuild } from "../helpers/fixtures.js";
import { awaitApexBoot } from "../helpers/await-track-build.js";
import { analyzeOverlap, probeHudElements } from "../../tools/lib/hud-geometry.mjs";

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
// gone green. `.hud-top`/`.hud-gaps` are checked as CONTAINERS (padding +
// background). Empty gap lines now collapse the plate
// (`.hud-gaps:not(:has(> div:not(:empty)))` in css/hud.css) — a solo-race
// fixture with both lines "" has no gaps box; seed text before asserting the
// plate survives COMPACT (metrics layout below).
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
// #hud-limits joined this list after it shipped overlapping #hud-sectors by
// 8.6px: the clash check only ever looked at elements named here, so a NEW
// fixed-position HUD element is invisible to it until someone adds it.
// HOW MUCH ROOM IS LEFT. This file asserts "no overlap", which is a yes/no and
// says nothing about how close the layout is to failing. Measured across all 12
// landscape cases (2026-09-14, same pairing as `measure` below, reporting the
// minimum clearance of every asserted pair instead of asserting zero), the
// tightest gaps are IDENTICAL in every case and every one of them is a constant
// the CSS declares, not a near-miss the layout happened to land on:
//
//   4.0px   #hud-sectors x #pausebtn   the literal `+ 4px` in css/hud.css's
//                                      `top: calc((8px + var(--tap) + 4px + var(--sat)) / var(--hud-z))`
//   6.7px   button x button            the dock's own gap, --gap-derived
//   8.0px   .hud-gaps x #minimap, and the safe-area margin on all four readouts
//
// So the budget is 4px, and it belongs to ONE pair. #hud-sectors grows downward
// from a top that clears #pausebtn by exactly that much, so nothing that makes
// the pause button taller (--tap is 44 desktop / 52 touch) or the sectors box
// start higher has anywhere to go — that is the collision this very file caught
// once already, when the 56 was hard-coded. Everything else has room.
// #announce is the RADIO CARD (every banner since 8d3604596): hidden until a
// message shows, so race() below unhides it with a long line — measured, it
// must clear the timing row it hangs under, the flag chip, and the gaps strip.
const HUD_LANDSCAPE_ONLY = [".hud-top", ".hud-gaps", "#minimap", "#hud-sectors", "#hud-limits", "#announce"];

// Shipped TEXT SIZE large / HIGH CONTRAST / HOME SCENE photo / HELMET cam
// (settings-defaults) change HUD zoom and onboard chrome. This file measures
// the previous look (cockpit + normal type). Putting the spec in the diff
// also ranks it 0 so select-specs cannot drop it as over-budget overflow.
const PIN_PREVIOUS_LOOK = () => {
  try {
    localStorage.setItem("apex26.textSize", '"normal"');
    localStorage.setItem("apex26.uiContrast", '"off"');
    localStorage.setItem("apex26.homeScene", '"garage"');
    localStorage.setItem("apex26.camMode", "3");
  } catch (_) {}
};

/** Touch: fitHud painted clearance + published --hud-fit-stamp before probes. */
async function waitPhoneHudFitClearance(page, opts, timeoutMs = 30_000) {
  const o = opts || {};
  await page.waitForFunction(async ({ needRel, prevStamp }) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (document.body.classList.contains("desktop")) return true;
    if (typeof GameHud !== "undefined" && GameHud.syncPhoneFit) GameHud.syncPhoneFit();
    const stamp = document.documentElement.style.getPropertyValue("--hud-fit-stamp");
    if (!stamp || !/^\d+$/.test(stamp)) return false;
    if (prevStamp != null && prevStamp !== "" && stamp === prevStamp) return false;
    const hit = (a, b) => a.width > 0 && b.width > 0
      && a.left < b.right - 0.5 && b.left < a.right - 0.5
      && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const boost = document.getElementById("btn-boost");
    const sectors = document.getElementById("hud-sectors");
    if (sectors && !sectors.hidden && boost && !boost.hidden) {
      const br = boost.getBoundingClientRect();
      if (br.width && (br.left + br.right) / 2 >= window.innerWidth / 2) {
        const s = sectors.getBoundingClientRect();
        if (s.width && hit(s, br)) return false;
      }
    }
    if (needRel) {
      const rel = document.getElementById("hud-rel");
      const brake = document.getElementById("btn-brake");
      if (!rel || rel.hidden || !brake) return false;
      const rr = rel.getBoundingClientRect(), brk = brake.getBoundingClientRect();
      if (!(rr.width && brk.width)) return false;
      if (hit(rr, brk)) return false;
    }
    try { window.__apex.freeze(true); } catch (_) { /* */ }
    return true;
  }, { needRel: !!o.rel, prevStamp: o.prevStamp ?? null }, { polling: 100, timeout: timeoutMs });
}

/** Touch: fitHud + sectors/BOOST clearance before box probes (CI parallel load). */
async function waitTowerClearsGaps(page, timeoutMs = 30_000) {
  await page.waitForFunction(() => {
    const top = document.querySelector(".hud-top");
    const gaps = document.querySelector(".hud-gaps");
    if (!top || !gaps || top.hidden || gaps.hidden) return true;
    const tr = top.getBoundingClientRect();
    const gr = gaps.getBoundingClientRect();
    if (!(tr.width > 0 && gr.width > 0)) return true;
    const hit = tr.left < gr.right - 0.5 && gr.left < tr.right - 0.5
      && tr.top < gr.bottom - 0.5 && gr.top < tr.bottom - 0.5;
    return !hit;
  }, null, { polling: 100, timeout: timeoutMs });
}

async function waitTouchSectorsClearBoost(page, timeoutMs = 30_000) {
  await page.waitForFunction(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (document.body.classList.contains("desktop")) return true;
    const boost = document.getElementById("btn-boost");
    const sectors = document.getElementById("hud-sectors");
    if (!boost || boost.hidden || !sectors) return false;
    const sec = sectors.getBoundingClientRect();
    const br = boost.getBoundingClientRect();
    if (!(sec.width > 0 && br.width > 0)) return false;
    const dockRW = parseFloat(document.documentElement.style.getPropertyValue("--dock-r-w"));
    if (!(Number.isFinite(dockRW) && dockRW > 0)) return false;
    const hit = sec.left < br.right - 0.5 && br.left < sec.right - 0.5
      && sec.top < br.bottom - 0.5 && br.top < sec.bottom - 0.5;
    return !hit;
  }, null, { polling: 100, timeout: timeoutMs });
}

async function race(page, steer, manual, ins, opts) {
  const o = opts || {};
  await page.addInitScript(PIN_PREVIOUS_LOOK);
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 15 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(([s, m, prof, lay, hudSc, btnSc]) => {
    localStorage.setItem("apex26.steerMode", JSON.stringify(s));
    localStorage.setItem("apex26.manual", JSON.stringify(m));
    // Race-radio card life grew with #1802; silence chatter so fitHud is not
    // still chasing a live banner while this spec measures static geometry.
    localStorage.setItem("apex26.radioChat", JSON.stringify("off"));
    localStorage.setItem("apex26.commentary", JSON.stringify("off"));
    // THE PROFILE IS A BOOT KEY. Every case below used the DEFAULT profile on a
    // chase camera, so the whole broadcast layout — which re-anchors `.hud-top`
    // from centre to the top-LEFT corner, into #minimap's own slot — was never
    // once measured here. It shipped painting the tower over the POS tile.
    if (prof) localStorage.setItem("apex26.hudProfile", JSON.stringify(prof));
    // LAYOUT is a boot key too, and until 2026-09-04 it was the only HUD control
    // with no stylesheet behind it at all — three names that set a body class
    // and changed nothing on screen.
    if (lay) localStorage.setItem("apex26.hudMetricsLayout", JSON.stringify(lay));
    if (hudSc != null) localStorage.setItem("apex26.hudScale", JSON.stringify(hudSc));
    if (btnSc != null) localStorage.setItem("apex26.hudBtnScale", JSON.stringify(btnSc));
  }, [steer, manual, o.profile || null, o.layout || null, o.hudScale ?? null, o.btnScale ?? null]);
  await page.reload();
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.addStyleTag({ content:
    `:root{--sal:${ins.sal}px;--sar:${ins.sar}px;--sat:${ins.sat}px;--sab:${ins.sab}px;}` });
  await page.evaluate(() => window.__apex.race("monza"));
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.go());
  // The CAMERA decides half the adaptive rules (ONBOARD_IDS / BCAM_IDS in
  // js/ui/hud.js), so a spec that never leaves chase cannot see them.
  await page.evaluate(([camera, hold]) => {
    // headless alone leaves physics/HUD ticks running. Hold the broadcast
    // probe's inputs before selecting its camera and refreshing the real HUD,
    // in one turn: no renderer warm-up or changing lap text can intervene.
    if (hold) { window.__apex.freeze(true); window.__apex.headless(true); }
    if (camera) window.__apex.camera(camera);
    // jump synchronously refreshes HUD classes/fit, bypassing tickBody's
    // GPU/mirror warm-up gate. It must follow the camera choice.
    window.__apex.jump(0.1, 60, 0);
  }, [o.cam || null, o.profile === "broadcast"]);
  // THE RADIO CARD, shown with its longest tenant so its box is measured: the
  // engineer's longest line on the driver's channel. The DOM is poked
  // directly — there is no __apex hook for a banner, and a real one would
  // fade during the measurement.
  await page.evaluate(() => {
    const e = document.getElementById("announce");
    document.getElementById("announce-who").textContent = "VERSTAPPEN · RADIO · 33";
    document.getElementById("announce-text").textContent = "CAUTION — CHEAPER STOP, ABOUT 23s LOST";
    e.hidden = false;
  });
  if (o.profile === "broadcast") {
    // CI selected-specs 37100340716: broadcast+heli timed out here at 5 s
    // while cockpit passed. camera() now refreshHud(true)s like jump(), so
    // hud-bcam and --hud-top-h publish without waiting for a starved heli
    // frame. Still wait for that published input — not for overlap to go
    // green, and not a longer timeout. toFixed(1) in fitHud rounds own-unit
    // height to 0.1px.
    // API: https://playwright.dev/docs/api/class-page#page-wait-for-function
    await page.waitForFunction(async (broadcastCamera) => {
      // Published inputs can precede Chromium's sibling style invalidation:
      // captured rules/vars were correct while map/gaps still had base top:8px.
      // Cross a paint boundary within this same 5 s budget before measuring.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const tower = document.querySelector(".hud-top");
      if (!tower || document.body.classList.contains("hud-bcam") !== broadcastCamera) return false;
      const height = tower.getBoundingClientRect().height / (tower.currentCSSZoom || 1);
      const published = parseFloat(document.documentElement.style.getPropertyValue("--hud-top-h"));
      return height > 0 && Number.isFinite(published) && Math.abs(height - published) <= 0.1;
    }, o.cam === "heli", { polling: 100, timeout: 5_000 });
  } else {
    // EVERY OTHER CELL waits for the same published input, not 300 ms: on the
    // first cell after a cold server boot (2026-10-05, 32-cell run, 1 worker)
    // the two notched-landscape tilt cells measured #hud-sectors on the pause
    // button and the map and sectors outside the notch's safe box, and both
    // passed on replay on the same tree and on the base — the clusters were
    // read before fitHud had published --hud-top-h for the booted fonts.
    // Same wait as the broadcast branch minus the hud-bcam expectation.
    await page.waitForFunction(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const tower = document.querySelector(".hud-top");
      if (!tower) return false;
      const height = tower.getBoundingClientRect().height / (tower.currentCSSZoom || 1);
      const published = parseFloat(document.documentElement.style.getPropertyValue("--hud-top-h"));
      if (!(height > 0 && Number.isFinite(published) && Math.abs(height - published) <= 0.1)) return false;
      // Phone: wait until S3 has cleared a lit BOOST and the radio card (CI
      // oversize APEX_WORKERS=2: wrap-reverse / lane settle after --hud-top-h).
      if (document.body.classList.contains("desktop")) return true;
      const phoneSteer = document.body.classList.contains("steer-buttons")
        || document.body.classList.contains("steer-touch");
      const boost = document.getElementById("btn-boost");
      if (phoneSteer && (!boost || boost.hidden)) return false;
      const sec = document.getElementById("hud-sectors");
      if (!sec || sec.hidden || !sec.childElementCount) return false;
      const s = sec.getBoundingClientRect();
      if (!(s.width > 0)) return false;
      // BOOST clearance only when BOOST sits on the RIGHT (buttons/touch).
      // Tilt parks BOOST on the left — using that edge as the dock target
      // blew --dock-r-w to midCap (CI: dockRW 907, sectors under --sal).
      const b = boost && !boost.hidden ? boost.getBoundingClientRect() : null;
      const boostOnRight = !!(b && b.width && (b.left + b.right) / 2 >= window.innerWidth / 2);
      if (boostOnRight) {
        const dockRW = parseFloat(document.documentElement.style.getPropertyValue("--dock-r-w"));
        if (!(Number.isFinite(dockRW) && dockRW > 0)) return false;
        if (s.right > b.left + 0.5) return false;
      } else if (!boost || boost.hidden) {
        /* desktop / no BOOST — tower wait above is enough */
      }
      const ann = document.getElementById("announce");
      if (ann && !ann.hidden && !ann.hasAttribute("data-lane-collapsed")) {
        const a = ann.getBoundingClientRect();
        const hit = (el) => {
          if (!el || el.hidden) return false;
          const r = el.getBoundingClientRect();
          return a.width > 0 && r.width > 0
            && r.left < a.right - 0.5 && a.left < r.right - 0.5
            && r.top < a.bottom - 0.5 && a.top < r.bottom - 0.5;
        };
        if (hit(sec) || hit(document.querySelector(".hud-top"))) return false;
      }
      const top = document.querySelector(".hud-top");
      const gaps = document.querySelector(".hud-gaps");
      if (top && gaps && top.getBoundingClientRect().width > 0 && gaps.getBoundingClientRect().width > 0) {
        const tr = top.getBoundingClientRect();
        const gr = gaps.getBoundingClientRect();
        const towerGaps = tr.left < gr.right - 0.5 && gr.left < tr.right - 0.5
          && tr.top < gr.bottom - 0.5 && gr.top < tr.bottom - 0.5;
        if (towerGaps) return false;
      }
      // Notch safe box: a mid-fit #minimap / #hud-sectors can sit under --sal
      // for one tick. Require both inside the injected safe insets.
      const sal = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sal")) || 0;
      const sar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sar")) || 0;
      if (s.left < sal - 0.5 || s.right > window.innerWidth - sar + 0.5) return false;
      const map = document.getElementById("minimap");
      if (map && !map.hidden) {
        const m = map.getBoundingClientRect();
        if (m.width > 0 && (m.left < sal - 0.5 || m.right > window.innerWidth - sar + 0.5)) return false;
      }
      // fitHud bumps --hud-fit-stamp only after painted phone clearance lands.
      const stamp = document.documentElement.style.getPropertyValue("--hud-fit-stamp");
      if (!stamp || !/^\d+$/.test(stamp)) return false;
      // Freeze in the same turn that saw clearance. updateHud still ticks
      // while frozen, but fitHud's painted-clash path re-opens the same-key
      // backoff if wrap-reverse crawls BOOST back onto S3.
      try { window.__apex.freeze(true); } catch (_) { /* */ }
      return true;
    }, null, { polling: 100, timeout: 30_000 });
  }
}

const measure = async (page, ctrl, hud, W, H, ins) => {
  await page.evaluate(() => {
    if (typeof GameHud !== "undefined" && GameHud.invalidateFit) GameHud.invalidateFit();
  });
  await waitPhoneHudFitClearance(page);
  await waitTouchSectorsClearBoost(page);
  await waitTowerClearsGaps(page);
  await page.waitForFunction(() => {
    const ann = document.getElementById("announce");
    const sectors = document.getElementById("hud-sectors");
    if (!ann || ann.hidden || !sectors) return true;
    const a = ann.getBoundingClientRect();
    const s = sectors.getBoundingClientRect();
    if (!(a.width && s.width)) return true;
    const hit = s.left < a.right - 0.5 && a.left < s.right - 0.5
      && s.top < a.bottom - 0.5 && a.top < s.bottom - 0.5;
    return !hit;
  }, null, { polling: 100, timeout: 30_000 });
  // THE BOX PROBE AND THE CLASH RULES live in tools/lib/hud-geometry.mjs since
  // 2026-10-03, shared with tools/shot/hud-survey.mjs (the HUD survey across
  // devices x cameras x presets), so the spec and the survey cannot disagree on
  // what an overlap is. The rules are unchanged — read them there: round
  // buttons compare as CIRCLES, readouts vs buttons and readouts vs readouts as
  // conservative RECTS (a number drawn across a circle's bounding corner is
  // still unreadable; the readout-vs-readout pair is how the gap strip shipped
  // over the POS/LAP/TIME/BEST plates), and the safe area binds both, because
  // the clusters are inset by --sal/--sar in their own CSS.
  // CTRL is bare ids; HUD can name a CONTAINER by class (see HUD above).
  const targets = [...ctrl.map((k) => ({ key: k, sel: k, role: "ctrl" })),
                   ...hud.map((k) => ({ key: k, sel: k, role: "hud" }))];
  const recs = await page.evaluate(probeHudElements, { targets });
  const r = analyzeOverlap(recs, W, H, ins);
  // Diagnostics only on a readout clash: why the fit pass let it through.
  const hb = recs.filter((e) => e.visible && e.role === "hud");
  r.diagnostics = r.hudClash.length ? await page.evaluate(hudClashDiagnostics, hb) : null;
  return r;
};

const hudClashDiagnostics = (hb) => {
  const root = document.documentElement;
  const topRules = (el) => {
    const matched = [];
    const walk = (rules, href, nesting) => {
      for (const rule of rules) {
        if (rule.media && !matchMedia(rule.media.mediaText).matches) continue;
        if (rule.constructor.name === "CSSSupportsRule" && !CSS.supports(rule.conditionText)) continue;
        if (rule.selectorText && rule.style && rule.style.getPropertyValue("top")) {
          try {
            if (el.matches(rule.selectorText)) matched.push({ href, nesting,
              selector: rule.selectorText, top: rule.style.getPropertyValue("top"),
              priority: rule.style.getPropertyPriority("top") });
          } catch { /* A browser-specific selector is not diagnostic evidence. */ }
        }
        if (rule.cssRules) walk(rule.cssRules, href,
          [...nesting, rule.cssText.slice(0, rule.cssText.indexOf("{")).trim()]);
      }
    };
    for (const sheet of document.styleSheets) {
      if (sheet.disabled || (sheet.media.length && !matchMedia(sheet.media.mediaText).matches)) continue;
      try { walk(sheet.cssRules, sheet.href || "inline", []); }
      catch { /* Cross-origin sheets cannot be inspected. */ }
    }
    return matched;
  };
  const detail = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const cs = getComputedStyle(el), rect = el.getBoundingClientRect();
    return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom },
      currentCSSZoom: el.currentCSSZoom, zoom: cs.zoom, transform: cs.transform,
      cssHeight: cs.height, top: cs.top, display: cs.display, fontSize: cs.fontSize,
      inlineStyle: el.style.cssText,
      variables: Object.fromEntries(["--hud-top-h", "--hud-z", "--sat", "--hud-scale"]
        .map((name) => [name, cs.getPropertyValue(name)])), matchedTopRules: topRules(el) };
  };
  return { hb, bodyClass: document.body.className,
    publishedHeight: root.style.getPropertyValue("--hud-top-h"),
    publishedZoom: root.style.getPropertyValue("--hud-z-top"),
    computedHeight: getComputedStyle(root).getPropertyValue("--hud-top-h"),
    computedZoom: getComputedStyle(root).getPropertyValue("--hud-z-top"),
    tower: detail(".hud-top"), map: detail("#minimap"), gaps: detail(".hud-gaps") };
};

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
          // NAME THE BOXES IN THE MESSAGE. These three assert an EMPTY list, so
          // a failure prints "Received + 4" and the reporter truncates the
          // contents — which says a collision happened and nothing about what
          // hit what. Finding that out cost three separate browser probes
          // (2026-09-09); the answer was one pair, `.hud-top x .hud-gaps`, and
          // it was in the array the whole time. The dump also carries the fit
          // pass's own state, because "which elements" and "why did the cap not
          // stop it" are the same question.
          let dump = " " + JSON.stringify({ overlaps: r.overlaps, hudClash: r.hudClash,
                                              unsafe: r.unsafe, fit: r.fit || null });
          if (r.hudClash.length) {
            const geo = await page.evaluate(() => {
              const root = document.documentElement;
              const box = (id) => {
                const el = document.getElementById(id);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { l:+r.left.toFixed(1), r:+r.right.toFixed(1), t:+r.top.toFixed(1), b:+r.bottom.toFixed(1),
                  w:+r.width.toFixed(1), h:+r.height.toFixed(1), hidden: !!el.hidden,
                  vis: getComputedStyle(el).visibility, collapsed: el.hasAttribute("data-lane-collapsed") };
              };
              return {
                dockRW: root.style.getPropertyValue("--dock-r-w"),
                laneX: root.style.getPropertyValue("--announce-lane-x"),
                laneW: root.style.getPropertyValue("--announce-lane-w"),
                radioTop: document.body.classList.contains("hud-radio-top"),
                radioTopW: root.style.getPropertyValue("--radio-top-w"),
                radioTopX: root.style.getPropertyValue("--radio-top-x"),
                body: document.body.className,
                sec: box("hud-sectors"), ann: box("announce"), boost: box("btn-boost"),
              };
            });
            dump += " geo=" + JSON.stringify(geo);
          }
          // No control may sit on another — every one of these is a tap target.
          expect(r.overlaps, "controls must not sit on each other" + dump).toEqual([]);
          // And no READOUT may sit on a tap target, which is the failure that
          // shipped: you cannot read what your thumb is covering, and you
          // cannot press what a number is drawn over.
          expect(r.hudClash, "no HUD readout may sit on another" + dump).toEqual([]);
          // Everything inside the safe box, not merely inside the viewport —
          // a notch does not politely render behind a button.
          expect(r.unsafe, "nothing may leave the safe area" + dump).toEqual([]);
        });
      }
    }
  });
}

// THE ADAPTIVE COMBINATIONS. Everything above drives the DEFAULT profile on a
// chase camera, which is why the broadcast tower shipped painted over the POS
// tile: `body.hud-prof-broadcast .hud-top` re-anchors from `left: 50%` to the
// top-LEFT corner — #minimap's own slot — and nothing here had ever laid that
// out. One notched landscape phone, the profile x camera pairs that actually
// change the anchoring.
for (const c of [
  { name: "broadcast + cockpit", profile: "broadcast", cam: "cockpit" },
  { name: "broadcast + heli",    profile: "broadcast", cam: "heli" },
  { name: "minimal + cockpit",   profile: "minimal",   cam: "cockpit" },
]) {
  test.describe(c.name, () => {
    test.setTimeout(300_000);
    test.use({ viewport: { width: 852, height: 393 }, hasTouch: true });
    test("no HUD element sits on another, and none leaves the safe area", async ({ page }) => {
      const v = { name: "notched-landscape", w: 852, h: 393, sal: 59, sar: 59, sat: 0, sab: 21 };
      await race(page, "buttons", false, v, { profile: c.profile, cam: c.cam });
      const r = await measure(page, CTRL, [...HUD, ...HUD_LANDSCAPE_ONLY], v.w, v.h, v);
      const dump2 = " " + JSON.stringify({ overlaps: r.overlaps, hudClash: r.hudClash, unsafe: r.unsafe, diagnostics: r.diagnostics });
      expect(r.overlaps, "controls must not sit on each other" + dump2).toEqual([]);
      // The one this pass exists for: a HUD readout painting over another HUD
      // readout. A hidden element has no box, so a profile that legitimately
      // drops the map or the gaps simply contributes nothing here.
      expect(r.hudClash, "no HUD readout may sit on another HUD readout" + dump2).toEqual([]);
      expect(r.unsafe, "nothing may sit under the notch or the home indicator" + dump2).toEqual([]);
    });
  });
}

// REMOVING A WIDGET MUST NEVER SHRINK THE HUD.
//
// fitHud() reads the safe-area insets off the two elements that carry them —
// #minimap on the left, #hud-sectors on the right — because env() is not
// resolvable from script. A `display:none` element has an all-zero rect, so
// once a profile hid the sector box the right inset came out as
// `innerWidth - 0 - 10z`, i.e. the WHOLE VIEWPORT: the cap went negative and
// set()'s 0.4 floor painted every cluster at 40 %. Two shipped profiles hit it
// (MINIMAL, and any broadcast camera outside the broadcast profile), which is
// what "the simple HUD just makes everything tiny" was.
//
// Asserted as a RELATIVE invariant, in ONE boot: read the band's zoom with the
// sector box gone, force it back (`!important`, to beat the profile's own
// `!important` hide), let two HUD ticks re-fit, read again. Fewer widgets can
// only ever need LESS room, so the first number must not be the smaller one.
// Before the fix it was 0.4 against ~1.
test.describe("minimal profile", () => {
  test.setTimeout(300_000);
  test.use({ viewport: { width: 852, height: 393 }, hasTouch: true });
  test("hiding the sector box does not shrink every other cluster", async ({ page }) => {
    const v = { name: "notched-landscape", w: 852, h: 393, sal: 59, sar: 59, sat: 0, sab: 21 };
    await race(page, "buttons", false, v, { profile: "minimal" });
    const zoomNow = () => page.evaluate(() => {
      const r = document.documentElement;
      const s = +r.style.getPropertyValue("--hud-z-top");
      // Unset means "fits at the player's own number" — that IS the scale.
      return s || +r.style.getPropertyValue("--hud-scale") || 1;
    });
    const hidden = await zoomNow();
    await page.evaluate(() => {
      const el = document.getElementById("hud-sectors");
      if (el) el.style.setProperty("display", "flex", "important");
    });
    await page.waitForFunction(() => {
      const el = document.getElementById("hud-sectors");
      return !!el && el.getBoundingClientRect().width > 0;
    }, null, { polling: 100, timeout: 10000 });
    await page.waitForTimeout(400);   // two 10 Hz HUD ticks, so fitHud re-runs
    const shown = await zoomNow();
    await page.evaluate(() => {
      const el = document.getElementById("hud-sectors");
      if (el) el.style.removeProperty("display");
    });
    expect(hidden).toBeGreaterThan(0);
    expect(hidden, "a profile that removes a cluster must not shrink the rest")
      .toBeGreaterThanOrEqual(shown);
  });

  // And the profile has to earn its name: MINIMAL means fewer widgets, not
  // smaller ones. These four are what it drops (css/hud.css).
  //
  // THE CAMERA IS PART OF THE FIXTURE, and leaving it out made this test assert
  // something false for six days. `race()` without a `cam` boots the DEFAULT
  // camera, which is COCKPIT — and css/track-detail.css deliberately hides
  // #hud-speed and #hud-gearbox under `body.cockpit-cam`, because from inside
  // the car those readouts are on the steering-wheel LCD and the floating
  // duplicates spoil the view (#hud-energy, #hud-ot and #hud-aero stay, moved
  // beside the wheel by js/ui/hud-layout.js's shipped cockpit layout). So "MINIMAL
  // must keep speed" failed on a rule that has nothing to do with the profile
  // and is working exactly as intended. Chase is the camera this test means:
  // the one where the DOM readouts are the only readouts, and dropping one is
  // therefore the profile's doing. (Its two neighbours above pass a cam for the
  // same reason — this one was simply missed.)
  test("drops the analysis widgets and keeps what you drive by", async ({ page }) => {
    const v = { name: "notched-landscape", w: 852, h: 393, sal: 59, sar: 59, sat: 0, sab: 21 };
    await race(page, "buttons", false, v, { profile: "minimal", cam: "chase" });
    const r = await page.evaluate(() => {
      const w = (sel) => {
        const el = document.querySelector(sel);
        return el ? el.getBoundingClientRect().width : -1;
      };
      return {
        sectors: w("#hud-sectors"), energy: w("#hud-energy"),
        ot: w("#hud-ot"), aero: w("#hud-aero"),
        best: w("#hud-box-best"),
        pos: w("#hud-pos"), speed: w("#hud-speed"), gear: w("#hud-gear"),
      };
    });
    for (const k of ["sectors", "energy", "ot", "aero", "best"])
      expect(r[k], `MINIMAL must drop ${k}`).toBe(0);
    for (const k of ["pos", "speed", "gear"])
      expect(r[k], `MINIMAL must keep ${k}`).toBeGreaterThan(0);
  });
});

// THE LAYOUT CONTROL HAS TO DO SOMETHING. It was reported twice as inert, and
// it was: hud-met-timing / -driver / -compact were body classes with no rule
// behind them. COMPACT is the one that drops both halves, so one boot pins both
// directions — and MAP/GAPS, which have their own controls, must survive it.
test.describe("metrics layout", () => {
  test.setTimeout(300_000);
  test.use({ viewport: { width: 852, height: 393 }, hasTouch: true });
  test("COMPACT drops both metric halves and leaves MAP and GAPS alone", async ({ page }) => {
    const v = { name: "notched-landscape", w: 852, h: 393, sal: 59, sar: 59, sat: 0, sab: 21 };
    await race(page, "buttons", false, v, { layout: "compact" });
    const r = await page.evaluate(() => {
      // Solo fixture: both gap lines are "". Empty-collapse (css/hud.css) hides
      // the plate on purpose — seed one line so COMPACT is judged against a
      // plate that should stay visible, not against the junk-chip hide.
      const ahead = document.getElementById("hud-gap-ahead");
      if (ahead) ahead.textContent = "▲ RIV 0.5s";
      const w = (sel) => {
        const el = document.querySelector(sel);
        return el ? el.getBoundingClientRect().width : -1;
      };
      return {
        cls: document.body.className.match(/hud-met-[a-z]+/g) || [],
        sectors: w("#hud-sectors"), energy: w("#hud-energy"),
        best: w("#hud-box-best"),
        pos: w("#hud-pos"), map: w("#minimap"), gaps: w(".hud-gaps"),
      };
    });
    expect(r.cls, "a forced name must reach the body").toEqual(["hud-met-compact"]);
    for (const k of ["sectors", "energy", "best"])
      expect(r[k], `COMPACT must drop ${k}`).toBe(0);
    for (const k of ["pos", "map", "gaps"])
      expect(r[k], `COMPACT must not touch ${k}`).toBeGreaterThan(0);
  });
});

// THE CHIP THAT IS ONLY EVER HIDDEN IN A FIXTURE. #hud-limits is `hidden`
// until player.cutWarn > 0, so every case above measures it as absent and a
// collision check over absent boxes passes for free — the same
// absence-reads-as-normal shape that let it ship painted over the BOOST pedal.
//
// Asserted as GEOMETRY rather than by faking race state: un-hide, read the rect
// and restore INSIDE one evaluate, so the 10 Hz HUD tick cannot re-hide it
// between the write and the read (one task, one forced layout, no race).
// steer-buttons at HUD/BUTTON SIZE ~140%: #hud-sectors shared the right column
// with BOOST/OT and overlapped the pedal discs (steer-touch fix, 2026-10-07).
test.describe("buttons steer high HUD scale", () => {
  test.setTimeout(300_000);
  test.use({ viewport: { width: 852, height: 393 }, hasTouch: true });
  test("sector plate clears BOOST and OT (notched landscape, ~140%)", async ({ page }) => {
    const v = { name: "notched-landscape", w: 852, h: 393, sal: 59, sar: 59, sat: 0, sab: 21 };
    await race(page, "buttons", false, v, { hudScale: 140, btnScale: 140 });
    const targets = [
      { key: "hud-sectors", sel: "#hud-sectors", role: "hud" },
      { key: "btn-boost", sel: "btn-boost", role: "ctrl" },
      { key: "btn-ot", sel: "btn-ot", role: "ctrl" },
    ];
    const recs = await page.evaluate(probeHudElements, { targets });
    const r = analyzeOverlap(recs, v.w, v.h, v);
    const sectorHits = r.hudClash.filter((p) => p.startsWith("hud-sectors+") || p.endsWith("+hud-sectors"));
    expect(sectorHits, JSON.stringify({ hudClash: r.hudClash, boxes: recs })).toEqual([]);
  });
});

// BUTTONS mode: the touch controls follow BUTTON SIZE only. HUD SIZE resizes the
// readouts and must not move or resize a single control (Bryce, 2026-10-17).
const CONTROL_IDS = ["btn-steer-left", "btn-steer-right", "btn-throttle", "btn-brake",
  "btn-boost", "btn-ot", "btn-aero", "pausebtn", "btn-cam"];
const HUD_INDEPENDENCE_VIEWPORTS = [
  { name: "phone-844x390", w: 844, h: 390, sal: 0, sar: 0, sat: 0, sab: 0 },
  { name: "phone-932x430", w: 932, h: 430, sal: 59, sar: 59, sat: 0, sab: 21 },
  { name: "phone-667x375", w: 667, h: 375, sal: 0, sar: 0, sat: 0, sab: 0 },
];
// One BUTTON SIZE per shape (100 / 175 / 100): the measured matrix of all nine was identical (2026-10-17).
for (const [i, v] of HUD_INDEPENDENCE_VIEWPORTS.entries()) for (const btn of [[100, 175, 100][i]]) {
  test.describe(`buttons steer: controls ignore HUD SIZE (${v.name}, BUTTON SIZE ${btn})`, () => {
    test.setTimeout(300_000);
    test.use({ viewport: { width: v.w, height: v.h }, hasTouch: true });
    test("control rects are identical at HUD SIZE min / default / max", async ({ page }) => {
      await race(page, "buttons", false, v, { hudScale: 100, btnScale: btn });
      const rects = {}, gearW = {};
      for (const hud of [70, 100, 200]) {
        await page.evaluate((pct) => localStorage.setItem("apex26.hudScale", JSON.stringify(pct)), hud);
        await page.reload();
        await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
        await page.addStyleTag({ content: `:root{--sal:${v.sal}px;--sar:${v.sar}px;--sat:${v.sat}px;--sab:${v.sab}px;}` });
        await page.evaluate(() => window.__apex.race("monza"));
        await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
        await page.evaluate(() => window.__apex.go());
        await page.waitForFunction(() => { const b = document.getElementById("pausebtn"); return !!b && !b.hidden; },
          null, { polling: 100, timeout: BOOT_MS });
        await page.evaluate(() => window.GameHud && GameHud.invalidateFit && GameHud.invalidateFit());
        await page.evaluate(() => new Promise((r) => setTimeout(r, 1500))); // let fitHud settle
        rects[hud] = await page.evaluate((ids) => Object.fromEntries(ids.map((id) => {
          const el = document.getElementById(id);
          if (!el || el.hidden) return [id, null];
          const r = el.getBoundingClientRect();
          return [id, [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 2) / 2)];
        })), CONTROL_IDS);
        gearW[hud] = await page.evaluate(() => document.getElementById("hud-box-time").getBoundingClientRect().width);
      }
      const base = rects[100];
      expect(Object.values(base).filter(Boolean).length, JSON.stringify(base)).toBeGreaterThanOrEqual(7);
      // Non-vacuous: HUD SIZE really did resize the readouts it is meant to resize.
      expect(gearW[200], JSON.stringify(gearW)).toBeGreaterThan(gearW[70] * 1.3);
      for (const hud of [70, 200]) expect(rects[hud], `HUD SIZE ${hud} vs 100`).toEqual(base);
    });
  });
}

// A plate the player DRAGS beside BOOST, above the pedals (iPhone 15, BUTTON SIZE 237 %): the dock pass
// tested columns only, squeezed it to 48 px every fit, clearControls restored it, and the HUD flickered
// larger <-> smaller (Bryce, 2026-10-17). It shares the pedals' columns, not their rows, so it must keep its
// own width, stay off every tap target, and hold one size across ticks.
test.describe("moved sector plate above the pedals (iPhone 15, BUTTON SIZE 237)", () => {
  test.setTimeout(300_000);
  test.use({ viewport: { width: 852, height: 393 }, hasTouch: true });
  test("keeps its width and does not resize across ticks", async ({ page }) => {
    // The SHIPPED look (no PIN_PREVIOUS_LOOK): its text size is what makes the filled plate wider than 48 px.
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => {
      for (const [k, val] of Object.entries({ steerMode: "buttons", hudScale: 122, hudBtnScale: 237.3, radioChat: "off", commentary: "off" })) localStorage.setItem("apex26." + k, JSON.stringify(val));
    });
    await page.reload();
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    // Filled split times (a fresh race shows "-"), as on lap 2.
    await page.addStyleTag({ content: ":root{--sal:59px;--sar:59px;--sat:0px;--sab:21px;} #hud-sectors .sec-val::after { content: ' 31.234'; }" });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.go());
    await page.waitForFunction(() => document.getElementById("hud-sectors").getBoundingClientRect().height > 65,
      null, { polling: 100, timeout: 30_000 });
    // DRAGGED THERE, not dropped: the old pass was bistable; a finger drag crosses both positions.
    for (const [x, y] of [[23, 5], [25, 10]]) {
      await page.evaluate(([x, y]) => { HudLayout.set("sectors", { x, y }); GameHud.invalidateFit(); }, [x, y]);
      await page.evaluate(() => new Promise((r) => setTimeout(r, 600)));
    }
    await page.evaluate(() => new Promise((r) => setTimeout(r, 1500))); // let fitHud + the pack follow-up settle
    const seen = await page.evaluate(() => new Promise((resolve) => {
      const out = new Set(), sec = document.getElementById("hud-sectors"), t0 = performance.now();
      const iv = setInterval(() => {
        const r = sec.getBoundingClientRect();
        out.add([r.left, r.top, r.width, r.height].map(Math.round).join(",") + " mw=" + sec.style.maxWidth);
        if (performance.now() - t0 > 3000) { clearInterval(iv); resolve([...out]); }
      }, 50);
    }));
    expect(seen, "one plate state across 3 s of HUD ticks: " + JSON.stringify(seen)).toHaveLength(1);
    const st = await page.evaluate(() => {
      const sec = document.getElementById("hud-sectors"), r = sec.getBoundingClientRect();
      const hits = [...document.querySelectorAll(".touchbtn")].filter((b) => !b.hidden).map((b) => [b.id, b.getBoundingClientRect()])
        .filter(([, b]) => b.width && r.left < b.right && b.left < r.right && r.top < b.bottom && b.top < r.bottom).map(([id]) => id);
      return { w: r.width, mw: sec.style.maxWidth, hits };
    });
    expect(st.mw, JSON.stringify(st)).toBe("");
    expect(st.w, JSON.stringify(st)).toBeGreaterThan(52);
    expect(st.hits, JSON.stringify(st)).toEqual([]);
  });
});

// TILT was left out of #1191's steer-buttons dock standoff: at HUD 150% the
// sector strip still sat on BOOST (844×390 survey). Same --dock-r-w + anchor
// tether, without regressing the buttons/touch cases above.
test.describe("tilt steer high HUD scale", () => {
  test.setTimeout(300_000);
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });
  test("sector plate clears BOOST (phone landscape, 150%)", async ({ page }) => {
    const v = { name: "phone-landscape", w: 844, h: 390, sal: 47, sar: 47, sat: 0, sab: 21 };
    await race(page, "tilt", false, v, { hudScale: 150, btnScale: 150 });
    const stampBefore = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--hud-fit-stamp"));
    await page.evaluate(() => {
      try { window.__apex.freeze(false); } catch (_) { /* */ }
      if (typeof HudElements !== "undefined") HudElements.set("rel", true);
      window.__apex.jump(0.15, 60, 0);
    });
    await waitPhoneHudFitClearance(page, { rel: true, prevStamp: stampBefore });
    await page.evaluate(() => {
      if (typeof GameHud !== "undefined" && GameHud.syncPhoneFit && !GameHud.syncPhoneFit()) {
        throw new Error("phone layout not clear after wait");
      }
    });
    const targets = [
      { key: "hud-sectors", sel: "#hud-sectors", role: "hud" },
      { key: "hud-rel", sel: "#hud-rel", role: "hud" },
      { key: "btn-boost", sel: "btn-boost", role: "ctrl" },
      { key: "btn-ot", sel: "btn-ot", role: "ctrl" },
      { key: "btn-brake", sel: "btn-brake", role: "ctrl" },
      { key: "btn-throttle", sel: "btn-throttle", role: "ctrl" },
    ];
    const recs = await page.evaluate(probeHudElements, { targets });
    const r = analyzeOverlap(recs, v.w, v.h, v);
    const hits = r.hudClash.filter((p) => p.includes("hud-sectors") || p.includes("hud-rel"));
    expect(hits, JSON.stringify({ hudClash: r.hudClash, boxes: recs })).toEqual([]);
  });
});

// Opt-in RELATIVE / INPUTS ship off; the 2026-10-07 survey turned them on and
// measured readout-on-control (REL×steer/BRAKE, INPUTS×BOOST column / gear box).
async function enableOptIns(page) {
  await page.evaluate(() => {
    if (typeof HudElements === "undefined") throw new Error("HudElements missing");
    for (const id of ["rel", "strat", "inputs"]) HudElements.set(id, true);
  });
  await page.waitForFunction(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rel = document.getElementById("hud-rel");
    const inp = document.getElementById("hud-inputs");
    if (!rel || !inp || rel.hidden || inp.hidden) return false;
    const rr = rel.getBoundingClientRect(), ir = inp.getBoundingClientRect();
    if (!(rr.width > 0 && rr.height > 0 && ir.width > 0 && ir.height > 0)) return false;
    // Phone: wait until INPUTS has cleared the steer column (desktop docks stay
    // empty / steer hidden, so the box-size check above is enough there).
    if (!document.body.classList.contains("desktop")) {
      const steerR = document.getElementById("btn-steer-right");
      if (!steerR || steerR.hidden) return false;
      const sr = steerR.getBoundingClientRect();
      if (!(sr.width > 0)) return false;
      const dockRW = parseFloat(document.documentElement.style.getPropertyValue("--dock-r-w"));
      if (!(Number.isFinite(dockRW) && dockRW > 0)) return false;
      if (ir.left < sr.right + 4) return false;
      if (rr.right > ir.left - 4) return false;
    }
    return true;
  }, null, { polling: 100, timeout: 30_000 });
}

// Broadcast phoneL: announce / flag / LIMITS / TYRES / REL must not overlap
// each other or the touch controls (HUD Desk queue item 1 — survey before:
// 22 overlaps on phoneL-bcast-150-all). 150% is the CI failure (run
// 38604722503, flag+limits after #1501 dropped the flag under --hud-gaps-b).
// 100% is the left-column LIMITS path (`data-limits-left`) so a right-column
// stack must not steal that chip.
test.describe("broadcast phoneL status stack", () => {
  test.setTimeout(300_000);
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });
  for (const hudScale of [100, 150]) {
    test(`HUD ${hudScale}%: announce/flag/limits/tyre/rel clear each other and touch controls`, async ({ page }) => {
      const v = { name: "phone-landscape", w: 844, h: 390, sal: 47, sar: 47, sat: 0, sab: 21 };
      await race(page, "tilt", false, v, { hudScale, btnScale: 100, profile: "broadcast", cam: "chase" });
      await page.evaluate(() => {
        if (typeof HudElements !== "undefined") {
          HudElements.set("rel", true);
          HudElements.set("strat", false);
          HudElements.set("inputs", false);
        }
        if (window.__apex && window.__apex.tyres) window.__apex.tyres({ level: "real" });
        const tyre = document.getElementById("hud-tyre");
        if (tyre) tyre.hidden = false;
        window.__apex.jump(0.15, 60, 0);
      });
      await waitPhoneHudFitClearance(page, { rel: true });
      const targets = [
        { key: "announce", sel: "#announce", role: "hud" },
        { key: "flag", sel: "#hud-flag", role: "hud" },
        { key: "limits", sel: "#hud-limits", role: "hud" },
        { key: "tyre", sel: "#hud-tyre", role: "hud" },
        { key: "rel", sel: "#hud-rel", role: "hud" },
        { key: "map", sel: "#minimap", role: "hud" },
        { key: "btn-brake", sel: "btn-brake", role: "ctrl" },
        { key: "btn-ot", sel: "btn-ot", role: "ctrl" },
        { key: "btn-steer-left", sel: "btn-steer-left", role: "ctrl" },
      ];
      // Force transient status pieces + probe in ONE evaluate (same contract as
      // the track-limits chip case / hud-survey probeWithTransients). Always
      // paint the CI flag string so a short live flag cannot hide flag+limits.
      const recs = await page.evaluate(({ src, arg }) => {
        const probe = (0, eval)("(" + src + ")");
        const saved = [];
        const force = (id, fill) => {
          const el = document.getElementById(id);
          if (!el) return;
          saved.push([el, el.hidden, el.innerHTML]);
          el.hidden = false;
          fill(el);
        };
        force("announce", () => {
          const who = document.getElementById("announce-who"), text = document.getElementById("announce-text");
          if (who) who.textContent = "VERSTAPPEN · RADIO · 33";
          if (text) text.textContent = "CAUTION — CHEAPER STOP, ABOUT 23s LOST";
        });
        force("hud-limits", (el) => { const s = el.querySelector("span"); if (s) s.textContent = "●●●○"; });
        force("hud-flag", (el) => { el.textContent = "YELLOW · SECTOR 2"; });
        try { for (const a of document.getAnimations()) { try { a.finish(); } catch (_) { /* */ } } } catch (_) { /* */ }
        if (typeof GameHud !== "undefined" && GameHud.invalidateFit) GameHud.invalidateFit();
        if (typeof GameHud !== "undefined" && GameHud.syncPhoneFit) GameHud.syncPhoneFit();
        try { return probe(arg); }
        finally { for (const [el, hidden, html] of saved.reverse()) { el.innerHTML = html; el.hidden = hidden; } }
      }, { src: probeHudElements.toString(), arg: { targets } });
      const r = analyzeOverlap(recs.filter((x) => x.visible), v.w, v.h, v);
      const goal = [...r.hudClash, ...r.overlaps].filter((p) =>
        /announce|flag|limits|tyre|rel/.test(p));
      const flagLimits = goal.filter((p) => p.includes("flag") && p.includes("limits"));
      expect(flagLimits, "flag must clear LIMITS on broadcast phoneL: " + JSON.stringify({
        flagLimits, goal, hudClash: r.hudClash, boxes: recs,
      })).toEqual([]);
      expect(goal, JSON.stringify({ goal, hudClash: r.hudClash, overlaps: r.overlaps, boxes: recs })).toEqual([]);
    });
  }
});

test.describe("opt-in readouts vs touch controls", () => {
  test.setTimeout(300_000);
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });
  test("RELATIVE clears left steer / BRAKE; INPUTS clears right dock (buttons 150%)", async ({ page }) => {
    const v = { name: "phone-landscape", w: 844, h: 390, sal: 47, sar: 47, sat: 0, sab: 21 };
    await race(page, "buttons", false, v, { hudScale: 150, btnScale: 150, cam: "cockpit" });
    await enableOptIns(page);
    const targets = [
      { key: "hud-rel", sel: "#hud-rel", role: "hud" },
      { key: "hud-inputs", sel: "#hud-inputs", role: "hud" },
      { key: "btn-steer-left", sel: "btn-steer-left", role: "ctrl" },
      { key: "btn-steer-right", sel: "btn-steer-right", role: "ctrl" },
      { key: "btn-brake", sel: "btn-brake", role: "ctrl" },
      { key: "btn-boost", sel: "btn-boost", role: "ctrl" },
      { key: "btn-ot", sel: "btn-ot", role: "ctrl" },
      { key: "btn-aero", sel: "btn-aero", role: "ctrl" },
      { key: "btn-throttle", sel: "btn-throttle", role: "ctrl" },
    ];
    const recs = await page.evaluate(probeHudElements, { targets });
    const r = analyzeOverlap(recs, v.w, v.h, v);
    const hits = r.hudClash.filter((p) => p.includes("hud-rel") || p.includes("hud-inputs"));
    expect(hits, JSON.stringify({ hudClash: r.hudClash, boxes: recs })).toEqual([]);
  });
});

test.describe("desktop INPUTS vs gear box", () => {
  test.setTimeout(300_000);
  test.use({ viewport: { width: 1280, height: 720 }, hasTouch: false });
  test("INPUTS clears SPEED & GEAR at HUD 150% chase", async ({ page }) => {
    const v = { name: "desktop", w: 1280, h: 720, sal: 0, sar: 0, sat: 0, sab: 0 };
    await race(page, "tilt", false, v, { hudScale: 150, cam: "chase" });
    await enableOptIns(page);
    const targets = [
      { key: "hud-inputs", sel: "#hud-inputs", role: "hud" },
      { key: "hud-gearbox", sel: "#hud-gearbox", role: "hud" },
      { key: "hud-speed", sel: "#hud-speed", role: "hud" },
    ];
    const recs = await page.evaluate(probeHudElements, { targets });
    const r = analyzeOverlap(recs, v.w, v.h, v);
    const hits = r.hudClash.filter((p) => p.includes("hud-inputs"));
    expect(hits, JSON.stringify({ hudClash: r.hudClash, boxes: recs })).toEqual([]);
  });
});

// PORTRAIT RACE-ANYWAY (body.rotate-ok): the bottom cluster must not pile
// TYRES / #hud-plan onto GEAR, or grow the gear box into AERO/OT. Tip before
// this fix (61e0a644 survey): gearbox×tyre 12499px² and gearbox×btn-aero at
// 390×844 chase HUD 150%. Pages-gate only — run locally; say so in the PR.
for (const v of [
  { name: "phone-portrait-390", w: 390, h: 844, sal: 0, sar: 0, sat: 47, sab: 34 },
  { name: "phone-portrait-360", w: 360, h: 740, sal: 0, sar: 0, sat: 0, sab: 0 },
]) {
  test.describe(`portrait bottom cluster (${v.name})`, () => {
    test.setTimeout(300_000);
    test.use({ viewport: { width: v.w, height: v.h }, hasTouch: true });
    test("tilt HUD 150%: tyre/plan clear gear; gear clears AERO/OT", async ({ page }) => {
      await race(page, "tilt", false, v, { hudScale: 150, btnScale: 150, cam: "chase" });
      await page.evaluate(() => {
        document.body.classList.add("rotate-ok");
        localStorage.setItem("apex26.portraitOk", "1");
        if (window.__apex && window.__apex.tyres) window.__apex.tyres({ level: "real" });
        const plan = document.getElementById("hud-plan");
        if (plan && !plan.textContent) plan.textContent = "PLAN NO STOP";
        const tyre = document.getElementById("hud-tyre");
        if (tyre) tyre.hidden = false;
        if (typeof GameHud !== "undefined" && GameHud.invalidateFit) GameHud.invalidateFit();
        window.__apex.jump(0.15, 60, 0);
      });
      await page.waitForFunction(() => {
        const gear = document.getElementById("hud-gearbox");
        const tyre = document.getElementById("hud-tyre");
        const aero = document.getElementById("btn-aero");
        if (!gear || !tyre || tyre.hidden || !aero || aero.hidden) return false;
        const g = gear.getBoundingClientRect(), t = tyre.getBoundingClientRect(), a = aero.getBoundingClientRect();
        if (!(g.width && t.width && a.width)) return false;
        const gearTyre = g.left < t.right - 0.5 && t.left < g.right - 0.5
          && g.top < t.bottom - 0.5 && t.top < g.bottom - 0.5;
        const gearAero = g.left < a.right - 0.5 && a.left < g.right - 0.5
          && g.top < a.bottom - 0.5 && a.top < g.bottom - 0.5;
        return !gearTyre && !gearAero;
      }, null, { polling: 100, timeout: 30_000 });
      const targets = [
        { key: "hud-gearbox", sel: "#hud-gearbox", role: "hud" },
        { key: "hud-tyre", sel: "#hud-tyre", role: "hud" },
        { key: "btn-aero", sel: "btn-aero", role: "ctrl" },
        { key: "btn-ot", sel: "btn-ot", role: "ctrl" },
        { key: "btn-boost", sel: "btn-boost", role: "ctrl" },
      ];
      const recs = await page.evaluate(probeHudElements, { targets });
      const r = analyzeOverlap(recs, v.w, v.h, v);
      const hits = r.hudClash.filter((p) =>
        p.includes("hud-gearbox") || p.includes("hud-tyre"));
      expect(hits, JSON.stringify({ hudClash: r.hudClash, boxes: recs })).toEqual([]);
    });
  });
}

// PORTRAIT RADIO CARD (race-anyway). Every dock group is 0px tall here, so
// announceLane publishes no lane; `left: calc(var(--announce-lane-x) / …)`
// with no fallback went invalid-at-computed-value-time (`auto`), and the -50%
// shift parked the card at x -72..72 on 390x844, over #minimap. Landscape
// still centres (50% / -50%). Portrait pins the left edge past the map
// column (34% / 0%) so HUD 150% on 390 clears #minimap.
test.describe("portrait radio card (phone-portrait-390)", () => {
  test.setTimeout(300_000);
  const v = { name: "phone-portrait-390", w: 390, h: 844, sal: 0, sar: 0, sat: 47, sab: 34 };
  test.use({ viewport: { width: v.w, height: v.h }, hasTouch: true });
  for (const hudScale of [100, 150]) {
    test(`HUD ${hudScale}%: the card stays on screen and clears the map, timing row and RELATIVE`, async ({ page }) => {
      await race(page, "buttons", false, v, { hudScale, btnScale: hudScale, cam: "chase" });
      await page.evaluate(() => {
        document.body.classList.add("rotate-ok");
        localStorage.setItem("apex26.portraitOk", "1");
        if (typeof HudElements !== "undefined") HudElements.set("rel", true);
        if (typeof GameHud !== "undefined" && GameHud.invalidateFit) GameHud.invalidateFit();
        window.__apex.jump(0.15, 60, 0);
        // Fit already ran (announce still hidden). Unhide AFTER so announceLane
        // does not immediately re-collapse. #1501's data-lane-collapsed + a 0px
        // --announce-lane-w leave width:0; the async waitForFunction below used
        // to treat its Promise as success and then m.a.left threw (CI 38602185902
        // HUD 100%). Sync wait + restore the fallback lane so the fixture card
        // can paint. Do not invalidateFit again.
        const ann = document.getElementById("announce");
        if (ann) {
          ann.hidden = false;
          ann.removeAttribute("data-lane-collapsed");
        }
        // Measure the unpublished-lane fallback the player gets on portrait
        // (no dock groups). A leftover hud-radio-top / data-radio-corner from
        // race() would hide the 150% × map overlap Pages 38622878195 hit.
        document.body.classList.remove("hud-radio-top");
        if (document.body.removeAttribute) document.body.removeAttribute("data-radio-corner");
        const root = document.documentElement;
        for (const k of ["--announce-lane-w", "--announce-lane-x", "--announce-lane-shift"]) {
          root.style.removeProperty(k);
        }
      });
      const got = await page.waitForFunction(() => {
        const ann = document.getElementById("announce");
        if (!ann || ann.hidden || ann.hasAttribute("data-lane-collapsed")) return false;
        const box = (el) => {
          if (!el || el.hidden) return null;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
        };
        const a = box(ann);
        if (!a) return false;
        return { a, W: window.innerWidth, H: window.innerHeight, body: document.body.className,
          others: { "#minimap": box(document.getElementById("minimap")),
            ".hud-top": box(document.querySelector(".hud-top")),
            "#hud-rel": box(document.getElementById("hud-rel")) } };
      }, null, { polling: 100, timeout: 30_000 });
      const m = await got.jsonValue();
      const why = JSON.stringify(m);
      expect(m && m.a, "announce box missing after wait: " + why).toBeTruthy();
      expect(m.a.left, why).toBeGreaterThanOrEqual(-0.5);
      expect(m.a.top, why).toBeGreaterThanOrEqual(-0.5);
      expect(m.a.right, why).toBeLessThanOrEqual(m.W + 0.5);
      expect(m.a.bottom, why).toBeLessThanOrEqual(m.H + 0.5);
      expect(m.others["#minimap"], "the fixture shows the map: " + why).not.toBeNull();
      const hits = Object.entries(m.others).filter(([, r]) => r
        && r.left < m.a.right - 0.5 && m.a.left < r.right - 0.5
        && r.top < m.a.bottom - 0.5 && m.a.top < r.bottom - 0.5).map(([k]) => k);
      expect(hits, why).toEqual([]);
    });
  }
});

// PORTRAIT RACE-ANYWAY: tower rows + sector times must stay ≥ 10 CSS px
// (same floor as PR #1734 / the gap-chip clamp) and must not paint over
// each other, the gear/speed dash, PLAN, or the radio card. The VIEWS
// loop above skips `.hud-top` / `#hud-sectors` on portrait (rotate-device
// overlay); this is the rotate-ok path the player actually races.
for (const v of [
  { name: "phone-portrait-390", w: 390, h: 844, sal: 0, sar: 0, sat: 47, sab: 34 },
  { name: "phone-portrait-430", w: 430, h: 932, sal: 0, sar: 0, sat: 59, sab: 34 },
]) {
  test.describe(`portrait tower/sectors readable (${v.name})`, () => {
    test.setTimeout(300_000);
    test.use({ viewport: { width: v.w, height: v.h }, hasTouch: true });
    test("HUD 150%: tower and sectors stay ≥ 10 CSS px and clear dash/plan/announce", async ({ page }) => {
      await race(page, "tilt", false, v, { hudScale: 150, btnScale: 150, cam: "chase" });
      await page.evaluate(() => {
        document.body.classList.add("rotate-ok");
        localStorage.setItem("apex26.portraitOk", "1");
        const plan = document.getElementById("hud-plan");
        if (plan && !plan.textContent) plan.textContent = "PLAN NO STOP";
        // race() unhides #announce with a long radio line for the landscape
        // card tests. Portrait race-anyway keeps that slot collapsed until a
        // message; leave it collapsed so we assert the shipped announce area.
        const ann = document.getElementById("announce");
        if (ann) {
          ann.hidden = true;
          ann.setAttribute("data-lane-collapsed", "");
        }
        if (typeof GameHud !== "undefined" && GameHud.invalidateFit) GameHud.invalidateFit();
        window.__apex.jump(0.15, 60, 0);
      });
      const got = await page.waitForFunction(() => {
        const tower = document.querySelector(".hud-top");
        const sectors = document.getElementById("hud-sectors");
        const label = tower && tower.querySelector(".hud-label");
        const secVal = sectors && (sectors.querySelector(".sec-val") || sectors);
        if (!tower || !sectors || !label || sectors.hidden) return false;
        const zOf = (el) => el.currentCSSZoom || 1;
        const painted = (el) => parseFloat(getComputedStyle(el).fontSize) * zOf(el);
        const box = (el) => {
          if (!el || el.hidden) return null;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0
            ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
        };
        const t = box(tower), s = box(sectors);
        if (!t || !s) return false;
        return {
          labelPx: painted(label), secPx: painted(secVal),
          zTop: document.documentElement.style.getPropertyValue("--hud-z-top"),
          t, s,
          others: {
            "#hud-gearbox": box(document.getElementById("hud-gearbox")),
            "#hud-speed": box(document.getElementById("hud-speed")),
            "#hud-plan": box(document.getElementById("hud-plan")),
            "#announce": box(document.getElementById("announce")),
          },
        };
      }, null, { polling: 100, timeout: 30_000 });
      const m = await got.jsonValue();
      const why = JSON.stringify(m);
      expect(m.labelPx, "tower label painted px: " + why).toBeGreaterThanOrEqual(10);
      expect(m.secPx, "sector time painted px: " + why).toBeGreaterThanOrEqual(10);
      const hits = Object.entries({ ".hud-top": m.t, "#hud-sectors": m.s, ...m.others })
        .filter(([, r]) => r);
      const clashes = [];
      for (let i = 0; i < hits.length; i++) {
        for (let j = i + 1; j < hits.length; j++) {
          const a = hits[i][1], b = hits[j][1];
          if (a.left < b.right - 0.5 && b.left < a.right - 0.5
              && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) {
            clashes.push(hits[i][0] + "+" + hits[j][0]);
          }
        }
      }
      expect(clashes, why).toEqual([]);
    });
  });
}

test.describe("track-limits chip", () => {
  test.setTimeout(300_000);
  test.use({ viewport: { width: 852, height: 393 }, hasTouch: true });
  test("clears the touch dock when a warning shows", async ({ page }) => {
    const v = { name: "notched-landscape", w: 852, h: 393, sal: 59, sar: 59, sat: 0, sab: 21 };
    await race(page, "buttons", false, v);
    const r = await page.evaluate(() => {
      const el = document.getElementById("hud-limits");
      if (!el) return { missing: true };
      const was = el.hidden;
      el.hidden = false;
      const span = el.querySelector("span");
      const text = span ? span.textContent : "";
      if (span) span.textContent = "\u25cf\u25cf\u25cf\u25cb";   // the widest state: 3 of 4 struck
      const box = el.getBoundingClientRect();
      const hits = [];
      for (const id of ["btn-boost", "btn-ot", "btn-brake", "btn-aero", "btn-throttle"]) {
        const c = document.getElementById(id);
        if (!c || c.hidden) continue;
        const b = c.getBoundingClientRect();
        if (!b.width) continue;
        if (box.left < b.right && b.left < box.right && box.top < b.bottom && b.top < box.bottom) hits.push(id);
      }
      el.hidden = was;
      if (span) span.textContent = text;
      return { hits, w: box.width, right: box.right, vw: window.innerWidth };
    });
    expect(r.missing, "#hud-limits must exist to be asserted about").toBeFalsy();
    expect(r.w, "the chip must actually have a box once un-hidden").toBeGreaterThan(0);
    expect(r.hits, "a track-limits warning must not paint over a tap target").toEqual([]);
    expect(r.right, "and must stay on screen").toBeLessThanOrEqual(r.vw);
  });
});

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

// Rank-0 pin for PR #1024: appearance-studio / settings-tab CSS routes this
// 32-test file, but leaving it out of the diff dropped it as over-budget
// overflow (DROPPED=1) while every selected shard passed. An edited spec is
// rank 0 in select-specs, so this comment keeps the HUD layout gate in the
// plan. Do not skip it.
// Rank-0 pin for PR #1077: Home resize + UiLayers 0-box :modal ranking
// likewise routes this file; overflow 8 dropped it (run 37438922786). Same
// lever — touch the spec, do not skip it. Overflow was also raised 8→9.

// fitHud IDEMPOTENCE (Pages compact-minimap flake). Two invalidate+tick passes
// on a settled compact viewport must publish the same --hud-z-top, and that
// value must equal #minimap's effective zoom. This file runs in the Pages gate
// only (not the PR fast tier) — say so in the PR body when this case lands.
test.describe("fitHud zoom determinism", () => {
  test.setTimeout(300_000);
  test.use({ viewport: { width: 852, height: 393 }, hasTouch: true });
  test("two fits publish the same zTop and #minimap zoom matches it", async ({ page }) => {
    const v = { name: "notched-landscape", w: 852, h: 393, sal: 59, sar: 59, sat: 0, sab: 21 };
    await race(page, "buttons", false, v);
    await page.evaluate(() => {
      if (window.__apex && window.__apex.uiScale) window.__apex.uiScale(200);
      if (typeof GameHud !== "undefined" && GameHud.invalidateFit) GameHud.invalidateFit();
    });
    // Two ~10 Hz HUD ticks + a settled zoom (no transition on the top band).
    await page.waitForFunction(() => {
      const root = document.documentElement;
      const mm = document.getElementById("minimap");
      if (!mm || innerWidth !== 852) return false;
      const zTop = root.style.getPropertyValue("--hud-z-top");
      const want = +zTop || +getComputedStyle(root).getPropertyValue("--hud-scale") || 1;
      const zoom = mm.currentCSSZoom || 1;
      const anims = mm.getAnimations().filter((a) => a.playState === "running" || a.pending);
      return anims.length === 0 && Math.abs(zoom - want) < 1e-3;
    }, null, { polling: 100, timeout: 10_000 });
    const snap = () => page.evaluate(() => {
      const root = document.documentElement;
      const mm = document.getElementById("minimap");
      const zTop = root.style.getPropertyValue("--hud-z-top");
      const want = +zTop || +getComputedStyle(root).getPropertyValue("--hud-scale") || 1;
      return {
        zTop,
        want,
        zoom: mm ? mm.currentCSSZoom : null,
        dockRW: root.style.getPropertyValue("--dock-r-w"),
      };
    });
    const a = await snap();
    await page.evaluate(() => {
      if (typeof GameHud !== "undefined" && GameHud.invalidateFit) GameHud.invalidateFit();
    });
    await page.waitForFunction((prev) => {
      const root = document.documentElement;
      const mm = document.getElementById("minimap");
      if (!mm) return false;
      const zTop = root.style.getPropertyValue("--hud-z-top");
      const want = +zTop || +getComputedStyle(root).getPropertyValue("--hud-scale") || 1;
      const zoom = mm.currentCSSZoom || 1;
      // A re-fit has run (dock inset re-published) and zoom still matches.
      const dockRW = root.style.getPropertyValue("--dock-r-w");
      return dockRW !== "" && Math.abs(zoom - want) < 1e-3
        && (zTop === prev.zTop || zTop !== undefined);
    }, a, { polling: 100, timeout: 10_000 });
    const b = await snap();
    expect(b.zTop, "second fit must not flip --hud-z-top " + JSON.stringify({ a, b }))
      .toBe(a.zTop);
    expect(b.dockRW, "second fit must not flip --dock-r-w " + JSON.stringify({ a, b }))
      .toBe(a.dockRW);
    expect(Math.abs((b.zoom || 1) - b.want) < 1e-3,
      "published zTop must equal #minimap zoom " + JSON.stringify(b)).toBe(true);
  });
});

// SPEED PARITY (Handling survey: HUD 315 vs wheel 343 "in the same frame").
// The game's rAF callback runs physics, then render() — which draws the wheel
// LCD digits (CarMesh.getSpeedDigit meshes) — then updateHud(), which paints
// #hud-speed-n. A microtask queued at a frame's first LCD digit runs after that
// whole callback, so it reads exactly the pair the frame put on screen. Natural
// frames under full throttle: the number moves, and the two must never split.
//
// Do NOT boot through race() above. That helper polls info().track for BOOT_MS
// (45 s) after firing __apex.race() without awaiting its thenable, then freezes
// for HUD-fit probes. Pages 38604708051 oversize-hud-layout (last of 43, 2
// workers): that wait expired at 47.4 s while bahrain scenery was still
// logging at 50.5 s (phys:null — go() never ran). Same class as fixtures.js
// awaitTrackBuild: a slow box is not a wedge. This block waits on Log progress
// and the race() thenable, and leaves the loop unfrozen so LCD frames arrive.
test.describe("speed readouts", () => {
  test.setTimeout(300_000);
  // The claim is two digit strings drawn in one frame, not layout, so the frame
  // is kept small: SwiftShader frame cost scales with pixels, and the 12-frame
  // LCD wait is the longest wait in this test (one local repeat spent ~115 s of
  // its 120 s there at 1280x720; #1956).
  test.use({ viewport: { width: 640, height: 360 }, hasTouch: false });

  // ONE boot, waited on progress (#1956). Last test on the oversize-hud-layout
  // shard (2 workers, 46 cases): the box is hot, and Pages 38660546141 timed
  // out the FIRST of two boots (goto, then reload to apply the keys) at 45 s
  // while the page was still logging its build at 53 s (cold __apex boot
  // measured 50.8 s). 39b45576/4a1039c0 raised both waits to RACE_BUILD_MS;
  // this replaces that with one boot (keys seeded from an init script, no
  // reload) and awaitApexBoot, which fails a boot that goes quiet for BOOT_MS,
  // as before, but lets a visibly working one finish. The GP build itself
  // (bahrain-class, 49-54 s on loaded llvmpipe) is waited out by
  // awaitTrackBuild below, not by a clock.
  async function bootCockpitMonza(page) {
    await page.addInitScript(PIN_PREVIOUS_LOOK);
    await page.addInitScript(() => {
      try {
        localStorage.setItem("apex26.steerMode", JSON.stringify("tilt"));
        localStorage.setItem("apex26.manual", JSON.stringify(false));
      } catch (_) {}
    });
    await page.goto("/");
    await awaitApexBoot(page);
    await page.evaluate(() => {
      window.__spdRace = "pending";
      Promise.resolve(window.__apex.race("monza")).then(
        () => { window.__spdRace = "ok"; },
        (e) => { window.__spdRace = "err:" + ((e && e.message) || e); });
    });
    await awaitTrackBuild(page, undefined, undefined, { raceFlag: "__spdRace" });
    await page.evaluate(() => {
      const a = window.__apex;
      a.freeze(false);
      a.headless(false);
      a.go();
      a.camera("cockpit");
      a.jump(0.1, 60, 0);
    });
  }

  test("cockpit wheel LCD and HUD speed show one number in the same frame", async ({ page }) => {
    await bootCockpitMonza(page);
    await page.evaluate(() => {
      const a = window.__apex, gfx = window.GLX, hudN = document.getElementById("hud-speed-n");
      const digitOf = new Map();
      for (let d = 0; d <= 9; d++) digitOf.set(CarMesh.getSpeedDigit(d), d);
      const pairs = window.__spdPairs = [];
      const orig = gfx.draw;
      let cur = null;
      gfx.draw = function (mesh) {
        if (digitOf.has(mesh) && pairs.length < 12) {
          if (!cur) {
            const rec = cur = { wheel: "", kph: a.obs().dashKph };
            queueMicrotask(() => { rec.hud = hudN.textContent; pairs.push(rec); cur = null; if (pairs.length >= 12) gfx.draw = orig; });
          }
          cur.wheel += digitOf.get(mesh);
        }
        return orig.apply(this, arguments);
      };
      // n=0: latch throttle on _testInput without a manual step. Natural rAF
      // frames then draw the LCD under that held input.
      a.act({ throttle: true, steer: 0 }, 1 / 60, 0);
    });
    try {
      await page.waitForFunction(() => (window.__spdPairs || []).length >= 12, null, {
        polling: 100, timeout: 120_000,
      });
    } catch (err) {
      const diag = await page.evaluate(() => {
        let track = null, frozen = null, headless = null;
        try { track = window.__apex.info().track; } catch (_) { /* */ }
        try { frozen = window.__apex.freeze(); } catch (_) { /* */ }
        try { headless = window.__apex.headless(); } catch (_) { /* */ }
        return { n: (window.__spdPairs || []).length, track, frozen, headless };
      });
      throw new Error(`speed pairs never reached 12: ${JSON.stringify(diag)}\n${err.message}`);
    }
    const pairs = await page.evaluate(() => window.__spdPairs);
    const why = JSON.stringify(pairs);
    expect(pairs.every((p) => p.wheel.length > 0 && p.kph > 100), "the wheel LCD drew a speed at race pace: " + why).toBe(true);
    expect(pairs.filter((p) => p.wheel !== p.hud), "wheel LCD vs #hud-speed-n, same frame: " + why).toEqual([]);
  });
});
