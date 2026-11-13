"""bash-guard.py — the rules behind .claude/hooks/bash-guard.sh (PreToolUse, Bash).

Every rule reads the SIMPLE COMMANDS of the tool call as .claude/hooks/shellparse.py tokenises them: each element of
a pipeline, list, subshell, group, if/while/case body, substitution, `bash -c` / `eval` script and a heredoc a shell
reads, with env prefixes and wrappers (`command`, `env`, `nice`, `timeout`, `sudo`, a leading backslash …) stripped.
A quoted string or a heredoc fed to anything but a shell is data: mentioning a rule never trips it.

  1. kills by name: `pkill` and `killall` in any spelling, `pgrep`/`pidof` piped or substituted into `kill`; a
     `kill <pid>` of a Chromium unless that kill carries `APEX_KILL_OK=1` (you listed the pid yourself).
  2. a subagent (the payload's `agent_id`) never starts a browser run: the Playwright test runner and binary, a
     Chromium binary, `npm test` / `npm run test` / a browser test group, test-bg (but --status/--tail/--stop),
     verify-change without --fast/--plan, the chrome daemon, the phone-browser server, an apex-tools CLI call of a
     browser tool. Every in-repo launcher refuses on its own through tools/lib/harness.mjs launchChromium when
     APEX_SUBAGENT is set, which this hook exports into a subagent's node / npm / shell commands (updatedInput).
     A subagent also never writes the .claude/allow-* hatches or a guard file.
  3. the commit gate stays reachable: no `git commit --no-verify` / `-n`, no core.hooksPath write or `-c` override.
  4. no `gh run cancel`, `gh pr merge`, `gh pr ready` (global flags such as `-R` included) or their REST / GraphQL
     forms through `gh api`.
  5. no GitHub write from a shell (owner decision 2026-11-11): a write on the gh token is recorded as Bryce's own act,
     with no app marker, so agents write through the GitHub MCP tools. Refused: every gh subcommand that is not a
     known read (an alias or extension too), `gh api` with a non-GET method or with fields / --input and no explicit
     GET, a GraphQL mutation, a curl / wget write to api.github.com, and an agent setting APEX_GH_OWNER_WRITE.

A command the tokeniser cannot parse is refused (fail closed). These rules catch accidents; they are not a security
boundary: a verb built at run time, a script file, or a path outside this list passes, and the server-side ruleset
(Deploy-reset), .githooks/pre-push and CI are what actually bind.

Exit 2 refuses with the reason on stderr; exit 0 with no output lets the permission flow decide; exit 0 with JSON
carries the subagent marker as updatedInput (no permissionDecision, so the normal flow still decides).
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shellparse import ParseError, commands, SHELLS  # noqa: E402

ROOT = os.environ.get("CLAUDE_PROJECT_DIR") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
KILL_HOW = ("Stop a run with 'node tools/ci/test-bg.mjs --stop'; kill an orphan Chrome by PID from a listed set "
            "(ps -eo pid,comm | awk '$2==\"chrome\"{print $1}'), then 'APEX_KILL_OK=1 kill <pid>'.")
SUB_HOW = ("a subagent never starts a browser run (AGENTS.md §Verification 10): one browser saturates this box and the "
           "parent owns it. Run the node-only checks (verify-change.mjs --fast, node --test, verify-track.cjs) and report "
           "the browser groups as NOT RUN.")
CHROME = re.compile(r"^(chrome|chromium|chromium-browser|google-chrome(-\w+)?|headless_shell|chrome-headless-shell|chrome-linux\d*)$")
GUARD_FILES = re.compile(r"(^|/)(\.claude/(hooks/|settings(\.local)?\.json$|allow-[\w-]+$)|\.githooks/|tools/hooks/|"
                         r"\.mcp\.json$|\.cursor/hooks|\.codex/hooks)")


def refuse(msg):
    sys.stderr.write("BLOCKED: " + msg + "\n")
    sys.exit(2)


def has_help(args):
    return any(a in ("--help", "-h", "help") for a in args)


# --- shared readers -------------------------------------------------------------------------------------------
def git_split(argv):
    """(subcommand, its args, the -c overrides) of a git argv, past git's global options."""
    i, overrides = 1, []
    while i < len(argv):
        a = argv[i]
        if a in ("-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--config-env"):
            if a == "-c" and i + 1 < len(argv):
                overrides.append(argv[i + 1])
            i += 2
            continue
        if a.startswith("-c") and len(a) > 2:
            overrides.append(a[2:])
        if a.startswith("--config-env="):
            overrides.append(a.split("=", 1)[1])
        if a.startswith("-"):
            i += 1
            continue
        return a, argv[i + 1:], overrides
    return "", [], overrides


