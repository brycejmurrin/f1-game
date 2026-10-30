"""merge_policy.py — the one copy of the PR merge / ready policy text and the receipt check.

Shared by github-mcp-guard.sh (the GitHub MCP tools) and bash-guard.sh (the
same actions through `gh pr merge`, `gh pr ready` and `gh api`, via
shellparse.gh_issues), so the two doors refuse with the same words
(AGENTS.md §Coordination, MERGE-COMMIT-ONLY, #1458).

Since 2026-10-27 (WP-L4; Bryce 2026-10-27, asked "may I make the hook edits for the merge/arm door, receipts
and hold removal?": "You consider the options and make the best decisions") no session merges or arms at all: MCP
merge_pull_request / enable_pr_auto_merge and `gh pr merge` are denied outright (land.yml lands; merge-gate.mjs
writes no receipt, and a hand-written one used to open the door). A draft→ready flip needs a fresh
`artifacts/ready-gate/<pr>.json` receipt from `node tools/ci/ready-gate.mjs --pr <n>` whose head is the PR's LIVE
head (`live_head`); an unknown live head refuses. Removing the `hold` label asks (ASK_HOLD). The merge case of
`receipt_check` stays as the twin of receiptVerdict; no door calls it. A receipt lives
RECEIPT_MAX_MIN (10) minutes, or RECEIPT_BOUND_MAX_MIN (24 h) while the PR's live head and Plan hash match it. `receipt_check` is the Python twin of
tools/lib/gate-receipt.mjs `receiptVerdict`, and `gate_files_check` the twin of
`gateFilesVerdict`; the pairs agree by tests/unit/merge-gate.test.mjs.

Since 2026-10-26 (system audit §10; user grant, Bryce 2026-10-26 ~23:00 PT: "Fix
hook or guard or perm") the doors also call `gate_files_check`: the receipt
records the sha256 of the gate's own files (GATE_FILES) and the hook refuses one
whose files differ from the guarded checkout's committed tree — on 2026-10-20 an
UNCOMMITTED edit of merge-gate.mjs (`--pacing-override`) wrote an ok receipt and
the merge went through. It stops an edited gate, not a forger: anything that can
Write a file can write a receipt, so branch protection is the real backstop
(docs/notes/HOOKS-SECURITY-2026-10-26.md).

Every "ask" here asks whoever runs the session; no environment variable silences one.
"""
import hashlib
import json
import os
import re
import subprocess
import time

GATE = "run `node tools/ci/ready-gate.mjs --pr <n>` (must exit 0 on the tip) first"
DENY_METHOD = ("MERGE-COMMIT-ONLY (AGENTS.md §Coordination): every PR lands as a merge commit; "
               "use the merge method, never squash or rebase.")
DENY_GATE_MERGE = ("No session merges or arms (AGENTS.md §Coordination, docs/WORKERS.md §The contract): flip the PR "
                   "ready and add the `land` label; land.yml runs `merge-gate.mjs --check` as the `gate` check (no `hold` "
                   "label, Plan closed, CI green on the head, gen:check and ratchets on the merge result, base distance) "
                   "and arms auto-merge with the merge method. This door is shut for every session, receipt or not (WP-L4, "
                   "2026-10-27).")
DENY_GATE_READY = ("A draft→ready flip needs a fresh ready-gate receipt: `node tools/ci/ready-gate.mjs --pr <n>` must exit 0 "
                   "on the tip (Structural guards green, Plan closed, memory marker) — it starts the full CI tier.")
ASK_MERGE = ("This gh call merges or arms outside the receipt check (a GraphQL or REST merge by id). Before confirming, " + GATE +
             "; never a draft, DIRTY/CONFLICTING or `hold`-labelled PR.")
ASK_READY = "Marking a draft ready starts the full CI tier. Before the flip, " + GATE + "."
ASK_DESK_METHOD = ("Arm auto-merge with the MERGE method named explicitly: an omitted method uses "
                   "the repository default, which may be squash. Pass mergeMethod: MERGE.")
