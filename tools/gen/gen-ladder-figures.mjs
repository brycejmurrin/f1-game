#!/usr/bin/env node
// @doc Rewrites the gate-ladder figures (N of M unit files) in three docs from tests/groups.json; --check.
// @skill check-changes
//
// AGENTS.md rule 3, docs/notes/PREPUSH-GATE-LADDER.md and docs/TESTING.md all
// quote the ladder as "N of M unit files". tests/unit/docs-integrity.test.mjs
// pins that phrasing to the generated tooling-fast list and the files on disk,
// so every added unit file went red until three docs were hand-edited — PR
// #171 (+6 files) and PR #172 (the pin) were each green alone and the deploy
// tip was red for half an hour on their union (2026-09-22). The derived
// figures around the pin ("the other 73", "281 of 296", "the remaining 15")
// were not pinned at all and drifted on their own.
//
// One generator owns every one of those numbers now:
//   TARGET     docs/notes/PREPUSH-GATE-LADDER.md — the ladder table lives in a
//              `<!-- GENERATED: ladder -->` block; registered in targets.mjs.
//   SECONDARY  AGENTS.md and docs/TESTING.md — the digits inside their prose
//              are rewritten IN PLACE (no markers, no added lines: AGENTS.md is
//              held at 200 lines by agent-config.test.mjs) and the files stay
//              prose for the commit hook's docs-only fast path, which is why
//              they are not registered as generated targets.
// Every rewrite must match exactly once and keep the line count, else this
// throws and writes nothing. `--check` reports each stale doc; `--json` prints
// the figures. Reads tests/groups.json (not the generated tooling-fast.mjs) so
// docs-integrity's pin, which reads the other copy, stays an independent check.
//
//   node tools/gen/gen-ladder-figures.mjs            # write
//   node tools/gen/gen-ladder-figures.mjs --check    # exit 1 + STALE lines when a doc drifted
//   node tools/gen/gen-ladder-figures.mjs --json
import fs from "node:fs";
import path from "node:path";
import { ROOT, emit, isMain, readRepo, replaceBlock } from "./gen-lib.mjs";
import { loadGroups, filesOnly } from "./gen-test-groups.mjs";
import { gateNodeSuites } from "../ci/deploy.mjs";

export const TARGET = "docs/notes/PREPUSH-GATE-LADDER.md";
export const SECONDARY = ["AGENTS.md", "docs/TESTING.md"];
export const BLOCK = "ladder";

const UNIT = /\.test\.(mjs|cjs)$/;
const base = (f) => path.basename(f);

/** The ladder, measured: guards (curated), tooling-fast, the whole gate
 *  (toolingFast ∪ every group ci.yml's "Pure-node unit suites" step names ∪
 *  test:sweeps-parts, by basename — the union prepush-gate-coverage.test.mjs
 *  measures), and the files on disk. Throws rather than emitting on anything
 *  inconsistent: a ladder that quietly printed 0 would pass `--check` forever. */
export function figures(groups = loadGroups()) {
  const disk = fs.readdirSync(path.join(ROOT, "tests/unit")).filter((f) => UNIT.test(f));
  const onDisk = new Set(disk);
  const fastFiles = filesOnly(groups.toolingFast || []);
  const gate = new Set(fastFiles.map(base));
  for (const script of [...gateNodeSuites(), "test:sweeps-parts"]) {
    const def = groups.groups && groups.groups[script];
    if (!def) throw new Error(`ci.yml's Pure-node unit suites names ${script}, tests/groups.json has no such group`);
    for (const f of def.files || []) if (f.startsWith("tests/unit/")) gate.add(base(f));
  }
  for (const f of gate) if (!onDisk.has(f)) throw new Error(`the gate names ${f}, which is not under tests/unit/`);
  const guards = ((groups.groups || {})["test:guards"] || {}).files;
  const sweeps = ((groups.groups || {})["test:sweeps"] || {}).files;
  const f = { guards: guards ? guards.length : 0, fast: fastFiles.length, disk: disk.length, gate: gate.size,
              sweeps: sweeps ? sweeps.length : 0 };
  if (!f.guards) throw new Error("tests/groups.json has no test:guards files");
  if (!f.fast) throw new Error("tests/groups.json toolingFast lists no files");
  if (f.fast > f.gate || f.gate > f.disk) throw new Error(`ladder is not a ladder: fast ${f.fast}, gate ${f.gate}, disk ${f.disk}`);
  return { ...f, fastLeft: f.disk - f.fast, gateLeft: f.disk - f.gate };
}

