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
import { absSrc } from "../helpers/abs-src.mjs";
import { WebGPURenderer, InspectorBase } from "../../vendor/three-0.187.0/three.webgpu.min.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("inspector files are vendored, hash-pinned, and licensed (core only, no extensions)", () => {
  const m = JSON.parse(read("vendor/three-0.187.0/MANIFEST.json"));
  const ins = Object.keys(m.files).filter((f) => f.startsWith("addons/inspector/"));
  assert.ok(ins.includes("addons/inspector/Inspector.js") && ins.includes("addons/inspector/tabs/Memory.js"));
  assert.ok(!ins.some((f) => f.includes("extensions/")), "extensions are not vendored");
  for (const f of ins) {
    const buf = fs.readFileSync(path.join(ROOT, "vendor/three-0.187.0", f));
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

function load(search, { hostname = "localhost", protocol = "http:", webdriver = false, store = {}, importInspector, document } = {}) {
  const disk = new Map(Object.entries(store));
  const sb = {
    location: { search, hostname, protocol },
    navigator: { webdriver },
    localStorage: { getItem: (k) => (disk.has(k) ? disk.get(k) : null), setItem: (k, v) => disk.set(k, String(v)) },
    Log: { info() {} },
    document: document || { body: { appendChild() {} }, createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {}, parentNode: null }) },
    __importInspector: importInspector || (() => Promise.reject(new Error("unexpected inspector import"))),
    window: {},
  };
  vm.createContext(sb);
  // Inject the asynchronous module boundary, preserving the real lifecycle code and the installed renderer setter.
  const source = read("js/perf/three-inspector.js").replace("await import(URL_ID)", "await __importInspector(URL_ID)");
  vm.runInContext(source + "\nthis.TI = ThreeInspector;", sb, { filename: absSrc("js/perf/three-inspector.js") });
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

function lifecycle({ fail = null, timestamp = false } = {}) {
  const nodes = [], instances = [], holds = [];
  const body = {
    appendChild(n) { if (fail === "append") throw new Error("append failed"); nodes.push(n); n.parentNode = this; },
    removeChild(n) { nodes.splice(nodes.indexOf(n), 1); n.parentNode = null; },
  };
  const document = { body, createElement() {
    return { style: {}, parentNode: null, listeners: {}, setAttribute() {}, addEventListener(name, fn) { this.listeners[name] = fn; } };
  } };
  class Inspector extends InspectorBase {
    constructor() {
      super();
      if (fail === "constructor") throw new Error("constructor failed");
      this.domElement = document.createElement();
      this.detached = 0;
      instances.push(this);
    }
    setRenderer(r) {
      super.setRenderer(r);
      if (!r) this.detached++;
      else { r.backend.trackTimestamp = true; if (fail === "attach") throw new Error("attach failed"); }
      return this;
    }
  }
  const renderer = Object.create(WebGPURenderer.prototype);
  const base = new InspectorBase();
  renderer._inspector = base;
  base.setRenderer(renderer);
  renderer.backend = { trackTimestamp: timestamp };
  const host = { renderer, hold(on) { holds.push(on); } };
  const gfx = { inspectorHost: () => host };
  const sb = load("", { document, importInspector: async () => ({ Inspector }) });
  return Object.assign(sb, { renderer, base, gfx, host, instances, nodes, holds, Inspector });
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

test("closing the inspector restores the actual r186 InspectorBase and timestamp state", async () => {
  for (const timestamp of [false, true]) {
    const f = lifecycle({ timestamp });
    for (let i = 0; i < 3; i++) {
      f.TI.set(f.gfx, true);
      await settle();
      assert.equal(f.renderer.inspector, f.instances[i]);
      assert.equal(f.renderer.backend.trackTimestamp, true);
      // Exercise the real close button callback as well as the public stop/toggle paths.
      if (i === 0) f.nodes[0].listeners.click();
      else if (i === 1) f.TI.stop();
      else f.TI.set(f.gfx, false);
      assert.equal(f.renderer.inspector, f.base);
      assert.equal(f.base.getRenderer(), f.renderer);
      assert.equal(f.renderer.backend.trackTimestamp, timestamp);
      assert.equal(f.instances[i].detached, 1);
      assert.equal(f.nodes.length, 0);
      assert.doesNotThrow(() => { f.renderer.inspector.begin(); f.renderer.inspector.finish(); });
    }
    f.TI.set(f.gfx, false);
    assert.equal(f.renderer.inspector, f.base, "repeated close is harmless");
    assert.deepEqual(f.holds, [true, false, true, false, true, false]);
  }
});

test("initialization failures return renderer ownership and release the timer hold", async () => {
  for (const fail of ["constructor", "attach", "append"]) {
    const f = lifecycle({ fail });
    f.TI.set(f.gfx, true);
    await settle();
    assert.equal(f.TI.status().on, false, fail);
    assert.match(f.TI.status().reason, /init failed/, fail);
    assert.equal(f.renderer.inspector, f.base, fail);
    assert.equal(f.renderer.backend.trackTimestamp, false, fail);
    assert.deepEqual(f.holds, [true, false], fail);
  }
});

test("teardown preserves an inspector installed by a later owner", async () => {
  const f = lifecycle();
  f.TI.set(f.gfx, true);
  await settle();
  const replacement = new InspectorBase();
  f.renderer.inspector = replacement;
  f.renderer.backend.trackTimestamp = true;
  f.TI.set(f.gfx, false);
  assert.equal(f.renderer.inspector, replacement);
  assert.equal(replacement.getRenderer(), f.renderer);
  assert.equal(f.renderer.backend.trackTimestamp, true);
  assert.equal(f.instances[0].detached, 1, "the replacement already detached the panel");
  assert.deepEqual(f.holds, [true, false]);
});

test("switching renderer or unsupported backend detaches the previous panel", async () => {
  const a = lifecycle(), b = lifecycle();
  a.TI.set(a.gfx, true);
  await settle();
  a.TI.set(b.gfx, true);
  await settle();
  assert.equal(a.renderer.inspector, a.base);
  assert.equal(a.renderer.backend.trackTimestamp, false);
  assert.notEqual(b.renderer.inspector, b.base);
  a.TI.set({}, true);
  assert.equal(b.renderer.inspector, b.base);
  assert.equal(b.renderer.backend.trackTimestamp, false);
  assert.equal(a.TI.status().supported, false);
  assert.deepEqual(a.holds, [true, false]);
  assert.deepEqual(b.holds, [true, false]);
});

test("an import resolving after close cannot reattach or claim a timer hold", async () => {
  const f = lifecycle();
  let resolve;
  f.__importInspector = () => new Promise(r => { resolve = r; });
  f.TI.set(f.gfx, true);
  f.TI.set(f.gfx, false);
  resolve({ Inspector: f.Inspector });
  await settle();
  assert.equal(f.renderer.inspector, f.base);
  assert.equal(f.TI.status().on, false);
  assert.equal(f.instances.length, 0);
  assert.deepEqual(f.holds, []);
});

test("a stale import rejection cannot overwrite a newer attached inspector", async () => {
  const f = lifecycle();
  let reject, n = 0;
  f.__importInspector = () => ++n === 1 ? new Promise((_, r) => { reject = r; }) : Promise.resolve({ Inspector: f.Inspector });
  f.TI.set(f.gfx, true);
  f.TI.set(f.gfx, true);
  await settle();
  reject(new Error("stale import failed"));
  await settle();
  assert.equal(f.TI.status().on, true);
  assert.equal(f.TI.status().reason, "on");
  assert.equal(f.renderer.inspector, f.instances[0]);
  f.TI.set(f.gfx, false);
});
