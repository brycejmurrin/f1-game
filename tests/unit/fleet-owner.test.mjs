/* fleet-owner.test.mjs — tools/ci/fleet-owner.mjs: path ownership from open PR diffs + claims board (fleet redesign §8 rule 2). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  globToRegex, tokenCovers, claimPaths, claimSession, parseFleetBlock, decide, releaseAnswer, apiFiles, main,
} from "../../tools/ci/fleet-owner.mjs";

const NOW = Date.parse("2026-10-19T22:00:00Z");
const SHA_A = "a".repeat(40), SHA_B = "b".repeat(40);
const BODY_A = "Goal\n\n```fleet\nworker: claude:session_01WORKER\norchestrator: claude:session_01ORCH\nfleet: A\nstate: pr-open\n```\nfleet-status: ready | green | 2026-10-19T21:00:00Z\n";

/** A fake GitHub: open PRs and their files; `cap` makes a files list shorter than changed_files. */
function fakeApi({ prs = [], fail = null, cap = {} } = {}) {
  const calls = [];
  const request = (p) => {
    calls.push(p);
    if (fail && p.startsWith(fail)) return { error: "HTTP 502" };
    if (p.startsWith("pulls?")) return { json: prs.map((x) => ({ number: x.number, body: x.body || "", title: "", user: { login: "bryce" }, head: { sha: x.sha }, base: { sha: SHA_B } })) };
    const one = /^pulls\/(\d+)$/.exec(p);
    if (one) { const x = prs.find((q) => q.number === Number(one[1])); return { json: { head: { sha: x.sha }, changed_files: x.files.length } }; }
    const f = /^pulls\/(\d+)\/files\?per_page=100(?:&page=(\d+))?$/.exec(p);
    if (f) {
      const x = prs.find((q) => q.number === Number(f[1]));
      const page = Number(f[2] || 1);
      const files = x.files.slice(0, cap[x.number] ?? x.files.length);
      return { json: files.slice((page - 1) * 100, page * 100).map((filename) => ({ filename })) };
    }
    return { error: `unexpected ${p}` };
  };
  return { request, calls };
}

const claim = (text, ageMin = 10, who = "Claude", slug = "x-1923dcd1d9ef874aad548d82") =>
  ({ slug, who, text, at: Math.floor(NOW / 1000) - ageMin * 60, ageMin, stale: false, released: false });

/** Exact-line check: `line` must be one whole line of `out`, whitespace included. */
const hasLine = (out, line) => assert.ok(out.split("\n").includes(line), `missing line ${JSON.stringify(line)} in:\n${out}`);

