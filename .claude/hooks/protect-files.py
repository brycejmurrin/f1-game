# Read the hook payload from stdin: large Write requests exceed exec env limits.
#
# Since 2026-10-04 this also runs on Bash calls (settings.json PreToolUse
# "Bash"): shellparse.py names every file the command WRITES (redirections,
# heredocs, sed/perl -i, tee, cp/mv/install/rsync/ln, truncate, dd of=) and
# each target gets the same three rules as a Write/Edit. Auto mode tells
# agents to edit with sed and heredocs, so a guard that saw only the Edit
# tools guarded the minority of edits. Interpreter writes (python -c, node
# -e), git apply/patch and targets built from variables are NOT seen —
# shellparse.py's docstring lists the gap.
import json, os, re, subprocess, sys

# FAIL CLOSED (2026-10-28, the commit-hook split's hook pass): an unreadable or malformed payload is a refusal,
# and protect-files.sh turns any crash below (exit 1) into exit 2 too. Before this it warned and passed.
try:
    d = json.load(sys.stdin)
    if not isinstance(d, dict) or not isinstance(d.get("tool_input", {}), (dict, type(None))):
        raise ValueError("unexpected payload shape")
except Exception:
    sys.stderr.write("BLOCKED: protect-files could not read the hook payload (not JSON, or an unexpected shape), so "
                     "the edit guard did not run and this call is refused (fail closed).\n")
    sys.exit(2)
ti = d.get("tool_input") or {}
tool = d.get("tool_name") or ""
# Hook input names the subagent a call comes from (`agent_type`, documented at
# https://code.claude.com/docs/en/hooks). track-surveyor and agent-surface-reviewer
# are the agents with write tools; rules 4 and 5 below scope them (2026-10-14).
agent = str(d.get("agent_type") or "")
IN_SUBAGENT = bool(d.get("agent_id")) or "/subagents/" in str(d.get("transcript_path") or "")
SURVEYOR = agent == "track-surveyor" or agent.endswith(":track-surveyor")
# pass 4 (H1): the reporter cards declare `readonly: true`, which Claude Code ignores; the hook is the enforcement.
# A reporter writes only under scratch/ and artifacts/ (and the session scratchpad outside the repo) and never
# commits, pushes or rewrites the tree. No escape hatch.
READONLY_AGENTS = ("code-hunter", "finding-verifier", "prior-art-scout", "bloat-auditor", "verify-agent",
                   "deploy-research", "physics-contract-auditor", "ci-red-triage")
READONLY = any(agent == a or agent.endswith(":" + a) for a in READONLY_AGENTS)
READONLY_OK = re.compile(r"^(scratch|artifacts)(/|$)")
READONLY_GIT = re.compile(r"\bgit\s+(-C\s+\S+\s+)?(commit|push|stash|reset|checkout|switch|rebase|merge|cherry-pick|am|apply|rm|mv|clean|worktree)\b")
HATCHES = ("allow-protected", "allow-context-cap", "allow-stop")
RECEIPT_DIR = re.compile(r"^artifacts/((merge|ready|launch)-gate|launch)(/|$)")
SURVEYOR_OK = re.compile(r"^(js/circuits/(scenery/)?[a-z0-9_-]+\.js|scratch/.+|artifacts/.+)$")
# agent-surface-reviewer has Write for its own report only: Write/Edit to
# scratch/**.md, and no Bash writes at all (rule 5 below, 2026-10-14).
REPORTER = agent == "agent-surface-reviewer" or agent.endswith(":agent-surface-reviewer")
REPORTER_OK = re.compile(r"^scratch/.+\.md$")
REPORTER_MSG = ("agent-surface-reviewer writes only its report, scratch/**.md, through Write/Edit "
                "(.claude/agents/agent-surface-reviewer.md). Put the finding in the report instead.")


def git(*args, cwd):
    try:
        return subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True).stdout.strip()
    except Exception:
        return ""


