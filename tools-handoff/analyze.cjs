// Offline analysis of scan-*.json: labels, silent grey-outs, parent-off candidates.
const fs = require("fs");
const files = process.argv.slice(2);
const norm = (s) => String(s || "").replace(/[^A-Za-z0-9 %&/+-]/g, "").trim();
const caseOf = (s) => { const l = s.replace(/[^A-Za-z]/g, ""); if (!l) return "none"; if (l === l.toUpperCase()) return "UPPER"; if (l === l.toLowerCase()) return "lower"; return /^[A-Z][a-z]/.test(l) ? "Mixed" : "mixed"; };
const OFF = /^(off|none|hidden|hide|no|0|disabled|never)$/i;
const report = {};
for (const f of files) {
  const r = JSON.parse(fs.readFileSync(f, "utf8"));
  const vp = r.viewport, crossLabel = new Map();
  for (const [id, s] of Object.entries(r.screens)) {
    const out = report[id] || (report[id] = { name: s.name, findings: [] });
    if (s.error) { out.findings.push({ sev: "INFO", kind: "scan-error", vp, text: s.error.slice(0, 120) }); continue; }
    const ctl = s.controls || [];
    // 1. duplicate visible labels on one screen (same text, different rows) — action buttons only count when the row also matches
    const byLabel = new Map();
    for (const c of ctl) { const k = norm(c.label).toUpperCase(); if (!k || k.length < 2) continue; (byLabel.get(k) || byLabel.set(k, []).get(k)).push(c); }
    for (const [k, cs] of byLabel) {
      if (cs.length < 2) continue;
      const rows = new Set(cs.map((c) => c.row));
      const pills = cs.every((c) => c.inGroup);
      if (pills && rows.size === cs.length) continue;            // ON/OFF in different rows: expected
      if (rows.size === 1 && cs.length > 1 && !pills) out.findings.push({ sev: "MED", kind: "duplicate-label", vp, text: `"${k}" ×${cs.length} in one row (${[...rows][0] || "?"})` });
      else if (!pills) out.findings.push({ sev: "LOW", kind: "duplicate-label", vp, text: `"${k}" ×${cs.length} on screen (rows: ${[...rows].filter(Boolean).slice(0, 4).join(" | ") || "unlabelled"})` });
    }
    // 2. row labels repeated on one screen (the same setting offered twice)
    const rowCount = new Map();
    for (const c of ctl) if (c.row) { const k = norm(c.row).toUpperCase(); if (!rowCount.has(k)) rowCount.set(k, new Set()); rowCount.get(k).add(c.section); }
    for (const [k, secs] of rowCount) if (secs.size > 1) out.findings.push({ sev: "MED", kind: "setting-twice", vp, text: `row "${k}" appears in sections: ${[...secs].map((x) => x || "(none)").join(" | ")}` });
    // 3. case consistency of row labels and pill text
    const rowCases = new Map();
    for (const c of ctl) if (c.row) rowCases.set(c.row, caseOf(c.row));
    const counts = {}; for (const v of rowCases.values()) counts[v] = (counts[v] || 0) + 1;
    const major = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (major) for (const [row, cs] of rowCases) if (cs !== major[0] && cs !== "none" && major[1] >= 3) out.findings.push({ sev: "LOW", kind: "label-case", vp, text: `row "${row}" is ${cs}; ${major[1]} other rows are ${major[0]}` });
    // 4. disabled with no visible / announced reason
    for (const c of ctl) if (c.disabled && !c.describedBy && !/UNDO|REDO|PREV|NEXT|BACK/i.test(c.label))
      out.findings.push({ sev: c.title ? "MED" : "HIGH", kind: "silent-grey", vp, text: `"${c.label.slice(0, 40)}" (${c.row || c.section || "?"}) greyed ${c.title ? "— reason only in a hover title: " + c.title.slice(0, 70) : "with no reason at all"}` });
    // 5. a parent switched to an off-like value that greys nothing: children of the same section stay live
    for (const fl of s.flips || []) {
      const v = norm(fl.label);
      if (!OFF.test(v) || fl.skip || fl.error) continue;
      const sib = ctl.filter((c) => c.section && c.section === (ctl[fl.i] || {}).section && c.row !== fl.row && !c.disabled);
      if ((fl.deps || []).length === 0 && sib.length) out.findings.push({ sev: "CAND", kind: "off-greys-nothing", vp, text: `${fl.row || "?"} → ${v.toUpperCase()} greys none of the ${sib.length} other controls in "${(ctl[fl.i] || {}).section}" (${[...new Set(sib.map((c) => c.row))].filter(Boolean).slice(0, 5).join(", ")})` });
    }
    for (const c of ctl) { const k = norm(c.row || c.label).toUpperCase(); if (!k || c.inGroup && !c.row) continue; if (!crossLabel.has(k)) crossLabel.set(k, new Set()); crossLabel.get(k).add(id); }
  }
  report.__cross = report.__cross || { findings: [] };
  for (const [k, ids] of crossLabel) if (ids.size > 1 && !/^(BACK|CLOSE|DONE|ON|OFF|RESET|CANCEL|OK|HELP|SETTINGS|MENU)$/.test(k)) report.__cross.findings.push({ sev: "INFO", kind: "on-several-screens", vp, text: `"${k}" on ${[...ids].join(", ")}` });
}
fs.writeFileSync("scratch/ui-scan/findings.json", JSON.stringify(report, null, 1));
for (const [id, r] of Object.entries(report)) {
  const f = r.findings.filter((x) => x.sev !== "INFO" || id === "__cross");
  if (!f.length) continue;
  console.log(`\n## ${id} (${r.name || ""})`);
  for (const x of f.slice(0, 40)) console.log(`- [${x.sev}] ${x.kind} @${x.vp}: ${x.text}`);
}