def gh_split(argv):
    """The positional words of a gh argv past its global flags (-R/--repo/--hostname take a value)."""
    out, i = [], 1
    while i < len(argv):
        a = argv[i]
        if a in ("-R", "--repo", "--hostname"):
            i += 2
            continue
        if a.startswith(("--repo=", "--hostname=")) or (a.startswith("-R") and len(a) > 2):
            i += 1
            continue
        out.append(a)
        i += 1
    return out


def write_targets(c):
    """Paths this simple command writes: redirection targets and the file arguments of the write verbs."""
    out = [t for op, t in c.redirs if op in (">", ">>", ">|", "&>", "&>>", "<>") and t and not t.startswith("/dev/")]
    a, p = c.argv, c.prog
    args = [x for x in a[1:] if not x.startswith("-")]
    if p in ("touch", "tee", "rm", "unlink", "truncate", "shred", "rmdir", "mkdir"):
        out += args
    elif p in ("cp", "mv", "ln", "install", "rsync") and args:
        out.append(args[-1])
    elif p in ("sed", "perl") and any(x.startswith("-i") or x == "--in-place" or (x.startswith("-") and not x.startswith("--") and "i" in x[1:]) for x in a[1:]):
        out += args[1:]
    elif p == "dd":
        out += [x[3:] for x in a[1:] if x.startswith("of=")]
    return out


# --- 1. kills by name -----------------------------------------------------------------------------------------
def rule_kill(cmds):
    by_pipe = {}
    for c in cmds:
        by_pipe.setdefault((c.nested, c.pipe), []).append(c)
    for c in cmds:
        if c.prog == "pkill":
            refuse("pkill kills by name or command line: with -f it matches your own shell (its command line contains the "
                   "pattern), and either way it takes Playwright's browsers and the parent's run. " + KILL_HOW)
        if c.prog == "killall":
            refuse("killall by name takes every Chromium and node on the box, the parent's run included. " + KILL_HOW)
    for group in by_pipe.values():
        progs = [c.prog for c in group]
        if any(p in ("pgrep", "pidof") for p in progs) and "kill" in progs[progs.index(next(p for p in progs if p in ("pgrep", "pidof"))):]:
            refuse("pgrep / pidof piped into kill kills by name exactly as pkill does. " + KILL_HOW)
    for c in cmds:
        if c.prog != "kill":
            continue
        subs = [s for w, _ in c.words for s in w.subs]
        if subs:
            nested = [n for n in cmds if n.nested and n.prog in ("pgrep", "pidof")]
            if nested:
                refuse("kill $(pgrep …) / $(pidof …) kills by name exactly as pkill does. " + KILL_HOW)
        if "APEX_KILL_OK=1" in c.assigns:
            continue
        for pid in (a for a in c.argv[1:] if a.isdigit()):
            try:
                comm = open("/proc/%s/comm" % pid, encoding="utf8").read().strip()
            except OSError:
                continue
            if comm.startswith(("chrome", "chromium", "headless_shell")):
                refuse("pid %s is a Chromium (%s). Kill a browser you listed yourself as 'APEX_KILL_OK=1 kill %s'; a "
                       "browser you did not list belongs to the parent's run. %s" % (pid, comm, pid, KILL_HOW))


# --- 2. a subagent never starts a browser ---------------------------------------------------------------------
def browser_groups():
    try:
        g = json.load(open(os.path.join(ROOT, "tests/groups.json"), encoding="utf8"))["groups"]
        return {k[5:] for k, v in g.items() if k.startswith("test:") and (v.get("kind") == "browser" or "playwright" in (v.get("cmd") or ""))}
    except Exception:
        return None


