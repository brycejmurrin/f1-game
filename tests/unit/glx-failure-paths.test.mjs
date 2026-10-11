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
