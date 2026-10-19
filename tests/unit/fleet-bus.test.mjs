// fleet-bus — the cross-host merge lease and message bus (tools/ci/fleet-bus.mjs).
// The lease rules (acquire/renew/release/break/expiry) are pure and pinned on
// fixtures; the compare-and-swap that makes "exactly one holder" true is pinned
// against real git: two hosts with stale views race for one lease on a local
// bare origin, and the loser is refused. Bus cursor reads return only the new
// lines. No network. Under two seconds.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  decide, leaseState, parseLease, leaseLine, formatLine, parseLine, parseLog, addressed, whoAmI,
  writeBus, readLease, readBus, fetchBus, BUS_BRANCH, MAX_TTL_MIN, DEFAULT_TTL_MIN,
} from "../../tools/ci/fleet-bus.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const T = 1_800_000_000;
const A = "claude:session_A", B = "cursor:bc-B";
const held = (holder, minsLeft, extra = {}) => ({ holder, since: T - 600, expires: T + minsLeft * 60, ttlMin: 60, note: "", ...extra });

test("acquire: a free or lapsed lease is taken; a live one held by another is refused", () => {
  const d = decide("acquire", null, A, T, { ttlMin: 30, note: "ORCH queue" });
  assert.equal(d.ok, true);
  assert.deepEqual(d.lease, { holder: A, since: T, expires: T + 1800, ttlMin: 30, note: "ORCH queue" });
  assert.equal(decide("acquire", held(B, -1), A, T).ok, true, "a lapsed lease is free");
  assert.equal(decide("acquire", held(B, 0), A, T).ok, true, "expiry is inclusive: at `expires` it has lapsed");
  const r = decide("acquire", held(B, 5), A, T);
  assert.equal(r.ok, false);
  assert.match(r.reason, /held by cursor:bc-B for 5 more min/);
});

test("renew extends only the holder's lease and keeps its start", () => {
  const d = decide("renew", held(A, 3, { note: "q" }), A, T, { ttlMin: 45 });
  assert.equal(d.ok, true);
  assert.equal(d.lease.expires, T + 45 * 60);
  assert.equal(d.lease.since, T - 600, "a renewal is the same tenure");
  assert.equal(d.lease.note, "q", "the note carries over");
  assert.equal(decide("acquire", held(A, 3), A, T).verb, "renew", "acquire by the holder is a renewal");
  assert.match(decide("renew", held(B, 3), A, T).reason, /not yours/);
  assert.match(decide("renew", null, A, T).reason, /no lease/);
});

test("release: the holder frees it; anyone clears a lapsed one; a live foreign lease is refused", () => {
  assert.equal(decide("release", held(A, 10), A, T).lease, null);
  const lapsed = decide("release", held(B, -2), A, T);
  assert.equal(lapsed.ok, true);
  assert.match(lapsed.verb, /clear lapsed cursor:bc-B/);
  assert.equal(decide("release", held(B, 10), A, T).ok, false);
  assert.equal(decide("release", null, A, T).ok, false);
});

test("break takes a live lease only with the user's words, which the LEASE line records", () => {
  assert.match(decide("break", held(B, 30), A, T).reason, /--grant/);
  const d = decide("break", held(B, 30), A, T, { grant: 'Bryce: "ORCH takes merges"' });
  assert.equal(d.ok, true);
  assert.equal(d.lease.holder, A);
  assert.match(leaseLine(d, A, T), /^LEASE to:\* from:claude:session_A break cursor:bc-B grant="Bryce: 'ORCH takes merges'" ttl=60m until=/);
});

test("ttl is clamped to 1..MAX_TTL_MIN; junk falls back to the default", () => {
  assert.equal(decide("acquire", null, A, T, { ttlMin: 10_000 }).lease.ttlMin, MAX_TTL_MIN);
  assert.equal(decide("acquire", null, A, T, { ttlMin: 0.2 }).lease.ttlMin, 1);
  assert.equal(decide("acquire", null, A, T, { ttlMin: "x" }).lease.ttlMin, DEFAULT_TTL_MIN);
});

test("leaseState and parseLease: free, live, lapsed, unreadable", () => {
  assert.deepEqual(leaseState(null, T), { free: true, holder: null, expired: false, leftMin: 0 });
  assert.deepEqual(leaseState(held(A, 7), T), { free: false, holder: A, expired: false, leftMin: 7 });
  assert.equal(leaseState(held(A, -1), T).free, true);
  assert.equal(parseLease("{}"), null);
  assert.equal(parseLease("not json"), null);
  assert.equal(parseLease(JSON.stringify({ holder: A })), null, "no expiry is not a lease");
  assert.equal(parseLease(JSON.stringify(held(A, 1))).holder, A);
});

