"use strict";
/**
 * Desktop semver: "<apexVersion>.<build>" e.g. 1.0.2110.
 * MAJOR.MINOR lives in desktop/package.json "apexVersion"; PATCH is the
 * stamped version.json build (same number Pages would stamp at this commit
 * when using that file's build field).
 */
function appVersionFrom({ apexVersion, build }) {
  const mm = String(apexVersion || "").trim();
  if (!/^\d+\.\d+$/.test(mm)) {
    throw new Error(`desktop version: apexVersion must be MAJOR.MINOR, got ${apexVersion}`);
  }
  const n = Number(build);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`desktop version: build must be a positive integer, got ${build}`);
  }
  return `${mm}.${n}`;
}

function readApexVersion(pkg) {
  const v = pkg && pkg.apexVersion;
  if (typeof v === "string" && /^\d+\.\d+$/.test(v)) return v;
  return "1.0";
}

module.exports = { appVersionFrom, readApexVersion };
