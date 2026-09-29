/* desktop-builder-config.test.mjs — electron-builder 26 config shape.
 *
 * Run: node --test tests/unit/desktop-builder-config.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const identity = require("../../desktop/lib/identity.cjs");
const cfg = require("../../desktop/electron-builder.config.cjs");

test("appId and productName match frozen identity (do not change — saves)", () => {
  assert.equal(cfg.appId, identity.appId);
  assert.equal(cfg.productName, identity.productName);
  assert.equal(identity.appId, "io.github.brycejmurrin.apex26");
  assert.equal(identity.productName, "Apex 26");
});

test("asar packs app code; staged site is extraResources to site", () => {
  assert.equal(cfg.asar, true);
  const site = (cfg.extraResources || []).find((r) => r.to === "site");
  assert.ok(site, "extraResources must include { to: 'site' }");
  assert.ok(site.from, "site extraResources needs a from");
  assert.equal(cfg.directories.output, "dist");
  assert.equal(cfg.directories.buildResources, "build");
  const gitignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
  assert.match(gitignore, /desktop\/dist\//);
});

test("NSIS does not delete app data on uninstall", () => {
  assert.equal(cfg.nsis.deleteAppDataOnUninstall, false);
  assert.equal(cfg.nsis.oneClick, false);
  assert.equal(cfg.nsis.allowToChangeInstallationDirectory, true);
});

test("Windows target is NSIS x64; mac dmg+zip arm64+x64; linux AppImage+deb", () => {
  assert.deepEqual(cfg.win.target, [{ target: "nsis", arch: ["x64"] }]);
  const macKinds = cfg.mac.target.map((t) => t.target).sort();
  assert.deepEqual(macKinds, ["dmg", "zip"]);
  for (const t of cfg.mac.target) {
    assert.deepEqual(t.arch, ["arm64", "x64"]);
  }
  assert.deepEqual(cfg.linux.target, ["AppImage", "deb"]);
});

test("mac entitlements exist and NSCameraUsageDescription is set", () => {
  const ent = path.join(ROOT, "desktop", cfg.mac.entitlements);
  assert.equal(cfg.mac.entitlements, cfg.mac.entitlementsInherit);
  assert.ok(fs.existsSync(ent), `missing ${cfg.mac.entitlements}`);
  const plist = fs.readFileSync(ent, "utf8");
  assert.match(plist, /com\.apple\.security\.cs\.allow-jit/);
  assert.match(plist, /com\.apple\.security\.cs\.allow-unsigned-executable-memory/);
  assert.match(plist, /com\.apple\.security\.device\.camera/);
  assert.match(cfg.mac.extendInfo.NSCameraUsageDescription, /QR/i);
  assert.equal(cfg.mac.hardenedRuntime, true);
});

test("no publish provider yet (unsigned spike / later auto-update task)", () => {
  assert.equal(cfg.publish, null);
  const blob = JSON.stringify(cfg);
  assert.doesNotMatch(blob, /"provider"\s*:\s*"github"/);
});

test("builder files include the protocol handler and lib/; pack:test still flips inspect fuse", () => {
  assert.ok(cfg.files.includes("app-protocol.js"));
  assert.ok(cfg.files.includes("lib/**"));
  assert.equal(cfg.electronFuses.enableNodeCliInspectArguments, false);
  assert.equal(cfg.electronFuses.grantFileProtocolExtraPrivileges, false);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "desktop/package.json"), "utf8"));
  assert.match(pkg.scripts["pack:test"], /enableNodeCliInspectArguments=true/);
  assert.match(pkg.scripts.pack, /electron-builder\.config\.cjs/);
  assert.equal(pkg.devDependencies["electron-builder"], "26.15.3");
  assert.doesNotMatch(pkg.devDependencies["electron-builder"], /alpha|27\./);
  assert.match(pkg.homepage || "", /github\.com\/brycejmurrin\/f1-game/);
  // linux.homepage is not in electron-builder 26 LinuxConfiguration schema
  assert.equal(Object.prototype.hasOwnProperty.call(cfg.linux, "homepage"), false);
});

test("committed placeholder icons exist (512 png set; 1024 labelled placeholder)", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "desktop/build/icon.png")));
  assert.ok(fs.existsSync(path.join(ROOT, "desktop/build/icons/512x512.png")));
  assert.ok(fs.existsSync(path.join(ROOT, "desktop/build/icon-1024-PLACEHOLDER.png")));
});
