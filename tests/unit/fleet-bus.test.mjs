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
  addressProblem, ADDRESS_FORMS, ROLES, main, parseLive, whoIs, whoLine, ageOf, whoStatus, STALE_MIN,
  TYPES, PROTOCOL_TYPES, BODY_MIN, BODY_MAX, bodyProblem, lendMerger, idemOf, idemMarker, findIdem, strictCursor, sendBusLine,
  fixMarker, fixOf, openFixIncident, handoffMisuse, autoIdem, AUTO_IDEM_TYPES, watchShows, watchStep, watchBus, WATCH_QUIET,
  TYPE_ALIASES, resolveType, identityHint, asVerdict, incidentOf, foldIncidents, incidentLedger, GAME_PATH_RE, shaOf, prOfLine,
  slotOf, doneIsGame, gameSlotState, tipDrift, DEPLOY_BRANCH,
} from "../../tools/ci/fleet-bus.mjs";
import { GAME_PATH } from "../../tools/ci/merge-gate.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const T = 1_800_000_000;
const A = "claude:session_A", B = "cursor:bc-B";
/** A protocol body long enough for HANDOFF/READY/DONE/BLOCKED/LEND (BODY_MIN chars). */
const BODY = "#2990 abc1234 blocked on review";
/** main() with no session env (so `--as` is this test's to choose), no deploy-tip fetch and no stderr notes. */
const QUIET = { env: {}, drift: () => "", err: () => {} };
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
    "cursor:bc-b5cd51dd-5056-5709-aaf7-6a320ff4ffd9", "grok:fleet-bot-a1b2", "grok:DAD"];
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
    const opts = (dispatch) => ({ ...QUIET, cwd: h, log: (l) => out.push(l), dispatch, readyCheck: () => ({ ok: true }) });
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

// ---- who <fleet letter> (fleet redesign §4B item 4; audit4 BH1/G9: the SENDER, never a body token) ----------
const OA = "claude:session_01AAAAAAAAAAAAAAAAAAAAAA", OB = "claude:session_01BBBBBBBBBBBBBBBBBBBBBB", OF = "claude:session_01FLdmwWhj9BAeyKz5T8VQQN";
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

test("parseLive: `ORCH A LIVE is now <id>` names the id, not the word `is` (bus 1a2624d, 2026-10-26)", () => {
  const id = "claude:session_011zeXy762dGneXyJtqucZrF";
  assert.deepEqual(parseLive({ from: id, text: `ORCH A LIVE is now ${id} (OrchA 36 is gone). Lanes stay draft.` }), { letter: "A", id });
  assert.deepEqual(parseLive({ from: id, text: `ORCH A LIVE ${id}.` }), { letter: "A", id });
  assert.equal(parseLive({ from: id, text: "ORCH A LIVE soon, waiting on Bryce" }), null, "no id-shaped token: not an announcement");
});

test("parseLive: SEED/FLEET LIVE lines, a LIVE line with no fleet letter and a non-LIVE line name no orchestrator", () => {
  assert.equal(parseLive({ from: A, text: "SEED A LIVE session_01SEEDSEEDSEEDSEEDSEEDSE" }), null);
  assert.equal(parseLive({ from: A, text: "FLEET C LIVE codex:abc-1234 scope:tools orchestrator" }), null);
  assert.equal(parseLive({ from: A, text: "ORCH18 LIVE session_01MQVTPLSi3hPtVi3b29w3YH (replaces ORCH17)" }), null);
  assert.equal(parseLive({ from: A, text: "B·G1 garage design preview, Fleet A orchestrator approved" }), null);
});

