#!/usr/bin/env node
// menu-fit — audit every menu screen for cramped / clipped layout at a given
// viewport. For each screen it walks the visible DOM subtree and reports
//   * horizontal overflow  (scrollWidth > clientWidth on a scroll container)
//   * children painted outside their scroll container's box (clipped)
//   * vertical overflow that is NOT scrollable (content lost below the fold)
// plus a screenshot per screen.
//
//   node tools/menu-fit.mjs                 # default 852x393 (iPhone 15 Pro landscape)
//   node tools/menu-fit.mjs 844x390 390x844 932x430
//   node tools/menu-fit.mjs 852x393 --safe=59,0,59,21   # simulate notch insets (l,t,r,b)
//
// --safe is the point of this tool. Headless Chromium reports every
// env(safe-area-inset-*) as 0, so a layout that ignores the insets looks
// perfect here and jams its content under the Dynamic Island on a real phone
// (that is exactly the bug this tool was written for). The flag overrides the
// --sa[ltrb] custom properties the stylesheet reads, reproducing a notched
// device. Landscape iPhone 14/15/16 Pro = 59px on the notch side, 21px bottom.
//
// Output: scratch/captures/menu-fit/<w>x<h>-<screen>.png + a JSON report per size.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchChromium, shutdown, sleep, startStaticServer } from "./harness.mjs";
// The data hub is the only screen whose content comes off the network. Reuse the
// Playwright suite's fixtures so it audits a populated table rather than an error
// card; if the import ever fails the hub still renders its empty/error state and
// the geometry checks below stay meaningful.
let setupApiMocks = null;
try { ({ setupApiMocks } = await import("../tests/f1-api-mock.js")); } catch { /* audit degrades to live/offline data */ }

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "scratch/captures/menu-fit");
mkdirSync(OUT, { recursive: true });

const argv = process.argv.slice(2);
const safeArg = argv.find((a) => a.startsWith("--safe="));
const dims = argv.filter((a) => !a.startsWith("--"));
const sizes = (dims.length ? dims : ["852x393"]).map((s) => {
  const [w, h] = s.split("x").map(Number);
  return { width: w, height: h };
});
// [left, top, right, bottom] → a :root override injected before first paint.
const SAFE = safeArg ? safeArg.slice(7).split(",").map(Number) : null;
const SAFE_CSS = SAFE
  ? `:root{--sal:${SAFE[0]}px!important;--sat:${SAFE[1]}px!important;--sar:${SAFE[2]}px!important;--sab:${SAFE[3]}px!important}`
  : null;
const SAFE_TAG = SAFE ? "-safe" : "";
// --only=a,b restricts the run to those screens (substring match) — a full sweep
// is ~10 pages per size, and iterating on one screen should not cost that.
const onlyArg = argv.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? onlyArg.slice(7).split(",").filter(Boolean) : null;

// Screens: [name, setup fn body (string, runs in page — may use `await`),
//            root selector, opts? { mock: serve the F1 API fixtures, wait: ms }]
//
// Helper available inside every setup body: `until(sel, ms?)` resolves once a
// node matching `sel` exists (or the timeout lapses) — the data hub builds its
// tabs from async fetches, so a fixed sleep either flakes or wastes seconds.
const SCREENS = [
  ["menu", `null`, "#overlay"],
  ["select-gp", `document.getElementById('mb-race').click()`, "#select"],
  ["select-tt", `document.getElementById('mb-tt').click()`, "#select"],
  ["teampicker", `document.getElementById('mb-race').click(); document.getElementById('sel-team-card').click()`, "#teampicker"],
  ["race-settings", `document.getElementById('mb-race').click(); document.getElementById('sel-go').click()`, "#race-settings"],
  ["customize", `document.getElementById('mb-race').click(); document.getElementById('sel-customize').click()`, "#customize"],
  ["carsetup", `document.getElementById('mb-race').click(); document.getElementById('sel-setup').click()`, "#carsetup"],
  ["howtoplay", `document.getElementById('mb-help').click()`, "#howtoplay"],
  ["pause", `window.__apex.race('bahrain'); `, "#pausemenu"],

  // ── F1 DATA HUB (#datahub — markup is built entirely by js/data/hub.js) ──
  ["datahub", `document.getElementById('mb-data').click(); await until('.dh-race, .dh-empty, .dh-error')`, "#datahub", { mock: 1 }],
  ["datahub-standings", `document.getElementById('mb-data').click(); document.getElementById('dh-tab-standings').click(); await until('.dh-row, .dh-empty, .dh-error')`, "#datahub", { mock: 1 }],
  ["datahub-lastrace", `document.getElementById('mb-data').click(); document.getElementById('dh-tab-lastrace').click(); await until('.dh-table, .dh-empty, .dh-error')`, "#datahub", { mock: 1 }],
  ["datahub-live", `document.getElementById('mb-data').click(); document.getElementById('dh-tab-live').click(); await until('.dh-wx-cell, .dh-empty, .dh-error')`, "#datahub", { mock: 1 }],
  ["datahub-telemetry", `document.getElementById('mb-data').click(); document.getElementById('dh-tab-telemetry').click(); await until('.dh-dchip, .dh-empty, .dh-error')`, "#datahub", { mock: 1 }],
  ["datahub-export", `document.getElementById('mb-data').click(); document.getElementById('dh-tab-export').click(); await until('.dh-export')`, "#datahub", { mock: 1 }],
  // The lap player is a second overlay stacked on the hub — its own root.
  ["datahub-telem-popup", `
     document.getElementById('mb-data').click();
     document.getElementById('dh-tab-telemetry').click();
     await until('.dh-dchip');
     const chips = document.querySelectorAll('.dh-dchip');
     if (chips[0]) chips[0].click();
     if (chips[1]) chips[1].click();
     await until('.dh-telem-detail .dh-livebtn');
     const load = document.querySelector('.dh-telem-detail .dh-livebtn');
     if (load) load.click();
     await until('.dh-tpopup .dh-canvas', 12000);
   `, ".dh-tpopup", { mock: 1, wait: 900 }],
];

