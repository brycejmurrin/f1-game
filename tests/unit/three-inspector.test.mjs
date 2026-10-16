/* three-inspector.test.mjs — the opt-in three.js Inspector costs nothing when off.
 *
 * Run: node --test tests/unit/three-inspector.test.mjs   (test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("inspector files are vendored, hash-pinned, and licensed (core only, no extensions)", () => {
  const m = JSON.parse(read("vendor/three-0.186.1/MANIFEST.json"));
  const ins = Object.keys(m.files).filter((f) => f.startsWith("addons/inspector/"));
  assert.ok(ins.includes("addons/inspector/Inspector.js") && ins.includes("addons/inspector/tabs/Memory.js"));
  assert.ok(!ins.some((f) => f.includes("extensions/")), "extensions are not vendored");
  for (const f of ins) {
    const buf = fs.readFileSync(path.join(ROOT, "vendor/three-0.186.1", f));
    assert.equal(crypto.createHash("sha256").update(buf).digest("hex"), m.files[f].sha256, f);
  }
  assert.ok(m.files["LICENSE.txt"]);
});

test("nothing ships the inspector eagerly: sw.js, index.html preloads, ApexRoster.DEFERRED", () => {
  assert.ok(!/inspector\//i.test(read("sw.js")), "sw.js must not precache addons/inspector");
  const html = read("index.html");
  for (const tag of html.match(/<link[^>]*>/g) || []) {
    if (/modulepreload|rel="preload"|rel="prefetch"/.test(tag)) assert.ok(!/inspector/i.test(tag), tag);
  }
  assert.ok(!/addons\/inspector/.test(html.replace(/<script type="importmap">[\s\S]*?<\/script>/, "")), "no static reference");
  assert.ok(!/inspector/i.test(read("js/roster.js").match(/DEFERRED:\s*\{[\s\S]*?\n  \},/)?.[0] || ""), "DEFERRED lists no inspector file");
  assert.ok(!/inspector/i.test(read("js/core/lazy-bundles.js")));
});

function load(search) {
  const dom = [];
  const sb = {
    location: { search },
    Log: { info() {} },
    document: { body: { appendChild: (e) => dom.push(e) }, createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {}, parentNode: null }) },
    window: {},
  };
  vm.createContext(sb);
  vm.runInContext(read("js/perf/three-inspector.js") + "\nthis.TI = ThreeInspector;", sb);
  return sb.TI;
}

test("off by default and on a backend without a three renderer: no import, clear reason", () => {
  const TI = load("");
  assert.equal(TI.wanted(), false);
  assert.equal(load("?inspector=1").wanted(), true);
  assert.equal(load("?inspector=0").wanted(), false);
  const r = TI.set({}, true);   // GLX/WGX façade: no inspectorHost
  assert.equal(r.on, false);
  assert.match(r.reason, /TLX only/);
  assert.equal(TI.set({}, false).on, false);
});

test("hook is wired: tlx holds gpuTimer off for the inspector; apex + help + docs name inspector()", () => {
  const tlx = read("js/render/three/tlx.js");
  assert.match(tlx, /inspectorHost\(\)/);
  assert.match(tlx, /!_inspectorHold/);
  assert.match(read("js/agent/apex.js"), /inspector: \(on\)/);
  assert.match(read("js/agent/agentview.js"), /inspector\(on\)/);
  assert.match(read("docs/DEBUG-HOOKS.md"), /inspector\(/);
  assert.match(read("tools/manifest.cjs"), /js\/perf\/three-inspector\.js/);
});
