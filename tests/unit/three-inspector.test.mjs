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

function load(search, { hostname = "localhost", protocol = "http:", webdriver = false, store = {} } = {}) {
  const disk = new Map(Object.entries(store));
  const sb = {
    location: { search, hostname, protocol },
    navigator: { webdriver },
    localStorage: { getItem: (k) => (disk.has(k) ? disk.get(k) : null), setItem: (k, v) => disk.set(k, String(v)) },
    Log: { info() {} },
    document: { body: { appendChild() {} }, createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {}, parentNode: null }) },
    window: {},
  };
  vm.createContext(sb);
  vm.runInContext(read("js/perf/three-inspector.js") + "\nthis.TI = ThreeInspector;", sb);
  sb.disk = disk;
  return sb;
}

test("host matrix: dev hosts default ON, deployed site and automation OFF, URL and storage override", () => {
  const on = (search, o) => load(search, o).TI.wanted();
  for (const hostname of ["localhost", "127.0.0.1", "::1"]) assert.equal(on("", { hostname }), true, hostname);
  assert.equal(on("", { hostname: "", protocol: "file:" }), true, "file: origin");
  assert.equal(on("", { hostname: "brycejmurrin.github.io", protocol: "https:" }), false, "deployed site");
  assert.equal(on("", { webdriver: true }), false, "Playwright on 127.0.0.1 stays off (zero test churn)");
  assert.equal(on("?inspector=0"), false);
  assert.equal(on("?inspector=1", { hostname: "brycejmurrin.github.io", protocol: "https:" }), true);
  assert.equal(on("?inspector=1", { webdriver: true }), true);
  assert.equal(on("", { store: { "apex26.inspector": "0" } }), false, "stored 0 beats the dev default");
  assert.equal(on("", { hostname: "x.github.io", store: { "apex26.inspector": "1" } }), true, "stored 1 beats the deployed default");
  const sb = load("?inspector=0"); sb.TI.wanted();
  assert.equal(sb.disk.get("apex26.inspector"), "0", "an explicit URL choice is remembered");
});

test("off by default under automation and on a backend without a three renderer: no import, clear reason", () => {
  const TI = load("", { webdriver: true }).TI;
  assert.equal(TI.wanted(), false);
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
