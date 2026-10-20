"""merge_policy.py — the one copy of the PR merge / ready policy text and the receipt check.

Shared by github-mcp-guard.sh (the GitHub MCP tools) and bash-guard.sh (the
same actions through `gh pr merge`, `gh pr ready` and `gh api`, via
shellparse.gh_issues), so the two doors refuse with the same words
(AGENTS.md §Concurrent PRs, MERGE-COMMIT-ONLY, #1458).

Since 2026-10-19 (docs/plans/2026-10-19-fleet-redesign.md §2, "gate, don't
grant") a merge or an arm needs a fresh `artifacts/merge-gate/<pr>.json`
receipt from `node tools/ci/merge-gate.mjs --pr <n>` whose head is the sha the
call pins, and a draft→ready flip a fresh `artifacts/ready-gate/<pr>.json`
receipt from `node tools/ci/ready-gate.mjs --pr <n>`. `receipt_check` is the
Python twin of tools/lib/gate-receipt.mjs `receiptVerdict`; the two agree by
tests/unit/merge-gate.test.mjs.
"""
import json
import os
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
DENY_CANCEL = ("NEVER CANCEL AN ACTIONS RUN (AGENTS.md §Concurrent PRs, 2026-10-15): a queued run holds no slot, so a "
               "cancel only throws away its queue position and the branch owner pushes a retrigger commit — 306 of 401 PR "
               "runs died that way on 2026-10-15. Your own superseded run is replaced by your next push; a closed PR's runs "
               "are cancelled by the close. APEX_RUN_CANCEL_OK=1 only when the user asked for this cancel.")
ASK_RERUN = ("Re-run a failed job at most once, and only for a timeout or infra error (AGENTS.md §Concurrent PRs). A re-run "
             "of a SUPERSEDED run joins the branch's ci-<head.ref> group and cancels the live run; prefer "
             "`node tools/ci/ci-rerun.mjs`. Confirm by hand.")

RECEIPT_MAX_MIN = 30


def squash_or_rebase(method):
    """True when a merge-method value names squash or rebase in any spelling."""
    m = str(method if method is not None else "").lower()
    return "squash" in m or "rebase" in m


def project_root():
    """The checkout the hooks guard: CLAUDE_PROJECT_DIR (set by Claude Code), else the cwd."""
    return os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()


def receipt_path(root, kind, pr):
    return os.path.join(root, "artifacts", kind + "-gate", str(int(pr)) + ".json")


def receipt_check(root, kind, pr, head=None, now=None):
    """(ok, why) for a merge (`head` = the call's pinned sha) or ready receipt. Mirrors receiptVerdict in
    tools/lib/gate-receipt.mjs: same PR and kind, `ok`, at most RECEIPT_MAX_MIN old, and for a merge the pinned
    head is the gated head (either a prefix of the other, at least 7 hex)."""
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


def emit(decision, reason):
    """Print the documented PreToolUse decision JSON."""
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                      "permissionDecision": decision, "permissionDecisionReason": reason}}))