def script_of(c):
    """(script basename, its args) when the command runs a node / python script, else (None, [])."""
    a = c.argv
    if c.prog in ("node", "python", "python3", "bun", "deno", "tsx"):
        rest = a[1:]
        while rest and rest[0].startswith("-"):
            if rest[0] in ("-e", "--eval", "-p", "--print", "-c", "-m"):
                return None, []
            rest = rest[1:]
        if rest:
            return os.path.basename(rest[0]), rest[1:]
        return None, []
    if c.prog.endswith((".mjs", ".js", ".cjs", ".py", ".sh")):
        return c.prog, a[1:]
    return None, []


def playwright_launch(args):
    """True unless the playwright CLI words are a non-launching subcommand."""
    words = [x for x in args if not x.startswith("-")]
    if not words:
        return not any(x in ("--version", "-V", "--help", "-h") for x in args)
    sub = words[0]
    if sub in ("install", "install-deps", "uninstall", "help", "--version"):
        return False
    if sub == "test" and any(x in ("--list", "--help", "-h") for x in args):
        return False
    return True


def is_browser(c, groups):
    p, a = c.prog, c.argv
    if CHROME.match(p):
        return True
    if p == "playwright":
        return playwright_launch(a[1:])
    if p in ("npx", "pnpx", "bunx") or (p in ("npm", "pnpm", "yarn") and a[1:2] in (["exec"], ["dlx"])):
        k = next((j for j, x in enumerate(a[1:], 1) if not x.startswith("-") and x not in ("exec", "dlx")), None)
        if k is not None and a[k].split("@")[0] in ("playwright", "") and "playwright" in a[k]:
            return playwright_launch(a[k + 1:])
    if p in ("npm", "pnpm", "yarn"):
        words = [x for x in a[1:] if not x.startswith("-")]
        if not words or has_help(a[1:]):
            return False
        if words[0] in ("test", "t", "tst"):
            return True
        if words[0] in ("run", "run-script", "rum", "urn") and len(words) > 1:
            name = words[1]
            if name == "test" or name.startswith("e2e"):
                return True
            if name.startswith("test:"):
                return groups is None or name[5:] in groups      # unknown groups.json: refuse (fail closed)
        if p == "yarn" and (words[0] == "test" or words[0].startswith("test:") and (groups is None or words[0][5:] in groups)):
            return True
        return False
    s, args = script_of(c)
    if s is None or has_help(args):
        return False
    if s in ("cli.js", "playwright", "playwright.js") and "playwright" in next(x for x in a[1:] if not x.startswith("-")):
        return playwright_launch(args)
    if s == "test-bg.mjs":
        return not any(x in ("--status", "--tail", "--stop", "--list") for x in args)
    if s == "run-playwright.mjs":
        return "--list" not in args
    if s == "verify-change.mjs":
        return not any(x in ("--fast", "--plan") for x in args)
    if s == "debug-chrome.mjs":
        return bool(args) and args[0] in ("start", "restart", "launch")
    if s == "browser-http-up.mjs":
        return "--stop" not in args
    if s == "probe-mcp.py":
        return "chrome-start" in args
    if s in ("apex-tools-mcp.mjs", "apex-tools-mcp.sh", "mcp-cli.mjs") and args[:1] == ["call"] and len(args) > 1:
        try:
            ti = json.loads(args[2]) if len(args) > 2 else {}
        except ValueError:
            ti = None
        return mcp_browser_call(args[1], ti)
    return False


def mcp_browser_call(tool, ti):
    """The same judgement as mcp-browser-guard.sh, for an apex-tools CLI `call`."""
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import importlib.util
        spec = importlib.util.spec_from_file_location("mcp_browser_rules", os.path.join(os.path.dirname(os.path.abspath(__file__)), "mcp_browser_rules.py"))
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        name = tool if tool.startswith("mcp__") else "mcp__apex-tools__" + (tool if tool.startswith("apex_") else "apex_" + tool)
        return m.is_browser_call(name, ti, ROOT)
    except Exception:
        return True                          # cannot judge: refuse (fail closed)


def rule_subagent(cmds):
    groups = browser_groups()
    for c in cmds:
        if is_browser(c, groups):
            refuse(SUB_HOW + " (command: %s)" % " ".join(c.argv)[:120])
        for t in write_targets(c):
            if GUARD_FILES.search(t.replace("\\", "/")):
                refuse("a subagent cannot write %s: the .claude/allow-* hatches and the guard files (hooks, settings, "
                       ".githooks, tools/hooks) are the main session's (AGENTS.md rule 10). Report the change for the parent." % t)


