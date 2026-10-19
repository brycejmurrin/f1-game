/* garage-before-api.test.mjs — GitHub REST retry, ancestor ?name= lookups, skip-on-5xx.
 *
 * Mocked fetch only — no network, no Chromium. Delay forced to 0 so retries are instant.
 *
 * Run: node --test tests/unit/garage-before-api.test.mjs
 */
import { test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ARTIFACT_PREFIX,
  ANCESTOR_PACK_LIMIT,
  GITHUB_API_MAX_ATTEMPTS,
  githubApi,
  isGithub5xx,
  listAncestorShas,
  listPackArtifacts,
  planMain,
  setGithubApiTestHooks,
  skipPlanApi5xx,
} from "../../tools/shot/garage-before.mjs";


// Temp dirs under scratch/ (repo rule: never /tmp), removed in after() even on a red test.
const SCRATCH = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../scratch");
const _scratch = [];
const scratchDir = (prefix) => {
  fs.mkdirSync(SCRATCH, { recursive: true });
  const d = fs.mkdtempSync(path.join(SCRATCH, prefix));
  _scratch.push(d);
  return d;
};
after(() => { for (const d of _scratch) fs.rmSync(d, { recursive: true, force: true }); });

const TOKEN = "test-token-not-real";
const logs = [];
const origError = console.error;
const savedEnv = {};

function jsonResponse(status, body, headers = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function stashEnv(keys) {
  for (const k of keys) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
}

function restoreEnv() {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  for (const k of Object.keys(savedEnv)) delete savedEnv[k];
}

beforeEach(() => {
  logs.length = 0;
  console.error = (...args) => { logs.push(args.map(String).join(" ")); };
  setGithubApiTestHooks({ delay: 0, random: () => 0 });
});

afterEach(() => {
  console.error = origError;
  setGithubApiTestHooks({});
  restoreEnv();
});

test("githubApi: 502 then 200 succeeds after one retry and logs the path", async () => {
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
  assert.ok(logs.some((l) => /retry 1\/4 after HTTP 502 on commits\/HEAD/.test(l)));
});

test("githubApi: repeated 500 gives up with HTTP error that names the path", async () => {
  let n = 0;
  const pathQs = "actions/artifacts?per_page=100&page=1";
  setGithubApiTestHooks({
    delay: 0,
    random: () => 0,
    fetch: async () => {
      n++;
      return jsonResponse(500, { message: "Server Error" });
    },
  });
  const r = await githubApi("GET", pathQs, { token: TOKEN });
  assert.equal(r.code, 500);
  assert.match(r.error, /^HTTP 500/);
  assert.match(r.error, /actions\/artifacts\?per_page=100&page=1/);
  assert.equal(n, GITHUB_API_MAX_ATTEMPTS);
  assert.equal(logs.filter((l) => /retry \d+\/4 after HTTP 500 on /.test(l)).length, GITHUB_API_MAX_ATTEMPTS - 1);
  assert.ok(isGithub5xx(r));
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
  assert.match(r.error, /commits\/missing/);
  assert.equal(n, 1);
  assert.equal(logs.length, 0);
  assert.equal(isGithub5xx(r), false);
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
  assert.ok(logs.some((l) => /network .* on commits\/HEAD/.test(l)));
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

test("listPackArtifacts without name walks ancestors via exact ?name= (no repo-wide page)", async () => {
  const tip = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const parent = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const urls = [];
  setGithubApiTestHooks({
    delay: 0,
    random: () => 0,
    revList: () => ({ shas: [tip, parent] }),
    fetch: async (url) => {
      urls.push(String(url));
      const u = new URL(url);
      const name = u.searchParams.get("name");
      if (name === ARTIFACT_PREFIX + parent) {
        return jsonResponse(200, {
          artifacts: [{
            id: 42, name: ARTIFACT_PREFIX + parent,
            created_at: "2026-10-01T00:00:00Z", expired: false, size_in_bytes: 9,
          }],
        });
      }
      return jsonResponse(200, { artifacts: [] });
    },
  });
  const packs = await listPackArtifacts({ token: TOKEN, fromSha: tip });
  assert.equal(packs.length, 1);
  assert.equal(packs[0].sha, parent);
  assert.equal(packs[0].id, 42);
  assert.ok(urls.length >= 2);
  assert.ok(urls.every((u) => {
    const parsed = new URL(u);
    return parsed.pathname.endsWith("/actions/artifacts")
      && parsed.searchParams.get("name")
      && parsed.searchParams.get("page") == null;
  }), "must never hit unfiltered /actions/artifacts?page=");
  assert.equal(ANCESTOR_PACK_LIMIT, 20);
});

test("listAncestorShas falls back to commits API when git only has the tip", async () => {
  const tip = "cccccccccccccccccccccccccccccccccccccccc";
  const urls = [];
  setGithubApiTestHooks({
    delay: 0,
    revList: () => ({ shas: [tip] }),
    fetch: async (url) => {
      urls.push(String(url));
      return jsonResponse(200, [
        { sha: tip },
        { sha: "dddddddddddddddddddddddddddddddddddddddd" },
      ]);
    },
  });
  const r = await listAncestorShas(tip, { token: TOKEN, limit: 20 });
  assert.deepEqual(r.shas, [tip, "dddddddddddddddddddddddddddddddddddddddd"]);
  assert.match(urls[0], /\/commits\?sha=/);
});

test("planMain: exhausted artifact 5xx exits 0 as plan: skipped (API 5xx)", async () => {
  const tip = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  const dir = scratchDir("garage-plan-");
  const outFile = path.join(dir, "github-output");
  const summary = path.join(dir, "summary.md");
  fs.writeFileSync(outFile, "");
  stashEnv(["EVENT_NAME", "PLAN_REF", "PLAN_SHA", "PAGES_CONCLUSION", "GH_TOKEN", "GITHUB_TOKEN", "GITHUB_OUTPUT", "GITHUB_STEP_SUMMARY"]);
  process.env.EVENT_NAME = "workflow_run";
  process.env.PLAN_SHA = tip;
  process.env.PAGES_CONCLUSION = "success";
  process.env.GH_TOKEN = TOKEN;
  process.env.GITHUB_OUTPUT = outFile;
  process.env.GITHUB_STEP_SUMMARY = summary;
  setGithubApiTestHooks({
    delay: 0,
    random: () => 0,
    revList: () => ({ shas: [tip, "ffffffffffffffffffffffffffffffffffffffff"] }),
    fetch: async () => jsonResponse(500, { message: "Server Error" }),
  });
  const code = await planMain([]);
  assert.equal(code, 0);
  assert.ok(logs.some((l) => /plan: skipped \(API 5xx\)/.test(l)));
  const out = fs.readFileSync(outFile, "utf8");
  assert.match(out, /capture=false/);
  assert.match(out, /reason=api-5xx/);
  assert.match(out, new RegExp(`sha=${tip}`));
  const sum = fs.readFileSync(summary, "utf8");
  assert.match(sum, /plan: skipped \(API 5xx\)/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("skipPlanApi5xx writes capture=false without needing a live API", () => {
  const dir = scratchDir("garage-skip-");
  const outFile = path.join(dir, "github-output");
  fs.writeFileSync(outFile, "");
  stashEnv(["GITHUB_OUTPUT", "GITHUB_STEP_SUMMARY"]);
  process.env.GITHUB_OUTPUT = outFile;
  assert.equal(skipPlanApi5xx("HTTP 500 actions/artifacts", { sha: "abc" }), 0);
  assert.match(fs.readFileSync(outFile, "utf8"), /capture=false/);
  fs.rmSync(dir, { recursive: true, force: true });
});