function run(argv, deps) {
  const out = [], err = [];
  const code = main(argv, { git: null, now: NOW, env: {}, log: (s) => out.push(s), err: (s) => err.push(s), ...deps });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

test("glob -> regex: ** any depth, * one segment, braces, dots literal", () => {
  assert.ok(globToRegex("js/render/three/**").test("js/render/three/a/b.js"));
  assert.ok(globToRegex("tools/**/x.mjs").test("tools/x.mjs"));
  assert.ok(globToRegex("tools/*.mjs").test("tools/a.mjs"));
  assert.ok(!globToRegex("tools/*.mjs").test("tools/ci/a.mjs"));
  assert.ok(globToRegex("tests/unit/fleet-{owner,bus}.test.mjs").test("tests/unit/fleet-bus.test.mjs"));
  assert.ok(!globToRegex("a.js").test("aXjs"));
  assert.ok(tokenCovers("tools/gfx/", "tools/gfx/gpu-mem-census.mjs"), "directory prefix with slash");
  assert.ok(tokenCovers("tools/gfx", "tools/gfx/gpu-mem-census.mjs"), "directory prefix without slash");
  assert.ok(!tokenCovers("tools/gf", "tools/gfx/gpu-mem-census.mjs"), "not a partial segment");
});

test("claim text -> paths and session; the board's hash tag is neither", () => {
  const t = "[B·H1] perf: OWNED js/render/three/**, gfx.js, `tools/gfx/**` (see https://x.io/a/b) #3099  [claude/x; session 1923dcd1d9ef874aad548d82]";
  assert.deepEqual(claimPaths(t), ["js/render/three/**", "gfx.js", "tools/gfx/**"]);
  assert.equal(claimSession(t), "#3099");
  assert.equal(claimSession("on js/a.js for claude:session_01ABC"), "claude:session_01ABC");
  assert.equal(claimSession("on js/a.js cse_01XYZ"), "cse_01XYZ");
  assert.equal(claimSession("on js/a.js  [claude/x; session 1923dcd1d9ef874aad548d82]"), null);
});

test("fleet block keys parsed; template placeholders and comments ignored", () => {
  assert.deepEqual(parseFleetBlock(BODY_A), { worker: "claude:session_01WORKER", orchestrator: "claude:session_01ORCH", fleet: "A" });
  assert.deepEqual(parseFleetBlock("```fleet\nworker: <host>:<id>\n```"), {});
  assert.deepEqual(parseFleetBlock("<!--\n```fleet\nworker: claude:x\n```\n-->"), {});
});

test("HELD beats CLAIMED: an open diff owns the path even when a claim names it", () => {
  const { request } = fakeApi({ prs: [{ number: 3101, sha: SHA_A, body: BODY_A, files: ["tools/gfx/gpu-mem-census.mjs"] }] });
  const r = run(["tools/gfx/gpu-mem-census.mjs", "tools/gfx/other.mjs", "js/free.js"], { request, claims: [claim("OWNED tools/gfx/** for claude:session_01C")] });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.out.split("\n"), [
    "tools/gfx/gpu-mem-census.mjs  HELD #3101 aaaaaaa claude:session_01WORKER  [fleet-status: ready | green | 2026-10-19T21:00:00.000Z]",
    "tools/gfx/other.mjs           CLAIMED 10m Claude claude:session_01C",
    "js/free.js                    FREE",
    "= fleet-owner 1 held, 1 claimed, 1 free",
  ]);
});

test("an unaddressable claim says so; stdin paths are read", () => {
  const { request } = fakeApi();
  const r = run([], { request, stdin: "./js/render/three/tlx.js\n\n", claims: [claim("OWNED js/render/three/**", 30, "Bryce Murrin")] });
  hasLine(r.out, "js/render/three/tlx.js  CLAIMED 30m Bryce Murrin unaddressable");
});

test("--json carries holders with fleet keys", () => {
  const { request } = fakeApi({ prs: [{ number: 7, sha: SHA_A, body: BODY_A, files: ["a.js"] }] });
  const j = JSON.parse(run(["--json", "a.js"], { request, claims: [] }).out);
  assert.equal(j.rows[0].state, "held");
  assert.equal(j.rows[0].holders[0].orchestrator, "claude:session_01ORCH");
  assert.equal(j.rows[0].holders[0].fleet, "A");
  assert.deepEqual(j.counts, { held: 1, claimed: 0, free: 0 });
});

test("--release-answer: RELEASED when every path is free or the caller's own claim", () => {
  const { request } = fakeApi();
  const r = run(["--release-answer", "R7", "--as", "claude:session_01ME", "js/a.js", "js/b.js"],
    { request, claims: [claim("OWNED js/a.js claude:session_01ME")] });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out.split("\n").at(-1), "RELEASED R7 js/a.js js/b.js", r.out);
  assert.doesNotMatch(r.out, /^HELD R7/m);
});

test("--release-answer: HELD per holding PR, and the rest released", () => {
  const { request } = fakeApi({ prs: [
    { number: 12, sha: SHA_A, files: ["js/a.js"] },
    { number: 15, sha: SHA_B, files: ["js/b.js", "js/a.js"] },
  ] });
  const r = run(["--release-answer", "R8", "--as", "claude:session_01ME", "js/a.js", "js/b.js", "js/c.js"], { request, claims: [] });
  assert.deepEqual(r.out.split("\n").slice(-3), ["HELD R8 until #12: js/a.js", "HELD R8 until #15: js/b.js", "RELEASED R8 js/c.js"], r.out);
  hasLine(r.out, "js/a.js  HELD #12 aaaaaaa gh:bryce  (also #15)");
});

