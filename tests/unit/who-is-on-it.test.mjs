// who-is-on-it — the claim half of the shared-branch check. The pushes half is
// `git for-each-ref` and `git log`, read straight; the claims half has one
// pure function (a for-each-ref line -> a claim with its age, staleness and
// released state), one slug rule and one commit shape (an empty tree carrying
// the text), and those are what a unit test can pin without touching the
// remote. Importing the module must run nothing: the CLI entry is guarded on
// argv[1]. Under a second.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseClaims, claimCommit, claimSlug, sessionId, CLAIMS_PREFIX, RELEASED, STALE_MIN, EMPTY_TREE } from "../../tools/ci/who-is-on-it.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NOW = 1_800_000_000;
const DEPLOY_LIKE = "claude/f1-game-project-26h3ng";
const line = (ageMin, slug, who, text) => `${NOW - ageMin * 60}\trefs/remotes/origin/${CLAIMS_PREFIX}${slug}\t${who}\t${text}`;

test("a claim line becomes a claim with its slug, owner, text and age; newest first", () => {
  const got = parseClaims([
    line(30, "fix-autopilot", "Claude", "fixing the autopilot red  [claude/fix-autopilot; session abc123]"),
    line(5, "tune-aero", "Bryce", "aero zones on Spa  [claude/tune-aero]"),
  ].join("\n"), NOW);
  assert.equal(got.length, 2);
  assert.deepEqual(got.map((c) => c.slug), ["tune-aero", "fix-autopilot"], "newest first");
  assert.equal(got[1].who, "Claude");
  assert.equal(got[1].text, "fixing the autopilot red  [claude/fix-autopilot; session abc123]");
  assert.equal(got[1].ageMin, 30);
  assert.equal(got[1].stale, false);
  assert.equal(got[1].released, false);
});

test(`a claim older than ${STALE_MIN} min is STALE, and staleness informs rather than filters`, () => {
  const got = parseClaims([line(STALE_MIN + 1, "old", "X", "forgot to release"), line(STALE_MIN, "edge", "Y", "just inside")].join("\n"), NOW);
  assert.equal(got.find((c) => c.slug === "old").stale, true);
  assert.equal(got.find((c) => c.slug === "edge").stale, false);
  assert.equal(got.length, 2, "a stale claim is still listed — the reader decides");
});

test("a released claim is a tombstone: parsed, flagged, never mistaken for a live one", () => {
  const [c] = parseClaims(line(1, "done", "Z", `${RELEASED}  [claude/done; session s1]`), NOW);
  assert.equal(c.released, true);
  const [live] = parseClaims(line(1, "live", "Z", "not released yet"), NOW);
  assert.equal(live.released, false);
});

test("an empty listing, a bare branch name and a tab inside the text all survive", () => {
  assert.deepEqual(parseClaims("", NOW), []);
  const [c] = parseClaims(`${NOW - 60}\t${CLAIMS_PREFIX}bare\tw\twith\ta tab`, NOW);
  assert.equal(c.slug, "bare");
  assert.equal(c.text, "with\ta tab");
  assert.ok(c.ageMin >= 0);
});

test("the slug carries the SESSION, so two sessions on one branch never share a ref", () => {
  // Keying on the branch alone was worse than no tool at all: sessions develop
  // directly on the deploy branch, so every one resolved to the same ref and
  // the force-push made B's claim erase A's, while A's --release tombstoned B.
  assert.equal(claimSlug("claude/fix-autopilot", "sessAAAA"), "fix-autopilot-sessAAAA");
  assert.notEqual(claimSlug(DEPLOY_LIKE, "sessAAAA"), claimSlug(DEPLOY_LIKE, "sessBBBB"),
    "two sessions on the SAME branch must get different refs");
  // ...and the old slash-folding collision is gone for the same reason.
  assert.notEqual(claimSlug("claude/a/b", "s1"), claimSlug("claude/a--b", "s2"));
  assert.equal(claimSlug("main", "s1"), "main-s1");
  // A box with no session id still gets a stable, filename-safe slug.
  assert.equal(sessionId({}), "nosession");
  assert.equal(sessionId({ CLAUDE_CODE_SESSION_ID: "abc-123/def!" }), "abc123def");
});

test("a live claim whose TEXT begins with the word released is not a tombstone", () => {
  // `startsWith("released")` read this real claim as a release, so it vanished
  // from the listing for every session, including the one that wrote it.
  const [c] = parseClaims(line(1, "fix-a", "Claude",
    "released the c1Pileup lock, now on the autopilot red  [claude/fix-a; session s1]"), NOW);
  assert.equal(c.released, false, "a claim that merely MENTIONS releasing is still a live claim");
  // The tombstone this tool writes is exactly the sentinel plus its tag.
  const [t] = parseClaims(line(1, "fix-a", "Claude", `${RELEASED}  [claude/fix-a; session s1]`), NOW);
  assert.equal(t.released, true);
  // ...and an untagged tombstone (no session available) still counts.
  const [u] = parseClaims(line(1, "fix-a", "Claude", RELEASED), NOW);
  assert.equal(u.released, true);
});
test("a claim commit works with NO git identity configured — a CI runner must not throw", () => {
  // CI run 4651 went red here: `git commit-tree` dies with "Author identity
  // unknown" on a runner, and a coordination tool that cannot run on an
  // unconfigured box is worse than one that signs the claim "unknown".
  const saved = {};
  for (const k of ["HOME", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"]) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.GIT_CONFIG_GLOBAL = process.env.GIT_CONFIG_SYSTEM = "/dev/null";
  try {
    const sha = claimCommit("identity-free claim", "claude/unit");
    assert.match(sha, /^[0-9a-f]{40}$/);
    assert.match(execFileSync("git", ["cat-file", "-p", sha], { cwd: ROOT, encoding: "utf8" }), /identity-free claim/);
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test("a claim commit is the empty tree carrying the text, the branch and the session id", () => {
  const sha = claimCommit("unit-test claim", "claude/unit", "sess1234");
  assert.match(sha, /^[0-9a-f]{40}$/);
  const show = execFileSync("git", ["cat-file", "-p", sha], { cwd: ROOT, encoding: "utf8" });
  assert.match(show, new RegExp(`^tree ${EMPTY_TREE}$`, "m"), "the empty tree — a claim never carries files");
  assert.match(show, /unit-test claim  \[claude\/unit; session sess1234\]/);
  assert.notEqual(claimCommit("x", "claude/unit"), sha, "the text is the message, so different text is a different commit");
});

test("a FAILED fetch must not print as an empty claim list", () => {
  // The whole point of this tool is that a session does not start fixing what
  // someone else already claimed. Reading stale local refs after a failed
  // fetch and printing "nobody has claimed anything" is the 2026-09-18
  // collision with extra steps, so the two answers must never look alike.
  const src = fs.readFileSync(path.join(ROOT, "tools/ci/who-is-on-it.mjs"), "utf8");
  assert.match(src, /FETCH FAILED/, "an unfetched run must say so in the CLAIMS section, not only the branch header");
  assert.match(src, /means NOTHING WAS READ, not that nobody is on it/);
  // and the reassuring "(none — nobody has claimed anything…)" line must be
  // reachable ONLY when the fetch actually succeeded.
  const empty = /if \(!active\.length\) \{\s*console\.log\(fetched\s*\?/;
  assert.match(src, empty, "the empty-claims wording must branch on `fetched`");
});
