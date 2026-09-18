/* GhostShare codec contract.
 *
 * Run: node --test tests/unit/ghost-share.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const GhostShare = require("../../js/car/ghost-share.js");
const { CIRCUITS } = require("../../tools/manifest.cjs");
const ghost = JSON.parse(fs.readFileSync(
  new URL("../fixtures/ghost-monza-short.json", import.meta.url), "utf8"));

test("encode/decode round-trip preserves lap time and sample lengths", () => {
  const payload = GhostShare.encode("monza", ghost);
  const decoded = GhostShare.decode(payload, CIRCUITS);

  assert.equal(decoded.ok, true);
  assert.equal(decoded.trackId, "monza");
  assert.equal(decoded.ghost.time, ghost.time);
  assert.equal(decoded.ghost.t.length, ghost.t.length);
  assert.equal(decoded.ghost.s.length, ghost.s.length);
  assert.equal(decoded.ghost.x.length, ghost.x.length);
});

test("decode reports a corrupt payload without throwing", () => {
  assert.deepEqual(
    GhostShare.decode("not-a-ghost-share-payload", CIRCUITS),
    { ok: false, reason: "corrupt" },
  );
});

test("decode rejects a payload for a track outside the registry", () => {
  const payload = GhostShare.encode("not-a-circuit", ghost);

  assert.deepEqual(
    GhostShare.decode(payload, CIRCUITS),
    { ok: false, reason: "unknown-track" },
  );
});
