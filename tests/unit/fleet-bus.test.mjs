// fleet-bus — the cross-host merge lease and message bus (tools/ci/fleet-bus.mjs).
// The lease rules (acquire/renew/release/break/expiry) are pure and pinned on
// fixtures; the compare-and-swap that makes "exactly one holder" true is pinned
// against real git: two hosts with stale views race for one lease on a local
// bare origin, and the loser is refused. Bus cursor reads return only the new
// lines. No network. Under two seconds.
import "../helpers/git-fixture-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  decide, leaseState, parseLease, leaseLine, formatLine, parseLine, parseLog, addressed, whoAmI,
  writeBus, readLease, readBus, fetchBus, BUS_BRANCH, MAX_TTL_MIN, DEFAULT_TTL_MIN,
  addressProblem, ADDRESS_FORMS, ROLES, main, parseLive, whoIs, whoLine, ageOf,
  TYPES, PROTOCOL_TYPES, BODY_MIN, BODY_MAX, bodyProblem, lendMerger, idemOf, idemMarker, findIdem, strictCursor, sendBusLine,
} from "../../tools/ci/fleet-bus.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const T = 1_800_000_000;
const A = "claude:session_A", B = "cursor:bc-B";
/** A protocol body long enough for HANDOFF/READY/DONE/BLOCKED/LEND (BODY_MIN chars). */
const BODY = "#2990 abc1234 blocked on review";
const held = (holder, minsLeft, extra = {}) => ({ holder, since: T - 600, expires: T + minsLeft * 60, ttlMin: 60, note: "", ...extra });

test("acquire: a free or lapsed lease is taken; a live one held by another is refused", () => {
  const d = decide("acquire", null, A, T, { ttlMin: 30, note: "ORCH queue" });
  assert.equal(d.ok, true);
  assert.deepEqual(d.lease, { holder: A, since: T, expires: T + 1800, ttlMin: 30, note: "ORCH queue" });
  assert.equal(decide("acquire", held(B, -1), A, T).ok, true, "a lapsed lease is free");
  assert.equal(decide("acquire", held(B, 0), A, T).ok, true, "expiry is inclusive: at `expires` it has lapsed");
  const r = decide("acquire", held(B, 5), A, T);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "held by cursor:bc-B for 5 more min");
});

test("renew extends only the holder's lease and keeps its start", () => {
  const d = decide("renew", held(A, 3, { note: "q" }), A, T, { ttlMin: 45 });
  assert.equal(d.ok, true);
  assert.equal(d.lease.expires, T + 45 * 60);
  assert.equal(d.lease.since, T - 600, "a renewal is the same tenure");
  assert.equal(d.lease.note, "q", "the note carries over");
  assert.equal(decide("acquire", held(A, 3), A, T).verb, "renew", "acquire by the holder is a renewal");
  assert.equal(decide("renew", held(B, 3), A, T).reason, "not yours: held by cursor:bc-B for 3 more min");
  assert.equal(decide("renew", null, A, T).reason, "no lease to renew (acquire)");
});

test("release: the holder frees it; anyone clears a lapsed one; a live foreign lease is refused", () => {
  assert.equal(decide("release", held(A, 10), A, T).lease, null);
  const lapsed = decide("release", held(B, -2), A, T);
  assert.equal(lapsed.ok, true);
  assert.equal(lapsed.verb, "clear lapsed cursor:bc-B");
  assert.equal(decide("release", held(B, 10), A, T).ok, false);
  assert.equal(decide("release", null, A, T).ok, false);
});

