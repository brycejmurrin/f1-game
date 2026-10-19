// poll-live-shell: match, superseded (ancestor + build≥), timeout with last live values, incoherent wait.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseShellMetas,
  parseVersionJson,
  evaluateLiveSnapshot,
  backoffMs,
  pollLiveShell,
} from "../../tools/ci/poll-live-shell.mjs";

const SHA_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SHA_C = "cccccccccccccccccccccccccccccccccccccccc";

function shellHtml(build, sha) {
  return `<meta name="apex-build" content="${build}" /><meta name="apex-sha" content="${sha}" />`;
}

test("parseShellMetas requires exactly one apex-build and one apex-sha", () => {
  const ok = parseShellMetas(shellHtml(42, SHA_A));
  assert.equal(ok.build, 42);
  assert.equal(ok.sha, SHA_A);
  const dup = parseShellMetas(`${shellHtml(1, SHA_A)}${shellHtml(2, SHA_B)}`);
  assert.equal(dup.build, null);
  assert.equal(dup.sha, null);
});

test("parseVersionJson tolerates missing sha and rejects junk", () => {
  assert.deepEqual(parseVersionJson('{"build":99}').build, 99);
  assert.equal(parseVersionJson("not-json").build, null);
  assert.equal(parseVersionJson('{"build":0}').build, null);
  assert.equal(parseVersionJson('{"build":"4242"}').build, null, "string builds must not coerce");
});

test("evaluateLiveSnapshot matches exact build and sha", () => {
  const result = evaluateLiveSnapshot({
    expectedBuild: 100,
    expectedSha: SHA_A,
    version: { build: 100, sha: SHA_A },
    metas: { build: 100, sha: SHA_A, builds: ["100"], shas: [SHA_A] },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "match");
});

test("evaluateLiveSnapshot passes when a newer build superseded this sha", () => {
  const result = evaluateLiveSnapshot({
    expectedBuild: 100,
    expectedSha: SHA_A,
    version: { build: 105, sha: SHA_B },
    metas: { build: 105, sha: SHA_B, builds: ["105"], shas: [SHA_B] },
    isAncestor: (ancestor, descendant) => ancestor === SHA_A && descendant === SHA_B,
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "superseded");
});

test("evaluateLiveSnapshot does not pass a divergent newer live sha", () => {
  const result = evaluateLiveSnapshot({
    expectedBuild: 100,
    expectedSha: SHA_A,
    version: { build: 200, sha: SHA_C },
    metas: { build: 200, sha: SHA_C, builds: ["200"], shas: [SHA_C] },
    isAncestor: () => false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "waiting");
});

test("evaluateLiveSnapshot waits while live build is still behind", () => {
  const result = evaluateLiveSnapshot({
    expectedBuild: 100,
    expectedSha: SHA_A,
    version: { build: 90, sha: SHA_A },
    metas: { build: 90, sha: SHA_A, builds: ["90"], shas: [SHA_A] },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "waiting");
  assert.match(result.detail, /behind/);
});

test("backoffMs grows then caps", () => {
  assert.ok(backoffMs(0) >= 5_000);
  assert.ok(backoffMs(20) <= 20_000);
  assert.equal(backoffMs(50), 20_000);
});

test("pollLiveShell logs last live values and fails on timeout", async () => {
  const lines = [];
  const result = await pollLiveShell({
    pageUrl: "https://example.test/game/",
    build: 50,
    sha: SHA_A,
    attempts: 3,
    runId: "t",
    wait: async () => {},
    log: (...args) => lines.push(args.join(" ")),
    isAncestor: () => false,
    fetchText: async (url) => {
      if (url.includes("version.json")) return JSON.stringify({ build: 40, sha: SHA_B });
      return shellHtml(40, SHA_B);
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "timeout");
  assert.match(result.detail, /last live build=40 sha=b{40}/);
  assert.ok(lines.some((line) => line.includes("live build=40")));
});

test("pollLiveShell returns superseded without requiring exact build equality", async () => {
  const result = await pollLiveShell({
    pageUrl: "https://example.test/game/",
    build: 50,
    sha: SHA_A,
    attempts: 2,
    wait: async () => {},
    log: () => {},
    isAncestor: (a, b) => a === SHA_A && b === SHA_B,
    fetchText: async (url) => {
      if (url.includes("version.json")) return JSON.stringify({ build: 77, sha: SHA_B });
      return shellHtml(77, SHA_B);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "superseded");
});

test("pollLiveShell eventually matches after behind snapshots", async () => {
  let n = 0;
  const result = await pollLiveShell({
    pageUrl: "https://example.test/game/",
    build: 50,
    sha: SHA_A,
    attempts: 5,
    wait: async () => {},
    log: () => {},
    fetchText: async (url) => {
      n += 1;
      const build = n < 4 ? 49 : 50;
      const sha = n < 4 ? SHA_B : SHA_A;
      if (url.includes("version.json")) return JSON.stringify({ build, sha });
      return shellHtml(build, sha);
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "match");
});
