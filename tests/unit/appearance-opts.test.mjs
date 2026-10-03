/* appearance-opts — Settings › APPEARANCE theme + dual accents.
 * Mirrors tests/unit/driving-line-opts.test.mjs: load the real module over a
 * stub store / SettingRow and assert eval-time apply + store round-trips,
 * swatch/hex UI, contrast ink, SYSTEM theme, and the tokens.css contract.
 *
 * Run: node --test tests/unit/appearance-opts.test.mjs */
import { readCssSource } from "../helpers/css-source.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/appearance-opts.js"), "utf8").replace(/^const\b/gm, "var");
const SHELL = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const TOKENS = fs.readFileSync(path.join(ROOT, "css/tokens.css"), "utf8");
const EXPORT = fs.readFileSync(path.join(ROOT, "js/ui/settings-export.js"), "utf8");
const COMPONENTS = readCssSource("css/components.css");

function load({
  stored = {},
  readyState = "complete",
  team = "mclaren",
  preferLight = false,
} = {}) {
  const rows = new Map();
  const written = {};
  const style = new Map();
  const dataset = {};
  const els = new Map();
  const mqListeners = [];

  function makeEl(id) {
    const listeners = {};
    const children = [];
    const el = {
      id,
      hidden: false,
      value: "#e10600",
      dataset: {},
      className: "",
      title: "",
      children,
      style: {
        setProperty: (k, v) => style.set(id + "|" + k, v),
        removeProperty: (k) => { style.delete(id + "|" + k); },
        getPropertyValue: (k) => style.get(id + "|" + k) || "",
      },
      addEventListener(type, fn) {
        (listeners[type] || (listeners[type] = [])).push(fn);
      },
      setAttribute(k, v) {
        if (k.startsWith("data-")) el.dataset[k.slice(5)] = v;
        else el["_" + k] = String(v);
      },
      getAttribute(k) {
        if (k.startsWith("data-")) return el.dataset[k.slice(5)] || null;
        return el["_" + k] || null;
      },
      appendChild(child) {
        children.push(child);
        child.parentNode = el;
        return child;
      },
      insertBefore(child, ref) {
        const i = ref ? children.indexOf(ref) : -1;
        if (i < 0) children.push(child);
        else children.splice(i, 0, child);
        child.parentNode = el;
        return child;
      },
      get nextElementSibling() {
        if (!el.parentNode || !el.parentNode.children) return null;
        const sibs = el.parentNode.children;
        const i = sibs.indexOf(el);
        return i >= 0 && i + 1 < sibs.length ? sibs[i + 1] : null;
      },
      get nextSibling() { return el.nextElementSibling; },
      get tagName() { return el._tagName || "DIV"; },
      set tagName(v) { el._tagName = v; },
      querySelectorAll(sel) {
        if (sel === ".pm-accent-chip") return children.filter((c) => String(c.className).includes("pm-accent-chip"));
        return [];
      },
      _emit(type) {
        for (const fn of listeners[type] || []) fn();
      },
    };
    // Per-element style map for chips uses a namespace; root uses bare keys.
    if (id === "documentElement") {
      el.style = {
        setProperty: (k, v) => style.set(k, v),
        removeProperty: (k) => { style.delete(k); },
        getPropertyValue: (k) => style.get(k) || "",
      };
    }
    return el;
  }

  const byId = (id) => {
    if (els.has(id)) return els.get(id);
    const el = makeEl(id);
    els.set(id, el);
    return el;
  };

  // Shared parent so AppearanceOpts can insertBefore the CVD row after contrast.
  const panel = makeEl("pm-panel-appearance");
  panel.appendChild = function (child) {
    panel.children.push(child);
    child.parentNode = panel;
    return child;
  };
  panel.insertBefore = function (child, ref) {
    const i = ref ? panel.children.indexOf(ref) : -1;
    if (i < 0) panel.children.push(child);
    else panel.children.splice(i, 0, child);
    child.parentNode = panel;
    return child;
  };
  const contrast = byId("pm-contrast");
  const contrastHelp = byId("pm-contrast-help");
  contrastHelp.tagName = "P";
  contrastHelp.id = "pm-contrast-help";
  panel.appendChild(contrast);
  panel.appendChild(contrastHelp);

  const documentElement = makeEl("documentElement");
  Object.assign(documentElement, {
    dataset,
    getAttribute: (k) => (k.startsWith("data-") ? dataset[k.slice(5)] : null),
    setAttribute: (k, v) => { if (k.startsWith("data-")) dataset[k.slice(5)] = v; },
    removeAttribute: (k) => { if (k.startsWith("data-")) delete dataset[k.slice(5)]; },
  });
  // Root style writes go to the shared style Map (bare keys).
  documentElement.style = {
    setProperty: (k, v) => style.set(k, v),
    removeProperty: (k) => { style.delete(k); },
    getPropertyValue: (k) => style.get(k) || "",
  };
  if (team) dataset.team = team;

  const created = [];
  const sb = {
    Math, console, Object, Array, JSON, String, Number, parseInt,
    GameStore: { store: {
      get: (k, d) => (k in stored ? stored[k] : d),
      set: (k, v) => { written[k] = v; stored[k] = v; },
    } },
    SettingRow: {
      wire: (id, spec) => rows.set(id, spec),
      labels: (vals) => vals.map((v) => [v, v.toUpperCase()]),
      paint: (id, value) => { rows.get(id) && (rows.get(id)._painted = value); },
      build(id, labelText, values) {
        const row = makeEl(id);
        row.id = id;
        row.className = "set-row";
        const label = makeEl(id + "-label");
        label.id = id + "-label";
        label.className = "tune-label";
        label.textContent = labelText;
        const ctl = makeEl(id + "-ctl");
        const prev = makeEl(id + "-prev");
        prev.tagName = "BUTTON";
        prev.setAttribute("data-step", "-1");
        const sel = makeEl(id + "-sel");
        sel.tagName = "SELECT";
        const next = makeEl(id + "-next");
        next.tagName = "BUTTON";
        next.setAttribute("data-step", "1");
        ctl.appendChild(prev); ctl.appendChild(sel); ctl.appendChild(next);
        row.appendChild(label); row.appendChild(ctl);
        els.set(id, row);
        return { row, label, sel, prev, next };
      },
    },
    Teams: {
      LIST: [
        { id: "mclaren", color: [1, 0.5, 0] },
        { id: "ferrari", color: [0.9, 0.05, 0.1] },
      ],
      isReal: () => true,
    },
    document: {
      readyState,
      documentElement,
      activeElement: null,
      getElementById: byId,
      createElement(tag) {
        const el = makeEl("created-" + created.length);
        el.tagName = String(tag).toUpperCase();
        created.push(el);
        return el;
      },
      addEventListener() {},
      _handlers: {},
    },
    getComputedStyle: () => ({
      getPropertyValue: (p) => {
        if (p === "--text") return "#f6f6f9";
        if (p === "--bg") return "#0c0c14";
        return "";
      },
    }),
  };
  sb.window = sb;
  sb.window.matchMedia = (q) => ({
    matches: preferLight && String(q).includes("light"),
    media: q,
    addEventListener(_t, fn) { mqListeners.push(fn); },
    addListener(fn) { mqListeners.push(fn); },
    removeEventListener() {},
    removeListener() {},
    _fire() { for (const fn of mqListeners) fn(); },
  });
  const ctx = vm.createContext(sb);
  vm.runInContext(SRC, ctx, { filename: "js/ui/appearance-opts.js" });
  return {
    M: vm.runInContext("AppearanceOpts", ctx),
    rows, written, style, dataset, stored, byId, created, mqListeners,
    fireMq: () => { for (const fn of mqListeners) fn(); },
  };
}

