#!/usr/bin/env node
// audit-circuit.cjs — ONE circuit's offline health: every per-circuit audit
// against its baseline, in one call, no browser.
// @doc One circuit's offline audits in one call (verify/float/clip/coplanar/props/ground) vs baselines; `--json`, `--checks`.
// @skill survey-track
//
//   node tools/track/audit-circuit.cjs <trackId>                      # every check, a line each, exit 1 on any FAIL
//   node tools/track/audit-circuit.cjs <trackId> --json               # {id, ok, ms, checks: {name: {ok, ms, summary, ...}}}
//   node tools/track/audit-circuit.cjs <trackId> --checks verify,float  # a subset (the names below)
//
// WHY: new-track, scenery-dress and survey-track each copy the same five-command
// block with different subsets and timings, and the round-2 skill drive
// (docs/notes/SKILL-TOOLING-PROPOSALS-2026-10-05.md §3) ran all of them in
// 10.6 s — one call, one verdict, and `apex_track_audit {checks}` wraps it.
//
// The checks and what "ok" means (each is the audit's own single-track mode):
//   verify    tools/track/verify-track.cjs <id> --quiet     builds road/terrain/props/gate in a VM; a THROW fails
//   float     tools/track/float-audit.cjs <id> --json       unsupported floating clusters ≤ tools/track/float-baseline.json cap (count vs cap, not the exit code)
//   clip      tools/track/clip-audit.cjs <id>               severe prop-vs-prop spots ≤ tools/track/clip-baseline.json
//   coplanar  tools/track/coplanar-audit.cjs <id>           same-facing coplanar spots ≤ tools/track/coplanar-baseline.json
//   props     tools/track/props-tris.cjs <id> --json        the hidden-face compaction is render-identical
//   ground    tools/track/ground-audit.cjs <id> --json      buried / unsupported / flatCoplanar ≤ tests/data/scenery-audit-baseline.json
// A circuit missing from a baseline reads as cap 0 for every check (clip /
// coplanar / float / ground) — same as each audit's own --gate mode.

"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const ORDER = ["verify", "float", "clip", "coplanar", "props", "ground"];
const USAGE = "usage: node tools/track/audit-circuit.cjs <trackId> [--json] [--checks " + ORDER.join(",") + "]";

function readJson(rel, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); } catch (_) { return fallback; }
}
function run(rel, args) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(ROOT, rel), ...args], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "", ms: Date.now() - t0, error: r.error ? String(r.error.message) : null };
}
function lastJson(text) {
  // The audits print their JSON last; anything before it is progress.
  const i = Math.max(text.lastIndexOf("\n{"), text.lastIndexOf("\n["), text.startsWith("{") || text.startsWith("[") ? 0 : -1);
  if (i < 0) return null;
  try { return JSON.parse(text.slice(i).trim()); } catch (_) { return null; }
}

// float-audit exits 1 on ANY floater (its own gate is "none"), so the exit code
// cannot be the verdict for a circuit whose cap is non-zero: madrid, donington
// and mexico (cap 2, measured 2) printed float:FAIL forever. The verdict is the
// count against the cap; a real tool failure (spawn error, usage exit 2, a
// crash with no JSON) still fails.
function floatOk(r, n, cap) {
  return !r.error && (r.status === 0 || r.status === 1) && n != null && n <= cap;
}