test("break takes a live lease only with the user's words, which the LEASE line records", () => {
  assert.equal(decide("break", held(B, 30), A, T).reason, "break needs --grant with the user's words (authority.md)");
  const d = decide("break", held(B, 30), A, T, { grant: 'Bryce: "ORCH takes merges"' });
  assert.equal(d.ok, true);
  assert.equal(d.lease.holder, A);
  assert.equal(leaseLine(d, A, T), `LEASE to:* from:claude:session_A break cursor:bc-B grant="Bryce: 'ORCH takes merges'" ttl=60m until=2027-01-15T09:00Z`);
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
  // An empty or whitespace body is refused (2026-10-26: six empty HANDOFF lines from a flag that ate the text).
  assert.throws(() => formatLine("HANDOFF", "B", A, ""), /empty text/);
  assert.throws(() => formatLine("HANDOFF", "B", A, "   "), /empty text/);
  assert.throws(() => formatLine("HANDOFF", "B", A), /empty text/);
  assert.throws(() => formatLine("DONE", "a b", A), /one address/);
  assert.equal(parseLine("Merge branch 'x'"), null);
  assert.equal(parseLine("SWEEP to:x from:y"), null, "only the typed set");
  const log = `aaa\t${T}\tGREEN to:orchestrator from:${B} #1 green\nbbb\t${T + 1}\tinitial commit\n`;
  assert.deepEqual(parseLog(log).map((e) => e.sha), ["aaa"]);
});

test("recipients: send refuses an undeliverable --to and names the accepted forms", () => {
  const ok = ["*", "#3099", "A", "B·O3", "C·W4·L12", "orchestrator", "merge-holder", "tools", "track-engine",
    "claude:session_01VUPaKEF34eo9fQAj79ugGP", "claude:session_f075b3d5a84821cfffa13bb7", "claude:cse_01VUPaKEF34eo9fQAj79ugGP",
    "codex:01a1558a-88d6-73d2-8904-13327d29f012", "codex:refactor-all-b71e", "codex:track-engine-8d41",
    "cursor:bc-b5cd51dd-5056-5709-aaf7-6a320ff4ffd9", "grok:fleet-bot-a1b2"];
  for (const to of ok) assert.equal(addressProblem(to), "", to);
  for (const to of ok) assert.equal(parseLine(formatLine("BLOCKED", to, A, BODY)).to, to);
  const refused = {
    "claude:1923dcd1d9ef874aad548d82": "claude:1923dcd1d9ef874aad548d82 is a claims-board hash, not a session id: no session receives it",
    "codex:75a8d0d2822ffc7d0c1393d0": "codex:75a8d0d2822ffc7d0c1393d0 is a claims-board hash, not a session id: no session receives it",
    "cursor:92332ab30177276994b63bc0": "cursor:92332ab30177276994b63bc0 is a claims-board hash, not a session id: no session receives it",
    "claude:session_short": "claude:session_short is not a claude session id",
    "#PR": "#PR is not an address", "#12a": "#12a is not an address", "a": "a is not an address", "AB": "AB is not an address",
    "random-role": "random-role is not an address", "codex:refactor-all": "codex:refactor-all is not a codex session id",
    "slack:abc-1234": "unknown host slack (claude, codex, cursor, grok)", "": "--to needs one address",
  };
  for (const [to, want] of Object.entries(refused)) {
    assert.equal(addressProblem(to), want, to);
    assert.throws(() => formatLine("BLOCKED", to, A, BODY), (e) => e.message.includes(ADDRESS_FORMS), to);
  }
  for (const r of ["orchestrator", "merge-holder", "tools", "track-engine"]) assert.ok(ROLES.includes(r), `${r} is used on the bus`);
});

test("recipients: every historical address still READS, even ones send now refuses", () => {
  for (const to of ["claude:1923dcd1d9ef874aad548d82", "#PR", "codex:75a8d0d2822ffc7d0c1393d0", "whatever"]) {
    assert.deepEqual(parseLine(`BLOCKED to:${to} from:codex:refactor-all-b71e C·O1 release?`),
      { type: "BLOCKED", to, from: "codex:refactor-all-b71e", text: "C·O1 release?" });
  }
});

