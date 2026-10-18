// LAYOUT AUDIT DIFF — compare two layout-audit audit.json files cell by cell.
// @doc Library behind `layout-audit --diff <before.json>`: added / fixed findings per screen|viewport cell (no browser).
// @skill survey-ui-matrix
//
// A finding is one entry of a category layout-audit counts as "something to
// look at": clipped, offscreen, docOverflowX, errors, tinyTaps, underHardware,
// starved. Identity is category + element (+ the clipping ancestor for
// `clipped`), so a box that moved a few px is not a new finding, but a control
// that newly clips is. A cell skipped in either run is listed as unmeasured,
// never as a pass.
import fs from "node:fs";

const LISTS = ["clipped", "offscreen", "tinyTaps", "underHardware", "starved", "errors"];

/** The finding keys of one audit row, as a Set of strings. */
export function rowFindings(row) {
  const out = new Set();
  for (const cat of LISTS) {
    for (const f of row[cat] || []) {
      if (typeof f === "string") out.add(`${cat}: ${f}`);
      else out.add(`${cat}: ${f.el}${f.by ? " past " + f.by : ""}`);
    }
  }
  if (row.docOverflowX) out.add("docOverflowX");
  return out;
}

const cellKey = (r) => r.screen + "|" + r.viewport;

/**
 * Diff two parsed audit.json objects ({rows:[…]}).
 * Returns {added, removed, skipped, missing, compared}: added/removed are
 * [{cell, finding}]; skipped = cells skipped in either run; missing = cells in
 * `before` absent from `after` (outside the re-run's scope).
 */
export function diffAudits(before, after) {
  const b = new Map((before.rows || []).map((r) => [cellKey(r), r]));
  const a = new Map((after.rows || []).map((r) => [cellKey(r), r]));
  const added = [], removed = [], skipped = [], missing = [];
  let compared = 0;
  for (const [cell, ar] of a) {
    const br = b.get(cell);
    if (ar.skipped || (br && br.skipped)) { skipped.push(cell); continue; }
    const af = rowFindings(ar);
    const bf = br ? rowFindings(br) : new Set();
    compared++;
    for (const f of af) if (!bf.has(f)) added.push({ cell, finding: f });
    for (const f of bf) if (!af.has(f)) removed.push({ cell, finding: f });
  }
  for (const cell of b.keys()) if (!a.has(cell)) missing.push(cell);
  return { added, removed, skipped, missing, compared };
}

/** Human summary lines; the last line starts `= diff`. */
export function formatDiff(d) {
  const lines = [];
  for (const x of d.added) lines.push(`+ ${x.cell}  ${x.finding}`);
  for (const x of d.removed) lines.push(`- ${x.cell}  ${x.finding}`);
  for (const c of d.skipped) lines.push(`? ${c}  skipped (unmeasured; re-run that cell alone)`);
  if (d.missing.length) lines.push(`  ${d.missing.length} baseline cell(s) not in the new run (out of scope)`);
  lines.push(`= diff ${d.added.length ? "NEW" : "ok"}: ${d.compared} cells compared, `
    + `${d.added.length} new, ${d.removed.length} fixed, ${d.skipped.length} skipped`);
  return lines;
}

/** CLI body: prints the diff; returns 1 when `after` has a finding `before` lacked. */
export function runDiff(beforePath, afterPath) {
  const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
  const d = diffAudits(read(beforePath), read(afterPath));
  for (const l of formatDiff(d)) console.log(l);
  return d.added.length ? 1 : 0;
}
