"""merge_policy.py — the one copy of the PR merge / ready policy text.

Shared by github-mcp-guard.sh (the GitHub MCP tools) and bash-guard.sh (the
same actions through `gh pr merge`, `gh pr ready` and `gh api`, via
shellparse.gh_issues), so the two doors refuse with the same words
(AGENTS.md §Concurrent PRs, MERGE-COMMIT-ONLY, #1458).
"""
import json

GATE = ("run `node tools/ci/ready-gate.mjs --pr <n>` (must exit 0 on the tip) and `node tools/ci/ready-full-cap.mjs` "
        "(must find a free full-tier slot) first")
DENY_METHOD = ("MERGE-COMMIT-ONLY (AGENTS.md §Concurrent PRs): every PR lands as a merge commit; "
               "use the merge method, never squash or rebase.")
ASK_MERGE = ("Only Merge Desk arms auto-merge and only Merge Desk / Grok Bot merge (AGENTS.md "
             "§Concurrent PRs), unless the user asked for this merge. Before confirming, " + GATE +
             "; never a draft, DIRTY/CONFLICTING or MERGE-HOLD PR.")
ASK_READY = "Marking a draft ready starts the full CI tier. Before the flip, " + GATE + "."
ASK_DESK_METHOD = ("Merge Desk arms auto-merge with the MERGE method named explicitly: an omitted method uses "
                   "the repository default, which may be squash. Pass mergeMethod: MERGE.")
ASK_REF = ("This GitHub API call merges or moves a branch outside a pull request; branch protection is the only "
           "other check. Confirm it by hand.")
DENY_CANCEL = ("NEVER CANCEL AN ACTIONS RUN (AGENTS.md §Concurrent PRs, 2026-10-15): a queued run holds no slot, so a "
               "cancel only throws away its queue position and the branch owner pushes a retrigger commit — 306 of 401 PR "
               "runs died that way on 2026-10-15. Your own superseded run is replaced by your next push; a closed PR's runs "
               "are cancelled by the close. APEX_RUN_CANCEL_OK=1 only when the user asked for this cancel.")
ASK_RERUN = ("Re-run a failed job at most once, and only for a timeout or infra error (AGENTS.md §Concurrent PRs). A re-run "
             "of a SUPERSEDED run joins the branch's ci-<head.ref> group and cancels the live run; prefer "
             "`node tools/ci/ci-rerun.mjs` when it exists. Confirm by hand.")


def squash_or_rebase(method):
    """True when a merge-method value names squash or rebase in any spelling."""
    m = str(method if method is not None else "").lower()
    return "squash" in m or "rebase" in m


def emit(decision, reason):
    """Print the documented PreToolUse decision JSON."""
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                      "permissionDecision": decision, "permissionDecisionReason": reason}}))
