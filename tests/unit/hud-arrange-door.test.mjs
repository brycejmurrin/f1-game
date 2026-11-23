/* hud-arrange-door.test.mjs — ARRANGE HUD off the boot wall (#5976). js/ui/hud-arrange.js is a
 * LAZY_UI_PRESETS file (the eagerCodeBytes ratchet holds it off the wall); DockLayout.create (eager) opens arrangeDoor, which builds the pause-card button and its first tap
 * loads the editor alone, creates it once with G and opens it. The editor itself: hud-arrange.test.mjs;
 * the real lazy path in a browser: hud-layout.spec.js and ui-button-touch.spec.js tap #pm-hud-arrange.
 * Run: node --test tests/unit/hud-arrange-door.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/dock-layout.js"), "utf8");

function node(id) {
  const n = { id, attrs: {}, children: [], parentNode: null, nextSibling: null,
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; },
    insertBefore(child, ref) { child.parentNode = this; const i = ref ? this.children.indexOf(ref) : -1; this.children.splice(i < 0 ? this.children.length : i, 0, child); } };
  return n;
}

/** A pause card with the HUD details fold; `load(files)` answers the ScriptLoader. */
function harness(load) {
  const host = node("host"), sum = node("pm-hud-details-sum");
  host.insertBefore(sum, null);
  const ids = new Map([["pm-hud-details", node("pm-hud-details")], ["pm-hud-details-sum", sum]]);
  const warns = [], loads = [], made = [];
  const ctx = {
    Log: { info() {}, warn: (_t, m) => warns.push(m), debug() {} },
    window: {}, document: { createElement: () => node(null) },
    ScriptLoader: { create: () => ({ load: (files, edges, opts) => { loads.push({ files, edges, opts }); return load(ctx, files); } }) },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC.replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/ui/dock-layout.js") });
  const G = { $: (id) => ids.get(id) || null };
  const btn = ctx.DockLayout.arrangeDoor(G, () => ctx.HudArrange.create(G));
  if (btn) ids.set(btn.id, btn);
  const define = () => {
    ctx.HudArrange = { create(g) {
      let on = false;
      made.push(g);
      return { setEditing: (v) => { on = !!v; }, isEditing: () => on };
    } };
  };
  return { ctx, G, btn, host, warns, loads, made, define, settle: () => new Promise((r) => setTimeout(r, 0)) };
}

test("the door builds ARRANGE HUD beside the HUD details summary without loading the editor", () => {
  const h = harness(() => Promise.resolve(true));
  assert.equal(h.btn.id, "pm-hud-arrange");
  assert.equal(h.btn.textContent, "ARRANGE HUD");
  assert.equal(h.btn.getAttribute("aria-pressed"), "false");
  assert.deepEqual([...h.host.children.map((c) => c.id)], ["pm-hud-details-sum", "pm-hud-arrange", "pm-hud-arrange-help"]);
  assert.equal(h.loads.length, 0, "boot fetches nothing");
  assert.equal(h.ctx.DockLayout.arrangeDoor(h.G, () => null), null, "a second call finds the button and builds no copy");
});

test("first tap loads the HUD editor and its finish-card preview, creates the editor once with G and opens it; later taps toggle", async () => {
  let editor;
  const h = harness((ctx) => { h.define(); return Promise.resolve(true); });
  h.btn.onclick();
  assert.equal(h.btn.getAttribute("aria-busy"), "true");
  h.btn.onclick();   // a second tap while it loads starts no second fetch
  await h.settle();
  assert.equal(h.loads.length, 1);
  assert.deepEqual([...h.loads[0].files], ["js/ui/hud-arrange.js", "js/race/retired-card.js"]);
  assert.equal(h.loads[0].opts.strict, true);
  assert.deepEqual(h.made, [h.G], "create(G) ran once with game.js's G");
  assert.equal(h.btn.getAttribute("aria-busy"), null);
  editor = h.made.length;
  h.btn.onclick(); h.btn.onclick(); h.btn.onclick();
  assert.equal(h.made.length, editor, "toggles reuse the one editor");
  assert.equal(h.loads.length, 1, "and never fetch again");
});

test("a failed load logs, opens nothing and the next tap retries", async () => {
  let fail = true;
  const h = harness(() => { if (fail) return Promise.reject(new Error("offline")); h.define(); return Promise.resolve(true); });
  h.btn.onclick();
  await h.settle();
  assert.equal(h.made.length, 0);
  assert.equal(h.warns.length, 1);
  assert.equal(h.btn.getAttribute("aria-busy"), null);
  fail = false;
  h.btn.onclick();
  await h.settle();
  assert.equal(h.loads.length, 2);
  assert.equal(h.made.length, 1);
});