test("shell carries Appearance door, panel, preview, swatches and hex fields", () => {
  assert.ok(SHELL.includes('id="pm-open-appearance"'));
  assert.ok(SHELL.includes('id="pm-panel-appearance"'));
  assert.ok(SHELL.includes('id="pm-appearance-preview"'));
  assert.ok(SHELL.includes('id="pm-menuaccent-swatches"'));
  assert.ok(SHELL.includes('id="pm-hudaccent-swatches"'));
  for (const id of ["pm-uitheme", "pm-menuaccent", "pm-hudaccent"]) {
    assert.ok(SHELL.includes(`id="${id}"`), id);
    assert.ok(SHELL.includes(`id="${id}-sel"`), id + "-sel");
  }
  assert.ok(SHELL.includes('id="pm-menuaccent-hex"'));
  assert.ok(SHELL.includes('id="pm-hudaccent-hex"'));
  assert.ok(SHELL.includes('id="pm-menuaccent-hextext"'));
  assert.ok(SHELL.includes('id="pm-hudaccent-hextext"'));
  assert.ok(COMPONENTS.includes(".pm-accent-swatches"));
  assert.ok(COMPONENTS.includes(".pm-accent-hextext"));
  assert.ok(COMPONENTS.includes(".pm-accent-preview"));
});