def block(msg, root, hatch=True):
    tail = (" If this edit was explicitly assigned, run: touch "
            + os.path.join(root, ".claude/allow-protected") + " and retry.") if hatch else ""
    sys.stderr.write("BLOCKED: " + msg + tail + "\n")
    sys.exit(2)


GENERATED = {
    "version.json": "the deploy stamps it (pages.yml)",
    "js/track/circuit-meta.js": "node tools/gen/gen-circuit-meta.mjs writes it from js/circuits/<id>.js",
    "js/roster.js": "node tools/gen/gen-shell.mjs writes it from tools/manifest.cjs",
    "tools/carview.html": "node tools/gen/gen-shell.mjs writes it from tools/manifest.cjs",
    "tools/README.md": "node tools/gen/gen-tools-readme.mjs writes it from the tools' @doc headers",
    "CHANGELOG.md": "a PR adds a fragment docs/changelog.d/<slug>.md; node tools/gen/gen-changelog.mjs --fold writes it",
    # Under gen:check since 2026-10-26 (system-audit lane X3; user grant, Bryce 2026-10-26: "Fix hook or guard or perm").
    "tools/shot/scenery-locations.json": "node tools/shot/gen-scenery-locations.cjs writes it (~2 min; gen:check names drift)",
    # Not generated, but never hand-edited: a ceiling moves through the tool
    # (--auto-raise in the commit hook, --update with a reason in the commit),
    # so the number in the diff is a measurement, not a wish (AGENTS.md
    # §Critical conventions). Unguarded until 2026-09-22.
    "tests/data/ratchets.json": "node tools/check/ratchets.mjs --update (or the commit hook's --auto-raise) writes it",
}


# --- generated BLOCKS inside hand-edited files -------------------------------
def gen_blocks(text):
    """[(start, end)] character spans of every @gen-shell block: markers come
    in begin/end pairs (`@gen-shell:<name>` … `@gen-shell:end` or `/<name>`)."""
    marks = list(re.finditer(r"@gen-shell[^\n]*", text))
    spans = []
    i = 0
    while i < len(marks):
        start = marks[i].start()
        end = marks[i + 1].end() if i + 1 < len(marks) else len(text)
        spans.append((start, end))
        i += 2
    return spans


def touches_generated_block(path, tool, ti, proposed=None):
    try:
        cur = open(path, encoding="utf8").read()
    except Exception:
        return False
    spans = gen_blocks(cur)
    if not spans:
        return False
    if tool in ("Edit", "MultiEdit"):
        edits = ti.get("edits") or [ti]
        for e in edits:
            old = e.get("old_string") or ""
            if not old:
                continue
            at = cur.find(old)
            while at >= 0:
                if any(at < en and at + len(old) > s for s, en in spans):
                    return True
                at = cur.find(old, at + 1)
        return False
    if tool == "Write" or proposed is not None:
        new = proposed if proposed is not None else (ti.get("content") or "")
        cur_blocks = [cur[s:e] for s, e in spans]
        new_blocks = [new[s:e] for s, e in gen_blocks(new)]
        return cur_blocks != new_blocks
    # A Bash write whose result cannot be computed (a redirect, tee, an append)
    # is treated as touching the blocks: it rewrites or extends the file blind.
    return tool == "Bash"


def test_scripts(text):
    try:
        return {k: v for k, v in (json.loads(text).get("scripts") or {}).items()
                if k.startswith("test:")}
    except Exception:
        return None


# --- ratchet ceilings: bans 1 and 2 ------------------------------------------------
def fragment_name(branch):
    """tools/check/ratchets.mjs fragmentName(): the branch's ratchets.d file, or
    None on a detached HEAD or the deploy branch."""
    if not branch or branch in ("HEAD", "claude/f1-game-project-26h3ng"):
        return None
    return re.sub(r"[^A-Za-z0-9._-]+", "--", branch) + ".json"


