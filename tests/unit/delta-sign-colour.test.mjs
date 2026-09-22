/* delta-sign-colour.test.mjs — two widgets, one sign convention, opposite colours.
 *
 * The TELEMETRY tab's compare gauge painted the TRAILING driver green and the
 * leading one red. js/data/telemetry.js computes both the gauge delta and the
 * lane-board delta with the same expression and comments both the same way:
 *
 *     const delta = timeAtDist(view.compare.cum, dP) - t;   // >0: compare is behind
 *     const dl    = timeAtDist(lane.cum, dRef)     - t;     // >0: this lane is behind the ref
 *
 * so `dh-pos` is the SLOWER side on each. css/data.css had
 * `.dh-laneboard-dl.dh-pos -> --slower` (right, and commented "behind the
 * reference") and `.dh-gdelta.dh-pos -> --faster` (inverted), fifty lines apart.
 *
 * NOTHING COULD HAVE CAUGHT IT. Neither half is wrong alone: the JS sign is
 * right, the CSS is valid, and each rule is individually plausible. Only the
 * PAIRING is wrong, and no test compared them — a screenshot would not either,
 * because a green number and a red number both look like a working widget
 * unless you know which car is ahead.
 *
 * So this asserts the invariant rather than the values: every delta class keyed
 * on the ">0 = behind" convention resolves `.dh-pos` to the same token. Adding
 * a third such widget with the colours flipped fails here.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const css = fs.readFileSync(path.join(ROOT, "css/data.css"), "utf8");
const js = fs.readFileSync(path.join(ROOT, "js/data/telemetry.js"), "utf8");

/** The colour token `.<base>.<state>` resolves to, e.g. ("dh-gdelta","dh-pos"). */
function tokenFor(base, state) {
  const re = new RegExp("\\." + base + "\\." + state + "\\s*\\{[^}]*color:\\s*var\\(([^)]+)\\)", "m");
  const m = re.exec(css);
  assert.ok(m, `css/data.css has no colour rule for .${base}.${state}`);
  return m[1].trim();
}

// Both widgets key on `timeAtDist(other, d) - t`, so positive means BEHIND.
const BEHIND_IS_POS = ["dh-gdelta", "dh-laneboard-dl"];

test("the source really does use one sign convention for both deltas", () => {
  // If this drifts, the assertion below is measuring the wrong thing.
  const behind = js.match(/-\s*t;\s*\/\/\s*>0:[^\n]*behind/g) || [];
  assert.ok(behind.length >= 2,
    `expected both deltas to be commented ">0: … behind"; found ${behind.length}`);
});

test("a positive delta is the SLOWER colour on every widget that uses it", () => {
  for (const base of BEHIND_IS_POS)
    assert.equal(tokenFor(base, "dh-pos"), "--slower",
      `.${base}.dh-pos must be --slower: dh-pos means "behind" in telemetry.js`);
});

test("a negative delta is the FASTER colour on every widget that uses it", () => {
  for (const base of BEHIND_IS_POS)
    assert.equal(tokenFor(base, "dh-neg"), "--faster",
      `.${base}.dh-neg must be --faster: dh-neg means "ahead" in telemetry.js`);
});
