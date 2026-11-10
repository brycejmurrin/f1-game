// float-audit-harness — tools/track/float-audit.cjs builds through the SHARED
// harness (tools/lib/track-build-vm.cjs). Its private copy stopped its load
// list at "@circuits", so js/track/circuit-elevations.js never ran and every
// circuit with a baked elevation profile was audited against flat-ish terrain:
// Suzuka's centreline spanned 9.42 m there against 40.08 m on the shared
// harness (2026-11-10). This pins the audit to the real terrain.
//
// Run: node --test tests/unit/float-audit-harness.test.mjs   (~5 s)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

test("float-audit's build sees the baked elevation profiles (Suzuka spans > 30 m vertically)", () => {
  const { buildContext } = require("../../tools/track/float-audit.cjs");
  const { Tracks, prims } = buildContext();
  const def = Tracks.LIST.find((d) => d.id === "suzuka");
  const tr = Tracks.buildCenterline(def);
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < tr.n; k++) { lo = Math.min(lo, tr.py[k]); hi = Math.max(hi, tr.py[k]); }
  assert.ok(hi - lo > 30, `suzuka vertical range ${(hi - lo).toFixed(2)} m — the baked profile did not load`);
  // …and it still records primitives (the emitter wrappers installed before build-props / tracks.js).
  const from = prims.length;
  Tracks.build(Tracks.LIST.find((d) => d.id === "monza"));
  assert.ok(prims.length - from > 1000, `only ${prims.length - from} primitives recorded`);
});

test("float-audit loads the engine through tools/lib/track-build-vm.cjs, not a private load list", () => {
  const src = require("node:fs").readFileSync(new URL("../../tools/track/float-audit.cjs", import.meta.url), "utf8");
  assert.match(src, /require\("\.\.\/lib\/track-build-vm\.cjs"\)/);
  assert.doesNotMatch(src, /vm\.createContext|TRACK_VM\.slice/, "a second VM harness has crept back in");
});
