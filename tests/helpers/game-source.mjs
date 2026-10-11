/* game-source.mjs — read js/game.js AND every module carved out of it.
 *
 * WHY (R3-ARCHITECTURE-4, 2026-10-10). Over 130 test files read
 * `readFileSync("js/game.js")` and regex the text. Every extraction moves that
 * text: a POSITIVE pin goes red (the cost that makes each carve a 5-20-test
 * rewrite), and a NEGATIVE pin (`doesNotMatch(game, /x/)`) goes silently
 * vacuous — x left game.js, so "x is not done here" passes while the module it
 * moved to may well do x. ARCHITECTURE.md's "check for leftovers, three for
 * three" lesson, in test form. Code has been bent to keep slices valid
 * (game.js render(): "Inline the stop … so tests/unit/garage-arrival's render
 * prefix extract stays self-contained").
 *
 * So a pin reads the UNION: game.js plus every module game.js instantiates
 * (`X.create(` with X a manifest global — the "one Module.create(G) per file"
 * extraction pattern, AGENTS.md §Layout). Nothing is hardcoded: a new carve
 * that game.js wires with `create(` joins the union by itself, from the
 * manifest's files and game.js's own text.
 *
 *   gameSource()            game.js + carved modules, one string (cached)
 *   carvedFromGame()        the carved files, repo-relative, manifest order
 *   symbolSource(decl)      fnSource(decl) from WHICHEVER file declares it;
 *                           throws when no file or more than one does
 *
 * tests/unit/source-pin-hygiene.test.mjs ratchets the raw game.js reads.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { fnSource } from "./fn-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST = createRequire(import.meta.url)(path.join(ROOT, "tools/manifest.cjs"));
const GAME = "js/game.js";

// Rosters are arrays or {group: [files]} objects; take every js/ string either way.
const flat = (v) => Array.isArray(v) ? v.flatMap(flat)
  : (v && typeof v === "object") ? Object.values(v).flatMap(flat) : (typeof v === "string" ? [v] : []);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

let _carved = null, _union = null;

/** Repo-relative files of the modules game.js instantiates with `Global.create(`. */
export function carvedFromGame() {
  if (_carved) return _carved.slice();
  const files = [...new Set(Object.keys(MANIFEST).filter((k) => k === "FULL" || k === "DEFERRED" || /^LAZY_[A-Z_]+$/.test(k) && !/_EDGES$/.test(k))
    .flatMap((k) => flat(MANIFEST[k])))]
    .filter((f) => f.startsWith("js/") && f !== GAME && fs.existsSync(path.join(ROOT, f)));
  const byGlobal = new Map();
  for (const f of files) {
    const m = read(f).match(/^(?:const|var) ([A-Z][A-Za-z0-9_]*) = (?:\(function \(\) \{|\(\(\) => \{)/m);
    if (m && !byGlobal.has(m[1])) byGlobal.set(m[1], f);
  }
  const created = new Set([...read(GAME).matchAll(/\b([A-Z][A-Za-z0-9_]*)\.create\(/g)].map((m) => m[1]));
  _carved = files.filter((f) => [...created].some((g) => byGlobal.get(g) === f));
  if (_carved.length < 20) throw new Error(`game-source: only ${_carved.length} carved modules found — the derivation broke`);
  return _carved.slice();
}

/** game.js followed by every carved module, each headed by a `// ==== <file>` line. */
export function gameSource() {
  if (_union == null) {
    _union = [GAME, ...carvedFromGame()].map((f) => `// ==== ${f}\n${read(f)}`).join("\n");
  }
  return _union;
}

/** fnSource over the union: the one file whose text holds `decl` at a line start. */
export function symbolSource(decl) {
  const hits = [GAME, ...carvedFromGame()].filter((f) => {
    const src = read(f), i = src.indexOf(decl);
    return i >= 0 && /^[ \t]*$/.test(src.slice(src.lastIndexOf("\n", i) + 1, i));
  });
  if (hits.length !== 1) {
    throw new Error(`symbolSource: ${JSON.stringify(decl)} is declared in ${hits.length ? hits.join(", ") : "no file"} — `
      + (hits.length ? "pass a longer declaration (its parameter list)" : "it moved out of game.js's union, or was renamed"));
  }
  return fnSource(read(hits[0]), decl);
}
