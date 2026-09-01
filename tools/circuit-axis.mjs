// circuit-axis — the CIRCUIT ASPECT axis for the fit tools, alongside
// @doc The `--circuits` axis for the two menu screens that draw a circuit (#select preview, #track-detail) in the fit tools.
// @skill survey-ui-matrix
// ui-scale-axis's UI SIZE axis.
//
// WHY. The two screens that draw a circuit map — #select's preview card and the
// #track-detail modal — were both in the layout-audit matrix from the day they
// were added, and a map still shipped squashed to a 128x255 sliver with its
// corner numbers piled into an unreadable blob. The matrix could not have
// caught it. It measures whichever circuit happens to be selected, which is
// Bahrain, whose aspect (0.67) is unremarkable; every defect in that pass only
// appeared at an extreme — Jeddah at 0.50, Singapore at 1.55. A matrix with no
// cell that can fail is not covering the axis, however many cells it has.
//
// The maths of the fit is guarded separately and cheaply by
// tests/unit/track-preview-plan.test.mjs. This axis is for what that test
// cannot see: the CSS and rendering around the numbers.

// Five circuits spanning the range the picker actually shows, tall to wide.
// The aspects are TrackMaps.aspect() as measured, not eyeballed from an
// outline; they are recorded here so a future edit can tell whether it still
// spans the range or has quietly collapsed onto one shape.
export const CIRCUITS = [
  ["jeddah", 0.50],
  ["monza", 0.58],
  ["bahrain", 0.67],
  ["baku", 1.37],
  ["singapore", 1.55],
];

export const CIRCUIT_HELP =
  "--circuits[=jeddah,baku]  also audit the map screens per circuit aspect (default: the selected circuit alone)";

// OFF BY DEFAULT, like --scale. An unflagged run stays byte-identical to what it
// was before this axis existed — a harness change that renamed every existing
// cell would make its own arrival look like a regression. Bare `--circuits`
// means the spread above.
export function parseCircuits(argv) {
  const a = argv.find((x) => x === "--circuits" || x.startsWith("--circuits="));
  if (!a) return [null];
  if (a === "--circuits") return CIRCUITS.map((c) => c[0]);
  const out = a.slice("--circuits=".length).split(",").map((s) => s.trim()).filter(Boolean);
  if (!out.length) throw new Error("--circuits= needs at least one circuit id");
  return out;
}

// JOINS THE SCREEN AXIS rather than becoming a third dimension of the grid — the
// same choice ui-scale-axis makes against the viewport axis, for the same
// reason: a cell keeps ONE id (`select#jeddah`), so the queue, the merge and the
// HTML table all keep working unchanged, and the per-circuit variants sit in
// their own rows next to the screen they came from.
export const circuitTag = (id) => (id == null ? "" : `#${id}`);

// Choose a circuit the way a player does — click its row in #sel-tracks.
// Reaching a state through the app's own controls rather than by writing its
// internals is what keeps the audit honest about routes that have moved; it is
// also why this takes a page rather than a store.
//
// A name that matches nothing is deliberately NOT thrown: the cell then measures
// whatever was selected and says which circuit it asked for in its own id, which
// is a better failure than losing the column to a typo.
export async function pickCircuit(page, id) {
  if (!id) return false;
  const norm = String(id).toLowerCase().replace(/[^a-z]/g, "");
  const hit = await page.evaluate((want) => {
    const rows = [...document.querySelectorAll('#sel-tracks [role="option"]')];
    const match = rows.find((r) => (r.dataset.track || r.textContent || "")
      .toLowerCase().replace(/[^a-z]/g, "").includes(want));
    if (match) { match.click(); return true; }
    return false;
  }, norm);
  // The preview redraws on a rAF after the click; the modal re-fits on a
  // ResizeObserver after that. Neither is instant and neither is slow.
  await page.waitForTimeout(250);
  return hit;
}
