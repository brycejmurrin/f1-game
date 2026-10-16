/* desktop-stage.test.mjs — stage.mjs produces a complete site folder and
 * desktop version derives from version.json.
 *
 * Run: node --test tests/unit/desktop-stage.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { STAGE_DIRS, STAGE_ROOT_FILES } from "../../tools/desktop/stage-files.mjs";
import {
  desktopVersionFromBuild,
  stageSite,
  stampStaged,
} from "../../tools/desktop/stage.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("desktopVersionFromBuild maps version.json build → <apexVersion>.<build>", () => {
  assert.equal(desktopVersionFromBuild(1695, "1.0"), "1.0.1695");
  assert.equal(desktopVersionFromBuild(1, "1.0"), "1.0.1");
  assert.throws(() => desktopVersionFromBuild(0));
  assert.throws(() => desktopVersionFromBuild("x"));
});

test("stageSite copies every allow-listed root file and directory", () => {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), "apex-stage-"));
  try {
    stageSite(dest, { root: ROOT });
    for (const f of STAGE_ROOT_FILES) {
      assert.ok(fs.existsSync(path.join(dest, f)), `missing staged file ${f}`);
    }
    for (const d of STAGE_DIRS) {
      assert.ok(fs.statSync(path.join(dest, d)).isDirectory(), `missing staged dir ${d}/`);
    }
    // Must not drag the whole repo (tests/, tools/, node_modules/).
    assert.ok(!fs.existsSync(path.join(dest, "tests")));
    assert.ok(!fs.existsSync(path.join(dest, "tools")));
    assert.ok(!fs.existsSync(path.join(dest, "node_modules")));
    assert.ok(!fs.existsSync(path.join(dest, "desktop")));
    // Symlinks (e.g. docs pointers under staged trees) must be dereferenced
    // so a packaged Electron app does not see dangling links.
    const stageSrc = fs.readFileSync(path.join(ROOT, "tools/desktop/stage.mjs"), "utf8");
    assert.match(stageSrc, /cpSync\([\s\S]*dereference:\s*true/);
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});

test("stampStaged rewrites ?v=dev tags to content hashes", () => {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), "apex-stamp-"));
  try {
    stageSite(dest, { root: ROOT });
    const before = fs.readFileSync(path.join(dest, "index.html"), "utf8");
    assert.match(before, /\?v=dev/);
    // An explicit build: the default (2000 + rev-list count) refuses a shallow clone (deploy-staging-build).
    const build = stampStaged(dest, { at: 4242 });
    assert.equal(build, 4242);
    const after = fs.readFileSync(path.join(dest, "index.html"), "utf8");
    assert.doesNotMatch(after, /\?v=dev/);
    assert.match(after, /\?v=[a-f0-9]{12}/);
    const preview = fs.readFileSync(path.join(dest, "cockpit-view.html"), "utf8");
    assert.doesNotMatch(preview, /\?v=dev/);
    assert.match(preview, /src="js\/camera\/cockpit-preview\.js\?v=[a-f0-9]{12}"/,
      "the public iframe must ship with the same content-hash policy as the game");
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});


test("default desktop stages must match HEAD while explicit overrides stay intentional", () => {
  const { resolveSiteDir } = createRequire(import.meta.url)("../../desktop/lib/site.cjs");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apex-site-freshness-"));
  const desktop = path.join(tmp, "desktop");
  const dist = path.join(desktop, "dist-site");
  const head = "a".repeat(40);
  const prior = process.env.APEX_SITE_DIR;
  delete process.env.APEX_SITE_DIR;
  try {
    fs.mkdirSync(dist, { recursive: true });
    fs.writeFileSync(path.join(dist, "version.json"), '{"build":321}');
    for (const stamp of ["", "b".repeat(40)]) {
      fs.writeFileSync(path.join(dist, "index.html"), `<meta name="apex-sha" content="${stamp}">`);
      assert.throws(() => resolveSiteDir(desktop, { head }), /stale dist-site.*npm run stage/);
    }
    fs.writeFileSync(path.join(dist, "index.html"), `<meta name="apex-sha" content="${head}">`);
    assert.equal(resolveSiteDir(desktop, { head }), dist);
    process.env.APEX_SITE_DIR = dist;
    assert.equal(resolveSiteDir(desktop, { head: "b".repeat(40) }), dist);
  } finally {
    if (prior === undefined) delete process.env.APEX_SITE_DIR;
    else process.env.APEX_SITE_DIR = prior;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
