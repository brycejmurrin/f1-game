/* desktop-version.test.mjs — "<apexVersion>.<build>" from stamped version.json.
 *
 * Run: node --test tests/unit/desktop-version.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { desktopVersionFromBuild } from "../../tools/desktop/stage.mjs";
import { versionFromInputs } from "../../desktop/scripts/set-version.mjs";

const require = createRequire(import.meta.url);
const { appVersionFrom } = require("../../desktop/lib/version.cjs");

test("appVersionFrom maps {apexVersion, build} → MAJOR.MINOR.BUILD", () => {
  assert.equal(appVersionFrom({ apexVersion: "1.0", build: 2110 }), "1.0.2110");
  assert.equal(appVersionFrom({ apexVersion: "1.0", build: 1695 }), "1.0.1695");
  assert.throws(() => appVersionFrom({ apexVersion: "1.0", build: 0 }));
  assert.throws(() => appVersionFrom({ apexVersion: "1", build: 10 }));
  assert.throws(() => appVersionFrom({ apexVersion: "1.0", build: "x" }));
});

test("set-version versionFromInputs is the same pure mapping", () => {
  assert.equal(versionFromInputs({ apexVersion: "1.0", build: 2110 }), "1.0.2110");
});

test("desktopVersionFromBuild uses desktop/package.json apexVersion by default", () => {
  assert.equal(desktopVersionFromBuild(1695, "1.0"), "1.0.1695");
  assert.equal(desktopVersionFromBuild(1, "2.3"), "2.3.1");
});

test("desktop entry points replace an older stage before deriving the app version", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "desktop/package.json"), "utf8"));
  const artifacts = path.join(root, "artifacts");
  fs.mkdirSync(artifacts, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(artifacts, "desktop-entry-"));
  const desktop = path.join(fixture, "desktop");
  const stage = path.join(desktop, "dist-site");
  const gitDir = execFileSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: root, encoding: "utf8" }).trim();
  // Read HEAD from the checkout without creating a second repository or touching its refs.
  fs.writeFileSync(path.join(fixture, ".git"), `gitdir: ${gitDir}\n`);
  fs.mkdirSync(stage, { recursive: true });
  fs.mkdirSync(path.join(desktop, "scripts"));
  fs.mkdirSync(path.join(desktop, "lib"));
  for (const rel of ["scripts/set-version.mjs", "lib/site.cjs", "lib/version.cjs"]) {
    fs.copyFileSync(path.join(root, "desktop", rel), path.join(desktop, rel));
  }
  fs.writeFileSync(path.join(fixture, "version.json"), '{"build":1695}');
  // Stand in for copying the entire game: publish a new, HEAD-stamped stage.
  fs.writeFileSync(path.join(desktop, "fixture-stage.cjs"), `
    const fs = require('node:fs');
    const { repoHead } = require('./lib/site.cjs');
    fs.writeFileSync('dist-site/version.json', '{"build":4242}');
    fs.writeFileSync('dist-site/index.html', '<meta name="apex-sha" content="' + repoHead('..') + '">');
  `);
  const env = { ...process.env };
  delete env.APEX_SITE_DIR;
  try {
    for (const entry of ["prestart", "smoke", "pack", "pack:test", "dist", "dist:linux", "dist:win", "dist:mac"]) {
      fs.writeFileSync(path.join(stage, "version.json"), '{"build":100}');
      fs.writeFileSync(path.join(stage, "index.html"), `<meta name="apex-sha" content="${"0".repeat(40)}">`);
      // Execute the actual preparation prefix; stop before launching Electron or an installer build.
      const preparation = pkg.scripts[entry].split(/\s*&&\s*/).slice(0, 2).join(" && ");
      fs.writeFileSync(path.join(desktop, "package.json"), JSON.stringify({
        name: "desktop-entry-fixture", version: "1.0.1695", apexVersion: pkg.apexVersion,
        scripts: { stage: "node fixture-stage.cjs", "sync-version": pkg.scripts["sync-version"], prepareFixture: preparation },
      }));
      const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm",
        ["run", "prepareFixture", "--silent"], { cwd: desktop, env, encoding: "utf8", shell: process.platform === "win32" });
      assert.equal(result.status, 0, `${entry}: ${result.error || result.stderr || result.stdout}`);
      const actual = JSON.parse(fs.readFileSync(path.join(desktop, "package.json"), "utf8"));
      assert.equal(actual.version, `${pkg.apexVersion}.4242`, `${entry} must use the refreshed stage build`);
    }
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
