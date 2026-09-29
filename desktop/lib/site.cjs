"use strict";
const fs = require("node:fs");
const path = require("node:path");

/**
 * Staged site for extraResources → resources/site.
 * Default is desktop/dist-site (npm run stage). Override with APEX_SITE_DIR.
 * If dist-site is missing but artifacts/site has version.json, use that.
 */
function resolveSiteDir(desktopRoot) {
  if (process.env.APEX_SITE_DIR) {
    return path.resolve(process.env.APEX_SITE_DIR);
  }
  const distSite = path.join(desktopRoot, "dist-site");
  const artifacts = path.join(desktopRoot, "..", "artifacts", "site");
  if (fs.existsSync(path.join(distSite, "version.json"))) return distSite;
  if (fs.existsSync(path.join(artifacts, "version.json"))) return artifacts;
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

module.exports = { resolveSiteDir, extraResourcesSiteFrom, assertStagedSite };
