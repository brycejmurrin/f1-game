// tools/ci/bot-pr-body.mjs (#5520): a scheduled bot's PR body must pass the merge gate's own Plan row and
// ready-gate's parser as it opens, so a fold PR can land without an agent rewriting its body (#5518, #5146).
// The parsers are imported, never copied, so the generator and the gate cannot drift.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parse as parseYaml } from "yaml";
import { botPrBody } from "../../tools/ci/bot-pr-body.mjs";
import { planRow } from "../../tools/ci/merge-gate.mjs";
import { planVerdict } from "../../tools/ci/ready-gate.mjs";

// #5518's body, verbatim shape (ratchets-fold.yml PR_BODY).
const FOLD = "Scheduled fold (#2538): ratchets --fold: 21 fragment(s) summed into tests/data/ratchets.json and deleted; every effective ceiling unchanged. Every effective ceiling is unchanged. Opened by .github/workflows/ratchets-fold.yml on branch `bot/ratchets-fold-123`.";
// A LAND_TOKEN PR is opened by a person's login, not a `[bot]`: planRow's no-Plan exemption does not apply.
const AUTHOR = "brycejmurrin";

test("the one-line fold body alone is refused by the gate (the #5518 failure)", () => {
  const r = planRow(FOLD, AUTHOR);
  assert.equal(r.ok, false);
  assert.match(r.evidence ?? JSON.stringify(r), /no ## Plan checklist/);
});

test("the generated body passes merge-gate planRow and ready-gate planVerdict as the PR opens", () => {
  const body = botPrBody({ body: FOLD, what: "ratchets fold", branch: "bot/ratchets-fold-123", sha: "0123456789abcdef",
    runUrl: "https://github.com/o/r/actions/runs/42", evidence: "ratchets.mjs: 303 values, 0 differences\n\n" });
  assert.equal(planRow(body, AUTHOR).ok, true, body);
  const v = planVerdict(body);
  assert.equal(v.state, "done", body);
  assert.deepEqual(v.open, []);
  assert.equal(v.items, 3, "the job's row, one evidence row, the land item");
  assert.match(body, /^- \[x\] ratchets fold: the scheduled job did its work and pushed 01234567 \(run https:\/\/github\.com\/o\/r\/actions\/runs\/42\)$/m);
  assert.match(body, /^- \[x\] ratchets\.mjs: 303 values, 0 differences$/m);
  const items = body.match(/^- \[[ x]\] .*$/gm);
  assert.match(items.at(-1), /^- \[ \] land: /, "the land item is last");
  assert.ok(body.includes(FOLD), "the job's own summary is kept, in the Goal");
  for (const h of ["## Goal", "## Plan", "## Verified / Not run", "## Hand-off"]) assert.match(body, new RegExp(`^${h}$`, "m"), h);
  assert.match(body, /^no player-facing change$/m, "the template's CHANGELOG rule");
  assert.match(body, /```handoff\nhead: 01234567\nowner: bot:ratchets fold\n/);
});

test("a body that names its CHANGELOG line keeps it and gets no second one", () => {
  const body = botPrBody({ body: "Scheduled fold: 3 fragments. CHANGELOG: no player-facing change (this PR moves existing entries).", what: "changelog fold" });
  assert.equal((body.match(/no player-facing change/g) || []).length, 1);
  assert.equal(planRow(body, AUTHOR).ok, true, body);
});

test("a body that already carries a Plan passes through unchanged", () => {
  const own = "## Goal\nx\n\n## Plan\n- [x] done\n- [ ] land: add `land`";
  assert.equal(botPrBody({ body: own, what: "x" }), own + "\n");
});

test("the CLI reads the action's env and prints the same body", () => {
  const env = { ...process.env, PR_BODY: FOLD, WHAT: "ratchets fold", BRANCH: "b", EVIDENCE: "", HEAD_SHA: "abcdef0123", RUN_URL: "" };
  const r = spawnSync(process.execPath, [path.resolve("tools/ci/bot-pr-body.mjs")], { encoding: "utf8", env });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, botPrBody({ body: FOLD, what: "ratchets fold", branch: "b", sha: "abcdef0123" }));
});

test("open-bot-pr builds its body through the generator before gh pr create", () => {
  const action = parseYaml(fs.readFileSync(".github/actions/open-bot-pr/action.yml", "utf8"));
  const step = action.runs.steps.find((s) => s.name === "Open the PR");
  assert.equal(step.env.EVIDENCE, "${{ inputs.evidence }}");
  const gen = step.run.indexOf('node "$GITHUB_WORKSPACE/tools/ci/bot-pr-body.mjs"');
  const create = step.run.indexOf("gh pr create");
  assert.ok(gen > 0 && gen < create, "the body is wrapped before the PR opens");
  assert.match(step.run, /--body "\$PR_BODY"/);
});
