/* boot-load-budget.test.mjs — the boot wall's budget: what index.html makes EVERY visit parse before the title,
 * and how many GPU-process adapter round trips the renderer boot may spend on its critical path.
 *
 * A·H15 load hunt (2026-10-24, docs/notes/LOAD-HUNT-2026-10-24.md). The lazy groups are the boot wins of
 * earlier hunts: the three island (DEFERRED, ~1.1 MB), the track-build toolkit (LAZY_TRACK_BUILD, ~535 KB), the
 * scenery closures (LAZY_SCENERY, 1,083 KB), audio, data, net, agent. Each one back on a <script> tag is parse and
 * eval on every boot, which a functional test never notices. The ceilings sit a few percent over the measured
 * shell (304 tags, 7.80 MB raw on 2026-10-24): ordinary growth fits, a whole lazy group does not. Raising one is
 * a decision — say why in the commit, the way a ratchet raise does.
 *
 * 2026-10-28: tip 320 → 321 (GarageCrewDraw / js/garage/crew-draw.js) → 323 with #4056's OverlayBridge +
 * OverlayPublisher (~9.5 KB) so the game page can hear overlay.html heartbeats without growing game.js.
 * Bytes stay under the 8.2 MB ceiling.
 *
 * Run: node --test tests/unit/boot-load-budget.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
const manifest = createRequire(import.meta.url)("../../tools/manifest.cjs");

// 323: tip's crew-draw (321) + OverlayBridge + OverlayPublisher (#4056).
const MAX_EAGER_SCRIPTS = 323;
const MAX_EAGER_BYTES = 8_200_000;

function eagerScripts() {
  const html = read("index.html").replace(/<!--[\s\S]*?-->/g, "");
  return [...html.matchAll(/<script\b[^>]*\bsrc="([^"?#]+)/g)].map((m) => m[1]).filter((s) => !/^https?:/.test(s));
}

test("the eager shell stays inside its script budget (count and raw bytes)", () => {
  const files = eagerScripts();
  const bytes = files.reduce((n, f) => n + statSync(new URL(f, ROOT)).size, 0);
  assert.ok(files.length <= MAX_EAGER_SCRIPTS, `index.html loads ${files.length} scripts at boot (budget ${MAX_EAGER_SCRIPTS})`);
  assert.ok(bytes <= MAX_EAGER_BYTES, `index.html boots ${bytes} raw bytes of script (budget ${MAX_EAGER_BYTES}) — lazy-load it, or raise the budget with a reason`);
});

test("no lazy or deferred group is back on the boot wall", () => {
  const eager = new Set(eagerScripts());
  const lazy = [];
  for (const [k, v] of Object.entries(manifest)) {
    if (!/^(LAZY_|DEFERRED$)/.test(k) || /_EDGES$/.test(k)) continue;
    const list = Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v).flat() : [];
    for (const f of list) if (typeof f === "string" && /\.js$/.test(f)) lazy.push([k, f]);
  }
  assert.ok(lazy.length > 20, "the manifest's lazy groups were read (" + lazy.length + " files)");
  const back = lazy.filter(([, f]) => eager.has(f)).map(([k, f]) => k + ": " + f);
  assert.deepEqual(back, [], "a lazy file has an eager <script> tag again");
});

test("the renderer boot spends at most one adapter request before Gfx.create, for every pick", async () => {
  // start()'s critical path to the backend bind: the eval-time request (kickEarlyAdapter) is consumed by the
  // unset/WGX probe or handed to TLX for an explicit THREE pick; a second request here is a serial GPU-process
  // round trip on every boot (three's own adapter inside WebGPURenderer is tlx.js's, outside this budget).
  const src = read("js/render/renderer-boot.js");
  for (const stored of [null, "three", "webgpu"]) {
    let asked = 0;
    const ls = new Map(stored ? [["apex26.gfxBackend", stored]] : []);
    const ctx = vm.createContext({
      Promise,
      ApexRoster: { DEFERRED: { three: ["tlx.js"], webgpu: ["wgx.js"], webgl2: ["glx.js"] } },
      localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
      sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      ApexXR: { bootPick: () => null, detect: async () => {} },
      navigator: { gpu: { requestAdapter: async () => { asked++; return { tag: "a" }; } } },
      location: { reload() {} },
      document: { createElement: () => ({}), head: { appendChild() {} } },
      Event: class { constructor(type) { this.type = type; } },
      GLX: { init: () => true },
      RendererPicker: { showUnavailable() {} },
      Gfx: { create: async () => ({ api: stored || "three" }) },
      Log: { warn() {}, info() {} },
      setTimeout: () => 0, clearTimeout() {},
    });
    ctx.window = ctx;
    ctx.dispatchEvent = () => true;
    vm.runInContext(src.replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/render/renderer-boot.js") });
    const rb = vm.runInContext("RendererBoot", ctx).create({ $: () => null, els: {}, canvas: {}, ensureDataHub() {}, loadBackendScripts: async () => {} });
    const r = await rb.start();
    assert.equal(r.bound, true, (stored || "unset") + ": bound");
    assert.ok(asked <= 1, (stored || "unset") + ": " + asked + " adapter requests on the boot path (budget 1)");
  }
});
