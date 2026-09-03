#!/usr/bin/env node
// fit-audit — does every menu FIT, and is everything on it big enough to hit?
// @doc The NUMBERS fit audit over viewports × interface scales: tap targets, legibility floor, clipped-without-scroll.
// @skill ui-menu-a11y
//
// menu-fit answers "is this screen clipped at one viewport" and takes pictures.
// This answers the questions that only show up across a MATRIX of sizes and
// orientations, and it answers them in numbers:
//
//   tap      interactive controls under the comfortable touch size
//   spacing  small controls that are also crowded (WCAG 2.5.8 lets a 24px
//            target pass ONLY when it has room around it)
//   type     text below the legibility floor
//   overflow content clipped with no way to scroll to it
//   marker   a scroll region with no "there is more" affordance
//
// One page per screen; the viewport is RESIZED between measurements rather than
// reloading, which is what makes a nine-viewport sweep take a minute instead of
// ten.
//
//   node tools/fit-audit.mjs                    # the standard matrix
//   node tools/fit-audit.mjs --only=select,menu
//   node tools/fit-audit.mjs --sizes=852x393,393x852
//   node tools/fit-audit.mjs --scale=100,130,150   # ...crossed with interface size
//
import { launchChromium, shutdown, sleep, startStaticServer } from "./harness.mjs";
import { applyScale, parseScales, scaleTag } from "./ui-scale-axis.mjs";
import { fileURLToPath } from "node:url";
let setupApiMocks = null;
try { ({ setupApiMocks } = await import("../tests/helpers/f1-api-mock.js")); } catch { /* hub degrades to its empty state */ }