def _leaves(node, at=()):
    """{path: number} of every numeric leaf ("_doc" and other text skipped)."""
    out = {}
    if isinstance(node, dict):
        for k, v in node.items():
            out.update(_leaves(v, at + (k,)))
    elif isinstance(node, (int, float)) and not isinstance(node, bool):
        out[at] = node
    return out


RATCHET_FILES = ("tests/data/ratchets.json", "tests/data/ratchets.d/")
REMOVERS = {"rm", "unlink", "mv", "shred", "rmdir", "find"}


def ratchet_removals(cmd, cwd):
    """[(path, how)] ratchet files a command removes or moves away (rm, unlink, mv
    and git mv sources, git rm, find … -delete/-exec, shred), each file under a
    directory it names included. shellparse.write_targets reads only writes."""
    import shellparse
    out = []
    try:
        cmds = list(shellparse.commands(cmd, cwd, strict=True))
    except Exception:
        return out
    for _env, argv, _redir, c in cmds:
        if not argv:
            continue
        verb = os.path.basename(argv[0])
        args = argv[1:]
        if verb == "git":
            k = next((i for i, a in enumerate(args) if not a.startswith("-")), None)
            if k is None or args[k] not in ("rm", "mv"):
                continue
            verb, args = "git " + args[k], args[k + 1:]
        elif verb not in REMOVERS:
            continue
        if verb in ("mv", "git mv"):
            paths = [a for a in args if not a.startswith("-")][:-1]   # sources; the last is the destination
        elif verb == "find":
            # pass-4 R12: `find … -exec grep|cat|wc {} ;` reads; only -delete or an -exec that removes/moves counts.
            removing = "-delete" in args
            for k, a in enumerate(args):
                if a in ("-exec", "-execdir", "-ok", "-okdir") and k + 1 < len(args) and os.path.basename(args[k + 1]) in ("rm", "unlink", "shred", "mv", "git"):
                    removing = True
            if not removing:
                continue
            paths = [a for a in args[:next((i for i, a in enumerate(args) if a.startswith("-")), len(args))]]
        else:
            paths = [a for a in args if not a.startswith("-")]
        for a in paths:
            p = os.path.realpath(os.path.join(c or cwd, os.path.expanduser(a)))
            root = git("rev-parse", "--show-toplevel", cwd=p if os.path.isdir(p) else (os.path.dirname(p) or "."))
            if not root:
                continue
            rel = os.path.relpath(p, root).replace(os.sep, "/")
            if os.path.isdir(p):           # `rm -rf tests/data/ratchets.d`, `find tests -delete`
                fd = os.path.join(root, RATCHET_FILES[1])
                every = [os.path.join(root, RATCHET_FILES[0])] + (
                    [os.path.join(fd, f) for f in os.listdir(fd) if f.endswith(".json")] if os.path.isdir(fd) else [])
                out += [(h, verb) for h in every if os.path.exists(h) and (h + os.sep).startswith(p.rstrip(os.sep) + os.sep)]
            elif rel == RATCHET_FILES[0] or rel.startswith(RATCHET_FILES[1]):
                out.append((p, verb))
    return out


def ratchet_raise(file, tool, ti, proposed, frag):
    """Why this write raises a ceiling, or None. A fragment holds deltas (a
    missing key is 0); ratchets.json holds ceilings and slacks (a dropped one
    is unbounded, a new entry only adds a guard). Content the hook cannot
    compute (a redirect, an append) counts as a raise: write it with Edit."""
    try:
        cur = open(file, encoding="utf8").read()
    except Exception:
        cur = "{}"
    if tool == "Remove":
        new = "{}"                      # a removed fragment is all-zero deltas; a removed ratchets.json drops every ceiling
    elif tool in ("Edit", "MultiEdit"):
        new = cur
        for e in ti.get("edits") or [ti]:
            old = e.get("old_string") or ""
            if old and old in new:
                new = new.replace(old, e.get("new_string") or "", -1 if e.get("replace_all") else 1)
    elif tool == "Write" or proposed is not None:
        new = proposed if proposed is not None else (ti.get("content") or "")
    else:
        return "is rewritten blind (a redirect, tee or append the hook cannot read), which may raise a ceiling"
    try:
        before, after = _leaves(json.loads(cur or "{}")), _leaves(json.loads(new))
    except Exception:
        return "would not parse as JSON after this edit"
    for key in sorted(set(before) | set(after), key=str):
        if frag:
            b, a = before.get(key, 0), after.get(key, 0)
        elif key in before and key not in after:
            return f"drops the {'/'.join(map(str, key))} ceiling"
        elif key not in before:
            continue
        else:
            b, a = before[key], after[key]
        if a > b:
            return f"raises {'/'.join(map(str, key))} from {b} to {a}"
    return None


