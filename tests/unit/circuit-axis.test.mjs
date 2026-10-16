// circuit-axis — the aspect axis the fit tools cross their map screens with.
//
// The axis exists because a matrix that measured #select and #track-detail on
// every viewport, at every UI size, still could not fail on a squashed map: it
// only ever measured the selected circuit, and that circuit's aspect is
// unremarkable. These are the properties that keep the axis able to fail —
// that it spans the range, that it stays off unless asked for, and that its
// cell ids stay parseable.

import test from "node:test";
import assert from "node:assert/strict";
import { CIRCUITS, parseCircuits, circuitTag } from "../../tools/ui/circuit-axis.mjs";

test("the spread actually spans tall to wide", () => {
  const aspects = CIRCUITS.map(([, a]) => a);
  assert.ok(Math.min(...aspects) <= 0.6, "needs a genuinely TALL circuit");
  assert.ok(Math.max(...aspects) >= 1.4, "needs a genuinely WIDE circuit");
  assert.ok(aspects.some((a) => a > 0.6 && a < 1.4), "needs a middling one too");
  // The failure this guards: someone re-picks the list and lands five circuits
  // that all look the same, leaving the axis present but inert.
  assert.ok(Math.max(...aspects) / Math.min(...aspects) >= 2.5,
    "the spread has collapsed — the axis can no longer fail");
});

test("every circuit in the spread is a real circuit file", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  for (const [id] of CIRCUITS) {
    assert.ok(fs.existsSync(path.join(ROOT, "js", "circuits", `${id}.js`)),
      `js/circuits/${id}.js is missing — the axis names a circuit that does not exist`);
  }
});

test("the axis is off unless asked for", () => {
  // An unflagged run must keep byte-identical cell ids, or the axis's own
  // arrival reads as a regression across the whole grid.
  assert.deepEqual(parseCircuits([]), [null]);
  assert.deepEqual(parseCircuits(["--scale=150", "--shots"]), [null]);
  assert.equal(circuitTag(null), "");
});

test("bare --circuits means the whole spread", () => {
  assert.deepEqual(parseCircuits(["--circuits"]), CIRCUITS.map((c) => c[0]));
});

test("--circuits=a,b names them", () => {
  assert.deepEqual(parseCircuits(["--circuits=jeddah,baku"]), ["jeddah", "baku"]);
  assert.deepEqual(parseCircuits(["--circuits= jeddah , baku "]), ["jeddah", "baku"]);
});

test("an empty --circuits= is an error, not a silent no-op", () => {
  assert.throws(() => parseCircuits(["--circuits="]), /at least one circuit/);
});

test("a tagged cell id stays parseable back into screen and circuit", () => {
  // The merge key and the HTML grid both treat a cell id as opaque, but a human
  // reading the report has to be able to tell what failed.
  const id = "select" + circuitTag("jeddah");
  assert.equal(id, "select#jeddah");
  const [screen, circuit] = id.split("#");
  assert.equal(screen, "select");
  assert.equal(circuit, "jeddah");
});
