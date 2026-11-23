/* apca-timing.test.mjs — the three timing colours must be legible as a FAMILY.
 *
 * The sector strip encodes state in colour: purple = session best, green =
 * personal best, yellow = slower than your own. They are read at 14px, in a
 * corner, at 300 km/h — and they were not equally readable. Measured in APCA:
 *
 *     --faster    #a3e635   Lc 79.4   (now #5fe88a, Lc 77.4: moved off --you's lime)
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

test("colour-vision palettes clear 4.5:1 on the dark HUD plate", () => {
  // The [data-cvd] blocks once shipped the white-paper Tol values (#0077bb,
  // #cc3311): ~3:1 on the HUD plate, rgb(8 8 14 / .72), composited over a
  // mid-grey scene (128). WCAG 2 ratio here because that is the claim the fix
  // made; the plate is the HUD's, which stays dark in every UI theme.
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const relL = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a, b) => { const x = relL(a), y = relL(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const plate = [8, 8, 14].map((c) => c * 0.72 + 128 * 0.28);
  assert.ok(ratio(hex("#0077bb"), plate) < 3.2, "anti-vacuity: the old deutan --faster must fail this bar");
  const blocks = [...tokens.matchAll(/:root\[data-cvd="(\w+)"\][^{]*\{([^}]*)\}/g)];
  assert.ok(blocks.length >= 2, "css/tokens.css must declare the [data-cvd] palettes");
  let n = 0;
  for (const [, mode, body] of blocks) {
    for (const [, name, val] of body.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
      if (name === "--red") continue;           // the accent, never HUD ink (test above)
      const r = ratio(hex(val), plate);
      n++;
      assert.ok(r >= 4.5, `[data-cvd="${mode}"] ${name} ${val} is ${r.toFixed(2)}:1 on the HUD plate; needs 4.5:1`);
    }
  }
  assert.ok(n >= 9, `expected the cvd inks to be checked, saw ${n}`);
});

test("personal-best green and the player's lime are different hues", () => {
  // --faster (PB, ghost delta) and --you (your row, your dot) were #a3e635 and
  // #aeea00: 8° of hue apart, so on the sector strip and the results sheet lime
  // meant both "you" and "faster" (DEFECT-LEDGER item D, design pass #1). The
  // colour-vision palettes already kept them apart; this pins the default one.
  const hue = (h) => {
    const [r, g, b] = hex(h).map((v) => v / 255);
    const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
    if (!d) return 0;
    const H = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (H * 60 + 360) % 360;
  };
  assert.ok(Math.abs(hue("#a3e635") - hue("#aeea00")) < 40, "anti-vacuity: the old pair must fail this bar");
  const gap = Math.abs(hue(token("--faster")) - hue(token("--you")));
  assert.ok(Math.min(gap, 360 - gap) >= 40,
    `--faster ${token("--faster")} and --you ${token("--you")} are ${gap.toFixed(0)}° of hue apart; ` +
    `a personal best must not read as "you"`);
});

/* ── secondary and red TEXT inks (#4258) ─────────────────────────────────────
 * --dim labels most secondary copy at 14–16 px/700, where APCA asks Lc 60; at
 * #9a9aa8 it was Lc 48. --slower is the red FILL (#ff3b30, Lc 40 as text), so
 * red TEXT reads --slower-ink: --slower mixed toward --text in OKLab, which
 * keeps the hue, follows the colour-vision remaps of --slower, and darkens
 * under LIGHT because --text does. The grounds: --bg, and the HUD plate
 * (rgb(8 8 14 / .78)) over a mid-grey scene, the darkest ink's worst case. */
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const unlin = (c) => Math.round(255 * Math.min(1, Math.max(0,
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)));
function toOklab(rgb) {
  const [r, g, b] = rgb.map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(unlin);
}
/** --slower-ink for a given --slower and --text, from its declared mix. */
function slowerInk(slower, text) {
  const v = token("--slower-ink");
  const m = v.match(/^color-mix\(in oklab, var\(--slower\) (\d+(?:\.\d+)?)%, var\(--text\)\)$/);
  assert.ok(m, `--slower-ink must be color-mix(in oklab, var(--slower) N%, var(--text)), got ${v}`);
  const p = +m[1] / 100, A = toOklab(slower), B = toOklab(text);
  return fromOklab(A.map((x, i) => x * p + B[i] * (1 - p)));
}
const hudPlate = [8, 8, 14].map((c) => Math.round(c * 0.78 + 128 * 0.22));