# --- no source edits during a live browser run --------------------------------
def live_playwright_in(root):
    """A `playwright test` / run-playwright.mjs process whose cwd is under THIS
    checkout. Scoped (2026-09-22): a substring match on the whole process table
    also fired on another worktree's run, on an editor grepping for the word,
    and on this hook's own shell when the command line quoted it. argv is
    split on NULs and matched token-wise; cwd comes from /proc."""
    try:
        pids = [p for p in os.listdir("/proc") if p.isdigit()]
    except Exception:
        return False
    for pid in pids:
        try:
            with open(f"/proc/{pid}/cmdline", "rb") as fh:
                argv = fh.read().split(b"\0")
        except Exception:
            continue
        argv = [a.decode("utf8", "replace") for a in argv if a]
        if not argv:
            continue
        basenames = [os.path.basename(a) for a in argv]
        is_pw = ("run-playwright.mjs" in basenames
                 or any(b in ("playwright", "playwright.js", "cli.js") and "test" in argv[i + 1:i + 3]
                        for i, b in enumerate(basenames)))
        if not is_pw:
            continue
        try:
            cwd = os.readlink(f"/proc/{pid}/cwd")
        except Exception:
            continue
        if cwd == root or cwd.startswith(root + os.sep):
            return True
    return False


def check(file, tool, ti, proposed=None, how=""):
    """The three rules for one target file. `proposed` is the file's content
    after the call when it is computable (a Write, a simulated sed, a cp)."""
    # Resolve symlinks FIRST (red-team round 2, 2026-10-14): a link outside the
    # repo pointing at version.json wrote through, because the repo root came
    # from the LINK's directory. realpath also resolves a not-yet-existing tail.
    file = os.path.realpath(file)
    d_ = os.path.dirname(file) or "."
    while d_ and d_ != "/" and not os.path.isdir(d_):   # a Bash write may create the directory
        d_ = os.path.dirname(d_)
    root = git("rev-parse", "--show-toplevel", cwd=d_) if d_ and os.path.isdir(d_) else ""
    # 5. agent-surface-reviewer: Write/Edit to scratch/**.md under the repo
    # root only (a path outside any repo is refused too); no escape hatch.
    if REPORTER:
        rel_ = os.path.relpath(file, root).replace(os.sep, "/") if root else ".."
        if tool == "Bash" or rel_.startswith("..") or not REPORTER_OK.match(rel_):
            block(f"{rel_ if root else file}{f' (via Bash: {how})' if tool == 'Bash' else ''}: " + REPORTER_MSG,
                  root or os.getcwd(), hatch=False)
    if READONLY:
        rel_ = os.path.relpath(file, root).replace(os.sep, "/") if root else ".."
        outside = rel_.startswith("..")
        if outside and "/scratchpad" in file.replace(os.sep, "/"):
            pass   # the session scratchpad outside the repo is the reporter's own
        elif not root or outside or not READONLY_OK.match(rel_):
            block(f"{rel_ if root else file}{f' (via Bash: {how})' if tool in ('Bash', 'Remove') else ''}: {agent} is a "
                  "read-only reporter (.claude/agents/README.md): it writes only scratch/** and artifacts/**; put the "
                  "finding in its report instead.", root or os.getcwd(), hatch=False)
    if not root:
        return
    # 6. Gate receipts (WP-L4, 2026-10-27; Bryce's grant on the receipt doors): only the gate scripts write
    # artifacts/{merge,ready,launch}-gate/ and only launch-page.py writes artifacts/launch/ (the quota page the
    # launch receipt is bound to). A hand-written receipt was the whole bypass; no escape hatch, any agent.
    rel_g = os.path.relpath(file, root).replace(os.sep, "/")
    if RECEIPT_DIR.match(rel_g):
        block(f"{rel_g}{f' (via Bash: {how})' if tool in ('Bash', 'Remove') else ''}: gate receipts are written only by "
              "their gate (`node tools/ci/ready-gate.mjs --pr <n>`, `node tools/ci/launch-gate.mjs "
              "artifacts/launch/self.json`) and the quota page only by the launch-page.py hook. Run the gate instead.",
              root, hatch=False)
    # pass 4 (H5): a subagent never creates an escape hatch (an active hatch is announced by bash-guard.sh, whose
    # stdout is context; this hook's stdout is its decision, so nothing is printed here).
    if IN_SUBAGENT and os.path.basename(file) in HATCHES and os.path.dirname(file).endswith(".claude"):
        block(f".claude/{os.path.basename(file)}: a subagent cannot lift a guard (AGENTS.md rule 10); ask the parent.", root, hatch=False)
    # The escape hatch covers rules 1 and 3 (an ASSIGNED edit to a generated or
    # shared-contract file). It never covers rule 2: a source edit under a live
    # Playwright run corrupts the run whoever assigned it, so that check runs
    # first, flag or no flag (2026-09-22; before, the flag skipped every rule).
    allow = os.path.exists(os.path.join(root, ".claude", "allow-protected"))
    rel = os.path.relpath(file, root)
    base = os.path.basename(file)
    via = f" (via Bash: {how})" if tool in ("Bash", "Remove") else ""

    # 4. track-surveyor writes only circuit defs and their scenery closures
    # (js/circuits/<id>.js, js/circuits/scenery/<id>.js) plus scratch/ and
    # artifacts/; no escape hatch. Which circuit is the parent's brief — a
    # hook cannot read it — so any id passes and the parent's diff check stays.
    if SURVEYOR and not rel.startswith("..") and not SURVEYOR_OK.match(rel.replace(os.sep, "/")):
        block(f"{rel}{via}: track-surveyor writes only js/circuits/<id>.js, js/circuits/scenery/<id>.js, "
              "scratch/ and artifacts/ (.claude/agents/track-surveyor.md). Report the change for the parent instead.",
              root, hatch=False)

    if re.match(r"(js|css)/", rel) or rel == "index.html":
        if live_playwright_in(root):
            block(f"{rel}{via}: a Playwright run is live and tests serve js/, css/ and index.html from the "
                  "working tree (AGENTS.md §Verification 2). Wait for the reporter's "
                  "'= run …' line or `node tools/ci/test-bg.mjs --stop`, then retry.", root, hatch=False)

    # A conflict-side or committed-source git restore (shellparse kind
    # "git-resolve") writes content git already holds: rules 1 and 3 (no HAND
    # edit of a generated or shared-contract file) do not apply. Rule 2 and the
    # scoped-agent rules above already ran (2026-10-15).
    if how == "git-resolve":
        return

    # Shared safety bans 1 and 2 (Fleet A + D, Bryce 2026-10-22), no escape hatch:
    # a ceiling rises only through the commit hook's --auto-raise, and a
    # ratchets.d fragment belongs to its branch. This branch's own fragment may
    # be lowered or reverted by hand (a headroom-only raise backed out); a
    # foreign one is never touched, and nothing here may RAISE a ceiling.
    rel_ = rel.replace(os.sep, "/")
    frag = rel_.startswith("tests/data/ratchets.d/") and rel_.endswith(".json")
    if frag or rel_ == "tests/data/ratchets.json":
        if frag:
            branch = git("rev-parse", "--abbrev-ref", "HEAD", cwd=d_)
            own = fragment_name(branch)
            # sync-pr.mjs leaves the session on sync-pr-<branch>, which merges back into <branch>
            mine = {own, fragment_name(branch[len("sync-pr-"):]) if branch.startswith("sync-pr-") else None} - {None}
            if os.path.basename(rel_) not in mine:
                block(f"{rel}{via} is another branch's ratchet fragment (this branch's is "
                      f"{('tests/data/ratchets.d/' + own) if own else 'none: detached HEAD or the deploy branch'}). "
                      "A fragment belongs to the branch that wrote it (shared safety ban 2); a merge brings it, "
                      "--fold sums it.", root, hatch=False)
        # ratchets.json without the hatch is refused below as GENERATED; the
        # hatch lifts that rule, never this one.
        why = ratchet_raise(file, tool, ti, proposed, frag) if frag or allow else None
        if why:
            block(f"{rel}{via} {why} (shared safety ban 1). A ceiling rises only through the commit hook's "
                  "ratchets.mjs --auto-raise (<= 40 lines of real growth); extract code to fit, or ask Bryce.",
                  root, hatch=False)
        if frag:
            return   # this branch's own fragment, lowered or reverted by hand (#2291)

    if rel in GENERATED and not allow:
        block(f"{rel}{via} is GENERATED — {GENERATED[rel]}. Edit the source and run the generator.", root)

    if rel in ("index.html", "sw.js") and not allow and touches_generated_block(file, tool, ti, proposed):
        block(f"{rel}{via}: the edit touches a @gen-shell block. gen-shell.mjs writes the script "
              "tags from tools/manifest.cjs and title-art.mjs writes @gen-shell:title-art from "
              "js/car/car3d.js. Edit the SOURCE and run `npm run gen`.", root)

    if rel == "package.json":
        # A whole-file Write carries no old_string to match, so the Edit branch's
        # pattern saw nothing and a Write rewrote the generated block unguarded.
        # Compare the test:* map itself instead: any add, drop or reword is the
        # same edit the Edit branch refuses. Unparseable new content is refused
        # too — gen-test-groups is the only thing that should be writing here.
        if tool in ("Edit", "MultiEdit"):
            edits = ti.get("edits") or [ti]
            hit = any(re.search(r'"test:[^"\n]*"\s*:', e.get(key) or "")
                      for e in edits for key in ("old_string", "new_string"))
            # Also catch an edit matching only a command VALUE, escaped key or
            # enclosing scripts object. Parse the proposed document, not just keys
            # carried in the tool payload. MultiEdit applies in request order.
            try:
                current = open(file, encoding="utf8").read()
                prop = current
                for e in edits:
                    old = e.get("old_string") or ""
                    if old and old in prop:
                        prop = prop.replace(old, e.get("new_string") or "",
                                            -1 if e.get("replace_all") else 1)
                before, after = test_scripts(current), test_scripts(prop)
                hit = hit or after is None or (before is not None and after != before)
            except Exception:
                pass
        elif tool == "Write" or proposed is not None:
            try:
                cur_scripts = test_scripts(open(file, encoding="utf8").read())
            except Exception:
                cur_scripts = None
            new_scripts = test_scripts(proposed if proposed is not None else (ti.get("content") or ""))
            hit = new_scripts is None or (cur_scripts is not None and new_scripts != cur_scripts)
        else:
            hit = tool == "Bash"   # a blind rewrite (redirect, tee, append)
        if hit and not allow:
            block(f"package.json{via}: test:* scripts are GENERATED from tests/groups.json by "
                  "node tools/gen/gen-test-groups.mjs. Edit groups.json (add a new key to "
                  "package.json first) and regenerate.", root)

    # Everything below is what the escape hatch is FOR.
    if allow:
        return

    # --- linked worktree: shared-contract files belong to the main session ----
    gitdir = git("rev-parse", "--git-dir", cwd=d_)
    common = git("rev-parse", "--git-common-dir", cwd=d_)
    if gitdir and common and gitdir != common and base in (
        "index.html", "manifest.cjs", "version.json", "sw.js", "roster.js",
        "gen-shell.mjs", "package.json", "package-lock.json", "playwright.config.js",
    ):
        block(f"{base}{via} is a shared-contract file (load order / cache / shell) owned by the main "
              "session — worktree agents must not edit it. Report the needed change in your summary instead.", root)


