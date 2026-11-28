// The real TLXUtil (js/render/three/tlx-util.js) for VM sandboxes: every TLX release goes through
// TLXUtil.releaseObject / dropRenderObject / safeDispose (#7334), read at call time, so a test that loads a TLX file
// (or slices a function out of one) by hand seeds this first. seedTlxUtil(ctx) for a sandbox object or context;
// seedTlxUtil() for runInThisContext and new Function.
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "./abs-src.mjs";

const REL = "js/render/three/tlx-util.js";
const SRC = fs.readFileSync(new URL("../../" + REL, import.meta.url), "utf8");
let _own = null;

// Evaluated in THIS realm inside a function scope: no global `const TLXUtil` binding to collide with a test that
// runs tlx-util.js itself, and the objects it builds (the { type: "dispose" } event) are this realm's, so
// deepStrictEqual against a literal holds.
export function tlxUtil() {
  if (_own) return _own;
  return (_own = vm.runInThisContext("(function () {\n" + SRC + "\nreturn TLXUtil;\n})", { filename: absSrc(REL) })());
}

export function seedTlxUtil(target) {
  const t = target || globalThis;
  if (!t.TLXUtil) t.TLXUtil = tlxUtil();
  return t.TLXUtil;
}

// A sandbox object with the real TLXUtil added (returns the same object), for vm.createContext / runInNewContext.
export function withTlxUtil(sandbox) {
  seedTlxUtil(sandbox);
  return sandbox;
}
