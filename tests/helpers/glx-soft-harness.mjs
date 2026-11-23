/* glx-soft-harness.mjs — run the REAL js/render/glx/soft.js (GLXSoft) in a VM.
 *
 * soft.js is the GLX software-present path: awaitSoftPresent() waiters, the
 * on-demand readback (PST.readbackLdrPixels) and the PerfGov software-GL UI
 * defer. The harness stubs only what create(deps) and ensureSoftDisplay()
 * touch, and counts what a test asserts on:
 *   reads()    — PST.readbackLdrPixels calls (a real GPU readback)
 *   blitTries()— softBlit entries (deps.getOutFBO is its first read)
 *   pixels     — what a readback writes (bright by default, so a blit lands)
 *
 *   const h = glxSoftHarness({ defer: () => true });
 *   const p = h.soft.awaitSoftPresent(50); h.soft.blitIfDue(); await p;
 */
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "./abs-src.mjs";

export function glxSoftHarness(opts = {}) {
  let reads = 0, blitTries = 0;
  const ctx2d = {
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {},
  };
  const display = { id: "", style: {}, width: 0, height: 0, getContext: () => ctx2d, setAttribute() {} };
  const canvas = { parentNode: { insertBefore() {} }, nextSibling: null };
  const context = {
    document: { createElement: () => display, body: { appendChild() {} } },
    Log: { info() {}, warn() {} },
    setTimeout, clearTimeout, Promise, Uint8Array, Uint8ClampedArray, Math,
  };
  if (opts.defer) context.PerfGov = { softwareGlUiReadbackDefer: opts.defer };
  context.globalThis = context;
  vm.createContext(context);
  const file = "js/render/glx/soft.js";
  vm.runInContext(fs.readFileSync(absSrc(file), "utf8") + "\nglobalThis.GLXSoft = GLXSoft;", context, { filename: absSrc(file) });
  const PST = {
    readbackLdrPixels(buf) { reads++; buf.fill(opts.pixel == null ? 200 : opts.pixel); return true; },
  };
  const soft = context.GLXSoft.create({
    getCanvas: () => canvas,
    getGl: () => ({ drawingBufferWidth: 2, drawingBufferHeight: 2 }),
    getPST: () => PST,
    getOutFBO: () => { blitTries++; return null; },
    ctxGone: () => false,
    getWidth: () => 2, getHeight: () => 2,
  });
  soft.setEnabled(true);
  return { soft, reads: () => reads, blitTries: () => blitTries, display };
}
