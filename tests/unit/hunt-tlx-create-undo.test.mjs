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

// Attaches in create() that are deliberately NOT paired with a remove, keyed
// `target.event:handler`. Each needs its reason; anything else unpaired fails.
const UNPAIRED_OK = new Map([
  // Lives on the GPUDevice itself, which dies with the renderer the catch
  // disposes; guarded by _dev.__apexErrHook so a reused device never doubles it.
  ["_dev.uncapturederror:onErr", "device-lifetime hook"],
  // Marks a texture freed on its own dispose event: texture-lifetime, and the
  // texture is the only thing holding the closure.
  ["t.dispose:<inline>", "texture-lifetime flag"],
]);

/** Every `target.add|removeEventListener("ev", handler` in create(), as
 *  `target.ev:handler`. `onX = function ...` names onX; an inline function or
 *  arrow is `<inline>` (it can never be removed, so it can never pair). */
function listenerSites(kind) {
  const re = new RegExp(`([\\w$.]+)\\.${kind}EventListener\\(\\s*"(\\w+)"\\s*,\\s*([^,)]+)`, "g");
  return [...create.matchAll(re)].map((m) => {
    const target = m[1].split(".").pop();
    let h = m[3].trim();
    const named = h.match(/^([\w$.]+)\s*=\s*(?:function|\()/);
    if (named) h = named[1];
    else if (/^(?:function\b|\(|[\w$]+\s*=>)/.test(h)) h = "<inline>";
    return `${target}.${m[2]}:${h}`;
  });
}

test("every addEventListener in create() is paired with its removeEventListener (same target, event, handler)", () => {
  const adds = listenerSites("add");
  const removes = listenerSites("remove");
  assert.ok(adds.length >= 4, "the listener parse found only " + adds.length + " attaches: " + adds);
  const unpaired = adds.filter((a) => !removes.includes(a) && !UNPAIRED_OK.has(a));
  assert.deepEqual(unpaired, [],
    "create() attaches a listener it never removes — register an undo in _createUndo (or its own self-remove):\n  " +
    unpaired.join("\n  "));
  const paired = adds.filter((a) => !UNPAIRED_OK.has(a));
  const removable = removes.filter((r) => adds.includes(r));
  assert.equal(new Set(paired).size, new Set(removable).size, "adds and removes pair one-for-one");
  for (const k of UNPAIRED_OK.keys()) assert.ok(adds.includes(k), `UNPAIRED_OK entry ${k} is stale: drop it`);
});
