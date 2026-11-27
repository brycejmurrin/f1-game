// @doc brief.mjs (retro 2026-11-25 item 10): render a worker brief from a spec with predicted human steps, lint a hand-written one, refuse a duplicate launch (PR 6349 was launched twice).
// Fleet roles (#7049, #6887 phases 2 + 5): skills name a role, never an env id; a literal id is refused; the rotation block parses and the reaper disables only stale triggers.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main, renderBrief, lintBrief, specProblems, predictSteps, duplicates, isLive, sessionTag } from "../../tools/ci/brief.mjs";
import { loadRoles, resolveRole, findEnvLiterals, parseOrchestratorBlocks, newestBlock, reapActs, isArchived } from "../../tools/ci/lib/roles.mjs";

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
  assert.equal(lineOf(b, "ENV:"), 'ENV: worker ("I") · permission_mode auto · tags ["apex:issue-6400"]', "the role and its name, never the id");
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

// ── fleet roles (#7049) ──
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
// Built so this file itself holds no literal: the guard scans skills, and docs scans may scan tests.
const FAKE_ID = ["env", "01AAAAAAAAAAAAAAAAAAAAAAAA"].join("_");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out); else if (e.isFile()) out.push(rel);
  }
  return out;
}

test("roles: every role has a name and an env id; lookup by role or by display name; a literal id never resolves", () => {
  const roles = loadRoles();
  for (const k of ["worker", "orchestrator"]) {
    assert.ok(roles[k], `role ${k}`);
    assert.equal(findEnvLiterals(roles[k].id).length, 1, `${k}.id is an env id`);
    assert.ok(roles[k].name);
  }
  assert.notEqual(roles.worker.id, roles.orchestrator.id, "the orchestrator environment never hosts workers");
  assert.equal(resolveRole("worker", roles).name, "I");
  assert.equal(resolveRole("I", roles).role, "worker");
  assert.equal(resolveRole(roles.worker.id, roles), null);
  assert.equal(resolveRole("nobody", roles), null);
});

test("guard: no literal env id anywhere in .claude/skills/**", () => {
  const hits = [];
  for (const f of walk(".claude/skills")) for (const id of findEnvLiterals(read(f))) hits.push(`${f}: ${id}`);
  assert.deepEqual(hits, [], "name the role (tests/data/fleet-roles.json), not the id");
});

test("brief.mjs: a spec or a brief holding a literal id is refused (exit 1); `role` prints the id", () => {
  const RSPEC = { kind: "ISSUE", number: 7049, orchestrator: "session_x", role: "worker", task: "t", scope: "s",
    owned: ["tests/unit/brief.test.mjs"], stopAt: "start+150k", tip: { state: "green" } };
  assert.deepEqual(specProblems(RSPEC), []);
  const envLine = renderBrief({ ...RSPEC, env: "orchestrator" }).split("\n").find((l) => l.startsWith("ENV:"));
  assert.equal(envLine, 'ENV: orchestrator ("f1-game orchestrator") · permission_mode auto · tags ["apex:issue-7049"]');
  const literal = `a literal environment id (${FAKE_ID}): name the role (env: "worker"); brief.mjs role <role> prints the id`;
  assert.deepEqual(specProblems({ ...RSPEC, env: FAKE_ID }), [literal]);
  assert.deepEqual(specProblems({ ...RSPEC, task: `launch into ${FAKE_ID}` }), [literal]);
  assert.deepEqual(specProblems({ ...RSPEC, env: "Z" }), ['env "Z" is not a role in tests/data/fleet-roles.json (worker | orchestrator)']);
  const files = { "spec.json": JSON.stringify({ ...RSPEC, env: FAKE_ID }), "b.txt": `${renderBrief(RSPEC)}\nENV note: ${FAKE_ID}` };
  const run = (argv) => { const out = []; const rc = main(argv, { log: (l) => out.push(l), read: (f) => files[f], listOpen: () => ({ json: [] }) }); return [rc, out.join("\n")]; };
  let [rc, out] = run(["render", "--spec", "spec.json", "--no-dup"]);
  assert.equal(rc, 1, out);
  assert.equal(out.split("\n").find((l) => l.startsWith("ENV:")), undefined, "a refused spec prints no brief");
  [rc, out] = run(["lint", "b.txt"]);
  assert.equal(rc, 1, out);
  assert.equal(out.split("\n")[0], `missing: no literal environment id (${FAKE_ID}): name the role on the ENV: line`);
  [rc, out] = run(["role", "worker"]);
  assert.equal(rc, 0);
  assert.equal(out.split("\n")[0], loadRoles().worker.id);
  assert.equal(run(["role", "nobody"])[0], 1);
});

