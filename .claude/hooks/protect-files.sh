#!/bin/bash
# PreToolUse guard for Write/Edit/MultiEdit/NotebookEdit. Three rules from
# AGENTS.md that prose could only request, made deterministic:
#
#  1. §Verification 11 — a GENERATED file is never hand-edited, in any
#     checkout: version.json, js/roster.js, tools/carview.html, tools/README.md
#     outright; index.html and sw.js only inside their @gen-shell blocks;
#     package.json only on a test:* script line (source: tests/groups.json).
#  2. §Verification 2 — no js/, css/ or index.html edit while a `playwright
#     test` process is live (tests serve the working tree).
#  3. Inside a LINKED worktree (fixer agents) the shared-contract files stay
#     the main session's: index.html, manifest.cjs, sw.js, gen-shell.mjs,
#     package.json, package-lock.json, playwright.config.js.
#
# Escape hatch for a deliberately assigned edit: `touch .claude/allow-protected`
# at the repo root and retry (remove it when done). It lifts rules 1 and 3
# only — rule 2 (a live Playwright run) holds regardless. Exit 2 blocks; the
# reason on stderr reaches the model.

INPUT=$(cat)
export INPUT
python3 - <<'PY'
import json, os, re, subprocess, sys

try:
    d = json.loads(os.environ["INPUT"])
except Exception:
    sys.exit(0)
ti = d.get("tool_input") or {}
tool = d.get("tool_name") or ""
file = ti.get("file_path") or ti.get("notebook_path") or ""
if not file:
    sys.exit(0)

def git(*args, cwd):
    try:
        return subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True).stdout.strip()
    except Exception:
        return ""

d_ = os.path.dirname(file) or "."
root = git("rev-parse", "--show-toplevel", cwd=d_) if os.path.isdir(d_) else ""
if not root:
    sys.exit(0)
# The escape hatch covers rules 1 and 3 (an ASSIGNED edit to a generated or
# shared-contract file). It never covers rule 2: a source edit under a live
# Playwright run corrupts the run whoever assigned it, so that check runs
# first, flag or no flag (2026-09-22; before, the flag skipped every rule).
allow = os.path.exists(os.path.join(root, ".claude", "allow-protected"))

rel = os.path.relpath(file, root)
base = os.path.basename(file)

def block(msg, hatch=True):
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
if rel in GENERATED and not allow:
    block(f"{rel} is GENERATED — {GENERATED[rel]}. Edit the source and run the generator.")

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

def touches_generated_block(path):
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
                if any(s <= at < en or s < at + len(old) <= en for s, en in spans):
                    return True
                at = cur.find(old, at + 1)
        return False
    if tool == "Write":
        new = ti.get("content") or ""
        cur_blocks = [cur[s:e] for s, e in spans]
        new_blocks = [new[s:e] for s, e in gen_blocks(new)]
        return cur_blocks != new_blocks
    return False

if rel in ("index.html", "sw.js") and not allow and touches_generated_block(file):
    block(f"{rel}: the edit touches a @gen-shell block. gen-shell.mjs writes the script "
          "tags from tools/manifest.cjs and title-art.mjs writes @gen-shell:title-art from "
          "js/car/car3d.js. Edit the SOURCE and run `npm run gen`.")

if rel == "package.json":
    # A whole-file Write carries no old_string to match, so the Edit branch's
    # pattern saw nothing and a Write rewrote the generated block unguarded.
    # Compare the test:* map itself instead: any add, drop or reword is the
    # same edit the Edit branch refuses. Unparseable new content is refused
    # too — gen-test-groups is the only thing that should be writing here.
    def test_scripts(text):
        try:
            return {k: v for k, v in (json.loads(text).get("scripts") or {}).items()
                    if k.startswith("test:")}
        except Exception:
            return None
    if tool in ("Edit", "MultiEdit"):
        edits = ti.get("edits") or [ti]
        hit = any(re.search(r'"test:[A-Za-z0-9_-]*"\s*:', e.get("old_string") or "") for e in edits)
    elif tool == "Write":
        try:
            cur_scripts = test_scripts(open(file, encoding="utf8").read())
        except Exception:
            cur_scripts = None
        new_scripts = test_scripts(ti.get("content") or "")
        hit = new_scripts is None or (cur_scripts is not None and new_scripts != cur_scripts)
    else:
        hit = False
    if hit and not allow:
        block("package.json test:* scripts are GENERATED from tests/groups.json by "
              "node tools/gen/gen-test-groups.mjs. Edit groups.json (add a new key to "
              "package.json first) and regenerate.")

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

if re.match(r"(js|css)/", rel) or rel == "index.html":
    if live_playwright_in(root):
        block(f"{rel}: a Playwright run is live and tests serve js/, css/ and index.html from the "
              "working tree (AGENTS.md §Verification 2). Wait for the reporter's "
              "'= run …' line or `node tools/ci/test-bg.mjs --stop`, then retry.", hatch=False)

# Everything below is what the escape hatch is FOR.
if allow:
    sys.exit(0)

# --- linked worktree: shared-contract files belong to the main session --------
gitdir = git("rev-parse", "--git-dir", cwd=d_)
common = git("rev-parse", "--git-common-dir", cwd=d_)
if gitdir and common and gitdir != common and base in (
    "index.html", "manifest.cjs", "version.json", "sw.js", "roster.js",
    "gen-shell.mjs", "package.json", "package-lock.json", "playwright.config.js",
):
    block(f"{base} is a shared-contract file (load order / cache / shell) owned by the main "
          "session — worktree agents must not edit it. Report the needed change in your summary instead.")
PY
