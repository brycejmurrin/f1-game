// HudSkin.skinAccent: --accent-ink for an appended (custom) team meets WCAG AA 4.5:1 (#4351, re-land of #4613).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/hud-skin.js"), "utf8").replace(/^const\b/gm, "var");

function inkFor(color, tokens) {
  const props = new Map();
  const ctx = vm.createContext({
    Math, String, parseInt,
    document: { documentElement: { style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) } } },
    getComputedStyle: () => ({ getPropertyValue: (k) => tokens[k] || "" }),
    Teams: { isReal: () => false },
  });
  vm.runInContext(SRC, ctx, { filename: absSrc("js/ui/hud-skin.js") });
  ctx.HudSkin.skinAccent({ color }, { cssCol: () => "#808080" });
  return props.get("--accent-ink");
}

test("a mid-grey custom accent between two mid-grey tokens gets black ink, not a sub-4.5:1 token", () => {
  // 0.5 grey: 3.98:1 on white, 5.28:1 on black; #777 / #888 tokens are both under 2:1 against it.
  assert.equal(inkFor([0.5, 0.5, 0.5], { "--text": "#888888", "--bg": "#777777" }), "#000");
});

test("a dark custom accent between two dark tokens gets white ink", () => {
  assert.equal(inkFor([0.1, 0.1, 0.3], { "--text": "#333333", "--bg": "#222222" }), "#fff");
});

test("a token that already reaches 4.5:1 is kept", () => {
  assert.equal(inkFor([0.9, 0.1, 0.1], { "--text": "#ffffff", "--bg": "#0a0a0a" }), "var(--text)", "4.67:1 on white beats 4.24:1 on #0a0a0a");
});
