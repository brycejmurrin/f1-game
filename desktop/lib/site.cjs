"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

/** The commit a staged tree was stamped from (`<meta name="apex-sha">`), or null. */
function stagedSha(dir) {
  try {
    const m = fs.readFileSync(path.join(dir, "index.html"), "utf8").match(/<meta\s+name="apex-sha"\s+content="([0-9a-f]{40})"/);
    return m ? m[1] : null;
  } catch (_) { return null; }   // no index.html: not a staged tree
}

/** `git rev-parse HEAD` of `repoRoot`, or null when git cannot say. */
function repoHead(repoRoot) {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

/**
 * A REUSED staged tree must be this commit's (2026-10-10, R3-ARCHITECTURE-11):
 * `artifacts/` is every tool's regenerable-output dir, so a tree found there
 * may be any earlier stage. True only when its apex-sha equals `head`.
 */
function isCurrentStage(dir, head) {
  return !!head && stagedSha(dir) === head;
}

/**
 * Staged site for extraResources → resources/site.
 * Default is desktop/dist-site (npm run stage). Override with APEX_SITE_DIR.
 * If dist-site is missing, artifacts/site is used only when it was stamped
 * from HEAD (`isCurrentStage`); a stale one is ignored.
 */
function resolveSiteDir(desktopRoot, opts = {}) {
  if (process.env.APEX_SITE_DIR) {
    return path.resolve(process.env.APEX_SITE_DIR);
  }
  const distSite = path.join(desktopRoot, "dist-site");
  const artifacts = path.join(desktopRoot, "..", "artifacts", "site");
  if (fs.existsSync(path.join(distSite, "version.json"))) return distSite;
  if (fs.existsSync(path.join(artifacts, "version.json"))) {
    const head = opts.head !== undefined ? opts.head : repoHead(path.join(desktopRoot, ".."));
    if (isCurrentStage(artifacts, head)) return artifacts;
  }
  return distSite;
}

/** Path electron-builder extraResources.from should use (absolute or project-relative). */
function extraResourcesSiteFrom(desktopRoot) {
  if (process.env.APEX_SITE_DIR) return process.env.APEX_SITE_DIR;
  const abs = resolveSiteDir(desktopRoot);
  const distSite = path.join(desktopRoot, "dist-site");
  if (path.resolve(abs) === path.resolve(distSite)) return "dist-site";
  return abs;
}

function assertStagedSite(dir) {
  const versionPath = path.join(dir, "version.json");
  if (!fs.existsSync(versionPath)) {
    throw new Error(
      `desktop prebuild: staged site missing version.json at ${dir} — run: npm run stage`,
    );
  }
  const ver = JSON.parse(fs.readFileSync(versionPath, "utf8"));
  if (!Number.isInteger(ver.build) || ver.build < 1) {
    throw new Error(`desktop prebuild: invalid version.json build in ${versionPath}`);
  }
  if (!fs.existsSync(path.join(dir, "index.html"))) {
    throw new Error(`desktop prebuild: staged site missing index.html at ${dir}`);
  }
  return ver;
}

module.exports = { resolveSiteDir, extraResourcesSiteFrom, assertStagedSite, stagedSha, repoHead, isCurrentStage };
