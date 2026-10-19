/* renderer-boot-vm.mjs — boot js/render/renderer-boot.js in a Node VM so
 * preference / scrub behaviour can be asserted without quoting its source.
 *
 *   const { api, ls } = bootRendererBoot({ ls: {} });
 *   assert.equal(api.storedBackendPreference().pref, "three");
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "./seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BOOT_SRC = fs.readFileSync(path.join(ROOT, "js/render/renderer-boot.js"), "utf8")
  .replace(/^const\b/gm, "var");

function makeStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}

/** Boot RendererBoot.create(deps) against mocked storage / roster. */
export function bootRendererBoot(opts = {}) {
  const ls = makeStorage(opts.ls || {});
  const ss = makeStorage(opts.ss || {});
  const ctx = vm.createContext({
    localStorage: ls,
    sessionStorage: ss,
    ApexRoster: {
      DEFERRED: opts.deferred !== undefined ? opts.deferred
        : { webgpu: ["js/render/webgpu/wgx.js"], three: ["js/render/three/tlx.js"] },
    },
    ApexXR: opts.xr,
    navigator: opts.navigator || { gpu: { requestAdapter: async () => ({}) } },
    document: {
      createElement: () => ({ rel: "", href: "", crossOrigin: "", setAttribute() {} }),
      head: { appendChild() {} },
      querySelector: () => null,
    },
    window: { dispatchEvent() {} },
    Object, Array, String, Number, Math, Promise,
    setTimeout: opts.setTimeout || ((fn) => { fn(); return 1; }),
    clearTimeout() {},
    requestIdleCallback: undefined,
  });
  seedLog(ctx);
  vm.runInContext(BOOT_SRC, ctx, { filename: "js/render/renderer-boot.js" });
  const RendererBoot = vm.runInContext("RendererBoot", ctx);
  const api = RendererBoot.create({
    $: () => null,
    els: {},
    canvas: {},
    ensureDataHub() {},
    loadBackendScripts: async () => {},
  });
  return { api, ls, ss, ctx, RendererBoot };
}

export { makeStorage };