const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const argv = process.argv.slice(2);
const arg = (k) => { const a = argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const ONLY = arg("only") ? arg("only").split(",").filter(Boolean) : null;
// The interface-size axis (tools/ui-scale-axis.mjs). Crossed with SIZES below,
// so the nine-viewport sweep becomes 9 x N cells per screen — which is the
// point: a 24px chip that clears the WCAG floor at 100 % is a different control
// at 80 %, and nothing else in the repo would notice.
const SCALES = parseScales(argv);

// The matrix. Both orientations of the three phone classes the game targets,
// both of a tablet, and a desktop — a menu that fits at 852x393 can still lose
// its primary button at 667x375, which is the whole reason this is a sweep.
const SIZES = (arg("sizes") || [
  "375x667",   // iPhone SE portrait — the smallest screen that matters
  "667x375",   // iPhone SE landscape — the tightest height in the matrix
  "393x852",   // iPhone 15 portrait
  "852x393",   // iPhone 15 landscape — the primary play orientation
  "430x932",   // Pro Max portrait
  "932x430",   // Pro Max landscape
  "768x1024",  // iPad portrait
  "1024x768",  // iPad landscape
  "1440x900",  // desktop
].join(",")).split(",").map((s) => { const [w, h] = s.split("x").map(Number); return { width: w, height: h }; });

const UNTIL = `
  const until = (sel, ms) => new Promise((done) => {
    const t0 = Date.now();
    const tick = () => {
      if (document.querySelector(sel) || Date.now() - t0 > (ms || 8000)) done();
      else setTimeout(tick, 80);
    };
    tick();
  });
`;

const SCREENS = [
  ["menu", `null`, "#overlay", {}],
  ["select", `document.getElementById('mb-race').click()`, "#select", {}],
  // The garage owns the team card and EDIT MY TEAM now (#cs-team-card /
  // #cs-customize on its TEAM tab) — the select screen's #sel-team-card /
  // #sel-customize side doors are gone. Reach both the way a player does and
  // the way layout-audit.mjs does: main menu → GARAGE → TEAM tab.
  ["teampicker", `
     document.getElementById('mb-garage').click();
     await until('#carsetup:not([hidden])', 4000);
     const tabs = [...document.querySelectorAll('#cs-tabs .cs-tab')];
     (tabs.find((e) => /TEAM/i.test(e.textContent)) || tabs[0])?.click();
     await until('#cs-team-card', 4000);
     document.getElementById('cs-team-card').click();
     await until('#teampicker:not([hidden])', 4000);
   `, "#teampicker", {}],
  // The garage is a STEP, not a side door: #select's START opens #carsetup and
  // the garage's DONE goes on to #race-settings. `sel-setup` no longer exists,
  // and both routes below had been silently reporting "missing/hidden".
  ["race-settings", `document.getElementById('mb-race').click(); document.getElementById('sel-go').click()`, "#race-settings", {}],
  ["customize", `
     document.getElementById('mb-garage').click();
     await until('#carsetup:not([hidden])', 4000);
     const tabs = [...document.querySelectorAll('#cs-tabs .cs-tab')];
     (tabs.find((e) => /TEAM/i.test(e.textContent)) || tabs[0])?.click();
     await until('#cs-customize', 4000);
     document.getElementById('cs-customize').click();
     await until('#customize:not([hidden])', 4000);
   `, "#customize", {}],
  ["carsetup", `document.getElementById('mb-race').click(); document.getElementById('sel-car').click()`, "#carsetup", {}],
  ["howtoplay", `document.getElementById('mb-help').click()`, "#howtoplay", {}],
  ["settings", `document.getElementById('mb-settings').click()`, "#pmsettings", {}],
  ["audioset", `document.getElementById('mb-settings').click(); await until('#pmsettings:not([hidden])',3000); document.getElementById('pm-audio').click()`, "#audioset", {}],
  ["advanced", `document.getElementById('mb-settings').click(); await until('#pmsettings:not([hidden])',3000); document.getElementById('pm-advanced').click()`, "#advanced", {}],
  ["datahub", `document.getElementById('mb-data').click(); await until('.dh-race, .dh-empty, .dh-error')`, "#datahub", { mock: 1 }],
  ["datahub-standings", `document.getElementById('mb-data').click(); document.getElementById('dh-tab-standings').click(); await until('.dh-row, .dh-empty, .dh-error')`, "#datahub", { mock: 1 }],
];

// Thresholds. 44 is Apple's HIG figure and WCAG 2.5.5 (AAA); 24 is the WCAG 2.2
// AA floor, and it only passes with clearance, hence SPACE.
const COMFY = 44, FLOOR = 24, SPACE = 24, TYPE_MIN = 10;

const MEASURE = function (rootSel) {
  const root = document.querySelector(rootSel);
  if (!root || root.hidden) return { error: "missing/hidden " + rootSel };
  const COMFY = 44, FLOOR = 24, SPACE = 24, TYPE_MIN = 10;
  const idOf = (el) => ((el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "")) || el.tagName.toLowerCase();
  const out = { tap: [], spacing: [], type: [], overflow: [], marker: [] };
  const vis = (el) => { const cs = getComputedStyle(el); return cs.display !== "none" && cs.visibility !== "hidden" && +cs.opacity > 0.05; };

  // What is actually PAINTED — intersected with every clipping ancestor. A row
  // scrolled out of a list is not a tiny tap target, it is a hidden one.
  const painted = (el) => {
    const r = el.getBoundingClientRect();
    let l = r.left, t = r.top, rt = r.right, b = r.bottom;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const pcs = getComputedStyle(p);
      if (pcs.overflowX === "visible" && pcs.overflowY === "visible") continue;
      const pr = p.getBoundingClientRect();
      l = Math.max(l, pr.left); t = Math.max(t, pr.top);
      rt = Math.min(rt, pr.right); b = Math.min(b, pr.bottom);
      if (rt - l <= 1 || b - t <= 1) return null;
    }
    return { left: l, top: t, right: rt, bottom: b, w: rt - l, h: b - t };
  };

  const targets = [];
  const seenTap = new Set();
  for (const el of root.querySelectorAll("button, input, select, textarea, a[href], [role='option'], [role='tab'], [tabindex]:not([tabindex='-1'])")) {
    if (!vis(el)) continue;
    const p = painted(el);
    if (!p || p.w < 2 || p.h < 2) continue;      // fully scrolled away
    const box = el.getBoundingClientRect();
    // SCROLLED OUT is not TOO SMALL. `painted` intersects with every clipping
    // ancestor, so a row half out of its list, or the EXPORT tab waiting at the
    // end of a horizontal strip, measures a few pixels — and the first version
    // of this tool duly reported them as sub-minimum targets. They are neither:
    // the control is full size, the user just has to scroll to it. Only judge a
    // target that is (almost) fully on screen; anything else is a scroll
    // position, and scroll positions are ScrollFade's problem, not this one.
    const shown = box.width > 0 && box.height > 0 && p.w >= box.width * 0.9 && p.h >= box.height * 0.9;
    // A range slider's HIT area is the whole track; height alone understates it.
    const isRange = el.tagName === "INPUT" && el.type === "range";
    targets.push({ el, p, isRange, shown });
    if (!shown) continue;
    const min = Math.min(box.width, box.height);
    // One row per SELECTOR: fourteen identical chips in a list is one decision,
    // not fourteen findings, and counting them as fourteen buried the real ones.
    const key = idOf(el) + "|" + Math.round(box.width) + "x" + Math.round(box.height);
    if (seenTap.has(key)) continue;
    seenTap.add(key);
    if (min < FLOOR) out.tap.push({ el: idOf(el), w: +box.width.toFixed(0), h: +box.height.toFixed(0), sev: "under-floor" });
    else if (min < COMFY && !isRange) out.tap.push({ el: idOf(el), w: +box.width.toFixed(0), h: +box.height.toFixed(0), sev: "under-comfy" });
  }
  // Crowding: only interesting for targets that are already small.
  for (const a of targets) {
    if (!a.shown || Math.min(a.p.w, a.p.h) >= COMFY) continue;
    let nearest = Infinity, who = null;
    for (const b of targets) {
      if (a === b) continue;
      const dx = Math.max(0, Math.max(a.p.left - b.p.right, b.p.left - a.p.right));
      const dy = Math.max(0, Math.max(a.p.top - b.p.bottom, b.p.top - a.p.bottom));
      const d = Math.hypot(dx, dy);
      if (d < nearest) { nearest = d; who = b.el; }
    }
    if (nearest < SPACE && Math.min(a.p.w, a.p.h) < FLOOR) {
      out.spacing.push({ el: idOf(a.el), gap: +nearest.toFixed(1), near: idOf(who) });
    }
  }
  // Type below the legibility floor (ignore purely decorative empties).
  const seenType = new Set();
  for (const el of root.querySelectorAll("*")) {
    if (el.children.length || !el.textContent.trim() || !vis(el)) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (!fs || fs >= TYPE_MIN) continue;
    // Deduped by selector + size for the same reason as the tap targets: one
    // 9px badge class repeated down a 24-row table is ONE decision to make.
    const key = idOf(el) + "|" + fs;
    if (seenType.has(key)) continue;
    seenType.add(key);
    out.type.push({ el: idOf(el), px: +fs.toFixed(1), text: el.textContent.trim().slice(0, 18) });
  }
  // Content clipped with no way to reach it, and scroll regions with no marker.
  for (const el of [root, ...root.querySelectorAll("*")]) {
    if (!vis(el)) continue;
    const cs = getComputedStyle(el);
    const ox = cs.overflowX, oy = cs.overflowY;
    if (el.scrollHeight - el.clientHeight > 2 && (oy === "hidden" || oy === "clip")) {
      out.overflow.push({ el: idOf(el), axis: "y", over: el.scrollHeight - el.clientHeight });
    }
    // `scrollWidth - clientWidth` is NOT a reliable "content is clipped" test.
    // With `scrollbar-gutter: stable` (which every .pane sets) Chromium counts
    // the reserved gutter into scrollWidth, so a pane whose children all fit
    // reports exactly one scrollbar-width of phantom overflow — 14px on
    // #sel-body and #cz-body, on three portrait viewports, with no child
    // overhanging the content box by a single pixel. Ask instead whether the
    // box can actually be scrolled: if the widest child fits, it cannot.
    if (el.scrollWidth - el.clientWidth > 2 && (ox === "hidden" || ox === "clip") && cs.textOverflow !== "ellipsis") {
      let overhang = 0;
      const right = el.getBoundingClientRect().right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
      for (const c of el.children) {
        const cr = c.getBoundingClientRect();
        if (cr.width) overhang = Math.max(overhang, cr.right - right);
      }
      if (overhang > 2) out.overflow.push({ el: idOf(el), axis: "x", over: +overhang.toFixed(0) });
    }
    // A region that CAN scroll must say so: the edge fade and the thumb.
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight - el.clientHeight > 4) {
      const hasFade = el.classList.contains("sf-t") || el.classList.contains("sf-b");
      const hasThumb = el.classList.contains("sf-scroll");
      if (!hasFade || !hasThumb) {
        out.marker.push({ el: idOf(el), over: el.scrollHeight - el.clientHeight, fade: hasFade, thumb: hasThumb });
      }
    }
  }
  return out;
};