ASK_REF = ("This GitHub API call merges or moves a branch outside a pull request; branch protection is the only "
           "other check. Confirm it by hand.")
DENY_REF = ("writes a git ref through the API — shared safety ban 6 (Transcript Auditor batch 9: a branch was deleted "
            "with `gh api -X DELETE …/git/refs/heads/…` to get around the push hook). A branch moves only by `git push` "
            "to your own cursor/<topic>-<hash> branch (never forced, never deleted) and lands only through a PR; ask "
            "Bryce to delete a branch.")
DENY_CANCEL = ("NEVER CANCEL AN ACTIONS RUN (AGENTS.md §Coordination, 2026-10-15): a queued run holds no slot, so a "
               "cancel only throws away its queue position and the branch owner pushes a retrigger commit — 306 of 401 PR "
               "runs died that way on 2026-10-15. Your own superseded run is replaced by your next push; a closed PR's runs "
               "are cancelled by the close. APEX_RUN_CANCEL_OK=1 only when the user asked for this cancel.")
ASK_RERUN = ("Re-run a failed job at most once, and only for a timeout or infra error (AGENTS.md §Coordination). A re-run "
             "of a SUPERSEDED run joins the branch's ci-<head.ref> group and cancels the live run; prefer "
             "`node tools/ci/ci-rerun.mjs`. Confirm by hand.")

ASK_CLOSE = ("This call CLOSES a pull request (state=closed). Closing someone else's PR loses its CI and its owner's "
             "work log; only the PR's owner or Bryce closes one. Confirm by hand.")
ASK_HOLD = ("This call REMOVES the `hold` label (or deletes or replaces the label list). `hold` is the only veto "
            "(AGENTS.md §Coordination): whoever set it removes it, and Bryce can always remove it. Confirm by hand.")
ASK_DISPATCH = ("This call dispatches pages.yml or ci.yml. pages.yml is the release train (one running + one pending; "
                "never dual-dispatch, AGENTS.md §Git branch & deploy) and a ci.yml dispatch buys a full run. Confirm by hand.")
ASK_UPDATE_BRANCH = ("This call merges the base into a PR branch on GitHub (update-branch). Sync through "
                     "`node tools/ci/sync-pr.mjs <branch>` instead (.claude/rules/ci-tools.md). Confirm by hand.")
DENY_WRITE = ("writes repository contents through the API (contents/ PUT|DELETE, or a file-write MCP tool) — on the "
              "admin App token that lands a commit on any branch, the deploy branch included, with no PR and no CI "
              "(system audit 2026-10-26 §10). Commit locally and `git push` your own cursor/<topic>-<hash> branch.")

RECEIPT_MAX_MIN = 10
# A ready receipt tied to the PR's live head AND Plan hash lives this long (the clock is only a backstop; a push or a
# Plan edit invalidates it). Twin of BOUND_MAX_AGE_MIN in tools/lib/gate-receipt.mjs.
RECEIPT_BOUND_MAX_MIN = 24 * 60
GATE_FILES = ("tools/ci/merge-gate.mjs", "tools/ci/ready-gate.mjs", "tools/lib/gate-receipt.mjs")


def gated_workflow(wf):
    """True for a workflow id/file whose dispatch asks: pages.yml, ci.yml (any path or .yaml spelling), or a numeric
    id the hook cannot resolve offline."""
    w = str(wf if wf is not None else "").strip().lower()
    if not w:
        return False
    if w.isdigit():
        return True
    return os.path.basename(w) in ("pages.yml", "pages.yaml", "ci.yml", "ci.yaml")


def squash_or_rebase(method):
    """True when a merge-method value names squash or rebase in any spelling."""
    m = str(method if method is not None else "").lower()
    return "squash" in m or "rebase" in m


def project_root():
    """The checkout the hooks guard: CLAUDE_PROJECT_DIR (set by Claude Code), else the cwd."""
    return os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()


def receipt_path(root, kind, pr):
    return os.path.join(root, "artifacts", kind + "-gate", str(int(pr)) + ".json")


