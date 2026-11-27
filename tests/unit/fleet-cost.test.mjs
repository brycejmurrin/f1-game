// fleet-cost — merged PRs joined to saved session pages (#7050, #6887 phase 3). Fixture: tests/fixtures/fleet-cost/
// (the six 11-26 PRs of the lease fixture and synthetic result-only pages). No network: --prs is a file.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sinceMs, prSessions, sessionCosts, fleetCost, readPages, render } from "../../tools/ci/fleet-cost.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ROOT, "tests/fixtures/fleet-cost");
const PRS = JSON.parse(fs.readFileSync(path.join(DIR, "prs.json"), "utf8")).prs;
const NOW = Date.parse("2026-11-26T23:59:00Z");

test("sinceMs: hours, days and an ISO time", () => {
  assert.equal(sinceMs("24h", NOW), NOW - 86400e3);
  assert.equal(sinceMs("2d", NOW), NOW - 2 * 86400e3);
  assert.equal(sinceMs("2026-11-26T00:00:00Z", NOW), Date.parse("2026-11-26T00:00:00Z"));
  assert.ok(Number.isNaN(sinceMs("soon", NOW)));
});

test("prSessions: the owner line's session, then each adopter, deduped by id", () => {
  assert.deepEqual(prSessions(PRS.find((p) => p.number === 6929)), ["session_01BEw9UJaASwazoAesgtRrtW", "session_01BEw9UJ765KsXwnsQkB3H"]);
  assert.deepEqual(prSessions(PRS.find((p) => p.number === 6972)), ["session_01BEw9UGFq55jFZzf7b1PzaJ"]);
});

test("fleet-cost --since 24h on the fixture pages: $/merged PR, hand-back %, re-adoptions, and sessions with no page", () => {
  const costs = sessionCosts(readPages(path.join(DIR, "pages")));
  assert.equal(costs.session_01BEw9UKGv8i84Sn6piw9hd3, 4.5, "two pages of one session: the newest cumulative cost");
  const r = fleetCost(PRS, costs, { from: sinceMs("24h", NOW), now: NOW });
  assert.equal(r.merged, 6);
  assert.equal(r.totalCost, 22);
  assert.equal(r.perMergedPr, 3.67);
  assert.equal(r.handedBack, 5);
  assert.equal(Math.round(r.handBackRate * 100), 83);
  assert.equal(r.readoptions, 6);
  assert.deepEqual(r.noPage, ["session_017Yzwxx8xyDeQwbPcuTdssa"]);
  assert.equal(render(r, "x").split("\n")[0], "= fleet-cost since x: 6 merged · $3.67/merged PR ($22.00 over 6 of 7 sessions with pages) · hand-back 83% (5/6) · re-adoptions 6");
  const narrow = fleetCost(PRS, costs, { from: Date.parse("2026-11-26T09:00:00Z"), now: NOW });
  assert.deepEqual(narrow.rows.map((x) => x.pr), [6921, 6929, 6972], "the window filters on merged_at");
});

test("a session shared by two merged PRs is split evenly; no PRs prints $-", () => {
  const body = "```handoff\nowner: claude:session_sharedAAAA until 2026-11-26T05:00Z\n```";
  const prs = [1, 2].map((number) => ({ number, merged_at: "2026-11-26T10:00:00Z", body, comments: [] }));
  const r = fleetCost(prs, { session_sharedAAAA: 3 }, { now: NOW });
  assert.deepEqual(r.rows.map((x) => x.cost), [1.5, 1.5]);
  assert.equal(render(fleetCost([], {}, { now: NOW }), "x"), "= fleet-cost since x: 0 merged · $-/merged PR ($0.00 over 0 of 0 sessions with pages) · hand-back - (0/0) · re-adoptions 0");
});

test("CLI: offline run prints the summary line; bad --since is a usage error", () => {
  const cli = (...a) => spawnSync(process.execPath, [path.join(ROOT, "tools/ci/fleet-cost.mjs"), ...a], { encoding: "utf8" });
  const ok = cli("--since", "24h", "--now", "2026-11-26T23:59:00Z", "--pages", path.join(DIR, "pages"), "--prs", path.join(DIR, "prs.json"));
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout.split("\n")[0], "= fleet-cost since 2026-11-25T23:59:00.000Z: 6 merged · $3.67/merged PR ($22.00 over 6 of 7 sessions with pages) · hand-back 83% (5/6) · re-adoptions 6");
  assert.equal(cli("--since", "soon", "--pages", DIR).status, 2);
  assert.equal(cli("--since", "24h").status, 2, "--pages is required");
});
