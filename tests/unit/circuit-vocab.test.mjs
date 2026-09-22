// circuit-vocab — a circuit that authors a word the engine does not know gets
// the FALLBACK, silently, forever.
//
// WHY THIS EXISTS. The def files are data, and the engine looks their strings
// up in tables. Every lookup has a sensible fallback, so a typo never throws,
// never logs, and never fails a build check — `verify-track` reports `OK` and
// the circuit simply renders as something else. Two shipped cases, both found
// by enumeration on 2026-09-22 and both fixed in the same commit:
//
//   furniture.tree: "pine"   anderstorp, fuji, mont_tremblant, okayama, zolder
//     `pine` is in neither SPECIES nor the two aliases beside it, so the
//     dispatch in js/track/tracks.js fell through to "broad". Five conifer-belt
//     circuits — Sweden, Japan ×2, Québec, the Ardennes — grew rounded
//     broadleaf trees on the generic scatter pass. The conifer spelling is
//     "fir"; the other five Nordic/Alpine circuits already used it, which is
//     what makes this a typo rather than a choice.
//
//   standSet: ["stone", …]   dijon
//     `stone` is not a STAND_LIVERIES key, so grandstandEx's `lib[name] || null`
//     fell through to its hard-coded default shell — which is bit-identical to
//     the "steel" livery. Dijon's authored three-way livery rotation was really
//     a two-way one with double-weight grey.
//
// THE VALID SETS ARE READ OUT OF THE ENGINE, not restated here, because a
// hardcoded copy is the same silent-drift bug one level up: add a species to
// tracks.js and this test would start rejecting it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require(path.join(ROOT, "tools/track/verify-track.cjs"));

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/** Keys of an object literal `NAME = { a: …, b: … }` in a source file. */
function literalKeys(src, name) {
  const at = src.indexOf(name);
  assert.ok(at >= 0, `${name} not found — the engine moved; update this test's anchor`);
  const open = src.indexOf("{", at);
  let depth = 0, end = open;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (!depth) { end = i; break; } }
  }
  const body = src.slice(open + 1, end);
  const keys = new Set();
  // Top-level keys only, scanned CHARACTER-wise rather than line-wise: SPECIES
  // is a one-liner and STAND_LIVERIES is not, and a per-line scan finds exactly
  // one key in the former.
  const ID = /[A-Za-z_$][\w$]*/y;
  let d = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "{" || ch === "[") { d++; continue; }
    if (ch === "}" || ch === "]") { d--; continue; }
    if (d !== 0) continue;
    if (ch === "/" && (body[i + 1] === "/" || body[i + 1] === "*")) {   // skip comments
      const end2 = body[i + 1] === "/" ? body.indexOf("\n", i) : body.indexOf("*/", i) + 1;
      i = end2 < i ? body.length : end2;
      continue;
    }
    ID.lastIndex = i;
    const m = ID.exec(body);
    if (!m) continue;
    let j = ID.lastIndex;
    while (body[j] === " " || body[j] === "\t") j++;
    if (body[j] === ":") keys.add(m[0]);
    i = ID.lastIndex - 1;
  }
  assert.ok(keys.size, `${name} parsed to zero keys`);
  return keys;
}

test("every furniture.tree names a species the scatter dispatch honours", () => {
  const src = read("js/track/tracks.js");
  // js/track/tracks.js: `SPECIES[fz.tree] ? fz.tree : fz.tree === "palm" ? "palm"
  //                    : fz.tree === "fir" ? "fir" : … : "broad"`
  const valid = literalKeys(src, "SPECIES = ");
  for (const alias of ["palm", "fir", "broad"]) valid.add(alias);

  const Tracks = buildContext();
  const bad = [];
  for (const d of Tracks._vmContext.TrackDefs) {
    const t = d.furniture && d.furniture.tree;
    if (t != null && !valid.has(t)) bad.push(`${d.id}: tree "${t}"`);
  }
  assert.deepEqual(bad, [],
    `unknown tree species — each renders as the "broad" fallback.\n  ` +
    `${bad.join("\n  ")}\nvalid: ${[...valid].sort().join(", ")}`);
});

test("every standSet entry names a real grandstand livery", () => {
  const valid = literalKeys(read("js/track/scenery/data.js"), "STAND_LIVERIES = ");

  const Tracks = buildContext();
  const bad = [];
  for (const d of Tracks._vmContext.TrackDefs) {
    if (!Array.isArray(d.standSet)) continue;
    for (const s of d.standSet) if (!valid.has(s)) bad.push(`${d.id}: standSet "${s}"`);
  }
  assert.deepEqual(bad, [],
    `unknown grandstand livery — each falls through to grandstandEx's default shell,\n` +
    `which is the "steel" colour, so the circuit's rotation quietly loses a variant.\n  ` +
    `${bad.join("\n  ")}\nvalid: ${[...valid].sort().join(", ")}`);
});
