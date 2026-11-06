"""protect-files.py — PreToolUse guard for Write / Edit / MultiEdit / NotebookEdit.

Two rules (AGENTS.md rule 11 and rule 10), read from the hook payload on stdin:

  1. A GENERATED file is never hand-edited, in any checkout: every path in
     tools/lib/generated-paths.mjs GENERATED_PATHS plus js/roster.js,
     tools/carview.html, CHANGELOG.md and tests/data/ratchets.d/*.json outright;
     index.html and sw.js only inside their @gen-shell blocks; package.json only
     its test:* scripts (source: tests/groups.json). `npm run gen:check` in
     test:guards and CI is the backstop for every other generated artifact.
  2. Inside a LINKED worktree the shared-contract files stay the main session's:
     index.html, manifest.cjs, version.json, sw.js, roster.js, gen-shell.mjs,
     package.json, package-lock.json, playwright.config.js.

Escape hatch for a deliberately ASSIGNED edit: `touch .claude/allow-protected`
at the repo root and retry (remove it when done); a subagent cannot create it
(hook payloads from a subagent carry agent_id). Bash writes are not read here
(the 2,200-line shell parser went with plan §4.7); the pre-commit gen:check and
the parent's diff are the backstops. Exit 2 refuses with the reason on stderr;
an unreadable payload is a refusal (fail closed).
"""
import json, os, re, subprocess, sys

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
IN_SUBAGENT = bool(d.get("agent_id")) or bool(d.get("agent_type")) or "/subagents/" in str(d.get("transcript_path") or "")
HOOKS_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SHARED = ("index.html", "manifest.cjs", "version.json", "sw.js", "roster.js",
          "gen-shell.mjs", "package.json", "package-lock.json", "playwright.config.js")
EXTRA_GENERATED = {
    "js/roster.js": "node tools/gen/gen-shell.mjs writes it from tools/manifest.cjs",
    "tools/carview.html": "node tools/gen/gen-shell.mjs writes it from tools/manifest.cjs",
    "CHANGELOG.md": "a PR adds a fragment docs/changelog.d/<slug>.md; node tools/gen/gen-changelog.mjs --fold writes it",
    "tests/data/ratchets.json": "node tools/check/ratchets.mjs --update (or the commit hook's --auto-raise) writes it",
}


def git(*args, cwd):
    try:
        return subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True).stdout.strip()
    except Exception:
        return ""


def generated_paths():
    """GENERATED_PATHS from tools/lib/generated-paths.mjs (the one home), plus the hook's own extras."""
    out = dict(EXTRA_GENERATED)
    try:
        src = open(os.path.join(HOOKS_ROOT, "tools/lib/generated-paths.mjs"), encoding="utf8").read()
        block = re.search(r"GENERATED_PATHS\s*=\s*Object\.freeze\(\[(.*?)\]\)", src, re.S)
        for p in re.findall(r'"([^"]+)"', block.group(1) if block else ""):
            out.setdefault(p, "a generator writes it (tools/lib/generated-paths.mjs; `npm run gen`)")
    except Exception:
        pass
    out.pop("package.json", None)          # only its test:* scripts are generated: judged below
    return out


def block(msg, root, hatch=True):
    tail = (" If this edit was explicitly assigned, run: touch " + os.path.join(root, ".claude/allow-protected")
            + " and retry.") if hatch else ""
    sys.stderr.write("BLOCKED: " + msg + tail + "\n")
    sys.exit(2)


def gen_blocks(text):
    """[(start, end)] of every @gen-shell block: markers come in begin/end pairs."""
    marks = list(re.finditer(r"@gen-shell[^\n]*", text))
    return [(marks[i].start(), marks[i + 1].end() if i + 1 < len(marks) else len(text)) for i in range(0, len(marks), 2)]


def proposed_text(cur):
    """The file after this call, or None when the tool is not one of ours."""
    if tool in ("Edit", "MultiEdit"):
        new = cur
        for e in ti.get("edits") or [ti]:
            old = e.get("old_string") or ""
            if old and old in new:
                new = new.replace(old, e.get("new_string") or "", -1 if e.get("replace_all") else 1)
        return new
    if tool == "Write":
        return ti.get("content") or ""
    return None


def test_scripts(text):
    try:
        return {k: v for k, v in (json.loads(text).get("scripts") or {}).items() if k.startswith("test:")}
    except Exception:
        return None


file = ti.get("file_path") or ti.get("notebook_path") or ""
if not file:
    sys.exit(0)
file = os.path.realpath(file)                     # a symlink is judged as its target
d_ = os.path.dirname(file) or "."
while d_ and d_ != "/" and not os.path.isdir(d_):
    d_ = os.path.dirname(d_)
root = git("rev-parse", "--show-toplevel", cwd=d_) if os.path.isdir(d_) else ""
if not root:
    sys.exit(0)
rel = os.path.relpath(file, root).replace(os.sep, "/")
base = os.path.basename(file)
if IN_SUBAGENT and base == "allow-protected" and os.path.dirname(file).endswith(".claude"):
    block(".claude/allow-protected: a subagent cannot lift a guard (AGENTS.md rule 10); ask the parent.", root, hatch=False)
if os.path.exists(os.path.join(root, ".claude", "allow-protected")):
    sys.exit(0)                                    # an assigned edit: both rules lifted

try:
    cur = open(file, encoding="utf8").read()
except Exception:
    cur = ""
gen = generated_paths()
if rel in gen or (rel.startswith("tests/data/ratchets.d/") and rel.endswith(".json")):
    why = gen.get(rel, "the commit hook's ratchets.mjs --auto-raise writes a branch's fragment")
    block(f"{rel} is GENERATED — {why}. Edit the source and run the generator.", root)
if rel in ("index.html", "sw.js"):
    new = proposed_text(cur)
    if new is not None and [cur[s:e] for s, e in gen_blocks(cur)] != [new[s:e] for s, e in gen_blocks(new)]:
        block(f"{rel}: the edit touches a @gen-shell block. gen-shell.mjs writes the script tags from tools/manifest.cjs "
              "and title-art.mjs writes @gen-shell:title-art. Edit the SOURCE and run `npm run gen`.", root)
if rel == "package.json":
    new = proposed_text(cur)
    if new is not None and (test_scripts(new) is None or test_scripts(new) != test_scripts(cur)):
        block("package.json: test:* scripts are GENERATED from tests/groups.json by node tools/gen/gen-test-groups.mjs. "
              "Edit groups.json and regenerate.", root)

# Absolute both: from a subdirectory git prints --git-dir absolute and --git-common-dir relative (2026-10-30).
gitdir = git("rev-parse", "--path-format=absolute", "--git-dir", cwd=d_)
common = git("rev-parse", "--path-format=absolute", "--git-common-dir", cwd=d_)
if gitdir and common and gitdir != common and base in SHARED:
    block(f"{base} is a shared-contract file (load order / cache / shell) owned by the main session — worktree agents "
          "must not edit it. Report the needed change in your summary instead.", root)
