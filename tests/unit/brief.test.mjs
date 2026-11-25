// @doc brief.mjs (retro 2026-11-25 item 10): render a worker brief from a spec with predicted human steps, lint a hand-written one, refuse a duplicate launch (PR 6349 was launched twice).
import { test } from "node:test";
import assert from "node:assert/strict";
import { main, renderBrief, lintBrief, specProblems, predictSteps, duplicates, isLive, sessionTag } from "../../tools/ci/brief.mjs";

const SPEC = {
  kind: "ISSUE", number: 6400, orchestrator: "session_017Yzwxzch8ixiVZuLUxQGt6", role: "worker", ask: "fix all of those", askAt: "2026-11-25 02:47Z",
  task: "the tip alarm posts tip-red on the Board", scope: "ONE PR, routine paths only",
  owned: ["tools/ci/tip-alarm.mjs", ".github/workflows/tip-alarm.yml", "tests/unit/tip-alarm.test.mjs"], forbidden: ["tools/ci/merge-gate.mjs"],
  stopAt: "start+150k", tip: { state: "paused", sha: "c1e4f9590000", note: "commit locally; open the PR after my tip-green: message" },
};

const lineOf = (text, prefix) => String(text).split("\n").find((l) => l.startsWith(prefix));

test("render: every required line, the predicted config-ok, the tip state and the session tag; and it lints clean", () => {
  const b = renderBrief(SPEC);
  assert.equal(b.split("\n")[0], "ISSUE 6400 for orchestrator session_017Yzwxzch8ixiVZuLUxQGt6. AGENTS.md and skill `steward` bind; this brief adds only task facts.");
  assert.equal(lineOf(b, "HUMAN STEPS:"), "HUMAN STEPS: config-ok (routine: tools/ci/tip-alarm.mjs, .github/workflows/tip-alarm.yml): the orchestrator adds it after reading the diff; send the head sha once pushed");
  assert.equal(lineOf(b, "TIP:"), "TIP: paused at c1e4f959 — commit locally; open the PR after my tip-green: message");
  assert.equal(lineOf(b, "STOP AT:"), "STOP AT: start+150k");
  assert.equal(lineOf(b, "ENV:"), 'ENV: I · permission_mode auto · tags ["apex:issue-6400"]');
  assert.equal(lineOf(b, "ASK"), `ASK (Bryce's words, 2026-11-25 02:47Z): "fix all of those"`);
  assert.deepEqual(lintBrief(b), []);
});

test("predictSteps: routine config → orchestrator config-ok, protected → propose, ratchet → ratchet-raise, plain code → none", () => {
  assert.deepEqual(predictSteps(["js/ui/hud.js", "docs/PHYSICS.md"]), []);
  assert.deepEqual(predictSteps(["tools/ci/ready-gate.mjs"]), ["PROTECTED (tools/ci/ready-gate.mjs): only Bryce's own config-ok tap covers it; propose the change instead of making it"]);
  assert.equal(predictSteps([".github/workflows/land.yml"])[0].split(" ")[0], "PROTECTED");
  // A hypothetical fragment name, built so docs-integrity's path scan sees no literal: a real one is deleted by the next fold.
  const frag = ["tests/data/ratchets.d", "claude--example-0000.json"].join("/");
  assert.deepEqual(predictSteps([frag]), [`ratchet-raise (${frag}): Bryce's own click; send the raise and its CEILING-HISTORY reason`]);
  assert.deepEqual(predictSteps(["./.github/workflows/ci.yml"]), ["config-ok (routine: .github/workflows/ci.yml): the orchestrator adds it after reading the diff; send the head sha once pushed"]);
  const b = renderBrief({ ...SPEC, humanSteps: ["config-ok: send me the head sha"] });
  assert.equal(b.split("config-ok").length - 1, 1, "a step the spec already names is not predicted twice");
});

test("lint: a brief without STOP AT or the tip state is refused, line by line", () => {
  const b = renderBrief(SPEC);
  const strip = (re) => b.split("\n").filter((l) => !re.test(l)).join("\n");
  assert.deepEqual(lintBrief(strip(/^STOP AT:/)), ["STOP AT: start+<N>k (context-cap.py reads this form)"]);
  assert.deepEqual(lintBrief(strip(/^TIP:/)), ["TIP: green|red|paused (the deploy tip's state at launch)"]);
  assert.deepEqual(lintBrief(b.replace(/^STOP AT:.*$/m, "STOP AT: when done")), ["STOP AT: start+<N>k (context-cap.py reads this form)"], "the cap must be a number");
  assert.deepEqual(lintBrief(b.replace(/^TIP:.*$/m, "TIP: red")), ["TIP: a red or paused tip names what to do until it is green (`TIP: red — …`)"]);
  assert.deepEqual(lintBrief(b.replace(/^TIP:.*$/m, "TIP: green")), [], "a green tip needs no note");
  assert.equal(lintBrief("ISSUE 5 do the thing").length, 9);
});

