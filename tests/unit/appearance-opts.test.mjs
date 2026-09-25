/* appearance-opts — Settings › APPEARANCE theme + dual accents.
 * Mirrors tests/unit/driving-line-opts.test.mjs: load the real module over a
 * stub store / SettingRow and assert eval-time apply + store round-trips,
 * swatch/hex UI, contrast ink, SYSTEM theme, and the tokens.css contract.
 *
 * Run: node --test tests/unit/appearance-opts.test.mjs */
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
const COMPONENTS = fs.readFileSync(path.join(ROOT, "css/components.css"), "utf8");

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
        return child;
      },
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
  assert.deepEqual([...rows.keys()].sort(), ["pm-hudaccent", "pm-menuaccent", "pm-uitheme"]);
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
  for (const k of ["uiTheme", "menuAccent", "hudAccent", "menuAccentHex", "hudAccentHex"]) {
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
