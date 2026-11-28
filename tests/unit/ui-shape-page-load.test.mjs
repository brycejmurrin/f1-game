// Every page that loads a UiShape reader also loads js/ui/ui-shape.js, earlier (#7259).
// screen-placement.js reads UiShape at eval; overlay.html and controller.html shipped without it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SHAPE = "js/ui/ui-shape.js";
const readers = readdirSync("js/ui")
  .map((f) => `js/ui/${f}`)
  .filter((f) => f !== SHAPE && f.endsWith(".js") && /\bUiShape\b/.test(readFileSync(f, "utf8")));
const pages = execFileSync("git", ["ls-files", "*.html"], { encoding: "utf8" })
  .split("\n").filter((f) => f && !f.startsWith("node_modules/"));

test("the UiShape readers are found", () => {
  assert.ok(readers.includes("js/ui/screen-placement.js"), readers.join(","));
});

for (const page of pages) {
  test(`${page}: a page loading a UiShape reader loads ui-shape.js before it`, () => {
    const html = readFileSync(page, "utf8");
    const srcs = [...html.matchAll(/<script\b[^>]*\bsrc="([^"?]+)/g)].map((m) => m[1].replace(/^\.?\//, ""));
    const at = (f) => srcs.findIndex((s) => s.endsWith(f));
    const first = readers.map(at).filter((i) => i >= 0).sort((a, b) => a - b)[0];
    if (first === undefined) return;
    const shape = at(SHAPE);
    assert.ok(shape >= 0 && shape < first, `${page} loads a UiShape reader (script #${first}) but ui-shape.js is ${shape < 0 ? "absent" : "after it"}`);
  });
}
