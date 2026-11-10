"""protect-files.py — PreToolUse guard for Write / Edit / NotebookEdit (wired through protect-files.sh; Cursor reaches
it through .cursor/hooks/edit-guard.sh).

Rules, read from the hook payload on stdin, all on the REPO-RELATIVE path of the target:

  1. A GENERATED file is never hand-edited (AGENTS.md rule 11). The list is derived, never copied:
       * whole files: GENERATED_PATHS and BUILT_PATHS of tools/lib/generated-paths.mjs, the generator targets
         (tools/gen/targets.mjs GENERATORS, tools/gen/gen-shell.mjs TARGETS) that carry no block markers,
         CHANGELOG.md, tests/data/ratchets.d/*.json, .cursor/rules/*.mdc (but the hand-written ones
         gen-cursor-rules.mjs names in HAND_WRITTEN) and locales/en.json + locales/manifest.json;
       * blocks only: a target that carries marker lines (`@gen-shell:x` in index.html, sw.js, controller.html,
         tools/carview.html; `<!-- @gen-arch:modules -->`, `<!-- GENERATED: x -->` in the doc tables), each block
         running from its opener to the next marker line:
         an edit outside the blocks passes, an edit that changes a block does not;
       * package.json: only its test:* scripts (generated from tests/groups.json).
     The list must load: a generator list this hook cannot read is a refusal (exit 2), never a shorter list.
  2. Inside a LINKED worktree the shared-contract files stay the main session's: index.html, tools/manifest.cjs,
     version.json, sw.js, js/roster.js, tools/gen/gen-shell.mjs, package.json, package-lock.json, playwright.config.js.
  3. A SUBAGENT (the payload's agent_id) never writes a guard: the .claude/allow-* hatches, .claude/hooks/,
     .claude/settings*.json, .githooks/, tools/hooks/, .mcp.json, .cursor/hooks*, .codex/hooks*.

The hatch for a deliberately ASSIGNED edit: the MAIN session creates an untracked `.claude/allow-protected`, retries,
and removes it after. It lifts rules 1 and 2 for the main session only, and while it exists every guarded call says
so (additionalContext) and the SessionStart line names it. Bash writes are judged by bash-guard.py for subagents
only; `npm run gen:check` in test:guards and CI is the backstop. A seatbelt against accidents, not a boundary.
Exit 2 refuses with the reason on stderr; an unreadable payload is a refusal (fail closed).
"""
import json
import os
import re
import subprocess
import sys

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
IN_SUBAGENT = isinstance(d.get("agent_id"), str) and d.get("agent_id").strip() != ""
SHARED = ("index.html", "tools/manifest.cjs", "version.json", "sw.js", "js/roster.js", "tools/gen/gen-shell.mjs",
          "package.json", "package-lock.json", "playwright.config.js")
GUARD = re.compile(r"^(\.claude/(hooks/|settings(\.local)?\.json$|allow-[\w.-]+$)|\.githooks/|tools/hooks/|\.mcp\.json$|"
                   r"\.cursor/hooks(\.json$|/)|\.codex/hooks(\.json$|/))")
WHY_GEN = "a generator writes it (`npm run gen`; the list: tools/lib/generated-paths.mjs and tools/gen/targets.mjs)"


def git(*args, cwd):
    try:
        return subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True, timeout=10).stdout.strip()
    except Exception:
        return ""


def fail(msg):
    sys.stderr.write("BLOCKED: " + msg + "\n")
    sys.exit(2)


def js_strings(src, name):
    """The string literals of `export const NAME = [ … ]` / `Object.freeze([ … ])` / `new Set([ … ])` in src, or None."""
    m = re.search(r"\b" + re.escape(name) + r"\s*=\s*(?:Object\.freeze\(|new Set\()?\[(.*?)\]", src, re.S)
    if not m:
        return None
    out = []
    for item in (x.strip() for x in m.group(1).split(",")):
        lit = re.fullmatch(r'"([^"]+)"', item)
        ref = re.search(r"\bconst\s+" + re.escape(item) + r"\s*=\s*\"([^\"]+)\"", src) if re.fullmatch(r"[A-Za-z_]\w*", item) else None
        if lit or ref:
            out.append((lit or ref).group(1))
        elif item:
            return None                           # an element this reader cannot resolve
    return out


