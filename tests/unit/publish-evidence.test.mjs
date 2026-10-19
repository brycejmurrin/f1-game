// Generated evidence: real archive round-trip and source/file checksums; mocked GitHub publication verifies non-overwrite and retry behavior.
import "../helpers/git-fixture-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { inspectEvidence, prepareEvidence, publishEvidence, STORAGE_ANCHOR } from "../../tools/shot/publish-evidence.mjs";
import { exportHistoryEvidence, validateHistorySelection } from "../../tools/shot/export-history-evidence.mjs";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  git("init"); git("config", "user.name", "Evidence test"); git("config", "user.email", "evidence@example.test");
  fs.writeFileSync(path.join(root, ".gitignore"), "artifacts/\nscratch/\n");
  git("add", ".gitignore"); git("commit", "-m", "fixture");
  const input = path.join(root, "artifacts", "survey");
  fs.mkdirSync(path.join(input, "media"), { recursive: true });
  fs.writeFileSync(path.join(input, "index.html"), '<img src="media/view.svg">');
  fs.writeFileSync(path.join(input, "media", "view.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  return { root, dir: input, label: "monza-survey", git };
}

test("plan reads only the requested output directory and creates no upload files", (t) => {
  const f = fixture(t), plan = inspectEvidence(f);
  assert.deepEqual(plan.files.map((x) => x.path), ["index.html", "media/view.svg"]);
  assert.equal(plan.bytes, plan.files.reduce((sum, x) => sum + x.bytes, 0));
  assert.equal(fs.existsSync(path.join(f.root, "artifacts", "evidence-uploads")), false);
  assert.throws(() => inspectEvidence({ ...f, dir: f.root }), /inside/);
  assert.throws(() => inspectEvidence({ ...f, label: "bad/label" }), /label/);
});

test("input cannot be symlinked outside the checkout or contain symlinks and dependencies", (t) => {
  const f = fixture(t), external = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-outside-"));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));
  fs.symlinkSync(external, path.join(f.root, "scratch"), "dir");
  fs.mkdirSync(path.join(external, "capture"));
  assert.throws(() => inspectEvidence({ ...f, dir: path.join(f.root, "scratch", "capture") }), /resolve inside/);
  fs.symlinkSync(path.join(f.root, ".gitignore"), path.join(f.dir, "secret"));
  assert.throws(() => inspectEvidence(f), /symlinks/);
  fs.unlinkSync(path.join(f.dir, "secret"));
  fs.mkdirSync(path.join(f.dir, "node_modules"));
  assert.throws(() => inspectEvidence(f), /dependency/);
});

test("bundle round-trips nested gallery files and records their hashes and source provenance", (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, "changed.txt"), "uncommitted source context");
  const bundle = prepareEvidence(f), base = path.dirname(bundle.receiptPath);
  const out = path.join(f.root, "extracted"); fs.mkdirSync(out);
  execFileSync("tar", ["-xzf", path.join(base, bundle.assets[0].name), "-C", out]);
  const manifest = JSON.parse(fs.readFileSync(path.join(out, "manifest.json")));
  assert.equal(manifest.sourceSha, f.git("rev-parse", "HEAD"));
  assert.equal(manifest.storageAnchorSha, STORAGE_ANCHOR);
  assert.equal(manifest.dirty, true);
  for (const file of manifest.files) {
    const bytes = fs.readFileSync(path.join(out, "files", file.path));
    assert.equal(bytes.length, file.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
  }
  assert.equal(fs.readFileSync(path.join(out, "files", "index.html"), "utf8"), '<img src="media/view.svg">');
  assert.equal(fs.existsSync(path.join(base, "bundle")), false);
  assert.equal(bundle.state, "prepared");
});

test("a redirected upload output is rejected before it can create files elsewhere", (t) => {
  const f = fixture(t), external = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-output-"));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));
  fs.symlinkSync(external, path.join(f.root, "artifacts", "evidence-uploads"), "dir");
  assert.throws(() => prepareEvidence(f), /must not be a symlink/);
  assert.deepEqual(fs.readdirSync(external), []);
});

