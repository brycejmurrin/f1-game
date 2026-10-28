"""Shared safety ban 3 (Fleet A + D, Bryce 2026-10-22): no push over a FOREIGN
pusher. On #3517 a Cursor agent pushed onto a Claude session's PR branch; the
owner pulled, merged and pushed on without noticing that a second session was
live on its branch. git itself refuses only a non-fast-forward push, and a
`git pull` first turns that into a quiet merge, so this check reads what the
remote branch gained since THIS checkout last pushed it.

The baseline is the newest "update by push" entry in the reflog of
refs/remotes/<remote>/<branch> (the tip this checkout last pushed), else the
oldest entry (the first fetch or the clone: history before a checkout began
following the branch is not news). The remote tip is read fresh (ls-remote,
fetched into a private ref when its objects are missing), and every
first-parent commit in baseline..tip whose author email is not this
checkout's `user.email`, or whose Claude-Session trailer names another session
than CLAUDE_CODE_REMOTE_SESSION_ID (every Claude session shares one email), is
a foreign commit — except land.yml's AUTO-SYNC: a clean two-parent merge of the
deploy branch with GitHub's update-branch subject (`_auto_sync`). A branch with no tracking ref
(a first push) passes; a remote that cannot be read or matched to a configured
remote passes with a WARNING on stderr. A fetch, pull or merge does not clear the refusal: the next push after
the owner confirmed the branch, with APEX_FOREIGN_PUSH_OK=1, moves the baseline.

    python3 foreign_push.py <repo dir> <remote|-> <branch>   # prints the refusal, exit 2; else exit 0
"""
import os
import re
import subprocess
import sys


def _git(where, *args, timeout=15):
    r = subprocess.run(["git", "-C", where, *args], capture_output=True, text=True, timeout=timeout)
    return r.returncode, r.stdout.strip()


def _baseline(where, ref):
    rc, out = _git(where, "reflog", "show", "--format=%H %gs", ref, "--")
    rows = [ln.split(" ", 1) + [""] for ln in out.splitlines() if ln.strip()] if rc == 0 else []
    for sha, subj, *_ in rows:          # newest first
        if subj.startswith("update by push"):
            return sha
    if rows:
        return rows[-1][0]
    rc, out = _git(where, "rev-parse", "--verify", "-q", ref)
    return out if rc == 0 and out else None


def _norm_url(u):
    u = (u or "").strip().rstrip("/")
    if u.endswith(".git"):
        u = u[:-4]
    return os.path.realpath(u) if u and "://" not in u and not re.match(r"^[\w.-]+@[\w.-]+:", u) else u


def _sid(text):
    """The session id in a Claude-Session trailer value or a CLAUDE_CODE_REMOTE_SESSION_ID
    (`…/session_01AB…`, `cse_01AB…` → `01AB…`)."""
    m = re.search(r"(?:session|cse)_([A-Za-z0-9]+)", text or "")
    return m.group(1) if m else ""


