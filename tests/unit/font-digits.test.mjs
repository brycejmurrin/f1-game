/* font-digits.test.mjs — the HUD's digits used to SLIDE, and the ~36
 * `font-variant-numeric: tabular-nums` declarations that were supposed to stop
 * them did nothing at all. This is now the guard that keeps them working.
 *
 * THE DEFECT, AND HOW LONG IT READ AS FIXED. --font-hud led with Rajdhani. Its
 * full TTF carries 13 OpenType features, ALL registered under script `deva`
 * with no `latn` entry, so Google's subsetter served a Latin face whose feature
 * list was literally empty — and its digits are proportional. CSS cannot
 * synthesise a feature a font lacks and reports nothing when it fails (CSS
 * Fonts 4 §7.2: "text is simply rendered as if that font feature was not
 * enabled"), and `@supports` cannot catch it either: the PROPERTY is supported;
 * the FONT is what is missing. So every one of those declarations read as
 * working. Measured in Chromium, three-digit strings at #hud-speed's 34px,
 * widest minus narrowest:
 *
 *   Rajdhani           21.22 px  ->  21.22 px with tabular-nums   (no change)
 *   Barlow Condensed   20.94 px  ->      0 px with tabular-nums
 *
 * Barlow Condensed now leads the stack, so the declarations are load-bearing
 * rather than decorative. Full write-up: docs/notes/HUD-TABULAR-DIGITS.md.
 *
 * WHAT THIS ASSERTS. It reads tests/data/font-digits.json, the measured ledger
 * tools/check/font-digits.py writes with fontTools, and applies the rule that
 * note proposed after the fact: every shipped face must have uniform digit
 * advances EITHER natively OR after `tnum` substitution. Tag presence alone is
 * not enough and the ledger proves why — Exo 2, measured during the same pass,
 * ships `tnum` and still resolves "4" to 616 against 620 for the other nine.
 * So this checks the SUBSTITUTED advances, not the feature list.
 *
 * The anti-vacuity property is the ledger itself: a font added to assets/fonts/
 * without re-running the generator has no entry and fails here. That matters
 * because THIS bug class is precisely "a check that reads as working and is
 * not" — the trap the whole investigation was about.
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

/** A face's digits as they actually render with `tabular-nums` applied. */
const effective = (f) => (f.tnumAdvances ? f.tnumAdvances : f.digitAdvances);
const uniform = (f) => new Set(effective(f)).size === 1;

test("every shipped font is in the measured ledger", () => {
  const onDisk = fs.readdirSync(path.join(ROOT, "assets/fonts"))
    .filter((f) => f.endsWith(".woff2")).sort();
  assert.ok(onDisk.length > 0, "assets/fonts must contain woff2 files");
  assert.deepEqual(Object.keys(ledger.fonts).sort(), onDisk,
    "a font was added or removed without re-measuring — run " +
    "`python3 tools/check/font-digits.py`. This assertion is what stops a new " +
    "display face shipping with unknown digit behaviour, which is how the " +
    "inert-tabular-nums bug got in");
  for (const [name, m] of Object.entries(ledger.fonts)) {
    assert.ok(!m.error, `${name}: ${m.error}`);
    assert.equal(m.digitAdvances.length, 10, `${name} must record all ten digit advances`);
  }
});

test("every shipped face has uniform digits — natively or through tnum", () => {
  // The rule docs/notes/HUD-TABULAR-DIGITS.md arrived at: not "does it carry the
  // tag", which Exo 2 passes while still being broken, but "do the advances the
  // browser will actually use come out equal".
  for (const [name, f] of Object.entries(ledger.fonts)) {
    const adv = effective(f), via = f.tnumAdvances ? "tnum" : "natively";
    assert.ok(uniform(f),
      `${name} renders digits at ${new Set(adv).size} different widths (${via}: ` +
      `${adv.join(", ")} / ${f.unitsPerEm}). Every readout in this font will slide ` +
      `as its digits change, and no CSS can stop it — that is the whole reason ` +
      `Rajdhani was replaced. Pick a face whose tnum resolves to one width, or ` +
      `one that is already uniform (measured candidates are in the note)`);
  }
});

