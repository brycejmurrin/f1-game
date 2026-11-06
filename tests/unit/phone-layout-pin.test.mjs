// phone-layout-pin — the pure half of tools/ui/phone-layout-pin.mjs (#5139):
// the golden parses, covers every pinned screen and selector, and the comparison
// names what moved.
import test from "node:test";
import assert from "node:assert/strict";
import { compareFingerprint, readGolden, SCREENS, GLOBAL_VARS, CELL, TOL } from "../../tools/ui/phone-layout-pin.mjs";

const GOLDEN = "tests/data/phone-layout-pin.json";   // the blessed file (tooling-fast pins the data file to this test by this path)

test("the blessed golden covers every screen and selector the tool pins, at Bryce's cell", () => {
  const g = readGolden();
  assert.deepEqual(g.cell, CELL, "the golden names the cell it was blessed at");
  for (const s of SCREENS) {
    const row = g.screens[s.id];
    assert.ok(row, `${s.id} is blessed in ${GOLDEN}`);
    const width = (sel) => (sel.endsWith("@ltw") ? 3 : sel.endsWith("@wh") ? 2 : 4);
    for (const sel of s.sel) assert.ok(Array.isArray(row.boxes[sel]) && row.boxes[sel].length === width(sel), `${s.id} ${sel} has a box`);
    for (const v of GLOBAL_VARS) assert.ok(typeof row.globals[v] === "string" && row.globals[v] !== "", `${s.id} pins ${v}`);
    assert.equal(row.globals.shape, "wide"); assert.equal(row.globals.standalone, true);
  }
  // The cell's own identity: the safe area the game reads is the one the tool injects.
  // The tokens are the unresolved `calc(<inset> + 8px)` strings css/tokens.css builds from env(): the inset, then the 8 px gutter.
  assert.equal(g.screens.title.globals["--safe-l"], `calc(${CELL.insets.left}px + 8px)`);
  assert.equal(g.screens.title.globals["--safe-b"], `calc(${CELL.insets.bottom}px + 8px)`);
});

test("compareFingerprint: within tolerance is silent; a move, a size, a token or a vanished box is named", () => {
  const want = { globals: { fontSize: "16px", "--ui-scale": "1.09" }, boxes: { "#a": [10, 20, 100, 50], "#p@ltw": [1, 2, 3] } };
  assert.deepEqual(compareFingerprint("s", want, { globals: { fontSize: "16px", "--ui-scale": "1.09" }, boxes: { "#a": [10 + TOL, 20, 100, 50 - TOL], "#p@ltw": [1, 2, 3] } }), []);
  const lines = compareFingerprint("s", want, { globals: { fontSize: "16px", "--ui-scale": "1.2" }, boxes: { "#a": [44, 20, 100, 50], "#p@ltw": null } });
  assert.deepEqual(lines, [
    "s global --ui-scale: 1.09 -> 1.2",
    "s #a: [10,20,100,50] -> [44,20,100,50] (d +34,0,0,0)",
    "s #p@ltw: present -> absent",
  ]);
  assert.deepEqual(compareFingerprint("s", undefined, { globals: {}, boxes: {} }), ["s: not in the golden (re-bless with --update)"]);
});
