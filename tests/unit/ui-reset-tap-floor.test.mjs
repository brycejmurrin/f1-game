// ui-reset + tap-floor + theme-axis: the shared overlay reset closes layers through their doors (fake document), one tap-floor rule, and dark/light audit rows keep distinct keys. No browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  readFloors, toCssPx, judgeTap, unionRect, measureTapTarget, TAP_FLOOR_SRC, WCAG_MIN, COMFY_FALLBACK,
} from "../../tools/ui/tap-floor.mjs";
import { resetOverlays, resetConfig, ROUTE_BODY_CLASSES, NEVER_HIDE } from "../../tools/ui/ui-reset.mjs";
import { OVERLAY_IDS } from "../../tools/ui/menu-screens.mjs";
import { parseThemes, themeTag, rowTheme } from "../../tools/ui/theme-axis.mjs";
import { auditCellKey, diffAudits } from "../../tools/ui/audit-diff.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// ---------------------------------------------------------------- tap floor
test("floors: body --tap is the comfort floor, WCAG 24 the conformance floor", () => {
  assert.deepEqual(readFloors("52px"), { wcag: 24, comfy: 52 });
  assert.deepEqual(readFloors(" 40px"), { wcag: 24, comfy: 40 });
  assert.deepEqual(readFloors(""), { wcag: WCAG_MIN, comfy: COMFY_FALLBACK });
});

test("measure divides the painted box by currentCSSZoom and judges min(w,h) with slack", () => {
  // 52 CSS px painted at the coarse-pointer scale 1.15 = 59.8 px: passes a 52 floor.
  const css = toCssPx({ width: 200, height: 59.8 }, 1.15);
  assert.ok(Math.abs(css.h - 52) < 1e-9);
  assert.deepEqual(judgeTap(css, { wcag: 24, comfy: 52 }), { tiny: false, small: false });
  assert.deepEqual(judgeTap({ w: 200, h: 45 }, { wcag: 24, comfy: 52 }), { tiny: false, small: true });
  assert.deepEqual(judgeTap({ w: 13, h: 13 }, { wcag: 24, comfy: 44 }), { tiny: true, small: true });
  assert.deepEqual(toCssPx({ width: 10, height: 10 }, 0), { w: 10, h: 10 });
});

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

test("a checkbox is measured by its label union", () => {
  const label = { getBoundingClientRect: () => rect(0, 0, 200, 48) };
  const box = { type: "checkbox", currentCSSZoom: 1, getBoundingClientRect: () => rect(4, 17, 13, 13), closest: (s) => (s === "label" ? label : null) };
  const m = measureTapTarget(box, null);
  assert.equal(m.w, 200);
  assert.equal(m.h, 48);
  const btn = { type: "submit", currentCSSZoom: 2, getBoundingClientRect: () => rect(0, 0, 100, 60), closest: () => label };
  assert.deepEqual([measureTapTarget(btn, null).w, measureTapTarget(btn, null).h], [50, 30]);
  assert.deepEqual(unionRect(rect(0, 0, 1, 1), rect(5, 5, 1, 1)).width, 6);
});

