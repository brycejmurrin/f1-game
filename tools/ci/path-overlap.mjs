#!/usr/bin/env node
// @doc Advisory delegation overlap against open-PR diffs and supplied sibling briefs; GET-only, never a reservation.
// @skill worker
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api, DEPLOY } from "./github-api.mjs";

/** Literal repository paths only. A trailing slash explicitly denotes a directory. */
export function normalizeOwnedPath(p) {
  if (typeof p !== "string" || !p || p.length > 512 || p.startsWith("/") || /[\\*?\[\]{}\x00-\x1f]/.test(p)) return null;
  const parts = p.replace(/^\.\//, "").split("/");
  if (parts.some((x, i) => x === ".." || (!x && i !== parts.length - 1))) return null;
  const result = parts.filter((x) => x !== ".").join("/");
  return result && result !== "/" ? result : null;
}
const touches = (a, b) => a === b || (a.endsWith("/") && b.startsWith(a)) || (b.endsWith("/") && a.startsWith(b));

/** Input {owned,forbidden?,prs:[{number,head,owner,files}],assignments?,complete,issues?}.
 * PR files may be strings or GitHub file rows, including previous_filename for renames.
 * Assignments describe sibling owned paths only; their forbidden paths grant no ownership.
 */
export function comparePaths(input = {}) {
  const out = { schemaVersion: 1, advisory: true, reservation: false, complete: input.complete === true,
    state: "unknown", overlaps: [], issues: [], checkedPrs: 0, checkedAssignments: 0 };
  const issue = (text) => {
    out.complete = false;
    if (out.issues.length < 64) out.issues.push(String(text).slice(0, 512));
  };
  if (Array.isArray(input.issues)) {
    out.issues = input.issues.slice(0, 64).map((x) => String(x).slice(0, 512));
    if (input.issues.length > 64) issue("Issue output limit reached");
  } else if (input.issues != null) issue("issues must be an array");
  const limited = (xs, label, limit) => {
    if (!Array.isArray(xs)) { issue(`${label} must be an array`); return []; }
    if (xs.length > limit) issue(`${label} limit reached: inspect at most ${limit}`);
    return xs.slice(0, limit);
  };
  const valid = (xs, label, limit = 128) => limited(xs, label, limit).flatMap((x) => {
    const p = normalizeOwnedPath(x);
    if (p) return [p];
    issue(`Unsupported ${label} path: ${String(x).slice(0, 160)}`); return [];
  });
  const owned = valid(input.owned, "owned"), forbidden = valid(input.forbidden || [], "forbidden");
  if (!owned.length) issue("No owned paths supplied");
  const add = (kind, proposed, other, evidence) => {
    if (out.overlaps.length < 200) out.overlaps.push({ kind, proposed, other, ...evidence });
    else if (!out.truncatedOverlaps) { out.truncatedOverlaps = true; issue("Overlap output limit reached: at most 200 matches retained"); }
  };
  for (const a of owned) for (const b of forbidden) if (touches(a, b)) add("brief-contradiction", a, b, {});
  for (const pr of limited(input.prs, "PR", 50)) {
    if (!pr || typeof pr !== "object") { issue("Invalid PR row"); continue; }
    out.checkedPrs++;
    if (pr.complete === false) issue(`PR #${pr.number}: incomplete changed-file coverage`);
    const files = limited(pr.files, `PR #${pr.number} files`, 300);
    const paths = valid(files.flatMap((f) => typeof f === "string" ? [f]
      : f && typeof f === "object" ? [f.filename, ...(f.previous_filename ? [f.previous_filename] : [])] : [null]), "PR path", 600);
    for (const p of paths) for (const a of owned) if (touches(a, p)) add("open-pr", a, p, {
      pr: pr.number, head: String(pr.head?.sha || pr.head || "").slice(0, 64) || null,
      owner: typeof pr.owner === "string" ? pr.owner.slice(0, 256) : null });
  }
  for (const a of limited(input.assignments || [], "assignments", 32)) {
    if (!a || typeof a !== "object") { issue("Invalid assignment row"); continue; }
    out.checkedAssignments++;
    for (const p of valid(a.owned, "assignment")) for (const b of owned) if (touches(b, p)) add("sibling-assignment", b, p,
      { owner: typeof a.owner === "string" ? a.owner.slice(0, 256) : null });
  }
  out.state = out.overlaps.length ? "overlap" : out.complete ? "no-observed-overlap" : "unknown";
  return out;
}

/** Bounded live snapshot; errors retain observed overlaps but never establish a clean reservation. */
export function collectOverlap(brief, { request = api, maxPages = 3, maxPrs = 50 } = {}) {
  const input = { ...brief, prs: [], complete: true, issues: [] };
  const pages = (base) => {
    const all = [];
    for (let page = 1; page <= maxPages; page++) {
      let r;
      try { r = request(`${base}${base.includes("?") ? "&" : "?"}per_page=100&page=${page}`); }
      catch (e) { r = { error: e.message }; }
      if (r.error || !Array.isArray(r.json)) { input.complete = false; input.issues.push(`${base}: ${r.error || "invalid page"}`); return { rows: all, complete: false }; }
      all.push(...r.json);
      if (r.json.length < 100) return { rows: all, complete: true };
    }
    input.complete = false; input.issues.push(`Page limit reached: ${base}`);
    return { rows: all, complete: false };
  };
  const prs = pages(`pulls?state=open&base=${encodeURIComponent(DEPLOY)}`).rows.filter((p) => p.number !== brief.ignorePr);
  if (prs.length > maxPrs) { input.complete = false; input.issues.push(`PR limit reached: observed ${prs.length}, inspect at most ${maxPrs}`); }
  for (const pr of prs.slice(0, maxPrs)) {
    const files = pages(`pulls/${pr.number}/files`);
    const owner = /```handoff\s*\n[\s\S]*?\nowner:\s*([^\n]+)/.exec(pr.body || "")?.[1] || pr.user?.login || null;
    let after;
    try { after = request(`pulls/${pr.number}`); } catch (e) { after = { error: e.message }; }
    const sameHead = !!pr.head?.sha && after.json?.head?.sha === pr.head.sha;
    if (!sameHead) {
      input.complete = false;
      input.issues.push(`PR #${pr.number}: ${after.error || "head changed or unavailable during file collection"}`);
    }
    input.prs.push({ number: pr.number, head: pr.head?.sha, owner, files: files.rows, complete: files.complete && sameHead });
  }
  const out = comparePaths(input);
  out.at = new Date().toISOString();
  out.limitations = ["Only observed open-PR diffs and supplied sibling owned paths are compared", "Unpushed work and future edits are not visible", "This snapshot creates no claim or reservation; recheck before editing"];
  return out;
}

