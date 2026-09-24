/* appearance-opts — Settings › APPEARANCE theme + dual accents.
 * Mirrors tests/unit/driving-line-opts.test.mjs: load the real module over a
 * stub store / SettingRow and assert eval-time apply + store round-trips.
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

function load({ stored = {}, readyState = "complete", team = "mclaren" } = {}) {
  const rows = new Map();
  const written = {};
  const style = new Map();
  const dataset = {};
  const els = new Map();
  const byId = (id) => {
    if (els.has(id)) return els.get(id);
    const el = {
      id, hidden: false, value: "#e10600",
      children: [],
      addEventListener() {},
      setAttribute() {}, getAttribute() { return null; },
      style: {
        setProperty: (k, v) => style.set(k, v),
        removeProperty: (k) => { style.delete(k); },
        getPropertyValue: (k) => style.get(k) || "",
      },
    };
    els.set(id, el);
    return el;
  };
  const documentElement = {
    dataset,
    style: {
      setProperty: (k, v) => style.set(k, v),
      removeProperty: (k) => { style.delete(k); },
      getPropertyValue: (k) => style.get(k) || "",
    },
    getAttribute: (k) => (k.startsWith("data-") ? dataset[k.slice(5)] : null),
    setAttribute: (k, v) => { if (k.startsWith("data-")) dataset[k.slice(5)] = v; },
    removeAttribute: (k) => { if (k.startsWith("data-")) delete dataset[k.slice(5)]; },
  };
  if (team) dataset.team = team;

  const sb = {
    Math, console, Object, Array, JSON, String, Number, parseInt,
    GameStore: { store: {
      get: (k, d) => (k in stored ? stored[k] : d),
      set: (k, v) => { written[k] = v; stored[k] = v; },
    } },
    SettingRow: {
      wire: (id, spec) => rows.set(id, spec),
      labels: (vals) => vals.map((v) => [v, v.toUpperCase()]),
    },
    Teams: {
      LIST: [{ id: "mclaren", color: [1, 0.5, 0] }],
      isReal: () => true,
    },
    document: {
      readyState,
      documentElement,
      getElementById: byId,
      addEventListener() {},
      _handlers: {},
    },
    getComputedStyle: () => ({
      getPropertyValue: (p) => (p === "--text" ? "#f6f6f9" : p === "--bg" ? "#0c0c14" : ""),
    }),
  };
  sb.window = sb;
  sb.window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  const ctx = vm.createContext(sb);
  vm.runInContext(SRC, ctx, { filename: "js/ui/appearance-opts.js" });
  return {
    M: vm.runInContext("AppearanceOpts", ctx),
    rows, written, style, dataset, stored, byId,
  };
}

test("shell carries Appearance door, panel and the three setting rows", () => {
  assert.ok(SHELL.includes('id="pm-open-appearance"'));
  assert.ok(SHELL.includes('id="pm-panel-appearance"'));
  for (const id of ["pm-uitheme", "pm-menuaccent", "pm-hudaccent"]) {
    assert.ok(SHELL.includes(`id="${id}"`), id);
    assert.ok(SHELL.includes(`id="${id}-sel"`), id + "-sel");
  }
  assert.ok(SHELL.includes('id="pm-menuaccent-hex"'));
  assert.ok(SHELL.includes('id="pm-hudaccent-hex"'));
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

test("named menu preset stores and leaves --red to CSS", () => {
  const { M, written, dataset, style } = load();
  M.setMenuAccent("cyan");
  assert.equal(written.menuAccent, "cyan");
  assert.equal(dataset.menuAccent, "cyan");
  assert.equal(style.has("--red"), false);
});

test("custom menu accent writes inline --red", () => {
  const { M, written, style, byId } = load();
  M.setMenuHex("#112233");
  assert.equal(written.menuAccent, "custom");
  assert.equal(written.menuAccentHex, "#112233");
  assert.equal(style.get("--red"), "#112233");
  assert.equal(byId("pm-menuaccent-custom").hidden, false);
});

test("HUD brand points --accent at var(--red)", () => {
  const { M, style } = load();
  M.setHudAccent("brand");
  assert.equal(M.hudUsesTeam(), false);
  assert.equal(style.get("--accent"), "var(--red)");
});

test("DOM ready wires the three SettingRow ids", () => {
  const { rows } = load({ readyState: "complete" });
  assert.deepEqual([...rows.keys()].sort(), ["pm-hudaccent", "pm-menuaccent", "pm-uitheme"]);
});
