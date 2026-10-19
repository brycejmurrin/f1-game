// @ts-check
// The per-circuit boundary walk shared by tests/specs/tracks-walls-a.spec.js and
// -b.spec.js. The two files are shards of ONE roster (shardIds, 2 ways) so
// select-specs can pack each leg; the conditions live here once, so the halves
// cannot drift apart (TK2-11). The spec keeps the visible `expect` (assert-audit
// follows same-file helpers only): it asserts this list is empty.

/** Build `id` and read its boundary stats. @param {import("@playwright/test").Page} page @param {string} id */
export async function readBoundaryStats(page, id) {
  return page.evaluate(async (tid) => {
    await window.__apex.race(tid, "day", "dry");
    return window.__apex.wallStats();
  }, id);
}

/** Every violated boundary condition for `id` (empty = sane). Same seven conditions as the
 *  original per-file expects: built, no NaN, minB > 1, maxB < 60, pit bounded (< 24, > minB), minOverHw > -1.5. */
export function boundaryViolations(id, s) {
  if (s == null) return [`${id} not built`];
  const v = [];
  if (s.anyNaN !== false) v.push(`${id} NaN boundary`);
  if (!(s.minB > 1)) v.push(`${id} keeps no track (minB ${s.minB})`);
  if (!(s.maxB < 60)) v.push(`${id} unbounded (maxB ${s.maxB})`);
  if (s.maxPitB != null) {
    if (!(s.maxPitB < 24)) v.push(`${id} pit complex unbounded (maxPitB ${s.maxPitB})`);
    if (!(s.maxPitB > s.minB)) v.push(`${id} pit complex does not reach past the road (maxPitB ${s.maxPitB} <= minB ${s.minB})`);
  }
  if (!(s.minOverHw > -1.5)) v.push(`${id} boundary deep inside edge (minOverHw ${s.minOverHw})`);
  return v;
}
