#!/usr/bin/env node
// pr-survey-panel.cjs — markdown/HTML panel of survey shots for a PR body (GitHub-renderable).
// @doc Emits a PR body section with raw.githubusercontent.com image URLs (3 per row) from a survey branch.
// @skill survey-track
//
//   node tools/track/pr-survey-panel.cjs --branch cursor/silverstone-survey-745b
//   node tools/track/pr-survey-panel.cjs --branch cursor/silverstone-survey-745b --circuit silverstone

"use strict";

const path = require("path");
const {
  parseRepoSlug,
  rawGitHubUrl,
  listBranchTrackImages,
} = require("./survey-gallery-lib.cjs");
const { parseShotMeta } = require("./build-gallery.cjs");

const ROOT = path.resolve(__dirname, "../..");
const pkg = require(path.join(ROOT, "package.json"));
const { owner, repo } = parseRepoSlug(pkg.repository?.url);

function printHelp() {
  console.log(`pr-survey-panel — GitHub-renderable survey shot panel for PR bodies

  node tools/track/pr-survey-panel.cjs --branch cursor/<circuit>-survey-<id>
  node tools/track/pr-survey-panel.cjs --branch cursor/foo --circuit monza

  --branch NAME     required — survey branch (no origin/ prefix)
  --circuit ID      only images under artifacts/shots/tracks/<id>/
  --cols N          images per row (default 3)
  --help

Paste the output into the PR body. Uses raw.githubusercontent.com only — never
/workspace or /opt/cursor paths (those break on GitHub).
`);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }
  const branchArg = (argv.find((a) => a.startsWith("--branch=")) || "").slice("--branch=".length)
    || argv[argv.indexOf("--branch") + 1];
  if (!branchArg) {
    console.error("pr-survey-panel: --branch is required");
    process.exit(1);
  }
  const branch = branchArg.replace(/^origin\//, "");
  const circuitArg = (argv.find((a) => a.startsWith("--circuit=")) || "").slice("--circuit=".length)
    || argv[argv.indexOf("--circuit") + 1];
  const cols = Number((argv.find((a) => a.startsWith("--cols=")) || "").slice("--cols=".length) || 3);

  let files = listBranchTrackImages(ROOT, branch);
  if (circuitArg) {
    const prefix = `artifacts/shots/tracks/${circuitArg}/`;
    files = files.filter((f) => f.startsWith(prefix));
  }
  files.sort();

  if (!files.length) {
    console.error(`pr-survey-panel: no images on branch ${branch} under artifacts/shots/tracks/`);
    process.exit(1);
  }

  const rows = [];
  for (let i = 0; i < files.length; i += cols) {
    const slice = files.slice(i, i + cols);
    const cells = slice.map((rel) => {
      const url = rawGitHubUrl(owner, repo, branch, rel);
      const base = path.basename(rel);
      const circuitHint = rel.split("/")[3] || "";
      const meta = parseShotMeta(base, { circuitHint, bucket: "tracks" });
      const cap = meta
        ? `${meta.circuit} · ${meta.sector} · ${meta.tod || meta.weather}`
        : base;
      return `<td><a href="${url}"><img src="${url}" alt="${cap}" width="280" /></a><br/><sub>${cap}</sub></td>`;
    });
    while (cells.length < cols) cells.push("<td></td>");
    rows.push(`<tr>${cells.join("")}</tr>`);
  }

  const panel = `## Survey shots (preview)

<!-- generated: node tools/track/pr-survey-panel.cjs --branch ${branch}${circuitArg ? ` --circuit ${circuitArg}` : ""} -->
<!-- Images load from raw.githubusercontent.com — do not paste /workspace or /opt/cursor paths. -->

<table>
${rows.join("\n")}
</table>

[Open full multi-circuit gallery](https://brycejmurrin.github.io/f1-game/gallery/tracks/) after the gallery PR merges.
`;

  process.stdout.write(panel);
}

if (require.main === module) main();
