import "../helpers/git-fixture-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { ancestryVerdict, parseLiveShell, renderMarkdown } from "../../tools/ci/release-provenance.mjs";

test("release provenance parses the stamped live shell metadata", () => {
  const live = parseLiveShell(`
    <meta name="apex-sha" content="ABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD">
    <meta name="apex-build" content="16573">
    <meta name="apex-version" content="2026.10.16">
  `);
  assert.deepEqual(live, {
    sha: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
    build: "16573",
    version: "2026.10.16",
  });
});

test("release provenance rejects an untrusted live sha", () => {
  assert.equal(parseLiveShell('<meta name="apex-sha" content="latest">').sha, null);
  assert.equal(ancestryVerdict({ sourceSha: "a", deploySha: "b", liveSha: null, mergeBase: "a" }), "live-unknown");
});

test("release provenance distinguishes exact deploy from newer source", () => {
  assert.equal(ancestryVerdict({ sourceSha: "source", deploySha: "deploy", liveSha: "deploy", mergeBase: "base" }), "live-exact-deploy");
  assert.equal(ancestryVerdict({ sourceSha: "source", deploySha: "deploy", liveSha: "source", mergeBase: "base" }), "live-exact-source");
  assert.equal(ancestryVerdict({ sourceSha: "source", deploySha: "deploy", liveSha: "base", mergeBase: "base" }), "live-at-merge-base");
});

test("release provenance markdown keeps the source/live distinction visible", () => {
  const text = renderMarkdown({ verdict: "live-exact-deploy", repository: "origin", branch: "main", sourceSha: "source", deploySha: "deploy", liveSha: "deploy", mergeBase: "base", liveBuild: "42", liveVersion: null, dirty: false, site: "https://example.test" });
  assert.match(text, /The deploy tip is live/);
  assert.match(text, /\| Source SHA \| source \|/);
  assert.match(text, /\| Live SHA \| deploy \|/);
});

// Run the actual CLI against a fresh Git history and local HTTP shell. Imported
// verdict tests alone cannot establish the exit status automation consumes.
test("strict provenance requires clean, resolved, matching source and deploy commits", async (t) => {
  const { default: fs } = await import("node:fs");
  const { default: path } = await import("node:path");
  const { execFileSync, spawn } = await import("node:child_process");
  const { createServer } = await import("node:http");
  const root = path.resolve("artifacts/infra-audit");
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, "provenance-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-q"); git("config", "user.name", "fixture"); git("config", "user.email", "fixture@example.test");
  git("commit", "--allow-empty", "-qm", "source");
  const source = git("rev-parse", "HEAD");
  git("branch", "deploy");
  let live = source;
  const server = createServer((req, res) => res.end(`<meta name="apex-sha" content="${live}">`));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const cli = new URL("../../tools/ci/release-provenance.mjs", import.meta.url).pathname;
  const run = (ref = "deploy", cwd = dir) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "--strict", "--json", "--deploy-ref", ref,
      "--site", `http://127.0.0.1:${server.address().port}`], { cwd, timeout: 5000 });
    let stdout = "", stderr = "";
    child.stdout.on("data", d => stdout += d); child.stderr.on("data", d => stderr += d);
    child.on("error", reject);
    child.on("close", (code, signal) => {
      try { assert.equal(signal, null, stderr); resolve({ code, data: JSON.parse(stdout) }); } catch (e) { reject(e); }
    });
  });
  assert.equal((await run()).code, 0, "matching clean commits pass");
  assert.equal((await run("missing-ref")).code, 1, "missing deploy ref is not success");
  fs.writeFileSync(path.join(dir, "dirty"), "uncommitted");
  assert.equal((await run()).code, 1, "dirty bytes are not the stamped revision");
  fs.unlinkSync(path.join(dir, "dirty"));
  git("commit", "--allow-empty", "-qm", "new source");
  assert.equal((await run()).code, 1, "live deploy alone does not prove current source");
  live = git("rev-parse", "HEAD");
  assert.equal((await run()).code, 1, "live source alone does not prove deploy ref");
  live = "f".repeat(40);
  assert.equal((await run()).code, 1, "unrelated SHA cannot prove ancestry");
  live = "missing";
  assert.equal((await run()).code, 1, "missing shell stamp fails closed");
});