# --- 3. the commit gate stays reachable -----------------------------------------------------------------------
COMMIT_ARG_LONG = {"--message", "--file", "--author", "--date", "--reuse-message", "--reedit-message", "--fixup",
                   "--squash", "--template", "--cleanup", "--trailer", "--pathspec-from-file"}


def commit_skips_hook(args):
    """True when a `git commit` argument list carries --no-verify (or a prefix of it) or -n in a short cluster."""
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--":
            return False
        if a.startswith("--"):
            name = a.split("=", 1)[0]
            if len(name) >= 6 and "--no-verify".startswith(name):
                return True
            i += 2 if (name in COMMIT_ARG_LONG and "=" not in a) else 1
            continue
        if a.startswith("-") and len(a) > 1:
            for j, ch in enumerate(a[1:], 1):
                if ch == "n":
                    return True
                if ch in "mFCct":
                    if j == len(a) - 1:
                        i += 1               # its value is the next word
                    break
                if ch in "Su":
                    break                    # an optional value, attached
        i += 1
    return False


def hookspath_write(sub, args, overrides):
    if any(o.lower().startswith("core.hookspath") for o in overrides):
        return True
    if sub != "config":
        return False
    low = [a.lower() for a in args]
    if "core.hookspath" not in low:
        return False
    k = low.index("core.hookspath")
    before = low[:k]
    reads = {"--get", "--get-all", "--get-regexp", "--list", "-l", "get", "--show-origin", "--show-scope", "--null", "-z",
             "--global", "--local", "--system", "--worktree", "--type", "--default", "--includes", "--no-includes"}
    if any(b in ("--unset", "--unset-all", "--replace-all", "--add", "set", "unset", "--rename-section", "--remove-section", "--edit", "-e") for b in before):
        return True
    if any(b in ("--get", "--get-all", "--get-regexp", "get", "--list", "-l") for b in before):
        return False
    return len(args) > k + 1                 # `git config core.hooksPath VALUE` sets; with no value it reads


def rule_commit(cmds):
    for c in cmds:
        if c.prog != "git":
            continue
        sub, args, overrides = git_split(c.argv)
        if sub == "commit" and not has_help(args) and commit_skips_hook(args):
            refuse("git commit --no-verify / -n skips .githooks/pre-commit, the one commit gate (test:guards, docs-integrity, "
                   "the ratchet auto-raise; AGENTS.md rule 12). Commit without it; a red guard is work, not a flag.")
        if hookspath_write(sub, args, overrides):
            refuse("core.hooksPath is set once by the SessionStart hook / npm run prepare (.githooks); an agent never moves "
                   "or overrides it (a read is 'git config --get core.hooksPath'). Run 'npm run prepare' if commits say no hook would run.")
        if any(re.match(r"^GIT_CONFIG_(KEY|VALUE)_\d+=", a) and "hookspath" in a.lower() for a in c.assigns):
            refuse("core.hooksPath overridden through GIT_CONFIG_KEY_n: an agent never moves the commit gate. Commit plainly.")


