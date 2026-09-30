#!/usr/bin/env node
/**
 * Guard the staged site, write notices, stamp desktop version before pack.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { writeNotices } from "./notices.mjs";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { resolveSiteDir, assertStagedSite } = require("../lib/site.cjs");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.resolve(HERE, "..");

function main() {
  const site = resolveSiteDir(DESKTOP);
  const ver = assertStagedSite(site);
  const notices = writeNotices();
  const stamp = spawnSync(process.execPath, [path.join(HERE, "set-version.mjs")], {
    cwd: DESKTOP,
    encoding: "utf8",
  });
  if (stamp.status !== 0) {
    throw new Error(`set-version failed:\n${stamp.stderr || stamp.stdout}`);
  }
  console.log(JSON.stringify({
    ok: true,
    site,
    build: ver.build,
    notices,
    version: String(stamp.stdout || "").trim(),
  }));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
