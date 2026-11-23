/* desktop-read-fuses.test.mjs — `npm run fuses:read` prints plain text when piped.
 *
 * desktop.yml greps that output for `EnableNodeCliInspectArguments is Enabled`.
 * COLOURED is the byte-for-byte stdout of @electron/fuses 2.1.3 `bin.js read`
 * (FORCE_COLOR=1, piped) against a fuse wire of states 0 1 1 1 0 1 0 1 r,
 * captured 2026-11-16. 1.8.0 under FORCE_COLOR=1 prints the same sequences.
 *
 * Run: node --test tests/unit/desktop-read-fuses.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stripAnsi, plainEnv } from "../../desktop/scripts/read-fuses.mjs";

const E = "\u001b";
const COLOURED = [
  `Analyzing app: ${E}[36mfakebin${E}[39m`,
  `Fuse Version: ${E}[36mv1${E}[39m`,
  `  ${E}[33mRunAsNode${E}[39m is ${E}[31mDisabled${E}[39m`,
  `  ${E}[33mEnableCookieEncryption${E}[39m is ${E}[32mEnabled${E}[39m`,
  `  ${E}[33mEnableNodeOptionsEnvironmentVariable${E}[39m is ${E}[32mEnabled${E}[39m`,
  `  ${E}[33mEnableNodeCliInspectArguments${E}[39m is ${E}[32mEnabled${E}[39m`,
  `  ${E}[33mEnableEmbeddedAsarIntegrityValidation${E}[39m is ${E}[31mDisabled${E}[39m`,
  `  ${E}[33mOnlyLoadAppFromAsar${E}[39m is ${E}[32mEnabled${E}[39m`,
  `  ${E}[33mLoadBrowserProcessSpecificV8Snapshot${E}[39m is ${E}[31mDisabled${E}[39m`,
  `  ${E}[33mGrantFileProtocolExtraPrivileges${E}[39m is ${E}[32mEnabled${E}[39m`,
  `  ${E}[33mWasmTrapHandlers${E}[39m is ${E}[31m${E}[9mRemoved${E}[29m${E}[39m`,
  "",
].join("\n");

const PLAIN = [
  "Analyzing app: fakebin",
  "Fuse Version: v1",
  "  RunAsNode is Disabled",
  "  EnableCookieEncryption is Enabled",
  "  EnableNodeOptionsEnvironmentVariable is Enabled",
  "  EnableNodeCliInspectArguments is Enabled",
  "  EnableEmbeddedAsarIntegrityValidation is Disabled",
  "  OnlyLoadAppFromAsar is Enabled",
  "  LoadBrowserProcessSpecificV8Snapshot is Disabled",
  "  GrantFileProtocolExtraPrivileges is Enabled",
  "  WasmTrapHandlers is Removed",
  "",
].join("\n");

test("the coloured 2.x read-out does not contain the line desktop.yml greps for (the red on #5366)", () => {
  assert.equal(COLOURED.includes("EnableNodeCliInspectArguments is Enabled"), false);
});

test("stripAnsi turns the 2.x coloured read-out into the plain 1.8 text", () => {
  assert.equal(stripAnsi(COLOURED), PLAIN);
  assert.equal(stripAnsi(COLOURED).includes("EnableNodeCliInspectArguments is Enabled"), true);
});

test("stripAnsi leaves plain output alone and tolerates no output", () => {
  assert.equal(stripAnsi(PLAIN), PLAIN);
  assert.equal(stripAnsi(undefined), "");
  assert.equal(stripAnsi(null), "");
});

test("the fuses CLI child is asked for no colour, whatever the caller's env says", () => {
  const env = plainEnv({ FORCE_COLOR: "1", PATH: "/bin" });
  assert.equal(env.NO_COLOR, "1");
  assert.equal(env.FORCE_COLOR, "0");
  assert.equal(env.PATH, "/bin");
});
