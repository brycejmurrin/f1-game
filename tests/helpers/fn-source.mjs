/* fn-source.mjs — extract a top-level function's REAL body from a source file.
 *
 * Why this exists: `src.slice(i, i + 2200)` was how tests read a function out
 * of js/game.js, and on 2026-09-02 it took the deploy branch red. `quitToMenu`
 * grew past 2200 chars as sessions added IncidentSim.reset()/DebrisWorld.reset()
 * and their comments, so `netLobby.cancel()` — still present, still correct —
 * moved to +2605 and fell outside the window. The assertion failed for a
 * behaviour that had not changed, pages.yml runs 1888/1889 failed, and the
 * live site stopped updating. The session branch was 29 characters from the
 * same failure.
 *
 * A magic window is a test that silently stops reading what it claims to read.
 * Bound the extraction by the CODE's structure instead: this repo formats
 * top-level functions with the closing brace at column 0, which is also immune
 * to braces inside strings and comments (a depth counter is not). Both methods
 * were checked against js/game.js on two branches and agree exactly.
 */

/** fnSource(src, decl) -> the full text of a top-level function, decl included.
 *  Throws rather than returning a truncated or whole-file slice: a guard that
 *  quietly reads the wrong span is the failure this module exists to prevent. */
export function fnSource(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) throw new Error(`fnSource: declaration not found: ${decl}`);
  const rest = src.slice(i);
  // First line that is exactly "}" at column 0 — the end of a top-level function.
  const m = /\n\}/.exec(rest);
  if (!m) throw new Error(`fnSource: no column-0 closing brace after ${decl} — is it still top-level?`);
  return rest.slice(0, m.index + 2);
}