test("defaults apply at eval: dark / brand / team data attrs", () => {
  const { M, dataset, rows } = load({ readyState: "loading" });
  assert.equal(rows.size, 0, "UI not wired while loading");
  assert.equal(M.theme(), "dark");
  assert.equal(M.menuAccent(), "brand");
  assert.equal(M.hudAccent(), "team");
  assert.equal(M.hudUsesTeam(), true);
  assert.equal(dataset.uiTheme, "dark");
  assert.equal(dataset.menuAccent, "brand");
  assert.equal(dataset.hudAccent, "team");
});

test("profile restore updates live appearance caches and rows without another persistence batch", () => {
  const { M, written, dataset, rows } = load();
  M.restore({ uiTheme: "light", menuAccent: "cyan", hudAccent: "violet", menuAccentHex: "#ffffff", hudAccentHex: "#123456",
    textSize: "large", uiContrast: "high", cvdMode: "deutan", speedUnits: "mph", menuHelp: "off" });
  assert.equal(M.theme(), "light"); assert.equal(M.menuAccent(), "cyan"); assert.equal(M.hudAccent(), "violet");
  assert.equal(dataset.uiContrast, "high"); assert.equal(dataset.menuHelp, "off"); assert.equal(M.speed(287), 178);
  assert.equal(M.cvdMode(), "deutan"); assert.equal(dataset.cvd, "deutan");
  assert.equal(rows.get("pm-cvd").read(), "deutan"); assert.equal(rows.get("pm-cvd")._painted, "deutan");
  assert.equal(rows.get("pm-uitheme").read(), "light"); assert.deepEqual(written, {});
  M.restore({ cvdMode: "invalid" });
  assert.equal(M.cvdMode(), "off"); assert.equal(dataset.cvd, undefined);
  assert.equal(rows.get("pm-cvd")._painted, "off"); assert.deepEqual(written, {});
});

test("menu custom colours receive the same safe ink selection as swatches", () => {
  const { M, style } = load(); M.setMenuHex("#ffffff");
  assert.equal(style.get("--menu-accent-ink"), "var(--bg)"); M.setMenuHex("#101010");
  assert.equal(style.get("--menu-accent-ink"), "var(--text)");
});

test("setTheme persists and stamps data-ui-theme", () => {
  const { M, written, dataset } = load();
  M.setTheme("light");
  assert.equal(written.uiTheme, "light");
  assert.equal(dataset.uiTheme, "light");
});

test("SYSTEM theme stamps data-ui-theme and re-applies on matchMedia change", () => {
  const { M, dataset, fireMq, written } = load({ preferLight: true });
  M.setTheme("system");
  assert.equal(written.uiTheme, "system");
  assert.equal(dataset.uiTheme, "system");
  // Listener is registered; firing it must not throw and must keep SYSTEM stamped.
  fireMq();
  assert.equal(dataset.uiTheme, "system");
});

test("named menu preset stores and leaves --red to CSS", () => {
  const { M, written, dataset, style } = load();
  M.setMenuAccent("cyan");
  assert.equal(written.menuAccent, "cyan");
  assert.equal(dataset.menuAccent, "cyan");
  assert.equal(style.has("--red"), false);
});

