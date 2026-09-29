#!/usr/bin/env node
/**
 * sync-version.mjs — set desktop/package.json "version" from repo version.json.
 *
 * electron-builder reads package.json version into artifact names. The game's
 * generation lives in version.json (`build`); we map it to semver 0.<build>.0
 * so a desktop package and a Pages deploy of the same tip share a number.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { desktopVersionFromBuild } from "../tools/desktop/stage.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const pkgPath = path.join(HERE, "package.json");
const ver = JSON.parse(fs.readFileSync(path.join(ROOT, "version.json"), "utf8"));
const version = desktopVersionFromBuild(ver.build);
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
if (pkg.version !== version) {
  pkg.version = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}
console.log(JSON.stringify({ build: ver.build, version }));
