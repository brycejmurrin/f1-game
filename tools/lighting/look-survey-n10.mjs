#!/usr/bin/env node
// @doc Capture/stitch 12 N10 lighting surveys → ignored artifacts/lighting/sheets/; --dry-run, --sheets-only, --force.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PLAN = "tools/lighting/look-survey-n10.json";
const OUT = "artifacts/lighting/sheets";
const args = new Set(process.argv.slice(2));
const known = new Set(["--dry-run", "--sheets-only", "--force", "--help"]);
const unknown = [...args].filter((arg) => !known.has(arg));

if (unknown.length) {
  console.error(`unknown option: ${unknown.join(", ")}`);
  process.exit(2);
}

if (args.has("--help")) {
  console.log(`usage: node tools/lighting/look-survey-n10.mjs [--dry-run] [--sheets-only] [--force]

Captures the 12 N10 circuits and writes their 4×5 contact sheets under
${OUT}/ (gitignored). Requires Chromium and Python Pillow.

  --dry-run      print the plan and commands without running them
  --sheets-only  stitch existing artifacts/lighting/shots frames
  --force        recapture all 240 frames`);
  process.exit(0);
}

const plan = JSON.parse(fs.readFileSync(path.join(ROOT, PLAN), "utf8"));
const tracks = plan.tracks.map(({ id }) => id);
if (tracks.length !== 12 || new Set(tracks).size !== tracks.length) {
  throw new Error(`expected 12 unique N10 tracks in ${PLAN}`);
}

const commands = [];
if (!args.has("--sheets-only")) {
  commands.push([
    "python3",
    "tools/mcp/cdmcp-cli.py",
    "look-survey",
    "--plan",
    PLAN,
    ...(args.has("--force") ? ["--force"] : []),
  ]);
}
commands.push([
  "python3",
  "tools/lighting/look-survey-sheet.py",
  ...tracks,
  "--out",
  OUT,
]);

console.log(`tracks: ${tracks.join(", ")}`);
for (const command of commands) console.log(`$ ${command.join(" ")}`);
if (args.has("--dry-run")) process.exit(0);

for (const [command, ...commandArgs] of commands) {
  const result = spawnSync(command, commandArgs, { cwd: ROOT, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`= run passed (${tracks.length} sheets in ${OUT})`);
