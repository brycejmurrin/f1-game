// @doc Offline summaries of saved explorer JSON (replay bundles, inspections); no browser, no inference beyond the data.
/** Stable group id of a control: its id/class prefix before the first '-' ("#pm-uitheme-sel" -> "pm"), else its role. */
export function groupId(control) {
  const m = /^#([A-Za-z0-9]+)[-_]/.exec(control.selector || "") || /^#([A-Za-z]+)\d*$/.exec(control.selector || "");
  return m ? m[1].toLowerCase() : `role:${control.role || "unknown"}`;
}

/** Unmapped controls by group id, names only; status stays "unknown" and no binding is inferred from a label. */
export function groupUnmapped(report) {
  const records = report.records || [{ inspection: report }];
  const lines = [];
  for (const r of records) {
    const i = r.inspection || r, groups = new Map();
    for (const c of i.controls || []) {
      if (c.binding?.status !== "unmapped") continue;
      const g = groupId(c);
      groups.set(g, [...(groups.get(g) || []), c.name || c.selector]);
    }
    const v = r.requestedViewport ? `${r.requestedViewport.width}x${r.requestedViewport.height}` : "?";
    const total = [...groups.values()].reduce((n, a) => n + a.length, 0);
    lines.push(`unmapped\t${v}\tgroups=${groups.size}; controls=${total}; status=unknown`);
    for (const [g, names] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) lines.push(`  ${g}\t${names.length}\t${names.join(" | ")}`);
  }
  return lines.join("\n");
}

/** Final cumulative action history per scenario: checkpoint records repeat earlier actions, so only the last one counts. */
function finalHistories(input) {
  if (Array.isArray(input.actions)) return [{ id: input.id || "scenario", actions: input.actions }];
  const best = new Map();
  for (const cap of input.capabilities || []) for (const r of cap.records || []) {
    if (!Array.isArray(r.actions)) continue;
    const key = `${cap.id}:${String(r.id).replace(/-(final|\d+)$/, "")}`, cur = best.get(key);
    if (!cur || r.actions.length >= cur.actions.length) best.set(key, { id: key, actions: r.actions });
  }
  return [...best.values()];
}

export function summarizeReplay(input) {
  const out = [];
  for (const h of finalHistories(input)) {
    const types = {};
    let lastReload = -1, binding = 0, other = 0, afterReload = 0;
    h.actions.forEach((a, n) => { types[a.type] = (types[a.type] || 0) + 1; if (a.type === "reload") lastReload = n; });
    h.actions.forEach((a, n) => {
      if (a.type !== "assert") return;
      if (a.oracle?.type === "binding") binding++; else other++;
      if (n > lastReload && lastReload >= 0) afterReload++;
    });
    out.push({ id: h.id, actions: h.actions.length, byType: types, currentBindings: binding, actionAssertions: other, assertionsAfterReload: afterReload });
  }
  return out;
}

export function formatReplaySummary(rows) {
  return rows.map(r => `${r.id}\tactions=${r.actions} (${Object.entries(r.byType).map(([k, n]) => `${k}:${n}`).join(",") || "none"})\tcurrentBindings=${r.currentBindings}\tactionAssertions=${r.actionAssertions}\tassertionsAfterReload=${r.assertionsAfterReload}`).join("\n") || "no action history";
}