const CHECKS = {
  verify(id) {
    const r = run("tools/track/verify-track.cjs", [id, "--quiet"]);
    const line = (r.stdout + r.stderr).trim().split("\n").filter(Boolean).pop() || "";
    return { ok: r.status === 0, ms: r.ms, summary: line.slice(0, 200) };
  },
  float(id) {
    const r = run("tools/track/float-audit.cjs", [id, "--json"]);
    const j = lastJson(r.stdout), cap = readJson("tools/track/float-baseline.json", {})[id] || 0;
    const n = j && Array.isArray(j.floating) ? j.floating.length : null;
    return { ok: floatOk(r, n, cap), ms: r.ms, floating: n, cap,
      summary: n == null ? "no JSON from float-audit" : `${n} unsupported floating cluster(s), cap ${cap}` };
  },
  clip(id) {
    const r = run("tools/track/clip-audit.cjs", [id]);
    const m = /(\d+) severe spot\(s\)/.exec(r.stdout), cap = readJson("tools/track/clip-baseline.json", {})[id] || 0;
    const n = m ? Number(m[1]) : null;
    return { ok: r.status === 0 && n != null && n <= cap, ms: r.ms, severe: n, cap,
      summary: n == null ? "no severe-spot line from clip-audit" : `${n} severe spot(s), baseline ${cap}` };
  },
  coplanar(id) {
    const r = run("tools/track/coplanar-audit.cjs", [id]);
    const m = /(\d+) spot\(s\)/.exec(r.stdout), cap = readJson("tools/track/coplanar-baseline.json", {})[id] || 0;
    const n = m ? Number(m[1]) : null;
    return { ok: r.status === 0 && n != null && n <= cap, ms: r.ms, spots: n, cap,
      summary: n == null ? "no spot line from coplanar-audit" : `${n} same-facing coplanar spot(s), baseline ${cap}` };
  },
  props(id) {
    const r = run("tools/track/props-tris.cjs", [id, "--json"]);
    const j = lastJson(r.stdout), row = Array.isArray(j) ? j.find((x) => x && x.id === id) : j;
    const identical = row ? row.identical === true : null;
    return { ok: r.status === 0 && identical === true, ms: r.ms, tris: row ? row.tris : null, identical,
      summary: row ? `${row.tris} tris after compaction, identical=${row.identical}` : "no JSON from props-tris" };
  },
  ground(id) {
    const r = run("tools/track/ground-audit.cjs", [id, "--json"]);
    const j = lastJson(r.stdout), row = Array.isArray(j) ? j.find((x) => x && x.id === id) : null;
    const base = readJson("tests/data/scenery-audit-baseline.json", {});
    const over = [];
    if (row && row.counts) {
      // Absent circuit => cap 0 (ground-audit.cjs --gate); never "no cap".
      for (const k of Object.keys(row.counts)) {
        const cap = (base[k] && typeof base[k][id] === "number") ? base[k][id] : 0;
        if (row.counts[k] > cap) over.push(`${k} ${row.counts[k]} > ${cap}`);
      }
    }
    return { ok: r.status === 0 && !!row && !over.length, ms: r.ms, counts: row ? row.counts : null, over,
      summary: row ? (over.length ? over.join(", ") : Object.entries(row.counts).map(([k, v]) => `${k} ${v}`).join(", ") + " (within baseline)") : "no JSON from ground-audit" };
  },
};

function main(argv) {
  if (!argv.length || argv.includes("--help") || argv.includes("-h")) { console.log(USAGE); return argv.length ? 0 : 2; }
  const id = argv.find((a) => !a.startsWith("--"));
  const json = argv.includes("--json");
  const i = argv.indexOf("--checks");
  const want = i >= 0 ? String(argv[i + 1] || "").split(",").map((s) => s.trim()).filter(Boolean) : ORDER;
  const unknown = want.filter((c) => !CHECKS[c]);
  if (!id || unknown.length) {
    console.error(unknown.length ? `audit-circuit: unknown check ${unknown.join(", ")} — one of ${ORDER.join(", ")}` : USAGE);
    return 2;
  }
  const t0 = Date.now(), checks = {};
  for (const name of ORDER) if (want.includes(name)) checks[name] = CHECKS[name](id);
  const ok = Object.values(checks).every((c) => c.ok);
  const out = { id, ok, ms: Date.now() - t0, checks };
  if (json) console.log(JSON.stringify(out, null, 1));
  else {
    for (const [name, c] of Object.entries(checks)) console.log(`${c.ok ? "ok  " : "FAIL"} ${name.padEnd(9)} ${String(c.ms).padStart(5)} ms  ${c.summary}`);
    console.log(`= audit-circuit ${id}: ${ok ? "ok" : "FAIL"} (${Object.keys(checks).length} checks, ${out.ms} ms)`);
  }
  return ok ? 0 : 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, CHECKS, ORDER, floatOk };
