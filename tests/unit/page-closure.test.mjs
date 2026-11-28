// Page closure (#7405 member 1, phase 1 of #7401): every root page that loads js/ files must load a
// provider for each global its scripts read at evaluation time, EARLIER in that page's execution order
// (plain scripts in document order, then `defer` scripts in document order). #7284 shipped overlay.html
// and controller.html without ui-shape.js; only a name-specific test existed. This one is generic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { scanSource, scanRepo } from "../../tools/check/scan-globals.mjs";

const repo = scanRepo();
const moduleGlobals = new Set(repo.assignedBy.keys());
const cache = new Map();
const scanFile = (f) => {
  if (!cache.has(f)) cache.set(f, scanSource(readFileSync(f, "utf8"), f));
  return cache.get(f);
};

/** js/ script srcs of a page's HTML in execution order: plain (non-defer, non-module) first, then defer. */
export function pageScripts(html) {
  const plain = [], deferred = [];
  for (const m of html.matchAll(/<script\b([^>]*)>/g)) {
    const attrs = m[1];
    const src = /\bsrc="([^"?]+)/.exec(attrs);
    if (!src || /\btype="module"/.test(attrs) || /\basync\b/.test(attrs)) continue;
    const f = src[1].replace(/^\.?\//, "");
    if (!f.startsWith("js/")) continue;
    (/\bdefer\b/.test(attrs) ? deferred : plain).push(f);
  }
  return [...plain, ...deferred];
}

/** Violations: [file, name] where file eval-reads a module global no earlier script on the page assigns. */
export function closureViolations(order, scan = scanFile, known = () => false) {
  const out = [];
  const seen = new Set();
  for (const f of order) {
    const rec = scan(f);
    for (const nm of rec.evalReads) {
      if (!moduleGlobals.has(nm) || rec.assigns.has(nm) || seen.has(nm) || known(f, nm)) continue;
      out.push({ file: f, name: nm });
    }
    for (const nm of rec.assigns) seen.add(nm);
  }
  return out;
}

// Names the scanner reports as unguarded load-time reads though the source guards them with
// `typeof X === "undefined" ? … : X…` (js/ui/screen-regions.js:49) or `typeof X !== "undefined" && X…`
// (js/input/touch-button-actions.js:122, where GameStore loads later on controller.html). May only shrink;
// the scanner fix (tools/check/scan-globals.mjs) is outside this PR's paths.
const TYPEOF_GUARDED = new Set(["js/ui/screen-regions.js:SettingsNav", "js/input/touch-button-actions.js:GameStore"]);
const known = (f, nm) => TYPEOF_GUARDED.has(`${f}:${nm}`);

const PAGES = ["controller.html", "overlay.html", "cockpit-view.html"];
const tracked = new Set(execFileSync("git", ["ls-files", "*.html"], { encoding: "utf8" }).split("\n"));

for (const page of PAGES) {
  test(`${page}: every eval-time global read has an earlier provider on the page`, () => {
    assert.ok(tracked.has(page) && existsSync(page), `${page} is not tracked`);
    const order = pageScripts(readFileSync(page, "utf8"));
    assert.ok(order.length > 1, `${page}: no js/ scripts found`);
    for (const f of order) assert.ok(existsSync(f), `${page} loads missing ${f}`);
    assert.deepEqual(closureViolations(order, scanFile, known).map((v) => `${v.file} reads ${v.name}`), [],
      `${page}: a script reads a global at load that no earlier script on this page provides (ReferenceError on that page)`);
  });
}

test("the UiShape page-load case (#7259/#7284): screen-placement.js needs ui-shape.js earlier", () => {
  for (const page of ["controller.html", "overlay.html"]) {
    const order = pageScripts(readFileSync(page, "utf8"));
    const shape = order.indexOf("js/ui/ui-shape.js"), reader = order.indexOf("js/ui/screen-placement.js");
    assert.ok(shape >= 0 && shape < reader, `${page}: ui-shape.js must load before screen-placement.js`);
  }
});

test("bites: removing ui-shape.js from the controller roster fails, naming UiShape and screen-placement.js", () => {
  const order = pageScripts(readFileSync("controller.html", "utf8")).filter((f) => f !== "js/ui/ui-shape.js");
  const v = closureViolations(order, scanFile, known);
  assert.ok(v.some((x) => x.file === "js/ui/screen-placement.js" && x.name === "UiShape"), JSON.stringify(v));
});

test("the typeof-guarded exemption list only shrinks: each entry is still reported by the scanner", () => {
  for (const key of TYPEOF_GUARDED) {
    const [f, nm] = key.split(":");
    assert.ok(scanFile(f).evalReads.has(nm), `${key} no longer reported: drop it from TYPEOF_GUARDED`);
  }
});
