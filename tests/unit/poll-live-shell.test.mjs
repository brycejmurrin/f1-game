// poll-live-shell: match, superseded (ancestor + build≥), timeout with last live values, incoherent wait.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseShellMetas,
  parseVersionJson,
  evaluateLiveSnapshot,
  backoffMs,
  pollLiveShell,
  worstCasePollMs,
  DEFAULT_ATTEMPTS,
  FETCH_TIMEOUT_MS,
  BACKOFF_BASE_MS,
  BACKOFF_CAP_MS,
  VERIFY_LIVE_JOB_TIMEOUT_MINUTES,
  VERIFY_LIVE_OVERHEAD_MS,
} from "../../tools/ci/poll-live-shell.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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
  assert.ok(backoffMs(0) >= BACKOFF_BASE_MS);
  assert.ok(backoffMs(20) <= BACKOFF_CAP_MS);
  assert.equal(backoffMs(50), BACKOFF_CAP_MS);
  // Strictly growing before the cap, so a constant CAP cannot pass.
  assert.ok(backoffMs(0) < backoffMs(1) && backoffMs(1) < backoffMs(5), "the delay grows with the attempt");
  assert.ok(backoffMs(5) < BACKOFF_CAP_MS, "attempt 5 is still below the cap");
});

test("pollLiveShell survives a rejecting fetch, sleeps with backoff, and recovers", async () => {
  let calls = 0;
  const sleeps = [];
  const lines = [];
  const result = await pollLiveShell({
    pageUrl: "https://example.test/game/", build: 50, sha: SHA_A, attempts: 3, runId: "t",
    wait: async (ms) => { sleeps.push(ms); },
    log: (...args) => lines.push(args.join(" ")),
    isAncestor: () => false,
    fetchText: async (url) => {
      calls++;
      if (calls <= 2) throw new Error("socket hang up");
      return url.includes("version.json") ? JSON.stringify({ build: 50, sha: SHA_A }) : shellHtml(50, SHA_A);
    },
  });
  assert.equal(result.ok, true, "a transient fetch failure must not end the poll");
  assert.ok(lines.some((l) => /fetch failed: socket hang up/.test(l)), "the throw is logged");
  assert.ok(sleeps.length >= 1 && sleeps[0] === backoffMs(0), `slept the backoff after the throw: ${sleeps}`);
});

test("pollLiveShell that never fetches ends in a timeout naming the fetch error", async () => {
  const result = await pollLiveShell({
    pageUrl: "https://example.test/game/", build: 50, sha: SHA_A, attempts: 2, runId: "t",
    wait: async () => {}, log: () => {}, isAncestor: () => false,
    fetchText: async () => { throw new Error("ECONNRESET"); },
  });
  assert.equal(result.ok, false);
  assert.match(result.detail, /fetch failed: ECONNRESET/);
});

test("worst-case poll plus overhead fits inside the verify-live job timeout", () => {
  // A wrong shell must exit the poll with a clear error (and reach the
  // failure() auto-issue step) before Actions kills the job (#2923 DAD).
  const jobMs = VERIFY_LIVE_JOB_TIMEOUT_MINUTES * 60_000;
  const pollMs = worstCasePollMs();
  assert.equal(DEFAULT_ATTEMPTS, 24);
  assert.ok(FETCH_TIMEOUT_MS <= 10_000, "poll fetch timeout stays short so N×2 fetches fit");
  assert.ok(
    pollMs + VERIFY_LIVE_OVERHEAD_MS < jobMs,
    `poll worst-case ${pollMs}ms + overhead ${VERIFY_LIVE_OVERHEAD_MS}ms must be < job ${jobMs}ms`,
  );
  // Leave ≥90s spare so a slow checkout or stamp does not race the kill.
  assert.ok(jobMs - (pollMs + VERIFY_LIVE_OVERHEAD_MS) >= 90_000);

  const pages = fs.readFileSync(path.join(ROOT, ".github/workflows/pages.yml"), "utf8");
  const start = pages.indexOf("\n  verify-live:");
  assert.ok(start >= 0, "pages.yml has a verify-live job");
  // Skip the job's own header line so the next `\n  name:` is a sibling job (or EOF).
  const afterHeader = pages.slice(start + "\n  verify-live:".length);
  const nextJob = afterHeader.search(/\n  [a-z][\w-]*:/);
  const block = nextJob >= 0 ? afterHeader.slice(0, nextJob) : afterHeader;
  const m = block.match(/^\s*timeout-minutes:\s*(\d+)\s*$/m);
  assert.ok(m, "verify-live declares timeout-minutes");
  assert.equal(
    Number(m[1]),
    VERIFY_LIVE_JOB_TIMEOUT_MINUTES,
    "pages.yml verify-live timeout must match VERIFY_LIVE_JOB_TIMEOUT_MINUTES",
  );
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

test("pollLiveShell cache-busts every fetch with a query unique per attempt and per file pair", async () => {
  const urls = [];
  await pollLiveShell({
    pageUrl: "https://example.test/game", build: 50, sha: SHA_A, attempts: 3, runId: "t",
    wait: async () => {}, log: () => {}, isAncestor: () => false,
    fetchText: async (url) => {
      urls.push(url);
      return url.includes("version.json") ? JSON.stringify({ build: 40, sha: SHA_B }) : shellHtml(40, SHA_B);
    },
  });
  assert.equal(urls.length, 6, "version.json + index.html on each of 3 attempts");
  const busts = urls.map((u) => new URL(u).searchParams.get("_"));
  assert.ok(busts.every((b) => /^t-\d+-\d+$/.test(b)), `bust shape runId-attempt-time: ${busts}`);
  assert.equal(new Set(busts.filter((_, i) => i % 2 === 0)).size, 3, "each attempt busts differently");
  assert.equal(busts[0], busts[1], "the pair within one attempt shares its bust");
});
