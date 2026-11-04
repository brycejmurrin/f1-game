/* game-boot-vm.mjs — boot the REAL js/game.js in a Node VM up to its renderer
 * pick, so a test asserts what the boot DOES (reloads, latches, storage) instead
 * of quoting its source (#1682, #4878).
 *
 * renderer-boot-vm.mjs binds renderer-boot.js on its own; this one runs the
 * whole FULL manifest through js/game.js (tools/lib/game-vm.cjs bootShell), so
 * the path under test is game.js's own `RendererBoot.create(...).start()` with
 * the real lazy-bundles script loader behind it. What is stubbed, and why:
 *
 *   Gfx.create / createInitOwner   the deferred backend (TLX/WGX) cannot load in
 *                                  Node; opts.create(canvas, o) answers instead
 *                                  (default: null = "create() refused") and
 *                                  opts.claimed says whether it took the canvas
 *   ApexRoster.DEFERRED.three/webgpu  one inert fixture file
 *                                  (tests/fixtures/gfx-boot/refusing-backend.js),
 *                                  so the fetch settles without the three island
 *   GLX.init                       returns opts.glxInit (default true); false is
 *                                  "the canvas was already claimed"
 *   navigator.gpu                  present with a resolving adapter unless gpu:false
 *   location.reload                counted, never navigates
 *   localStorage / sessionStorage  raw strings from opts.ls / opts.ss (no JSON,
 *                                  no apex26. prefixing — gfx keys are raw);
 *                                  ssBlocked:true makes sessionStorage.setItem a
 *                                  silent no-op (Safari private mode)
 *
 *   const b = await bootGame({ ls: {}, glxInit: false });
 *   b.reloads          // 1 — the claim-fail reload fired once
 *   b.ss.getItem("apex26.gfxClaimFail")   // "1"
 *   b.bootResult       // what game.js's async IIFE resolved to (it `return`s early)
 *   b.G                // null unless the boot got as far as ApexApi.create(G)
 *
 * The returned `G` is the façade game.js hands ApexApi.create — observable only
 * when the boot gets that far; refused-renderer boots return before it exists,
 * and their evidence is the storage and counters above. No browser, no GPU.
 */
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const { bootShell, settle } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));
const MANIFEST = require(path.join(ROOT, "tools/manifest.cjs"));
const FIXTURE = "tests/fixtures/gfx-boot/refusing-backend.js";

/** Boot js/game.js to its renderer verdict. Resolves once the game IIFE settles (or `waitTurns` pass). */
export async function bootGame(opts = {}) {
  const counts = { reloads: 0, creates: [], glxInits: 0, initOwners: 0 };
  let G = null;
  const shell = bootShell({
    onSandbox(sb) {
      for (const [k, v] of Object.entries(opts.ls || {})) sb.localStorage.setItem(k, v);
      for (const [k, v] of Object.entries(opts.ss || {})) sb.sessionStorage.setItem(k, v);
      if (opts.ssBlocked) sb.sessionStorage.setItem = () => {};
      if (opts.gpu !== false) sb.navigator.gpu = { requestAdapter: async () => ({ info: {}, limits: {}, features: new Set() }) };
      sb.location.reload = () => { counts.reloads++; };
      sb.GLX.init = () => { counts.glxInits++; return opts.glxInit !== false; };
    },
    afterFile(rel, ctx) {
      if (rel === "js/roster.js") {
        const R = ctx.ApexRoster;
        ctx.ApexRoster = Object.freeze(Object.assign({}, R,
          { DEFERRED: Object.freeze(Object.assign({}, R.DEFERRED, { three: [FIXTURE], webgpu: [FIXTURE] })) }));
      } else if (rel === "js/render/gfx.js") {
        ctx.Gfx = Object.assign({}, ctx.Gfx, {
          createInitOwner: () => { counts.initOwners++; return { claimed: !!opts.claimed, abort() {} }; },
          create: async (canvas, o) => { counts.creates.push(o && o.backend); return opts.create ? opts.create(canvas, o) : null; },
        });
      }
    },
    // apex.js is LAZY_AGENT: game.js injects it, so it arrives through onScript, not afterFile.
    onScript(rel, ctx) {
      if (rel !== MANIFEST.PATHS.APEX_API || !ctx.ApexApi) return;
      const orig = ctx.ApexApi.create;
      ctx.ApexApi.create = function (g) { G = g; return orig.apply(this, arguments); };
    },
  });
  let settled = false, bootResult, bootError = null;
  Promise.resolve(shell.boot).then((v) => { bootResult = v; settled = true; }, (e) => { bootError = e; settled = true; });
  await settle(() => settled, opts.waitTurns || 4000);
  shell.close();
  const { sandbox } = shell;
  return {
    ...counts, settled, bootResult, bootError, get G() { return G; },
    ls: sandbox.localStorage, ss: sandbox.sessionStorage, sandbox, ctx: shell.ctx, record: shell.record,
  };
}