test("custom menu accent writes inline --red and reveals the well", () => {
  const { M, written, style, byId } = load();
  M.setMenuHex("#112233");
  assert.equal(written.menuAccent, "custom");
  assert.equal(written.menuAccentHex, "#112233");
  assert.equal(style.get("--red"), "#112233");
  assert.equal(byId("pm-menuaccent-custom").hidden, false);
  assert.equal(byId("pm-menuaccent-hextext").value, "#112233");
});

test("leaving CUSTOM hides the well again", () => {
  const { M, byId } = load();
  M.setMenuHex("#abcdef");
  assert.equal(byId("pm-menuaccent-custom").hidden, false);
  M.setMenuAccent("brand");
  assert.equal(byId("pm-menuaccent-custom").hidden, true);
});

test("HUD brand points --accent at var(--red)", () => {
  const { M, style } = load();
  M.setHudAccent("brand");
  assert.equal(M.hudUsesTeam(), false);
  assert.equal(style.get("--accent"), "var(--red)");
});

test("menu TEAM writes a concrete team hex into --red", () => {
  const { M, style, dataset } = load({ team: "mclaren" });
  M.setMenuAccent("team");
  assert.equal(dataset.menuAccent, "team");
  assert.equal(style.get("--red"), "#ff8000"); // 1,0.5,0
});

test("HUD TEAM clears inline --accent so data-team owns it", () => {
  const { M, style } = load();
  M.setHudAccent("cyan");
  assert.equal(style.get("--accent"), "#00a3e0");
  M.setHudAccent("team");
  assert.equal(M.hudUsesTeam(), true);
  assert.equal(style.has("--accent"), false);
  assert.equal(style.has("--accent-ink"), false);
});

test("pickInk chooses --bg on a light custom HUD accent (dark theme)", () => {
  const { M, style } = load();
  M.setHudHex("#ffff00");
  assert.equal(style.get("--accent"), "#ffff00");
  assert.equal(style.get("--accent-ink"), "var(--bg)");
});

test("pickInk chooses --text on a dark custom HUD accent", () => {
  const { M, style } = load();
  M.setHudHex("#112233");
  assert.equal(style.get("--accent-ink"), "var(--text)");
});

test("garbage theme / accent / hex values fall back or keep prior", () => {
  const { M, dataset, style } = load();
  assert.equal(M.setTheme("nope"), "dark");
  assert.equal(dataset.uiTheme, "dark");
  assert.equal(M.setMenuAccent("neon"), "brand");
  M.setMenuHex("#112233");
  assert.equal(M.setMenuHex("#abc"), "#112233", "short hex rejected");
  assert.equal(M.setMenuHex("zz"), "#112233");
  assert.equal(style.get("--red"), "#112233");
});

test("bad store values at load fall to shipped defaults", () => {
  const { M, dataset } = load({
    stored: { uiTheme: "neon", menuAccent: "x", hudAccent: "", menuAccentHex: "#gg", hudAccentHex: "1" },
  });
  assert.equal(M.theme(), "dark");
  assert.equal(M.menuAccent(), "brand");
  assert.equal(M.hudAccent(), "team");
  assert.equal(M.menuHex(), "#e10600");
  assert.equal(dataset.uiTheme, "dark");
});

test("DOM ready wires SettingRows and builds both swatch rows", () => {
  const { rows, byId } = load({ readyState: "complete" });
  assert.deepEqual([...rows.keys()].sort(), ["pm-contrast", "pm-cvd", "pm-helptext", "pm-hudaccent", "pm-menuaccent", "pm-textsize", "pm-uitheme", "pm-units"]);
  const menuChips = byId("pm-menuaccent-swatches").children;
  const hudChips = byId("pm-hudaccent-swatches").children;
  assert.equal(menuChips.length, 8);
  assert.equal(hudChips.length, 8);
  assert.equal(menuChips.filter((c) => c.getAttribute("aria-selected") === "true").map((c) => c.dataset.accent).join(), "brand");
  assert.equal(hudChips.filter((c) => c.getAttribute("aria-selected") === "true").map((c) => c.dataset.accent).join(), "team");
});