# --- 4. no cancel, merge or ready flip from a shell -----------------------------------------------------------
def rule_gh(cmds):
    for c in cmds:
        a = c.argv
        if c.prog == "gh":
            w = gh_split(a)
            if has_help(w):
                continue
            if w[:2] == ["run", "cancel"]:
                refuse("cancelling an Actions run: a queued run holds no slot, so a cancel only loses its place and buys a "
                       "retrigger push (AGENTS.md §Coordination). Your superseded run is replaced by your next push; Bryce cancels in the UI.")
            if w[:2] == ["pr", "merge"]:
                refuse("no session merges or arms (AGENTS.md §Coordination): add the 'land' label and land.yml's gate arms auto-merge.")
            if w[:2] == ["pr", "ready"] and "--undo" not in w:
                refuse("a draft goes ready through 'node tools/ci/ship-pr.mjs' and the GitHub MCP update_pull_request flip "
                       "(the Plan gate and CI check it), never 'gh pr ready'.")
            if w[:1] == ["api"]:
                text = " ".join(a)
                paths = [x for x in w[1:] if not x.startswith("-")]
                method = None
                for i, x in enumerate(a):
                    if x in ("-X", "--method") and i + 1 < len(a):
                        method = a[i + 1].upper()
                    elif x.startswith("--method="):
                        method = x[9:].upper()
                    elif x.startswith("-X") and len(x) > 2:
                        method = x[2:].upper()
                if any(re.search(r"actions/runs/[^/]+/(force-)?cancel\b", p) for p in paths):
                    refuse("cancelling an Actions run through the API (…/actions/runs/<id>/cancel): never (AGENTS.md §Coordination). Bryce cancels in the UI.")
                if method == "PUT" and any(re.search(r"pulls/\d+/merge\b", p) for p in paths):
                    refuse("no session merges (AGENTS.md §Coordination): the REST merge is the same act as gh pr merge; add the 'land' label.")
                if "graphql" in paths[:1]:
                    if re.search(r"\b(mergePullRequest|enablePullRequestAutoMerge)\b", text):
                        refuse("no session merges or arms (AGENTS.md §Coordination): the GraphQL merge is the same act as gh pr merge; add the 'land' label.")
                    if re.search(r"\bmarkPullRequestReadyForReview\b", text):
                        refuse("a draft goes ready through 'node tools/ci/ship-pr.mjs' and the GitHub MCP flip, not the GraphQL mutation.")
                    if re.search(r"\bcancelWorkflowRun\b", text):
                        refuse("cancelling an Actions run through GraphQL: never (AGENTS.md §Coordination).")
        if c.prog in ("curl", "wget", "http", "xh") and any(re.search(r"api\.github\.com/repos/[^\s]*/actions/runs/[^/\s]+/(force-)?cancel\b", x) for x in a):
            refuse("cancelling an Actions run through the API (…/actions/runs/<id>/cancel): never (AGENTS.md §Coordination). Bryce cancels in the UI.")


# --- 5. no GitHub write from a shell with the owner's token ---------------------------------------------------
# A write made with the gh token is recorded as the owner's own act (no app marker); the GitHub MCP tools carry the
# app marker, so an agent's label or comment can be told from Bryce's own click (owner decision 2026-11-11).
GH_ANY = {"auth", "browse", "completion", "config", "help", "licenses", "search", "status", "version", "preview", "co"}
GH_READS = {
    "pr": {"view", "list", "diff", "checks", "status", "checkout"},
    "issue": {"view", "list", "status"},
    "run": {"view", "list", "watch", "download"},
    "workflow": {"view", "list"},
    "release": {"view", "list", "download", "verify", "verify-asset"},
    "repo": {"view", "list", "clone", "set-default", "gitignore", "license"},
    "label": {"list"}, "secret": {"list"}, "variable": {"list", "get"}, "cache": {"list"},
    "ruleset": {"view", "list", "check"}, "gist": {"view", "list", "clone"},
    "project": {"view", "list", "field-list", "item-list"}, "org": {"list"},
    "codespace": {"list", "view", "logs"}, "ssh-key": {"list"}, "gpg-key": {"list"},
    "attestation": {"verify", "download", "inspect", "trusted-root"}, "agent-task": {"list", "view"},
    "extension": {"list", "search", "browse"}, "alias": {"list"},
}
GH_NESTED = {("repo", "autolink"), ("repo", "deploy-key")}   # `gh repo autolink list` reads, the rest write
MCP_FOR = {
    "label": "labels: issue_write with the live label list (issue_read get_labels) plus or minus ONE name; the list "
             "replaces the labels and github-mcp-guard refuses any other list (skill steward references/labels.md)",
    "comment": "a comment: add_issue_comment (issue or PR), add_reply_to_pull_request_comment, update_issue_comment",
    "pr": "a PR: create_pull_request / update_pull_request (draft, body, title); a review: pull_request_review_write",
    "issue": "an issue: issue_write (create / update / close; labels: the live list plus or minus one name) or add_issue_comment",
    "run": "starting, re-running or dispatching a workflow is the owner's call: say so on the PR (needs-decision), never from a shell",
}
GH_HOW = ("Write to GitHub through the GitHub MCP tools, which mark the write as the app's; a gh write is recorded as "
          "Bryce's own click (AGENTS.md §Coordination). Reads stay open: gh api GETs (also -X GET with -f), gh pr "
          "view|list|diff|checks, gh run view|list, gh auth status.")
