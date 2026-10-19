// fleet-board-snapshot — the Fleet Board dashboard's dataset builders on fixtures: PR rows with the CI verdict,
// bus rows, GAME-SLOT / last DONE, claims, deploy tip and the failure-isolation of one source. No network, no git. < 1 s.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  pacific, parseFleetBlock, classifyGame, busRows, derive, claimRows, prRow, collect, DATASETS, CLAIM_STALE_MIN,
} from "../../tools/ci/fleet-board-snapshot.mjs";
import * as ciWatch from "../../tools/ci/ci-watch.mjs";
import * as prBoard from "../../tools/ci/pr-board.mjs";
import * as who from "../../tools/ci/who-is-on-it.mjs";

const FX = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "fleet-board");
const api = JSON.parse(fs.readFileSync(path.join(FX, "api.json"), "utf8"));
const bus = JSON.parse(fs.readFileSync(path.join(FX, "bus.json"), "utf8"));
const NOW = Date.parse("2026-10-19T19:00:00Z");
const TIP = "cccccccc55556666";

const io = (over = {}) => ({
  request: (p) => (p in api ? { json: api[p] } : { error: `HTTP 404 ${p}` }),
  ciWatch, prBoard, whoIsOnIt: who, now: () => NOW,
  readBus: () => bus,
  readBoard: () => [
    { slug: "cursor--a-1", content: `${NOW / 1000 - 300}\tClaude\t#1 live claim  [cursor/a; session s1]` },
    { slug: "cursor--b-2", content: `${NOW / 1000 - 3 * 3600}\tClaude\told claim` },
  ],
  lsRemote: () => TIP,
  ...over,
});

test("pacific: PDT in October, PST in January, blank for junk", () => {
  assert.equal(pacific("2026-10-19T18:45:27.655Z"), "2026-10-19 11:45 PDT");
  assert.equal(pacific("2026-01-15T20:00:00Z"), "2026-01-15 12:00 PST");
  assert.equal(pacific("nope"), "");
});

test("parseFleetBlock reads keys, drops comments, placeholders and a missing block", () => {
  assert.deepEqual(parseFleetBlock("x\n```fleet\nworker: claude:s1   # who\nblocker: <one line>\nstate: done\n```"), { worker: "claude:s1", state: "done" });
  assert.deepEqual(parseFleetBlock("no block"), {});
});

test("classifyGame: js/css/assets/shell are game, tools and docs are not", () => {
  assert.equal(classifyGame(["tools/ci/ci-watch.mjs", "docs/README.md"]), "non-game");
  assert.equal(classifyGame(["docs/README.md", "js/game.js"]), "game");
  assert.equal(classifyGame(["index.html"]), "game");
  assert.equal(classifyGame([]), "non-game");
});

test("busRows are newest first; derive picks the newest GAME-SLOT handoff and DONE", () => {
  const rows = busRows(bus.entries);
  assert.equal(rows[0].sha, "44444444");
  assert.equal(rows.length, 4);
  const d = derive(rows);
  assert.deepEqual(d.map((r) => r.key), ["game_slot", "last_done"]);
  assert.match(d[0].text, /^GAME-SLOT #2 def/);
  assert.equal(d[1].text, "#2 merged");
  assert.deepEqual(derive([]), []);
});

test("claimRows keeps only live claims and strips the session tag", () => {
  const rows = claimRows(who.parseBoard(io().readBoard(), NOW / 1000));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].text, "#1 live claim");
  assert.equal(rows[0].branch, "cursor/a");
  assert.ok(rows[0].age_min <= CLAIM_STALE_MIN);
});

test("prRow: fleet-status beats the block, 'none' blocker is dropped, hold is flagged", () => {
  const pr = api["pulls/7"];
  const r = prRow({ pr, files: ["a"], ci: { state: "running", ci_detail: "d" }, fleet: { state: "working", reason: "tick 2" }, hasMergeHold: false });
  assert.deepEqual([r.fleet, r.worker, r.orchestrator, r.fleet_state, r.blocker, r.draft, r.sha], ["B", "session_W7", "session_O1", "working", "tick 2", "draft", "aaaaaaaa"]);
  const q = prRow({ pr, files: [], ci: { state: "passed", ci_detail: "" }, fleet: null, hasMergeHold: true });
  assert.equal(q.fleet_state, "implementing");
  assert.equal(q.blocker, "");
  assert.equal(q.merge_hold, "MERGE-HOLD");
});

test("collect builds every dataset from fixtures", () => {
  const r = collect(io());
  assert.deepEqual(Object.keys(r.datasets).sort(), [...DATASETS].sort());
  assert.ok(r.ok);
  const [p9, p7] = r.datasets.prs;
  assert.deepEqual([p9.number, p9.ci, p9.game, p9.draft, p9.merge_hold, p9.mergeable], [9, "failed", "game", "ready", "MERGE-HOLD", "dirty"]);
  assert.deepEqual([p7.number, p7.ci, p7.game, p7.files, p7.labels, p7.fleet_state], [7, "running", "non-game", 2, "run-ci", "working"]);
  assert.match(p7.ci_detail, /run=#100 pull_request$/, "a label-noise run never counts");
  const [dep] = r.datasets.deploy;
  assert.deepEqual([dep.tip, dep.verdict, dep.pages_run, dep.pages_state, dep.tip_message], ["cccccccc", "passed", "300", "success", "Merge pull request #1 from o/x"]);
  assert.equal(r.datasets.snapshot.length, 5);
  assert.deepEqual(r.datasets.snapshot.map((s) => s.source), ["prs", "bus", "claims", "deploy", "derived"]);
  assert.match(r.datasets.snapshot[1].note, /bus tip dead00be/);
  assert.equal(r.datasets.snapshot[0].at, "2026-10-19T19:00:00.000Z");
});

test("one failing source is isolated: ok:error row, empty dataset, others intact", () => {
  const r = collect(io({ readBus: () => { throw new Error("boom"); } }));
  assert.equal(r.ok, false);
  assert.deepEqual(r.datasets.bus, []);
  assert.deepEqual(r.datasets.derived, []);
  assert.equal(r.datasets.snapshot.find((s) => s.source === "bus").ok, "error");
  assert.equal(r.datasets.prs.length, 2);
});

test("a REST error on the PR list marks prs as error", () => {
  const r = collect(io({ request: () => ({ error: "HTTP 403" }) }));
  assert.equal(r.datasets.snapshot.find((s) => s.source === "prs").ok, "error");
  assert.match(r.datasets.snapshot[0].note, /HTTP 403/);
});
