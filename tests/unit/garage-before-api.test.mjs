/* garage-before-api.test.mjs — GitHub REST retry + ?name= filter for garage-before.mjs.
 *
 * Mocked fetch only — no network, no Chromium. Delay forced to 0 so retries are instant.
 *
 * Run: node --test tests/unit/garage-before-api.test.mjs
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  ARTIFACT_PREFIX,
  GITHUB_API_MAX_ATTEMPTS,
  githubApi,
  listPackArtifacts,
  setGithubApiTestHooks,
} from "../../tools/shot/garage-before.mjs";

const TOKEN = "test-token-not-real";
const logs = [];
const origError = console.error;

function jsonResponse(status, body, headers = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

beforeEach(() => {
  logs.length = 0;
  console.error = (...args) => { logs.push(args.map(String).join(" ")); };
  setGithubApiTestHooks({ delay: 0, random: () => 0 });
});

afterEach(() => {
  console.error = origError;
  setGithubApiTestHooks({});
});

test("githubApi: 502 then 200 succeeds after one retry", async () => {
  let n = 0;
  setGithubApiTestHooks({
    delay: 0,
    random: () => 0,
    fetch: async () => {
      n++;
      if (n === 1) return jsonResponse(502, { message: "Bad Gateway" });
      return jsonResponse(200, { ok: true });
    },
  });
  const r = await githubApi("GET", "commits/HEAD", { token: TOKEN });
  assert.equal(r.code, 200);
  assert.deepEqual(r.json, { ok: true });
  assert.equal(n, 2);
  assert.ok(logs.some((l) => /retry 1\/4 after HTTP 502/.test(l)));
});

test("githubApi: repeated 500 gives up after max attempts with HTTP error", async () => {
  let n = 0;
  setGithubApiTestHooks({
    delay: 0,
    random: () => 0,
    fetch: async () => {
      n++;
      return jsonResponse(500, { message: "Server Error" });
    },
  });
  const r = await githubApi("GET", "actions/artifacts?per_page=100", { token: TOKEN });
  assert.equal(r.code, 500);
  assert.match(r.error, /^HTTP 500/);
  assert.equal(n, GITHUB_API_MAX_ATTEMPTS);
  assert.equal(logs.filter((l) => /retry \d+\/4 after HTTP 500/.test(l)).length, GITHUB_API_MAX_ATTEMPTS - 1);
});

test("githubApi: 404 is not retried", async () => {
  let n = 0;
  setGithubApiTestHooks({
    delay: 0,
    fetch: async () => {
      n++;
      return jsonResponse(404, { message: "Not Found" });
    },
  });
  const r = await githubApi("GET", "commits/missing", { token: TOKEN });
  assert.equal(r.code, 404);
  assert.match(r.error, /^HTTP 404/);
  assert.equal(n, 1);
  assert.equal(logs.length, 0);
});

test("githubApi: network failure then 200 retries; honors Retry-After on 429", async () => {
  let n = 0;
  const delays = [];
  setGithubApiTestHooks({
    random: () => 0,
    delay: async (ms) => { delays.push(ms); },
    fetch: async () => {
      n++;
      if (n === 1) {
        const err = new Error("fetch failed");
        err.code = "ECONNRESET";
        throw err;
      }
      if (n === 2) return jsonResponse(429, { message: "rate" }, { "Retry-After": "2" });
      return jsonResponse(200, { sha: "abc" });
    },
  });
  const r = await githubApi("GET", "commits/HEAD", { token: TOKEN });
  assert.equal(r.code, 200);
  assert.equal(r.json.sha, "abc");
  assert.equal(n, 3);
  assert.ok(delays[0] > 0, "backoff after network error");
  assert.equal(delays[1], 2000, "Retry-After seconds → ms");
});

test("listPackArtifacts uses ?name= exact filter when name is set", async () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";
  const want = ARTIFACT_PREFIX + sha;
  const urls = [];
  setGithubApiTestHooks({
    delay: 0,
    fetch: async (url) => {
      urls.push(String(url));
      return jsonResponse(200, {
        artifacts: [
          { id: 9, name: want, created_at: "2026-10-08T00:00:00Z", expired: false, size_in_bytes: 10 },
          { id: 8, name: "other-artifact", created_at: "2026-10-07T00:00:00Z", expired: false, size_in_bytes: 1 },
        ],
      });
    },
  });
  const packs = await listPackArtifacts({ token: TOKEN, name: want });
  assert.equal(packs.length, 1);
  assert.equal(packs[0].sha, sha);
  assert.equal(packs[0].id, 9);
  assert.equal(urls.length, 1);
  const u = new URL(urls[0]);
  assert.equal(u.pathname.endsWith("/actions/artifacts"), true);
  assert.equal(u.searchParams.get("name"), want);
  assert.equal(u.searchParams.get("page"), null, "exact name lookup must not page");
  assert.equal(u.searchParams.get("per_page"), "100");
});