test("TAP_FLOOR_SRC installs the same rule in a page, idempotently", () => {
  const body = {};
  const ctx = {
    document: { body },
    getComputedStyle: (el) => ({ getPropertyValue: (k) => (el === body && k === "--tap" ? "52px" : "") }),
    CSS: { escape: (s) => s },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const vmOpts = { filename: path.join(ROOT, "tools/ui/tap-floor.mjs") };
  assert.equal(vm.runInContext(TAP_FLOOR_SRC, ctx, vmOpts), true);
  const T = ctx.window.__apexTap;
  // Cross-realm objects: compare as JSON.
  assert.equal(JSON.stringify(T.floors()), JSON.stringify({ wcag: 24, comfy: 52 }));
  assert.equal(JSON.stringify(T.judge({ w: 100, h: 40 }, T.floors())), JSON.stringify({ tiny: false, small: true }));
  vm.runInContext(TAP_FLOOR_SRC, ctx, vmOpts);
  assert.equal(ctx.window.__apexTap, T, "second install keeps the first");
});

// ---------------------------------------------------------------- reset
// A fake page: layers ranked by their order in `stack` (last = top), the way
// UiLayers.top() answers; TopModal.escapeTop presses the top layer's door.
function fakePage({ open, doors = {}, gates = [], extraEls = [] }) {
  const els = new Map();
  const clicks = [];
  const mk = (id, extra = {}) => {
    const attrs = {};
    const el = {
      id, hidden: true, isConnected: true, tagName: "DIV", disabled: false,
      classList: { _s: new Set(), contains(c) { return this._s.has(c); }, add(c) { this._s.add(c); }, remove(...c) { c.forEach((x) => this._s.delete(x)); } },
      style: { removeProperty() {} },
      getAttribute: (k) => (k in attrs ? attrs[k] : null),
      setAttribute: (k, v) => { attrs[k] = v; },
      click() { clicks.push(id); if (this.onclick) this.onclick(); },
      ...extra,
    };
    els.set(id, el);
    return el;
  };
  const stack = ["overlay", ...OVERLAY_IDS, "rotate-device"];
  for (const id of stack) mk(id);
  for (const id of extraEls) mk(id);
  for (const id of ["ios-install", "install-chip"]) { mk(id).hidden = false; }
  els.get("overlay").hidden = true;
  for (const id of open) els.get(id).hidden = false;
  for (const [layer, btn] of Object.entries(doors)) {
    els.get(layer).setAttribute("data-esc-close", btn);
    const b = els.get(btn) || mk(btn);
    if (!b.onclick) b.onclick = () => { els.get(layer).hidden = true; };
  }
  for (const g of gates) els.get(g).setAttribute("data-esc", "none");
  const body = { classList: els.get("overlay").classList };
  body.classList._s = new Set(ROUTE_BODY_CLASSES.concat(["keep-me"]));
  const document = { getElementById: (id) => els.get(id) || null, body };
  const top = () => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const el = els.get(stack[i]);
      if (!el.hidden && (el.id !== "rotate-device" || body.classList.contains("in-race"))) return el;
    }
    return null;
  };
  const window = {
    UiLayers: { top },
    TopModal: {
      escapeTop() {
        const l = top();
        if (!l) return false;
        if (l.getAttribute("data-esc") === "none") return true;      // owns Escape, does nothing
        const d = l.getAttribute("data-esc-close");
        if (!d) return false;
        const b = els.get(d); if (b && !b.disabled) b.click();
        return true;
      },
    },
  };
  return { els, clicks, document, window, body };
}

async function runReset(page, cfg) {
  const prev = { document: globalThis.document, window: globalThis.window };
  globalThis.document = page.document; globalThis.window = page.window;
  try { return await resetOverlays(cfg); } finally { globalThis.document = prev.document; globalThis.window = prev.window; }
}

test("reset closes every layer through its door and needs no hidden=true fallback", async () => {
  let hubOpen = true;
  const page = fakePage({
    open: ["select", "datahub"],
    doors: { select: "sel-back", datahub: "dh-close-btn" },
  });
  page.els.get("dh-close-btn").onclick = () => { hubOpen = false; page.els.get("datahub").hidden = true; };
  page.window.DataHub = { isOpen: () => hubOpen, close() { hubOpen = false; page.els.get("datahub").hidden = true; } };
  const r = await runReset(page, resetConfig(OVERLAY_IDS, { settleMs: 0, waitMs: 0, plateMs: 0 }));
  assert.deepEqual(r.closed.map((c) => c.id), ["datahub", "select"]);
  assert.deepEqual(r.fallbackIds, []);
  assert.equal(hubOpen, false, "DataHub's own flag is down: the next #mb-data click opens it");
  assert.equal(r.ok, true);
  assert.equal(r.top, "overlay");
  assert.equal(page.els.get("overlay").hidden, false);
  assert.equal(page.els.get("ios-install").hidden, true);
  assert.equal(page.els.get("install-chip").hidden, true);
  assert.deepEqual([...page.body.classList._s], ["keep-me"], "every route body class stripped, nothing else");
});

test("a paused race leaves by QUIT (armed twice), not RESUME", async () => {
  const page = fakePage({ open: ["pausemenu"], doors: { pausemenu: "pm-resume" }, extraEls: ["pm-quit"] });
  const quit = page.els.get("pm-quit");
  quit.onclick = () => {
    if (!quit.classList.contains("armed")) { quit.classList.add("armed"); return; }
    page.els.get("pausemenu").hidden = true;
  };
  const r = await runReset(page, resetConfig(OVERLAY_IDS, { settleMs: 0, waitMs: 0, plateMs: 0 }));
  assert.deepEqual(page.clicks, ["pm-quit", "pm-quit"]);
  assert.deepEqual(r.closed, [{ id: "pausemenu", how: "exit:pm-quit" }]);
  assert.deepEqual(r.fallbackIds, []);
});