test("spec problems are named before anything is printed", () => {
  assert.deepEqual(specProblems(SPEC), []);
  const p = specProblems({ ...SPEC, kind: "PR", stopAt: "150", tip: { state: "red" }, owned: [] });
  assert.deepEqual(p, ["kind must be one of ISSUE | CONTINUE PR", 'stopAt must read "start+<N>k" (or "<N>k")',
    "tip.note is required when the tip is not green (what to do until it is)", "owned must list the paths the worker may edit"]);
});

test("duplicates: an open PR closing the issue, a live tagged or titled session; finished sessions and other numbers are not", () => {
  const pulls = [{ number: 6349, body: "Goal\n\nCloses #6300" }, { number: 7, body: "see #6300, refs #63001" }];
  assert.deepEqual(duplicates({ kind: "ISSUE", number: 6300, pulls }), ["open PR #6349 already closes issue #6300: launch CONTINUE PR 6349 (if its lease lapsed), not a second ISSUE 6300"]);
  assert.deepEqual(duplicates({ kind: "ISSUE", number: 63, pulls }), []);
  assert.equal(duplicates({ kind: "ISSUE", number: 6300, pulls: [{ number: 1, body: "Fixes brycejmurrin/f1-game#6300" }] }).length, 1);
  const sessions = [
    { id: "session_a", title: "worker", tags: [sessionTag("CONTINUE PR", 6349)], status_bucket: "working" },
    { id: "session_b", title: "CONTINUE PR 6349 for orchestrator x", tags: [], status_bucket: "blocked" },
    { id: "session_c", title: "CONTINUE PR 6349", tags: [], status_bucket: "completed" },
    { id: "session_d", title: "CONTINUE PR 63490", tags: [], status_bucket: "working" },
  ];
  const d = duplicates({ kind: "CONTINUE PR", number: 6349, sessions });
  assert.deepEqual(d, ["live session session_a (working) is already on CONTINUE PR 6349 (tag apex:pr-6349): message it instead of launching",
    "live session session_b (blocked) is already on CONTINUE PR 6349 (title): message it instead of launching"]);
  assert.equal(isLive({ status: "archived" }), false);
  assert.equal(isLive({ status: "running" }), true);
});

test("main: render refuses a duplicate launch, dup and lint exit codes, a missing sessions file warns", () => {
  const files = { "spec.json": JSON.stringify(SPEC), "brief.txt": renderBrief(SPEC), "s.json": JSON.stringify({ data: [{ id: "session_x", tags: ["apex:issue-6400"], status_bucket: "working" }] }) };
  const read = (f) => { if (!(f in files)) throw new Error(`ENOENT ${f}`); return files[f]; };
  const run = (argv, pulls = []) => { const out = []; const rc = main(argv, { log: (l) => out.push(l), read, listOpen: () => ({ json: pulls }) }); return [rc, out.join("\n")]; };
  let [rc, out] = run(["render", "--spec", "spec.json"]);
  assert.equal(rc, 0, out);
  assert.equal(out.split("\n")[0], "warning: no --sessions file: live sessions NOT checked (save list_sessions {children:true} and pass it)");
  assert.equal(lineOf(out, "STOP AT:"), "STOP AT: start+150k");
  [rc, out] = run(["render", "--spec", "spec.json"], [{ number: 9, body: "Closes #6400" }]);
  assert.equal(rc, 1);
  assert.equal(out.split("\n").at(-1), "= brief duplicate — ISSUE 6400: 1 already on it; do not launch");
  assert.equal(lineOf(out, "STOP AT:"), undefined, "a refused launch prints no brief");
  assert.equal(run(["render", "--spec", "spec.json", "--no-dup"], [{ number: 9, body: "Closes #6400" }])[0], 0, "--no-dup skips the check");
  assert.equal(run(["lint", "brief.txt"])[0], 0);
  files["bad.txt"] = files["brief.txt"].replace(/^STOP AT:.*\n/m, "");
  [rc, out] = run(["lint", "bad.txt"]);
  assert.equal(rc, 1);
  assert.equal(out.split("\n")[0], "missing: STOP AT: start+<N>k (context-cap.py reads this form)");
  assert.equal(run(["dup", "--issue", "6400"])[0], 0);
  assert.equal(run(["dup", "--pr", "x"])[0], 2);
  assert.equal(main(["dup", "--issue", "1"], { log: () => {}, listOpen: () => ({ error: "HTTP 401" }) }), 3);
  assert.equal(run([])[0], 2);
});