test("swatch click selects the accent", () => {
  const { M, byId, written } = load();
  const cyan = byId("pm-menuaccent-swatches").children.find((c) => c.dataset.accent === "cyan");
  assert.ok(cyan);
  cyan._emit("click");
  assert.equal(written.menuAccent, "cyan");
  assert.equal(M.menuAccent(), "cyan");
  assert.equal(cyan.getAttribute("aria-selected"), "true");
});

test("hex text field accepts a full #rrggbb and rejects junk", () => {
  const { M, byId, written } = load();
  M.setMenuAccent("custom");
  const tx = byId("pm-menuaccent-hextext");
  tx.value = "#00ffaa";
  tx._emit("input");
  assert.equal(written.menuAccentHex, "#00ffaa");
  assert.equal(M.menuHex(), "#00ffaa");
  tx.value = "nope";
  tx._emit("input");
  assert.equal(M.menuHex(), "#00ffaa");
});

test("appearance keys are registered for settings export/import", () => {
  for (const k of ["uiTheme", "menuAccent", "hudAccent", "menuAccentHex", "hudAccentHex", "cvdMode", "textSize"]) {
    assert.match(EXPORT, new RegExp(`k:\\s*"${k}"[\\s\\S]*?group:\\s*"appearance"`),
      `settings-export must carry ${k} in the appearance group`);
  }
});

test("tokens.css defines every named menu preset AppearanceOpts ships", () => {
  const { M } = load({ readyState: "loading" });
  for (const id of M.CSS_MENU_PRESETS) {
    assert.ok(TOKENS.includes(`data-menu-accent="${id}"`),
      `css/tokens.css missing :root[data-menu-accent="${id}"]`);
    assert.ok(M.PRESET_HEX[id], `PRESET_HEX missing ${id}`);
  }
  for (const id of Object.keys(M.PRESET_HEX)) {
    if (id === "brand") continue; // brand is the cascade default, no data-attr rule
    if (M.CSS_MENU_PRESETS.includes(id)) continue;
    assert.fail(`PRESET_HEX has ${id} but CSS_MENU_PRESETS does not — keep them lockstep`);
  }
});

test("forced-colors opts the appearance chips out with the swatch family", () => {
  assert.match(TOKENS, /\.pm-accent-chip/);
  assert.match(TOKENS, /forced-color-adjust:\s*none/);
});

test("READABILITY: text size, high contrast and speed units persist and apply", () => {
  const { M, dataset, written } = load();
  assert.equal(M.textSize(), "normal");
  assert.equal(dataset.textSize, undefined, "NORMAL leaves the ladder alone");
  M.setTextSize("larger");
  assert.equal(written.textSize, "larger");
  assert.equal(dataset.textSize, "larger");
  M.setTextSize("huge");
  assert.equal(M.textSize(), "normal", "an unknown size falls back");
  M.setContrast("high");
  assert.equal(written.uiContrast, "high");
  assert.equal(dataset.uiContrast, "high");
  M.setContrast("off");
  assert.equal(dataset.uiContrast, undefined);
});

test("SPEED UNITS is display-only: km/h by default, mph converts and rounds", () => {
  const { M } = load();
  assert.equal(M.units(), "kmh");
  assert.equal(M.speed(287.4), 287);
  assert.equal(M.unitLabel(), "KM/H");
  M.setUnits("mph");
  assert.equal(M.speed(287.4), 179, "287.4 km/h = 178.6 mph");
  assert.equal(M.speed(0), 0);
  assert.equal(M.unitLabel(), "MPH");
  const { M: M2 } = load({ stored: { speedUnits: "mph", textSize: "large", uiContrast: "high" } });
  assert.equal(M2.units(), "mph");
  assert.equal(M2.textSize(), "large");
  assert.equal(M2.contrast(), "high");
});

test("tokens.css defines both text sizes and the high-contrast block", () => {
  for (const sel of ['[data-text-size="large"]', '[data-text-size="larger"]', '[data-ui-contrast="high"]'])
    assert.ok(TOKENS.includes(":root" + sel), sel);
  for (const id of ["pm-textsize", "pm-contrast", "pm-units"]) assert.ok(SHELL.includes(`id="${id}-sel"`), id);
});

// ── HELP TEXT (READABILITY) ──────────────────────────────────────────────────

