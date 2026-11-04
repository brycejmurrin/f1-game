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

test("a [data-tip] ::before shown by :active is also shown by a pressed-free route", () => {
  // Rule over every css file: a selector list that paints a data-tip on
  // :active must also list a selector with no :active/:hover, so touch has a
  // route that is not "only while the finger is down".
  const bad = [];
  for (const f of css) {
    for (const m of strip(fs.readFileSync(path.join(root, "css", f), "utf8")).matchAll(/([^{}]+)\{/g)) {
      const sels = m[1].split(",").map((x) => x.trim()).filter((x) => /\[data-tip\]/.test(x) && /::before/.test(x));
      if (sels.some((x) => /:active/.test(x)) && !sels.some((x) => !/:(active|hover)/.test(x))) bad.push(`${f}: ${sels[0]}`);
    }
  }
  assert.deepEqual(bad, []);
});