def generator_targets(root):
    """Every path a doc / shell generator writes (tools/gen/targets.mjs GENERATORS + gen-shell TARGETS)."""
    gen = os.path.join(root, "tools/gen")
    src = open(os.path.join(gen, "targets.mjs"), encoding="utf8").read()
    mods = js_strings(src, "GENERATORS")
    if not mods:
        raise ValueError("tools/gen/targets.mjs: GENERATORS not found")
    out = []
    for rel in mods:
        g = open(os.path.normpath(os.path.join(gen, rel)), encoding="utf8").read()
        listed = js_strings(g, "TARGETS")
        one = re.search(r"export const TARGET\s*=\s*\"([^\"]+)\"", g)
        if listed:
            out += listed
        elif one:
            out.append(one.group(1))
        else:                                   # a computed TARGET: ask node, once
            r = subprocess.run(["node", os.path.join(gen, "targets.mjs")], capture_output=True, text=True, timeout=20)
            if r.returncode != 0:
                raise ValueError("node tools/gen/targets.mjs failed: " + (r.stderr or "")[:200])
            return sorted(set(r.stdout.split()) | set(out) | set(shell_targets(gen)))
    return sorted(set(out) | set(shell_targets(gen)))


def shell_targets(gen):
    t = js_strings(open(os.path.join(gen, "gen-shell.mjs"), encoding="utf8").read(), "TARGETS")
    if not t:
        raise ValueError("tools/gen/gen-shell.mjs: TARGETS not found")
    return t


def generated(root):
    """(whole-file map rel → why, block-mode set). Raises when a source list cannot be read."""
    src = open(os.path.join(root, "tools/lib/generated-paths.mjs"), encoding="utf8").read()
    gp, bp = js_strings(src, "GENERATED_PATHS"), js_strings(src, "BUILT_PATHS")
    if gp is None or bp is None:
        raise ValueError("tools/lib/generated-paths.mjs: GENERATED_PATHS / BUILT_PATHS not found")
    whole = {p: WHY_GEN for p in gp}
    whole.update({p: "it is BUILT, never committed: node tools/gen/ensure-built.mjs writes it (BUILT_PATHS)" for p in bp})
    whole["CHANGELOG.md"] = "a PR adds a fragment docs/changelog.d/<slug>.md; node tools/gen/gen-changelog.mjs --fold writes it"
    whole["tests/data/ratchets.json"] = "node tools/check/ratchets.mjs --update (or the commit hook's --auto-raise) writes it"
    for p in ("locales/en.json", "locales/manifest.json"):
        whole[p] = "node tools/gen/gen-locales.mjs writes it from the I18n call sites"
    blocks = set()
    for t in generator_targets(root):
        try:
            text = open(os.path.join(root, t), encoding="utf8").read()
        except OSError:
            text = ""
        if t not in whole and MARK.search(text):
            blocks.add(t)
        else:
            whole.setdefault(t, WHY_GEN)
    whole.pop("package.json", None)             # only its test:* scripts are generated: judged below
    blocks.discard("package.json")
    return whole, blocks


def mdc_generated(root, rel):
    if not re.match(r"^\.cursor/rules/[^/]+\.mdc$", rel):
        return False
    src = open(os.path.join(root, "tools/gen/gen-cursor-rules.mjs"), encoding="utf8").read()
    hand = js_strings(src, "HAND_WRITTEN")
    if hand is None:
        raise ValueError("tools/gen/gen-cursor-rules.mjs: HAND_WRITTEN not found")
    return os.path.basename(rel) not in hand


MARK = re.compile(r"^[ \t]*(?:<!--|//)[ \t]*/?(?:@gen-[\w-]+|GENERATED\b)[^\n]*", re.M)


def gen_blocks(text):
    """The generated spans of a file: consecutive marker lines (`<!-- @gen-x -->` / `// @gen-shell:x` /
    `<!-- GENERATED: x -->` and their closers) paired open/close, the marked text included."""
    marks = list(MARK.finditer(text))
    return [text[marks[i].start():(marks[i + 1].end() if i + 1 < len(marks) else len(text))] for i in range(0, len(marks), 2)]