test("send to #<PR> dispatches the mirror once; other addresses and a failed dispatch never fail the send", () => {
  const dir = path.join(ROOT, "artifacts", `fleet-bus-send-${process.pid}`);
  fs.rmSync(dir, { recursive: true, force: true });
  const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  try {
    fs.mkdirSync(dir, { recursive: true });
    g(dir, "init", "-q", "--bare", "origin.git");
    g(dir, "init", "-q", "h");
    const h = path.join(dir, "h");
    g(h, "remote", "add", "origin", path.join(dir, "origin.git"));
    const out = [];
    let calls = 0;
    const opts = (dispatch) => ({ cwd: h, log: (l) => out.push(l), dispatch, readyCheck: () => ({ ok: true }) });
    assert.equal(main(["send", "READY", "--to", "#7", "--as", A, "abc1234 ready-gate 0 green"], opts(() => { calls++; return "dispatched"; })), 0);
    assert.equal(calls, 1);
    assert.equal(out.at(-1), "= mirror dispatched", out.join("\n"));
    assert.equal(main(["send", "GREEN", "--to", "orchestrator", "--as", A, "#7 green"], opts(() => { calls++; return "x"; })), 0);
    assert.equal(calls, 1, "only to:#<PR> dispatches");
    assert.equal(main(["send", "READY", "--to", "#8", "--as", A, "abc1234 ready-gate 0 green"], opts(() => { throw new Error("no gh"); })), 0, "dispatch failure is not a send failure");
    assert.equal(out.at(-1), "= mirror not dispatched (no gh)");
    assert.equal(main(["send", "BLOCKED", "--to", "claude:1923dcd1d9ef874aad548d82", "--as", A, BODY], opts(() => { calls++; })), 1, "refused before any write");
    assert.deepEqual(readBus({ cwd: h, last: 10 }).entries.map((e) => e.to), ["#7", "orchestrator", "#8"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
  assert.equal(whoAmI({ CLAUDE_CODE_REMOTE_SESSION_ID: "cse_01Ab", CLAUDE_CODE_SESSION_ID: "s1" }), "claude:session_01Ab",
    "a cloud session signs with the id send_message takes");
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
    assert.equal(lost.reason, "held by claude:session_A for 59 more min");
    assert.equal(readLease({ cwd: HB }).holder, A);
    // A dead holder's lease lapses: B takes it after expiry.
    assert.equal(acquire(HB, B, T + DEFAULT_TTL_MIN * 60).ok, true, "lapsed: B takes it");
    assert.equal(readLease({ cwd: HA }).holder, B);
    // Bus: a cursor read returns only what came after it.
    const send = (cwd, line) => writeBus(() => ({ ok: true, line, lease: undefined }), { cwd });
    const cur = readBus({ cwd: HA }).tip;
    assert.equal(send(HA, formatLine("READY", "#7", A, "abc1234 ready-gate 0 green")).ok, true);
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

// ---- who <fleet letter> (fleet redesign §4B item 4, §8 multi-host) ----------
const ORCH19 = "ORCH19 LIVE session_01FLdmwWhj9BAeyKz5T8VQQN (replaces ORCH18 session_01MQVTPLSi3hPtVi3b29w3YH), Fleet A orchestrator. Game slot after green Pages on 4cb1d80d: Fleet A #3082, then Fleet B";

test("parseLive: the explicit `ORCH <letter> LIVE <host>:<id>` form, any host", () => {
  assert.deepEqual(parseLive({ from: A, text: "A·O20 ORCH A LIVE claude:session_01AAAAAAAAAAAAAAAAAAAAAA" }),
    { letter: "A", id: "claude:session_01AAAAAAAAAAAAAAAAAAAAAA" });
  assert.deepEqual(parseLive({ from: "codex:x", text: "ORCH C LIVE codex:codex-coord-6fa2, scope tools" }),
    { letter: "C", id: "codex:codex-coord-6fa2" });
  assert.deepEqual(parseLive({ from: B, text: "ORCH D LIVE bc-1234abcd" }), { letter: "D", id: "cursor:bc-1234abcd" });
  assert.deepEqual(parseLive({ from: A, text: "ORCH B LIVE cse_01BBBBBBBBBBBBBBBBBBBBBB" }),
    { letter: "B", id: "claude:session_01BBBBBBBBBBBBBBBBBBBBBB" }, "a cse_ id is the session_ id send_message takes");
});

test("parseLive: today's free text — the id right after LIVE, not the one it replaces", () => {
  assert.deepEqual(parseLive({ from: "claude:session_01FLdmwWhj9BAeyKz5T8VQQN", text: ORCH19 }),
    { letter: "A", id: "claude:session_01FLdmwWhj9BAeyKz5T8VQQN" });
  assert.deepEqual(parseLive({ from: A, text: "OrchB 7 LIVE session_01H8VtkpzfE5KwDeid2n46At succeeds OrchB 6 session_0162RfQfE67JM18KnjzEaM24 for Fleet B" }),
    { letter: "B", id: "claude:session_01H8VtkpzfE5KwDeid2n46At" });
});

test("parseLive: SEED/FLEET LIVE lines, a LIVE line with no fleet letter and a non-LIVE line name no orchestrator", () => {
  assert.equal(parseLive({ from: A, text: "SEED A LIVE session_01SEEDSEEDSEEDSEEDSEEDSE" }), null);
  assert.equal(parseLive({ from: A, text: "FLEET C LIVE codex:abc-1234 scope:tools orchestrator" }), null);
  assert.equal(parseLive({ from: A, text: "ORCH18 LIVE session_01MQVTPLSi3hPtVi3b29w3YH (replaces ORCH17)" }), null);
  assert.equal(parseLive({ from: A, text: "B·G1 garage design preview, Fleet A orchestrator approved" }), null);
});

test("whoIs: the NEWEST announcing line for that letter wins; none is null; whoLine is `<letter> <host:id> <sha7> <age>`", () => {
  const entries = [
    { sha: "1111111aaaa", at: T, from: A, text: "ORCH A LIVE claude:session_01OLDOLDOLDOLDOLDOLDOLDO" },
    { sha: "2222222bbbb", at: T + 10, from: A, text: "ORCH B LIVE claude:session_01BBBBBBBBBBBBBBBBBBBBBB" },
    { sha: "3333333cccc", at: T + 20, from: "claude:session_01FLdmwWhj9BAeyKz5T8VQQN", text: ORCH19 },
    { sha: "4444444dddd", at: T + 30, from: A, text: "#1 abc" },
  ];
  const a = whoIs(entries, "a");
  assert.equal(a.id, "claude:session_01FLdmwWhj9BAeyKz5T8VQQN");
  assert.equal(whoLine(a, T + 20 + 45 * 60), "A claude:session_01FLdmwWhj9BAeyKz5T8VQQN 3333333 45m");
  assert.equal(whoIs(entries, "B").sha, "2222222bbbb");
  assert.equal(whoIs(entries, "D"), null);
  assert.equal(ageOf(T, T + 3 * 3600), "3h");
  assert.equal(ageOf(T, T + 3 * 86400), "3d");
});

test("main who: prints one line for the fleet's newest LIVE line, exits 1 for a fleet with no LIVE line", () => {
  const dir = path.join(ROOT, "artifacts", `fleet-bus-who-${process.pid}`);
  fs.rmSync(dir, { recursive: true, force: true });
  const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  try {
    fs.mkdirSync(dir, { recursive: true });
    g(dir, "init", "-q", "--bare", "origin.git");
    g(dir, "init", "-q", "h");
    const h = path.join(dir, "h");
    g(h, "remote", "add", "origin", path.join(dir, "origin.git"));
    const out = [];
    const opts = { cwd: h, log: (l) => out.push(l), dispatch: () => "x", now: () => T + 600 };
    assert.equal(main(["send", "HANDOFF", "--to", "*", "--as", A, "A·O1 ORCH A LIVE claude:session_01AAAAAAAAAAAAAAAAAAAAAA"], opts), 0);
    assert.equal(main(["send", "GREEN", "--to", "A", "--as", A, "#7 green"], opts), 0);
    assert.equal(main(["who", "A"], opts), 0);
    { const [l, id, sha, age, ...rest] = out.at(-1).split(" "); assert.deepEqual([l, id, sha.length, rest.length], ["A", "claude:session_01AAAAAAAAAAAAAAAAAAAAAA", 7, 0]); assert.ok("mhd".includes(age.slice(-1)) && Number(age.slice(0, -1)) >= 0, age); }
    assert.equal(main(["who", "C"], opts), 1);
    assert.ok(out.at(-1).startsWith("= who C: no ORCH C LIVE line"), out.at(-1));
    assert.equal(main(["who", "AB"], opts), 1, "one letter only");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("send READY needs a passing ready-gate receipt for the PR (and the head it names); unknown types say what to use", async () => {
  const { writeReceipt } = await import("../../tools/lib/gate-receipt.mjs");
  const dir = path.join(ROOT, "artifacts", `fleet-bus-ready-${process.pid}`);
  fs.rmSync(dir, { recursive: true, force: true });
  const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  try {
    fs.mkdirSync(dir, { recursive: true });
    g(dir, "init", "-q", "--bare", "origin.git");
    g(dir, "init", "-q", "h");
    const h = path.join(dir, "h");
    g(h, "remote", "add", "origin", path.join(dir, "origin.git"));
    const out = [];
    const opts = { cwd: h, log: (l) => out.push(l), dispatch: () => "x" };
    assert.equal(main(["send", "READY", "--to", "orchestrator", "--as", A, "#41 abc1234 ready-gate 0"], opts), 2, "no receipt");
    assert.ok(out.at(-1).includes("REFUSED: no ready-gate receipt for #41"), out.at(-1));
    writeReceipt(h, "ready", { pr: 41, head: "abc1234def", ok: false, evidence: "plan-open: 1 open item" }, { main: null });
    assert.equal(main(["send", "READY", "--to", "orchestrator", "--as", A, "#41 abc1234 ready-gate 0"], opts), 2, "a refused gate");
    assert.ok(out.at(-1).includes("refused (plan-open"), out.at(-1));
    writeReceipt(h, "ready", { pr: 41, head: "abc1234def", ok: true }, { main: null });
    assert.equal(main(["send", "READY", "--to", "orchestrator", "--as", A, "#41 fedcba9 ready-gate 0"], opts), 2, "another head");
    assert.ok(out.at(-1).includes("ready-gate passed on abc1234def"), out.at(-1));
    assert.equal(main(["send", "READY", "--to", "orchestrator", "--as", A, "ready-gate 0"], opts), 2, "no PR named");
    assert.equal(main(["send", "READY", "--to", "orchestrator", "--as", A, "#41 abc1234 ready-gate 0"], opts), 0);
    assert.equal(main(["send", "READY", "--to", "#41", "--as", A, "abc1234 ready-gate 0 green"], opts), 0, "the PR may be the address");
    const errs = [];
    const orig = console.error; console.error = (l) => errs.push(l);
    try { assert.equal(main(["send", "LIVE", "--to", "*", "--as", A, "ORCH A LIVE"], opts), 1); } finally { console.error = orig; }
    assert.ok(errs.join("\n").includes("READY / BLOCKED / DONE"));
    assert.ok(errs.join("\n").includes("ORCH <X> LIVE"));
    assert.throws(() => formatLine("LIVE", "*", A, "x"), /READY \/ BLOCKED \/ DONE/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- typed schema, idempotency, strict cursor (system audit lane X1, 2026-10-26) ----------

test("schema: the new peer and lending types send and parse; every old type still parses", () => {
  for (const t of ["INFO", "QUESTION", "REQUEST", "ROTATE", "LEND", "RETURN", "TRANSFER", "READY", "GREEN", "BLOCKED", "HANDOFF", "DONE", "INCIDENT", "LEASE", "GAME-SLOT"]) {
    assert.ok(TYPES.includes(t), t);
    assert.equal(parseLine(`${t} to:* from:${A} some body text that is long enough merger:B`).type, t);
  }
  assert.equal(parseLine(formatLine("INFO", "B", A, "hi")).text, "hi", "peer types take any non-empty body");
  assert.equal(parseLine(formatLine("ROTATE", "*", A, "ORCH B LIVE claude:session_01BBBBBBBBBBBBBBBBBBBBBB")).type, "ROTATE");
  assert.equal(whoIs([{ sha: "1", at: T, from: A, ...parseLine(formatLine("ROTATE", "*", A, "ORCH B LIVE claude:session_01BBBBBBBBBBBBBBBBBBBBBB")) }], "B").id,
    "claude:session_01BBBBBBBBBBBBBBBBBBBBBB", "who reads a ROTATE announcement like a HANDOFF one");
});

test("schema: protocol bodies are BODY_MIN..BODY_MAX chars after whitespace collapse; LEND names merger:<letter>", () => {
  assert.deepEqual(PROTOCOL_TYPES, ["HANDOFF", "READY", "DONE", "BLOCKED", "LEND"]);
  const exact = "x".repeat(BODY_MIN), over = "y".repeat(BODY_MAX + 1);
  for (const t of ["HANDOFF", "READY", "DONE", "BLOCKED"]) {
    assert.equal(bodyProblem(t, exact), "", t);
    assert.match(bodyProblem(t, exact.slice(1)), /19 chars.*20-600/, t);
    assert.match(bodyProblem(t, over), /601 chars/, t);
    assert.throws(() => formatLine(t, "*", A, "#1 merged"), /20-600/, t);
  }
  assert.equal(bodyProblem("GREEN", "#1 ok"), "", "non-protocol types keep short bodies");
  assert.equal(bodyProblem("GAME-SLOT", "#3076 a06b99a1"), "");
  assert.equal(formatLine("DONE", "*", A, "  #3790   merged\n abc1234 two parents "), `DONE to:* from:${A} #3790 merged abc1234 two parents`);
  assert.match(bodyProblem("LEND", "#3790 abc1234 lent for the merge"), /merger:<letter>/);
  assert.equal(bodyProblem("LEND", "#3790 abc1234 lent for the merge merger:A"), "");
  assert.equal(lendMerger("#1 abc merger:C, until Pages"), "C");
  assert.equal(lendMerger("#1 abc merger:CD"), null, "one letter");
  assert.equal(lendMerger("#1 abc nomerger:C"), null, "a whole token");
});

test("idempotency: --idem appends one marker; findIdem matches the same sender and key only", () => {
  const line = formatLine("DONE", "*", A, BODY, { idem: "done-2990" });
  assert.ok(line.endsWith(` ${idemMarker("done-2990")}`), line);
  assert.equal(idemOf(parseLine(line).text), "done-2990");
  assert.equal(idemOf("[idem:k] then more"), null, "only a trailing marker counts");
  assert.throws(() => formatLine("DONE", "*", A, BODY, { idem: "has space" }), /--idem key/);
  assert.throws(() => formatLine("DONE", "*", A, BODY, { idem: "-lead" }), /--idem key/);
  const e = (from, text, sha) => ({ from, text, sha });
  const entries = [e(A, `x ${idemMarker("k")}`, "1"), e(B, `y ${idemMarker("k")}`, "2"), e(A, `z ${idemMarker("k")}`, "3")];
  assert.equal(findIdem(entries, A, "k").sha, "3", "newest wins");
  assert.equal(findIdem(entries, B, "k").sha, "2", "keys are per sender");
  assert.equal(findIdem(entries, A, "other"), null);
  assert.equal(findIdem(entries, A, ""), null);
});

test("strictCursor: tip when nothing hidden; else just before the first hidden line; unchanged when the first is hidden", () => {
  const es = [{ sha: "s1", to: "B" }, { sha: "s2", to: "#9" }, { sha: "s3", to: "B" }];
  assert.equal(strictCursor(es, [], "tip"), "tip");
  assert.equal(strictCursor(es, ["B", "#9"], "tip"), "tip");
  assert.equal(strictCursor(es, ["B"], "tip"), "s1");
  assert.equal(strictCursor(es, ["#9"], "tip"), "");
  assert.equal(strictCursor([], ["B"], "tip"), "tip");
});

test("against real git: an --idem resend writes nothing; read --strict keeps a hidden line for the next wider read", () => {
  const dir = path.join(ROOT, "artifacts", `fleet-bus-idem-${process.pid}`);
  fs.rmSync(dir, { recursive: true, force: true });
  const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const prevAs = process.env.APEX_FLEET_AS;
  try {
    fs.mkdirSync(dir, { recursive: true });
    g(dir, "init", "-q", "--bare", "origin.git");
    g(dir, "init", "-q", "h");
    const h = path.join(dir, "h");
    g(h, "remote", "add", "origin", path.join(dir, "origin.git"));
    const out = [];
    const opts = { cwd: h, log: (l) => out.push(l), dispatch: () => "x" };
    assert.equal(main(["send", "LEND", "--to", "A", "--as", A, "--idem", "lend-3790", "#3790 abc1234 lent merger:A"], opts), 0);
    const first = readBus({ cwd: h, last: 10 }).entries;
    assert.equal(main(["send", "LEND", "--to", "A", "--as", A, "--idem", "lend-3790", "#3790 abc1234 lent merger:A"], opts), 0, "a resend is ok");
    assert.ok(out.at(-1).startsWith("= deduped: idem lend-3790 already sent as"), out.at(-1));
    assert.equal(readBus({ cwd: h, last: 10 }).entries.length, first.length, "nothing written");
    assert.equal(main(["send", "LEND", "--to", "A", "--as", B, "--idem", "lend-3790", "#3790 abc1234 lent merger:A"], opts), 0);
    assert.equal(readBus({ cwd: h, last: 10 }).entries.length, first.length + 1, "another sender's key is its own");
    assert.equal(sendBusLine("INFO", "B", A, "no key, no dedupe", { cwd: h }).ok, true);
    assert.equal(sendBusLine("INFO", "B", A, "no key, no dedupe", { cwd: h }).ok, true);
    assert.equal(readBus({ cwd: h, last: 10 }).entries.length, first.length + 3);
    assert.equal(main(["send", "LEND", "--to", "A", "--as", A, "#3790 abc1234 lent to A"], opts), 1, "LEND without merger: refused");

    // strict: a reader on B whose filter hides a #9 line in the middle.
    process.env.APEX_FLEET_AS = "claude:session_01STRICTSTRICTSTRICTSTRI";
    const R = process.env.APEX_FLEET_AS;
    const cur = path.join(ROOT, "artifacts", "fleet-bus", `cursor-${R.replace(/[^\w.-]+/g, "_")}.txt`);
    fs.rmSync(cur, { force: true });
    const tip0 = readBus({ cwd: h, last: 1 }).tip;
    fs.mkdirSync(path.dirname(cur), { recursive: true });
    fs.writeFileSync(cur, tip0 + "\n");
    for (const [to, t] of [["B", "one for B"], ["#9", "one for nine"], ["B", "two for B"]]) assert.equal(sendBusLine("INFO", to, A, t, { cwd: h }).ok, true);
    out.length = 0;
    assert.equal(main(["read", "--to", "B", "--strict"], opts), 0);
    assert.deepEqual(out.filter((l) => !l.startsWith("=")).map((l) => l.split(" ").slice(-3).join(" ")), ["one for B", "two for B"]);
    assert.match(out.at(-1), /1 hidden by --to.*strict: held at/);
    out.length = 0;
    assert.equal(main(["read"], opts), 0, "a wider read still sees the hidden line");
    assert.deepEqual(out.filter((l) => !l.startsWith("=")).map((l) => l.split(" ").slice(-3).join(" ")), ["one for nine", "two for B"],
      "at-least-once: the line after the hidden one comes again");
    assert.equal(main(["read", "--peek", "--strict"], opts), 1, "exclusive flags");
    fs.rmSync(cur, { force: true });
  } finally {
    if (prevAs === undefined) delete process.env.APEX_FLEET_AS; else process.env.APEX_FLEET_AS = prevAs;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
