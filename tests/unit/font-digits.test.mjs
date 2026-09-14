/* font-digits.test.mjs — the ~36 `tabular-nums` declarations are INERT, and
 * this file makes that fact impossible to forget or to break silently.
 *
 * THE DEFECT. Rajdhani leads --font-hud. Its full TTF carries 13 OpenType
 * features, ALL registered under script `deva`, with no `latn` entry and no
 * figure feature anywhere in the upstream sources — so Google's subsetter serves
 * a Latin face whose feature list is literally empty. Its digits are also
 * proportional: "1" is 0.334em and "8" is 0.542em, 7.07px of jitter per changed
 * digit at #hud-speed's 34px. CSS cannot synthesise a feature a font lacks and
 * reports nothing when it fails (CSS Fonts 4 §7.2: "text is simply rendered as
 * if that font feature was not enabled"), and `@supports` cannot catch it — the
 * PROPERTY is supported; the FONT is what is missing. So all 36 declarations
 * read as working and do nothing. Full write-up: docs/notes/HUD-TABULAR-DIGITS.md.
 *
 * WHAT THIS ASSERTS. It reads tests/data/font-digits.json, the measured ledger
 * that tools/check/font-digits.py writes with fontTools, and pins the CURRENT
 * TRUTH rather than the desired one — including the uncomfortable half. A test
 * demanding uniform digits would simply be red, which teaches nobody anything;
 * a test that says "these are proportional, and here is what that costs, and
 * here is the line to delete when you fix it" survives contact with the next
 * person to open the file.
 *
 * The anti-vacuity property is the ledger itself: a font added to assets/fonts/
 * without re-running the generator has no entry and fails here. That matters
 * because THIS bug class is precisely "a check that reads as working and is not"
 * — the same trap that produced a green test asserting nothing earlier in the
 * same investigation (see the note's closing section).
 *
 * Run: node --test tests/unit/font-digits.test.mjs   (npm run test:tooling-fast)
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const ledger = JSON.parse(read("tests/data/font-digits.json"));
const tokens = read("css/tokens.css");

test("every shipped font is in the measured ledger", () => {
  const onDisk = fs.readdirSync(path.join(ROOT, "assets/fonts"))
    .filter((f) => f.endsWith(".woff2")).sort();
  assert.ok(onDisk.length > 0, "assets/fonts must contain woff2 files");
  assert.deepEqual(Object.keys(ledger.fonts).sort(), onDisk,
    "a font was added or removed without re-measuring — run " +
    "`python3 tools/check/font-digits.py`. This assertion is what stops a new " +
    "display face shipping with unknown digit behaviour, which is how the " +
    "current inert-tabular-nums bug got in");
  for (const [name, m] of Object.entries(ledger.fonts)) {
    assert.ok(!m.error, `${name}: ${m.error}`);
    assert.equal(m.digitAdvances.length, 10, `${name} must record all ten digit advances`);
  }
});

test("the HUD stack still leads with a face that has NO tabular figures", () => {
  // Pinning the defect deliberately. When this fails it should be because
  // someone fixed it — at which point delete this test and enable the one below.
  const m = tokens.match(/--font-hud:\s*([^;]+);/);
  assert.ok(m, "--font-hud must exist");
  const first = m[1].split(",")[0].trim().replace(/^["']|["']$/g, "");
  assert.equal(first, "Rajdhani",
    `--font-hud now leads with "${first}", not Rajdhani. If that face has real ` +
    `tabular figures, this whole test is obsolete: delete it, and swap in the ` +
    `assertion in the next test body. See docs/notes/HUD-TABULAR-DIGITS.md for ` +
    `measured candidates (Barlow Condensed, Fira Sans Condensed, Archivo Narrow)`);

  const faces = Object.entries(ledger.fonts).filter(([n]) => n.startsWith("rajdhani-"));
  assert.ok(faces.length >= 3, "expected the three shipped Rajdhani weights");
  for (const [name, f] of faces) {
    assert.equal(f.digitsUniform, false, `${name} now has uniform digits — re-read this file`);
    assert.equal(f.hasTnum, false, `${name} now ships tnum — re-read this file`);
    assert.deepEqual(f.gsubScripts.filter((s) => s === "latn"), [],
      `${name} now registers Latin features; the premise of this test has changed`);
  }
});

test("the jitter the inert declarations leave behind is recorded, not guessed", () => {
  const bold = ledger.fonts["rajdhani-latin-700-normal.woff2"];
  assert.ok(bold, "the 700 face is the one #hud-speed renders");
  const adv = bold.digitAdvances, upem = bold.unitsPerEm;
  const spreadEm = (Math.max(...adv) - Math.min(...adv)) / upem;
  // 0.542 - 0.334 = 0.208em, which is 7.07px at #hud-speed's 34px.
  assert.ok(Math.abs(spreadEm - 0.208) < 0.002,
    `the digit spread is now ${spreadEm.toFixed(4)}em, not 0.208em — the 7.07px ` +
    `jitter figure in docs/notes/HUD-TABULAR-DIGITS.md is stale, re-measure it`);
  // `min-width: 3ch` was NOT what failed: 1ch is "0" (0.536em) so 3ch is 1.608em
  // against "888"'s 1.626em, short by 1.1%. The jitter is the STRING sliding
  // inside a box that barely moves. Pin the near-miss so nobody re-blames the box.
  const zero = adv[0] / upem, widest = Math.max(...adv) / upem;
  assert.ok(Math.abs(3 * zero - 3 * widest) / (3 * widest) < 0.02,
    `3ch and "888" are now more than 2% apart; the "the slot was never the " +
    "problem" reasoning in the note needs revisiting`);
});

test("the fallback face has uniform digits, and the declarations stay put", () => {
  // Titillium is next in --font-hud, so it is what the HUD renders whenever
  // Rajdhani fails to load — and it is naturally uniform-width, which is why the
  // digits-only @font-face in the note was viable at all.
  for (const [name, f] of Object.entries(ledger.fonts)) {
    if (!name.startsWith("titillium-")) continue;
    assert.equal(f.digitsUniform, true,
      `${name} no longer has uniform digits; the fallback path now jitters too`);
  }
  // Keep the ~36 declarations: they cost nothing and become correct the day the
  // face changes. A "cleanup" that deletes them would silently remove the fix.
  const css = fs.readdirSync(path.join(ROOT, "css")).filter((f) => f.endsWith(".css"));
  const n = css.reduce((a, f) => a + (read(`css/${f}`).match(/tabular-nums/g) || []).length, 0);
  assert.ok(n >= 30,
    `only ${n} tabular-nums declarations remain (was 36). They are inert TODAY but ` +
    `are the fix the moment the display face gains real tabular figures — do not ` +
    `remove them as dead code`);
});