function fakeGitHub(bundle, { existing = false, badDigest = false } = {}) {
  const calls = [];
  let created = existing;
  const release = () => ({
    draft: false, prerelease: true, tag_name: bundle.tag, target_commitish: STORAGE_ANCHOR,
    html_url: `https://github.com/${bundle.repository}/releases/tag/${bundle.tag}`,
    assets: bundle.assets.map((a) => ({ name: a.name, digest: `sha256:${badDigest ? "wrong" : a.sha256}`, browser_download_url: `https://github.com/${bundle.repository}/releases/download/${bundle.tag}/${a.name}` })),
  });
  return { calls, run(cmd, args) {
    assert.equal(cmd, "gh"); calls.push(args);
    if (args[0] === "api") {
      if (created && args[1].includes("/releases/")) return JSON.stringify(release());
      throw Object.assign(new Error("not found"), { stderr: "gh: Not Found (HTTP 404)" });
    }
    assert.deepEqual(args.slice(0, 2), ["release", "create"]);
    assert.ok(args.includes("--prerelease")); assert.ok(args.includes("--latest=false"));
    assert.equal(args[args.indexOf("--target") + 1], STORAGE_ANCHOR);
    assert.notEqual(STORAGE_ANCHOR, bundle.sourceSha);
    assert.equal(args.some((a) => /clobber|delete|edit/.test(a)), false);
    created = true; return "";
  } };
}

test("publication anchors tags outside game history, verifies every asset, and reuses matching uploads", (t) => {
  const bundle = prepareEvidence(fixture(t)), gh = fakeGitHub(bundle);
  const result = publishEvidence(bundle.receiptPath, gh.run);
  assert.equal(result.state, "published");
  assert.ok(result.assets.every((a) => a.url.includes("/releases/download/")));
  publishEvidence(bundle.receiptPath, gh.run);
  assert.equal(gh.calls.filter((a) => a[0] === "release").length, 1);
});

test("changed local data and mismatched remote hashes fail without overwriting", (t) => {
  const bundle = prepareEvidence(fixture(t));
  const bad = fakeGitHub(bundle, { existing: true, badDigest: true });
  assert.throws(() => publishEvidence(bundle.receiptPath, bad.run), /checksum/);
  assert.equal(bad.calls.some((a) => a[0] === "release"), false);
  fs.appendFileSync(path.join(path.dirname(bundle.receiptPath), bundle.assets[0].name), "changed");
  assert.throws(() => publishEvidence(bundle.receiptPath, () => assert.fail("must not contact GitHub")), /local asset changed/);
});

test("authentication errors are not treated as missing releases", (t) => {
  const bundle = prepareEvidence(fixture(t));
  assert.throws(() => publishEvidence(bundle.receiptPath, () => { throw Object.assign(new Error("unauthorized"), { stderr: "HTTP 401" }); }), /unauthorized/);
});

test("existing conflicting tags and draft releases require inspection instead of replacement", (t) => {
  const bundle = prepareEvidence(fixture(t));
  assert.throws(() => publishEvidence(bundle.receiptPath, (_cmd, args) => {
    if (args[1].includes("/releases/")) throw Object.assign(new Error("missing"), { stderr: "HTTP 404" });
    return JSON.stringify({ object: { type: "commit", sha: "f".repeat(40) } });
  }), /another storage anchor/);
  assert.throws(() => publishEvidence(bundle.receiptPath, () => JSON.stringify({ draft: true })), /release metadata/);
});

test("historical exports preserve committed bytes and blob identities despite working-tree edits", (t) => {
  const f = fixture(t), image = path.join(f.root, "gallery", "view.png");
  fs.mkdirSync(path.dirname(image));
  const original = Buffer.from([137, 80, 78, 71, 0, 255, 1]);
  fs.writeFileSync(image, original); f.git("add", "gallery"); f.git("commit", "-m", "capture");
  const sha = f.git("rev-parse", "HEAD"), blob = f.git("rev-parse", "HEAD:gallery/view.png");
  fs.writeFileSync(image, "uncommitted modification");
  const exported = exportHistoryEvidence({ root: f.root, sha, paths: ["gallery/view.png"] });
  assert.deepEqual(fs.readFileSync(path.join(exported.dir, "gallery/view.png")), original);
  assert.equal(exported.origin.archivedCommit, sha);
  assert.equal(exported.origin.captureSourceSha, null);
  assert.equal(exported.origin.files[0].gitBlobSha1, blob);
  assert.equal(exported.origin.files[0].sha256, createHash("sha256").update(original).digest("hex"));
  assert.throws(() => exportHistoryEvidence({ root: f.root, sha, paths: ["gallery"] }), /already exists/);
});

