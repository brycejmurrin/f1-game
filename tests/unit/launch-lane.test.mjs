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
  isHeld, main, CLAIM_NS,
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
  assert.ok(/launch nothing/.test(v.why), v.why);
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
  assert.equal(main(["--fleet", "B", "--lane", "X9", "--bogus", "1"], { log: () => {} }), 1, "unknown flag");
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
