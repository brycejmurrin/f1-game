// @doc The one parser of a PR body's fleet block: first value of a key wins, HTML comments and placeholders skipped.
//
// WHY (system audit 4, verify-31-39 #37a/#37b, 2026-10-26): four tools read the block four ways. ready-gate and
// fleet-owner kept the FIRST `worker:`, fleet-board-snapshot the LAST, pr-body listed both; pr-body also read and
// edited a block inside `<!-- -->` (the template's example) while the other three skipped it. One parser here,
// one semantics: the first ```fleet block OUTSIDE HTML comments, the first value of each key, `<placeholder>` values
// and trailing ` # comments` dropped. ready-gate (fleetBlock) is the remaining caller to switch.
//
//   import { fleetBlock, fleetEntries, fleetBlockSpan } from "../lib/fleet-block.mjs";
//   fleetBlock(body)      // { fleet: "A", worker: "claude:session_…", merger: "D", … }  ({} when absent)
//   fleetEntries(body)    // [["fleet","A"], ["worker","…"], …] every line, in order (a key may repeat)
//   fleetBlockSpan(body)  // { start, end, inner } raw offsets of that block, or null (for an in-place edit)

/** Blank every HTML comment (an unclosed `<!--` runs to the end, as GitHub renders it), keeping offsets. Pure. */
export const maskComments = (s) => String(s || "").replace(/<!--[\s\S]*?(?:-->|$)/g, (m) => m.replace(/[^\n]/g, " "));

const KV = /^\s*([a-z][a-z0-9-]*)[ \t]*:[ \t]*(\S.*?)(?:[ \t]+#.*)?\s*$/i;

/** Raw offsets of the first ```fleet block outside HTML comments: [start, end) covers the fences. Pure. */
export function fleetBlockSpan(body) {
  const raw = String(body || "");
  const m = /```fleet[ \t]*\r?\n([\s\S]*?)```/.exec(maskComments(raw));
  if (!m) return null;
  const innerAt = m.index + m[0].indexOf("\n") + 1;
  return { start: m.index, end: m.index + m[0].length, inner: raw.slice(innerAt, innerAt + m[1].length) };
}

/** Every `key: value` line of the block, in order; keys lower-cased; placeholders (`<…>`) and empties skipped. Pure. */
export function fleetEntries(body) {
  const span = fleetBlockSpan(body);
  if (!span) return [];
  return span.inner.split(/\r?\n/).map((l) => KV.exec(l)).filter((kv) => kv && kv[2] && !kv[2].startsWith("<"))
    .map((kv) => [kv[1].toLowerCase(), kv[2].trim()]);
}

/** The block as an object, first value of each key winning. Pure. */
export function fleetBlock(body) {
  const out = {};
  for (const [k, v] of fleetEntries(body)) if (out[k] == null) out[k] = v;
  return out;
}