// Injected before every setup body so a screen can wait for async content.
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

const AUDIT = function ([rootSel, safe]) {
  const root = document.querySelector(rootSel);
  if (!root || root.hidden) return { error: "root missing/hidden: " + rootSel };
  const out = { hOverflow: [], clipped: [], vLost: [], tiny: [], unsafe: [] };
  // The rectangle the OS may cover (notch / island / home indicator).
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const box = safe ? { l: safe[0], t: safe[1], r: vw - safe[2], b: vh - safe[3] } : null;
  const INTERACTIVE = { BUTTON: 1, INPUT: 1, SELECT: 1, TEXTAREA: 1, LABEL: 1 };
  const idOf = (el) => (el.id ? "#" + el.id : el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : el.tagName.toLowerCase());
  // The part of el that is actually PAINTED: its box intersected with every
  // clipping ancestor. Without this, a row scrolled halfway out of a list would
  // be reported as sitting under the home indicator when the list already
  // clipped it well above.
  const painted = (el, r) => {
    let l = r.left, t = r.top, rt = r.right, b = r.bottom;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const pcs = getComputedStyle(p);
      if (pcs.overflowX === "visible" && pcs.overflowY === "visible") continue;
      const pr = p.getBoundingClientRect();
      l = Math.max(l, pr.left); t = Math.max(t, pr.top);
      rt = Math.min(rt, pr.right); b = Math.min(b, pr.bottom);
      if (rt - l <= 1 || b - t <= 1) return null;
    }
    return { left: l, top: t, right: rt, bottom: b };
  };
  const all = [root, ...root.querySelectorAll("*")];
  for (const el of all) {
    if (el.tagName === "CANVAS" || el.tagName === "SVG" || el.tagName === "PATH") continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const ox = cs.overflowX, oy = cs.overflowY;
    // Horizontal overflow that is UNREACHABLE: overflow-x hidden/clip means the
    // extra width is simply cut off. auto/scroll is a deliberate strip (the car
    // setup tab rail) and `text-overflow: ellipsis` is deliberate truncation.
    if (el.scrollWidth - el.clientWidth > 1 && (ox === "hidden" || ox === "clip") && cs.textOverflow !== "ellipsis") {
      out.hOverflow.push({ el: idOf(el), scrollW: el.scrollWidth, clientW: el.clientWidth, overflowX: ox });
    }
    // vertical content that cannot be reached (clipped, not scrollable)
    if (el.scrollHeight - el.clientHeight > 1 && (oy === "hidden" || oy === "clip")) {
      out.vLost.push({ el: idOf(el), scrollH: el.scrollHeight, clientH: el.clientHeight });
    }
    // children painted outside a CLIPPING (not scrolling) ancestor's box
    if (ox === "hidden" || ox === "clip") {
      for (const c of el.children) {
        const cr = c.getBoundingClientRect();
        if (!cr.width || !cr.height) continue;
        const dx = Math.min(cr.left - r.left, r.right - cr.right);
        if (dx < -2) out.clipped.push({ parent: idOf(el), child: idOf(c), by: +dx.toFixed(1) });
      }
    }
    // tap targets below the 40px comfort threshold
    if (el.tagName === "BUTTON" && (r.height < 36 || r.width < 36)) {
      out.tiny.push({ el: idOf(el), w: +r.width.toFixed(1), h: +r.height.toFixed(1) });
    }
    // interactive controls (or text) straying into an OS-reserved edge.
    // Only what is actually PAINTED counts: an element scrolled out of view
    // inside a clipping ancestor is not sitting under the notch, it is just
    // scrolled away, so intersect against every clipping ancestor first.
    if (box && (INTERACTIVE[el.tagName] || (el.children.length === 0 && el.textContent.trim()))) {
      const pr = painted(el, r);
      if (pr && (pr.left < box.l - 0.5 || pr.right > box.r + 0.5 || pr.top < box.t - 0.5 || pr.bottom > box.b + 0.5)) {
        out.unsafe.push({
          el: idOf(el),
          out: [
            pr.left < box.l ? `L${(box.l - pr.left).toFixed(0)}` : "",
            pr.right > box.r ? `R${(pr.right - box.r).toFixed(0)}` : "",
            pr.top < box.t ? `T${(box.t - pr.top).toFixed(0)}` : "",
            pr.bottom > box.b ? `B${(pr.bottom - box.b).toFixed(0)}` : "",
          ].filter(Boolean).join(" "),
        });
      }
    }
  }
  // does the document itself overflow?
  out.doc = { scrollH: document.documentElement.scrollHeight, clientH: document.documentElement.clientHeight };
  return out;
};

