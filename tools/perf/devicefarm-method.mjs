// @doc Device Farm harness method helpers (#3676): unit history and governor-tier-moved, kept pure so they are unit-tested.
// Pure helpers behind tools/perf/devicefarm-iphone.mjs rows. DEVICE-FARM-ANALYSIS-2026-10-24.md §5.

// #3676 (5): append one session to a unit's history. Returns how many sessions that unit had before this one; only a
// fresh unit (seen 0) is cold, because a Safari data clear keeps the pipeline cache (ledger row 13).
export function appendUnit(db, unit, entry) {
  const list = db[unit] || (db[unit] = []);
  const seen = list.length;
  list.push(entry);
  return seen;
}

// #3676 (4): did the auto-governor's tier change between two GOV reads? An fps window it moved under is discarded.
export function tierMoved(g0, g1) {
  return !!(g0 && g1 && g0.autoTier !== g1.autoTier);
}