if tool == "Bash":
    cmd = ti.get("command") or ""
    if not cmd:
        sys.exit(0)
    if READONLY and READONLY_GIT.search(cmd):
        block(f"`{cmd[:80]}`: {agent} is a read-only reporter and never commits, pushes or rewrites the tree "
              "(.claude/agents/README.md); report the change for the parent instead.", d.get("cwd") or os.getcwd(), hatch=False)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    try:
        import shellparse
        targets = shellparse.write_targets(cmd, d.get("cwd") or os.getcwd())
    except Exception as e:
        # FAIL CLOSED (2026-10-28; it failed open, loudly, since 2026-10-14): a parser bug must not leave a Bash
        # write unguarded. write_targets reads unparseable text best-effort, so this is a real crash.
        sys.stderr.write(f"BLOCKED: protect-files could not read this command's file writes (shellparse "
                         f"{type(e).__name__}: {e}), so it is refused (fail closed). Report the hook error.\n")
        sys.exit(2)
    removed = {p_ for p_, _h in ratchet_removals(cmd, d.get("cwd") or os.getcwd())}
    for t in targets:
        if t["kind"] in ("rm", "unlink") and os.path.realpath(t["path"]) in removed:
            continue   # a ratchet file removed: judged once below as a removal, not as a blind rewrite
        proposed = None
        if os.path.basename(t["path"]) in ("index.html", "sw.js", "package.json"):
            # Compute what the call would leave in the file when that is safe
            # to know: a sandboxed sed (no e/r/w commands), or a cp's source.
            if t.get("sim") and os.path.isfile(t["path"]):
                try:
                    r = subprocess.run([*t["sim"], t["path"]], capture_output=True, text=True,
                                       timeout=5, cwd=t.get("cwd") or None)
                    if r.returncode == 0:
                        proposed = r.stdout
                except Exception:
                    proposed = None
            elif t.get("src") and os.path.isfile(t["src"]):
                try:
                    proposed = open(t["src"], encoding="utf8").read()
                except Exception:
                    proposed = None
        check(t["path"], "Bash", {}, proposed, t["kind"])
    for path_ in sorted(removed):
        check(path_, "Remove", {}, None, "a removal")
    if REPORTER:
        for t in shellparse.surveyor_targets(cmd, d.get("cwd") or os.getcwd()):
            if t["path"] is None:
                block(f"{t['kind']} (via Bash) rewrites the whole tree: " + REPORTER_MSG,
                      d.get("cwd") or os.getcwd(), hatch=False)
            check(t["path"], "Bash", {}, None, t["kind"] + " — a removal")
    if SURVEYOR:
        # Removals and whole-tree git moves are writes too (round 2): `mv js/game.js
        # scratch/`, `rm -rf js/track`, `git stash`, `git reset --hard`, `git switch`.
        for t in shellparse.surveyor_targets(cmd, d.get("cwd") or os.getcwd()):
            if t["path"] is None:
                block(f"{t['kind']} (via Bash) rewrites the whole tree: track-surveyor writes only js/circuits/<id>.js, "
                      "js/circuits/scenery/<id>.js, scratch/ and artifacts/ (.claude/agents/track-surveyor.md). "
                      "Report it for the parent instead.", d.get("cwd") or os.getcwd(), hatch=False)
            check(t["path"], "Bash", {}, None, t["kind"] + " — a removal")
    sys.exit(0)

file = ti.get("file_path") or ti.get("notebook_path") or ""
if not file:
    sys.exit(0)
check(file, tool, ti)