test("bus lines: typed, one address, round-trip; non-bus subjects are dropped", () => {
  const l = formatLine("READY", "#2990", A, "abc1234  ready-gate\n0");
  assert.equal(l, "READY to:#2990 from:claude:session_A abc1234 ready-gate 0");
  assert.deepEqual(parseLine(l), { type: "READY", to: "#2990", from: A, text: "abc1234 ready-gate 0" });
  assert.throws(() => formatLine("PING", "*", A), /unknown type/);
  assert.throws(() => formatLine("DONE", "a b", A), /one address/);
  assert.equal(parseLine("Merge branch 'x'"), null);
  assert.equal(parseLine("SWEEP to:x from:y"), null, "only the typed set");
  const log = `aaa\t${T}\tGREEN to:orchestrator from:${B} #1 green\nbbb\t${T + 1}\tinitial commit\n`;
  assert.deepEqual(parseLog(log).map((e) => e.sha), ["aaa"]);
});

test("addressing: no filter reads all; * reaches everyone; otherwise exact role, PR or id", () => {
  assert.equal(addressed("#5", []), true);
  assert.equal(addressed("*", ["merge-holder"]), true);
  assert.equal(addressed("merge-holder", ["merge-holder", "#5"]), true);
  assert.equal(addressed("#55", ["#5"]), false);
});

test("identity: --as, then APEX_FLEET_AS, then the host's session env", () => {
  assert.equal(whoAmI({ CLAUDE_CODE_SESSION_ID: "s1" }, "codex:x"), "codex:x");
  assert.equal(whoAmI({ APEX_FLEET_AS: "grok:bot", CLAUDE_CODE_SESSION_ID: "s1" }), "grok:bot");
  assert.equal(whoAmI({ CLAUDE_CODE_SESSION_ID: "s1" }), "claude:s1");
  assert.equal(whoAmI({ CODEX_THREAD_ID: "t" }), "codex:t");
  assert.equal(whoAmI({}), null);
});

test("against real git: two hosts race for one lease, exactly one wins; the bus reads only new lines", () => {
  const dir = path.join(ROOT, "artifacts", `fleet-bus-test-${process.pid}`);
  fs.rmSync(dir, { recursive: true, force: true });
  const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  try {
    fs.mkdirSync(dir, { recursive: true });
    g(dir, "init", "-q", "--bare", "origin.git");
    const [HA, HB] = ["a", "b"].map((w) => { g(dir, "init", "-q", w); g(path.join(dir, w), "remote", "add", "origin", path.join(dir, "origin.git")); return path.join(dir, w); });
    const acquire = (cwd, me, t) => writeBus((lease) => {
      const d = decide("acquire", lease, me, t);
      return d.ok ? { ...d, line: leaseLine(d, me, t) } : d;
    }, { cwd });
    // B fetches before A writes, so B's view is stale when it pushes: the CAS
    // must refetch and see A's lease, not overwrite it.
    fetchBus({ cwd: HB });
    assert.equal(acquire(HA, A, T).ok, true, "A takes the free lease (and creates the branch)");
    const lost = acquire(HB, B, T + 60);
    assert.equal(lost.ok, false, "B, racing from a stale view, is refused");
    assert.equal(lost.refused, true);
    assert.match(lost.reason, /held by claude:session_A/);
    assert.equal(readLease({ cwd: HB }).holder, A);
    // A dead holder's lease lapses: B takes it after expiry.
    assert.equal(acquire(HB, B, T + DEFAULT_TTL_MIN * 60).ok, true, "lapsed: B takes it");
    assert.equal(readLease({ cwd: HA }).holder, B);
    // Bus: a cursor read returns only what came after it.
    const send = (cwd, line) => writeBus(() => ({ ok: true, line, lease: undefined }), { cwd });
    const cur = readBus({ cwd: HA }).tip;
    assert.equal(send(HA, formatLine("READY", "#7", A, "abc ready")).ok, true);
    assert.equal(send(HB, formatLine("GREEN", "orchestrator", B, "#7 green")).ok, true);
    const r = readBus({ cwd: HA, since: cur });
    assert.deepEqual(r.entries.map((e) => e.type), ["READY", "GREEN"]);
    assert.equal(readBus({ cwd: HA, since: r.tip }).entries.length, 0, "nothing new past the tip");
    assert.equal(readLease({ cwd: HA }).holder, B, "a message keeps the lease untouched");
    assert.equal(readBus({ cwd: HA, since: "0".repeat(40), last: 2 }).reset, true, "an unknown cursor falls back to the last N");
    assert.match(g(HA, "ls-remote", "origin"), new RegExp(`refs/heads/${BUS_BRANCH}`));
    // The true race: A releases, then B fetches and decides "free" — and A re-acquires
    // between B's decision and B's push. B's push must be rejected (not a fast-forward),
    // and B's retry must decide again on A's lease and be refused.
    assert.equal(writeBus((l) => { const d = decide("release", l, B, T + 3700); return { ...d, line: leaseLine(d, B, T + 3700) }; }, { cwd: HB }).ok, true);
    let calls = 0;
    const raced = writeBus((lease) => {
      if (calls++ === 0) assert.equal(acquire(HA, A, T + 3800).ok, true, "A slips in after B fetched");
      const d = decide("acquire", lease, B, T + 3800);
      return d.ok ? { ...d, line: leaseLine(d, B, T + 3800) } : d;
    }, { cwd: HB });
    assert.equal(calls, 2, "B's first push was rejected and it decided again");
    assert.equal(raced.refused, true, "the second decision saw A's lease");
    assert.equal(readLease({ cwd: HB }).holder, A, "exactly one holder: A");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