// A capture must never lose the sweep: screenshotting a page that still has a
// live WebGL race behind the menu occasionally exceeds the default 30 s, and an
// uncaught rejection there used to discard every screen measured so far.
async function shot(page, file) {
  try { await page.screenshot({ path: join(OUT, file), timeout: 60000 }); }
  catch (e) { console.warn(`  ! screenshot failed: ${file} — ${e.message.split("\n")[0]}`); }
}

(async () => {
  const srv = await startStaticServer(ROOT);
  const report = {};
  try {
    const browser = await launchChromium({ args: ["--use-angle=swiftshader"] });
    for (const viewport of sizes) {
      const tag = `${viewport.width}x${viewport.height}`;
      report[tag] = {};
      for (const [name, setup, sel, opts = {}] of SCREENS) {
        if (ONLY && !ONLY.some((f) => name.includes(f))) continue;
        const page = await browser.newPage({ viewport, hasTouch: true, deviceScaleFactor: 1 });
        if (opts.mock && setupApiMocks) await setupApiMocks(page);
        if (SAFE_CSS) {
          await page.addInitScript((css) => {
            const add = () => {
              const s = document.createElement("style");
              s.id = "safe-sim"; s.textContent = css;
              document.head.appendChild(s);
            };
            if (document.head) add();
            else document.addEventListener("DOMContentLoaded", add, { once: true });
          }, SAFE_CSS);
        }
        await page.goto(srv.url);
        await page.waitForFunction(() => window.__apex != null, { timeout: 20000 });
        await page.evaluate(`(async () => { ${UNTIL}\n${setup} })()`);
        await sleep(opts.wait ?? (name === "pause" ? 2500 : 400));
        if (name === "pause") {
          await page.evaluate(() => {
            window.__apex.park(0.1);
            const rd = document.getElementById("rotate-device"); if (rd) rd.hidden = true;
            document.getElementById("pausemenu").hidden = false;
          });
          await sleep(300);
        }
        const res = await page.evaluate(AUDIT, [sel, SAFE]);
        report[tag][name] = res;
        await shot(page, `${tag}${SAFE_TAG}-${name}.png`);
        // settings sub-page too
        if (name === "pause") {
          await page.evaluate(() => document.getElementById("pm-settings").click());
          await sleep(300);
          report[tag]["pause-settings"] = await page.evaluate(AUDIT, ["#pmsettings", SAFE]);
          await shot(page, `${tag}${SAFE_TAG}-pause-settings.png`);
          await page.evaluate(() => document.getElementById("pm-advanced").click());
          await sleep(300);
          report[tag]["advanced"] = await page.evaluate(AUDIT, ["#advanced", SAFE]);
          await shot(page, `${tag}${SAFE_TAG}-advanced.png`);
        }
        await page.close();
      }
    }
  } finally {
    await shutdown();
  }
  writeFileSync(join(OUT, `report${SAFE_TAG}.json`), JSON.stringify(report, null, 2));
  for (const [tag, screens] of Object.entries(report)) {
    console.log(`\n=== ${tag} ===`);
    for (const [name, r] of Object.entries(screens)) {
      if (r.error) { console.log(`  ${name}: ${r.error}`); continue; }
      const bits = [];
      if (r.hOverflow.length) bits.push(`hOverflow: ${r.hOverflow.map((o) => `${o.el} ${o.scrollW}>${o.clientW}`).join(", ")}`);
      if (r.clipped.length) bits.push(`clipped: ${r.clipped.map((o) => `${o.child} in ${o.parent} by ${o.by}`).join(", ")}`);
      if (r.vLost.length) bits.push(`vLost: ${r.vLost.map((o) => `${o.el} ${o.scrollH}>${o.clientH}`).join(", ")}`);
      if (r.unsafe.length) bits.push(`unsafe: ${r.unsafe.slice(0, 12).map((o) => `${o.el} ${o.out}`).join(", ")}${r.unsafe.length > 12 ? ` (+${r.unsafe.length - 12})` : ""}`);
      if (r.tiny.length) bits.push(`tiny: ${r.tiny.map((o) => `${o.el} ${o.w}x${o.h}`).join(", ")}`);
      console.log(`  ${name}: ${bits.length ? bits.join("\n      ") : "ok"}`);
    }
  }
})();