def proposed_text(cur):
    """The file after this call, or None when the call's result cannot be computed (NotebookEdit, an unknown tool)."""
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


file = ti.get("file_path") or ti.get("notebook_path") or ti.get("path") or ""
if not isinstance(file, str) or not file:
    sys.exit(0)
file = os.path.realpath(file)                     # a symlink is judged as its target
d_ = os.path.dirname(file) or "."
while d_ and d_ != "/" and not os.path.isdir(d_):
    d_ = os.path.dirname(d_)
root = git("rev-parse", "--show-toplevel", cwd=d_) if os.path.isdir(d_) else ""
if not root:
    sys.exit(0)
root = os.path.realpath(root)
rel = os.path.relpath(file, root).replace(os.sep, "/")
if rel.startswith("../"):
    sys.exit(0)

if IN_SUBAGENT and GUARD.match(rel):
    fail("%s is a guard (a .claude/allow-* hatch, a hook, settings, .githooks, tools/hooks, .mcp.json or a host's hook "
         "config): a subagent never writes one (AGENTS.md rule 10). Report the change for the parent." % rel)

APEX_TREE = os.path.exists(os.path.join(root, "tools/lib/generated-paths.mjs"))   # else another clone: no generated list
hatch = os.path.exists(os.path.join(root, ".claude", "allow-protected")) and not IN_SUBAGENT
lifted = []


def block(msg):
    if hatch:
        lifted.append(msg)
        return
    fail(msg + " If this edit was explicitly assigned, the MAIN session runs: touch "
         + os.path.join(root, ".claude/allow-protected") + " , retries, and removes it after.")


try:
    whole, blocks = generated(root) if APEX_TREE else ({}, set())
    mdc = mdc_generated(root, rel) if APEX_TREE else False
except Exception as e:
    fail("protect-files could not load the generated-file list (%s: %s), so it cannot tell whether %s is generated and "
         "refuses the edit (fail closed). Report the hook error." % (type(e).__name__, str(e)[:200], rel))

try:
    cur = open(file, encoding="utf8").read()
except Exception:
    cur = ""
if rel in whole or mdc or (rel.startswith("tests/data/ratchets.d/") and rel.endswith(".json")):
    why = whole.get(rel) or ("node tools/gen/gen-cursor-rules.mjs writes it from .claude/rules/" if mdc
                             else "the commit hook's ratchets.mjs --auto-raise writes a branch's fragment")
    block(f"{rel} is GENERATED — {why}. Edit the source and run the generator.")
elif rel in blocks:
    new = proposed_text(cur)
    if new is None or gen_blocks(cur) != gen_blocks(new):
        block(f"{rel}: the edit touches a generated block (between @gen-… / GENERATED markers). gen-shell.mjs and the doc "
              "generators write those from their sources; edit the SOURCE and run `npm run gen`.")
if rel == "package.json":
    new = proposed_text(cur)
    if new is None or test_scripts(new) is None or test_scripts(new) != test_scripts(cur):
        block("package.json: test:* scripts are GENERATED from tests/groups.json by node tools/gen/gen-test-groups.mjs. "
              "Edit groups.json and regenerate.")

# Absolute both: from a subdirectory git prints --git-dir absolute and --git-common-dir relative (2026-10-30).
gitdir = git("rev-parse", "--path-format=absolute", "--git-dir", cwd=d_)
common = git("rev-parse", "--path-format=absolute", "--git-common-dir", cwd=d_)
if gitdir and common and gitdir != common and rel in SHARED:
    block(f"{rel} is a shared-contract file (load order / cache / shell) owned by the main session — worktree agents "
          "must not edit it. Report the needed change in your summary instead.")

if hatch:
    note = ("protect-files: .claude/allow-protected is ACTIVE in %s — " % root) + (
        "it lifted: " + " | ".join(m.split(" — ")[0] for m in lifted) if lifted else "no rule applied to " + rel)
    note += ". Remove the file (rm .claude/allow-protected) as soon as the assigned edit is done."
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "additionalContext": note}}))
sys.exit(0)