const srv = await startStaticServer(ROOT);
const totals = new Map();
try {
  const browser = await launchChromium({ args: ["--use-angle=swiftshader"] });
  for (const [name, setup, sel, opts] of SCREENS) {
    if (ONLY && !ONLY.some((f) => name.includes(f))) continue;
    const page = await browser.newPage({ viewport: SIZES[0], hasTouch: true, deviceScaleFactor: 1 });
    if (opts.mock && setupApiMocks) await setupApiMocks(page);
    await page.goto(srv.url);
    await page.waitForFunction(() => window.__apex != null, null, { timeout: 20000 });
    await page.evaluate(`(async () => { ${UNTIL}\n${setup} })()`).catch(() => {});
    await sleep(opts.wait ?? 600);
    console.log(`\n### ${name}`);
    for (const viewport of SIZES) {
      await page.setViewportSize(viewport);
      for (const scale of SCALES) {
        await applyScale(page, scale).catch(() => {});
        // let the resize settle: container queries, ScrollFade's own remeasure
        await sleep(180);
        await page.evaluate(() => {
          for (const a of document.getAnimations()) { try { a.finish(); } catch { /* infinite */ } }
          if (window.ScrollFade && window.ScrollFade.refresh) window.ScrollFade.refresh();
        }).catch(() => {});
        await sleep(120);
        const r = await page.evaluate(MEASURE, sel).catch((e) => ({ error: e.message }));
        const tag = `${viewport.width}x${viewport.height}${scaleTag(scale)}`;
        if (r.error) { console.log(`  ${tag.padEnd(13)} ${r.error}`); continue; }
        const bits = [];
        for (const k of ["tap", "spacing", "type", "overflow", "marker"]) {
          if (r[k].length) { bits.push(`${k}:${r[k].length}`); totals.set(k, (totals.get(k) || 0) + r[k].length); }
        }
        if (!bits.length) { console.log(`  ${tag.padEnd(13)} ok`); continue; }
        console.log(`  ${tag.padEnd(9)} ${bits.join("  ")}`);
        for (const k of ["tap", "spacing", "type", "overflow", "marker"]) {
          for (const f of r[k].slice(0, 4)) {
            const d = k === "tap" ? `${f.w}x${f.h} (${f.sev})`
              : k === "spacing" ? `gap ${f.gap}px to ${f.near}`
              : k === "type" ? `${f.px}px "${f.text}"`
              : k === "overflow" ? `${f.axis} by ${f.over}px`
              : `fade=${f.fade} thumb=${f.thumb} over=${f.over}px`;
            console.log(`      ${k.padEnd(8)} ${f.el}  ${d}`);
          }
          if (r[k].length > 4) console.log(`      ${k.padEnd(8)} … +${r[k].length - 4} more`);
        }
      }
    }
    await page.close();
  }
  console.log("\n=== totals across the matrix ===");
  for (const [k, v] of [...totals].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  if (!totals.size) console.log("  clean");
} finally { await shutdown(); }
