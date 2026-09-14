/* apca-timing.test.mjs — the three timing colours must be legible as a FAMILY.
 *
 * The sector strip encodes state in colour: purple = session best, green =
 * personal best, yellow = slower than your own. They are read at 14px, in a
 * corner, at 300 km/h — and they were not equally readable. Measured in APCA:
 *
 *     --faster    #a3e635   Lc 79.4
 *     --sec-slow  #f6d200   Lc 80.4
 *     --sec-best  #c084fc   Lc 50.4   <- the BEST lap was the hardest to read
 *
 * WHY APCA AND NOT THE 4.5:1 WE USE ELSEWHERE. WCAG 2.x contrast "overstates
 * contrast for dark colors to the point that 4.5:1 can be functionally
 * unreadable" and "cannot be used for guidance designing dark mode" (the APCA
 * documentation's own words), and it ignores font weight, which a condensed
 * display face on a translucent dark panel is exactly the wrong case for. So
 * the sector palette is judged on the model built for this situation.
 *
 * WHAT IS ASSERTED, AND WHY IT IS A BAND AND NOT A THRESHOLD. `.sec-val` carries
 * `text-shadow: 0 1px 3px rgba(0,0,0,0.9)`; a dark halo raises effective
 * contrast for light ink, so every Lc below is a FLOOR, not what the eye gets.
 * An absolute pass mark would therefore be asserting a number this file cannot
 * actually measure. What IS robust is that all three share the same halo, the
 * same size and the same job — so the defect is the SPREAD between them, and
 * the spread is what this pins. A future palette change that lifts or drops all
 * three together is fine; one that leaves a single state 30 Lc adrift is the
 * bug this caught.
 *
 * ANTI-VACUITY: the APCA implementation below is checked against the two values
 * APCA publishes (#000 on #FFF = 106.04, #FFF on #000 = -107.88) in the first
 * test. Get the constants wrong and that fails before any palette assertion
 * runs, so this file cannot quietly grade on a broken curve.
 *
 * Run: node --test tests/unit/apca-timing.test.mjs   (npm run test:tooling-fast)
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tokens = fs.readFileSync(path.join(ROOT, "css/tokens.css"), "utf8");
const token = (n) => {
  const m = tokens.match(new RegExp("\\s" + n + ":\\s*([^;]+);"));
  assert.ok(m, `css/tokens.css must declare ${n}`);
  return m[1].trim();
};
const hex = (h) => (h.length === 4
  ? [1, 2, 3].map((i) => parseInt(h[i] + h[i], 16))
  : [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));

/* ── APCA 0.1.9 (W3 / SAPC-98) ──────────────────────────────────────────── */

const Rco = 0.2126729, Gco = 0.7151522, Bco = 0.0721750;
const mainTRC = 2.4, normBG = 0.56, normTXT = 0.57, revTXT = 0.62, revBG = 0.65;
const blkThrs = 0.022, blkClmp = 1.414, scale = 1.14, loOffset = 0.027;
const loClip = 0.1, deltaYmin = 0.0005;

function screenY([r, g, b]) {
  const y = Rco * Math.pow(r / 255, mainTRC)
          + Gco * Math.pow(g / 255, mainTRC)
          + Bco * Math.pow(b / 255, mainTRC);
  // The black soft-clamp: near-black grounds are where WCAG 2 goes wrong, and
  // this is the term that fixes it. Dropping it changes every number here.
  return y < blkThrs ? y + Math.pow(blkThrs - y, blkClmp) : y;
}
function apca(txt, bg) {
  const Yt = screenY(txt), Yb = screenY(bg);
  if (Math.abs(Yb - Yt) < deltaYmin) return 0;
  let S;
  if (Yb > Yt) {                                   // dark ink on a light ground
    S = (Math.pow(Yb, normBG) - Math.pow(Yt, normTXT)) * scale;
    S = S < loClip ? 0 : S - loOffset;
  } else {                                         // light ink on a dark ground
    S = (Math.pow(Yb, revBG) - Math.pow(Yt, revTXT)) * scale;
    S = S > -loClip ? 0 : S + loOffset;
  }
  return S * 100;
}
const lc = (inkTok, ground) => Math.abs(apca(hex(token(inkTok)), ground));

test("the APCA implementation reproduces both published anchors", () => {
  // Without this the palette assertions below would grade against whatever
  // curve the constants happened to produce, which is the vacuous-test trap.
  assert.ok(Math.abs(apca(hex("#000000"), hex("#ffffff")) - 106.04) < 0.05,
    `black on white must be Lc 106.04, got ${apca(hex("#000000"), hex("#ffffff")).toFixed(2)}`);
  assert.ok(Math.abs(apca(hex("#ffffff"), hex("#000000")) + 107.88) < 0.05,
    `white on black must be Lc -107.88, got ${apca(hex("#ffffff"), hex("#000000")).toFixed(2)}`);
});

test("no timing state is dramatically harder to read than its siblings", () => {
  const bg = hex(token("--bg"));
  const fam = { "--sec-best": lc("--sec-best", bg), "--faster": lc("--faster", bg), "--sec-slow": lc("--sec-slow", bg) };
  const vals = Object.values(fam);
  const spread = Math.max(...vals) - Math.min(...vals);
  const shown = Object.entries(fam).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(", ");
  assert.ok(spread <= 20,
    `the sector palette spans ${spread.toFixed(1)} Lc (${shown}). One state being far ` +
    `less legible than the others is the 2026-09-14 defect: session best sat at 50.4 ` +
    `while its siblings were ~80, so the BEST lap you can set was the hardest to read. ` +
    `Lift the laggard rather than dropping the others`);
});

test("session best stays purple, and stays the lighter purple", () => {
  // Purple = session best is a motorsport convention (it is what the timing
  // screen means), so the fix lifted LIGHTNESS only — the OKLab a/b are
  // untouched. Going all the way to the siblings' ~79 costs 38% of the chroma
  // and starts reading pink, which would trade a legibility win for a meaning
  // loss. This pins both halves of that trade.
  const v = token("--sec-best");
  const [r, g, b] = hex(v);
  assert.ok(b > r && r > g,
    `--sec-best ${v} must still read purple (blue > red > green channel); ` +
    `the timing screen's purple is a convention, not a decoration`);
  const at = lc("--sec-best", hex(token("--bg")));
  assert.ok(at >= 60,
    `--sec-best is Lc ${at.toFixed(1)} on --bg; it marks the best lap in the session ` +
    `on a 14px readout and must clear APCA's Lc 60 non-body tier`);
});

test("the brand red stays out of the timing palette", () => {
  // #e10600 measures Lc ~30 on these grounds — APCA's spot-read/disabled band,
  // and the reason css/tokens.css already forbids it as HUD ink. Recorded here
  // with a number so the prohibition has evidence behind it, not just prose.
  const red = lc("--red", hex(token("--bg")));
  assert.ok(red < 45,
    `--red is now Lc ${red.toFixed(1)}. If the brand red was deliberately lightened ` +
    `this test and the "never a HUD ink" rule in css/tokens.css both need re-reading`);
  for (const t of ["--sec-best", "--faster", "--sec-slow"]) {
    assert.notEqual(token(t), token("--red"), `${t} must not be the brand red`);
  }
});