OWNER_OPT_IN = "APEX_GH_OWNER_WRITE"
API_VALUE_FLAGS = {"-X", "--method", "-H", "--header", "-f", "--raw-field", "-F", "--field", "--input", "-q", "--jq",
                   "-t", "--template", "--cache", "--hostname", "-p", "--preview"}


def gh_refuse(what, kind):
    refuse("%s writes to GitHub with the owner's gh token. %s Instead, %s." % (what, GH_HOW, MCP_FOR.get(kind, MCP_FOR["pr"])))


def gh_api_parse(argv_after_api):
    """(endpoint, explicit method or None, fields as (flag, 'k=v'), input file or None) of a `gh api` call."""
    endpoint, method, fields, inp, i, a = None, None, [], None, 0, argv_after_api
    while i < len(a):
        x = a[i]
        name, eq, val = x.partition("=") if x.startswith("--") else (x, "", "")
        if x.startswith("--") and eq and name in API_VALUE_FLAGS:
            v = val
            i += 1
        elif x in API_VALUE_FLAGS:
            name, v = x, (a[i + 1] if i + 1 < len(a) else "")
            i += 2
        elif re.match(r"^-[XfFHqtp].", x):
            name, v = x[:2], x[2:]
            i += 1
        else:
            if not x.startswith("-") and endpoint is None:
                endpoint = x
            i += 1
            continue
        if name in ("-X", "--method"):
            method = v.upper()
        elif name in ("-f", "--raw-field", "-F", "--field"):
            fields.append((name, v))
        elif name == "--input":
            inp = v
    return endpoint, method, fields, inp


def graphql_text(fields, inp):
    """The query text of a gh api graphql call, or None when it cannot be read (a file that is not there, stdin)."""
    parts = []
    for flag, kv in fields:
        k, _, v = kv.partition("=")
        if flag in ("-F", "--field") and v.startswith("@"):
            try:
                v = open(v[1:], encoding="utf8").read()
            except OSError:
                return None
        parts.append(v)
    if inp is not None:
        try:
            parts.append(open(inp, encoding="utf8").read())
        except OSError:
            return None
    return "\n".join(parts)


def gh_write(c):
    """Refuse when this gh argv writes to GitHub."""
    w = gh_split(c.argv)
    if not w or has_help(w) or w[0] in GH_ANY or w[0].startswith("-"):
        return
    group = w[0]
    if group == "api":
        endpoint, method, fields, inp = gh_api_parse(c.argv[c.argv.index("api") + 1:])
        if endpoint == "graphql":
            text = graphql_text(fields, inp)
            if text is None:
                gh_refuse("gh api graphql with a query this guard cannot read (a missing file or stdin)", "pr")
            if re.search(r"(^|[^\w])mutation\b", text):
                gh_refuse("a GraphQL mutation through gh api", "pr")
            return
        eff = method or ("POST" if fields or inp is not None else "GET")
        if eff not in ("GET", "HEAD"):
            path = endpoint or ""
            kind = "label" if re.search(r"/labels\b", path) else "comment" if re.search(r"/comments\b", path) else \
                "run" if re.search(r"/actions/", path) else "issue" if re.search(r"/issues/", path) else "pr"
            gh_refuse("gh api %s %s" % (eff, path or "<no endpoint>"), kind)
        return
    verb = w[1] if len(w) > 1 else ""
    if (group, verb) in GH_NESTED:
        if (w[2] if len(w) > 2 else "") != "list":
            gh_refuse("gh %s %s %s" % (group, verb, w[2] if len(w) > 2 else ""), "pr")
        return
    reads = GH_READS.get(group)
    if reads is not None and (verb in reads or not verb):
        return                               # a read, or a bare group that prints its usage
    if reads is None:
        gh_refuse("gh %s (not a known read; an alias or an extension can write, so it is judged a write)" % group, "pr")
    kind = "label" if group == "label" or any(x.startswith(("--add-label", "--remove-label")) for x in c.argv) else \
        "comment" if verb in ("comment",) else "run" if group in ("run", "workflow") else group
    gh_refuse("gh %s %s" % (group, verb or "(no subcommand)"), kind)


