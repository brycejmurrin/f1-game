/** @doc Single source for "can this diff move circuit geometry?"
 *
 * ONE pattern, two consumers, written once in a syntax both speak:
 *   - .github/workflows/ci.yml reads GEOMETRY_ERE through `node -e` and hands
 *     it to `grep -qE` (its sweeps filter),
 *   - tools/ci/deploy.mjs imports GEOMETRY_PATHS for the same decision locally.
 *
 * It lived in both places until 2026-09-19, and the second copy was stale the
 * whole time: deploy.mjs still matched debris-world's PRE-RENAME path under
 * js/game/, the one tools/manifest.cjs's MOVED map records as the old name of
 * js/physics/debris-world.js. (Spelling that dead path out here would trip
 * docs-integrity's citation guard, correctly — its own comments describe their
 * examples for the same reason.) So the local gate SKIPPED test:sweeps on
 * exactly the edit CI runs them for: the fail-open the gate exists to close.
 *
 * Why the rename missed it is the general lesson. A path inside a REGEX
 * LITERAL is not a path to any tool that sweeps a rename — not move-tree, not
 * grep for imports, not the manifest. It is just characters, and characters
 * that no longer match anything fail SILENTLY: the filter says `false` and
 * nothing anywhere says it was asked the wrong question. One copy plus
 * deploy-tool.test.mjs's existence check is what makes that audible.
 *
 * The alternation is deliberately NARROWER than pick-tests.mjs's sweeps rules:
 * this answers "can the FLEET REBUILD change?", not "which groups does this
 * touch?". Widening it costs every deploy 10 minutes of SwiftShader.
 *
 * Syntax note: every construct here is valid in BOTH POSIX ERE and JS RegExp
 * (no `(?:`, no `\d`, no lookaround). That is what lets one string serve both.
 */

import { pathToFileURL } from "node:url";

export const GEOMETRY_ERE =
  "^(js/track/|js/circuits/|tools/(track|lib)/|js/car/|js/game\\.js$|js/physics/debris-world\\.js$)";

export const GEOMETRY_PATHS = new RegExp(GEOMETRY_ERE);

/** The alternatives this pattern names, split by shape, for the existence test
 *  in geometry-paths.test.mjs. `files` are `$`-anchored literals (one exact
 *  path); `dirs` are prefixes ending in `/`. Anything else is a pattern the
 *  test cannot check, and it fails rather than passing it over. */
export function namedPaths() {
  const body = GEOMETRY_ERE.replace(/^\^\(/, "").replace(/\)$/, "");
  const files = [], dirs = [], other = [];
  for (const alt of splitTop(body)) {
    const lit = alt.replace(/\\\./g, ".");
    if (lit.endsWith("$")) files.push(lit.slice(0, -1));
    else if (lit.endsWith("/") && !/[()|]/.test(lit)) dirs.push(lit);
    else if (/^[a-z]+\/\([a-z|]+\)\/$/.test(lit)) {                 // tools/(track|lib)/
      const [, head, inner] = lit.match(/^([a-z]+)\/\(([a-z|]+)\)\/$/);
      for (const part of inner.split("|")) dirs.push(`${head}/${part}/`);
    } else other.push(alt);
  }
  return { files, dirs, other };
}

/** Split an alternation on its TOP-LEVEL `|` only, so `tools/(track|lib)/`
 *  stays one alternative instead of becoming two broken halves. */
function splitTop(s) {
  const out = [];
  let depth = 0, cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") { cur += c + (s[++i] || ""); continue; }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "|" && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

// `node tools/ci/geometry-paths.mjs --ere` prints the pattern for ci.yml's grep.
// Guarded on being the ENTRY module: an importer with its own --ere flag
// (deploy.mjs --json writes a machine verdict to stdout) must not have this
// printed into its output.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
    && process.argv[2] === "--ere") process.stdout.write(GEOMETRY_ERE);