test("HELP TEXT: SHOW by default, HIDE stamps data-menu-help=off, garbage reads as SHOW", () => {
  const { M, dataset, written, rows } = load();
  assert.equal(M.help(), "on");
  assert.equal(dataset.menuHelp, undefined, "SHOW writes no attribute");
  assert.deepEqual(JSON.parse(JSON.stringify(rows.get("pm-helptext").values)), [["on", "SHOW"], ["off", "HIDE"]]);
  rows.get("pm-helptext").write("off");
  assert.equal(written.menuHelp, "off");
  assert.equal(dataset.menuHelp, "off");
  assert.equal(rows.get("pm-helptext")._painted, "off");
  M.setHelp("on");
  assert.equal(dataset.menuHelp, undefined);
  assert.equal(M.setHelp("maybe"), "on");
  assert.equal(load({ stored: { menuHelp: "off" } }).dataset.menuHelp, "off", "applied at eval");
  assert.equal(load({ stored: { menuHelp: 0 } }).M.help(), "on");
});

test("HELP TEXT: the inline boot stamp agrees with the module", () => {
  const m = SHELL.match(/<script>\s*\(function \(\) \{\s*\/\/ html\[data-motion\][\s\S]*?<\/script>/);
  assert.ok(m, "the inline first-paint script is in the shell");
  const body = m[0].replace(/^<script>/, "").replace(/<\/script>$/, "");
  for (const v of [undefined, "on", "off", "hide", 1]) {
    const ds = {};
    const ls = new Map(v === undefined ? [] : [["apex26.menuHelp", JSON.stringify(v)]]);
    vm.runInNewContext(body, {
      JSON, localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null) },
      window: { matchMedia: () => ({ matches: false }) }, matchMedia: () => ({ matches: false }),
      document: { documentElement: { dataset: ds }, body: null },
    });
    const mod = load(v === undefined ? {} : { stored: { menuHelp: v } }).dataset.menuHelp;
    assert.equal(ds.menuHelp, mod, "menuHelp=" + JSON.stringify(v));
  }
});

test("HELP TEXT: CSS hides explanations in settings + race setup, never status lines or kept readouts", () => {
  assert.match(COMPONENTS, /:root\[data-menu-help="off"\] :is\(#pmsettings, #rs-body\) \.adv-help:not\(\[role="status"\]\):not\(\[aria-live\]\):not\(\[data-help="keep"\]\) \{ display: none; \}/);
  // The row is a .set-row, never an .adv-help, so HIDE can never hide the way back.
  for (const part of ["", "-label", "-prev", "-sel", "-next"]) assert.ok(SHELL.includes(`id="pm-helptext${part}"`), part);
  assert.match(SHELL, /<div id="pm-helptext" class="set-row"/);
  // Warnings, forecasts and readouts in the shell stay visible under HIDE.
  for (const id of ["pm-practice-state", "pm-pit-help", "pm-occlusion-note", "pm-drill-status", "pm-pit-estimate",
    "pm-stint-forecast", "pm-energy-forecast", "pm-coach-summary", "pm-connection", "pm-badges-summary", "pm-lap-report"]) {
    assert.match(SHELL, new RegExp(`<p id="${id}" class="adv-help" data-help="keep"`), id);
  }
  const pad = SHELL.slice(SHELL.indexOf('id="pm-phonepad-text"'), SHELL.indexOf('id="pm-phonepad-qr-wrap"'));
  assert.equal((pad.match(/class="adv-help" data-help="keep"/g) || []).length, 2, "#pm-phonepad-text's room-code lines");
  // JS-built ones.
  const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
  assert.match(read("js/ui/settings-export.js"), /note\.className = "adv-help";\s*note\.setAttribute\("data-help", "keep"\)/);
  assert.match(read("js/garage/setup-sheet.js"), /rakeOut\.id = "cs-rake-readout";[^\n]*setAttribute\("data-help", "keep"\)/);
  assert.match(read("js/ui/title-layout.js"), /id: "pm-tl-shape"[^\n]*"data-help": "keep"/);
  assert.match(EXPORT, /k:\s*"menuHelp"[^\n]*group:\s*"appearance"[^\n]*oneOf: \["on", "off"\]/);
});