function readBoundedJSON(file) {
  const limit = 1024 * 1024, fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw new Error("JSON input must be a regular file of at most 1048576 bytes");
    const buffer = Buffer.alloc(limit + 1);
    let size = 0, read;
    while (size < buffer.length && (read = fs.readSync(fd, buffer, size, buffer.length - size, null)) > 0) size += read;
    if (size > limit) throw new Error("JSON input must be at most 1048576 bytes");
    return JSON.parse(buffer.subarray(0, size).toString("utf8"));
  } finally { fs.closeSync(fd); }
}

function main(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (["--help", "--json"].includes(argv[i])) continue;
    if (!["--brief", "--fixture"].includes(argv[i])) throw new Error(`Unknown argument ${argv[i]}`);
    if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`Missing value for ${argv[i]}`);
    i++;
  }
  const value = (flag) => argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null;
  if (argv.includes("--help")) { console.log("Usage: path-overlap.mjs --brief brief.json [--fixture snapshot.json] [--json]\nbrief: {owned:[literal paths],forbidden:[],assignments:[],ignorePr?:N}. Directories end in /. No globs. Incomplete evidence exits 2; overlap is advisory."); return; }
  const file = value("--brief");
  if (!file) throw new Error("Supply --brief brief.json");
  const brief = readBoundedJSON(file), fixture = value("--fixture");
  const result = fixture ? comparePaths({ ...readBoundedJSON(fixture), ...brief }) : collectOverlap(brief);
  console.log(argv.includes("--json") ? JSON.stringify(result, null, 2) : `${result.state}: ${result.overlaps.length} observed overlaps; complete=${result.complete}\n${result.issues.join("; ")}`);
  if (!result.complete) process.exitCode = 2;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 2; }
}
