/* renderer-picker-unavailable.test.mjs — ctxLost / boot Graphics unavailable panel deps.
 * Run: node --test tests/unit/renderer-picker-unavailable.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { seedClipboard } from "../helpers/seed-clipboard.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function element(tag, id) {
  const listeners = {};
  return {
    tagName: tag.toUpperCase(), id: id || "", hidden: true, inert: false, open: false,
    disabled: false, children: [], style: {}, attributes: {}, textContent: "",
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    append(...children) { for (const child of children) this.appendChild(child); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    async click() {
      let result;
      if (this.onclick) result = this.onclick();
      for (const fn of (listeners.click || [])) fn({ target: this });
      return result;
    },
    focus() { this.focused = true; },
    showModal() { this.open = true; },
    close() { this.open = false; },
  };
}

function descendants(node) {
  return [node, ...node.children.flatMap(descendants)];
}

function bootPicker({ windowName = "" } = {}) {
  const byId = {
    nogl: element("div", "nogl"),
    loading: element("div", "loading"),
    "race-settings": element("dialog", "race-settings"),
  };
  const hud = element("div", "hud");
  const overlay = element("div", "overlay");
  const dataDialog = element("dialog", "datahub");
  const helpDialog = element("dialog", "howtoplay");
  const document = {
    readyState: "loading",
    createElement: (tag) => element(tag),
    getElementById: (id) => byId[id] || null,
    addEventListener() {},
  };
  const win = { addEventListener() {}, name: windowName };
  const ctx = vm.createContext({
    document,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, removeItem() {} },
    navigator: {},
    location: { reload() {} },
    queueMicrotask,
    window: win,
  });
  seedLog(ctx);
  seedClipboard(ctx);
  vm.runInContext(read("js/perf/gfx-escalation.js"), ctx, { filename: absSrc("js/perf/gfx-escalation.js") });
  vm.runInContext(read("js/perf/renderer-picker.js"), ctx, { filename: absSrc("js/perf/renderer-picker.js") });
  const G = vm.runInContext("RendererPicker", ctx);
  return { G, byId, hud, overlay, dataDialog, helpDialog, document, win };
}

function dataHubButton(panel) {
  const controls = descendants(panel).filter((n) => n.tagName === "BUTTON");
  return controls.find((n) => n.textContent === "DATA HUB");
}

function statusLine(panel) {
  return descendants(panel).find((n) => n.tagName === "P" && n.attributes && n.attributes.role === "status") || null;
}

test("showUnavailable panel-only uses registered defaults for Data Hub", async () => {
  const { G, byId, hud, overlay } = bootPicker();
  let ensureCalls = 0;
  let openCalls = 0;
  G.setUnavailableDefaults({
    hud, overlay,
    ensureDataHub: async () => { ensureCalls++; return true; },
    openDataHub: () => { openCalls++; },
    dataDialog: element("dialog"),
    dataClose: element("button"),
  });
  G.showUnavailable({ panel: byId.nogl });
  assert.equal(hud.hidden, true);
  assert.equal(hud.inert, true);
  assert.equal(overlay.hidden, true);
  const data = dataHubButton(byId.nogl);
  assert.ok(data);
  await data.click();
  await new Promise((r) => setImmediate(r));
  assert.equal(ensureCalls, 1);
  assert.equal(openCalls, 1);
  assert.equal(data.disabled, false);
});

test("clearGfxBootRecovery clears window.name ctx-loss tally", () => {
  for (const prefix of ["", "player-owned-name", "line one\nline two"]) {
    const { G, win } = bootPicker({ windowName: prefix + (prefix ? "\n" : "") + "apex26.ctxLostReloads=3" });
    G.clearGfxBootRecovery();
    assert.equal(win.name, prefix);
  }
});

test("showUnavailable Data Hub failure re-enables the button and shows status", async () => {
  for (const scenario of ["missing", "reject", "false"]) {
    const { G, byId } = bootPicker();
    const defaults = scenario === "missing"
      ? {}
      : {
        ensureDataHub: scenario === "reject"
          ? async () => { throw new Error("load failed"); }
          : async () => false,
        openDataHub: () => { throw new Error("should not open"); },
      };
    G.setUnavailableDefaults(defaults);
    G.showUnavailable({ panel: byId.nogl });
    const data = dataHubButton(byId.nogl);
    await data.click();
    await new Promise((r) => setImmediate(r));
    const status = statusLine(byId.nogl);
    assert.equal(status && status.textContent, "Data Hub could not be loaded.", scenario);
    assert.equal(data.disabled, false, scenario);
  }
});
