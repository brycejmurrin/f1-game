/* gitignore-secrets.test.mjs — W24 row 9: dotenv files and private keys are
 * ignored, and none is tracked. Asks git itself (check-ignore), not a regex.
 *
 * Run: node --test tests/unit/gitignore-secrets.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const git = (...a) => spawnSync("git", a, { cwd: ROOT, encoding: "utf8" });

test("dotenv files, .pem and .key are ignored; .env.example is not", () => {
  for (const f of [".env", ".env.local", "tools/.env.production", "certs/site.pem", "deploy.key"]) {
    assert.equal(git("check-ignore", "-q", "--no-index", f).status, 0, f + " must be ignored");
  }
  assert.equal(git("check-ignore", "-q", "--no-index", ".env.example").status, 1, ".env.example stays committable");
});

test("no tracked dotenv or key file", () => {
  const tracked = git("ls-files").stdout.split("\n").filter((f) => /(^|\/)\.env(?!\.example$)|\.(pem|key)$/.test(f));
  assert.deepEqual(tracked, []);
});
