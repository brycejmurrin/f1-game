/* cam-motion.test.mjs — each camera's live motion has its own signature. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCamMotion } from "../../tools/shot/cam-motion.mjs";

test("each camera moves differently through speed, a turn, a brake, and a slide", () => {
  const r = checkCamMotion();
  assert.equal(r.ok, true, r.failures.join("\n"));
  assert.equal(r.rows.length, 18);
});
