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

try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
ti = d.get("tool_input") or {}
tool = d.get("tool_name") or ""


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
    "js/roster.js": "node tools/gen/gen-shell.mjs writes it from tools/manifest.cjs",
    "tools/carview.html": "node tools/gen/gen-shell.mjs writes it from tools/manifest.cjs",
    "tools/README.md": "node tools/gen/gen-tools-readme.mjs writes it from the tools' @doc headers",
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
    d_ = os.path.dirname(file) or "."
    while d_ and d_ != "/" and not os.path.isdir(d_):   # a Bash write may create the directory
        d_ = os.path.dirname(d_)
    root = git("rev-parse", "--show-toplevel", cwd=d_) if d_ and os.path.isdir(d_) else ""
    if not root:
        return
    # The escape hatch covers rules 1 and 3 (an ASSIGNED edit to a generated or
    # shared-contract file). It never covers rule 2: a source edit under a live
    # Playwright run corrupts the run whoever assigned it, so that check runs
    # first, flag or no flag (2026-09-22; before, the flag skipped every rule).
    allow = os.path.exists(os.path.join(root, ".claude", "allow-protected"))
    rel = os.path.relpath(os.path.realpath(file) if os.path.exists(file) else file, root)
    base = os.path.basename(file)
    via = f" (via Bash: {how})" if tool == "Bash" else ""

    if re.match(r"(js|css)/", rel) or rel == "index.html":
        if live_playwright_in(root):
            block(f"{rel}{via}: a Playwright run is live and tests serve js/, css/ and index.html from the "
                  "working tree (AGENTS.md §Verification 2). Wait for the reporter's "
                  "'= run …' line or `node tools/ci/test-bg.mjs --stop`, then retry.", root, hatch=False)

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
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    try:
        import shellparse
        targets = shellparse.write_targets(cmd, d.get("cwd") or os.getcwd())
    except Exception:
        sys.exit(0)
    for t in targets:
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
    sys.exit(0)

file = ti.get("file_path") or ti.get("notebook_path") or ""
if not file:
    sys.exit(0)
check(file, tool, ti)
