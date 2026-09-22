#!/usr/bin/env node
// class-usage — the direction the component inventory never checked.
// @doc Finds classes APPLIED by index.html or js/ that no css/ rule defines (the opposite of the dead-class check).
// @section runner
//
// WHY THIS DIRECTION AND NOT THE OTHER ONE. `tests/unit/component-inventory.test.mjs`
// already guards DEFINED-but-unapplied: a rule in css/ that nothing wears. That
// is the cheap half — a dead rule costs bytes and nothing else. The expensive
// half is the reverse: an element wearing a class that no rule matches. There
// the markup LOOKS styled, the reviewer reads intent off the name, and the
// element silently inherits whatever its siblings give it. Three of the four
// findings of 2026-09-22 were this shape, and the sweep that found them was a
// one-off script that left no guard behind (docs/notes/DEFECT-LEDGER.md).
//
// A class with no rule is not automatically a defect. Three legitimate kinds:
//   * a STATE HOOK the JS queries (`closest(".x")`, `classList.contains("x")`)
//     but never styles — real API, no rule wanted;
//   * a compound whose SIBLING on the same element carries the layout, left in
//     place as a name for the reader;
//   * a name whose rule lives in a stylesheet this tool does not read.
// So the tool does not say "delete"; it says "nobody defined this", and KNOWN
// below carries the ones that were looked at, each with the reason. A new
// unexplained name fails the test in tests/unit/class-usage.test.mjs — which is
// the whole point: the finding above was possible only because nothing failed.
//
// EXTRACTION IS DELIBERATELY CONSERVATIVE. Anything interpolated (`${}`) or
// concatenated (`"hud-met-" +`) is skipped rather than guessed at, because a
// guessed half-name is a false positive and a false positive is how a lint gets
// switched off. Missing a dynamic name costs one finding; crying wolf costs the
// rule.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NAME = /^-?[_a-zA-Z][\w-]*$/;

// Applied somewhere, defined nowhere, and that is FINE — with the reason.
// A row here is a decision someone made; an unlisted name is one nobody has.
// Triaged 2026-09-22, one agent per group and each verdict re-checked against
// the selector named here. Two names LEFT this list that day rather than
// joining it: `hud-onboard` (deleted — a toggle whose CSS rule had been gone
// for eighteen days) and `pm-pad-tools` (given the rule it always needed —
// three welded buttons, measured at 0.0px apart). Everything below is a name
// that reads as a hook and is in fact decoration, with the selector that does
// the real work. Adding a row is a decision; leaving one out is a test failure.
export const KNOWN = {
  // Audio sheet. Both wrap rows that style themselves; every sibling group on
  // the sheet stacks with the same zero margins, so nothing is missing.
  "as-sub": "wrapper for #as-voices / #as-ann-voice; .set-row / .tune-row / .as-note style themselves",
  "as-voice": "voiceRow() wrapper (js/audio/panel.js); its rows carry every rule",
  // Career card modifier. The SIBLING modifier .cr-nextrace does have a rule
  // (align-items/gap) because its three short lines must not stretch; the
  // objective card's children are full-width, which .cr-card already does.
  "cr-objective": "modifier beside .cr-card, whose flex column is already correct here (cf. .cr-nextrace, which needs its override)",
  "cz-liv-row": "16 livery rows that also carry .cz-row; #customize .cz-row styles all of them",
  // Data Hub gauge cells. The generic builders emit `dh-gcell ` + a per-metric
  // name, and none of those names (dh-gspeed, dh-gthr, …) has a rule of its own
  // either — .dh-gcell carries the layout and the value classes carry the paint.
  "dh-gdrscell": "per-metric tag beside .dh-gcell, which carries the cell layout",
  "dh-gdeltacell": "per-metric tag beside .dh-gcell, which carries the cell layout",
  "hud-gap": "both #hud-gap-ahead / -behind are styled by .hud-gaps > div",
  "lt-preview-btn": "styled by .lt-preview-row .opt-btn; state is toggled by id",
  // The one name here that IS styled: .music-row button reaches it by element
  // type, which a name-only scan cannot see. Left in KNOWN rather than fixed,
  // because the rule is right where it belongs.
  "music-play": "styled indirectly by `.music-row button` (css/tuner.css)",
  // Display fold family. The rules are ID-scoped on purpose — the comment above
  // them in css/components.css says "ID-scoped so the class ratchet does not
  // move" — and tests/unit/ui-improve-pass.test.mjs pins pm-renderer-sub as the
  // marker that ADVANCED VISUALS belongs to the family.
  "pm-hud-sub": "Display fold family marker; #pm-hud-details carries the rules",
  "pm-renderer-sub": "Display fold family marker; #pm-display-adv / #pm-visual-tuners carry the rules",
  "pm-metrics-sub": "Display fold family marker; #pm-metrics-details carries the rules",
  "pm-metrics-sub-body": "styled by #pm-metrics-details > [role=\"group\"], the attribute set on the same element",
  "sel-chip-row": "the same element carries id sel-track-filter, which carries all the layout",
};

const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "");

