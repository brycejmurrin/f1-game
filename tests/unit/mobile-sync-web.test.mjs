/* mobile-sync-web.test.mjs — sync-web refuses unstamped shells unless --dev.
 *
 * Run: node --test tests/unit/mobile-sync-web.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = path.join(ROOT, "mobile/scripts/sync-web.mjs");

function run(args, extra = {}) {
  return execFileSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    ...extra,
  });
}

test("sync-web refuses a ?v=dev index.html without --dev", () => {
  const dir = path.join(ROOT, "artifacts", "tmp", "mobile-sync-dev-refuse");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), '<script src="js/game.js?v=dev"></script>\n');
  assert.throws(
    () => run(["--src", dir, "--skip-sync"]),
    /unstamped|\?v=dev/,
  );
});

test("sync-web --dev copies an unstamped tree into mobile/www without cap sync", () => {
  const dir = path.join(ROOT, "artifacts", "tmp", "mobile-sync-dev-ok");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), '<html>?v=dev marker</html>\n');
  fs.writeFileSync(path.join(dir, "ok.txt"), "yes\n");
  const out = JSON.parse(run(["--src", dir, "--dev", "--skip-sync"]));
  assert.equal(out.ok, true);
  assert.equal(out.stamped, false);
  assert.equal(out.synced, false);
  const www = path.join(ROOT, "mobile/www/index.html");
  assert.match(fs.readFileSync(www, "utf8"), /\?v=dev/);
  assert.ok(fs.existsSync(path.join(ROOT, "mobile/www/ok.txt")));
});

test("sync-web copies a stamped (no ?v=dev) tree", () => {
  const dir = path.join(ROOT, "artifacts", "tmp", "mobile-sync-stamped");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), '<script src="js/game.js?v=abc123def456"></script>\n');
  const out = JSON.parse(run(["--src", dir, "--skip-sync"]));
  assert.equal(out.ok, true);
  assert.equal(out.stamped, true);
  const html = fs.readFileSync(path.join(ROOT, "mobile/www/index.html"), "utf8");
  assert.doesNotMatch(html, /\?v=dev/);
});

test("sync-web.mjs imports the shared desktop stager, not a second allow-list", () => {
  const src = fs.readFileSync(SCRIPT, "utf8");
  assert.match(src, /tools\/desktop\/stage\.mjs/);
  assert.match(src, /stageSite|stampStaged/);
});
