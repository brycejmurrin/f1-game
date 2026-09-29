#!/usr/bin/env node
// @doc Keep conflict-prone JSON lists one-entry-per-line and stably sorted: ratchets.json + groups.json; `--check` (default) / `--fix`.
// @skill check-changes
/**
 * merge-hygiene.mjs — stop concurrent PRs from rewriting the same blob line.
 *
 *   node tools/check/merge-hygiene.mjs            # check (exit 1 on drift)
 *   node tools/check/merge-hygiene.mjs --fix     # rewrite ratchets.json + groups.json
 *
 * Why: of ~60 recent ship merges, ratchets.json same-line fights were 16/17
 * both-parent touches, and groups.json / tooling-fast inserts were usually
 * disjoint only when each entry already sat on its own line. A one-line JSON
 * blob or an unsorted append-at-end list forces every adder onto the same
 * hunk. Sorted keys + one entry per line turn two independent adds into
 * auto-mergeable inserts. `merge=union` is NEVER applied here (JSON / comma
 * order) — see .gitattributes and docs/notes/MERGE-HYGIENE-2026-09-29.md.
 *
 * toolingFast keeps each `//` note glued to the next path entry, then sorts
 * by path so two PRs adding different unit files land on different lines.
 * Group keys and each group's `files` / `flags` arrays are alpha-sorted.
 * Ratchet `files` / `tree` keys (and per-file metric keys) are alpha-sorted.
 *
 * Consumers (ratchets.mjs, gen-test-groups.mjs, deploy cure) read via
 * JSON.parse / Object.entries — key order is formatting only. After --fix,
 * run `node tools/gen/gen-test-groups.mjs` so tooling-fast.mjs matches.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const RATCHETS = path.join(ROOT, "tests/data/ratchets.json");
export const GROUPS = path.join(ROOT, "tests/groups.json");

/** Stable pretty JSON: sorted object keys at every depth, 2-space indent, trailing newline. */
export function stableStringify(value) {
  return JSON.stringify(sortValue(value), null, 2) + "\n";
}

function sortValue(v) {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortValue(v[k]);
    return out;
  }
  return v;
}

/** Normalize ratchets.json: deep-sorted keys, pretty one-metric-per-line form. */
export function normalizeRatchets(data) {
  const files = {};
  for (const file of Object.keys(data.files || {}).sort()) {
    const metrics = data.files[file];
    const bag = {};
    for (const m of Object.keys(metrics).sort()) bag[m] = sortValue(metrics[m]);
    files[file] = bag;
  }
  const tree = {};
  for (const m of Object.keys(data.tree || {}).sort()) tree[m] = sortValue(data.tree[m]);
  // Preserve doc / unknown top-level keys; keep `_doc` first for humans.
  const out = {};
  if ("_doc" in data) out._doc = data._doc;
  for (const k of Object.keys(data).sort()) {
    if (k === "_doc" || k === "files" || k === "tree") continue;
    out[k] = sortValue(data[k]);
  }
  out.files = files;
  out.tree = tree;
  return out;
}

/**
 * Split toolingFast into {comments, path} blocks (comments glue to the next
 * path), then sort by path. Orphan trailing comments stay at the end.
 */
export function sortToolingFast(entries) {
  const blocks = [];
  let pending = [];
  for (const e of entries) {
    if (typeof e !== "string") throw new Error(`toolingFast entry must be a string, got ${typeof e}`);
    if (e.startsWith("//")) { pending.push(e); continue; }
    blocks.push({ comments: pending, path: e });
    pending = [];
  }
  blocks.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const out = [];
  for (const b of blocks) {
    out.push(...b.comments);
    out.push(b.path);
  }
  out.push(...pending);
  return out;
}

/** Normalize groups.json: sorted group keys, sorted files/flags, sorted toolingFast. */
export function normalizeGroups(data) {
  const out = {};
  // Keep the leading `//` doc array first when present.
  if ("//" in data) out["//"] = data["//"];
  if (Array.isArray(data.toolingFast)) out.toolingFast = sortToolingFast(data.toolingFast);
  const groups = {};
  for (const name of Object.keys(data.groups || {}).sort()) {
    const def = data.groups[name];
    const next = {};
    for (const k of Object.keys(def).sort()) {
      const v = def[k];
      if ((k === "files" || k === "flags") && Array.isArray(v)) {
        next[k] = [...v].sort();
      } else {
        next[k] = v;
      }
    }
    groups[name] = next;
  }
  out.groups = groups;
  for (const k of Object.keys(data).sort()) {
    if (k === "//" || k === "toolingFast" || k === "groups") continue;
    out[k] = data[k];
  }
  return out;
}

export function renderRatchets(data = JSON.parse(fs.readFileSync(RATCHETS, "utf8"))) {
  return stableStringify(normalizeRatchets(data));
}

export function renderGroups(data = JSON.parse(fs.readFileSync(GROUPS, "utf8"))) {
  // groups.json is already pretty; keep the same stringify shape (no deep key
  // sort inside string arrays — normalizeGroups already ordered the lists).
  return JSON.stringify(normalizeGroups(data), null, 2) + "\n";
}

export function check(files = { ratchets: true, groups: true }) {
  const drift = [];
  if (files.ratchets) {
    const now = fs.readFileSync(RATCHETS, "utf8");
    const next = renderRatchets();
    if (now !== next) drift.push("tests/data/ratchets.json");
  }
  if (files.groups) {
    const now = fs.readFileSync(GROUPS, "utf8");
    const next = renderGroups();
    if (now !== next) drift.push("tests/groups.json");
  }
  return drift;
}

export function fix() {
  const wrote = [];
  const rNext = renderRatchets();
  if (fs.readFileSync(RATCHETS, "utf8") !== rNext) {
    fs.writeFileSync(RATCHETS, rNext);
    wrote.push("tests/data/ratchets.json");
  }
  const gNext = renderGroups();
  if (fs.readFileSync(GROUPS, "utf8") !== gNext) {
    fs.writeFileSync(GROUPS, gNext);
    wrote.push("tests/groups.json");
  }
  return wrote;
}

function main() {
  const fixMode = process.argv.includes("--fix");
  if (fixMode) {
    const wrote = fix();
    if (!wrote.length) console.log("merge-hygiene: already normalized");
    else {
      for (const f of wrote) console.log(`merge-hygiene: wrote ${f}`);
      if (wrote.includes("tests/groups.json")) {
        console.log("merge-hygiene: next → node tools/gen/gen-test-groups.mjs  (and npm run gen if ladder figures drift)");
      }
    }
    return;
  }
  const drift = check();
  if (drift.length) {
    for (const f of drift) console.error(`${f}: STALE — run \`node tools/check/merge-hygiene.mjs --fix\``);
    process.exitCode = 1;
    return;
  }
  console.log("merge-hygiene: ratchets.json and groups.json are one-entry-per-line and stably sorted");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
