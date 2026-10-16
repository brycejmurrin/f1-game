/* desktop-pack-dry-run.test.mjs — the desktop packaging inputs resolve without building installers.
 *
 * Run: node --test tests/unit/desktop-pack-dry-run.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { packDryRun } from "../../tools/desktop/pack-dry-run.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("pack dry-run: every packaging input resolves on the working tree", async () => {
  const r = await packDryRun({ root: ROOT });
  assert.deepEqual(r.problems, []);
  assert.ok(r.checked >= 15, `only ${r.checked} checks ran`);
  assert.match(r.version, /^\d+\.\d+\.4242$/);
});

test("pack dry-run leaves the repo untouched (no dist-site, notices or package.json write)", async () => {
  const pkgPath = path.join(ROOT, "desktop/package.json");
  const before = fs.readFileSync(pkgPath, "utf8");
  const had = ["desktop/dist-site", "desktop/build/THIRD-PARTY-NOTICES.txt"].map((p) => fs.existsSync(path.join(ROOT, p)));
  await packDryRun({ root: ROOT });
  assert.equal(fs.readFileSync(pkgPath, "utf8"), before);
  assert.deepEqual(["desktop/dist-site", "desktop/build/THIRD-PARTY-NOTICES.txt"].map((p) => fs.existsSync(path.join(ROOT, p))), had);
});

test("pack dry-run CLI: --dry-run exits 0 with the = line; no flag exits 2", () => {
  const cli = path.join(ROOT, "tools/desktop/pack-dry-run.mjs");
  const ok = spawnSync(process.execPath, [cli, "--dry-run"], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /^= pack dry-run ok: \d+ checks/m);
  assert.equal(spawnSync(process.execPath, [cli], { encoding: "utf8" }).status, 2);
});
