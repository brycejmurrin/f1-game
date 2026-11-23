// circuit-scope.cjs — APEX_CIRCUITS, honoured in one place by every fleet sweep.
// @doc `scope(ids)` keeps the circuits APEX_CIRCUITS names (all when unset); audit `--all` and sweep loops read it.
// Full description: `scope(ids)` keeps the circuits APEX_CIRCUITS names (all of them when unset): the audit CLIs' `--all`
// and the sweep suites' roster loops read it, so a circuit-only PR sweeps one circuit, not 52.
// @section runner
//
// THE FLEET REBUILT FOR ONE CIRCUIT (2026-09-30). `test:sweeps` is ten
// suites that each rebuild every circuit — 52 builds, 15 minutes on a ready
// PR and again on the train — and 13 of the branches racing for runner slots
// on 2026-09-29 were single-circuit scenery waves. The browser gate already
// narrows tracks-walls and elevation-tracks-vm with APEX_CIRCUITS (comma list
// of ids, set by ci.yml from tools/ci/select-specs.mjs's circuitsTouched());
// this is the same contract for the node sweeps: the CLIs' `--all` resolve
// their roster through scope(), and each suite's "measured the whole roster"
// anti-vacuity assertion compares against the SCOPED roster, so a narrowed
// run still proves it measured everything it was asked for.
//
// Unset means every circuit — every local run, the deploy push, the train
// and the nightly are unchanged. Only ci.yml's sweeps job sets it, and only
// on a pull request whose every changed path is one circuit's own files.
const SCOPE = (process.env.APEX_CIRCUITS || "").split(",").map((s) => s.trim()).filter(Boolean);

/** The ids APEX_CIRCUITS keeps, in the caller's order; all of them when unset. */
function scope(ids) {
  return SCOPE.length ? ids.filter((id) => SCOPE.includes(id)) : ids;
}
const scoped = () => SCOPE.length > 0;

/** scope() for a CLI's `--all`: throws when APEX_CIRCUITS is set but matches
 *  NONE of `ids` (2026-11-10: `APEX_CIRCUITS=zzz float-audit --all` printed
 *  "All 0 circuits clean" and exited 0). The sweep SUITES keep scope(): their
 *  floor already expects the scoped count, and a CI scope naming a circuit the
 *  diff deleted must not throw there. */
function scopeAll(ids, tool = "this tool") {
  const out = scope(ids);
  if (SCOPE.length && !out.length)
    throw new Error(`${tool}: APEX_CIRCUITS=${SCOPE.join(",")} matches none of the ${ids.length} circuits — nothing would be checked`);
  return out;
}

/** The named ids that are not circuits. A CLI that filters its roster by
 *  positional ids must refuse an unknown one rather than check nothing
 *  (`centreline-kinks nosuch --gate` exited 0). */
function unknownIds(named, ids) {
  const known = new Set(ids);
  return named.filter((id) => !known.has(id));
}
/** Throws naming every unknown id (and a few valid ones) — see unknownIds(). */
function requireKnown(named, ids, tool = "this tool") {
  const bad = unknownIds(named, ids);
  if (bad.length)
    throw new Error(`${tool}: unknown circuit id(s) ${bad.map((b) => JSON.stringify(b)).join(", ")} — valid ids: ${ids.join(", ")}`);
  return named;
}

/** APEX_CIRCUIT_SHARD=i/n (2026-09-30): every n-th id starting at the i-th,
 *  so n runners can each build a disjoint part of one script's roster
 *  (ci.yml's vm-a1 / vm-a2 slices are 1/2 and 2/2 of test:game-vm-a).
 *  Unset or malformed-empty keeps every id; a malformed value throws rather
 *  than silently running the whole fleet twice. Applied AFTER scope(), so the
 *  shards of a scoped list are still a partition of that list. */
function shard(ids, spec = process.env.APEX_CIRCUIT_SHARD || "") {
  return ids.filter(inShard(spec));
}
/** The `(id, index) => boolean` behind shard(), for a suite that must stay a
 *  `.filter(...)` chain: tools/ci/select-budget.mjs counts a per-circuit
 *  test loop STATICALLY and reads `.filter` as length-keeping, but an
 *  unknown call as one test — `shard(list)` would count the elevation twin
 *  as 7 declared tests against its spec's 47 and fail the twin drift check. */
function inShard(spec = process.env.APEX_CIRCUIT_SHARD || "") {
  const s = String(spec).trim();
  if (!s) return () => true;
  const m = /^(\d+)\/(\d+)$/.exec(s);
  const i = m ? Number(m[1]) : NaN, n = m ? Number(m[2]) : NaN;
  if (!(i >= 1 && n >= 1 && i <= n)) throw new Error(`APEX_CIRCUIT_SHARD=${s}: want i/n with 1 <= i <= n`);
  return (_, k) => k % n === i - 1;
}

module.exports = { SCOPE, scope, scoped, scopeAll, unknownIds, requireKnown, shard, inShard };
