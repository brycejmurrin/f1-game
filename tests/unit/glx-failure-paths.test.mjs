/* glx-failure-paths — a throw inside a GLX entry point must not leave GL state stuck.
 *
 * R2-GW-2: createTexture() sets UNPACK_FLIP_Y / PREMULTIPLY true around texImage2D; a throw left both set and
 *   leaked the GL texture.
 *
 * Harness: tests/helpers/glx-mock.mjs (the real glx.js against a recording WebGL2 mock).
 * Run: node --test tests/unit/glx-failure-paths.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootGlx } from "../helpers/glx-mock.mjs";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

test("reflected draws correct facing with culling disabled and restore the following draw", () => {
  const h = bootGlx(), seen = [];
  let facing = h.gl.CCW, culling = true;
  h.answers.frontFace = (mode) => { facing = mode; };
  h.answers.enable = (mode) => { if (mode === h.gl.CULL_FACE) culling = true; };
  h.answers.disable = (mode) => { if (mode === h.gl.CULL_FACE) culling = false; };
  h.answers.drawElements = () => seen.push({ facing, culling });
  const mesh = { vao: {}, count: 3, indexType: h.gl.UNSIGNED_SHORT };
  const model = [...IDENTITY];
  h.GLX.begin(h.frame()); h.reset();
  h.GLX.draw(mesh, model);
  assert.equal(h.count("frontFace"), 0, "positive determinant adds no facing calls");
  model[0] = -1;
  h.GLX.draw(mesh, model, { doubleSided: true });
  assert.deepEqual(seen[1], { facing: h.gl.CW, culling: false }, "double-sided reflected draw keeps outward faces front-facing");
  assert.equal(facing, h.gl.CCW, "reflected draw restores the renderer default");
  model[0] = 1;
  h.GLX.draw(mesh, model);
  assert.deepEqual(seen[2], { facing: h.gl.CCW, culling: true }, "following draw inherits normal facing and culling");
  assert.equal(h.count("frontFace"), 2, "only the reflected draw changes facing");
  model[0] = -1; model[5] = -1;
  h.GLX.draw(mesh, model);
  assert.equal(h.count("frontFace"), 2, "two reflected axes preserve orientation");
});

test("a throwing reflected draw restores counter-clockwise facing", () => {
  const h = bootGlx();
  let facing = h.gl.CCW;
  h.answers.frontFace = (mode) => { facing = mode; };
  h.answers.drawElements = () => { assert.equal(facing, h.gl.CW); throw new Error("draw fault"); };
  const model = [...IDENTITY]; model[0] = -1;
  const mesh = { vao: {}, count: 3, indexType: h.gl.UNSIGNED_SHORT };
  h.GLX.begin(h.frame()); h.reset();
  assert.throws(() => h.GLX.draw(mesh, model), /draw fault/);
  assert.equal(facing, h.gl.CCW);
  assert.deepEqual(h.calls.filter(([name]) => name === "frontFace").map(([, args]) => args[0]), [h.gl.CW, h.gl.CCW]);
});

test("R2-GW-2: createTexture resets the UNPACK flags and deletes the texture when texImage2D throws", () => {
  const h = bootGlx();
  h.answers.texImage2D = () => { throw new Error("closed ImageBitmap"); };
  h.reset();
  let r = "unset";
  try { r = h.GLX.createTexture({}); } catch (e) { r = "threw"; }
  assert.ok(r === null || r === "threw", "no texture handle is returned for a failed upload");
  const flags = h.calls.filter((c) => c[0] === "pixelStorei" &&
    (c[1][0] === h.enums.UNPACK_FLIP_Y_WEBGL || c[1][0] === h.enums.UNPACK_PREMULTIPLY_ALPHA_WEBGL));
  const last = (e) => [...flags].reverse().find((c) => c[1][0] === e);
  assert.equal(last(h.enums.UNPACK_FLIP_Y_WEBGL)[1][1], false, "FLIP_Y must end false");
  assert.equal(last(h.enums.UNPACK_PREMULTIPLY_ALPHA_WEBGL)[1][1], false, "PREMULTIPLY must end false");
  assert.equal(h.count("deleteTexture"), h.count("createTexture") || 1, "the texture is deleted");
});

test("storage-denied context losses keep the two-reload budget across page boots", () => {
  let inheritedName = "";
  for (let loss = 1; loss <= 3; loss++) {
    const h = bootGlx(), overlays = [];
    h.sandbox.name = inheritedName;
    h.sandbox.__apexErrors = [];
    h.sandbox.sessionStorage.getItem = h.sandbox.sessionStorage.setItem = () => { throw new Error("storage denied"); };
    h.sandbox.__apexReportError = (_kind, error) => overlays.push(error.message);
    let reloads = 0;
    h.sandbox.location.reload = () => { reloads++; };
    // A boot timer is not a clean race: the marker must survive every boot callback.
    for (const timer of h.sandbox.__timers.splice(0)) timer();
    h.loseContext();
    inheritedName = h.sandbox.name;
    assert.equal(inheritedName, "apex26.ctxLostReloads=" + loss);
    for (const timer of h.sandbox.__timers.splice(0)) timer();
    assert.equal(reloads, loss <= 2 ? 1 : 0, "only the first two boots automatically reload");
    h.restoreContext();
    assert.equal(reloads, loss <= 2 ? 2 : 0, "restore obeys the same exhausted budget");
    assert.equal(overlays.length, 0, "past the budget: ring only, not the full-screen overlay hook");
    assert.equal(h.sandbox.__apexErrors.length, loss > 2 ? 1 : 0);
    if (loss > 2) assert.match(h.sandbox.__apexErrors[0].msg, /3 times/);
  }
});

test("GLX boot retains its retry marker until an explicit clean boundary", () => {
  for (const [before, count, after] of [
    ["apex26.ctxLostReloads=2", 2, ""],
    ["race-window\napex26.ctxLostReloads=2", 2, "race-window"],
    ["race-window", 0, "race-window"],
    ["apex26XctxLostReloads=2", 0, "apex26XctxLostReloads=2"],
    ["apex26.ctxLostReloads=x", 0, "apex26.ctxLostReloads=x"],
  ]) {
    const h = bootGlx();
    h.sandbox.name = before;
    const budget = h.sandbox.GfxEscalation;
    assert.equal(typeof budget.resetReloadBudget, "function", "the real shared owner is loaded");
    for (const timer of h.sandbox.__timers.splice(0)) timer();
    assert.equal(h.sandbox.name, before, "boot callbacks cannot clear a recovery episode");
    assert.equal(budget.reloadCount(), count);
    budget.resetReloadBudget();
    assert.equal(h.sandbox.name, after, "clean boundary removes only the owned suffix");
    assert.equal(budget.reloadCount(), 0);
    assert.equal(h.sandbox.sessionStorage.getItem("apex26.ctxLostReloads"), null);
    assert.equal(budget.nextReloadCount(), 1, "a clean race restores the first recovery attempt");
    assert.equal(h.sandbox.sessionStorage.getItem("apex26.ctxLostReloads"), "1");
  }
});
