#!/usr/bin/env node
// repo-size.mjs — what makes a full clone big: the largest blobs ever committed, and the totals per directory.
// @doc Full-history size report: largest blobs ever committed and on-disk totals per top-level directory (repo-size.yml).
// Full description: Reads every object reachable from every ref (`git rev-list --objects --all` through `git cat-file --batch-check`) and reports the total, the largest blobs with the path they were first seen at, and the on-disk total per top-level directory and per extension. Refuses a shallow clone, whose numbers would be wrong. .github/workflows/repo-size.yml runs it on a fetch-depth 0 checkout.
// @skill check-changes
//
// WHY. On 2026-10-01 a branch cleanup was sized from an agent container, whose
// clone is SHALLOW (~50 commits): its cut-off commits looked like roots, which
// read as "the deploy branch was restarted on 2026-09-29" and put a full clone
// at 1.1 GB against 193 MB for the "post-restart" part. Neither was true — the
// GitHub API put the repository at 1,072 MB, nearly all of it the deploy
// branch's own history, so deleting branches could not shrink a clone. Before
// anyone weighs a history rewrite (git filter-repo: every sha changes, every
// open PR breaks), this is the measurement: which files carry the weight.
// It refuses a shallow clone rather than print a confident wrong number.
//
// `objectsize:disk` is the packed, delta-compressed size, which is what a clone
// downloads; `objectsize` is the raw size. Both are reported for blobs.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";

/** Pure. `type sha size disksize path` lines -> totals, top blobs, per-dir and per-extension. */
export function summarize(text, { top = 40 } = {}) {
  let disk = 0, raw = 0, objects = 0;
  const blobs = [], byDir = new Map(), byExt = new Map(), seen = new Set();
  for (const line of String(text).split("\n")) {
    const m = /^(\w+) ([0-9a-f]+) (\d+) (\d+)(?: (.*))?$/.exec(line);
    if (!m) continue;
    const [, type, sha, size, dsize, file = ""] = m;
    if (seen.has(sha)) continue;
    seen.add(sha);
    objects++;
    disk += +dsize; raw += +size;
    if (type !== "blob") continue;
    blobs.push({ sha, size: +size, disk: +dsize, path: file });
    const dir = file.includes("/") ? file.slice(0, file.indexOf("/")) : file ? "(root)" : "(unknown)";
    byDir.set(dir, (byDir.get(dir) || 0) + +dsize);
    const ext = /\.([A-Za-z0-9]+)$/.exec(file);
    const e = ext ? ext[1].toLowerCase() : "(none)";
    byExt.set(e, (byExt.get(e) || 0) + +dsize);
  }
  blobs.sort((a, b) => b.disk - a.disk || b.size - a.size);
  const rank = (m) => [...m].sort((a, b) => b[1] - a[1]);
  return { objects, disk, raw, top: blobs.slice(0, top), byDir: rank(byDir), byExt: rank(byExt) };
}

export const mb = (n) => (n / 1048576).toFixed(1) + " MB";

/** Markdown for the step summary. */
export function render(s, { refs = 0 } = {}) {
  const pct = (n) => (s.disk ? ((100 * n) / s.disk).toFixed(1) + "%" : "—");
  const out = [`### Repository size (full history, ${refs} refs)`, "",
    `**${mb(s.disk)}** packed on disk (${mb(s.raw)} raw) across ${s.objects.toLocaleString("en")} objects.`, "",
    "| top-level dir | packed | share |", "|---|---|---|",
    ...s.byDir.slice(0, 20).map(([d, n]) => `| \`${d}\` | ${mb(n)} | ${pct(n)} |`), "",
    "| extension | packed | share |", "|---|---|---|",
    ...s.byExt.slice(0, 15).map(([e, n]) => `| ${e} | ${mb(n)} | ${pct(n)} |`), "",
    `#### Largest ${s.top.length} blobs`, "", "| packed | raw | path (first seen) | blob |", "|---|---|---|---|",
    ...s.top.map((b) => `| ${mb(b.disk)} | ${mb(b.size)} | \`${b.path || "?"}\` | \`${b.sha.slice(0, 10)}\` |`)];
  return out.join("\n") + "\n";
}

export function main(argv = process.argv.slice(2)) {
  const shallow = execFileSync("git", ["rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).trim();
  if (shallow === "true") {
    console.error("repo-size: this clone is SHALLOW — its numbers would be wrong. Run it on a full clone (repo-size.yml uses fetch-depth: 0).");
    return 2;
  }
  const list = spawnSync("git", ["rev-list", "--objects", "--all"], { maxBuffer: 1 << 30 });
  const batch = spawnSync("git", ["cat-file", "--batch-check=%(objecttype) %(objectname) %(objectsize) %(objectsize:disk) %(rest)"],
    { input: list.stdout, maxBuffer: 1 << 30, encoding: "utf8" });
  const refs = execFileSync("git", ["for-each-ref"], { encoding: "utf8" }).split("\n").filter(Boolean).length;
  const arg = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  const top = Number(arg("--top")) || 40;
  const md = render(summarize(batch.stdout, { top }), { refs });
  if (arg("--out")) fs.writeFileSync(arg("--out"), md);
  process.stdout.write(md);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("repo-size.mjs")) process.exitCode = main();
