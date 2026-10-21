/* settings-reload-vm.test.mjs — a setting written in one boot is read by the NEXT boot on the same
 * storage (B·H11 settings audit). Not part of persistence-vm.test.mjs: that file is the 1:1 twin of
 * tests/specs/persistence.spec.js.
 *
 * Run: node --test tests/unit/settings-reload-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

test("an AERO mode choice survives a reload: a second boot on the same storage reads it back (B·H11 settings audit)", async () => {
  // The tests above prove the session reads back what it wrote; nothing proved a NEW boot does.
  const a = await createGame({ storage: { trackId: "monza" } });
  let saved;
  try {
    a.apex.aeroMode("auto");
    assert.equal(a.apex.aeroMode(), "auto");
    const ls = a.sandbox.localStorage;
    saved = {};
    for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k.startsWith("apex26.")) saved[k] = ls.getItem(k); }
    assert.ok("apex26.aeroMode" in saved, "the choice is stored as apex26.aeroMode");
  } finally { a.close(); }
  const b = await createGame({ storage: { trackId: "monza", aeroMode: JSON.parse(saved["apex26.aeroMode"]) } });   // the stored value, as stored
  try {
    assert.equal(b.apex.aeroMode(), "auto", "a fresh boot restores it");
  } finally { b.close(); }
  const c = await createGame({ storage: { trackId: "monza" } });
  try { assert.notEqual(c.apex.aeroMode(), "auto", "control: a fresh install is not AUTO, so the restore is real"); } finally { c.close(); }
});
