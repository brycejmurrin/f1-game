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

function fixture(t) {
  const tmp = path.join(ROOT, "artifacts", "tmp");
  fs.mkdirSync(tmp, { recursive: true });
  const root = fs.mkdtempSync(path.join(tmp, "mobile-sync-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, "src"), www = path.join(root, "www");
  fs.mkdirSync(dir);
  return { dir, www, args: ["--src", dir, "--out", www, "--skip-sync"] };
}

test("sync-web refuses a ?v=dev index.html without --dev", (t) => {
  const { dir, www, args } = fixture(t);
  fs.writeFileSync(path.join(dir, "index.html"), '<script src="js/game.js?v=dev"></script>\n');
  assert.throws(
    () => run(args),
    /unstamped|\?v=dev/,
  );
  assert.equal(fs.existsSync(www), false, "refusal never creates the destination");
});

test("sync-web --dev copies an unstamped tree into an isolated destination without cap sync", (t) => {
  const { dir, www, args } = fixture(t);
  fs.writeFileSync(path.join(dir, "index.html"), '<html>?v=dev marker</html>\n');
  fs.writeFileSync(path.join(dir, "ok.txt"), "yes\n");
  const out = JSON.parse(run([...args, "--dev"]));
  assert.equal(out.ok, true);
  assert.equal(out.stamped, false);
  assert.equal(out.synced, false);
  assert.equal(out.www, www);
  assert.match(fs.readFileSync(path.join(www, "index.html"), "utf8"), /\?v=dev/);
  assert.ok(fs.existsSync(path.join(www, "ok.txt")));
});

test("sync-web copies a stamped (no ?v=dev) tree", (t) => {
  const { dir, www, args } = fixture(t);
  fs.writeFileSync(path.join(dir, "index.html"), '<script src="js/game.js?v=abc123def456"></script>\n');
  const out = JSON.parse(run(args));
  assert.equal(out.ok, true);
  assert.equal(out.stamped, true);
  assert.equal(out.www, www);
  const html = fs.readFileSync(path.join(www, "index.html"), "utf8");
  assert.doesNotMatch(html, /\?v=dev/);
});

test("sync-web refuses a custom destination before staging unless sync is skipped", (t) => {
  const { dir, www } = fixture(t);
  fs.writeFileSync(path.join(dir, "index.html"), "stamped fixture\n");
  assert.throws(() => run(["--src", dir, "--out", www]), /--out requires a directory and --skip-sync/);
  assert.equal(fs.existsSync(www), false);
});

test("custom destinations cannot erase existing data or overlap the source", (t) => {
  const { dir, www } = fixture(t);
  const html = "stamped fixture\n";
  fs.writeFileSync(path.join(dir, "index.html"), html);
  fs.mkdirSync(www);
  fs.writeFileSync(path.join(www, "sentinel.txt"), "keep\n");
  const nested = path.join(dir, "copy");
  const alias = path.join(path.dirname(dir), "source-alias");
  fs.symlinkSync(dir, alias, "junction");
  for (const dest of [www, dir, path.dirname(dir), nested, path.join(alias, "copy")]) {
    assert.throws(() => run(["--src", dir, "--out", dest, "--skip-sync"]), /EEXIST|must not overlap/);
    assert.equal(fs.readFileSync(path.join(dir, "index.html"), "utf8"), html);
    assert.equal(fs.readFileSync(path.join(www, "sentinel.txt"), "utf8"), "keep\n");
    assert.equal(fs.existsSync(nested), false, "reject before creating an overlapping destination");
  }
});

test("sync-web.mjs imports the shared desktop stager, not a second allow-list", () => {
  const src = fs.readFileSync(SCRIPT, "utf8");
  assert.match(src, /tools\/desktop\/stage\.mjs/);
  assert.match(src, /stageSite|stampStaged/);
});
