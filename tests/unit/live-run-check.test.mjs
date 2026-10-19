/* live-run-check.test.mjs — advisory WARN when a push would cancel live ci.yml.
 *
 * Standalone helper for the bash-guard wiring that is FORBIDDEN on this PR
 * (#1714 / #2899). Pure unit tests with an injected fetch — no network.
 *
 * Run: node --test tests/unit/live-run-check.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { liveCiRuns, warnLine, formatWarn, checkLiveRun } from "../../tools/ci/live-run-check.mjs";

const gitOk = (args) => {
  const a = args.join(" ");
  if (a.includes("abbrev-ref")) return "cursor/session-ledger-51cc";
  if (a.includes("get-url")) return "https://github.com/brycejmurrin/f1-game.git";
  return "";
};

const runsPayload = (runs) => ({
  ok: true,
  status: 200,
  json: async () => ({ workflow_runs: runs }),
});

test("warnLine: zero → null; singular and plural wording", () => {
  assert.equal(warnLine(0, "x"), null);
  assert.equal(
    warnLine(1, "cursor/session-ledger-51cc"),
    "WARN: 1 live ci.yml run on cursor/session-ledger-51cc — this push cancels them and loses their failures.",
  );
  assert.equal(
    warnLine(2, "cursor/session-ledger-51cc"),
    "WARN: 2 live ci.yml runs on cursor/session-ledger-51cc — this push cancels them and loses their failures.",
  );
});

test("liveCiRuns: keeps only ci.yml paths; maps id/sha/url", async () => {
  const fetch = async () => runsPayload([
    { id: 1, head_sha: "abcdef012345", html_url: "https://example/1", path: ".github/workflows/ci.yml" },
    { id: 2, head_sha: "deadbeef00", html_url: "https://example/2", path: ".github/workflows/pages.yml" },
    { id: 3, head_sha: "cafebabe99", html_url: "https://example/3", path: ".github/workflows/ci.yml" },
  ]);
  const live = await liveCiRuns({ git: gitOk, fetch });
  assert.equal(live.branch, "cursor/session-ledger-51cc");
  assert.equal(live.runs.length, 2);
  assert.deepEqual(live.runs.map((r) => r.id), [1, 3]);
  assert.equal(live.runs[0].sha, "abcdef01");
  assert.match(formatWarn(live), /^WARN: 2 live ci\.yml runs/);
});

test("liveCiRuns: API failure / bad git → null (advisory, never throws)", async () => {
  assert.equal(await liveCiRuns({ git: () => "", fetch: async () => { throw new Error("no"); } }), null);
  assert.equal(await liveCiRuns({ git: gitOk, fetch: async () => ({ ok: false, status: 403 }) }), null);
  assert.equal(formatWarn(null), null);
  assert.equal(formatWarn({ branch: "x", runs: [] }), null);
});

test("checkLiveRun: packages live + warn", async () => {
  const fetch = async () => runsPayload([
    { id: 9, head_sha: "1234567890ab", html_url: "u", path: ".github/workflows/ci.yml" },
  ]);
  const r = await checkLiveRun({ git: gitOk, fetch });
  assert.equal(r.live.runs.length, 1);
  assert.match(r.warn, /WARN: 1 live ci\.yml run/);
});
