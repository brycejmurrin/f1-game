// #5201: the safe box is the LARGER of the hardware inset and the gutter on each edge, never their sum, and the
// tokens derived from it stay in one unit. Arithmetic rows for the owner's windows (UI-CONTRACT-2026-11-06 §2).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const tokens = read("css/tokens.css");
const decl = (name) => { const m = tokens.match(new RegExp("^\\s*" + name + ":\\s*([^;]+);", "m")); assert.ok(m, name + " is declared"); return m[1].trim(); };

test("--safe-* take max(inset, gutter): an inset is never padded twice", () => {
  for (const [side, tok] of [["t", "--sat"], ["r", "--sar"], ["b", "--sab"], ["l", "--sal"]]) {
    assert.equal(decl("--safe-" + side), `max(var(${tok}), var(--gut))`, "--safe-" + side);
  }
  // The windows: [w, h, l, r, t, b] with the landscape-phone gutter of 8.
  const box = ([w, h, l, r, t, b], gut = 8) => [w - Math.max(l, gut) - Math.max(r, gut), h - Math.max(t, gut) - Math.max(b, gut)];
  assert.deepEqual(box([852, 393, 59, 59, 0, 21]), [734, 364], "A: Home Screen app");
  assert.deepEqual(box([852, 283, 59, 59, 0, 0]), [734, 267], "C: Safari tab");
  assert.deepEqual(box([844, 390, 47, 47, 0, 21]), [750, 361], "D: 844x390");
  assert.deepEqual(box([1280, 800, 0, 0, 0, 0], 12), [1256, 776], "no insets: the gutter alone, as before");
});

test("--safe-w is painted px and --safe-h is own px of a --ui-scale sheet: neither mixes the two", () => {
  assert.equal(decl("--safe-w"), "calc(100svw - var(--safe-l) - var(--safe-r))");
  assert.equal(decl("--safe-h"), "calc((100svh - var(--safe-t) - var(--safe-b)) / var(--ui-scale))",
    "the insets are divided by the zoom with the viewport, not subtracted painted from own");
  assert.ok(Math.abs((393 - 8 - 21) / 1.09 - 333.9) < 0.1, "A at UI 109 %: 333.9 own px");
});

test("no rule re-adds the gutter to a raw inset, and fixed banners cap to the safe box", () => {
  const dir = path.join(ROOT, "css");
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".css"))) {
    const css = fs.readFileSync(path.join(dir, f), "utf8");
    assert.doesNotMatch(css, /var\(--sa[lrtb]\)\s*\+\s*var\(--gut\)/, f + ": inset + gutter (use --safe-*)");
  }
  const sw = read("css/overlays.css").match(/#save-warning \{[^}]*\}/);
  assert.ok(sw, "#save-warning rule");
  assert.match(sw[0], /width: min\(48rem, calc\(var\(--safe-w\) - 2 \* var\(--gap\)\)\)/, "the save banner is capped by the safe box, not 100vw");
  const data = read("css/data.css");
  assert.match(data, /--dh-safe-h: calc\(100 \* var\(--svhz\) - \(var\(--safe-t\) \+ var\(--safe-b\)\) \/ var\(--ui-scale\)\)/, "the data hub cap follows the same tokens as its overlay's padding");
  assert.doesNotMatch(data, /2 \* var\(--gut\)[^;]*var\(--sat\)/, "no second copy of the inset arithmetic");
});
