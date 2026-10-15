"use strict";
// survey-gallery-lib.cjs — list survey branches and read committed track shots from git.
// @doc Shared helpers for build-gallery / pr-survey-panel: survey branch list, raw GitHub URLs, git blobs.

const { execFileSync } = require("child_process");
const path = require("path");

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const SURVEY_BRANCH_SKIP = /circuit-survey-gallery|shot-speedup-survey|graphics-detail-survey/i;
const TOD_PREFIX = /^(dawn|day|dusk|night|fog|overcast)$/i;

/** @param {string} slug e.g. day-dry, night-wet */
function splitTodWeather(slug) {
  const parts = String(slug).split("-");
  if (parts.length >= 2 && TOD_PREFIX.test(parts[0])) {
    return { tod: parts[0].toLowerCase(), condition: parts.slice(1).join("-") || "dry" };
  }
  if (TOD_PREFIX.test(parts[0])) {
    return { tod: parts[0].toLowerCase(), condition: "dry" };
  }
  return { tod: "unknown", condition: slug };
}

function parseRepoSlug(repoUrl) {
  const m = String(repoUrl || "").match(/github\.com[/:]([^/]+)\/([^/.]+)/i);
  return m ? { owner: m[1], repo: m[2] } : { owner: "brycejmurrin", repo: "f1-game" };
}

function rawGitHubUrl(owner, repo, branch, repoPath) {
  const p = repoPath.split(path.sep).join("/");
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${p}`;
}

function listSurveyBranches(root) {
  const out = execFileSync(
    "git",
    ["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin/cursor/"],
    { cwd: root, encoding: "utf8" },
  );
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("origin/cursor/"))
    .map((l) => l.replace(/^origin\//, ""))
    .filter((b) => /-survey/i.test(b) && !SURVEY_BRANCH_SKIP.test(b))
    .sort();
}

function listOpenSurveyHeadBranches(root) {
  try {
    const json = execFileSync(
      "gh",
      ["pr", "list", "--state", "open", "--json", "headRefName", "-L", "300"],
      { cwd: root, encoding: "utf8", maxBuffer: 8 << 20 },
    );
    return JSON.parse(json)
      .map((r) => r.headRefName)
      .filter((b) => /-survey/i.test(b) && !SURVEY_BRANCH_SKIP.test(b));
  } catch (_) {
    return null;
  }
}

/**
 * Remote survey branches to scan: open PR heads (when `gh` works) plus any
 * origin/cursor/*-survey* branch that still has committed track shots.
 */
function surveyBranchesToScan(root, { openOnly = false } = {}) {
  const open = listOpenSurveyHeadBranches(root);
  const all = listSurveyBranches(root);
  if (openOnly && open && open.length) {
    return [...new Set(open)].filter((b) => all.includes(b) || true).sort();
  }
  if (open && open.length) {
    const withShots = all.filter((b) => branchHasTrackShots(root, `origin/${b}`));
    return [...new Set([...open, ...withShots])].sort();
  }
  return all.filter((b) => branchHasTrackShots(root, `origin/${b}`));
}

function branchHasTrackShots(root, ref) {
  try {
    const list = execFileSync(
      "git",
      ["ls-tree", "-r", "--name-only", ref, "--", "artifacts/shots/tracks/"],
      { cwd: root, encoding: "utf8", maxBuffer: 16 << 20 },
    );
    return list.split("\n").some((f) => IMAGE_EXT.test(f));
  } catch (_) {
    return false;
  }
}

function listBranchTrackImages(root, branch) {
  const ref = branch.startsWith("origin/") ? branch : `origin/${branch}`;
  const list = execFileSync(
    "git",
    ["ls-tree", "-r", "--name-only", ref, "--", "artifacts/shots/tracks/"],
    { cwd: root, encoding: "utf8", maxBuffer: 32 << 20 },
  );
  return list
    .split("\n")
    .map((l) => l.trim())
    .filter((f) => IMAGE_EXT.test(f));
}

function readGitBlob(root, branch, repoPath) {
  const ref = branch.startsWith("origin/") ? branch : `origin/${branch}`;
  return execFileSync("git", ["show", `${ref}:${repoPath}`], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 64 << 20,
  });
}

function branchSlug(branch) {
  return branch.replace(/\//g, "_");
}

module.exports = {
  IMAGE_EXT,
  splitTodWeather,
  parseRepoSlug,
  rawGitHubUrl,
  listSurveyBranches,
  listOpenSurveyHeadBranches,
  surveyBranchesToScan,
  listBranchTrackImages,
  readGitBlob,
  branchSlug,
  SURVEY_BRANCH_SKIP,
};
