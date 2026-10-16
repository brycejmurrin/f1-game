/* steel-role.test.mjs — the section-label ink was measured, and there was no
 * room for it to be its own colour.
 *
 * THE MEASUREMENT. d02d19bd4 ("leftover idle ink and leftover-red headlines
 * move onto --text/--steel") standardised section chrome on one token. That
 * pass picked the token; it did not measure it. --steel was #8a8a96 — APCA
 * Lc 39.8 on --bg, 39.3 on --surf-1, 37.7 on --surf-3 — carried at --fs-micro
 * (14px) and --fs-2 (15px), the two smallest sizes in the palette, on settings
 * labels, section headings and `#howtoplay dt`. Those are read, not scanned
 * past. The token's own comment claimed "at readable contrast".
 *
 * WHY IT WAS NOT SIMPLY GIVEN A BETTER VALUE. --dim already does this job at
 * Lc 48.0, and the two turned out to be the SAME INK: identical OKLab hue angle
 * (-74.1deg both), chroma 0.0178 vs 0.0203, differing only in lightness (0.637
 * vs 0.691). Sweeping --steel's lightness with a and b held fixed, every value
 * that clears a defensible floor on the worst ground it is used over is at or
 * past --dim's own lightness. So no value kept --steel a visible step BELOW
 * --dim and readable at 14px — the "cool steel chrome" hierarchy was a
 * lightness step dressed as a hue, and one end of it had fallen out of
 * readability.
 *
 * SO THE STEP GOES AND THE NAME STAYS: `--steel: var(--dim)`. Verified in
 * Chromium rather than assumed, because --steel is DECLARED ABOVE --dim in the
 * same :root and a forward var() reference looks wrong: it resolves, because
 * custom property substitution reads the referenced property's computed value
 * on the same element and does not care about source order. Both compute to
 * rgb(154, 154, 168).
 *
 * WHAT THIS ASSERTS:
 *   1. the APCA implementation reproduces both published anchors, so every
 *      number below is graded against the real curve rather than whatever the
 *      constants happened to produce;
 *   2. the alias holds, and the ink it resolves to measures what the note above
 *      says on all three grounds — the defect is pinned as a NUMBER, so the day
 *      someone gives --steel a literal again, this says by how much;
 *   3. the alias is not quietly inlined away. ~30 call sites carry the name
 *      because section chrome is a thing you may want to tune apart from
 *      body-secondary later, and this file is the note saying so.
 *
 * Run: node --test tests/unit/steel-role.test.mjs   (npm run test:tooling-fast)
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CSS = path.join(ROOT, "css");
const sheets = fs.readdirSync(CSS).filter((f) => f.endsWith(".css")).sort();
const read = (f) => fs.readFileSync(path.join(CSS, f), "utf8");
const tokens = read("tokens.css");
const token = (n) => {
  const m = tokens.match(new RegExp(n.replace(/[-]/g, "\\-") + ":\\s*([^;]+);"));
  assert.ok(m, `${n} must be defined in css/tokens.css`);
  return m[1].trim();
};
const hex = (h) => (h.length === 4 ? [1, 2, 3].map((i) => parseInt(h[i] + h[i], 16))
                                   : [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));

/* ── APCA 0.1.9 (W3 / SAPC-98), same constants as apca-timing.test.mjs ────── */
const Rco = 0.2126729, Gco = 0.7151522, Bco = 0.0721750;
const mainTRC = 2.4, normBG = 0.56, normTXT = 0.57, revTXT = 0.62, revBG = 0.65;
const blkThrs = 0.022, blkClmp = 1.414, scale = 1.14, loOffset = 0.027;
const loClip = 0.1, deltaYmin = 0.0005;
const screenY = ([r, g, b]) => {
  const y = Rco * (r / 255) ** mainTRC + Gco * (g / 255) ** mainTRC + Bco * (b / 255) ** mainTRC;
  return y < blkThrs ? y + (blkThrs - y) ** blkClmp : y;
};
function apca(txt, bg) {
  const Yt = screenY(txt), Yb = screenY(bg);
  if (Math.abs(Yb - Yt) < deltaYmin) return 0;
  let S;
  if (Yb > Yt) { S = (Yb ** normBG - Yt ** normTXT) * scale; S = S < loClip ? 0 : S - loOffset; }
  else { S = (Yb ** revBG - Yt ** revTXT) * scale; S = S > -loClip ? 0 : S + loOffset; }
  return S * 100;
}

