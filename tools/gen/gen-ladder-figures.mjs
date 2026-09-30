#!/usr/bin/env node
// @doc Prints the gate-ladder sizes (unit files per rung) from tests/groups.json; --json / --table. Writes nothing.
// @skill check-changes
//
// THE LADDER IS MEASURED, NOT COMMITTED. The rung sizes ("N of M unit files")
// used to be written into five docs (AGENTS.md, docs/TESTING.md,
// docs/notes/PREPUSH-GATE-LADDER.md, .claude/agents/verify-agent.md,
// README.md). Every PR that added a test file changed the same digits on the
// same lines, so two open PRs ALWAYS conflicted: measured ~100 % same-line
// conflicts on the ladder docs (docs/notes/MERGE-HYGIENE-2026-09-29.md), and
// PRs #487 / #519 each needed several base syncs for nothing but those lines.
// Moving the digits into one file would still conflict; the cure is to keep
// them out of the tree. The docs now point here, session-start prints the
// line, and tests/unit/docs-integrity.test.mjs checks the SHAPE (guards <
// fast < gate <= disk) instead of pinning digits.
//
//   node tools/gen/gen-ladder-figures.mjs            # one line: guards / fast / gate / disk
//   node tools/gen/gen-ladder-figures.mjs --table    # the markdown table the ladder note used to hold
//   node tools/gen/gen-ladder-figures.mjs --json
import fs from "node:fs";
import path from "node:path";
import { ROOT, isMain } from "./gen-lib.mjs";
import { loadGroups, filesOnly } from "./gen-test-groups.mjs";
import { gateNodeSuites } from "../ci/deploy.mjs";

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
  // ROOT PLAYWRIGHT SPECS: a directory listing, reported with the rest.
  const specs = fs.readdirSync(path.join(ROOT, "tests/specs")).filter((f) => /\.spec\.js$/.test(f)).length;
  const f = { guards: guards ? guards.length : 0, fast: fastFiles.length, disk: disk.length, gate: gate.size,
              sweeps: sweeps ? sweeps.length : 0, specs };
  if (!f.specs) throw new Error("tests/specs holds no .spec.js files — refusing to report a zero");
  if (!f.guards) throw new Error("tests/groups.json has no test:guards files");
  if (!f.fast) throw new Error("tests/groups.json toolingFast lists no files");
  if (f.guards >= f.fast || f.fast > f.gate || f.gate > f.disk) throw new Error(`ladder is not a ladder: guards ${f.guards}, fast ${f.fast}, gate ${f.gate}, disk ${f.disk}`);
  return { ...f, fastLeft: f.disk - f.fast, gateLeft: f.disk - f.gate };
}

/** The ladder as a markdown table (`--table`). */
export function renderTable(f) {
  const left = f.gateLeft === f.sweeps ? `${f.gateLeft} (\`test:sweeps\`)` : `${f.gateLeft}`;
  return [
    "| command | unit files it runs | leaves out | when |",
    "|---|---|---|---|",
    `| \`npm run test:guards\` | ${f.guards} (curated) | — | hook-enforced, every \`git commit\` |`,
    `| \`npm run test:tooling-fast\` | ${f.fast} of ${f.disk} | ${f.fastLeft} | the documented edit-loop check |`,
    `| \`node tools/ci/deploy.mjs --gate-only\` | ${f.gate} of ${f.disk} | ${left} | the whole gate; what a deploy runs |`,
  ].join("\n");
}

/** The one-line summary session-start prints. */
export function renderLine(f) {
  return `ladder: guards ${f.guards} ⊂ tooling-fast ${f.fast} ⊂ gate ${f.gate} of ${f.disk} unit files; ${f.specs} specs`;
}

if (isMain(import.meta.url)) {
  try {
    const f = figures();
    const out = process.argv.includes("--json") ? JSON.stringify(f)
      : process.argv.includes("--table") ? renderTable(f) : renderLine(f);
    process.stdout.write(out + "\n");
  } catch (e) {
    process.stderr.write(`gen-ladder-figures: ${e.message}\n`);
    process.exitCode = 2;
  }
}
