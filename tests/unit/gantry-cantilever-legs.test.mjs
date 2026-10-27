// gantry-cantilever-legs.test.mjs — #3280: a cantilever gantry has ONE mast.
// gantry() plants its own mast (and skips the open side), then hangs the beam
// with overheadSpan; without `supports:false` the span planted a second pair
// of legs (72 vertices instead of the deck box's 24).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require(path.join(ROOT, "tools", "lib", "track-build-vm.cjs"));

const DECK_ONLY = 24;   // one box: the beam, no span legs

test("cantilever gantries emit the beam only; the mast is gantry()'s own", () => {
  const T = buildContext().Tracks;
  let seen = 0;
  for (const id of ["monaco", "madrid"]) {
    const t = T.build(T.LIST.find((d) => d.id === id));
    for (const e of t.modelDiagnostics.emitted.filter((x) => /^gantry-/.test(x.id))) {
      seen++;
      assert.ok(e.vertices <= DECK_ONLY, `${id} ${e.id}: ${e.vertices} vertices — span legs were planted`);
    }
  }
  assert.ok(seen > 0, "monaco should build at least one gantry span");
});
