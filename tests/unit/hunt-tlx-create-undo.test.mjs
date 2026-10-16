/* hunt-tlx-create-undo.test.mjs — hunt F6 (js/render/three/tlx.js).
 * TLX.create attaches a CanvasCssSize observer plus visibilitychange / pageshow / webglcontextrestored
 * listeners, then keeps booting. When a later step threw (an initOwner superseded mid-boot, a failed
 * init) the catch tore down the renderer but left all four attached to a dead backend.
 * three.js cannot boot in the node VM, so this pins the SOURCE: every attach in create() has an undo
 * registered in _createUndo, and the catch runs the list. Mutate any of the four pushes (or the loop) and it fails. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SRC = await readFile(new URL("../../js/render/three/tlx.js", import.meta.url), "utf8");
const create = SRC.slice(SRC.indexOf("async function create(canvas, opts)"), SRC.indexOf("function disposeKeepingContext"));

test("create() registers an undo for every observer/listener it attaches", () => {
  assert.match(create, /const _createUndo = \[\];/);
  assert.match(create, /_createUndo\.push\(function \(\) \{ cssSizeCache\.dispose\(\); \}\);/, "the CSS-size ResizeObserver");
  assert.match(create, /document\.addEventListener\("visibilitychange", onShown = [\s\S]{0,400}?_createUndo\.push\([^;]*document\.removeEventListener\("visibilitychange", onShown\)/, "visibilitychange");
  assert.match(create, /window\.addEventListener\("pageshow", onPageShow = [\s\S]{0,400}?_createUndo\.push\([\s\S]{0,200}?window\.removeEventListener\("pageshow", onPageShow\)/, "pageshow");
  assert.match(create, /canvas\.addEventListener\("webglcontextrestored", onRestored = function[\s\S]{0,900}?_createUndo\.push\([^;]*removeEventListener\("webglcontextrestored", onRestored, false\)/, "webglcontextrestored");
});

test("the create() catch runs the undo list before it hands the canvas to the fallback", () => {
  const catchAt = create.indexOf("} catch (e) {\n      for (let i = _createUndo.length - 1");
  assert.ok(catchAt > 0, "the outer catch loops _createUndo");
  const body = create.slice(catchAt);
  assert.ok(body.indexOf("_createUndo[i]()") < body.indexOf("disposeKeepingContext(_abortRenderer)"), "undo runs before the renderer dispose and _fail()");
  assert.match(body, /return _fail\(/);
});

test("no bare anonymous addEventListener is left in create() (each attach must be undoable)", () => {
  const adds = create.match(/\.addEventListener\(/g) || [];
  const removes = create.match(/\.removeEventListener\(/g) || [];
  assert.ok(removes.length >= 4, "document, window, canvas undos exist: " + removes.length);
  assert.ok(adds.length > 0);
});