test("a gate with no door is stuck: hidden=true fallback, named; DataHub closed by its module", async () => {
  let hubOpen = true;
  const page = fakePage({ open: ["loading"], gates: ["loading"] });
  page.window.DataHub = { isOpen: () => hubOpen, close() { hubOpen = false; } };
  page.body.classList.add("in-race");
  const r = await runReset(page, resetConfig(OVERLAY_IDS, { settleMs: 0, waitMs: 0, plateMs: 0 }));
  assert.deepEqual(r.stuck, ["loading"]);
  assert.deepEqual(r.fallbackIds, ["datahub:DataHub.close", "loading"]);
  assert.equal(hubOpen, false);
  assert.equal(r.ok, true);
});

test("#rotate-device is never force-hidden; stripping in-race is what clears it", async () => {
  const page = fakePage({ open: ["rotate-device"] });
  page.body.classList.add("in-race");
  const r = await runReset(page, resetConfig(OVERLAY_IDS, { settleMs: 0, waitMs: 0, plateMs: 0 }));
  assert.equal(page.els.get("rotate-device").hidden, false);
  assert.deepEqual(r.fallbackIds.filter((id) => id === "rotate-device"), []);
  assert.equal(r.ok, true);
  assert.deepEqual(NEVER_HIDE, ["rotate-device"]);
});

test("OVERLAY_IDS covers every UiLayers layer except the title and the CSS-gated rotate blocker", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/ui/layers.js"), "utf8");
  const defs = [...src.matchAll(/\{\s*id:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(defs.length > 20, "parsed UiLayers DEFS");
  const missing = defs.filter((id) => id !== "overlay" && id !== "rotate-device" && !OVERLAY_IDS.includes(id));
  assert.deepEqual(missing, []);
  assert.deepEqual(["overlay", "rotate-device", "ios-install", "install-chip"].filter((id) => OVERLAY_IDS.includes(id)), []);
});

// ---------------------------------------------------------------- theme axis
test("--theme parses dark,light; the default keeps today's names", () => {
  assert.deepEqual(parseThemes([]), ["dark"]);
  assert.deepEqual(parseThemes(["--theme=dark,light,dark"]), ["dark", "light"]);
  assert.throws(() => parseThemes(["--theme=sepia"]), Error);
  assert.throws(() => parseThemes(["--theme="]), Error);
  assert.equal(themeTag("dark"), "");
  assert.equal(themeTag("light"), "~light");
  assert.equal(rowTheme({}), "dark");
});

test("dark and light rows of one cell keep distinct merge/diff keys; pre-axis rows keep theirs", () => {
  const dark = { screen: "title", viewport: "ios-iphone-landscape", theme: "dark", clipped: [] };
  const light = { ...dark, theme: "light", clipped: [{ el: "#x", by: "#y" }] };
  const legacy = { screen: "title", viewport: "ios-iphone-landscape", clipped: [] };
  assert.equal(auditCellKey(dark), "title|ios-iphone-landscape");
  assert.equal(auditCellKey(legacy), auditCellKey(dark));
  assert.notEqual(auditCellKey(light), auditCellKey(dark));
  const d = diffAudits({ rows: [legacy] }, { rows: [dark, light] });
  assert.equal(d.compared, 2);
  assert.deepEqual(d.added.map((x) => x.cell), ["title|ios-iphone-landscape|light"]);
});

test("the reset/tap-floor callers parse, and menu-mock still exports its page functions", async () => {
  for (const f of ["layout-audit", "menu-mock", "menu-fit", "fit-audit", "menu-capture"]) {
    const r = spawnSync(process.execPath, ["--check", path.join(ROOT, "tools/ui", f + ".mjs")], { encoding: "utf8" });
    assert.equal(r.status, 0, f + ": " + r.stderr);
  }
  const mm = await import("../../tools/ui/menu-mock.mjs");
  assert.equal(typeof mm.leaveToMenu, "function");
  assert.equal(typeof mm.probeMenu, "function");
});
