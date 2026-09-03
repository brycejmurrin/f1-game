// R8 F6: WHICH DIALOG IS ON TOP IS NOT A DOM-ORDER QUESTION.
//
// UiLayers.top() decides which screen owns Escape, arrow keys and focus
// containment. Every open showModal() dialog used to rank Infinity, and the
// `>=` tie-break then handed the answer to whichever dialog came LAST IN DOM
// ORDER — which is right only while dialogs happen to be opened in the order
// they appear in index.html. The browser already knows the real answer: the
// spec orders `querySelectorAll(":modal")` by TOP-LAYER position (bottom
// first), and the top layer is a stack, so the most recently shown dialog is
// last. top() now ranks modals by that index.
//
// The last test here is why the fix is safe to land without a browser run:
// on today's index.html every opener sits before the dialog it opens, so
// DOM order and open order agree and the change is a provable no-op.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

// Minimal DOM: elements carry the handful of members uilayers.js reads
// (hidden, box, children, matches, id) — enough to exercise top()'s ranking
// without pulling in a DOM implementation.
function fakeDom(els, modalOrder) {
  const node = (e) => ({
    id: e.id,
    hidden: !!e.hidden,
    _modal: !!e.modal,
    _z: e.z,
    children: [],
    getBoundingClientRect: () => ({ width: 800, height: 600 }),
    matches(sel) { return sel === ":modal" ? this._modal : false; },
  });
  const nodes = els.map(node);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const context = {
    window: {},
    document: {
      querySelectorAll(sel) {
        if (sel === ":modal") return modalOrder.map((id) => byId.get(id));
        // ALL_SEL is the layer list with :not([hidden]) — honour the hidden
        // half, since that is what keeps the query cheap mid-race.
        const ids = new Set(sel.split(",").map((s) => s.trim().replace(/^#/, "").replace(/:not\(\[hidden\]\)$/, "")));
        return nodes.filter((n) => ids.has(n.id) && !n.hidden);
      },
      getElementById: (id) => byId.get(id) || null,
    },
    getComputedStyle: (el) => ({ zIndex: el._z == null ? "auto" : String(el._z), visibility: "visible" }),
    Log: { info() {}, warn() {} },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read("js/ui/layers.js"), context);
  return context.window.UiLayers;
}

test("the LAST-SHOWN dialog is top, even when it comes first in the DOM", () => {
  // #pmsettings appears BEFORE #teampicker in the layer list, but was
  // shown second — so it is later in the top layer and must win.
  const U = fakeDom(
    [{ id: "pmsettings", modal: true }, { id: "teampicker", modal: true }],
    ["teampicker", "pmsettings"],
  );
  assert.equal(U.top().id, "pmsettings",
    "top-layer order, not DOM order, decides between two open dialogs");
});

test("DOM order still answers when it agrees with open order", () => {
  const U = fakeDom(
    [{ id: "pmsettings", modal: true }, { id: "teampicker", modal: true }],
    ["pmsettings", "teampicker"],
  );
  assert.equal(U.top().id, "teampicker");
});

test("any modal outranks any z-index, and hidden layers never rank", () => {
  const U = fakeDom(
    [{ id: "overlay", z: 9000 }, { id: "teampicker", modal: true }, { id: "select", z: 12, hidden: true }],
    ["teampicker"],
  );
  assert.equal(U.top().id, "teampicker", "a dialog is in the top layer, above every z-index");
});

test("with no dialogs open the z-index ranking is unchanged", () => {
  const U = fakeDom([{ id: "overlay", z: 10 }, { id: "select", z: 40 }], []);
  assert.equal(U.top().id, "select");
});

test("every opener in index.html precedes the dialog it opens", () => {
  // The edge guard behind the fix: while this holds, DOM order and top-layer
  // order agree on the shipped markup, so F6 cannot change today's behaviour —
  // it only removes the dependence on that coincidence. A new dialog placed
  // above its opener fails here, which is the moment to check the change.
  const html = read("index.html");
  const dialogs = [...html.matchAll(/<dialog[^>]*\bid="([^"]+)"/g)];
  assert.ok(dialogs.length > 5, `expected the dialog family — found ${dialogs.length}`);
  for (const [, id] of dialogs) {
    const at = html.indexOf(`id="${id}"`);
    // An opener is any element whose markup names this dialog's id as its
    // target (data-opens/aria-controls); openers wired only in JS are out of
    // scope for a markup guard.
    const re = new RegExp(`(?:data-opens|aria-controls)="${id}"`, "g");
    for (const m of html.matchAll(re)) {
      assert.ok(m.index < at,
        `#${id}'s opener at ${m.index} must precede the dialog at ${at} — ` +
        "if it cannot, top() no longer agrees with DOM order and F6's no-op argument lapses");
    }
  }
});

test("topmodal does not preventDefault a non-cancelable focusin (F9)", () => {
  const src = read("js/ui/modal.js");
  assert.doesNotMatch(src, /focusin[\s\S]{0,1200}?e\.preventDefault\(\)/,
    "focusin is not cancelable — preventDefault there is a no-op that reads as a guard");
  assert.match(src, /No preventDefault: `focusin` is NOT cancelable/);
});

test("menunav releases its per-press measurement cache (F11)", () => {
  const src = read("js/ui/menu-nav.js");
  assert.match(src, /try \{ navKey\(e\); \} finally \{ _boxes = null; \}/,
    "the box cache must be dropped across every early return, not just replaced next press");
  assert.match(src, /_boxes = new Map\(\);/, "still fresh per press");
});
