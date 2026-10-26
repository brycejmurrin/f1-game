"""merge_policy.py — the one copy of the PR merge / ready policy text and the receipt check.

Shared by github-mcp-guard.sh (the GitHub MCP tools) and bash-guard.sh (the
same actions through `gh pr merge`, `gh pr ready` and `gh api`, via
shellparse.gh_issues), so the two doors refuse with the same words
(AGENTS.md §Concurrent PRs, MERGE-COMMIT-ONLY, #1458).

Since 2026-10-19 (docs/plans/2026-10-19-fleet-redesign.md §2, "gate, don't
grant") a merge or an arm needs a fresh `artifacts/merge-gate/<pr>.json`
receipt from `node tools/ci/merge-gate.mjs --pr <n>` whose head is the sha the
call pins, and a draft→ready flip a fresh `artifacts/ready-gate/<pr>.json`
receipt from `node tools/ci/ready-gate.mjs --pr <n>`. A receipt lives
RECEIPT_MAX_MIN (10) minutes. `receipt_check` is the Python twin of
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

Every "ask" here asks whoever runs the session: APEX_MERGE_DESK=1 skips only the
MCP re-run prompt (github-mcp-guard.sh), never a merge, ready, close or dispatch.
"""
import hashlib
import json
import os
import subprocess
import time

GATE = "run `node tools/ci/ready-gate.mjs --pr <n>` (must exit 0 on the tip) first"
DENY_METHOD = ("MERGE-COMMIT-ONLY (AGENTS.md §Concurrent PRs): every PR lands as a merge commit; "
               "use the merge method, never squash or rebase.")
DENY_GATE_MERGE = ("A merge needs a fresh merge-gate receipt (AGENTS.md §Concurrent PRs, standing authority): "
                   "`node tools/ci/merge-gate.mjs --pr <n>` must exit 0 (open, ready-gate 0, CI green on the head, no MERGE-HOLD, "
                   "gen:check on a local merge onto the current tip, game pacing from the bus), then merge with merge_method "
                   "merge and expectedHeadSha pinned to the gated head.")
DENY_GATE_READY = ("A draft→ready flip needs a fresh ready-gate receipt: `node tools/ci/ready-gate.mjs --pr <n>` must exit 0 "
                   "on the tip (Structural guards green, Plan closed, memory marker) — it starts the full CI tier.")
ASK_MERGE = ("This gh call merges or arms outside the receipt check (a GraphQL or REST merge by id). Before confirming, " + GATE +
             "; never a draft, DIRTY/CONFLICTING or MERGE-HOLD PR.")
ASK_READY = "Marking a draft ready starts the full CI tier. Before the flip, " + GATE + "."
ASK_DESK_METHOD = ("Arm auto-merge with the MERGE method named explicitly: an omitted method uses "
                   "the repository default, which may be squash. Pass mergeMethod: MERGE.")
ASK_REF = ("This GitHub API call merges or moves a branch outside a pull request; branch protection is the only "
           "other check. Confirm it by hand.")
DENY_REF = ("writes a git ref through the API — shared safety ban 6 (Transcript Auditor batch 9: a branch was deleted "
            "with `gh api -X DELETE …/git/refs/heads/…` to get around the push hook). A branch moves only by `git push` "
            "to your own cursor/<topic>-<hash> branch (never forced, never deleted) and lands only through a PR; ask "
            "your orchestrator, or Bryce, to delete a branch.")
DENY_CANCEL = ("NEVER CANCEL AN ACTIONS RUN (AGENTS.md §Concurrent PRs, 2026-10-15): a queued run holds no slot, so a "
               "cancel only throws away its queue position and the branch owner pushes a retrigger commit — 306 of 401 PR "
               "runs died that way on 2026-10-15. Your own superseded run is replaced by your next push; a closed PR's runs "
               "are cancelled by the close. APEX_RUN_CANCEL_OK=1 only when the user asked for this cancel.")
ASK_RERUN = ("Re-run a failed job at most once, and only for a timeout or infra error (AGENTS.md §Concurrent PRs). A re-run "
             "of a SUPERSEDED run joins the branch's ci-<head.ref> group and cancels the live run; prefer "
             "`node tools/ci/ci-rerun.mjs`. Confirm by hand.")

ASK_CLOSE = ("This call CLOSES a pull request (state=closed). Closing someone else's PR loses its CI and its owner's "
             "work log; only the PR's owner, its orchestrator or Bryce closes one. Confirm by hand.")
ASK_DISPATCH = ("This call dispatches pages.yml or ci.yml. pages.yml is the release train (one running + one pending; "
                "never dual-dispatch, AGENTS.md §Git branch & deploy) and a ci.yml dispatch buys a full run. Confirm by hand.")
ASK_UPDATE_BRANCH = ("This call merges the base into a PR branch on GitHub (update-branch). Sync through "
                     "`node tools/ci/sync-pr.mjs <branch>` instead (.claude/rules/ci-tools.md). Confirm by hand.")
DENY_WRITE = ("writes repository contents through the API (contents/ PUT|DELETE, or a file-write MCP tool) — on the "
              "admin App token that lands a commit on any branch, the deploy branch included, with no PR and no CI "
              "(system audit 2026-10-26 §10). Commit locally and `git push` your own cursor/<topic>-<hash> branch.")

RECEIPT_MAX_MIN = 10
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
    roots = [root]
    gr = receipt.get("gateRoot")
    if isinstance(gr, str) and gr and os.path.realpath(gr) != os.path.realpath(root) and os.path.isdir(gr):
        roots.append(gr)
    for r in roots:
        for f in GATE_FILES:
            h = _sha256(os.path.join(r, f))
            if not h:
                return False, "%s is missing in %s" % (f, r)
            if rec.get(f) != h:
                return False, "%s in %s is not the file that wrote this receipt: re-run the gate from this checkout" % (f, r)
        if not _git_ok(r, "ls-files", "--error-unmatch", "--", *GATE_FILES):
            return False, "the gate files are not tracked in %s" % r
        if not _git_ok(r, "diff", "--quiet", "HEAD", "--", *GATE_FILES):
            return False, ("the gate files in %s differ from HEAD (an uncommitted gate edit, the 2026-10-20 O23 incident): "
                           "commit or revert, then re-run the gate" % r)
    return True, ""


def receipt_check(root, kind, pr, head=None, now=None, verify_files=False):
    """(ok, why) for a merge (`head` = the call's pinned sha) or ready receipt. Mirrors receiptVerdict in
    tools/lib/gate-receipt.mjs: same PR and kind, `ok`, at most RECEIPT_MAX_MIN (10) min old, and for a merge the
    pinned head is the gated head (either a prefix of the other, at least 7 hex). `verify_files` (the hook doors
    pass True) adds gate_files_check."""
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
    if age_min > RECEIPT_MAX_MIN:
        return False, "the %s receipt for #%d is %d min old (max %d); re-run the gate on the current head" % (
            tool, n, round(age_min), RECEIPT_MAX_MIN)
    if kind == "merge":
        a = str(head or "").strip().lower()
        b = str(r.get("head") or "").strip().lower()
        if not a:
            return False, ("pin expectedHeadSha to the gated head %s (role-merge-holder.md: a merge is pinned to the sha "
                           "the gate passed)" % b[:12])
        if not (a.startswith(b) or b.startswith(a)) or min(len(a), len(b)) < 7:
            return False, "expectedHeadSha %s is not the gated head %s; re-run merge-gate on the head you merge" % (a[:12], b[:12])
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