CURL_DATA = {"-d", "--data", "--data-raw", "--data-binary", "--data-urlencode", "--data-ascii", "--json", "-F", "--form",
             "--form-string", "-T", "--upload-file"}


def http_write(c):
    """Refuse a curl / wget write to api.github.com or uploads.github.com."""
    a = c.argv
    if not any(re.search(r"(^|//|@)(api|uploads)\.github\.com(/|$|:)", x) for x in a[1:]):
        return
    method = None
    if c.prog == "curl":
        data = get = False
        for i, x in enumerate(a[1:], 1):
            if x in ("-X", "--request") and i + 1 < len(a):
                method = a[i + 1].upper()
            elif x.startswith("--request="):
                method = x.split("=", 1)[1].upper()
            elif x.startswith("-X") and len(x) > 2:
                method = x[2:].upper()
            elif x in CURL_DATA or x.split("=", 1)[0] in CURL_DATA or re.match(r"^-[dFT].", x):
                data = True
            elif x in ("-G", "--get"):
                get = True
        method = method or ("POST" if data and not get else "GET")
    elif c.prog == "wget":
        for x in a[1:]:
            if x.startswith("--method="):
                method = x.split("=", 1)[1].upper()
            elif x.startswith(("--post-data", "--post-file", "--body-data", "--body-file")):
                method = method or "POST"
        method = method or "GET"
    else:
        return
    if method not in ("GET", "HEAD"):
        gh_refuse("%s %s to the GitHub API" % (c.prog, method), "pr")


def rule_gh_write(cmds):
    for c in cmds:
        if any(x.startswith(OWNER_OPT_IN + "=") for x in c.assigns) or \
                (c.prog in ("export", "declare", "typeset", "local", "readonly", "set") and any(x.startswith(OWNER_OPT_IN + "=") for x in c.argv[1:])):
            refuse("%s is the owner's opt-in for a tool that writes to GitHub as him (tools/ci/remote-group.mjs): only "
                   "Bryce sets it, in his own shell or the environment's settings. An agent never sets it; ask on the PR "
                   "with needs-decision instead." % OWNER_OPT_IN)
        if c.prog == "gh":
            gh_write(c)
        elif c.prog in ("curl", "wget"):
            http_write(c)


def marker(ti, cmds):
    """updatedInput that exports APEX_SUBAGENT=1 ahead of a subagent's command, when it runs a program that could
    reach tools/lib/harness.mjs (node, npm & co, a shell or a script). None when nothing needs it."""
    progs = {c.prog for c in cmds}
    if not progs & ({"node", "npm", "npx", "pnpm", "pnpx", "yarn", "bun", "bunx", "deno", "python", "python3", "make"} | SHELLS) \
            and not any(p.endswith((".mjs", ".js", ".cjs", ".sh", ".py")) for p in progs):
        return None
    cmd = ti.get("command") or ""
    if cmd.startswith("export APEX_SUBAGENT=1\n"):
        return None
    return dict(ti, command="export APEX_SUBAGENT=1\n" + cmd)


def main():
    raw = sys.stdin.read()
    try:
        d = json.loads(raw)
        ti = d.get("tool_input") if isinstance(d, dict) else None
        if not isinstance(d, dict) or not isinstance(ti, (dict, type(None))):
            raise ValueError
        cmd = (ti or {}).get("command")
        if not isinstance(cmd, (str, type(None))):
            raise ValueError
    except Exception:
        refuse("bash-guard could not read the command out of the hook payload (not JSON, or an unexpected shape), so none "
               "of its rules ran and the command is refused (fail closed).")
    if not cmd:
        sys.exit(0)
    try:
        cmds = commands(cmd)
    except (ParseError, RecursionError) as e:
        refuse("bash-guard could not tokenise this command (%s), so it cannot tell what would run and refuses it (fail "
               "closed). Fix the quoting, or put the script in a file under scratch/ and run that." % e)
    sub = isinstance(d.get("agent_id"), str) and d.get("agent_id").strip() != ""
    rule_kill(cmds)
    if sub:
        rule_subagent(cmds)
    rule_commit(cmds)
    rule_gh(cmds)
    rule_gh_write(cmds)
    if sub:
        upd = marker(ti or {}, cmds)
        if upd is not None:
            print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "updatedInput": upd}}))
    sys.exit(0)


if __name__ == "__main__":
    main()