const block = (session, at, triggers = "trig_a, trig_b") => `handoff\n\n\`\`\`orchestrator\nsession: ${session}\naccount: acct\nenv-role: orchestrator\ntriggers: ${triggers}\nat: ${at}\n\`\`\`\n`;

test("rotation block: parse, validate, newest wins; the handoff skill's own example parses clean", () => {
  const roles = loadRoles();
  const { blocks, problems } = parseOrchestratorBlocks([block("session_old", "2026-11-26T01:00:00Z"), block("session_new", "2026-11-27T01:00:00Z", "trig_c")], roles);
  assert.deepEqual(problems, []);
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[1], { session: "session_new", account: "acct", envRole: "orchestrator", triggers: ["trig_c"], at: "2026-11-27T01:00:00Z", index: 1 });
  assert.equal(newestBlock(blocks).session, "session_new");
  const bad = parseOrchestratorBlocks(["```orchestrator\nsession: nope\nenv-role: " + FAKE_ID + "\ntriggers: x\nat: soon\n```"], roles).problems;
  assert.deepEqual(bad, ["block 0: missing account:", 'block 0: session "nope" is not a session_… id',
    "block 0: names an env_… id: write the role (env-role: orchestrator)", 'block 0: trigger "x" is not a trig_… id', 'block 0: at "soon" is not a timestamp']);
  const pinned = parseOrchestratorBlocks(read(".claude/skills/handoff/SKILL.md"), roles);
  assert.equal(pinned.blocks.length, 1, "handoff SKILL.md carries ONE example ```orchestrator block");
  assert.deepEqual(pinned.problems, []);
  assert.equal(pinned.blocks[0].envRole, "orchestrator");
});

test("reaper: an enabled trigger bound to an archived session gives exactly one disable act", () => {
  const { blocks } = parseOrchestratorBlocks(block("session_new", "2026-11-27T01:00:00Z"));
  const triggers = [
    { id: "trig_dead", name: "FULL", enabled: true, cron_expression: "19 * * * *", persistent_session_id: "session_arch" },
    { id: "trig_a", name: "FULL", enabled: true, cron_expression: "19 * * * *", persistent_session_id: "session_new" },
    { id: "trig_off", enabled: false, cron_expression: "49 * * * *", persistent_session_id: "session_arch" },
    { id: "trig_fresh", enabled: true, cron_expression: "0 8 * * *" },
    { id: "trig_once", enabled: true, run_once_at: "2026-11-27T09:00:00Z", persistent_session_id: "session_worker" },
  ];
  const sessions = [{ id: "session_arch", status: "archived" }, { id: "session_new", status_bucket: "working" }, { id: "session_worker", status_bucket: "working" }];
  const acts = reapActs({ blocks, triggers, sessions });
  assert.deepEqual(acts.map((a) => a.line), ["disable trig_dead (FULL) — bound to archived session session_arch"]);
  assert.equal(isArchived({ archived: true }), true);
});

test("reaper: a recurring trigger on a live predecessor is reaped; with no block only the archived rule applies", () => {
  const { blocks } = parseOrchestratorBlocks([block("session_old", "2026-11-26T01:00:00Z"), block("session_new", "2026-11-27T01:00:00Z")]);
  const triggers = [{ id: "trig_old", name: "LIGHT", enabled: true, cron_expression: "49 * * * *", persistent_session_id: "session_old" }];
  const sessions = [{ id: "session_old", status_bucket: "completed" }];
  assert.deepEqual(reapActs({ blocks, triggers, sessions }).map((a) => a.trigger), ["trig_old"]);
  assert.deepEqual(reapActs({ blocks: [], triggers, sessions }), []);
  const out = [];
  const files = { t: JSON.stringify(triggers), b: JSON.stringify([{ body: blocks.length ? block("session_new", "2026-11-27T01:00:00Z") : "" }]), s: JSON.stringify({ data: sessions }) };
  assert.equal(main(["reap", "--triggers", "t", "--blocks", "b", "--sessions", "s"], { log: (l) => out.push(l), read: (f) => files[f] }), 0);
  assert.deepEqual(out, ["disable trig_old (LIGHT) — recurring, bound to session_old, not the newest orchestrator block's session_new",
    "= brief reap — 1 trigger(s) to disable (update_trigger enabled:false; log each act)"]);
});
