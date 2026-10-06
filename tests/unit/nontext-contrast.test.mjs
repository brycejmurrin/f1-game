/* nontext-contrast.test.mjs — WCAG 1.4.11 (Non-text Contrast) over the tokens.
 *
 * 1.4.11 asks 3:1 of the visual information needed to IDENTIFY a control or
 * its STATE, and of the graphics you must see to understand the UI. It does
 * not ask it of decoration, and it does not ask it of a boundary drawn around
 * a control that its own text label already identifies. Those two carve-outs
 * are why a blanket "every hairline clears 3:1" sweep would be wrong here and
 * is deliberately not what this file does — `--plate-line` measures 1.55:1
 * over the darkest ground and that is FINE, because the thing it outlines is a
 * button with a word in it.
 *
 * What is left after the carve-outs is small, and it is exactly what this
 * pins:
 *
 *   1. the FOCUS RING, which is pure non-text information — nothing else says
 *      where the keyboard is;
 *   2. the SELECTED state, which the menus signal with colour on a boundary
 *      ("THE ONE SELECTED LOOK" in css/tokens.css: `background: var(--plate-on);
 *      border-color: var(--red)`);
 *   3. the standing claim that `var(--accent)` is DECORATION. Two team skins —
 *      racingbulls #1634cb at 2.21:1 and williams #0f3cc9 at 2.33:1 over
 *      --bg — sit under 3:1, and they are allowed to because every consumer of
 *      that token today is ornament: a scroll-fade nub, a skewed tick before a
 *      section label, the HUD box's left stripe, an 18% wash gradient. The
 *      moment --accent carries a state or identifies a control, those two
 *      skins become a real failure, so the consumer list is frozen below and
 *      growing it fails this test with that argument attached.
 *
 * COLOUR RESOLUTION. The tokens are `color-mix(in oklab, …)`, so the test
 * carries an OKLab resolver rather than eyeballed hexes. It was checked once
 * against Chromium's own computed values (a page declaring these seven tokens,
 * read back off `background-color`), and agrees to ~5 decimal places on all of
 * them, including CSS's two awkward cases: a mix whose percentages sum under
 * 100% scales the result's ALPHA (--plate-hover lands at 0.86, --plate-press
 * at 0.96), and mixing with `transparent` is a premultiplied lerp, so
 * --plate-on keeps red's hue at alpha 0.18 rather than sliding toward black.
 * Getting either wrong would move a ratio by more than the margins here.
 *
 * Run: node --test tests/unit/nontext-contrast.test.mjs   (npm run test:tooling-fast)
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cssRules, decl, ruleFor } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");
const tokens = cssRules(read("css/tokens.css"));
const token = (name) => {
  const v = decl(tokens, ":root", name);
  assert.ok(v, `css/tokens.css must declare ${name} on :root`);
  return v;
};

/* ── sRGB / OKLab ────────────────────────────────────────────────────────── */

const s2l = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const l2s = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

function toOklab([r, g, b]) {
  const R = s2l(r / 255), G = s2l(g / 255), B = s2l(b / 255);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function fromOklab([L, a, bb]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * bb) ** 3;
  return [ 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
          -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
          -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s]
    .map((v) => Math.max(0, Math.min(255, l2s(v) * 255)));
}

