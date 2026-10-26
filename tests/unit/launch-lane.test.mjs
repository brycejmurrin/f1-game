// launch-lane — the pre-launch gate (tools/ci/launch-lane.mjs): quota from a saved get_session, the source-revision
// shape, the twin guard on a saved list_sessions page, the claim branch as a non-forced compare-and-swap, the launch JSON.
// Fixtures: tests/fixtures/launch-lane/ (shapes copied from real get_session / list_sessions results, 2026-10-26).
// The claim race runs against real git on a local bare origin. No network. Under two seconds.
import "../helpers/git-fixture-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  quotaVerdict, revisionProblem, claimKey, twinsOf, launchSpec, pushClaim, releaseClaim, readClaim,
  isHeld, main, CLAIM_NS, prReadyOf, liveOrchestrators, quotaIncidentLine, narrowingHits, standingAuthority,
} from "../../tools/ci/launch-lane.mjs";
import { extractSessions } from "../../tools/ci/fleet-archive.mjs";
import { extractSession } from "../../tools/ci/launch-gate.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FX = path.join(ROOT, "tests", "fixtures", "launch-lane");
const fx = (f) => path.join(FX, f);
const ME = "claude:session_01ORCHORCHORCHORCHORCHOR";
const NOW = Date.parse("2026-10-26T06:00:00Z");

test("quota: launch-gate's rule (allowed, or the user's quoted words over a warning); rejected never launches", () => {
  const page = (f) => extractSession(fs.readFileSync(fx(f), "utf8"));
  assert.equal(quotaVerdict(page("get-session-allowed.json")).ok, true);
  const v = quotaVerdict(page("get-session-warning.json"));
  assert.equal(v.ok, false);
  assert.equal(v.status, "allowed_warning");
  assert.equal(v.why, "rate_limit_info.status allowed_warning: launch nothing but owners/sync for a READY PR, or an orchestrator for a fleet with none live (DECISIONS #1); no role launches (no hunters, no workers); a launch Bryce typed goes through --override \"<his words>\"", v.why);
  const o = quotaVerdict(page("get-session-warning.json"), "launch all lanes now");
  assert.equal(o.ok, true);
  assert.equal(o.override, "launch all lanes now");
  const rejected = { external_metadata: { rate_limit_info: { status: "rejected", rateLimitType: "five_hour" } } };
  assert.equal(quotaVerdict(rejected, "anything").ok, false, "an override never passes a rejection");
  assert.equal(quotaVerdict({}).ok, false, "no rate_limit_info refuses");
  assert.equal(quotaVerdict(null).ok, false);
});

test("revision: a branch name or a full sha; a sha7 and malformed names are refused", () => {
  for (const r of ["claude/f1-game-project-26h3ng", "cursor/audit-bus-schema-d35b", "a".repeat(40), "main"]) assert.equal(revisionProblem(r), "", r);
  assert.ok(/short sha/.test(revisionProblem("3e8abc0")), revisionProblem("3e8abc0"));
  assert.ok(/short sha/.test(revisionProblem("3e8abc096fd435100a83b31d6ce50a3dcda7601")), "39 hex");
  for (const r of ["a..b", "has space", "-lead", "x/", "x.lock", "a~1", "a:b"]) assert.ok(/not a valid branch/.test(revisionProblem(r)), r);
  assert.ok(/branch name, not the ref/.test(revisionProblem("refs/heads/x")), revisionProblem("refs/heads/x"));
  assert.ok(/required/.test(revisionProblem("")), revisionProblem(""));
});

test("claimKey: <fleet>-<lane>[-pr<n>]; bad shapes throw", () => {
  assert.equal(claimKey({ fleet: "b", lane: "X1" }), "B-X1");
  assert.equal(claimKey({ fleet: "A", lane: "W9", pr: "3790" }), "A-W9-pr3790");
  assert.throws(() => claimKey({ fleet: "AB", lane: "X1" }), /one letter/);
  assert.throws(() => claimKey({ fleet: "B", lane: "x/y" }), /short slug/);
  assert.throws(() => claimKey({ fleet: "B", lane: "X1", pr: "12a" }), /number/);
});