/** The generated table. No dates: the block must be a pure function of the tree. */
export function renderBlock(f) {
  const left = f.gateLeft === f.sweeps ? `${f.gateLeft} (\`test:sweeps\`)` : `${f.gateLeft}`;
  return [
    "| command | unit files it runs | leaves out | when |",
    "|---|---|---|---|",
    `| \`npm run test:guards\` | ${f.guards} (curated) | — | hook-enforced, every \`git commit\` |`,
    `| \`npm run test:tooling-fast\` | ${f.fast} of ${f.disk} | ${f.fastLeft} | the documented edit-loop check |`,
    `| \`node tools/ci/deploy.mjs --gate-only\` | ${f.gate} of ${f.disk} | ${left} | the whole gate; what a deploy runs |`,
    "",
    "_Derived from `tests/groups.json`, `tests/unit/` and ci.yml's \"Pure-node unit suites\" step by `node tools/gen/gen-ladder-figures.mjs`; `--check` runs in `test:guards`._",
  ].join("\n");
}

/** In-place rewrites: each regex captures the prose around the digits and
 *  must match EXACTLY once in its doc. `value` returns the digits (one number,
 *  or [a, b] for an "a of b" pair). */
export const REWRITES = {
  "AGENTS.md": [
    { re: /(`test:tooling-fast` \()(\d+) of (\d+)( unit files\))/, value: (f) => [f.fast, f.disk] },
    { re: /(\bThe other )(\d+)( have taken deploys red)/, value: (f) => f.fastLeft },
  ],
  "docs/TESTING.md": [
    { re: /(`npm run test:tooling-fast` \(structural, no browser; )(\d+) of (\d+)( unit files)/, value: (f) => [f.fast, f.disk] },
    { re: /(\| `tooling-fast` \| the structural half — )(\d+)( files,)/, value: (f) => f.fast },
    // The sweeps row enumerated its suites by hand and had drifted four files
    // behind package.json. The roster is gone (the script is the list); the
    // count stays, generated.
    { re: /(\| `sweeps` \| the full-fleet geometry audits \()(\d+)( files —)/, value: (f) => f.sweeps },
  ],
  [TARGET]: [
    { re: /(\bThe remaining )(\d+)( are the per-circuit geometry)/, value: (f) => f.gateLeft },
    { re: /(\bthe )(\d+)( files it leaves out cost)/, value: (f) => f.fastLeft },
    { re: /(A pin in one of those )(\d+)( files)/, value: (f) => f.gateLeft },
  ],
};

export function rewrite(doc, rel, f) {
  const before = doc.split("\n").length;
  for (const { re, value } of REWRITES[rel] || []) {
    const n = (doc.match(new RegExp(re.source, "g")) || []).length;
    if (n !== 1) throw new Error(`${rel}: expected exactly one match for ${re}, found ${n} — the prose moved; fix the rule or the doc`);
    const v = value(f);
    doc = Array.isArray(v)
      ? doc.replace(re, (_, a, _x, _y, d) => `${a}${v[0]} of ${v[1]}${d}`)
      : doc.replace(re, (_, a, _x, c) => `${a}${v}${c}`);
  }
  if (doc.split("\n").length !== before) throw new Error(`${rel}: a rewrite changed the line count`);
  return doc;
}

export function render(rel, f = figures(), doc = readRepo(rel)) {
  if (rel === TARGET) doc = replaceBlock(doc, BLOCK, renderBlock(f));
  return rewrite(doc, rel, f);
}

export function renderAll(f = figures()) {
  return [TARGET, ...SECONDARY].map((rel) => [rel, render(rel, f)]);
}

if (isMain(import.meta.url)) {
  try {
    const f = figures();
    if (process.argv.includes("--json")) process.stdout.write(JSON.stringify(f) + "\n");
    else process.exitCode = Math.max(...renderAll(f).map(([rel, text]) => emit(rel, text)));
  } catch (e) {
    process.stderr.write(`gen-ladder-figures: ${e.message}\n`);
    process.exitCode = 2;
  }
}