def _sha256(p):
    try:
        with open(p, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    except OSError:
        return None


def _git_ok(root, *args):
    try:
        return subprocess.run(["git", "-C", root] + list(args), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                              timeout=5).returncode == 0
    except Exception:
        return False


def gate_files_check(root, receipt):
    """(ok, why): was `receipt` written by the committed gate? Twin of gateFilesVerdict (tools/lib/gate-receipt.mjs).
    Every GATE_FILES entry is recorded, equals the file's sha256 in `root`, is tracked there and matches HEAD
    (`git diff --quiet HEAD`); a different `gateRoot` (a gate run in a linked worktree) passes the same test."""
    rec = (receipt or {}).get("gateFiles") if isinstance(receipt, dict) else None
    if not isinstance(rec, dict):
        return False, "the receipt records no gate-file hashes (written by an older gate): re-run the gate"
    # pass 4 (verify #2 / tools T4): the gate's verdict depends on everything it imports (pr-board's hasMergeHold
    # among 18 files), so every file the receipt records is verified, not only the three fixed names. A gate from
    # audit4 A1 also lists its static import closure as `gateClosure`: every file in it must carry a hash.
    closure = receipt.get("gateClosure")
    closure = [k for k in closure if isinstance(k, str)] if isinstance(closure, (list, tuple)) else []
    missing = [k for k in closure if k not in rec]
    if missing:
        return False, "the receipt lists %s in the gate's import closure without a hash: re-run the gate" % missing[0]
    files = tuple(sorted(set(GATE_FILES) | set(closure)
                         | {k for k in rec if isinstance(k, str) and k.endswith((".mjs", ".js", ".cjs"))}))
    roots = [root]
    gr = receipt.get("gateRoot")
    if isinstance(gr, str) and gr and os.path.realpath(gr) != os.path.realpath(root) and os.path.isdir(gr):
        roots.append(gr)
    for r in roots:
        for f in files:
            h = _sha256(os.path.join(r, f))
            if not h:
                return False, "%s is missing in %s" % (f, r)
            if rec.get(f) != h:
                return False, "%s in %s is not the file that wrote this receipt: re-run the gate from this checkout" % (f, r)
        if not _git_ok(r, "ls-files", "--error-unmatch", "--", *files):
            return False, "the gate files are not tracked in %s" % r
        if not _git_ok(r, "diff", "--quiet", "HEAD", "--", *files):
            return False, ("the gate files in %s differ from HEAD (an uncommitted gate edit, the 2026-10-20 O23 incident): "
                           "commit or revert, then re-run the gate" % r)
    return True, ""


def _repo_slug(root):
    """owner/repo of `root`'s origin remote (a GitHub URL or the session's /git/<owner>/<repo> proxy), else gh's own
    `{owner}/{repo}` placeholder."""
    try:
        url = subprocess.run(["git", "-C", root, "remote", "get-url", "origin"], capture_output=True, text=True,
                             timeout=5).stdout.strip()
    except Exception:
        url = ""
    m = (re.search(r"github\.com[/:]([^/\s]+)/([^/\s]+?)(?:\.git)?/?$", url)
         or re.search(r"/git/([^/\s]+)/([^/\s]+?)(?:\.git)?/?$", url))
    return "%s/%s" % (m.group(1), m.group(2)) if m else "{owner}/{repo}"


def _slug(root, owner=None, repo=None):
    o, r = str(owner or "").strip(), str(repo or "").strip()
    name = re.compile(r"^[A-Za-z0-9_.-]+$")
    return "%s/%s" % (o, r) if name.match(o) and name.match(r) else _repo_slug(root)


def gh_api(root, endpoint, jq, timeout=6):
    """stdout of `gh api <endpoint> --jq <jq>` run in `root`, or None on any failure (no gh, no auth, timeout).
    github-mcp-guard.sh has a 10 s hook timeout, so one call stays under 6 s."""
    try:
        r = subprocess.run(["gh", "api", endpoint, "--jq", jq], cwd=root if os.path.isdir(str(root)) else None,
                           capture_output=True, text=True, timeout=timeout)
    except Exception:
        return None
    return r.stdout.strip() if r.returncode == 0 else None


def live_head(root, pr, owner=None, repo=None):
    """The PR's head sha on GitHub NOW (`gh api repos/<r>/pulls/<n> --jq .head.sha`), or None when unknown."""
    try:
        n = int(pr)
    except (TypeError, ValueError):
        return None
    out = gh_api(root, "repos/%s/pulls/%d" % (_slug(root, owner, repo), n), ".head.sha")
    return out.lower() if out and re.fullmatch(r"[0-9a-fA-F]{40}", out) else None


def plan_hash(body):
    """sha256 of the PR body's `## Plan` section. Twin of planHash in tools/ci/ready-gate.mjs (same CURSOR slice rule,
    LF ends, trailing blanks and blank lines dropped); tests/unit/merge-gate.test.mjs keeps them equal."""
    raw = re.sub(r"\r\n?", "\n", str(body or ""))
    text = None
    m = re.search(r"<!--\s*CURSOR_AGENT_PR_BODY_BEGIN\s*-->([\s\S]*?)<!--\s*CURSOR_AGENT_PR_BODY_END\s*-->", raw, re.I)
    if m and re.search(r"^##[ \t]+Plan\b", m.group(1), re.M | re.A) and re.search(r"^[ \t]*[-*][ \t]+\[[ xX~]\]", m.group(1), re.M):
        text = m.group(1)
    if text is None:
        text = re.sub(r"<!--[\s\S]*?-->", "", raw)
    section = ""
    h = re.search(r"^##[ \t]+Plan\b.*$", text, re.M | re.A)
    if h:
        rest = text[h.end():]
        nx = re.search(r"^##[ \t]", rest, re.M)
        section = rest[:nx.start()] if nx else rest
    lines = [re.sub(r"[ \t]+$", "", ln) for ln in section.split("\n")]
    return hashlib.sha256("\n".join(ln for ln in lines if ln).encode("utf8")).hexdigest()


def live_state(root, pr, owner=None, repo=None):
    """(head sha, Plan hash) of the PR on GitHub NOW from ONE API call (the hook has a 10 s budget), each None when
    unknown."""
    try:
        n = int(pr)
    except (TypeError, ValueError):
        return None, None
    out = gh_api(root, "repos/%s/pulls/%d" % (_slug(root, owner, repo), n), '.head.sha + "\n" + (.body // "")')
    if not out:
        return None, None
    sha, sep, body = out.partition("\n")
    sha = sha.strip().lower()
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        return None, None
    return sha, (plan_hash(body) if sep else None)


def live_labels(root, number, owner=None, repo=None):
    """The issue's or PR's label names on GitHub NOW (lower case), or None when unknown."""
    try:
        n = int(number)
    except (TypeError, ValueError):
        return None
    out = gh_api(root, "repos/%s/issues/%d" % (_slug(root, owner, repo), n), '[.labels[].name] | join("\\n")')
    return None if out is None else [x.strip().lower() for x in out.splitlines() if x.strip()]


def receipt_check(root, kind, pr, head=None, now=None, verify_files=False, require_head=False, plan=None):
    """(ok, why) for a merge (`head` = the call's pinned sha) or ready receipt. Mirrors receiptVerdict in
    tools/lib/gate-receipt.mjs: same PR and kind, `ok`, at most RECEIPT_MAX_MIN (10) min old, and for a merge the
    pinned head is the gated head (either a prefix of the other, at least 7 hex). `verify_files` (the hook doors
    pass True) adds gate_files_check. `require_head` (the ready doors since WP-L4) refuses a ready receipt when the
    PR's live head is unknown: a receipt for head A must not flip a PR whose head is now an unverified B."""
    tool = "merge-gate" if kind == "merge" else "ready-gate"
    try:
        n = int(pr)
    except (TypeError, ValueError):
        n = 0
    if n < 1:
        return False, "no PR number in the call"
    try:
        with open(receipt_path(root, kind, n), encoding="utf8") as f:
            r = json.load(f)
    except Exception:
        return False, "no %s receipt for #%d: run `node tools/ci/%s.mjs --pr %d` (exit 0) first" % (tool, n, tool, n)
    if r.get("kind") != kind or int(r.get("pr") or 0) != n:
        return False, "the receipt is for %s #%s, not %s #%d" % (r.get("kind"), r.get("pr"), kind, n)
    if not r.get("ok"):
        return False, "the last %s run on #%d refused (%s); fix it and re-run the gate" % (
            tool, n, r.get("evidence") or "see artifacts/%s/%d.json" % (tool, n))
    at = _parse_iso(r.get("at"))
    if at is None:
        return False, "the %s receipt for #%d has no timestamp; re-run the gate" % (tool, n)
    age_min = ((now if now is not None else time.time()) - at) / 60.0
    if age_min < -1:   # pass-4 red-team R3: a receipt dated in the future never expired
        return False, "the %s receipt for #%d is dated %d min in the future; re-run the gate" % (tool, n, round(-age_min))
    a = str(head or "").strip().lower()
    b = str(r.get("head") or "").strip().lower()
    if kind == "ready" and require_head and not a:
        return False, ("the PR's live head is unknown (`gh api repos/<r>/pulls/%d --jq .head.sha` gave no sha), so "
                       "the ready-gate receipt (head %s) cannot be tied to the head you flip; retry when the API answers"
                       % (n, b[:12]))
    if kind == "merge" and not a:
        return False, ("pin expectedHeadSha (gh: --match-head-commit) to the gated head %s (a merge "
                       "is pinned to the sha the gate passed)" % b[:12])
    # A merge pin must be the gated head; a ready flip whose caller knows the PR's live head (github-mcp-guard
    # reads it) is held to the same rule (audit4 A1 G7: the gate passed one head, the flip lands another).
    if a and (not (a.startswith(b) or b.startswith(a)) or min(len(a), len(b)) < 7):
        return False, "%s %s is not the gated head %s; re-run %s on the head you %s" % (
            "expectedHeadSha" if kind == "merge" else "the PR head", a[:12], b[:12], tool,
            "merge" if kind == "merge" else "flip")
    # Efficiency review 2026-10-30 #6: a ready receipt tied to the live head AND Plan hash outlives the 10 min clock.
    live_plan = str(plan or "").strip().lower()
    rec_plan = str(r.get("planHash") or "").strip().lower()
    bound = kind == "ready" and bool(a) and bool(live_plan) and bool(rec_plan)
    if kind == "ready" and a and live_plan:
        if not rec_plan:
            return False, "the ready-gate receipt for #%d records no Plan hash (written by an older gate): re-run ready-gate" % n
        if rec_plan != live_plan:
            return False, ("the PR's Plan section changed since ready-gate passed on it (Plan %s then, %s now): "
                           "re-run ready-gate" % (rec_plan[:12], live_plan[:12]))
    limit = RECEIPT_BOUND_MAX_MIN if bound else RECEIPT_MAX_MIN
    if age_min > limit:
        return False, "the %s receipt for #%d is %d min old (max %d%s); re-run the gate on the current head" % (
            tool, n, round(age_min), limit, ", the backstop for an unchanged head and Plan" if bound else "")
    if verify_files:
        ok, why = gate_files_check(root, r)
        if not ok:
            return False, "%s receipt for #%d: %s" % (tool, n, why)
    return True, ""


def _parse_iso(s):
    """ISO-8601 UTC (`2026-10-19T20:00:00.000Z`) -> unix seconds, or None."""
    if not s or not isinstance(s, str):
        return None
    try:
        from datetime import datetime, timezone
        t = s.strip().replace("Z", "+00:00")
        d = datetime.fromisoformat(t)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d.timestamp()
    except Exception:
        return None


def emit(decision, reason, context=""):
    """Print the documented PreToolUse decision JSON; `decision` None = advice only (additionalContext)."""
    h = {"hookEventName": "PreToolUse"}
    if decision:
        h.update(permissionDecision=decision, permissionDecisionReason=reason)
    if context:
        h["additionalContext"] = context
    print(json.dumps({"hookSpecificOutput": h}))