test("twins: a live session with the same fleet+lane tag or the same PR (any fleet); archived/completed and self never count", () => {
  const sessions = extractSessions(fs.readFileSync(fx("list-sessions.txt"), "utf8"));
  assert.deepEqual(twinsOf(sessions, { fleet: "B", lane: "X2" }).map((t) => t.id), ["session_01X2X2X2X2X2X2X2X2X2X2X2"]);
  assert.deepEqual(twinsOf(sessions, { fleet: "A", lane: "X2" }), [], "lane tags are per fleet");
  assert.deepEqual(twinsOf(sessions, { fleet: "B", lane: "X3" }), [], "archived");
  assert.deepEqual(twinsOf(sessions, { fleet: "B", lane: "X4" }), [], "completed");
  const pr = twinsOf(sessions, { fleet: "B", lane: "Z1", pr: "3790" });
  assert.deepEqual(pr.map((t) => [t.id, t.why]), [["session_01PRPRPRPRPRPRPRPRPRPRPR", "pr:3790"]]);
  assert.deepEqual(twinsOf(sessions, { fleet: "B", lane: "X2", selfId: "session_01X2X2X2X2X2X2X2X2X2X2X2" }), []);
});

test("launchSpec: tags in the launch-policy shape; model, title and role are required", () => {
  assert.deepEqual(launchSpec({ fleet: "B", lane: "X1", pr: "3790", role: "worker", scope: "tools", model: "claude-opus-5-5",
    title: "[Worker] B·X1", sourceRevision: "cursor/x-1a2b", orchestrator: ME }), {
    title: "[Worker] B·X1", model: "claude-opus-5-5", source_revision: "cursor/x-1a2b", permission_mode: "auto",
    tags: ["f1-game-fleet", "fleet:b", "lane:X1", "role:worker", "scope:tools", "pr:3790", "orchestrator:session_01ORCHORCHORCHORCHORCHOR"],
  });
  assert.throws(() => launchSpec({ fleet: "B", lane: "X1", role: "worker", title: "t" }), /--model/);
  assert.throws(() => launchSpec({ fleet: "B", lane: "X1", role: "worker", model: "m" }), /--title/);
  assert.throws(() => launchSpec({ fleet: "B", lane: "X1", title: "t", model: "m" }), /--role/);
});

const ARGS = ["--fleet", "B", "--lane", "X9", "--role", "worker", "--scope", "tools", "--model", "claude-opus-5-5", "--title", "[Worker] B·X9",
  "--source-revision", "claude/f1-game-project-26h3ng", "--sessions-json", fx("list-sessions.txt"), "--as", ME];

function run(extra, over = {}) {
  const out = [], receipts = [], claims = [];
  const code = main([...ARGS, ...extra], {
    log: (l) => out.push(l), now: () => NOW, mtime: () => NOW - 60_000,
    claim: (key, c) => { claims.push([key, c]); return over.claim ? over.claim(key, c) : { ok: true, sha: "c".repeat(40) }; },
    writeReceipt: (o) => receipts.push(o), ...over.deps,
  });
  return { code, out, receipts, claims };
}

test("main gate: quota, revision, twin and claim refusals exit 2 in that order, before any side effect", () => {
  let r = run(["--session-json", fx("get-session-warning.json")]);
  assert.equal(r.code, 2);
  assert.ok(/REFUSED \(quota\)/.test(r.out.at(-1)), r.out.at(-1));
  assert.deepEqual([r.claims.length, r.receipts.length], [0, 0]);
  r = run(["--session-json", fx("get-session-allowed.json")], { deps: { mtime: () => NOW - 30 * 60_000 } });
  assert.ok(/REFUSED \(quota\): --session-json is 1800 s old \(max 120\)/.test(r.out.at(-1)), r.out.at(-1));
  const sha7 = [...ARGS]; sha7[sha7.indexOf("claude/f1-game-project-26h3ng")] = "3e8abc0";
  const out = [];
  assert.equal(main([...sha7, "--session-json", fx("get-session-allowed.json")], { log: (l) => out.push(l), now: () => NOW, mtime: () => NOW, claim: () => assert.fail("no claim"), writeReceipt: () => assert.fail("no receipt") }), 2);
  assert.ok(/REFUSED \(revision\): 3e8abc0 is a short sha/.test(out.at(-1)), out.at(-1));
  const twin = [...ARGS]; twin[twin.indexOf("X9")] = "X2";
  const out2 = [];
  assert.equal(main([...twin, "--session-json", fx("get-session-allowed.json")], { log: (l) => out2.push(l), now: () => NOW, mtime: () => NOW, claim: () => assert.fail("no claim"), writeReceipt: () => assert.fail("no receipt") }), 2);
  assert.ok(/REFUSED \(twin\): session_01X2X2X2X2X2X2X2X2X2X2X2 \(lane:X2\)/.test(out2.at(-1)), out2.at(-1));
  r = run(["--session-json", fx("get-session-allowed.json")], { claim: () => ({ ok: false, held: { sha: "d", claim: { by: "claude:session_other", at: "t0" } } }) });
  assert.equal(r.code, 2);
  assert.ok(/REFUSED \(claim\): refs\/heads\/fleet-claims\/B-X9 held by claude:session_other since t0/.test(r.out.at(-1)), r.out.at(-1));
  assert.equal(r.receipts.length, 0);
});

