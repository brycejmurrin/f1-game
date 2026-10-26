#!/usr/bin/env node
/**
 * gen-changelog.mjs — CHANGELOG.md from per-PR fragments in docs/changelog.d/.
 * @doc Validates `docs/changelog.d` fragments (`--check`); `--fold` writes them into `CHANGELOG.md` under the build.
 * @skill check-changes
 *
 * Every PR used to insert at the top of CHANGELOG.md, so each merge conflicted every other open PR. A PR now
 * adds ONE fragment file; CHANGELOG.md is written only by `--fold`, which moves the fragments under
 * `## <build>` (merging into an existing section) and deletes them. Fragment lines are `Category: entry`.
 *
 * THE BUILD IS THE STAMPED ONE, NOT version.json (2026-10-26): version.json holds the committed placeholder
 * (1695) since Pages stamps 2000 + `git rev-list --count HEAD` at deploy (tools/desktop/stage.mjs pagesBuild),
 * so a fold keyed to version.json filed every entry under a build no player ever ran. `--fold` defaults to
 * pagesBuild() of this checkout, i.e. the build the deploy tip stamps: the entries landed by that build.
 * The weekly owner is .github/workflows/changelog-fold.yml.
 *
 *   node tools/gen/gen-changelog.mjs --check               # fragments well-formed (exit 1 otherwise)
 *   node tools/gen/gen-changelog.mjs --fold [--build N]    # fold into CHANGELOG.md, delete the fragments
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, argGate, isMain, readRepo } from "./gen-lib.mjs";

export const TARGET = "CHANGELOG.md";
export const DIR = "docs/changelog.d";
export const CATEGORIES = ["New", "Improved", "Fixed", "Removed"];

/** Parse fragment text into [{category, text}] plus problems. */
export function parseFragment(name, src) {
  const entries = [], problems = [];
  src.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const m = line.match(/^(\w+):\s+(\S.*)$/);
    if (!m || !CATEGORIES.includes(m[1])) {
      problems.push(`${name}:${i + 1}: expected "<${CATEGORIES.join("|")}>: entry", got ${JSON.stringify(line.slice(0, 60))}`);
    } else entries.push({ category: m[1], text: m[2] });
  });
  if (!entries.length && !problems.length) problems.push(`${name}: no entries`);
  return { entries, problems };
}

export function listFragments() {
  const dir = path.join(ROOT, DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md").sort();
}

/** Fold entries into the changelog text under `## build`. Pure. */
export function fold(changelog, build, entries) {
  const by = Object.fromEntries(CATEGORIES.map((c) => [c, entries.filter((e) => e.category === c).map((e) => `- ${e.text}`)]));
  const head = `## ${build}`;
  const lines = changelog.replace(/\s+$/, "").split("\n");
  const at = lines.findIndex((l) => l.trim() === head);
  if (at < 0) {
    const first = lines.findIndex((l) => /^## /.test(l));
    const block = [head, ""];
    for (const c of CATEGORIES) if (by[c].length) block.push(`### ${c}`, ...by[c], "");
    const i = first < 0 ? lines.length : first;
    lines.splice(i, 0, ...(i === lines.length ? [""] : []), ...block.slice(0, first < 0 ? -1 : undefined));
    return lines.join("\n") + "\n";
  }
  let end = lines.findIndex((l, i) => i > at && /^## /.test(l));
  if (end < 0) end = lines.length;
  for (const c of CATEGORIES) {
    if (!by[c].length) continue;
    const h = lines.findIndex((l, i) => i > at && i < end && l.trim() === `### ${c}`);
    if (h < 0) {
      let e = end;
      while (e > at + 1 && lines[e - 1].trim() === "") e--;
      lines.splice(e, 0, "", `### ${c}`, ...by[c]);
      end += by[c].length + 2;
    } else {
      let e = lines.findIndex((l, i) => i > h && (/^#{2,3} /.test(l)));
      if (e < 0 || e > end) e = end;
      while (e > h + 1 && lines[e - 1].trim() === "") e--;
      lines.splice(e, 0, ...by[c]);
      end += by[c].length;
    }
  }
  return lines.join("\n") + "\n";
}

/** `--build N` (a positive integer), else the stamped build of this checkout. Throws on a bad value or a shallow clone. */
export async function foldBuild(argv, stamp) {
  const i = argv.indexOf("--build");
  if (i >= 0) {
    const n = Number(argv[i + 1]);
    if (!Number.isInteger(n) || n < 1) throw new Error(`--build needs a positive integer, got ${JSON.stringify(argv[i + 1] ?? "")}`);
    return n;
  }
  return (stamp || (await import("../desktop/stage.mjs")).pagesBuild)();
}

async function main(argv) {
  const bi = argv.indexOf("--build");
  const gated = argGate(bi < 0 ? argv : argv.filter((_, k) => k !== bi && k !== bi + 1), { allowed: ["--check", "--fold"] });
  if (gated !== null) return gated;
  const names = listFragments(), entries = [], problems = [];
  for (const n of names) {
    const r = parseFragment(`${DIR}/${n}`, readRepo(`${DIR}/${n}`));
    entries.push(...r.entries); problems.push(...r.problems);
  }
  if (problems.length) { process.stderr.write(problems.join("\n") + "\n"); return 1; }
  if (argv.includes("--fold")) {
    if (!names.length) { process.stdout.write("no fragments to fold\n"); return 0; }
    let build;
    try { build = await foldBuild(argv); } catch (e) { process.stderr.write(`gen-changelog: ${e.message}\n`); return 2; }
    fs.writeFileSync(path.join(ROOT, TARGET), fold(readRepo(TARGET), build, entries));
    for (const n of names) fs.unlinkSync(path.join(ROOT, DIR, n));
    process.stdout.write(`${TARGET}: folded ${entries.length} entries from ${names.length} fragments into ## ${build}\n`);
    return 0;
  }
  process.stdout.write(`${DIR}: ${names.length} fragment(s) well-formed\n`);
  return 0;
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