test("historical selections reject traversal, ref/pathspec injection, missing paths and wrong checkouts", (t) => {
  const f = fixture(t), sha = f.git("rev-parse", "HEAD");
  for (const p of ["../gallery", "/gallery/a.png", ":(glob)gallery/*", "gallery/../a.png", "gallery/.git/config", "js/game.js"]) {
    assert.throws(() => validateHistorySelection(sha, [p]), /path|evidence/);
  }
  assert.throws(() => validateHistorySelection("main", ["gallery/view.png"]), /full commit/);
  assert.throws(() => exportHistoryEvidence({ root: f.root, sha: "f".repeat(40), paths: ["gallery/missing.png"] }), /does not match/);
  assert.throws(() => exportHistoryEvidence({ root: f.root, sha, paths: ["gallery/missing.png"] }), /missing/);
  assert.equal(fs.existsSync(path.join(f.root, "artifacts/promoted-evidence")), false);
});

test("historical export refuses committed links and symlinked output before writing outside the checkout", (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, "gallery"));
  fs.symlinkSync("../.gitignore", path.join(f.root, "gallery/link.md"));
  f.git("add", "gallery"); f.git("commit", "-m", "link");
  assert.throws(() => exportHistoryEvidence({ root: f.root, sha: f.git("rev-parse", "HEAD"), paths: ["gallery"] }), /regular files/);
  fs.unlinkSync(path.join(f.root, "gallery/link.md"));
  fs.writeFileSync(path.join(f.root, "gallery/view.png"), "image");
  f.git("add", "gallery"); f.git("commit", "-m", "regular capture");
  fs.rmSync(path.join(f.root, "artifacts"), { recursive: true });
  const external = path.join(f.root, "elsewhere"); fs.mkdirSync(external);
  fs.symlinkSync(external, path.join(f.root, "artifacts"), "dir");
  assert.throws(() => exportHistoryEvidence({ root: f.root, sha: f.git("rev-parse", "HEAD"), paths: ["gallery"] }), /symlink/);
  assert.deepEqual(fs.readdirSync(external), []);
});

test("optional direct image assets preserve nested filename collisions and are verified on publication", (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.dir, "other"));
  fs.writeFileSync(path.join(f.dir, "media/view.png"), "first image");
  fs.writeFileSync(path.join(f.dir, "other/view.png"), "second image");
  const bundle = prepareEvidence({ ...f, linkableFiles: ["media/view.png", "other/view.png"] });
  assert.equal(bundle.assets.length, 5);
  const dir = path.dirname(bundle.receiptPath);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "monza-survey-manifest.json")));
  assert.equal(new Set(manifest.directAssets.map((a) => a.name)).size, 2);
  for (const a of manifest.directAssets) {
    assert.deepEqual(fs.readFileSync(path.join(dir, a.name)), fs.readFileSync(path.join(f.dir, a.path)));
    assert.ok(bundle.assets.some((f) => f.name === a.name && f.sha256 === a.sha256));
  }
  const checksum = fs.readFileSync(path.join(dir, bundle.assets.at(-1).name), "utf8");
  assert.equal(checksum.trim().split("\n").length, 4);
  assert.equal(publishEvidence(bundle.receiptPath, fakeGitHub(bundle).run).assets.length, 5);
});

test("direct assets cannot select missing or non-image files", (t) => {
  const f = fixture(t);
  assert.throws(() => prepareEvidence({ ...f, linkableFiles: ["index.html"] }), /selected images/);
  assert.throws(() => prepareEvidence({ ...f, linkableFiles: ["../secret.png"] }), /selected images/);
});