test("the HUD stack LEADS with a face whose digits hold still", () => {
  const m = tokens.match(/--font-hud:\s*([^;]+);/);
  assert.ok(m, "--font-hud must exist");
  const first = m[1].split(",")[0].trim().replace(/^["']|["']$/g, "");
  const slug = first.toLowerCase().replace(/\s+/g, "-");
  const faces = Object.entries(ledger.fonts).filter(([n]) => n.startsWith(slug + "-"));
  assert.ok(faces.length > 0,
    `--font-hud leads with "${first}" but no ${slug}-* face is in the ledger — ` +
    `either it is not self-hosted (so its digit behaviour is unknown and out of ` +
    `our control) or the generator has not been re-run`);
  for (const [name, f] of faces)
    assert.ok(uniform(f),
      `${name} leads --font-hud and its digits are NOT uniform. This is the ` +
      `Rajdhani defect returning: the ~36 tabular-nums declarations go inert and ` +
      `#hud-speed starts sliding again`);

  // Titillium is next in the stack and catches a failed font load. It has no
  // tnum at all, so the fallback only stays honest while its digits are
  // naturally uniform — which is exactly why it is second and not something else.
  for (const [name, f] of Object.entries(ledger.fonts)) {
    if (!name.startsWith("titillium-")) continue;
    assert.equal(f.digitsUniform, true,
      `${name} no longer has uniform digits; a failed HUD font load would now ` +
      `jitter instead of degrading cleanly`);
  }
});

test("the size-adjust that matches cap height is pinned to its derivation", () => {
  // 91.9% is not taste. Barlow's cap is 0.700em against Rajdhani's 0.643em, so
  // at a shared font-size it renders 8.9% taller and every HUD box measured
  // against the old face is wrong. The number is 0.643/0.700, and the browser
  // agrees: "H" at 700/34px measures 21px in both faces.
  const block = tokens.match(/@font-face\s*\{[^}]*Barlow Condensed[^}]*\}/);
  assert.ok(block, "the Barlow Condensed @font-face blocks must be in css/tokens.css");
  const adj = block[0].match(/size-adjust:\s*([\d.]+)%/);
  assert.ok(adj, "the Barlow faces must carry size-adjust — without it the HUD grows 8.9%");
  const want = (0.643 / 0.700) * 100;
  assert.ok(Math.abs(+adj[1] - want) < 0.2,
    `size-adjust is ${adj[1]}%, but cap-height parity with the face this replaced ` +
    `is ${want.toFixed(2)}%. If the HUD face changed again, re-derive it from the ` +
    `new cap height rather than carrying this number forward`);
});

test("#hud-speed's fixed slot is three TABULAR advances, not three `ch`", () => {
  // `ch` is the advance of "0" and the browser takes the PROPORTIONAL one — it
  // ignores the tabular-nums on the same element. Measured on the live element:
  // 1ch = 0.4161em against a rendered tabular digit of 0.4577em, so the `3ch`
  // this used to say was 9.1% short and the readout still jumped 3.5px at
  // 100 km/h. Under Rajdhani the same gap was only 1.1%, which is why it read
  // as working. Derive the slot here so a font swap cannot shorten it quietly.
  const hud = fs.readFileSync(path.join(ROOT, "css/hud.css"), "utf8");
  const slot = hud.match(/#hud-speed-n\s*\{[^}]*min-width:\s*([\d.]+)(em|ch)/);
  assert.ok(slot, "#hud-speed-n must declare a min-width");
  assert.equal(slot[2], "em",
    `#hud-speed-n is sized in ${slot[2]} again. \`ch\` is the PROPORTIONAL zero ` +
    `on every face measured here, so it does not hold three tabular digits`);

  const m = tokens.match(/--font-hud:\s*([^;]+);/);
  const first = m[1].split(",")[0].trim().replace(/^["']|["']$/g, "");
  const slug = first.toLowerCase().replace(/\s+/g, "-");
  const face = Object.entries(ledger.fonts).find(([n]) => n.startsWith(slug + "-") && n.includes("-700-"));
  assert.ok(face, `no ${slug}-*-700-* face in the ledger to derive the slot from`);
  const adv = effective(face[1])[0] / face[1].unitsPerEm;

  const block = tokens.match(/@font-face\s*\{[^}]*Barlow Condensed[^}]*\}/);
  const adj = block ? +(block[0].match(/size-adjust:\s*([\d.]+)%/) || [0, 100])[1] / 100 : 1;

  const want = 3 * adv * adj;
  assert.ok(Math.abs(+slot[1] - want) < 0.005,
    `#hud-speed-n reserves ${slot[1]}em but three tabular digits of ${first} are ` +
    `${want.toFixed(4)}em (advance ${adv.toFixed(4)}em x size-adjust ${adj}). A slot ` +
    `SHORTER than its content puts the 99->100 jump back; a longer one just wastes ` +
    `room. Re-derive it from this ledger, do not carry the old number forward`);
});

test("the tabular-nums declarations are load-bearing now — keep them", () => {
  // They were inert under Rajdhani and kept anyway, on the argument that they
  // become correct the day the face changes. That day is here: with Barlow they
  // are the ONLY thing selecting the uniform advances. Deleting them as dead
  // code would silently restore the slide.
  const css = fs.readdirSync(path.join(ROOT, "css")).filter((f) => f.endsWith(".css"));
  const n = css.reduce((a, f) => a + (read(`css/${f}`).match(/tabular-nums/g) || []).length, 0);
  assert.ok(n >= 30,
    `only ${n} tabular-nums declarations remain (was 36). Under the current HUD ` +
    `face these are not decoration — they are what makes the digits hold still`);
});