test("main gate: a pass claims, writes the receipt and prints the create_session JSON; --override and --no-claim are recorded", () => {
  let r = run(["--session-json", fx("get-session-allowed.json"), "--json"]);
  assert.equal(r.code, 0, r.out.join("\n"));
  assert.deepEqual(r.claims.map(([k, c]) => [k, c.by, c.lane]), [["B-X9", ME, "X9"]]);
  const j = JSON.parse(r.out.at(-1));
  assert.equal(j.claim, `${CLAIM_NS}/B-X9`);
  assert.equal(j.spec.model, "claude-opus-5-5");
  assert.deepEqual([r.receipts[0].ok, r.receipts[0].status, r.receipts[0].session, r.receipts[0].override, r.receipts[0].lane],
    [true, "allowed", "session_01ORCHORCHORCHORCHORCHOR", null, "X9"], "launch-gate's receipt shape, plus the lane");
  r = run(["--session-json", fx("get-session-warning.json"), "--override", "Bryce: go", "--no-claim"]);
  assert.equal(r.code, 0, r.out.join("\n"));
  assert.equal(r.claims.length, 0);
  assert.equal(r.receipts[0].override, "Bryce: go");
  assert.equal(r.receipts[0].claim, null);
  assert.ok(/quota allowed_warning \(override: Bryce: go\).*no claim/.test(r.out[0]), r.out[0]);
  assert.equal(r.receipts[0].status, "allowed_warning");
  assert.equal(main(["--fleet", "B", "--lane", "X9", "--bogus", "1"], { log: () => {} }), 2, "unknown flag (makeFlags)");
  const help = [];
  assert.equal(main(["--help"], { log: (l) => help.push(l) }), 0, "--help exits 0");
  assert.deepEqual(help.join("\n").split("\n").slice(0, 3), ["usage: launch-lane.mjs --fleet L --lane X [--pr N] --role R [--scope S] --model M --title T --source-revision B \\", "         --session-json <saved get_session> --sessions-json <saved list_sessions> [--pr-json <saved PR read>] \\", "         [--brief <launch prompt file>] [--override \"<user's words>\"] [--no-claim] [--json]"], help.join("\n"));
});

