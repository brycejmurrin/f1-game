#!/usr/bin/env node
/**
 * Stamp desktop/package.json "version" as "<apexVersion>.<build>".
 *
 * Reads build from the staged site's version.json when present, else the
 * repo-root version.json. Sets APEX_APP_VERSION for extraMetadata.
 *
 *   node scripts/set-version.mjs
 *   node scripts/set-version.mjs --json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { appVersionFrom, readApexVersion } = require("../lib/version.cjs");
const { resolveSiteDir } = require("../lib/site.cjs");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(HERE, "..");
const ROOT = path.resolve(DESKTOP, "..");

function readBuild() {
  const site = resolveSiteDir(DESKTOP);
  const siteVer = path.join(site, "version.json");
  const src = fs.existsSync(siteVer) ? siteVer : path.join(ROOT, "version.json");
  const ver = JSON.parse(fs.readFileSync(src, "utf8"));
  return { build: ver.build, source: src };
}

export function versionFromInputs({ apexVersion, build }) {
  return appVersionFrom({ apexVersion, build });
}

function apply() {
  const pkgPath = path.join(DESKTOP, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const { build, source } = readBuild();
  const version = appVersionFrom({
    apexVersion: readApexVersion(pkg),
    build,
  });
  if (pkg.version !== version) {
    pkg.version = version;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  }
  process.env.APEX_APP_VERSION = version;
  return { build, version, source, apexVersion: readApexVersion(pkg) };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const out = apply();
  if (process.argv.includes("--json") || !process.stdout.isTTY) {
    console.log(JSON.stringify(out));
  } else {
    console.log(JSON.stringify(out));
  }
}