test("whoIs: the NEWEST announcing line for that letter wins; none is null; whoLine is `<letter> <host:id> <sha7> <age>`", () => {
  const entries = [
    { sha: "1111111aaaa", at: T, type: "ROTATE", from: A, text: "ORCH A LIVE claude:session_01OLDOLDOLDOLDOLDOLDOLDO" },
    { sha: "2222222bbbb", at: T + 10, type: "ROTATE", from: A, text: "ORCH B LIVE claude:session_01BBBBBBBBBBBBBBBBBBBBBB" },
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

test("whoIs: a peer that only QUOTES an announcement names no orchestrator; ROTATE or self does (bus adb3d55, 2026-10-26)", () => {
  const quote = { sha: "5555555eeee", at: T, type: "INFO", from: A,
    text: "please post once: node tools/ci/fleet-bus.mjs send ROTATE --to '*' 'ORCH D LIVE grok:DAD (Fleet D orchestrator)'" };
  assert.deepEqual(parseLive(quote), { letter: "D", id: "grok:DAD" }, "a short host-prefixed id parses, without the quote");
  assert.equal(whoIs([quote], "D"), null, "an INFO from someone else is not an announcement");
  assert.equal(whoIs([{ ...quote, type: "ROTATE" }], "D").id, "grok:DAD", "a ROTATE may name a successor");
  assert.equal(whoIs([{ ...quote, from: "grok:DAD" }], "D").id, "grok:DAD", "the sender announcing itself counts");
  assert.equal(whoIs([{ ...quote, type: "HANDOFF", from: "cse_01ZZZZZZZZZZZZZZZZZZZZZZ",
    text: "ORCH E LIVE claude:session_01ZZZZZZZZZZZZZZZZZZZZZZ" }], "E").id, "claude:session_01ZZZZZZZZZZZZZZZZZZZZZZ", "cse_ = session_");
});

test("whoStatus: liveness is the age of the orchestrator's OWN newest line, not its LIVE line; STALE past the threshold", () => {
  const O = "claude:session_01OOOOOOOOOOOOOOOOOOOOOO";
  const entries = [
    { sha: "1111111aaaa", at: T, from: O, text: "INFO last words before the archive" },
    { sha: "2222222bbbb", at: T + 6 * 60, type: "ROTATE", from: A, text: `ORCH A LIVE ${O}` },
    { sha: "3333333cccc", at: T + 20 * 60, from: B, text: "#9 peer chatter keeps the bus busy" },
  ];
  // OrchA 36 (2026-10-26): announced by a peer at T+6m, silent since T; at T+53m `who` used to say "47m", live.
  const s = whoStatus(entries, "A", T + 53 * 60);
  assert.deepEqual([s.id, s.lastSeenAt, s.lastSeenMin, s.stale], [O, T, 53, true]);
  assert.equal(whoLine(s, T + 53 * 60), `A ${O} 2222222 47m STALE (last line 53m ago)`);
  assert.equal(STALE_MIN, 45);
  assert.equal(whoStatus(entries, "A", T + 53 * 60, 60).stale, false, "--stale-min moves the threshold");
  assert.equal(whoStatus(entries, "A", T + 45 * 60).stale, false, "exactly the threshold is still live");
  // A bare cse_ sender id is the same session as its claude:session_ form.
  const fresh = entries.concat({ sha: "4444444dddd", at: T + 50 * 60, from: "cse_01OOOOOOOOOOOOOOOOOOOOOO", text: "INFO still here" });
  const f = whoStatus(fresh, "A", T + 53 * 60);
  assert.deepEqual([f.lastSeenMin, f.stale], [3, false]);
  assert.equal(whoLine(f, T + 53 * 60), `A ${O} 2222222 47m`);
  // An orchestrator with no line of its own in the window falls back to its LIVE line's time.
  assert.equal(whoStatus(entries.slice(1), "A", T + 53 * 60).lastSeenAt, T + 6 * 60);
  assert.equal(whoStatus(entries, "C", T), null);
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
    // Commits carry the wall clock, so `now` must too (a fixed T would make every line months old: STALE).
    const NOW = Math.floor(Date.now() / 1000) + 600;
    // `--as` is this session's own id unless APEX_FLEET_AS is a fleet letter (audit4 A2 G10): the test speaks as fleet A
    const opts = { ...QUIET, env: { APEX_FLEET_AS: "A" }, cwd: h, log: (l) => out.push(l), dispatch: () => "x", now: () => NOW };
    assert.equal(main(["send", "ROTATE", "--to", "*", "--as", A, "A·O1 ORCH A LIVE claude:session_01AAAAAAAAAAAAAAAAAAAAAA"], opts), 0);
    assert.equal(main(["send", "GREEN", "--to", "A", "--as", A, "#7 green"], opts), 0);
    assert.equal(main(["who", "A"], opts), 0);
    { const [l, id, sha, age, ...rest] = out.at(-1).split(" "); assert.deepEqual([l, id, sha.length, rest.length], ["A", "claude:session_01AAAAAAAAAAAAAAAAAAAAAA", 7, 0]); assert.ok("mhd".includes(age.slice(-1)) && Number(age.slice(0, -1)) >= 0, age); }
    assert.equal(main(["who", "C"], opts), 1);
    assert.ok(out.at(-1).startsWith("= who C: no ORCH C LIVE line"), out.at(-1));
    assert.equal(main(["who", "AB"], opts), 1, "one letter only");
    assert.equal(main(["who", "C", "--json"], opts), 1);
    assert.deepEqual(JSON.parse(out.at(-1)), { letter: "C", id: null });
    // Live: the announced id never wrote, so the LIVE line (~10 min old) is its last sign of life.
    assert.equal(main(["who", "A", "--json"], opts), 0);
    { const j = JSON.parse(out.at(-1)); assert.deepEqual(Object.keys(j), ["letter", "id", "sha", "at", "age", "stale", "lastSeenMin"]); assert.equal(j.stale, false); }
    assert.equal(main(["who", "A", "--stale-min", "5"], opts), 3, "silent past --stale-min: exit 3");
    { const [l, id, , , tag, ...rest] = out.at(-1).split(" "); assert.deepEqual([l, id, tag, rest.slice(0, 2), rest.at(-1)], ["A", "claude:session_01AAAAAAAAAAAAAAAAAAAAAA", "STALE", ["(last", "line"], "ago)"]); }
    const later = { ...opts, now: () => NOW + 2 * 3600 };
    assert.equal(main(["who", "A", "--json"], later), 3, "default 45 min threshold");
    { const j = JSON.parse(out.at(-1)); assert.equal(j.stale, true); assert.ok(j.lastSeenMin >= 120, String(j.lastSeenMin)); }
    assert.equal(main(["who", "A", "--stale-min", "0"], opts), 1, "--stale-min must be positive");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("send READY needs a passing ready-gate receipt for the PR (and the head it names); unknown types say what to use", async () => {
  const { writeReceipt, readyClaimVerdict } = await import("../../tools/lib/gate-receipt.mjs");
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
    // The gate-file closure check (A1) refuses in any tree with an uncommitted gate edit; this test pins the receipt rows.
    const readyCheck = (root, a) => readyClaimVerdict(root, { ...a, files: () => ({ ok: true }) });
    const opts = { ...QUIET, cwd: h, log: (l) => out.push(l), dispatch: () => "x", readyCheck };
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
    try { assert.equal(main(["send", "PING", "--to", "*", "--as", A, "ORCH A LIVE"], opts), 1); } finally { console.error = orig; }
    assert.ok(errs.join("\n").includes("READY / BLOCKED / DONE"));
    assert.ok(errs.join("\n").includes("ORCH <X> LIVE"));
    assert.throws(() => formatLine("LIVE", "*", A, "x"), /READY \/ BLOCKED \/ DONE/, "formatLine stays strict: the alias is resolved at send");
    // audit4 BH3/C4: `send LIVE` is never refused; it is stored as INFO with the word kept and a one-line hint.
    out.length = 0;
    assert.equal(main(["send", "LIVE", "--to", "D", "--as", A, "D·W33 on #3828, tooling-fast green"], opts), 0);
    assert.equal(out[0], TYPE_ALIASES.LIVE.hint);
    assert.deepEqual(readBus({ cwd: h, last: 1 }).entries.map((e) => [e.type, e.text]), [["INFO", "LIVE D·W33 on #3828, tooling-fast green"]]);
    assert.equal(main(["send", "LIVE", "--to", "D", "--as", A, "LIVE D·W34 idle"], opts), 0);
    assert.equal(readBus({ cwd: h, last: 1 }).entries[0].text, "LIVE D·W34 idle", "the word is not doubled");
    assert.equal(main(["send", "LIVE", "--to", "D", "--as", A], opts), 1, "an empty LIVE is still an empty line");
    assert.deepEqual(resolveType("READY"), { type: "READY", hint: "", prefix: "" });
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
  assert.equal(whoIs([{ sha: "1", at: T, ...parseLine(formatLine("ROTATE", "*", OB, `ORCH B LIVE ${OB} (replaces …)`)) }], "B").id,
    OB, "who reads a ROTATE announcement's sender");
});

test("schema: protocol bodies are BODY_MIN..BODY_MAX chars after whitespace collapse; LEND names merger:<letter>", () => {
  assert.deepEqual(PROTOCOL_TYPES, ["HANDOFF", "READY", "DONE", "BLOCKED", "LEND"]);
  const exact = "x".repeat(BODY_MIN), over = "y".repeat(BODY_MAX + 1);
  for (const t of ["HANDOFF", "READY", "DONE", "BLOCKED"]) {
    assert.equal(bodyProblem(t, exact), "", t);
    assert.ok(/19 chars.*20-600/.test(bodyProblem(t, exact.slice(1))), t);
    assert.ok(/601 chars/.test(bodyProblem(t, over)), t);
    assert.throws(() => formatLine(t, "*", A, "#1 merged"), /20-600/, t);
  }
  assert.equal(bodyProblem("GREEN", "#1 ok"), "", "non-protocol types keep short bodies");
  assert.equal(bodyProblem("GAME-SLOT", "#3076 a06b99a1"), "");
  assert.equal(formatLine("DONE", "*", A, "  #3790   merged\n abc1234 two parents "), `DONE to:* from:${A} #3790 merged abc1234 two parents`);
  assert.ok(/merger:<letter>/.test(bodyProblem("LEND", "#3790 abc1234 lent for the merge")), bodyProblem("LEND", "#3790 abc1234 lent for the merge"));
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
    const opts = { ...QUIET, get env() { return { APEX_FLEET_AS: process.env.APEX_FLEET_AS }; }, cwd: h, log: (l) => out.push(l), dispatch: () => "x" };
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
    assert.ok(/1 hidden by --to.*strict: held at/.test(out.at(-1)), out.at(-1));
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

test("Q3: an empty body is refused; --pr is --to '#<n>'", () => {
  assert.throws(() => formatLine("DONE", "*", A, "   "), /empty text/);
  assert.throws(() => formatLine("DONE", "*", A), /empty text/);
  // protocol bodies are BODY_MIN..BODY_MAX chars (schema lane X1), so the --pr probe uses one
  assert.equal(parseLine(formatLine("DONE", "#7", A, BODY)).to, "#7");
  const errs = [];
  const orig = console.error; console.error = (l) => errs.push(l);
  try {
    assert.equal(main(["send", "DONE", "--as", A, BODY], { ...QUIET, log() {} }), 1, "no --to and no --pr");
    assert.equal(main(["send", "DONE", "--pr", "abc", "--as", A, BODY], { ...QUIET, log() {} }), 1, "bad --pr");
    assert.equal(main(["send", "DONE", "--to", "*", "--as", A, "--fix", "abc1234", BODY], { ...QUIET, log() {} }), 1, "--fix only on INCIDENT");
    assert.equal(main(["send", "INCIDENT", "--to", "*", "--as", A, "--fix", "zz", "x"], { ...QUIET, log() {} }), 1, "--fix needs a sha");
  } finally { console.error = orig; }
  assert.ok(errs.some((e) => e.includes("--pr <n>")), errs.join("|"));
});

test("Q4: INCIDENT --fix marks the freeze; openFixIncident reads the newest open one", () => {
  const sha = "abcdef1234567";
  assert.equal(fixOf(`pages red ${fixMarker(sha)}`), sha);
  assert.equal(fixOf("no marker"), null);
  const e = (type, text, at) => ({ type, text, at, from: A, to: "*" });
  assert.equal(openFixIncident([]), null);
  assert.equal(openFixIncident([e("INCIDENT", `red ${fixMarker(sha)}`, 1)]).sha, sha);
  assert.equal(openFixIncident([e("INCIDENT", `red ${fixMarker(sha)}`, 1), e("INCIDENT", "lifted by hand", 2)]), null);
  assert.equal(openFixIncident([e("INCIDENT", `red ${fixMarker(sha)}`, 1), e("INCIDENT", "second, manual", 2)]), null, "an unmarked newer incident is a manual freeze");
});

// ---- second-pass audit (W3, 2026-10-26): HANDOFF typing, automatic DONE/READY keys, watch -------------------------

test("HANDOFF typing: ORCH LIVE, seed/heartbeat chatter, lends and returns are refused with the type to use", () => {
  const cases = {
    "ORCH B LIVE claude:session_01BBBBBBBBBBBBBBBBBBBBBB (replaces session_01OLD)": "ROTATE",
    "ORCH B·O3 LIVE (replaces B·O2)": "ROTATE",
    "ORCH B LIVE again (Bryce typed: fix deploy asap + spawn sessions)": "ROTATE",
    "SEED D LIVE session_01SEEDSEEDSEEDSEEDSEEDSE": "INFO",
    "HB D LIVE cursor:bc-1234abcd 14:00Z all quiet": "INFO",
    "[INFO] scenery-locations.json is regenerated by deploy": "INFO",
    "[QUESTION] does #3790 need a GAME-SLOT first?": "QUESTION",
    "#3790 abc1234 lent to A for the merge, D is busy": "LEND",
    "#3790 abc1234 merger:A after green Pages": "LEND",
    "lend #3790 to B: D is busy": "LEND",
    "#3700 def5678 returned to D after the sync": "RETURN",
    "RETURN #3700 def5678 to fleet D now": "RETURN",
  };
  for (const [body, type] of Object.entries(cases)) {
    assert.equal(handoffMisuse(body)?.type, type, body);
    assert.throws(() => formatLine("HANDOFF", "*", A, body), new RegExp(`send ${type} instead`), body);
  }
  // audit4 BH3 / verify-11-20 #14: anchored. A quoted ORCH LIVE, a mid-sentence "lent", a SPAWN line and an old
  // free-text LIVE pass as hand-offs; a LIVE status body is the alias's job (send LIVE), not a refusal.
  for (const body of ["B·W3 at 210k: successor owns #3790 abc1234, next = re-run ready-gate", "#3764 285c00d re-sync after #3768 then ready-gate",
    "A·O1 ORCH A LIVE claude:session_01AAAAAAAAAAAAAAAAAAAAAA", "OrchB 7 LIVE session_01H8VtkpzfE5KwDeid2n46At for Fleet B",
    "SEED B SPAWNED session_01CHILDCHILDCHILDCHILDCH", "SPAWN B·W7 for #3790 merger:A after the sync", "LIVE D·W33 #3828 cf49dde tooling-fast green",
    "#3725 successor: the PR was lent to A on 10-25, finish the Plan", "context cap: hand #3700 to the next worker (ORCH B LIVE knows)"]) {
    assert.equal(handoffMisuse(body), null, body);
    assert.equal(parseLine(formatLine("HANDOFF", "B", A, body)).type, "HANDOFF");
  }
  assert.equal(parseLine(formatLine("ROTATE", "*", A, "ORCH B LIVE claude:session_01BBBBBBBBBBBBBBBBBBBBBB")).type, "ROTATE", "the right type passes");
  assert.equal(parseLine("HANDOFF to:* from:x ORCH B LIVE claude:session_01OLD").type, "HANDOFF", "old lines still parse");
});

test("autoIdem: DONE/READY get <TYPE>-<pr>-<sha7> from the address or body; no PR or sha, or another type, gets none", () => {
  assert.deepEqual(AUTO_IDEM_TYPES, ["DONE", "READY"]);
  assert.equal(autoIdem("DONE", "*", "#3790 1a2b3c4d5e6f merged, two parents"), "DONE-3790-1a2b3c4");
  assert.equal(autoIdem("READY", "#3576", "abc1234def ready-gate 0 green"), "READY-3576-abc1234");
  assert.equal(autoIdem("READY", "orchestrator", "#41 ABC1234 ready-gate 0"), "", "a sha is lowercase hex");
  assert.equal(autoIdem("DONE", "*", "#3790 merged in run 40322290836"), "", "a run id is digits only: not a sha");
  assert.equal(autoIdem("DONE", "*", "#3790 merged, the defaced branch"), "", "a hex-letter word is not a sha");
  assert.equal(autoIdem("DONE", "*", "abc1234 merged with no PR named"), "");
  assert.equal(autoIdem("BLOCKED", "*", "#3790 abc1234 blocked"), "");
});

const bareBus = (tag) => {
  const dir = path.join(ROOT, "artifacts", `fleet-bus-${tag}-${process.pid}`);
  fs.rmSync(dir, { recursive: true, force: true });
  const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  fs.mkdirSync(dir, { recursive: true });
  g(dir, "init", "-q", "--bare", "origin.git");
  g(dir, "init", "-q", "h");
  const h = path.join(dir, "h");
  g(h, "remote", "add", "origin", path.join(dir, "origin.git"));
  return { dir, h };
};

test("against real git: a DONE resend dedupes without --idem, across senders; READY dedupes per sender and per sha", () => {
  const { dir, h } = bareBus("autoidem");
  try {
    const n = () => readBus({ cwd: h, last: 50 }).entries.length;
    assert.equal(sendBusLine("DONE", "*", A, "#3761 1a2b3c4d merged, two parents", { cwd: h }).ok, true);
    const last = readBus({ cwd: h, last: 1 }).entries[0].text;
    assert.ok(last.endsWith("[idem:DONE-3761-1a2b3c4]"), last);
    const out = [];
    assert.equal(sendBusLine("DONE", "*", B, "#3761 1a2b3c4d5e merge commit (parents a b) by x", { cwd: h, log: (l) => out.push(l) }).ok, true);
    assert.equal(n(), 1, "the merge hook's DONE after the orchestrator's is the same fact");
    assert.ok(out[0].startsWith("= deduped: idem DONE-3761-1a2b3c4"), out[0]);
    assert.equal(sendBusLine("READY", "orchestrator", A, "#3576 abc1234 ready-gate 0", { cwd: h }).ok, true);
    assert.equal(sendBusLine("READY", "orchestrator", A, "#3576 abc1234 ready-gate 0 (again)", { cwd: h }).ok, true);
    assert.equal(n(), 2, "a re-READY of the same head is one line");
    assert.equal(sendBusLine("READY", "orchestrator", B, "#3576 abc1234 ready-gate 0", { cwd: h }).ok, true);
    assert.equal(sendBusLine("READY", "orchestrator", A, "#3576 fedcba9 ready-gate 0 after a sync", { cwd: h }).ok, true);
    assert.equal(n(), 4, "another sender, or a new head, is a new READY");
    assert.equal(sendBusLine("DONE", "*", A, "#3762 1a2b3c4d merged xx", { cwd: h, idem: "mine-1" }).ok, true);
    assert.equal(sendBusLine("DONE", "*", B, "#3762 1a2b3c4d merged xx", { cwd: h, idem: "mine-1" }).ok, true);
    assert.equal(n(), 6, "an explicit --idem stays per sender");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("watchShows / watchStep: --to filter like read; other senders' to:* train chatter dropped unless --all; each sha once", () => {
  const e = (sha, type, to, from = B) => ({ sha, at: T, type, to, from, text: "x" });
  assert.deepEqual(WATCH_QUIET, ["GAME-SLOT", "DONE", "GREEN", "LEASE"]);
  assert.equal(watchShows(e("1", "GAME-SLOT", "*"), ["B", "*"]), false);
  assert.equal(watchShows(e("1", "GAME-SLOT", "*"), ["B", "*"], { all: true }), true);
  assert.equal(watchShows(e("1", "DONE", "*", A), ["B"], { me: A }), true, "my own broadcast stays");
  assert.equal(watchShows(e("1", "DONE", "B"), ["B"]), true, "a DONE addressed to the fleet stays");
  assert.equal(watchShows(e("1", "READY", "*"), ["B"]), true);
  assert.equal(watchShows(e("1", "READY", "A"), ["B"]), false, "another fleet's inbox");
  assert.equal(watchShows(e("1", "INCIDENT", "*"), []), true);
  const f = (x) => watchShows(x, ["B"]);
  let r = watchStep({ cursor: "t0", seen: [] }, { tip: "t2", entries: [e("s1", "READY", "B"), e("s2", "GAME-SLOT", "*")] }, f);
  assert.deepEqual(r.show.map((x) => x.sha), ["s1"]);
  assert.equal(r.state.cursor, "t2");
  r = watchStep(r.state, { tip: "t3", entries: [e("s1", "READY", "B"), e("s3", "BLOCKED", "B")] }, f);
  assert.deepEqual(r.show.map((x) => x.sha), ["s3"], "a re-read line is never printed twice");
  assert.equal(watchStep(r.state, { tip: "", entries: [] }, f).state.cursor, "t3", "an empty read keeps the cursor");
});

test("against real git: watch starts at the tip, prints each new line once, filters, keeps polling after a read error", async () => {
  const { dir, h } = bareBus("watch");
  try {
    sendBusLine("INFO", "B", A, "old line before the watch", { cwd: h });
    const out = [], errs = [];
    const plan = [
      () => { sendBusLine("INFO", "B", A, "one for B", { cwd: h }); sendBusLine("GAME-SLOT", "*", A, "#3641 abc1234", { cwd: h }); sendBusLine("INFO", "A", A, "for A only", { cwd: h }); },
      () => {},
      () => { sendBusLine("BLOCKED", "*", A, "#3790 abc1234 blocked on review", { cwd: h }); },
    ];
    let polls = 0, failOnce = true;
    const read = (o) => { if (o.since && failOnce && polls === 2) { failOnce = false; throw new Error("proxy 503"); } return readBus(o); };
    const code = await watchBus({ cwd: h, addrs: ["B", "*"], me: B, intervalS: 20, log: (l) => out.push(l), err: (l) => errs.push(l),
      sleep: async (ms) => { assert.equal(ms, 20_000); (plan[polls++] || (() => {}))(); }, polls: 5, read });
    assert.equal(code, 0);
    assert.deepEqual(out.map((l) => l.split(" ").slice(2, 4).join(" ")), ["INFO to:B", "BLOCKED to:*"], out.join("\n"));
    assert.ok(!out.some((l) => /old line|GAME-SLOT|for A only/.test(l)), "history, train chatter and other inboxes stay out");
    assert.ok(errs[0].startsWith("= watch from "), errs[0]);
    assert.ok(errs.some((l) => /bus read failed \(proxy 503\)/.test(l)), errs.join("\n"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("main watch: refuses a bad --to or --interval before polling; otherwise returns the watch promise", async () => {
  const errs = [];
  const orig = console.error; console.error = (l) => errs.push(l);
  try {
    assert.equal(main(["watch", "--to", "random-role"], { log() {} }), 1);
    assert.equal(main(["watch", "--interval", "1"], { log() {} }), 1);
  } finally { console.error = orig; }
  assert.ok(errs.some((l) => /watch --to/.test(l)) && errs.some((l) => /5-600/.test(l)), errs.join("|"));
  const out = [];
  const code = await main(["watch", "--to", "B", "--as", A, "--interval", "5"], { log: (l) => out.push(l),
    watch: { read: () => ({ tip: "", entries: [] }), sleep: async () => {}, polls: 2, err: () => {}, cursorPath: "" } });
  assert.equal(code, 0);
  assert.deepEqual(out, []);
});

// ---- fourth-pass audit (A2, 2026-10-26): identity, typed INCIDENT, GAME-SLOT by diff, tip drift, --help ----------

test("identity: APEX_SESSION_ID is an alias of APEX_FLEET_AS (with a hint); --as must be this session unless APEX_FLEET_AS is a letter", () => {
  const C = "cursor:bc-b5cd51dd-5056-5709-aaf7-6a320ff4ffd9";
  assert.equal(whoAmI({ APEX_SESSION_ID: C }), C, "audit4 C6: the Cursor brief's variable identifies the lane");
  assert.equal(whoAmI({ APEX_SESSION_ID: "1923dcd1", CODEX_THREAD_ID: "t" }), "codex:t", "a bare hash is not an identity");
  assert.equal(whoAmI({ APEX_FLEET_AS: "grok:DAD", APEX_SESSION_ID: C }), "grok:DAD", "APEX_FLEET_AS wins");
  assert.equal(identityHint({ APEX_SESSION_ID: C }), `fleet-bus: identity ${C} from APEX_SESSION_ID (alias); set APEX_FLEET_AS to the same value`);
  assert.equal(identityHint({ APEX_FLEET_AS: C, APEX_SESSION_ID: C }), "");
  assert.equal(identityHint({ APEX_SESSION_ID: C }, C), "", "--as names it: no hint");
  assert.deepEqual(asVerdict({}, OA), { ok: true, note: "" }, "no own id: any <host>:<id>");
  assert.deepEqual(asVerdict({ CLAUDE_CODE_REMOTE_SESSION_ID: "cse_01AAAAAAAAAAAAAAAAAAAAAA" }, OA), { ok: true, note: "" }, "its own id");
  const spoof = asVerdict({ CLAUDE_CODE_REMOTE_SESSION_ID: "cse_01AAAAAAAAAAAAAAAAAAAAAA" }, "grok:DAD");
  assert.deepEqual(spoof, { ok: false, note: `--as grok:DAD is not this session (${OA}): a session signs only as itself (APEX_FLEET_AS=<fleet letter> to relay)` });
  assert.deepEqual(asVerdict({ APEX_FLEET_AS: "D·W33" }, "grok:DAD"),
    { ok: true, note: "fleet-bus: --as grok:DAD differs from this session (APEX_FLEET_AS=D·W33); sending as grok:DAD" }, "the mismatch is logged");
});

test("main send: --as another session is refused (exit 2) before any write; a letter APEX_FLEET_AS relays with a note", () => {
  const { dir, h } = bareBus("as");
  try {
    const notes = [];
    const env = { CLAUDE_CODE_REMOTE_SESSION_ID: "cse_01AAAAAAAAAAAAAAAAAAAAAA" };
    const errs = [];
    const orig = console.error; console.error = (l) => errs.push(l);
    try { assert.equal(main(["send", "INFO", "--to", "D", "--as", "grok:DAD", "hi"], { ...QUIET, env, cwd: h, log() {} }), 2); } finally { console.error = orig; }
    assert.deepEqual(errs, [`fleet-bus: ${asVerdict(env, "grok:DAD").note}`]);
    assert.equal(readBus({ cwd: h, last: 5 }).entries.length, 0);
    assert.equal(main(["send", "INFO", "--to", "D", "--as", OA, "hi"], { ...QUIET, env, cwd: h, log() {} }), 0, "its own id");
    assert.equal(main(["send", "INFO", "--to", "D", "--as", "grok:DAD", "relay"], { ...QUIET, env: { APEX_FLEET_AS: "D" }, cwd: h, log() {}, err: (l) => notes.push(l) }), 0);
    assert.deepEqual(notes, [asVerdict({ APEX_FLEET_AS: "D" }, "grok:DAD").note]);
    notes.length = 0;
    assert.equal(main(["send", "INFO", "--to", "grok:DAD", "x"], { ...QUIET, env: { APEX_SESSION_ID: "cursor:bc-12345678" }, cwd: h, log() {}, err: (l) => notes.push(l) }), 0,
      "audit4 BH4: grok:DAD is deliverable; APEX_SESSION_ID identifies");
    assert.deepEqual(notes, [identityHint({ APEX_SESSION_ID: "cursor:bc-12345678" })]);
    assert.deepEqual(readBus({ cwd: h, last: 5 }).entries.map((e) => `${e.from}>${e.to}`), [`${OA}>D`, "grok:DAD>D", "cursor:bc-12345678>grok:DAD"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("typed INCIDENT: open <id> <reason> / close <id>; an untyped line is refused at send but legacy lines still read", () => {
  assert.deepEqual(incidentOf({ type: "INCIDENT", text: "open quota-2026-10-26 launches rejected" }), { op: "open", id: "quota-2026-10-26", reason: "launches rejected" });
  assert.deepEqual(incidentOf({ type: "INCIDENT", text: "close quota-2026-10-26" }), { op: "close", id: "quota-2026-10-26", reason: "" });
  assert.equal(incidentOf({ type: "INCIDENT", text: "open bare-id" }), null, "an open needs a reason");
  assert.equal(incidentOf({ type: "INCIDENT", text: "open x [fix:abcdef1]" }), null, "a marker is not a reason");
  assert.equal(incidentOf({ type: "INFO", text: "open a b" }), null);
  assert.equal(incidentOf({ type: "INCIDENT", text: "Pages red, freeze until 'lifted'" }), null);
  assert.equal(bodyProblem("INCIDENT", "open pages-red-3801 Pages red on abc1234 [fix:abc1234]"), "");
  assert.equal(bodyProblem("INCIDENT", "close pages-red-3801 green again"), "");
  assert.equal(bodyProblem("INCIDENT", "lifted: Pages green on abcdef12 (auto-lift of x's incident)"), "", "incident-lift.mjs's legacy lift line still sends");
  assert.equal(bodyProblem("INCIDENT", "runner down").slice(0, 19), "INCIDENT is typed: ");
  assert.equal(parseLine("INCIDENT to:* from:x Pages red, freeze until lifted").type, "INCIDENT", "old lines parse");
});

test("foldIncidents: a freeze is open while any open id has no close; closes are by id; keywords never lift; legacy lift by fix sha", () => {
  const e = (sha, text, at = 1) => ({ sha, at, type: "INCIDENT", from: OA, to: "*", text });
  const open = (es) => Object.keys(foldIncidents(es).open).sort();
  // redteam G2: 28fb4b168 said "until … 'lifted'", 1be0755b2 "CLEARED … resume": free text no longer opens or lifts.
  assert.deepEqual(open([e("1", "open a pages red"), e("2", "Pages red until 'lifted'"), e("3", "freeze lifted? asking")]), ["a"]);
  assert.deepEqual(open([e("1", "open a pages red"), e("2", "open b quota rejected"), e("3", "close a")]), ["b"]);
  assert.deepEqual(open([e("1", "open a pages red"), e("2", "close b")]), ["a"], "closing another id changes nothing");
  assert.deepEqual(open([e("1", `open a red ${fixMarker("abcdef1234")}`), e("2", "lifted: Pages green on abcdef12 (auto-lift)")]), [], "incident-lift's line closes the id whose fix it names");
  assert.deepEqual(open([e("1", `open a red ${fixMarker("abcdef1234")}`), e("2", "lifted: Pages green on 99999999")]), ["a"]);
  const ledger = foldIncidents([e("1", "open a pages red", 5)]);
  assert.deepEqual(ledger.open.a, { sha: "1", from: OA, at: 5, reason: "pages red", fix: null });
  assert.deepEqual(Object.keys(foldIncidents([e("2", "close a")], ledger).open), [], "folds onto a cached ledger");
  const t = openFixIncident([e("1", `open pr-red red ${fixMarker("abcdef1234")}`), e("2", "manual freeze")]);
  assert.deepEqual([t.id, t.sha, t.entry.sha], ["pr-red", "abcdef1234", "1"], "a typed open with a fix wins and carries its id");
});

test("against real git: incidentLedger reads the whole branch (no 200-line window), caches, extends, rebuilds when missing", () => {
  const { dir, h } = bareBus("incidents");
  try {
    const file = path.join(dir, "incidents.json");
    assert.equal(sendBusLine("INCIDENT", "*", OA, "open old-freeze Pages red on abc1234", { cwd: h }).ok, true);
    for (let i = 0; i < 205; i++) assert.equal(writeBus(() => ({ ok: true, line: formatLine("GREEN", "*", OB, `#${i} green`), lease: undefined }), { cwd: h }).ok, true);
    let l = incidentLedger({ cwd: h, file });
    assert.deepEqual(Object.keys(l.open), ["old-freeze"], "an open 206 lines back still freezes (G16)");
    assert.equal(l.rebuilt, true);
    assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).tip, l.tip, "cached");
    assert.equal(sendBusLine("INCIDENT", "*", OB, "close old-freeze Pages green", { cwd: h }).ok, true);
    l = incidentLedger({ cwd: h, file });
    assert.equal(l.rebuilt, false, "extended from the cached tip");
    assert.deepEqual(l.open, {});
    fs.rmSync(file);
    assert.equal(sendBusLine("INCIDENT", "*", OB, "open quota-2026-10-26 launch rejected", { cwd: h }).ok, true);
    l = incidentLedger({ cwd: h, file });
    assert.equal(l.rebuilt, true, "a missing cache rebuilds from the full log");
    assert.deepEqual(Object.keys(l.open), ["quota-2026-10-26"]);
    const out = [];
    assert.equal(main(["incidents"], { ...QUIET, cwd: h, log: (x) => out.push(x) }), 3, "exit 3: a freeze is open");
    assert.deepEqual(out[0].split(" ").filter((_, i) => i !== 2 && i !== 4), ["OPEN", "quota-2026-10-26", `from:${OB}`, "launch", "rejected"], out[0]);
    assert.throws(() => formatLine("INCIDENT", "*", OA, "runner down"), /INCIDENT is typed/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("GAME-SLOT: a slot ends only on its own PR's DONE; a game merge is decided by the merge's diff, not the word", () => {
  assert.equal(String(GAME_PATH_RE), String(GAME_PATH), "one GAME_PATH regex with merge-gate.mjs");
  assert.equal(shaOf("#3790 merged 1a2b3c4d two parents [idem:DONE-3790-1a2b3c4]"), "1a2b3c4d");
  assert.equal(shaOf("#3790 merged in run 40322290836"), "");
  assert.equal(prOfLine({ to: "#12", text: "#99" }), 12);
  assert.equal(prOfLine({ to: "*", text: "DONE #99 abc" }), 99);
  assert.equal(prOfLine({ to: "*", text: "no pr" }), null);
  assert.deepEqual(slotOf({ type: "HANDOFF", text: "GAME-SLOT #5 abc1234", from: OA, at: 1, sha: "s" }), { pr: 5, from: OA, at: 1, sha: "s", text: "#5 abc1234" });
  const e = (sha, type, text, at) => ({ sha, at, type, to: "*", from: OA, text });
  const entries = [
    e("1", "GAME-SLOT", "#10 aaaa111", 1),
    e("2", "DONE", "#11 bbbb222 merged, game", 2), // another PR's DONE (redteam G4): the slot stays
    e("3", "DONE", "#12 cccc333 merged, non-game", 3), // the diff says game (G3): it counts
  ];
  const isGame = (x) => ({ 2: false, 3: true })[x.sha] ?? null;
  let s = gameSlotState(entries, { isGame });
  assert.equal(s.slot.pr, 10);
  assert.equal(s.closedAt, 0, "a DONE for #11 does not end #10's slot");
  assert.equal(s.lastGame.sha, "3", "the diff decides: #12 was a game merge whatever its text says");
  s = gameSlotState([...entries, e("4", "DONE", "#10 dddd444 merged", 4)], { isGame });
  assert.equal(s.closedAt, 4, "its own DONE closes it");
  assert.equal(s.lastGame.sha, "4", "unknown diff with a sha: fail-closed, counted as game");
  s = gameSlotState([e("5", "DONE", "#13 closed unmerged, game yield", 5), e("6", "DONE", "#14 closed unmerged", 6)]);
  assert.equal(s.lastGame.sha, "5", "no sha and no diff: the old word decides");
  s = gameSlotState([...entries, e("7", "GAME-SLOT", "#20 eeee555", 7)], { isGame });
  assert.deepEqual([s.slot.pr, s.closedAt], [20, 0], "a newer slot starts open");
});

test("against real git: doneIsGame reads `git diff --name-only <sha>^1 <sha>`; tipDrift warns when this file differs from the deploy tip", () => {
  const { dir, h } = bareBus("game");
  const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    const commit = (file, body, msg) => {
      fs.mkdirSync(path.dirname(path.join(h, file)), { recursive: true });
      fs.writeFileSync(path.join(h, file), body);
      g(h, "add", file);
      g(h, "commit", "-q", "-m", msg);
      return g(h, "rev-parse", "HEAD");
    };
    commit("README.md", "x\n", "base");
    const tools = commit(["tools", "ci", "x.mjs"].join("/"), "1\n", "tools");
    const game = commit(["js", "core", "a.js"].join("/"), "1\n", "game");
    assert.equal(doneIsGame({ text: `#1 ${tools.slice(0, 8)} merged` }, { cwd: h }), false);
    assert.equal(doneIsGame({ text: `#2 ${game.slice(0, 8)} merged` }, { cwd: h }), true);
    assert.equal(doneIsGame({ text: "#3 deadbee1 merged" }, { cwd: h }), null, "not in this clone");
    assert.equal(doneIsGame({ text: "#4 merged" }, { cwd: h }), null, "no sha");
    const self = path.join(dir, "fleet-bus.mjs");
    fs.writeFileSync(self, "old copy\n");
    commit("tools/ci/fleet-bus.mjs", "new copy\n", "tip");
    g(h, "push", "-q", "origin", `HEAD:refs/heads/${DEPLOY_BRANCH}`);
    const file = path.join(dir, "tip-check.json");
    const [lb, rb] = [g(h, "hash-object", self), g(h, "rev-parse", "HEAD:tools/ci/fleet-bus.mjs")];
    assert.equal(tipDrift({ cwd: h, self, file, now: T }),
      `= WARNING fleet-bus is behind the deploy tip; merge origin (blob ${lb.slice(0, 7)} vs ${rb.slice(0, 7)} on ${DEPLOY_BRANCH})`);
    fs.writeFileSync(self, "new copy\n");
    assert.equal(tipDrift({ cwd: h, self, file, now: T + 60 }), "", "same blob: no warning");
    let fetched = 0;
    const run = (args) => {
      if (args[0] === "fetch") fetched++;
      try { return { status: 0, stdout: execFileSync("git", args, { cwd: h, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; } catch (e) { return { status: 1, stdout: "" }; }
    };
    tipDrift({ cwd: h, self, file, now: T + 120, run });
    assert.equal(fetched, 0, "at most one fetch per 10 min: the cached blob answers");
    tipDrift({ cwd: h, self, file, now: T + 700, run });
    assert.equal(fetched, 1, "a stale cache fetches once");
    assert.equal(tipDrift({ cwd: h, self: path.join(dir, "missing.mjs"), file, now: T }), "", "no file, no warning");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("--help prints the usage on stdout and exits 0, before parsing anything else", () => {
  const out = [];
  assert.equal(main(["--help"], { ...QUIET, log: (l) => out.push(l) }), 0);
  assert.equal(out.length, 1);
  assert.equal(out[0].slice(0, 26), "usage: fleet-bus.mjs lease");
  assert.equal(out[0].split("\n").filter((l) => l.trim().startsWith("fleet-bus.mjs incidents [--json]")).length, 1);
  assert.equal(main(["send", "INFO", "--help"], { ...QUIET, log() {} }), 0);
  const errs = [];
  const orig = console.error; console.error = (l) => errs.push(l);
  try { assert.equal(main(["--definitely-not-a-flag"], { ...QUIET, log() {} }), 1); } finally { console.error = orig; }
});
