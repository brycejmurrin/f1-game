/* #4822 — house height unit is svh, never dvh, and a [data-tip] is never
 * reachable only through :active / :hover on touch. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const css = fs.readdirSync(path.join(root, "css")).filter((f) => f.endsWith(".css"));

test("no dvh unit in a css declaration (svh is the house unit)", () => {
  const hits = [];
  for (const f of css) {
    strip(fs.readFileSync(path.join(root, "css", f), "utf8")).split("\n").forEach((l, i) => {
      if (/\d\s*dvh\b/.test(l)) hits.push(`${f}:${i + 1} ${l.trim()}`);
    });
  }
  assert.deepEqual(hits, [], "use svh (css/tokens.css §Height uses svh)");
});

test("season tile tip has a tap route, not only :active/:hover", () => {
  const sel = strip(fs.readFileSync(path.join(root, "css/select.css"), "utf8"));
  assert.match(sel, /\.track-row\[data-tip\]\[data-tip-open\]::before/);
  const js = fs.readFileSync(path.join(root, "js/ui/select-screen.js"), "utf8");
  assert.match(js, /dataset\.tipOpen\s*=/);
});