// Every class NAME that appears in any selector in css/. Not "every class that
// can match an element" — a selector's combinators and specificity are beside
// the point here; the question is only whether the name was ever written down.
export function definedClasses(cssDir = path.join(ROOT, "css")) {
  const defs = new Set();
  for (const f of fs.readdirSync(cssDir).filter((x) => x.endsWith(".css"))) {
    const src = stripComments(fs.readFileSync(path.join(cssDir, f), "utf8"));
    for (const m of src.matchAll(/([^{}]+)\{/g)) {
      if (/^\s*@/.test(m[1])) continue;
      for (const c of m[1].matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) defs.add(c[1]);
    }
  }
  return defs;
}

function scanHtml(file, add) {
  const src = fs.readFileSync(file, "utf8");
  const site = path.basename(file);
  for (const m of src.matchAll(/class\s*=\s*"([^"]*)"/g)) add(m[1], site);
}

// The four ways this tree puts a class on an element. `Dom.el(tag, cls)` is the
// fourth and by far the busiest — every DOM-built screen goes through it, so a
// scan that reads only class= and classList sees about a third of the app.
function scanJs(dir, add, queried) {
  const files = fs.readdirSync(dir, { recursive: true }).map(String)
    .filter((p) => p.endsWith(".js") && !p.includes("vendor"));
  for (const rel of files) {
    const src = fs.readFileSync(path.join(dir, rel), "utf8");
    const site = "js/" + rel;
    for (const m of src.matchAll(/class\s*=\s*\\?["'`]([^"'`\\]*)\\?["'`]/g)) add(m[1], site);
    for (const m of src.matchAll(/className\s*=\s*["'`]([^"'`]*)["'`]/g)) add(m[1], site);
    // classList.add("a", "b") takes a list; toggle and replace take one name and
    // then something else, so only the first literal is a class. `contains` is
    // a READ, not a write — counting it as applied is how `fit-managed`, whose
    // only reader is sheet-shape.js's classList.contains, looked orphaned.
    for (const m of src.matchAll(/classList\s*\.\s*(add|remove|toggle|replace|contains)\s*\(([^)]*)\)/g)) {
      const list = m[1] === "add" || m[1] === "remove"
        ? [...m[2].matchAll(/(["'`])([\w-]+)\1(\s*\+)?/g)]
        : [...m[2].matchAll(/^\s*(["'`])([\w-]+)\1(\s*\+)?/g)];
      for (const one of list) {
        if (one[3]) continue;                       // concatenated prefix
        if (m[1] === "contains") queried.add(one[2]); else add(one[2], site);
      }
    }
    for (const m of src.matchAll(/\bel\s*\(\s*["'`][\w-]+["'`]\s*,\s*(["'`])([\w \-]*)\1(\s*\+)?/g)) {
      if (!m[3]) add(m[2], site);
    }
    for (const m of src.matchAll(/(?:querySelector|querySelectorAll|closest|matches|getElementsByClassName)\s*\(\s*["'`]([^"'`]*)["'`]/g)) {
      if (/getElementsByClassName/.test(m[0])) { if (NAME.test(m[1])) queried.add(m[1]); continue; }
      for (const c of m[1].matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) queried.add(c[1]);
    }
  }
}

// A class the SUITE addresses is as real an API as one the app queries:
// `.dh-class-rows` carries no rule and is read only by a spec locator, and
// deleting it as "unused" would take a browser test with it.
function scanTests(dir, queried) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir, { recursive: true }).map(String)
    .filter((p) => /\.(m?js|cjs)$/.test(p));
  for (const rel of files) {
    const src = fs.readFileSync(path.join(dir, rel), "utf8");
    for (const m of src.matchAll(/(?:locator|querySelector|querySelectorAll|closest|matches|\$\$?)\s*\(\s*["'`]([^"'`]*)["'`]/g)) {
      for (const c of m[1].matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) queried.add(c[1]);
    }
  }
}

export function sweep(root = ROOT) {
  const defs = definedClasses(path.join(root, "css"));
  const applied = new Map();
  const queried = new Set();
  const add = (value, site) => {
    if (/[${}]/.test(value)) return;          // interpolated — not a literal name
    for (const c of String(value).split(/\s+/)) {
      if (!c || !NAME.test(c)) continue;
      if (!applied.has(c)) applied.set(c, new Set());
      applied.get(c).add(site);
    }
  };
  scanHtml(path.join(root, "index.html"), add);
  scanJs(path.join(root, "js"), add, queried);
  scanTests(path.join(root, "tests"), queried);
  const undef = [...applied.keys()].filter((c) => !defs.has(c)).sort()
    .map((c) => ({ cls: c, sites: [...applied.get(c)].sort(), queried: queried.has(c) }));
  return { defined: defs, applied, queried, undef };
}

export function unexplained(root = ROOT) {
  return sweep(root).undef.filter((u) => !u.queried && !(u.cls in KNOWN));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { defined, applied, undef } = sweep();
  console.log(`defined ${defined.size}  applied ${applied.size}  applied-but-undefined ${undef.length}`);
  for (const u of undef) {
    const tag = u.queried ? "queried" : (u.cls in KNOWN ? "known" : "UNEXPLAINED");
    console.log(`  ${u.cls.padEnd(22)} ${tag.padEnd(12)} ${u.sites.slice(0, 3).join(", ")}`);
  }
  const bad = undef.filter((u) => !u.queried && !(u.cls in KNOWN));
  if (bad.length) { console.log(`\n${bad.length} unexplained`); process.exit(1); }
}