// Relative luminance / WCAG ratio. Note the 0.03928 knee: that is the WCAG
// definition, a hair off the sRGB 0.04045 above, and the difference is real
// enough at these near-black grounds to keep both spellings.
function lum([r, g, b]) {
  const c = [r, g, b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => {
  const x = lum(a.rgb), y = lum(b.rgb);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/* ── a colour: straight (un-premultiplied) sRGB + alpha ─────────────────── */

const hex = (h) => (h.length === 4
  ? [1, 2, 3].map((i) => parseInt(h[i] + h[i], 16))
  : [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
const TRANSPARENT = { rgb: [0, 0, 0], a: 0 };

/** Composite `fg` over the opaque `bg` in sRGB — what the screen actually shows. */
function over(fg, bg) {
  if (fg.a >= 1) return { rgb: fg.rgb, a: 1 };
  return { rgb: fg.rgb.map((v, i) => v * fg.a + bg.rgb[i] * (1 - fg.a)), a: 1 };
}

/** `color-mix(in oklab, A pA%, B pB%)`, premultiplied, with CSS alpha scaling. */
function mixOklab(A, pA, B, pB) {
  const total = pA + pB;
  const wA = pA / total, wB = pB / total;
  const a = A.a * wA + B.a * wB;
  // A fully transparent operand contributes no colour, only its (zero) weight.
  const LA = A.a === 0 ? [0, 0, 0] : toOklab(A.rgb);
  const LB = B.a === 0 ? [0, 0, 0] : toOklab(B.rgb);
  const L = [0, 1, 2].map((i) => (LA[i] * A.a * wA + LB[i] * B.a * wB) / (a || 1));
  return { rgb: a === 0 ? [0, 0, 0] : fromOklab(L), a: a * (total < 1 ? total : 1) };
}

/** Resolve one token value: a hex, `var(--x)`, `rgba(…)`, or a two-operand color-mix.
 *  `get` looks a custom property up — `token` (the :root block) unless a caller
 *  resolves inside a scope that re-declares some of them (section 4). */
function resolve(value, seen = new Set(), get = token) {
  if (value && typeof value === "object") return value;   // already computed (an inherited value)
  const v = String(value).trim();
  let m;
  if (v === "transparent") return TRANSPARENT;
  if (v === "black") return { rgb: [0, 0, 0], a: 1 };
  if (v === "white") return { rgb: [255, 255, 255], a: 1 };
  if (v.startsWith("#")) return { rgb: hex(v), a: 1 };
  if ((m = v.match(/^var\((--[\w-]+)\)$/))) {
    assert.ok(!seen.has(m[1]), `token cycle at ${m[1]}`);
    return resolve(get(m[1]), new Set(seen).add(m[1]), get);
  }
  if ((m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/))) {
    return { rgb: [+m[1], +m[2], +m[3]], a: m[4] == null ? 1 : +m[4] };
  }
  if ((m = v.match(/^color-mix\(\s*in (oklab|srgb)\s*,\s*(.+)\)$/i))) {
    const [a, b] = splitTop(m[2]);
    const one = (s) => {
      const p = s.trim().match(/^(.*?)\s+([\d.]+)%$/);
      return p ? { c: resolve(p[1], seen, get), p: +p[2] / 100 } : { c: resolve(s, seen, get), p: null };
    };
    const A = one(a), B = one(b);
    // CSS: one omitted percentage is 100% minus the other; both omitted is 50/50.
    const pA = A.p != null ? A.p : (B.p != null ? 1 - B.p : 0.5);
    const pB = B.p != null ? B.p : 1 - pA;
    if (m[1].toLowerCase() === "oklab") return mixOklab(A.c, pA, B.c, pB);
    // sRGB with `transparent`: premultiplied, so the colour keeps its channels
    // and only the alpha scales (the damage chip's black plate).
    if (B.c.a === 0 && A.c.a === 1) return { rgb: A.c.rgb, a: pA };
    // sRGB: only the opaque-operand case is used (the damage chip's level 2).
    assert.ok(A.c.a === 1 && B.c.a === 1 && pA + pB === 1, `srgb mix with alpha is not modelled: ${v}`);
    return { rgb: A.c.rgb.map((x, i) => x * pA + B.c.rgb[i] * pB), a: 1 };
  }
  assert.fail(`cannot resolve colour: ${v}`);
}

/** Split "a, b" at top level (commas inside nested parens belong to the operand). */
function splitTop(s) {
  const out = []; let d = 0, last = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") d++;
    else if (s[i] === ")") d--;
    else if (s[i] === "," && d === 0) { out.push(s.slice(last, i)); last = i + 1; }
  }
  out.push(s.slice(last));
  assert.equal(out.length, 2, `expected a two-operand color-mix, got: ${s}`);
  return out;
}

/* ── the grounds a control can sit on ───────────────────────────────────── */

const BG = resolve(token("--bg"));

// Every opaque surface a focus ring can land against, named the way the token
// comments name them. Translucent plates are composited over the page, which
// is the darkest thing under them and therefore the worst case for a light
// ring and the best case for a dark one.
function grounds() {
  const g = { "--bg": BG };
  for (const name of ["--surf-1", "--surf-3", "--panel", "--plate", "--plate-hover", "--plate-press", "--plate-on", "--red"]) {
    g[name] = over(resolve(token(name)), BG);
  }
  return g;
}

/* ── 1. the focus ring ──────────────────────────────────────────────────── */

test("the focus ring clears 3:1 against every surface it can land on", () => {
  // 2px of white outline is the ONLY thing that says where the keyboard is —
  // there is no second channel, so this is 1.4.11 in its purest form (and
  // 2.4.11 Focus Appearance, which asks the same 3:1 of the indicator against
  // adjacent colours). css/tokens.css already argues this in prose at
  // `--focus`; the numbers behind that argument live here.
  const focus = resolve(token("--focus"));
  const bad = [];
  for (const [name, g] of Object.entries(grounds())) {
    const r = ratio(focus, g);
    if (r < 3) bad.push(`${name} ${r.toFixed(2)}:1`);
  }
  assert.deepEqual(bad, [],
    "--focus " + token("--focus") + " must clear 3:1 on every ground. Red (#e10600) " +
    "measures ~2.6:1 on the page, which is why the ring is white and must stay a " +
    "light neutral — see the --focus comment in css/tokens.css");
});

test("the focus ring is a light neutral, not the brand red", () => {
  // Two independent reasons, both in the token comment: contrast (above) and
  // MEANING — red already says SELECTED, so a red ring on an already-selected
  // chip renders the two states identically.
  assert.equal(token("--focus"), "#fff",
    "--focus is white by argument, not by default; changing it needs the contrast " +
    "sweep above AND a new answer to 'what distinguishes focused from selected?'");
  const outline = decl(tokens, ":focus-visible", "outline");
  assert.ok(outline && /var\(--focus\)/.test(outline),
    `:focus-visible must draw its outline from --focus (found: ${outline})`);
  assert.match(outline, /max\(2px,/,
    "the ring must not thin below 2px when the player shrinks the UI scale");
});

/* ── 2. the selected state ──────────────────────────────────────────────── */

test("the selected boundary is perceivable against the ground and the idle edge", () => {
  // THE ONE SELECTED LOOK is `background: var(--plate-on); border-color:
  // var(--red)`. The fill is red at 18% — a tint, not a signal — so the BORDER
  // carries the state, and 1.4.11 wants it 3:1 against what sits either side.
  const red = resolve(token("--red"));
  const outside = ratio(red, BG);
  assert.ok(outside >= 3,
    `the selected border --red ${token("--red")} is ${outside.toFixed(2)}:1 over --bg; ` +
    `1.4.11 needs 3:1 or the selected chip stops reading as selected`);
  const fill = over(resolve(token("--plate-on")), BG);
  const inside = ratio(red, fill);
  assert.ok(inside >= 3,
    `the selected border is ${inside.toFixed(2)}:1 against its own --plate-on fill — ` +
    `at less than 3:1 the border dissolves into the tint and the control loses its edge`);
});

test("the idle control edge is exempt, and this test says why out loud", () => {
  // --plate-line is 1.55:1 over --bg. That is not a bug and must not be
  // "fixed" by a sweep: 1.4.11 exempts a boundary around a control that its
  // own visible text already identifies, which is every plate in these menus.
  // Asserting the number keeps the exemption a DECISION — if someone ever puts
  // an unlabelled control on a plate, the reviewer meets this comment first.
  const line = over(resolve(token("--plate-line")), BG);
  const r = ratio(line, BG);
  assert.ok(r < 3,
    `--plate-line now measures ${r.toFixed(2)}:1 — if it was deliberately raised to ` +
    `clear 3:1, delete this test; the exemption below is no longer what is happening`);
  assert.ok(Math.abs(r - 1.55) < 0.05,
    `--plate-line moved to ${r.toFixed(2)}:1 (was 1.55:1). A change to the de-facto ` +
    `control edge is a whole-UI change; re-judge it, do not re-baseline it here`);
});

/* ── 3. --accent is decoration, and stays decoration ────────────────────── */

// Frozen: every `var(--accent)` consumer, and why each is ornament rather than
// information. A team skin under 3:1 is only safe while this list is.
const ACCENT_DECOR = {
  "css/components.css": [
    "the scroll-fade nub — a 3px bar that repeats the scrollbar's own message",
  ],
  "css/overlays.css": [
    "`.sel-label::before` — a skewed tick giving section labels a shared left edge (moved with classification off the title-critical sheet)",
  ],
  "css/settings.css": [
    "`.pm-accent-preview-hud` — Appearance's live HUD sample plate; the number is `--accent-ink`, the plate is ornament mirroring the radio card",
    "`.pm-accent-chip-custom` conic-gradient — the CUSTOM swatch's rainbow hint; tap target identity is the chip ring + aria-label, not the wash",
  ],
  "css/hud.css": [
    "`.hud-box` border-left — the team stripe on a box whose value is the readout",
    "`body.hud-prof-broadcast .hud-gaps` border-left — the same stripe, broadcast skin",
    "`--accent-dim` on the sector rows — the same stripe again, dimmed",
    "`#bc-tower` border-left — the WATCH timing tower wears the same team stripe as `.hud-box`; every row's state (on camera, fastest, pit, out) is carried by its own text and fill, never by the stripe",
    "`#announce-num` background — the radio card's number PLATE. The team colour is the ground, not the message: the number on it is `--accent-ink`, picked per team to clear 4.5:1 (proved below), and the CHANNEL a message came in on is carried by the WHO line's colour, never by the plate",
  ],
  "css/tokens.css": [
    "`--accent-dim` derivation",
    "`--grad-accent` — an 18% wash that fades to transparent by 62%",
  ],
};

test("every var(--accent) consumer is decoration, so the dark team skins are exempt", () => {
  // racingbulls #1634cb 2.21:1 and williams #0f3cc9 2.33:1 over --bg. Both are
  // real brand colours and neither can be brightened without lying about the
  // team, so the invariant that keeps them legal is the one asserted here:
  // --accent never carries state and never identifies a control.
  const found = {};
  for (const file of Object.keys(ACCENT_DECOR)) {
    found[file] = (read(file).match(/var\(--accent(?:-dim)?\)/g) || []).length;
  }
  const expect = Object.fromEntries(Object.entries(ACCENT_DECOR).map(([f, u]) => [f, u.length]));
  assert.deepEqual(found, expect,
    "the --accent consumer list changed. If the new use is ORNAMENT, add it to " +
    "ACCENT_DECOR with a one-line reason. If it carries a STATE or identifies a " +
    "control, it is a WCAG 1.4.11 failure on two team skins today (racingbulls " +
    "2.21:1, williams 2.33:1 over --bg) and needs a second channel or a lighter " +
    "token — do not just bump the count");
  // And nowhere else may read the token at all.
  const others = fs.readdirSync(path.join(ROOT, "css"))
    .filter((f) => f.endsWith(".css") && !ACCENT_DECOR[`css/${f}`])
    .filter((f) => /var\(--accent(?:-dim)?\)/.test(read(`css/${f}`)));
  assert.deepEqual(others, [], "a new stylesheet reads --accent — see the message above");
});

test("a team accent may be dark, but --red and --focus must not follow it", () => {
  // The team skin re-points --accent and the ink that stands on it, and
  // nothing else. The two tokens that DO carry information — the selected
  // border and the focus ring — are fixed, and a future "skin the whole UI"
  // change would silently push both under 3:1.
  const skins = [...read("css/tokens.css").matchAll(/:root\[data-team="([\w-]+)"\]\s*\{([^}]*)\}/g)];
  assert.ok(skins.length >= 11, `expected the team skin blocks, found ${skins.length}`);
  for (const [, team, body] of skins) {
    const props = [...body.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
    assert.deepEqual(props, ["--accent", "--accent-ink"],
      `:root[data-team="${team}"] may only re-point --accent and --accent-ink (found ${props.join(", ")}). ` +
      `Skinning --red or --focus would drop the selected border or the focus ring ` +
      `under 3:1 on the darker teams`);
  }
});

test("every team's --accent-ink is READABLE on that team's --accent, and is the better of the two candidates", () => {
  // The radio card's number plate is the one surface painted --accent, so the
  // number on it is real text over a ground that ranges from #0f3cc9 to
  // #f5f5f5. 4.5:1 is asserted rather than the 3:1 large-text allowance the
  // 26px plate would earn, so the plate can shrink without this going quiet.
  //
  // The ink is also not a free choice: only the fixed dark-HUD neutrals are on offer, and
  // the test recomputes both and insists the sheet named the winner. That is
  // what makes adding a team mechanical instead of a judgement call.
  const skins = [...read("css/tokens.css").matchAll(/:root\[data-team="([\w-]+)"\]\s*\{([^}]*)\}/g)];
  // Root --text/--bg reverse in Light/System; inherited ink must not follow them.
  const CANDIDATES = { "var(--hud-ink-light)": resolve(token("--hud-ink-light")), "var(--hud-ink-dark)": resolve(token("--hud-ink-dark")) };
  for (const [, team] of skins) {
    const sel = `:root[data-team="${team}"]`;
    const accent = resolve(decl(tokens, sel, "--accent"));
    const inkName = decl(tokens, sel, "--accent-ink");
    assert.ok(CANDIDATES[inkName], `${sel} sets --accent-ink to ${inkName}; only theme-independent HUD neutrals are on offer`);
    const scored = Object.entries(CANDIDATES)
      .map(([name, c]) => [name, ratio(accent, c)])
      .sort((a, b) => b[1] - a[1]);
    const got = scored.find(([name]) => name === inkName)[1];
    assert.ok(got >= 4.5,
      `${team}: --accent-ink ${inkName} measures ${got.toFixed(2)}:1 on ${decl(tokens, sel, "--accent")} — ` +
      `the car number on the radio card's plate would be unreadable`);
    assert.equal(inkName, scored[0][0],
      `${team}: --accent-ink is ${inkName} (${got.toFixed(2)}:1) but ${scored[0][0]} measures ` +
      `${scored[0][1].toFixed(2)}:1 — the ink is whichever is further, not a preference`);
  }
});

/* ── 4. the race chrome is dark in EVERY theme ─────────────────────────────
 *
 * LIGHT (opt-in) and SUNLIGHT (which ships LIGHT + HIGH CONTRAST) re-point the
 * surface ladder on :root. Custom properties resolve where they are DECLARED,
 * so a light --plate-opaque reached #hud already computed from the light
 * --carbon (#fbfbfc), and #announce / #game-metrics — siblings of #hud — took
 * the light --text / --dim straight onto their dark plates. Measured before
 * the one scope in css/tokens.css: RELATIVE / STRATEGY / INPUTS / the MIRROR
 * chip 1.05:1, the blue flag 1.67:1, the metrics panel 1.46:1, the radio card
 * 1.03-1.49:1 — and no test resolved a single light-theme HUD pair.
 *
 * This section is a small cascade: the :root rules a theme switches on (by
 * specificity, then source order, honouring the prefers-color-scheme block
 * SYSTEM lives in), then the rules that re-declare tokens on an overlay root.
 * A var() inside a scope declaration resolves against the scope; anything the
 * scope does not declare arrives as the :root's COMPUTED value — which is the
 * exact trap the light theme fell into, so the model has to get it right.
 *
 * Grounds: the overlays' plates are translucent, composited over the scene.
 * Black, asphalt and the mid-grey (128) scene the CVD test in
 * apca-timing.test.mjs already uses for this plate. A bright sky behind a 74%
 * plate is weaker in EVERY theme; that is the dark design's own budget, and
 * the DARK row below holds it to the same bar as the light ones.
 */
const hud = cssRules(read("css/hud.css"));
const ROOT_SEL = {
  light: ':root[data-ui-theme="light"]', system: ':root[data-ui-theme="system"]',
  high: ':root[data-ui-contrast="high"]',
  deutan: ':root[data-cvd="deutan"]', protan: ':root[data-cvd="protan"]', tritan: ':root[data-cvd="tritan"]',
};
const LIGHT_MQ = "@media (prefers-color-scheme: light)";
const OVERLAY_ROOTS = ["#hud", "#announce", "#game-metrics"];

function splitAt(s, ch) {
  const out = []; let d = 0, last = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(" || s[i] === "[") d++;
    else if (s[i] === ")" || s[i] === "]") d--;
    else if (s[i] === ch && d === 0) { out.push(s.slice(last, i).trim()); last = i + 1; }
  }
  out.push(s.slice(last).trim());
  return out.filter(Boolean);
}
const ctxOk = (rule, flags) => rule.context.every((c) => c.startsWith("@layer") || (c === LIGHT_MQ && flags.includes("system")));
// Specificity of a root compound for this theme: :root 10, :root[attr] 20, else no match.
const rootSpec = (item, flags) => (item === ":root" ? 10 : flags.some((f) => ROOT_SEL[f] === item) ? 20 : -1);
function scopeSpec(item, flags, id) {
  const parts = splitAt(item, " ");
  const target = parts[parts.length - 1];
  const list = target === id ? [id] : (target.match(/^:is\((.*)\)$/) || [])[1];
  if (!list || !(Array.isArray(list) ? list : splitAt(list, ",")).includes(id)) return -1;
  if (parts.length === 1) return 100;
  if (parts.length !== 2) return -1;
  const r = rootSpec(parts[0], flags);
  return r < 0 ? -1 : 100 + r;
}
/** The custom properties `match` selects, cascaded: specificity, then source order. */
function cascade(rules, match, flags) {
  const hits = [];
  rules.forEach((r, i) => {
    if (!ctxOk(r, flags)) return;
    const sp = Math.max(-1, ...splitAt(r.selector, ",").map(match));
    if (sp >= 0) hits.push({ sp, i, decls: r.decls });
  });
  hits.sort((a, b) => a.sp - b.sp || a.i - b.i);
  const out = new Map();
  for (const h of hits) for (const [k, v] of h.decls) if (k.startsWith("--")) out.set(k, v);
  return out;
}
/** A token getter for an element directly under the root that is `id` (or inside it). */
function themeGetter(flags, id, { keep = null } = {}) {
  const root = cascade(tokens, (it) => rootSpec(it, flags), flags);
  const rootGet = (n) => { assert.ok(root.has(n), `${n} is not declared on :root`); return root.get(n); };
  const scope = cascade(tokens, (it) => scopeSpec(it, flags, id), flags);
  if (keep) for (const n of [...scope.keys()]) if (!keep(id, n)) scope.delete(n);
  const get = (n) => (scope.has(n) ? scope.get(n) : resolve(rootGet(n), new Set([n]), rootGet));
  return { get, root, scope };
}
// A plate's alpha follows PANEL OPACITY (--hud-panel-a-eff): 1 at the shipped
// setting, and HIGH CONTRAST pins it there. The slider's 0.45 floor is the
// player's own choice of see-through, not a theme, so it is not modelled.
const panelAt1 = (v) => v.replace(/calc\(([\d.]+%?) \* var\(--hud-panel-a-eff\)\)/g, "$1");
const SCENES = { black: "#000000", asphalt: "#3a3a40", "mid-grey": "#808080" };
const HC_PLATE = [hud, ':root[data-ui-contrast="high"] :is(.hud-box, #announce)', "background"];
const SCOPE_SEL = ":is(#hud, #announce, #game-metrics)";
const CASES = [
  { what: "radio card words", id: "#announce", ink: [hud, "#announce", "color"], plate: [hud, "#announce", "background"], hc: HC_PLATE },
  { what: "radio card WHO line", id: "#announce", ink: [hud, "#announce-who", "color"], plate: [hud, "#announce", "background"], hc: HC_PLATE },
  { what: "RELATIVE / STRATEGY / INPUTS", id: "#hud", ink: [hud, "#hud-rel, #hud-strat, #hud-inputs", "color"], plate: [hud, "#hud-rel, #hud-strat, #hud-inputs", "background"] },
  { what: "STRATEGY row label", id: "#hud", ink: [hud, "#hud-strat > div > span", "color"], plate: [hud, "#hud-rel, #hud-strat, #hud-inputs", "background"] },
  { what: "MIRROR chip (a button)", id: "#hud", ink: [tokens, "button", "color"], plate: [hud, "#hud-mirror-chip", "background"] },
  { what: "blue flag", id: "#hud", ink: [hud, '#hud-flag[data-flag="blue"]', "color"], plate: [hud, '#hud-flag[data-flag="blue"]', "background"] },
  { what: "red flag", id: "#hud", ink: [hud, "#hud-flag.flag-red", "color"], plate: [hud, "#hud-flag.flag-red", "background"] },
  { what: "broadcast tower (inherited ink)", id: "#hud", ink: [tokens, SCOPE_SEL, "color"], plate: [hud, "body.hud-prof-broadcast .hud-top", "background"] },
  { what: "metrics panel", id: "#game-metrics", ink: [hud, "#game-metrics", "color"], plate: [hud, "#game-metrics", "background"] },
  { what: "metrics bar buttons", id: "#game-metrics", ink: [hud, "#game-metrics-bar > button", "color"], plate: [hud, "#game-metrics", "background"] },
  // NON-TEXT (1.4.11, 3:1): the parts of a chip that carry its state.
  { what: "blue flag edge", nonText: true, id: "#hud", ink: [hud, '#hud-flag[data-flag="blue"]', "border-left", (v) => v.split(" ").pop()], plate: [hud, '#hud-flag[data-flag="blue"]', "background"] },
  { what: "red flag keyline", nonText: true, id: "#hud", ink: [hud, "#hud-flag.flag-red", "outline", (v) => v.split(" ").pop()], plate: [hud, "#hud-flag.flag-red", "background"] },
  ...[1, 2, 3].map((n) => ({ what: `damage level ${n}`, nonText: true, id: "#hud", ink: [hud, `#hud-damage [data-lvl="${n}"]`, "fill"], plate: [hud, "#hud-damage", "background"] })),
];
function src([rules, sel, prop, pick]) {
  const v = decl(rules, sel, prop);
  assert.ok(v, `${sel} must declare ${prop} (the overlay contrast table reads it)`);
  return pick ? pick(v) : v;
}
/** Every case's worst ratio over the scenes, for one theme. */
function measure(flags, opts) {
  const rows = [];
  for (const c of CASES) {
    const { get } = themeGetter(flags, c.id, opts);
    const plateVal = panelAt1(src(flags.includes("high") && c.hc ? c.hc : c.plate));
    const plate = resolve(plateVal, new Set(), get);
    const ink = resolve(src(c.ink), new Set(), get);
    let worst = Infinity, at = "";
    for (const [scene, h] of Object.entries(SCENES)) {
      const ground = over(plate, { rgb: hex(h), a: 1 });
      const r = ratio(over(ink, ground), ground);
      if (r < worst) { worst = r; at = scene; }
    }
    rows.push({ what: c.what, need: c.nonText ? 3 : 4.5, r: worst, at });
  }
  return rows;
}
const THEMES = {
  dark: [], light: ["light"], "system-light": ["system"],
  "light + high (SUNLIGHT)": ["light", "high"], "system-light + high": ["system", "high"], "dark + high": ["high"],
  "light + deutan": ["light", "deutan"], "light + tritan": ["light", "tritan"], "light + high + protan": ["light", "high", "protan"],
};

test("every token LIGHT re-points is restated, at its :root value, on every in-race overlay", () => {
  const light = ruleFor(tokens, ':root[data-ui-theme="light"]');
  assert.ok(light, "css/tokens.css must declare the LIGHT block");
  const scope = ruleFor(tokens, SCOPE_SEL);
  assert.ok(scope, `css/tokens.css must declare the race-chrome scope ${SCOPE_SEL}`);
  const missing = [], drift = [];
  for (const name of light.decls.keys()) {
    if (!scope.decls.has(name)) { missing.push(name); continue; }
    if (scope.decls.get(name) !== decl(tokens, ":root", name)) drift.push(`${name}: ${scope.decls.get(name)} vs :root ${decl(tokens, ":root", name)}`);
  }
  assert.deepEqual(missing, [], "LIGHT re-points these, and the race chrome does not restate them, so the light value leaks onto a dark plate");
  assert.deepEqual(drift, [], "the race chrome restates these with a value other than the :root (dark) one");
  // HIGH CONTRAST's :root block re-points some of the same tokens; the scope
  // restatement would undo it on the HUD unless the scoped HC block repeats it.
  const hcRoot = ruleFor(tokens, ':root[data-ui-contrast="high"]');
  const hcScope = ruleFor(tokens, `:root[data-ui-contrast="high"] ${SCOPE_SEL}`);
  assert.ok(hcRoot && hcScope, "css/tokens.css must declare HIGH CONTRAST on :root and inside the race-chrome scope");
  const undone = [...hcRoot.decls.keys()].filter((n) => scope.decls.has(n) && hcScope.decls.get(n) !== hcRoot.decls.get(n));
  assert.deepEqual(undone, [], "HIGH CONTRAST re-points these on :root; the scope must repeat the same expression or the HUD loses HIGH CONTRAST");
});

test("the radio card, readouts, chips, flags and metrics clear 4.5:1 (text) / 3:1 (state) in every theme", () => {
  const bad = [];
  for (const [theme, flags] of Object.entries(THEMES)) {
    for (const row of measure(flags)) {
      if (row.r < row.need) bad.push(`${theme}: ${row.what} ${row.r.toFixed(2)}:1 over ${row.at} (needs ${row.need})`);
    }
  }
  assert.deepEqual(bad, []);
});

test("anti-vacuity: the scope as it shipped before fails LIGHT the way it was reported", () => {
  // Before: #hud alone restated its INK (--text --dim --bg, the halo and the
  // hairlines) and no plate; #announce and #game-metrics restated nothing.
  // The same cascade cut back to that must reproduce the reported numbers, or
  // the test above could pass on a resolver that never looked at the theme.
  const INK_ONLY = new Set(["--text", "--dim", "--bg", "--hud-halo", "--plate-line", "--card-line"]);
  const keep = (id, n) => id === "#hud" && INK_ONLY.has(n);
  const rows = Object.fromEntries(measure(["light"], { keep }).map((r) => [r.what, r.r]));
  assert.ok(rows["RELATIVE / STRATEGY / INPUTS"] < 1.2, `RELATIVE without the scope measures ${rows["RELATIVE / STRATEGY / INPUTS"].toFixed(2)}:1; expected the shipped ~1.05:1`);
  assert.ok(rows["radio card words"] < 1.6, `the radio card without the scope measures ${rows["radio card words"].toFixed(2)}:1; expected the shipped 1.03-1.49:1`);
  assert.ok(rows["metrics panel"] < 1.6, `the metrics panel without the scope measures ${rows["metrics panel"].toFixed(2)}:1; expected the shipped ~1.46:1`);
});

test("colour vision: a WARNING never reads as a HIT, and damage levels 1 / 2 / 3 stay three colours", () => {
  // Lightness is the one channel every dichromacy keeps, so it is what is
  // asserted (OKLab L). deutan / protan once set --sec-slow and --slower to
  // the same #ee7733: penalty WARN looked like penalty HIT on the radio card,
  // and damage level 2 (an sRGB 50/50 of the two) collapsed onto both.
  const L = (c) => toOklab(c.rgb)[0];
  const lvl2 = decl(hud, '#hud-damage [data-lvl="2"]', "fill");
  const bad = [];
  for (const flags of [[], ["deutan"], ["protan"], ["tritan"]]) {
    const { get } = themeGetter(flags, "#hud");
    const warn = resolve("var(--sec-slow)", new Set(), get), hit = resolve("var(--slower)", new Set(), get);
    const mid = resolve(lvl2, new Set(), get);
    const name = flags[0] || "default";
    if (Math.abs(L(warn) - L(hit)) < 0.1) bad.push(`${name}: --sec-slow / --slower differ by ${Math.abs(L(warn) - L(hit)).toFixed(3)} L`);
    for (const [n, c] of [["1", warn], ["3", hit]]) {
      if (Math.abs(L(mid) - L(c)) < 0.05) bad.push(`${name}: damage level 2 is ${Math.abs(L(mid) - L(c)).toFixed(3)} L from level ${n}`);
    }
  }
  assert.deepEqual(bad, []);
});
