/* xr-backend-pin — ENTER VR's renderer switch lasts one boot (R3-PERSISTENCE-2).
 *
 * On a renderer that cannot attach an XRWebGLLayer (GLX, WGX, TLX-WebGPU),
 * XrBoot.ensureXrBackend pins apex26.gfxBackend=three + tlxForceGL=1 and
 * reloads. Nothing ever wrote the player's pick back, so after the headset
 * session the flat game stayed on TLX-WebGL2 for good and a WebGPU player had
 * silently lost WebGPU (scratch/hunt3-persistence/p2-xr-backend-pin.cjs). The
 * pick is now stashed and restored by mountUi() — after the pinned boot has
 * read it. Real xr-boot.js in a VM over a Map-backed localStorage.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

function page(store) {
  const ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  let reloads = 0;
  const ctx = vm.createContext({ localStorage: ls, location: { reload() { reloads++; } }, setTimeout, clearTimeout, JSON, Promise });
  seedLog(ctx);
  vm.runInContext(read("js/xr/xr-boot.js").replace(/^const\b/gm, "var"), ctx, { filename: "xr-boot.js" });
  return { XrBoot: ctx.XrBoot, reloads: () => reloads };
}
const snap = (m) => Object.fromEntries([...m].filter(([k]) => k !== "apex26.xrEnterPending").sort());

for (const [label, before] of [
  ["a GLX player", { "apex26.gfxBackend": "webgl2" }],
  ["a WGX (WebGPU) player", { "apex26.gfxBackend": "webgpu", "apex26.tlxForceGL": "0" }],
  ["a player on the defaults (both unset)", {}],
]) {
  test(`ENTER VR on ${label}: the pinned boot runs TLX-WebGL2, the next boot is the player's own pick`, () => {
    const store = new Map(Object.entries(before));
    const flat = page(store);
    const gate = flat.XrBoot.ensureXrBackend();          // unbound: canAttach() is false
    assert.deepEqual({ ...gate }, { ok: false, reloading: true });
    assert.equal(flat.reloads(), 1);
    assert.equal(store.get("apex26.gfxBackend"), "three", "the reload boots TLX");
    assert.equal(store.get("apex26.tlxForceGL"), "1", "on three's WebGL2 path");
    flat.XrBoot.ensureXrBackend();                        // a second click before the reload lands
    // The reloaded page: renderer-boot read the pin above; then game.js mounts XR.
    const vr = page(store);
    vr.XrBoot.mountUi();
    assert.deepEqual(snap(store), before, "the 2D pick is back exactly (unset stays unset)");
    assert.equal(store.get("apex26.xrEnterPending"), "1", "the auto-enter request is untouched");
  });
}

test("no stash, nothing restored; a corrupt stash is dropped without touching the pick", () => {
  const store = new Map([["apex26.gfxBackend", "webgl2"]]);
  assert.equal(page(store).XrBoot.restorePinnedBackend(), false);
  assert.deepEqual(snap(store), { "apex26.gfxBackend": "webgl2" });
  store.set("apex26.xrPrevBackend", "{not json");
  assert.equal(page(store).XrBoot.restorePinnedBackend(), true);
  assert.deepEqual(snap(store), { "apex26.gfxBackend": "webgl2" });
});


test('armed retained-capability ENTER uses the reversible pin instead of a reload dead end', async () => {
  const store = new Map([['apex26.gfxBackend', 'webgl2'], ['apex26.xr', '1'], ['apex26.xrCaps', '1']]);
  const h = page(store);
  let starts = 0;
  const ctx = vm.createContext({
    XrBoot: h.XrBoot,
    XrSession: { isPresenting: () => false, start: async () => { starts++; } },
    ApexXR: { plan: () => ({ xrMode: 'armed', path: 'webgl2' }), rendererMatchesPlan: () => false },
    document: { createElement: () => ({ setAttribute() {}, addEventListener() {} }) },
    setTimeout: () => 1, clearTimeout() {},
  });
  vm.runInContext(read('js/xr/xr-ui.js').replace(/^const\b/gm, 'var'), ctx);
  await ctx.XrUi.onClick();
  assert.equal(h.reloads(), 1);
  assert.equal(starts, 0);
  assert.equal(store.get('apex26.gfxBackend'), 'three');
  assert.equal(store.get('apex26.tlxForceGL'), '1');
  h.XrBoot.restorePinnedBackend();
  assert.equal(store.get('apex26.gfxBackend'), 'webgl2');
  assert.equal(store.get('apex26.xr'), '1');
});
