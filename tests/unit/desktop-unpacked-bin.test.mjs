/* desktop-unpacked-bin.test.mjs — path helper for electron-builder --dir binaries.
 *
 * Run: node --test tests/unit/desktop-unpacked-bin.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findUnpackedBinary } from "../../desktop/scripts/unpacked-bin.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DESKTOP = path.join(ROOT, "desktop");

test("findUnpackedBinary resolves linux-unpacked/<name> when present", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apex-unpacked-"));
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP, "package.json"), "utf8"));
    fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify(pkg));
    const binDir = path.join(tmp, "dist", "linux-unpacked");
    fs.mkdirSync(binDir, { recursive: true });
    const bin = path.join(binDir, pkg.name);
    fs.writeFileSync(bin, "#!/bin/true\n");
    fs.chmodSync(bin, 0o755);
    const hit = findUnpackedBinary({ desktopRoot: tmp, platform: "linux" });
    assert.equal(hit.path, bin);
    assert.equal(hit.platform, "linux");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("findUnpackedBinary throws a helpful error when pack was not run", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apex-unpacked-miss-"));
  try {
    fs.writeFileSync(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "apex26-desktop", productName: "Apex 26" }),
    );
    assert.throws(
      () => findUnpackedBinary({ desktopRoot: tmp, platform: "linux" }),
      /npm run pack/,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("findUnpackedBinary resolves win-unpacked productName.exe (builder default)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apex-unpacked-win-"));
  try {
    fs.writeFileSync(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "apex26-desktop", productName: "Apex 26" }),
    );
    const binDir = path.join(tmp, "dist", "win-unpacked");
    fs.mkdirSync(binDir, { recursive: true });
    // electron-builder names the Windows exe from productName, not package.name
    const bin = path.join(binDir, "Apex 26.exe");
    fs.writeFileSync(bin, "MZ");
    const hit = findUnpackedBinary({ desktopRoot: tmp, platform: "win32" });
    assert.equal(hit.path, bin);
    assert.equal(hit.platform, "win32");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("desktop workflow runs pack-smoke on pull_request and keeps ship-branch push out", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github/workflows/desktop.yml"), "utf8");
  assert.match(yml, /pull_request:/);
  assert.match(yml, /pack-smoke:/);
  assert.match(yml, /test:electron/);
  assert.match(yml, /xvfb-run/);
  assert.match(yml, /APEX_DESKTOP_SOFT_GL/);
  assert.match(yml, /fuses:read|@electron\/fuses/);
  assert.doesNotMatch(yml, /branches:\s*\n\s*-\s*claude\/f1-game-project-26h3ng/);
  assert.match(yml, /Skipping codesign|No CSC_LINK/);
  assert.match(yml, /signtool verify/);
  assert.match(yml, /Auto-update test plan/);
});

test("DESKTOP-TEST-PLAN.md carries the manual per-OS checklist", () => {
  const doc = fs.readFileSync(path.join(ROOT, "docs/notes/DESKTOP-TEST-PLAN.md"), "utf8");
  assert.match(doc, /Manual per-OS checklist/);
  assert.match(doc, /Gatekeeper|SmartScreen/);
  assert.match(doc, /forceDevUpdateConfig|MinIO|latest\*\.yml/);
  assert.match(doc, /EnableNodeCliInspectArguments/);
});