/* ── sRGB -> OKLab (Björn Ottosson's matrices) ───────────────────────────── */
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function oklab([r, g, b]) {
  const R = lin(r / 255), G = lin(g / 255), B = lin(b / 255);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
const hueDeg = ([, a, b]) => (Math.atan2(b, a) * 180) / Math.PI;
const g = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
          -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
          -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s]
    .map((v) => Math.max(0, Math.min(255, Math.round(g(v) * 255))));
}
/** `color-mix(in oklab, A pA%, B pB%)` for the two opaque operands used here. */
const mixOklab = (A, pA, B, pB) => {
  const a = oklab(A), b = oklab(B), t = pA / (pA + pB);
  return fromOklab([0, 1, 2].map((i) => a[i] * t + b[i] * (1 - t)));
};

test("the APCA implementation reproduces both published anchors", () => {
  assert.ok(Math.abs(apca(hex("#000000"), hex("#ffffff")) - 106.04) < 0.05,
    `black on white must be Lc 106.04, got ${apca(hex("#000000"), hex("#ffffff")).toFixed(2)}`);
  assert.ok(Math.abs(apca(hex("#ffffff"), hex("#000000")) + 107.88) < 0.05,
    `white on black must be Lc -107.88, got ${apca(hex("#ffffff"), hex("#000000")).toFixed(2)}`);
});

test("the --steel alias holds, and the ink behind it measures what the note says", () => {
  assert.equal(token("--steel"), "var(--dim)",
    `--steel is ${token("--steel")}, not an alias for --dim. If it has been given ` +
    `a literal again, measure it: the value this replaced (#8a8a96) was APCA ` +
    `Lc 39.8 on --bg at 14px label sizes, and the header of this file says why ` +
    `no darker-than---dim value works`);

  const ink = hex(token("--dim"));
  const bg = hex(token("--bg"));
  const grounds = { "--bg": bg, "--surf-1": mixOklab(hex("#ffffff"), 4, bg, 96),
                    "--surf-3": mixOklab(hex("#ffffff"), 11, bg, 89) };
  const want = { "--bg": 48.0, "--surf-1": 47.6, "--surf-3": 45.9 };
  for (const [name, ground] of Object.entries(grounds)) {
    const got = Math.abs(apca(ink, ground));
    assert.ok(Math.abs(got - want[name]) < 0.5,
      `section-label ink on ${name} is now Lc ${got.toFixed(1)}, was ${want[name]} — ` +
      `the figures in css/tokens.css and docs/TESTING.md are stale, re-measure them`);
    // The old value, kept as the thing this replaced rather than as prose.
    assert.ok(got > Math.abs(apca(hex("#8a8a96"), ground)) + 5,
      `the ink is no better than the #8a8a96 this replaced on ${name}`);
  }
});

test("the argument this rests on — one ink, two lightnesses — still holds", () => {
  // Compare the VALUE that was replaced against --dim as it stands. Asserting
  // --steel against --dim would be vacuous now that one is an alias for the
  // other; what stays checkable is the finding itself, so if --dim is ever
  // given a different hue the reasoning in the header becomes history and this
  // test says so rather than passing quietly.
  const was = oklab(hex("#8a8a96")), dim = oklab(hex(token("--dim")));
  assert.ok(Math.abs(hueDeg(was) - hueDeg(dim)) < 2,
    `#8a8a96 and --dim now sit ${Math.abs(hueDeg(was) - hueDeg(dim)).toFixed(1)}deg ` +
    `apart in OKLab hue (the finding was 0.0). The header argues the split ` +
    `between them was never about colour — re-read it rather than deleting this`);
  assert.ok(was[0] < dim[0],
    `#8a8a96 (L ${was[0].toFixed(3)}) is no longer darker than --dim ` +
    `(L ${dim[0].toFixed(3)}); the "there is no room below --dim" argument ` +
    `assumed that ordering`);
  assert.match(fs.readFileSync(path.join(ROOT, "css/tokens.css"), "utf8"),
    /--steel:\s*var\(--dim\)/,
    "the alias must stay in css/tokens.css, where its rationale lives");
});

test("the alias is not inlined away — the name still carries the role", () => {
  const uses = sheets.reduce((n, f) => n + (read(f).match(/var\(--steel\)/g) || []).length, 0);
  assert.ok(uses >= 20,
    `only ${uses} call sites still name --steel (was ~30). It is an alias TODAY, ` +
    `but the name is what lets section chrome be tuned apart from body-secondary ` +
    `later — do not "simplify" it into var(--dim) at every site`);
});
