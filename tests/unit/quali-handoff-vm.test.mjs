/* quali-handoff-vm.test.mjs — the friend-race qualifying handoff, behaviourally.
 *
 * The defect: openQualiForNet() armed `qualiNetDone` and then called the ASYNC
 * openQuali(), which suspends on its first await and resets that same field one
 * microtask later. The callback was therefore always null by the time anyone
 * could press TO THE GRID, so `q-go` fell through to the solo closeQualiToGrid()
 * and js/net/lobby.js's finishStart — the ONLY caller of netPlay.start() — never
 * ran. A friend race staged with "grid by qualifying" produced two disconnected
 * solo races after both players had queued, connected and qualified together.
 *
 * Why this file and not tests/specs/multiplayer-room.spec.js: that spec needs a
 * real WebRTC transport (STUN/TURN), which a sandboxed container has no route
 * for — it fails there on `handshake invite fail no_transport` whatever the
 * code does, and its connection cases never reach this handoff anyway. The
 * ordering is pure JS, so the VM harness can prove it exactly.
 *
 * Verified to CATCH the defect: run against 48cc011 (pre-fix) this asserts 0
 * invocations and fails; against the fix it sees 1.
 *
 * Run: node --test tests/unit/quali-handoff-vm.test.mjs   (npm run test:game-vm)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame, settle } = require("../../tools/lib/game-vm.cjs");

const flush = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

let g;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => { if (g) g.close(); });

test("the friend-race gate survives openQuali's await, and TO THE GRID runs the lobby's callback", async () => {
  const doc = g.sandbox.document;
  let called = 0;
  g.G.openQualiForNet(() => { called++; });

  // This is the window the defect lived in: openQuali is suspended on
  // `await ensureScenery`, and its continuation is what used to wipe the gate.
  // settle() RESOLVES false on timeout, it never rejects — so assert on it
  // rather than swallowing. A sheet that never opened would otherwise let the
  // real assertion below fail for the wrong reason.
  const opened = await settle(() => { const el = doc.getElementById("quali"); return el && el.hidden === false; }, 4000);
  assert.ok(opened, "the qualifying sheet never opened — openQuali did not complete");
  await flush();

  const go = doc.getElementById("q-go");
  assert.ok(go, "#q-go must exist once the sheet is open");
  assert.equal(go.disabled, false, "no rivals outstanding, so the gate is open");
  assert.equal(typeof go.onclick, "function", "#q-go must be wired");

  go.onclick();
  await flush(10);

  assert.equal(called, 1,
    "TO THE GRID must run the lobby's finishStart — netPlay.start() has no other caller");
});