test("--dim, the secondary label ink, clears APCA Lc 60 on --bg and the HUD plate", () => {
  assert.ok(Math.abs(apca(hex("#9a9aa8"), hex(token("--bg")))) < 60, "anti-vacuity: the old --dim must fail this bar");
  for (const [name, ground] of [["--bg", hex(token("--bg"))], ["HUD plate", hudPlate]]) {
    const v = lc("--dim", ground);
    assert.ok(v >= 60, `--dim ${token("--dim")} is Lc ${v.toFixed(1)} on ${name}; secondary labels need Lc 60`);
  }
  // The HUD scope restates the dark ladder; its --dim must be the same ink.
  const hud = tokens.match(/:is\(#hud, #announce, #game-metrics\) \{[^}]*?--dim:\s*([^;]+);/);
  assert.ok(hud, "the HUD scope restates --dim");
  assert.equal(hud[1].trim(), token("--dim"), "the HUD scope's --dim matches :root's");
});

test("--slower-ink, red as TEXT, clears Lc 60 and sits inside the timing family band", () => {
  const bg = hex(token("--bg")), text = hex(token("--text"));
  assert.ok(lc("--slower", bg) < 60, "anti-vacuity: --slower as text must fail this bar");
  const ink = slowerInk(hex(token("--slower")), text);
  const fam = [lc("--sec-best", bg), lc("--faster", bg), lc("--sec-slow", bg), Math.abs(apca(ink, bg))];
  const spread = Math.max(...fam) - Math.min(...fam);
  assert.ok(spread <= 20, `with --slower-ink the timing family spans ${spread.toFixed(1)} Lc (${fam.map((x) => x.toFixed(1))})`);
  for (const [name, ground] of [["--bg", bg], ["HUD plate", hudPlate]]) {
    const v = Math.abs(apca(ink, ground));
    assert.ok(v >= 60, `--slower-ink is Lc ${v.toFixed(1)} on ${name}; red text needs Lc 60`);
  }
  const [r, g, b] = ink;
  assert.ok(r > g && r > b && r - Math.max(g, b) >= 80, `--slower-ink rgb(${ink}) must still read red`);
  // Every colour-vision remap of --slower gets the same treatment.
  for (const [, mode, body] of tokens.matchAll(/:root\[data-cvd="(\w+)"\][^{]*\{([^}]*)\}/g)) {
    const s = body.match(/--slower:\s*(#[0-9a-fA-F]{6})/);
    if (!s) continue;
    const v = Math.abs(apca(slowerInk(hex(s[1]), text), bg));
    assert.ok(v >= 60, `[data-cvd="${mode}"] --slower-ink is Lc ${v.toFixed(1)} on --bg`);
  }
  // LIGHT: the same mix toward the light theme's dark --text, on its --bg.
  const light = tokens.match(/:root\[data-ui-theme="light"\] \{([^}]*)\}/)[1];
  const lt = (n) => hex(light.match(new RegExp(n + ":\\s*(#[0-9a-fA-F]{6})"))[1]);
  const lv = Math.abs(apca(slowerInk(hex(token("--slower")), lt("--text")), lt("--bg")));
  assert.ok(lv >= 60, `under LIGHT --slower-ink is Lc ${lv.toFixed(1)} on --bg`);
});