test("--release-answer: another session's live claim is not the caller's to release", () => {
  const lines = releaseAnswer("R9", decide(["js/a.js"], { claims: [claim("js/a.js cse_01OTHER")], now: NOW }), "claude:session_01ME");
  assert.deepEqual(lines, ["NOT-OWNER R9 js/a.js: claimed by Claude cse_01OTHER"]);
});

test("lapse rule: only with --requested-at >= 60 min ago, only claims > 60 min old, never an open-diff path", () => {
  const claims = [claim("OWNED js/a.js js/b.js", 90), claim("OWNED js/c.js", 30)];
  const diffs = [{ holder: { pr: 5, sha: SHA_A, owner: "x" }, files: new Set(["js/b.js"]) }];
  const old = "2026-10-19T20:30:00Z", fresh = "2026-10-19T21:30:00Z";
  const none = decide(["js/a.js"], { claims, diffs, now: NOW });
  assert.equal(none.rows[0].lapsed, false, "no request, no lapse");
  assert.equal(decide(["js/a.js"], { claims, diffs, now: NOW, requestedAt: fresh }).rows[0].lapsed, false, "request under 60 min");
  const lapsed = decide(["js/a.js", "js/b.js", "js/c.js"], { claims, diffs, now: NOW, requestedAt: old });
  assert.equal(lapsed.rows[0].lapsed, true);
  assert.equal(lapsed.rows[1].state, "held", "an open-diff path is never lapsed");
  assert.equal(lapsed.rows[2].lapsed, false, "a 30-min claim does not lapse");
  const { request } = fakeApi();
  const r = run(["--requested-at", old, "--release-answer", "R10", "js/a.js"], { request, claims });
  hasLine(r.out, "js/a.js  CLAIMED (lapsed-after-release-request) 90m Claude unaddressable");
  assert.equal(r.out.split("\n").at(-1), "RELEASED R10 js/a.js", r.out);
});

test("an incomplete files list fails closed: exit 3, no rows", () => {
  const files = Array.from({ length: 150 }, (_, i) => `f${i}.js`);
  const { request } = fakeApi({ prs: [{ number: 9, sha: SHA_A, files }], cap: { 9: 120 } });
  assert.equal(apiFiles(9, request).error, "PR #9: incomplete files list: received 120 of 150 changed files");
  const r = run(["f1.js"], { request, claims: [] });
  assert.equal(r.code, 3);
  assert.equal(r.out, "");
  assert.equal(r.err, "= fleet-owner unknown — PR #9: incomplete files list: received 120 of 150 changed files");
});

test("pagination reads every page; API errors and an unreadable board exit 3", () => {
  const files = Array.from({ length: 230 }, (_, i) => `f${i}.js`);
  const { request, calls } = fakeApi({ prs: [{ number: 9, sha: SHA_A, files }] });
  assert.equal(apiFiles(9, request).files.length, 230);
  assert.ok(calls.includes("pulls/9/files?per_page=100&page=3"));
  assert.equal(run(["a.js"], { request: fakeApi({ fail: "pulls?" }).request, claims: [] }).code, 3);
  assert.equal(run(["a.js"], { request: fakeApi().request, claims: null }).code, 3);
});

test("--pr <n>: that PR's files, owners other than itself", () => {
  const { request } = fakeApi({ prs: [
    { number: 20, sha: SHA_A, files: ["js/a.js", "js/b.js"] },
    { number: 21, sha: SHA_B, files: ["js/b.js"] },
  ] });
  const r = run(["--pr", "20"], { request, claims: [] });
  assert.deepEqual(r.out.split("\n"), ["js/a.js  FREE", "js/b.js  HELD #21 bbbbbbb gh:bryce", "= fleet-owner 1 held, 0 claimed, 1 free"]);
});

test("bad args exit 2", () => {
  assert.equal(run(["--pr", "x"], { claims: [] }).code, 2);
  assert.equal(run(["--bogus"], { claims: [] }).code, 2);
  assert.equal(run([], { stdin: "", claims: [] }).code, 2);
});
