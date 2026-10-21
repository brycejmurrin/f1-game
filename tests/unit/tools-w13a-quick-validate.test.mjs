/** W13a #3324 — quick-validate --help / -h and non-numeric port reject. */
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseQuickValidatePort } from "../../tools/check/quick-validate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const TOOL = join(ROOT, "tools/check/quick-validate.mjs");

test("parseQuickValidatePort: help, default, valid, reject", () => {
  assert.deepEqual(parseQuickValidatePort(["--help"]), { ok: true, help: true });
  assert.deepEqual(parseQuickValidatePort(["-h"]), { ok: true, help: true });
  assert.deepEqual(parseQuickValidatePort([]), { ok: true, port: 3477 });
  assert.deepEqual(parseQuickValidatePort(["4123"]), { ok: true, port: 4123 });
  const rej = parseQuickValidatePort(["abc"]);
  assert.equal(rej.ok, false);
  assert.ok((rej.error || "").includes("integer"), rej.error);
  const rejFlag = parseQuickValidatePort(["--foo"]);
  assert.equal(rejFlag.ok, false);
});

test("quick-validate --help and -h exit 0 with usage (no server)", () => {
  for (const flag of ["--help", "-h"]) {
    const r = spawnSync(process.execPath, [TOOL, flag], {
      cwd: ROOT, encoding: "utf8", timeout: 10000,
    });
    assert.equal(r.status, 0, `${flag}: ${r.stderr}`);
    assert.ok(/Usage:.*quick-validate/i.test(r.stdout || ""), r.stdout);
    const blob = (r.stderr || "") + (r.stdout || "");
    assert.equal(blob.includes("ERR_SOCKET_BAD_PORT"), false);
    assert.equal(blob.includes("QUICK-VALIDATE"), false);
  }
});

test("quick-validate rejects a non-numeric port before startStaticServer", () => {
  const r = spawnSync(process.execPath, [TOOL, "not-a-port"], {
    cwd: ROOT, encoding: "utf8", timeout: 10000,
  });
  assert.equal(r.status, 2, r.stderr || r.stdout);
  assert.ok((r.stderr || "").includes("port must be an integer"), r.stderr);
  assert.equal((r.stderr || "").includes("ERR_SOCKET_BAD_PORT"), false);
});
