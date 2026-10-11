/* mobile-sync-web.test.mjs — sync-web refuses unstamped shells unless --dev,
 * and (with desktop/lib/site.cjs) reuses an earlier stage only when it was
 * stamped from HEAD (R3-ARCHITECTURE-11).
 *
 * Run: node --test tests/unit/mobile-sync-web.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { prepareSrc, resolveSrc } from "../../mobile/scripts/sync-web.mjs";

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

/* R3-ARCHITECTURE-11 (2026-10-10). Without --src, sync-web used ANY index.html
 * in artifacts/site or _site, and the desktop resolver ANY artifacts/site — so
 * an APK or installer built from commit X could package an earlier stage.
 * A reused tree must carry <meta name="apex-sha"> == HEAD; otherwise stage fresh. */
const HEAD = "1111111111111111111111111111111111111111";
const OLD = "2222222222222222222222222222222222222222";
function stagedTree(dir, sha) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"),
    `<meta name="apex-build" content="2400">\n${sha ? `<meta name="apex-sha" content="${sha}">\n` : ""}<script src="js/game.js?v=abc123def456"></script>\n`);
  fs.writeFileSync(path.join(dir, "version.json"), `{ "build": 2400 }\n`);
}
function fakeRoot(t) {
  const tmp = path.join(ROOT, "artifacts", "tmp");
  fs.mkdirSync(tmp, { recursive: true });
  const root = fs.mkdtempSync(path.join(tmp, "mobile-root-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("sync-web restages instead of reusing a stale artifacts/site or _site", (t) => {
  const root = fakeRoot(t);
  const artifacts = path.join(root, "artifacts", "site");
  stagedTree(artifacts, OLD);
  stagedTree(path.join(root, "_site"), null);   // an unstamped Pages stage: no provenance at all
  assert.equal(resolveSrc({ root, explicit: null, head: HEAD }), null, "neither tree is HEAD's");
  const calls = [];
  const src = prepareSrc({
    root, explicit: null, head: HEAD, dev: false,
    stage: (dest, o) => { calls.push(["stage", dest, o.root]); fs.rmSync(dest, { recursive: true, force: true }); stagedTree(dest, null); },
    stamp: (dest, o) => { calls.push(["stamp", dest, o.root]); stagedTree(dest, HEAD); },
  });
  assert.equal(src, artifacts);
  assert.deepEqual(calls, [["stage", artifacts, root], ["stamp", artifacts, root]]);
  assert.match(fs.readFileSync(path.join(src, "index.html"), "utf8"), new RegExp(HEAD));
});

test("sync-web reuses a stage stamped from HEAD without restaging", (t) => {
  const root = fakeRoot(t);
  stagedTree(path.join(root, "artifacts", "site"), OLD);
  stagedTree(path.join(root, "_site"), HEAD);
  const boom = () => { throw new Error("must not restage a current tree"); };
  assert.equal(prepareSrc({ root, explicit: null, head: HEAD, dev: false, stage: boom, stamp: boom }), path.join(root, "_site"));
  assert.equal(resolveSrc({ root, explicit: null, head: null }), null, "no HEAD (git failed): nothing is provably current");
});

test("desktop resolveSiteDir ignores a stale artifacts/site fallback", (t) => {
  const { resolveSiteDir, stagedSha } = createRequire(import.meta.url)("../../desktop/lib/site.cjs");
  const root = fakeRoot(t);
  const desktop = path.join(root, "desktop");
  fs.mkdirSync(desktop);
  const artifacts = path.join(root, "artifacts", "site");
  stagedTree(artifacts, OLD);
  const saved = process.env.APEX_SITE_DIR;
  delete process.env.APEX_SITE_DIR;
  t.after(() => { if (saved !== undefined) process.env.APEX_SITE_DIR = saved; });
  assert.equal(stagedSha(artifacts), OLD);
  assert.equal(resolveSiteDir(desktop, { head: HEAD }), path.join(desktop, "dist-site"),
    "a stale fallback resolves to dist-site, which prebuild then refuses as missing (run npm run stage)");
  assert.equal(resolveSiteDir(desktop, { head: OLD }), artifacts, "the fallback stays when it IS this commit's stage");
});