def foreign_commits(where, remote, branch):
    """[(sha, email, name, subject)] the remote branch gained from other authors
    since this checkout last pushed it; [] when there is nothing to judge.
    Raises RuntimeError when the remote cannot be read."""
    if not remote:
        remote = _git(where, "config", f"branch.{branch}.remote")[1] or "origin"
        merge = _git(where, "config", f"branch.{branch}.merge")[1]
        if merge.startswith("refs/heads/"):
            branch = merge[len("refs/heads/"):]
    names = _git(where, "remote")[1].split()
    if remote not in names:
        # A URL or path naming a configured remote is that remote (`git push ../origin.git`).
        want = _norm_url(remote)
        remote = next((n for n in names if _norm_url(_git(where, "remote", "get-url", n)[1]) == want), None)
        if remote is None:
            raise RuntimeError(f"{want or 'the remote'} is not a configured remote, so there is no last push to compare")
    ref = f"refs/remotes/{remote}/{branch}"
    base = _baseline(where, ref)
    if not base:
        return []                                   # never fetched or pushed: a first push
    try:
        rc, out = _git(where, "ls-remote", "--heads", remote, f"refs/heads/{branch}", timeout=20)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"ls-remote {remote} timed out")
    if rc != 0:
        raise RuntimeError(f"ls-remote {remote} failed")
    tip = out.split()[0] if out else ""
    if not tip or tip == base:
        return []
    private = f"refs/apex-push-guard/{branch}"
    fetched = False
    if _git(where, "cat-file", "-e", tip + "^{commit}")[0] != 0:
        try:
            rc, _ = _git(where, "fetch", "--quiet", "--no-tags", "--no-write-fetch-head", remote,
                         f"+refs/heads/{branch}:{private}", timeout=45)
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"fetch {remote} {branch} timed out")
        if rc != 0:
            raise RuntimeError(f"fetch {remote} {branch} failed")
        fetched = True
    try:
        rc, out = _git(where, "log", "--first-parent",
                       "--format=%H%x09%ae%x09%an%x09%s%x09%P%x09%(trailers:key=Claude-Session,valueonly,separator=%x20)",
                       tip, "^" + base)
    finally:
        if fetched:
            _git(where, "update-ref", "-d", private)
    me = (_git(where, "config", "user.email")[1] or _git(where, "log", "-1", "--format=%ae")[1]).lower()
    # Every Claude session commits as the same email, so a Claude-Session trailer naming
    # another session is foreign too (this session: CLAUDE_CODE_REMOTE_SESSION_ID).
    mine = _sid(os.environ.get("CLAUDE_CODE_REMOTE_SESSION_ID"))
    # _git strips the output, so the last row can lose its empty trailer field: pad it back.
    rows = [(ln.split("\t", 5) + [""])[:6] for ln in out.splitlines() if ln.count("\t") >= 4] if rc == 0 else []
    return [tuple(r[:4]) for r in rows
            if (r[1].lower() != me or (mine and _sid(r[5]) and _sid(r[5]) != mine))
            and not _auto_sync(where, r[0], r[3], r[4])]


# land.yml's AUTO-SYNC calls GitHub's update-branch API, which commits a merge of the deploy branch as the token's
# owner (Bryce), so every auto-synced branch read as foreign and the next push of its owner was refused (#3993, #3964,
# 2026-10-28). Such a commit is not another session's work: it is a two-parent merge with GitHub's update-branch
# subject and an empty combined diff (a clean merge; a conflict resolved by hand shows up there and stays foreign).
DEPLOY_BRANCH = "claude/f1-game-project-26h3ng"   # the same name as shellparse.DEPLOY_BRANCH


def _auto_sync(where, sha, subject, parents):
    if not subject.startswith(f"Merge branch '{DEPLOY_BRANCH}' into ") or len(parents.split()) != 2:
        return False
    rc, out = _git(where, "diff-tree", "--cc", "--no-commit-id", "-r", sha)
    return rc == 0 and out == ""


def check(where, remote, branch):
    """The refusal text for a push of `branch`, or None to let it through. (The orchestrator queue-branch
    exemption, cursor/*queue-*, went with the orchestrators: WP-D1, 2026-10-27.)"""
    try:
        found = foreign_commits(where, remote, branch)
    except Exception as e:                          # fail open, loudly
        sys.stderr.write(f"bash-guard: WARNING the foreign-pusher check could not read {remote or 'the remote'} "
                         f"({e}); this push was NOT checked for another session's commits.\n")
        return None
    if not found:
        return None
    lines = "".join(f"  {s[:9]} {name} <{email}> {subj[:70]}\n" for s, email, name, subj in found[:5])
    more = f"  … and {len(found) - 5} more\n" if len(found) > 5 else ""
    return (f"BLOCKED: {branch} gained {len(found)} commit(s) on the remote from another author since this "
            f"checkout last pushed it (shared safety ban 3, the #3517 foreign pusher):\n{lines}{more}"
            "Another session or a person is pushing to your branch. Do not push over it: stand down and say so in one PR "
            "comment (docs/WORKERS.md: comments are the only inter-agent message; a takeover worker may own it now). When the "
            "branch is confirmed yours again, fetch and merge it, then push once with APEX_FOREIGN_PUSH_OK=1; that "
            "push moves the baseline.\n")


if __name__ == "__main__":
    msg = check(sys.argv[1], None if sys.argv[2] == "-" else sys.argv[2], sys.argv[3])
    if msg:
        sys.stderr.write(msg)
        sys.exit(2)