test("against real git: the first claim wins, a second is refused with the holder; release is a tombstone the next claim builds on", () => {
  const dir = path.join(ROOT, "artifacts", `launch-lane-test-${process.pid}`);
  fs.rmSync(dir, { recursive: true, force: true });
  const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  try {
    fs.mkdirSync(dir, { recursive: true });
    g(dir, "init", "-q", "--bare", "origin.git");
    const [HA, HB] = ["a", "b"].map((w) => { g(dir, "init", "-q", w); g(path.join(dir, w), "remote", "add", "origin", path.join(dir, "origin.git")); return path.join(dir, w); });
    const A = "claude:session_A", B = "cursor:bc-B";
    assert.equal(readClaim("B-X1", { cwd: HA }), null);
    assert.equal(pushClaim("B-X1", { by: A, at: "t1", lane: "X1" }, { cwd: HA }).ok, true);
    const lost = pushClaim("B-X1", { by: B, at: "t2", lane: "X1" }, { cwd: HB });
    assert.equal(lost.ok, false);
    assert.equal(lost.held.claim.by, A);
    assert.equal(releaseClaim("B-X1", B, { cwd: HB }).ok, false, "only the holder releases");
    assert.equal(releaseClaim("B-X1", A, { cwd: HA, at: "t3" }).ok, true);
    const tomb = readClaim("B-X1", { cwd: HB });
    assert.equal(isHeld(tomb), false);
    assert.equal(tomb.claim.released, true);
    assert.equal(pushClaim("B-X1", { by: B, at: "t4", lane: "X1" }, { cwd: HB }).ok, true, "a released lane is claimable");
    assert.equal(readClaim("B-X1", { cwd: HA }).claim.by, B);
    // History is one chain: claim A -> tombstone -> claim B, every step a fast-forward.
    assert.equal(g(path.join(dir, "origin.git"), "rev-list", "--count", `${CLAIM_NS}/B-X1`).trim(), "3");
    assert.equal(releaseClaim("B-X9", A, { cwd: HA }).reason, "already free");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("main gate: an orchestrator boots from the deploy branch, never a queue branch (2026-10-26: nine successors ran a retired rulebook)", () => {
  const orch = [...ARGS];
  orch[orch.indexOf("--role") + 1] = "orchestrator";
  orch[orch.indexOf("claude/f1-game-project-26h3ng")] = "cursor/orchb-queue-b7f2";
  const out = [];
  const deps = { log: (l) => out.push(l), now: () => NOW, mtime: () => NOW, claim: () => assert.fail("no claim"), writeReceipt: () => assert.fail("no receipt") };
  assert.equal(main([...orch, "--session-json", fx("get-session-allowed.json")], deps), 2);
  assert.ok(/REFUSED \(revision\): an orchestrator boots from claude\/f1-game-project-26h3ng \(got cursor\/orchb-queue-b7f2\)/.test(out.at(-1)), out.at(-1));
  const worker = [...ARGS];
  worker[worker.indexOf("claude/f1-game-project-26h3ng")] = "cursor/orchb-queue-b7f2";
  const out2 = [];
  const code = main([...worker, "--session-json", fx("get-session-allowed.json"), "--no-claim"], { log: (l) => out2.push(l), now: () => NOW, mtime: () => NOW, writeReceipt: () => {} });
  assert.notEqual(out2.at(-1) && /REFUSED \(revision\)/.test(out2.at(-1)), true, `a worker may boot from a topic branch: ${out2.at(-1)}`);
  void code;
});

// DECISIONS #1 (2026-10-26): launch through allowed_warning for owners/sync of a READY PR and a missing orchestrator only;
// rejected / usage_limit_reached never launches and names the INCIDENT line to post.
test("quota at allowed_warning: owner/sync for a READY PR, an orchestrator only when none is live; no workers or hunters", () => {
  const warn = extractSession(fs.readFileSync(fx("get-session-warning.json"), "utf8"));
  for (const role of ["owner", "sync", "pr-owner"]) {
    assert.equal(quotaVerdict(warn, { role, prReady: true }).ok, true, role);
    assert.equal(quotaVerdict(warn, { role, prReady: false }).ok, false, `${role} on a draft`);
    assert.equal(quotaVerdict(warn, { role }).why, `rate_limit_info.status allowed_warning: launch nothing but owners/sync for a READY PR, or an orchestrator for a fleet with none live (DECISIONS #1); this ${role} launch needs --pr-json <saved PR read> showing the PR open and not a draft`, "no PR evidence refuses");
  }
  for (const role of ["worker", "hunter", "survey", ""]) assert.equal(quotaVerdict(warn, { role, prReady: true }).ok, false, role || "no role");
  assert.equal(quotaVerdict(warn, { role: "orchestrator", liveOrchs: [] }).ok, true);
  const busy = quotaVerdict(warn, { role: "orchestrator", liveOrchs: ["session_01LIVE"] });
  assert.equal(busy.ok, false);
  assert.equal(busy.why, "rate_limit_info.status allowed_warning: launch nothing but owners/sync for a READY PR, or an orchestrator for a fleet with none live (DECISIONS #1); live orchestrator(s): session_01LIVE", busy.why);
  assert.equal(quotaVerdict(warn, { role: "hunter", override: "Bryce: launch a hunter" }).ok, true, "Bryce's typed word still passes a warning");
  const allowed = extractSession(fs.readFileSync(fx("get-session-allowed.json"), "utf8"));
  assert.equal(quotaVerdict(allowed, { role: "hunter" }).ok, true, "allowed launches anything");
});

test("quota rejected / usage_limit_reached: refused even with an override, and the INCIDENT line names quota-<Pacific date>", () => {
  const rej = { external_metadata: { rate_limit_info: { status: "rejected", rateLimitType: "seven_day", resetsAt: 1793000000 } } };
  const q = quotaVerdict(rej, { role: "owner", prReady: true, override: "go" });
  assert.deepEqual([q.ok, q.status, q.incident], [false, "rejected", true]);
  const allowed = extractSession(fs.readFileSync(fx("get-session-allowed.json"), "utf8"));
  const u = quotaVerdict(allowed, { role: "owner", prReady: true, pageText: '{"error":"api_error: usage_limit_reached"}' });
  assert.deepEqual([u.ok, u.status], [false, "usage_limit_reached"]);
  // 2026-10-27T05:00Z is still 10-26 in Pacific.
  const line = quotaIncidentLine(q, Date.parse("2026-10-27T05:00:00Z"));
  assert.equal(line, "node tools/ci/fleet-bus.mjs send INCIDENT --to '*' --idem quota-2026-10-26 \"open quota-2026-10-26 seven_day rejected resets 2026-10-26T07:33Z: no launches until the reset\"", line);
  const files = { "rej.json": JSON.stringify({ ccr: { id: "session_x", ...rej } }) };
  const r = run(["--session-json", "rej.json", "--override", "go"], { deps: { read: (f) => files[f] ?? fs.readFileSync(f, "utf8") } });
  assert.equal(r.code, 2);
  assert.equal(r.out.at(-2), "= launch REFUSED (quota): quota seven_day rejected: nothing launches until the reset; post the INCIDENT line below once", r.out.join("\n"));
  assert.equal(r.out.at(-1), "= post once: node tools/ci/fleet-bus.mjs send INCIDENT --to '*' --idem quota-2026-10-25 \"open quota-2026-10-25 seven_day rejected resets 2026-10-26T07:33Z: no launches until the reset\"", r.out.at(-1));
  assert.equal(r.receipts.length, 0);
});

test("prReadyOf: MCP/REST `draft` or gh `isDraft`; a draft, a closed PR, another PR number or no field is not READY", () => {
  assert.equal(prReadyOf('{"number":3790,"draft":false,"state":"open"}', "3790").ready, true);
  assert.equal(prReadyOf('{"number":3790,"isDraft":false,"state":"OPEN"}', 3790).ready, true);
  assert.equal(prReadyOf('{"number":3790,"draft":true,"state":"open"}', 3790).ready, false);
  assert.equal(prReadyOf('{"number":3790,"draft":false,"state":"closed"}', 3790).ready, false);
  assert.equal(prReadyOf('{"number":3790,"draft":false}', 3791).why, "--pr-json is #3790, not #3791");
  assert.equal(prReadyOf('{"number":3790}', 3790).why, "--pr-json carries no draft/isDraft field");
});

test("main at allowed_warning: an owner with a READY --pr-json launches (default lane pr<N>, claim B-pr<N>); a worker is refused", () => {
  const files = { "pr.json": '{"number":3791,"draft":false,"state":"open"}', "draft.json": '{"number":3791,"draft":true,"state":"open"}' };
  const read = (f) => files[f] ?? fs.readFileSync(f, "utf8");
  const owner = ["--fleet", "B", "--pr", "3791", "--role", "owner", "--model", "claude-opus-5-5", "--title", "[Owner] B #3791",
    "--source-revision", "cursor/x-1a2b", "--sessions-json", fx("list-sessions.txt"), "--session-json", fx("get-session-warning.json"), "--as", ME];
  const out = [], claims = [], receipts = [];
  const deps = { log: (l) => out.push(l), now: () => NOW, mtime: () => NOW, read, claim: (k) => { claims.push(k); return { ok: true, sha: "c".repeat(40) }; }, writeReceipt: (o) => receipts.push(o) };
  assert.equal(main([...owner, "--pr-json", "pr.json"], deps), 0, out.join("\n"));
  assert.deepEqual(claims, ["B-pr3791"]);
  assert.equal(receipts[0].status, "allowed_warning");
  assert.equal(main([...owner, "--pr-json", "draft.json"], deps), 2);
  assert.equal(out.at(-1), "= launch REFUSED (quota): rate_limit_info.status allowed_warning: launch nothing but owners/sync for a READY PR, or an orchestrator for a fleet with none live (DECISIONS #1); this owner launch needs --pr-json <saved PR read> showing the PR open and not a draft (it is a draft or not open) [--pr-json: the PR is a draft]", out.at(-1));
  const worker = owner.map((a) => (a === "owner" ? "worker" : a));
  assert.equal(main([...worker, "--pr-json", "pr.json"], deps), 2);
  assert.equal(out.at(-1), "= launch REFUSED (quota): rate_limit_info.status allowed_warning: launch nothing but owners/sync for a READY PR, or an orchestrator for a fleet with none live (DECISIONS #1); no worker launches (no hunters, no workers); a launch Bryce typed goes through --override \"<his words>\"", out.at(-1));
  const noPr = owner.filter((a, i) => a !== "--pr" && owner[i - 1] !== "--pr");
  assert.equal(main(noPr, deps), 1, "owner without --pr is usage");
});

test("twins for owner/sync key on the PR only: another session tagged lane:owner is not a twin (tx T3)", () => {
  const sessions = [
    { id: "session_01OWNA", title: "[Owner] B #3748", session_status: "SESSION_STATUS_RUNNING", tags: ["fleet:b", "lane:owner", "role:owner", "pr:3748"] },
    { id: "session_01OWNB", title: "[Owner] B #3750", session_status: "SESSION_STATUS_RUNNING", tags: ["fleet:b", "lane:owner", "role:owner", "pr:3750"] },
  ];
  assert.deepEqual(twinsOf(sessions, { fleet: "B", lane: "owner", pr: "3760", prOnly: true }), []);
  assert.deepEqual(twinsOf(sessions, { fleet: "B", lane: "owner", pr: "3750", prOnly: true }).map((t) => t.id), ["session_01OWNB"]);
  assert.equal(twinsOf(sessions, { fleet: "B", lane: "owner", pr: "3760" }).length, 2, "without prOnly the lane still matches");
  assert.equal(claimKey({ fleet: "B", lane: "pr3748", pr: "3748" }), "B-pr3748", "no doubled claim name");
});

test("liveOrchestrators: role:orchestrator of that fleet, live and not [Done → …]", () => {
  const s = [
    { id: "o1", title: "ORCH B", session_status: "SESSION_STATUS_RUNNING", tags: ["fleet:b", "role:orchestrator"] },
    { id: "o2", title: "[Done → o1] ORCH B", session_status: "SESSION_STATUS_IDLE", tags: ["fleet:b", "role:orchestrator"] },
    { id: "o3", title: "ORCH A", session_status: "SESSION_STATUS_RUNNING", tags: ["fleet:a", "role:orchestrator"] },
    { id: "o4", title: "ORCH B old", session_status: "SESSION_STATUS_ARCHIVED", tags: ["fleet:b", "role:orchestrator"] },
  ];
  assert.deepEqual(liveOrchestrators(s, "b"), ["o1"]);
  assert.deepEqual(liveOrchestrators(s, "C"), []);
});

test("--brief: a launch prompt that narrows the standing authority is refused, quoting AGENTS.md verbatim (tx T1)", () => {
  assert.deepEqual(narrowingHits("Launch only on my typed word. B merges only its own PRs, or a PR I name."),
    ["Launch only on my typed word", "merges only its own PRs"]);
  assert.deepEqual(narrowingHits("launch no workers without asking Bryce"), ["launch no workers without asking"]);
  assert.deepEqual(narrowingHits("Merge your own fleet's PRs when merge-gate exits 0."), []);
  const auth = standingAuthority(ROOT);
  assert.ok(auth.startsWith("STANDING AUTHORITY (Bryce 2026-10-19") && /It also launches sessions/.test(auth) && !auth.includes("\n"), auth);
  const files = { "seed.md": "You are ORCH B. Launch only on my typed word." };
  const out = [];
  const code = main([...ARGS, "--session-json", fx("get-session-allowed.json"), "--brief", "seed.md"],
    { log: (l) => out.push(l), now: () => NOW, mtime: () => NOW, read: (f) => files[f] ?? fs.readFileSync(f, "utf8"), claim: () => assert.fail("no claim"), writeReceipt: () => assert.fail("no receipt") });
  assert.equal(code, 2);
  assert.ok(out.at(-1).startsWith('= launch REFUSED (brief): seed.md narrows the standing authority ("Launch only on my typed word")'), out.at(-1));
  assert.ok(out.at(-1).includes(`"${auth}"`), "the quote is AGENTS.md's bullet, verbatim");
});
