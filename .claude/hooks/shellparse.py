#!/usr/bin/env python3
"""shellparse.py — read a Bash tool command the way the shell will run it.

Shared by bash-guard.sh (is this a `git commit`, and of what?) and
protect-files.py (which files does this command WRITE?). Both used regexes on
the raw text, and both had holes a review reproduced on 2026-10-04:

  * the commit guard matched `git( -C dir)? commit` only, so `git -c k=v
    commit`, `git --no-pager commit`, `bash -c "git commit"`, `env X=1 git
    commit`, `GIT_AUTHOR_NAME=x git commit` and `/usr/bin/git commit` all
    committed with no guard run;
  * the edit guard saw only the Write/Edit tools, so `sed -i`, a heredoc
    redirect, `tee` or `cp` into js/ during a live Playwright run — or onto a
    generated file — went straight through.

This tokenises with shlex (quotes respected, heredoc bodies dropped), splits
on ; & | ( ) and newlines, peels VAR=value assignments and wrapper commands
(sudo, env, exec, nice, nohup, command, time, xargs), unwraps `sh|bash -c
BODY` recursively, and tracks `cd DIR` so relative targets resolve.

  python3 shellparse.py commit  < cmd   # JSON: [{"all":…, "paths":[…], "dry":…, "skip":…}]
  python3 shellparse.py writes CWD < cmd  # JSON: [{"path": abs, "kind": "redirect|sed|tee|cp|…", …}]
  python3 shellparse.py push < cmd     # JSON: [{"cmd": …, "why": [reasons]}] for refused pushes; [] = none
  python3 shellparse.py gh < cmd       # JSON: [{"cmd", "decision": deny|ask|ref, "why"}] gh merge/ready calls
  python3 shellparse.py browser ROOT < cmd   # JSON: [why] browser starts (the subagent ban)
  python3 shellparse.py surveyor CWD < cmd   # JSON: removals / whole-tree git verbs (track-surveyor scope)
  python3 shellparse.py guard ROOT < payload # bash-guard's one call: commit line, PARSE ok|null, gh decision

Round 2 (2026-10-14 red-team) also unwraps `bash -o opt -c`, `bash -c -- …`,
`sh -ec`, here-strings and `echo|printf '…' | bash`, peels setsid/flock/ionice/
env -S, tracks pushd, and expands `git -c alias.X=…` (or a configured alias).

KNOWN GAPS (documented, not silently claimed): writes made by an interpreter
(`python3 -c "open(...,'w')"`, `node -e "fs.writeFileSync(…)"`), by `git
apply`/`patch`, by a whole-tree git command (`reset --hard`, `stash pop`,
`merge`, a `checkout`/`restore` of a DIRECTORY or glob pathspec — the target
reads as the directory, not the files under it), by `curl -O` / `wget -O`, or
through a variable or command substitution in the target are not seen. Unparseable text (an unbalanced quote) yields a conservative
best effort: the commit reader then falls back to a regex, and the write
reader reports nothing.
"""
import json
import os
import re
import shlex
import sys

SEPS = {"`", ";", "&", "|", "&&", "||", ";;", "(", ")", "\n", "|&", "&;"}
REDIRS = {">", ">>", ">|", "&>", "&>>", "1>", "2>", "1>>", "2>>"}
WRAPPERS = {"sudo", "exec", "nice", "nohup", "command", "time", "builtin", "stdbuf", "timeout", "xargs",
            "setsid", "doas", "flock", "ionice", "chronic", "unbuffer", "caffeinate"}
# Wrapper flags that take a separate argument (2026-10-14 round 2): `flock -w 5`,
# `ionice -c 3`, `stdbuf -o L`, `timeout -s KILL 5`, `xargs -d '\n'`, `exec -a n`.
WRAPPER_ARG = {
    "sudo": {"-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-U", "-T"}, "doas": {"-u", "-C"}, "exec": {"-a"},
    "nice": {"-n", "--adjustment"}, "time": {"-f", "-o", "--format", "--output"}, "stdbuf": {"-i", "-o", "-e"},
    "timeout": {"-s", "-k", "--signal", "--kill-after"},
    "xargs": {"-I", "-L", "-P", "-n", "-s", "-d", "-E", "-a", "--delimiter", "--max-args", "--max-procs",
              "--arg-file", "--max-chars"},
    "flock": {"-w", "-E", "--timeout", "--conflict-exit-code"},
    "ionice": {"-c", "-n", "-p", "-P", "-u", "--class", "--classdata", "--pid", "--pgid", "--uid"},
}
SHELLS = {"sh", "bash", "dash", "zsh", "ksh", "mksh", "busybox"}
# Reserved words that open a command position without being the command
# (2026-10-09, ledger L12): `if …; then git commit; fi` splits on `;` and the
# second simple command's argv[0] is `then`, so the commit read as a command
# named "then". Peeled like a wrapper; the closers (fi, done, esac, }) are
# commands of their own after the split and simply name nothing.
RESERVED_LEAD = {"if", "then", "else", "elif", "while", "until", "do", "!", "{", "time", "coproc"}


class ParseError(ValueError):
    """The text is not tokenisable; a strict reader (commit) must fail CLOSED."""


_HEREDOC = re.compile(r"(?<!<)<<(?!<)-?\s*['\"]?([A-Za-z_][A-Za-z0-9_]*)['\"]?")
# A heredoc whose consumer is a shell (or `source`/`eval`) feeds its body to the
# shell AS COMMANDS: `bash <<EOF ... git commit ... EOF` is a commit (15-F6). The
# consumer is a shell word before the `<<` on the opening line, or a shell after
# a pipe following it (`cat <<EOF | bash`).
_SHELL_BEFORE = re.compile(r"(^|[;&|(\s])(\S*/)?(sh|bash|dash|zsh|source|eval)(\s|$)")
_SHELL_AFTER = re.compile(r"\|\s*(\S*/)?(sh|bash|dash|zsh)(\s|$)")


def shell_heredoc(line, m):
    """True when the heredoc opened by match `m` on `line` is fed to a shell."""
    return bool(_SHELL_BEFORE.search(line[:m.start()]) or _SHELL_AFTER.search(line[m.end():]))


def split_heredocs(text):
    """(text without heredoc BODIES, [bodies fed to a shell]). The opening line
    stays, so a commit message or a file body never reads as commands, while a
    body a shell will RUN is handed back to be parsed as commands."""
    lines = text.split("\n")
    out, bodies, term, cur = [], [], None, None
    for n, ln in enumerate(lines):
        if term is not None:
            if ln.strip() == term:
                term = None
                if cur is not None:
                    bodies.append("\n".join(cur))
            elif cur is not None:
                cur.append(ln)
            continue
        m = _HEREDOC.search(ln)
        # A heredoc needs its closing line, and `<<` inside `$(( ... ))` is a
        # shift: `echo $((1 << n))` used to swallow every line after it (L12).
        if m and ln[:m.start()].count("((") <= ln[:m.start()].count("))") \
                and any(x.strip() == m.group(1) for x in lines[n + 1:]):
            term = m.group(1)
            cur = [] if shell_heredoc(ln, m) else None
        out.append(ln)
    return "\n".join(out), bodies


def strip_heredocs(text):
    """Drop heredoc BODIES (keep the line that opens them), so a commit
    message or a file body never reads as commands."""
    return split_heredocs(text)[0]


def tokens(text):
    """shlex tokens with operators (and unquoted newlines) split out; None
    when the text is not tokenisable (unbalanced quotes). A newline INSIDE a
    quoted string stays in its word, so a multi-line -m message never reads
    as commands."""
    # A backslash-newline is a line continuation, not a word character.
    lx = shlex.shlex(strip_heredocs(text).replace("\\\n", " "), posix=True, punctuation_chars=";&|()<>\n`")
    lx.whitespace = " \t\r"
    lx.whitespace_split = True
    lx.commenters = ""
    try:
        return list(lx)
    except ValueError:
        return None


def split_commands(toks, seps=None):
    """[[argv tokens incl. redirections], …] split on separators. With a
    `seps` list, the separator before each command is appended to it (`|`
    marks a pipeline stage, so `echo 'git push -f' | bash` can be read)."""
    cmds, cur, last = [], [], ""
    for t in toks:
        if t in SEPS or (t and set(t) <= set(";&|()\n`")):
            if cur:
                cmds.append(cur)
                if seps is not None:
                    seps.append(last)
                last = ""
            cur = []
            last = t if t in ("|", "|&") else (last if t == "\n" and last in ("|", "|&") else t)
            continue
        cur.append(t)
    if cur:
        cmds.append(cur)
        if seps is not None:
            seps.append(last)
    return cmds


def peel(argv):
    """Strip leading VAR=value assignments and wrapper commands. Returns
    (env_assignments, argv). `flock FILE -c BODY` and `env -S 'cmd args'`
    come back as the command they run (`sh -c BODY`, the split string)."""
    env = {}
    i = 0
    argv = list(argv)
    while i < len(argv):
        a = argv[i]
        if re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", a):
            k, v = a.split("=", 1)
            env[k] = v
            i += 1
            continue
        if a in RESERVED_LEAD:
            i += 1
            continue
        base = os.path.basename(a)
        if base == "env":
            i += 1
            while i < len(argv) and (argv[i].startswith("-") or re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", argv[i])):
                if "=" in argv[i] and not argv[i].startswith("-"):
                    k, v = argv[i].split("=", 1)
                    env[k] = v
                elif argv[i] in ("-S", "--split-string") or argv[i].startswith("--split-string="):
                    # env -S 'git push -f': the string IS the command line
                    v = argv[i].split("=", 1)[1] if "=" in argv[i] else (argv[i + 1] if i + 1 < len(argv) else "")
                    try:
                        argv = argv[:i] + shlex.split(v) + argv[i + (1 if "=" in argv[i] else 2):]
                    except ValueError:
                        argv = argv[:i] + v.split() + argv[i + 2:]
                    continue
                elif argv[i] in ("-u", "-C", "--unset", "--chdir"):
                    i += 1
                i += 1
            continue
        if base in WRAPPERS:
            i += 1
            # wrapper flags (nice -n 5, timeout 30, sudo -u x, xargs -0 …)
            while i < len(argv) and (argv[i].startswith("-") or (base in ("timeout",) and re.match(r"^\d", argv[i]))
                                     or (base == "nice" and i > 0 and argv[i - 1] == "-n")):
                if base == "flock" and argv[i] in ("-c", "--command"):
                    break
                if argv[i] == "--":
                    i += 1
                    break
                if argv[i] in WRAPPER_ARG.get(base, ()) and "=" not in argv[i] and i + 1 < len(argv):
                    i += 1
                i += 1
            if base == "flock" and i < len(argv):
                # flock [opts] FILE cmd… | flock [opts] FILE -c BODY
                if argv[i] not in ("-c", "--command"):
                    i += 1
                while i < len(argv) and argv[i].startswith("-") and argv[i] not in ("-c", "--command"):
                    i += 1
                if i < len(argv) and argv[i] in ("-c", "--command"):
                    return env, ["sh", "-c", argv[i + 1] if i + 1 < len(argv) else ""]
            continue
        break
    return env, argv[i:]


def _shell_body(argv):
    """(body, reads_stdin) for a shell argv: the `-c` string (after any `-o
    opt`, `+o opt`, `--`, `-ec`/`-lc` clusters), or None with reads_stdin True
    when the shell takes its commands from stdin (no script operand, or -s)."""
    j, cflag, sflag = 1, False, False
    while j < len(argv):
        a = argv[j]
        if a == "--":
            j += 1
            break
        if a in ("--rcfile", "--init-file"):
            j += 2
            continue
        if a.startswith("--"):
            j += 1
            continue
        if re.match(r"^[-+][A-Za-z]+$", a):
            cflag = cflag or "c" in a[1:]
            sflag = sflag or "s" in a[1:]
            j += 2 if a[-1] in "oO" else 1
            continue
        break
    if cflag:
        return (argv[j] if j < len(argv) else None), False
    return None, sflag or j >= len(argv)


def _echo_text(argv):
    """The literal text `echo …` / `printf …` writes (None for anything else)."""
    base = os.path.basename(argv[0])
    args = argv[1:]
    if base == "echo":
        while args and re.match(r"^-[neE]+$", args[0]):
            args = args[1:]
        return " ".join(args).replace("\\n", "\n")
    if base == "printf" and args:
        return " ".join(args).replace("\\n", "\n").replace("%s", " ")
    return None


def commands(text, cwd=None, depth=0, strict=False):
    """Yield (env, argv, redirects, cwd) for every simple command, with
    `sh -c BODY` unwrapped and `cd` tracked. `strict` raises ParseError on
    untokenisable text (here or in a `-c` / eval body) instead of yielding
    nothing, so a caller that must not miss a command can fail closed.
    A shell fed a literal on stdin is unwrapped too (round 2, 2026-10-14):
    `bash <<< 'cmd'`, `echo 'cmd' | bash`, `printf 'cmd\\n' | sh`, and
    `bash -o pipefail -c`, `bash -c -- 'cmd'`, `sh -ec 'cmd'`."""
    _stripped, shell_bodies = split_heredocs(text)
    # A body a shell runs is commands (`bash <<EOF ... git commit ... EOF`, 15-F6);
    # a malformed one raises under `strict` like any other untokenisable text.
    for body in shell_bodies:
        if depth < 4:
            yield from commands(body, cwd, depth + 1, strict)
    toks = tokens(text)
    if toks is None:
        if strict:
            raise ParseError("untokenisable command")
        return
    seps = []
    prev = None
    for n, raw in enumerate(split_commands(toks, seps)):
        piped_from, prev = (prev if seps[n] in ("|", "|&") else None), None
        # Pull redirections out of the argv.
        argv, redirs, herestr, stdin_file = [], [], None, None
        i = 0
        while i < len(raw):
            t = raw[i]
            if t in REDIRS or t in (">", ">>"):
                tgt = raw[i + 1] if i + 1 < len(raw) else ""
                # `2>&1` style: shlex gives ">" then "&" — a separator, already split.
                redirs.append((t, tgt))
                i += 2
                continue
            if t == "<<<":
                herestr = raw[i + 1] if i + 1 < len(raw) else ""
                i += 2
                continue
            if t == "<":
                stdin_file = raw[i + 1] if i + 1 < len(raw) else ""
                i += 2
                continue
            if t in ("<<", "<<-", ">&", "<&") or re.match(r"^[<>]+&$", t):
                i += 2   # a heredoc delimiter, or an fd dup (2>&1)
                continue
            if re.match(r"^\d$", t) and i + 1 < len(raw) and (raw[i + 1] in REDIRS or raw[i + 1].endswith("&")):
                i += 1
                continue
            argv.append(t)
            i += 1
        env, argv = peel(argv)
        if not argv:
            continue
        prev = argv
        base = os.path.basename(argv[0])
        if base in ("cd", "pushd") and len(argv) > 1 and cwd:
            nxt = os.path.expanduser(argv[-1] if argv[1].startswith("-") else argv[1])
            cwd = os.path.normpath(nxt if os.path.isabs(nxt) else os.path.join(cwd, nxt))
            continue
        if base in SHELLS and depth < 4:
            args = argv[1:] if base != "busybox" else argv[2:] if len(argv) > 1 and argv[1] in ("sh", "ash") else None
            if args is not None:
                body, stdin = _shell_body([argv[0]] + args)
                if body is None and stdin:
                    if herestr is not None:
                        body = herestr
                    elif piped_from is not None:
                        body = _echo_text(piped_from)
                    elif stdin_file and os.path.isfile(_abs(stdin_file, cwd)):
                        body = _read(_abs(stdin_file, cwd))
                if body is not None:
                    yield from commands(body, cwd, depth + 1, strict)
                    continue
        if base == "eval" and depth < 4 and len(argv) > 1:
            yield from commands(" ".join(argv[1:]), cwd, depth + 1, strict)
            continue
        yield env, argv, redirs, cwd


# ---- git argv: globals, inline config, aliases ------------------------------------
GIT_GLOBAL_WITH_ARG = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env", "--exec-path", "--super-prefix",
                       "--list-cmds", "--attr-source"}
# Verbs git runs itself: an alias never shadows one, so only another word is looked
# up as an alias (inline `-c alias.X=…`, then `git config alias.X`).
GIT_BUILTINS = set("""add am annotate apply archive bisect blame branch bundle cat-file check-attr check-ignore
check-mailmap check-ref-format checkout checkout-index cherry cherry-pick citool clean clone column commit
commit-graph commit-tree config count-objects credential describe diff diff-files diff-index diff-tree
difftool fast-export fast-import fetch fetch-pack filter-branch fmt-merge-msg for-each-ref for-each-repo
format-patch fsck gc get-tar-commit-id grep gui hash-object help hook index-pack init instaweb interpret-trailers
log ls-files ls-remote ls-tree mailinfo mailsplit maintenance merge merge-base merge-file merge-index merge-tree
mergetool mktag mktree multi-pack-index mv name-rev notes pack-objects pack-redundant pack-refs patch-id prune
prune-packed pull push range-diff read-tree rebase receive-pack reflog remote repack replace request-pull rerere
reset restore rev-list rev-parse revert rm send-email send-pack shortlog show show-branch show-index show-ref
sparse-checkout stage stash status stripspace submodule switch symbolic-ref tag unpack-file unpack-objects
update-index update-ref update-server-info upload-archive upload-pack var verify-commit verify-pack verify-tag
version whatchanged worktree write-tree lfs""".split())


def _git_alias(verb, cfg, where):
    """The alias value for `verb`: inline -c first (last one wins), then the
    repo/global config. None when `verb` is no alias."""
    val = None
    for kv in cfg:
        k, _eq, v = kv.partition("=")
        if k.lower() == "alias." + verb.lower():
            val = v
    if val is not None:
        return val
    try:
        import subprocess
        r = subprocess.run(["git", "-C", where or ".", "config", "--get", "alias." + verb],
                           capture_output=True, text=True, timeout=5)
        return r.stdout.rstrip("\n") if r.returncode == 0 else None
    except Exception:
        return None


def git_commands(text, start, depth=0):
    """Yield (env, argv, cwd, i, gitdir, cfg) for every `git …` the command
    runs: argv[i] is the verb, gitdir the -C value, cfg the inline `-c k=v`
    list. An alias (`git -c alias.p=push p -f`, `-c 'alias.p=!git push -f'`,
    or one in git config) is expanded once and re-read as what it runs
    (round 2, 2026-10-14). Raises ParseError on untokenisable text."""
    for env, argv, _r, cwd in commands(text, start, strict=True):
        if os.path.basename(argv[0]) != "git":
            continue
        i, gitdir, cfg = 1, None, []
        while i < len(argv) and argv[i].startswith("-"):
            a = argv[i]
            if a in GIT_GLOBAL_WITH_ARG:
                v = argv[i + 1] if i + 1 < len(argv) else ""
                if a == "-C":
                    gitdir = v
                elif a == "-c":
                    cfg.append(v)
                i += 2
                continue
            i += 1
        if i < len(argv) and argv[i] not in GIT_BUILTINS and depth < 2:
            where = _abs(gitdir, cwd) if gitdir else (cwd or start)
            val = _git_alias(argv[i], cfg, where)
            if val is not None:
                rest = argv[i + 1:]
                if val.startswith("!"):
                    body = val[1:] + "".join(" " + shlex.quote(x) for x in rest)
                    for item in git_commands(body, where, depth + 1):
                        yield (dict(env, **item[0]),) + item[1:]
                    continue
                try:
                    exp = shlex.split(val)
                except ValueError:
                    raise ParseError("untokenisable alias")
                argv = argv[:i] + exp + rest
                # the expansion may carry its own globals (`alias.p=-c x=y push`)
                while i < len(argv) and argv[i].startswith("-"):
                    if argv[i] in GIT_GLOBAL_WITH_ARG:
                        if argv[i] == "-c" and i + 1 < len(argv):
                            cfg.append(argv[i + 1])
                        i += 2
                        continue
                    i += 1
        yield env, argv, cwd, i, gitdir, cfg


# ---- git commit ---------------------------------------------------------------
COMMIT_WITH_ARG = {"-m", "--message", "-F", "--file", "-c", "--reedit-message", "-C", "--reuse-message",
                   "--author", "--date", "-t", "--template", "--cleanup", "--fixup", "--squash",
                   "--trailer", "--pathspec-from-file"}
COMMIT_SHORT_ARG = set("mFcCt")


def commit_info(text):
    """Every `git … commit …` in the command: [{all, paths, include, dry,
    skip, gitdir}]. `skip` is APEX_SKIP_GUARDS=1 on that command. Raises ParseError when the
    text cannot be tokenised (main() prints `null`, the shell then falls back
    to its regex: fail closed)."""
    found = []
    start = os.getcwd()
    for env, argv, cwd, i, gitdir, _cfg in git_commands(text, start):
        if i >= len(argv) or argv[i] != "commit":
            continue
        # The tree the commit lands in: -C resolved against the tracked cwd, else
        # a `cd <other tree> && git commit` cwd (15-F6); None = the hook's own.
        if gitdir:
            gitdir = _abs(gitdir, cwd)
        elif cwd and os.path.normpath(cwd) != os.path.normpath(start):
            gitdir = cwd
        info = {"all": False, "paths": [], "include": False, "dry": False,
                "skip": env.get("APEX_SKIP_GUARDS") == "1", "gitdir": gitdir}
        j = i + 1
        dashdash = False
        while j < len(argv):
            a = argv[j]
            if dashdash or not a.startswith("-") or a == "-":
                if a != "-":
                    info["paths"].append(a)
                j += 1
                continue
            if a == "--":
                dashdash = True
            elif a in ("-a", "--all"):
                info["all"] = True
            elif a in ("-i", "--include", "-o", "--only"):
                info["include"] = True
            elif a == "--dry-run":
                info["dry"] = True
            elif a.startswith("--"):
                if a in COMMIT_WITH_ARG:
                    j += 1
            else:
                # a short cluster: -am, -qm "msg", -mfoo
                for k, ch in enumerate(a[1:]):
                    if ch == "a":
                        info["all"] = True
                    if ch in ("i", "o"):
                        info["include"] = True
                    if ch in COMMIT_SHORT_ARG:
                        if k == len(a) - 2:
                            j += 1
                        break
            j += 1
        found.append(info)
    return found


# ---- git push ------------------------------------------------------------------
DEPLOY_BRANCH = "claude/f1-game-project-26h3ng"
PUSH_WITH_ARG = {"-o", "--push-option", "--repo", "--receive-pack", "--exec"}
# git push's long options: git accepts any UNAMBIGUOUS prefix (`--forc`, `--mirr`,
# `--dele`, `--al`, `--bran`), so an option is read as every option it could
# abbreviate, and refused when any of those is a refused one.
PUSH_LONG = ["--all", "--branches", "--mirror", "--delete", "--tags", "--follow-tags", "--no-follow-tags",
             "--dry-run", "--porcelain", "--prune", "--no-prune", "--force", "--no-force", "--force-with-lease",
             "--no-force-with-lease", "--force-if-includes", "--no-force-if-includes", "--repo", "--set-upstream",
             "--thin", "--no-thin", "--quiet", "--verbose", "--progress", "--no-progress", "--recurse-submodules",
             "--no-recurse-submodules", "--verify", "--no-verify", "--ipv4", "--ipv6", "--signed", "--no-signed",
             "--atomic", "--no-atomic", "--push-option", "--receive-pack", "--exec"]
PUSH_REFUSED = {
    "--force": "force push", "--force-with-lease": "force push", "--force-if-includes": "force push",
    "--mirror": "--mirror rewrites every remote ref", "--delete": "--delete removes a remote branch",
    "--all": "--all pushes every local branch (the deploy branch included)",
    "--branches": "--branches pushes every local branch (the deploy branch included)",
    "--prune": "--prune deletes remote branches with no local counterpart",
}


def _current_branch(cwd):
    try:
        import subprocess
        r = subprocess.run(["git", "-C", cwd or ".", "rev-parse", "--abbrev-ref", "HEAD"],
                           capture_output=True, text=True, timeout=5)
        return r.stdout.strip()
    except Exception:
        return ""


def _push_config(where):
    """push.default, remote.*.push and remote.*.mirror from git config: what a
    push with no refspec actually sends."""
    try:
        import subprocess
        r = subprocess.run(["git", "-C", where or ".", "config", "--get-regexp",
                            r"^(push\.default|remote\..*\.(push|mirror))$"], capture_output=True, text=True, timeout=5)
        return [ln.split(" ", 1) + [""] for ln in r.stdout.splitlines() if ln.strip()]
    except Exception:
        return []


def _cfg_why(key, val):
    """Why an inline or configured push setting is refused, else None."""
    key = key.lower()
    if key == "push.default" and val.strip().lower() in ("matching", "current"):
        return f"push.default={val} pushes branches the command does not name"
    if re.match(r"^remote\..+\.push$", key):
        return f"{key}={val} replaces the refspecs a push sends"
    if re.match(r"^remote\..+\.mirror$", key) and val.strip().lower() in ("", "true", "yes", "on", "1"):
        return f"{key} turns every push into --mirror"
    return None


def _ref_name(r):
    """A ref as the remote will read it: `@` is HEAD, refs/heads/ and the DWIM
    `heads/` prefix name a branch."""
    if r == "@":
        return "HEAD"
    for pre in ("refs/heads/", "heads/"):
        if r.startswith(pre):
            return r[len(pre):]
    return r


def push_issues(text, branch_of=_current_branch):
    """Why each `git … push …` in the command is refused (2026-10-14): a force
    (-f, --force, --force-with-lease, a +refspec), --mirror, --delete / -d / a
    `:dst` refspec, --all/--branches, --prune, a glob refspec, any push whose
    destination is the deploy branch — named in a refspec (`refs/heads/`,
    `heads/`), or implied by a bare/HEAD/@ push while on it — and the config
    that widens a push (`-c push.default=matching|current`, `-c remote.*.push`,
    `-c remote.*.mirror`, or the same settings in git config for a bare push).
    Long options are read by git's unambiguous-prefix rule, and an alias to
    push is expanded first (git_commands). [] = fine. Raises ParseError on
    untokenisable text."""
    found = []
    start = os.getcwd()
    for _env, argv, cwd, i, gitdir, cfg in git_commands(text, start):
        if i >= len(argv) or argv[i] != "push":
            continue
        where = _abs(gitdir, cwd) if gitdir else (cwd or start)
        why, pos = [], []
        for kv in cfg:
            k, _eq, v = kv.partition("=")
            w = _cfg_why(k, v)
            if w:
                why.append(w + " (-c)")
        j = i + 1
        dashdash = False
        while j < len(argv):
            a = argv[j]
            if dashdash or not a.startswith("-") or a == "-":
                pos.append(a)
            elif a == "--":
                dashdash = True
            elif a.startswith("--"):
                key = a.split("=", 1)[0]
                cands = [key] if key in PUSH_LONG else [o for o in PUSH_LONG if o.startswith(key)]
                for o in cands:
                    if o in PUSH_REFUSED:
                        why.append(f"{PUSH_REFUSED[o]} ({a})")
                if cands and all(o in PUSH_WITH_ARG for o in cands) and "=" not in a:
                    j += 1
            else:
                for k, ch in enumerate(a[1:]):
                    if ch == "f":
                        why.append(f"force push ({a})")
                    elif ch == "d":
                        why.append(f"delete ({a})")
                    elif ch == "o":
                        if k == len(a) - 2:
                            j += 1
                        break
            j += 1
        refspecs = pos[1:]
        cur = None
        for r in refspecs:
            if r.startswith("+"):
                why.append(f"force push (+refspec {r})")
                r = r[1:]
            if "*" in r:
                why.append(f"a glob refspec ({r}) pushes every matching branch")
            src, colon, dst = r.partition(":")
            if colon and not src:
                why.append(f"delete (refspec {r})")
            src = _ref_name(src)
            dst = _ref_name(dst) if colon else src
            if dst == "HEAD":
                cur = cur if cur is not None else branch_of(where)
                dst = cur
            if dst == DEPLOY_BRANCH:
                why.append(f"the destination is the deploy branch {DEPLOY_BRANCH}")
        if not refspecs:
            cur = branch_of(where)
            if cur == DEPLOY_BRANCH:
                why.append(f"a bare push from the deploy branch {DEPLOY_BRANCH} pushes it")
            if not any(_cfg_why(*kv.partition("=")[::2]) for kv in cfg):
                for k, v, *_ in _push_config(where):
                    w = _cfg_why(k, v)
                    if w:
                        why.append(w + " (git config)")
        if why:
            found.append({"cmd": " ".join(argv), "why": sorted(set(why))})
    return found


# ---- gh: merges, auto-merge and draft->ready through the GitHub CLI ----------------
GH_MERGE_ARG = set("bFtA")          # gh pr merge short flags that take a value
GH_GQL_MERGE = re.compile(r"\b(mergePullRequest|enablePullRequestAutoMerge)\b")
GH_GQL_READY = re.compile(r"\bmarkPullRequestReadyForReview\b")


def _gh_truthy(a, name):
    """`--squash`, `--squash=true` → True; `--squash=false` → False; else None."""
    if a == name:
        return True
    if a.startswith(name + "="):
        return a.split("=", 1)[1].strip().lower() not in ("false", "0", "no", "off")
    return None


def gh_issues(text, cwd=None):
    """[{cmd, decision: deny|ask, why}] for every `gh` call that merges a PR,
    arms auto-merge, flips a draft ready or moves a branch outside a PR
    (red-team round 2, 2026-10-14): `gh pr merge` (deny with --squash/-s or
    --rebase/-r, else ask), `gh pr ready` (not --undo), and `gh api` on
    …/pulls/<n>/merge, …/merges, …/git/refs (a write), a PATCH of a pull with
    draft=false, or a GraphQL mergePullRequest / enablePullRequestAutoMerge /
    markPullRequestReadyForReview (deny when the method names SQUASH/REBASE).
    Raises ParseError on untokenisable text."""
    out = []
    for _env, argv, _r, c in commands(text, cwd or os.getcwd(), strict=True):
        if os.path.basename(argv[0]) != "gh":
            continue
        words = [a for a in argv[1:] if not a.startswith("-")]
        cmd = " ".join(argv)
        if words[:2] == ["pr", "merge"]:
            method = None
            for a in argv[1:]:
                for flag, m in (("--squash", "squash"), ("--rebase", "rebase")):
                    if _gh_truthy(a, flag):
                        method = m
                if re.match(r"^-[A-Za-z]+$", a):
                    for ch in a[1:]:
                        if ch in GH_MERGE_ARG:
                            break
                        if ch in "sr":
                            method = "squash" if ch == "s" else "rebase"
            out.append({"cmd": cmd, "decision": "deny" if method else "ask",
                        "why": f"gh pr merge --{method}" if method else "gh pr merge"})
        elif words[:2] == ["pr", "ready"]:
            if "--undo" not in argv:
                out.append({"cmd": cmd, "decision": "ask", "why": "gh pr ready"})
        elif words[:1] == ["api"]:
            k, method, fields, endpoint = 1, None, [], None
            while k < len(argv):
                a = argv[k]
                if a in ("-X", "--method") and k + 1 < len(argv):
                    method = argv[k + 1].upper()
                    k += 2
                    continue
                if a.startswith("--method=") or (a.startswith("-X") and len(a) > 2):
                    method = a.split("=", 1)[1].upper() if "=" in a else a[2:].upper()
                elif a in ("-f", "-F", "--field", "--raw-field", "--input") and k + 1 < len(argv):
                    v = argv[k + 1]
                    if a == "--input" or v.startswith("query=@") or "=@" in v:
                        f = v if a == "--input" else v.split("=@", 1)[1]
                        v = v + " " + (_read(_abs(f, c)) if f != "-" else "")
                    fields.append(v)
                    k += 2
                    continue
                elif a in ("-H", "--header", "-q", "--jq", "-t", "--template", "--hostname", "--cache", "-p",
                           "--preview") and k + 1 < len(argv):
                    k += 2
                    continue
                elif not a.startswith("-") and a != "api" and endpoint is None:
                    endpoint = a
                k += 1
            ep = (endpoint or "").split("?", 1)[0].strip("/")
            blob = " ".join(fields)
            method = method or ("POST" if fields else "GET")
            dec = None
            if ep == "graphql":
                if GH_GQL_MERGE.search(blob):
                    dec = "deny" if re.search(r"\b(SQUASH|REBASE)\b", blob, re.I) else "ask"
                elif GH_GQL_READY.search(blob):
                    dec = "ask"
            elif re.search(r"(^|/)pulls/[^/]+/merge$", ep) and method in ("PUT", "POST"):
                dec = "deny" if re.search(r"merge_method=\s*\"?(squash|rebase)", blob, re.I) else "ask"
            elif re.search(r"(^|/)pulls/[^/]+$", ep) and method == "PATCH" and re.search(r"\bdraft=\s*(false|0)\b", blob, re.I):
                dec = "ask"
            elif (re.search(r"(^|/)merges$", ep) and method == "POST") or \
                    (re.search(r"(^|/)git/refs(/|$)", ep) and method in ("POST", "PATCH", "DELETE")):
                dec = "ref"
            if dec:
                out.append({"cmd": cmd, "decision": dec, "why": f"gh api {method} {ep}"})
    return out


# ---- subagent browser ban -----------------------------------------------------------
NODE_ARG = {"-r", "--require", "--import", "--loader", "--experimental-loader", "-C", "--conditions",
            "--input-type", "--env-file", "--stack-size", "--title"}
NPM_ARG = {"--prefix", "-w", "--workspace", "--loglevel", "-C", "--userconfig", "--cache", "--registry",
           "--package", "-p", "--call", "-c", "--script-shell"}
NPM_TEST = {"test", "t", "tst", "tes"}
NPM_RUN = {"run", "run-script", "rum", "urn", "runs", "run-scrip"}
CAPTURE = re.compile(r"(^|/)(shot/(?!(frame-report|cam-corners|cam-motion)\.mjs$)[A-Za-z0-9_-]+\.mjs"
                     r"|ui/(layout-audit|menu-mock|css-play)\.mjs|gfx/gfx-probe\.mjs|mcp/mcp-cli\.mjs)$")
PW_BIN = re.compile(r"(^|/)(playwright(\.js|\.cmd)?|@playwright/test|(@?playwright/(test/)?)cli\.js)$")
# apex_* tools whose CLI boots Chromium (tools/mcp/apex-tools-mcp.mjs kind
# "browser" / week 2, plus apex_job_start); mcp-browser-guard.sh holds the same list.
APEX_BROWSER = {"apex_eval", "apex_shot", "apex_shot_survey", "apex_agent", "apex_garage", "apex_hud_shot",
                "apex_hud_survey", "apex_hud_mock", "apex_track", "apex_ui_fit", "apex_ui_shot", "apex_job_start"}


def _opts_after(args, help_only=False):
    return any(re.match(r"^--(help|plan)(=|$)", a) for a in args) or (not help_only and "-h" in args)


def _first_positional(args, with_arg):
    k = 0
    while k < len(args):
        a = args[k]
        if a == "--":
            return k + 1
        if a.startswith("-"):
            k += 2 if (a in with_arg and "=" not in a) else 1
            continue
        return k
    return k


def _browser_script(path, args, cwd):
    """Why running this script (path) with args boots a browser, else None."""
    res = _abs(path, cwd) if cwd else path
    names = {path, res}
    b = os.path.basename(path)
    if any(PW_BIN.search(n) for n in names) or (b == "cli.js" and "playwright" in res):
        k = _first_positional(args, set())
        return "playwright test" if k < len(args) and args[k] == "test" else None
    if b == "test-bg.mjs":
        return "test-bg.mjs" if args and args[0] not in ("--status", "--tail") else None
    if b in ("test-solo.mjs", "run-playwright.mjs"):
        return b
    if b == "verify-change.mjs":
        return None if any(a in ("--fast", "--plan") or a.startswith(("--fast=", "--plan=")) for a in args) else b
    if b == "probe-mcp.py":
        return "probe-mcp.py chrome-start" if "chrome-start" in args else None
    if b in ("apex-tools-mcp.sh", "apex-tools-mcp.mjs"):
        k = _first_positional(args, set())
        if k + 1 < len(args) and args[k] == "call":
            t = args[k + 1] if args[k + 1].startswith("apex_") else "apex_" + args[k + 1]
            return f"{b} call {t}" if t in APEX_BROWSER else None
        return None
    if any(CAPTURE.search(n) for n in names):
        return None if any(re.match(r"^--(help|plan|dry-run)(=|$)", a) for a in args) else b
    return None


def browser_starts(text, groups, cwd=None, depth=0):
    """[why] for every command that boots a browser (round 2, 2026-10-14):
    read from the PARSED argv (quotes gone, `sh -c`/eval/here-string/`| bash`
    unwrapped, wrappers peeled, `cd` tracked), not the raw text. `groups` is
    the set of browser `npm run test:<g>` names. Raises ParseError."""
    out = []
    for _env, argv, _r, c in commands(text, cwd or os.getcwd(), strict=True):
        b = os.path.basename(argv[0])
        args = argv[1:]
        why = None
        if b in ("npm", "pnpm", "yarn", "bun"):
            k = _first_positional(args, NPM_ARG)
            verb = args[k] if k < len(args) else ""
            rest = args[k + 1:]
            body = next((args[m + 1] for m, a in enumerate(args[:-1]) if a in ("-c", "--call")), None)
            if body is not None and depth < 3:
                out += browser_starts(body, groups, c, depth + 1)
            if verb in NPM_TEST:
                why = f"{b} {verb}"
            elif verb in NPM_RUN or (b != "npm" and verb not in ("exec", "x", "dlx", "install", "add")):
                k2 = _first_positional(rest, NPM_ARG) if verb in NPM_RUN else -1
                script = (rest[k2] if 0 <= k2 < len(rest) else "") if verb in NPM_RUN else verb
                if script == "test" or (script.startswith("test:") and script[5:] in groups):
                    why = f"{b} run {script}"
            if why is None and verb in ("exec", "x", "dlx"):
                k3 = _first_positional(rest, NPM_ARG)
                if k3 < len(rest):
                    why = _browser_script(rest[k3], rest[k3 + 1:], c)
        elif b in ("npx", "bunx", "pnpx"):
            body = next((args[m + 1] for m, a in enumerate(args[:-1]) if a in ("-c", "--call")), None)
            if body is not None and depth < 3:
                out += browser_starts(body, groups, c, depth + 1)
            k = _first_positional(args, NPM_ARG)
            if k < len(args):
                why = _browser_script(args[k], args[k + 1:], c)
        elif b in ("node", "nodejs", "bun", "deno", "python", "python3", "tsx", "ts-node"):
            if "--test" in args or "-e" in args or "-c" in args or "--eval" in args or "-p" in args:
                continue
            k = _first_positional(args, NODE_ARG)
            if k < len(args):
                why = _browser_script(args[k], args[k + 1:], c)
        elif "/" in argv[0] or re.search(r"\.(mjs|cjs|js|py|sh)$", argv[0]) or b in ("playwright", "test-bg.mjs"):
            why = _browser_script(argv[0], args, c)
        if why:
            out.append(why)
    return out


def browser_groups(root):
    """Names <g> of the `npm run test:<g>` groups that drive a browser."""
    try:
        g = json.load(open(os.path.join(root, "tests", "groups.json"), encoding="utf8"))["groups"]
        return {k[5:] for k, v in g.items() if k.startswith("test:") and k[5:]
                and (v.get("kind") == "browser" or "playwright" in (v.get("cmd") or ""))}
    except Exception:
        return set()


# ---- track-surveyor: removals and whole-tree git moves --------------------------------
def surveyor_targets(text, cwd):
    """[{path|None, kind}] a command REMOVES or rewrites beyond write_targets
    (round 2, 2026-10-14): rm/unlink/rmdir/shred operands, mv sources, and the
    whole-tree git verbs (stash push/pop/apply/drop/clear, reset --hard/--merge/
    --keep, clean without -n, checkout/switch of a branch). path None = the
    whole tree."""
    out = []
    for _env, argv, _r, c in commands(text, cwd):
        b = os.path.basename(argv[0])
        args = argv[1:]
        if b in ("rm", "unlink", "rmdir", "shred"):
            out += [{"path": _abs(a, c), "kind": b} for a in args if not a.startswith("-")]
        elif b == "mv":
            pos = [a for a in args if not a.startswith("-")]
            tdir = any(a in ("-t", "--target-directory") or a.startswith("--target-directory=") for a in args)
            srcs = pos if tdir else pos[:-1]
            out += [{"path": _abs(a, c), "kind": "mv (source)"} for a in srcs]
        elif b == "git":
            i = 0
            while i < len(args) and args[i].startswith("-"):
                i += 2 if args[i] in GIT_GLOBAL_WITH_ARG else 1
            if i >= len(args):
                continue
            sub, rest = args[i], args[i + 1:]
            whole = None
            if sub == "stash" and (not rest or rest[0] not in ("list", "show", "create")):
                whole = "git stash"
            elif sub == "reset" and any(a in ("--hard", "--merge", "--keep") for a in rest):
                whole = "git reset --hard"
            elif sub == "clean" and not any(a in ("-n", "--dry-run") or re.match(r"^-[A-Za-z]*n", a) for a in rest):
                whole = "git clean"
            elif sub in ("switch", "merge", "rebase", "pull", "cherry-pick", "revert", "am", "apply"):
                whole = "git " + sub
            elif sub == "checkout" and "--" not in rest:
                pos = [a for a in rest if not a.startswith("-")]
                if any(a in ("-b", "-B", "--orphan", "--detach") for a in rest) or \
                        (len(pos) == 1 and not os.path.exists(_abs(pos[0], c))):
                    whole = "git checkout <branch>"
            if whole:
                out.append({"path": None, "kind": whole})
    return out


def guard(payload, root):
    """bash-guard.sh's one parse (round 2, 2026-10-14). Prints
      line 1: the commit summary `FOUND RUN ALL GITDIR PATHS…`, or NULL (untokenisable)
      line 2: PARSE ok|null (null: the shell's regex fallbacks run)
      rest:   a PreToolUse decision JSON for a `gh` merge/ready call, if any
    and returns 2 (reasons on stderr) for a refused push, or a browser start
    from a subagent."""
    import merge_policy as P
    cmd = str((payload.get("tool_input") or {}).get("command") or "")
    sub = bool(payload.get("agent_id") or payload.get("agent_type")
               or "/subagents/" in str(payload.get("transcript_path") or ""))
    try:
        allc = commit_info(cmd)
        c = [x for x in allc if not x.get("dry") and not x.get("skip")]
        paths = sorted({p for x in c for p in x.get("paths") or []})
        gd = next((x["gitdir"] for x in c if x.get("gitdir")), "") or "-"
        print(len(allc), "1" if c else "0", "1" if any(x.get("all") for x in c) else "0", gd, " ".join(paths))
    except ParseError:
        print("NULL")
    try:
        pushes = push_issues(cmd)
        gh = gh_issues(cmd)
        browser = browser_starts(cmd, browser_groups(root)) if sub else []
    except ParseError:
        print("PARSE null")
        return 0
    print("PARSE ok")
    if pushes:
        for x in pushes:
            sys.stderr.write("BLOCKED: `" + x["cmd"] + "` — " + "; ".join(x["why"]) + ".\n")
        sys.stderr.write("Pushes go to your own cursor/<topic>-<hash> branch, never forced (AGENTS.md §Git branch & "
                         "deploy). The deploy branch takes work only through a PR (node tools/ci/deploy.mjs --pr); a "
                         "diverged branch is caught up by merging (node tools/ci/sync-pr.mjs), never a force push.\n")
        return 2
    if browser:
        sys.stderr.write("BLOCKED: a subagent never starts a browser run (AGENTS.md §Verification 10) — "
                         + ", ".join(sorted(set(browser))) + ": one group saturates this box and the parent owns the "
                         "only Playwright process. Run the node-only checks (verify-change.mjs --fast, node --test, "
                         "verify-track.cjs) and report the browser groups as NOT RUN; the parent starts them.\n")
        return 2
    desk = os.environ.get("APEX_MERGE_DESK") == "1"
    deny = [x for x in gh if x["decision"] == "deny"]
    if deny:
        P.emit("deny", P.DENY_METHOD + " (" + deny[0]["why"] + ")")
    elif gh and not desk:
        ready = all("ready" in x["why"] or "Ready" in x["why"] for x in gh)
        ref = any(x["decision"] == "ref" for x in gh)
        P.emit("ask", (P.ASK_REF if ref else P.ASK_READY if ready else P.ASK_MERGE) + " (" + gh[0]["why"] + ")")
    return 0


# ---- writes -------------------------------------------------------------------
def _abs(p, cwd):
    p = os.path.expanduser(p)
    return os.path.normpath(p if os.path.isabs(p) else os.path.join(cwd or os.getcwd(), p))


# Allow-listed "read" commands that write a named file (R4-SUPPLY-4, 2026-10-10):
# `git checkout <ref> -- f`, `git restore --source=<ref> f`, `git diff --output=f`,
# `sed -n 'w f'`, `curl -so f URL` each overwrote a generated file with no hook.
CHECKOUT_WITH_ARG = {"-b", "-B", "--orphan", "--conflict", "--pathspec-from-file", "-s", "--source"}
# Merge-resolution sources: the incoming side of a merge and the deploy branch,
# whose generated files the deploy gate already checked. A restore from one is
# not a hand edit (kind "git-resolve", 2026-10-15). Any other ref, HEAD
# included, stays git-checkout / git-restore (R4-SUPPLY-4 pins those).
RESOLVE_SOURCES = {"MERGE_HEAD", "origin/claude/f1-game-project-26h3ng",
                   "refs/remotes/origin/claude/f1-game-project-26h3ng", "claude/f1-game-project-26h3ng"}
GIT_OUTPUT_CMDS = {"diff", "log", "show", "diff-tree", "diff-index", "diff-files", "whatchanged",
                   "range-diff", "format-patch"}
# curl options whose argument is a file curl WRITES (`-` is stdout), and the
# short options that take an argument (the rest of a cluster is that argument).
CURL_WRITE_ARG = {"-o", "--output", "-D", "--dump-header", "-c", "--cookie-jar", "--trace", "--trace-ascii",
                  "--stderr", "--libcurl"}
CURL_SHORT_ARG = set("AbcCdDeEFhHKmoPQrtTuUwxXyYz")


def _merging(cwd):
    """True while a merge, cherry-pick, revert or rebase has conflicts to resolve."""
    try:
        import subprocess
        gd = subprocess.run(["git", "-C", cwd or ".", "rev-parse", "--absolute-git-dir"],
                            capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:
        return False
    return bool(gd) and any(os.path.exists(os.path.join(gd, f)) for f in
                            ("MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply"))


def _git_writes(args, c):
    """[(path, kind)] a `git` argv (argv[1:]) writes to a NAMED worktree file:
    checkout/restore pathspecs and diff-family --output. `-C dir` moves c."""
    i = 0
    while i < len(args) and args[i].startswith("-"):
        if args[i] in GIT_GLOBAL_WITH_ARG:
            if args[i] == "-C" and i + 1 < len(args):
                c = _abs(args[i + 1], c)
            i += 2
            continue
        i += 1
    if i >= len(args):
        return []
    sub, rest, out = args[i], args[i + 1:], []
    if sub in GIT_OUTPUT_CMDS:
        for k, a in enumerate(rest):
            if a == "--":
                break
            if a.startswith("--output="):
                out.append((a.split("=", 1)[1], "git-" + sub))
            elif a == "--output" and k + 1 < len(rest):
                out.append((rest[k + 1], "git-" + sub))
    elif sub in ("checkout", "restore"):
        pos, after, branch, staged, worktree, k = [], [], False, False, False, 0
        side, source = False, None
        while k < len(rest):
            a = rest[k]
            if a == "--":
                after = rest[k + 1:]
                break
            if a in CHECKOUT_WITH_ARG:
                branch = branch or a in ("-b", "-B", "--orphan")
                if a in ("-s", "--source") and k + 1 < len(rest):
                    source = rest[k + 1]
                k += 2
                continue
            if a.startswith("--source="):
                source = a.split("=", 1)[1]
            if a in ("--ours", "--theirs", "--merge", "-m"):
                side = True
            if a in ("--staged", "--worktree"):
                staged, worktree = staged or a == "--staged", worktree or a == "--worktree"
            elif re.match(r"^-[A-Za-z]", a) and not a.startswith("--"):
                flags, _, src = a[1:].partition("s")   # -sHEAD~5: the rest is restore's source
                source = src or source
                staged, worktree = staged or "S" in flags, worktree or "W" in flags
                branch = branch or (sub == "checkout" and bool(set(flags) & set("bB")))
            elif not a.startswith("-"):
                pos.append(a)
            k += 1
        if sub == "restore":
            # every pathspec is restored; --staged alone writes the index, not the file
            paths = [] if staged and not worktree else pos + after
        elif branch:
            paths = after
        else:
            # `checkout <tree-ish> <paths>` / `checkout -- <paths>`; a lone word is
            # a branch unless a FILE of that name exists (git then restores it)
            paths = after + pos[1:] + [p for p in pos[:1] if os.path.isfile(_abs(p, c))]
            if pos and (after or len(pos) > 1 or not os.path.isfile(_abs(pos[0], c))):
                source = pos[0]
        # CONFLICT RESOLUTION IS NOT A HAND EDIT (2026-10-15 blocker census, sync
        # lanes on tests/data/ratchets.json): --ours/--theirs/--merge take one
        # side of an in-progress merge, and a RESOLVE_SOURCES ref restores
        # committed content. protect-files skips the generated-file and
        # shared-contract rules for kind git-resolve; live-run and scoped-agent
        # rules still apply.
        # Outside a merge, --ours/--theirs restore from the INDEX, which may hold
        # a staged hand edit: the side flags count only mid-merge (Merge Desk
        # review, 2026-10-15).
        kind = "git-resolve" if (side and _merging(c)) or source in RESOLVE_SOURCES else "git-" + sub
        out += [(p, kind) for p in paths]
    return [(_abs(p, c), kind) for p, kind in out if p and p != "-"]


def _sed_w_files(script):
    """Files a sed SCRIPT writes with a `w`/`W` command or an `s///w` flag (GNU:
    the filename runs to the end of the line, `;` included). Conservative: the
    text lines after a multi-line a/i/c read as commands."""
    found = []
    for line in script.split("\n"):
        k, n = 0, len(line)
        while k < n:
            ch = line[k]
            if ch in " \t;{}!,0123456789$~+":    # separators and numeric addresses
                k += 1
            elif ch in "/\\":                     # an address regex: /re/ or \cREc
                if ch == "\\":
                    k += 1
                if k >= n:
                    break
                d, k = line[k], k + 1
                while k < n and line[k] != d:
                    k += 2 if line[k] == "\\" else 1
                k += 1
                while k < n and line[k] in "IM":
                    k += 1
            elif ch in "wW":
                found.append(line[k + 1:].strip())
                break
            elif ch in "aicrRe#":                 # text, a read file or a command: to end of line
                break
            elif ch in ":bTt":                    # a label: to `;` (GNU)
                j = line.find(";", k)
                k = n if j < 0 else j + 1
            elif ch in "sy" and k + 1 < n:        # s/re/rep/FLAGS, y/src/dst/
                d, k, parts = line[k + 1], k + 2, 0
                while k < n and parts < 2:
                    if line[k] == "\\":
                        k += 2
                        continue
                    parts += line[k] == d
                    k += 1
                while ch == "s" and k < n and line[k] not in ";}":
                    if line[k] in "wW":
                        found.append(line[k + 1:].strip())
                        k = n
                    k += 1
            else:                                 # a one-letter command (p, d, n, q, =, …)
                k += 1
    return [f for f in found if f and not f.startswith("/dev/")]


def _sed_scripts(args, c):
    """The scripts a sed argv (argv[1:]) runs: -e/--expression, -f/--file
    (read from disk), else the first operand."""
    scripts, explicit, k = [], False, 0
    while k < len(args):
        a = args[k]
        if a.startswith("--expression=") or a.startswith("--file="):
            explicit = True
            v = a.split("=", 1)[1]
            scripts.append(v if a.startswith("--e") else _read(_abs(v, c)))
        elif a in ("--expression", "--file"):
            explicit = True
            if k + 1 < len(args):
                scripts.append(args[k + 1] if a == "--expression" else _read(_abs(args[k + 1], c)))
            k += 1
        elif a in ("-l", "--line-length"):
            k += 1
        elif re.match(r"^-[A-Za-z]", a):
            for j, ch in enumerate(a[1:]):
                if ch == "i" or ch == "l":                 # -i[SUFFIX], -lN: the rest is theirs
                    break
                if ch in "ef":
                    explicit = True
                    v = a[j + 2:] or (args[k + 1] if k + 1 < len(args) else "")
                    if not a[j + 2:]:
                        k += 1
                    scripts.append(v if ch == "e" else _read(_abs(v, c)))
                    break
        elif not a.startswith("-") and not explicit:
            scripts.append(a)
            explicit = True
        k += 1
    return scripts


def _read(p):
    try:
        with open(p, encoding="utf8") as fh:
            return fh.read()
    except Exception:
        return ""


def _curl_writes(args, c):
    """Files a curl argv (argv[1:]) writes: -o/--output (under --output-dir),
    -D, -c, --trace*, --stderr, --libcurl; `-so FILE`, `-oFILE` included."""
    outdir, named, k = None, [], 0
    while k < len(args):
        a = args[k]
        if a == "--output-dir" and k + 1 < len(args):
            outdir = args[k + 1]
            k += 2
            continue
        if a in CURL_WRITE_ARG:
            if k + 1 < len(args):
                named.append((args[k + 1], a in ("-o", "--output")))
            k += 2
            continue
        if re.match(r"^-[A-Za-z0-9#:]", a) and not a.startswith("--"):
            for j, ch in enumerate(a[1:]):
                if ch in CURL_SHORT_ARG:
                    v = a[j + 2:]
                    if not v and k + 1 < len(args):
                        v = args[k + 1]
                        k += 1
                    if "-" + ch in CURL_WRITE_ARG:
                        named.append((v, ch == "o"))
                    break
        k += 1
    return [_abs(os.path.join(outdir, f) if outdir and is_o else f, c)
            for f, is_o in named if f and f != "-" and f != "/dev/null"]


def write_targets(text, cwd):
    """Files (absolute) a command writes: redirections, sed/perl -i, sed
    `w` commands, tee, cp/mv/install/rsync/ln destinations, truncate, dd of=,
    git checkout/restore pathspecs and --output, curl -o; since round 2
    (2026-10-14) also rm/unlink/shred operands, `awk -i inplace` files and
    `npm pkg set|delete|fix` (package.json)."""
    out = []
    for _env, argv, redirs, c in commands(text, cwd):
        for op, tgt in redirs:
            if tgt and not tgt.startswith("&") and tgt != "/dev/null":
                out.append({"path": _abs(tgt, c), "kind": "append" if ">>" in op else "redirect"})
        base = os.path.basename(argv[0])
        args = argv[1:]
        if base in ("sed", "gsed", "perl"):
            if base != "perl":
                # `sed -n 'w f'` writes f with or without -i (`--sandbox` rejects it)
                for script in _sed_scripts(args, c):
                    out += [{"path": _abs(f, c), "kind": "sed-w"} for f in _sed_w_files(script)]
            inplace = any(re.match(r"^-[a-zA-Z]*i", a) or a.startswith("--in-place") for a in args)
            if not inplace:
                continue
            files, script_seen, k = [], any(a in ("-e", "-f", "--expression", "--file") for a in args), 0
            while k < len(args):
                a = args[k]
                if a in ("-e", "-f", "--expression", "--file", "-l") or (base == "perl" and a in ("-M", "-I")):
                    k += 2
                    continue
                if a.startswith("-") and a != "-":
                    k += 1
                    continue
                if not script_seen:
                    script_seen = True
                    k += 1
                    continue
                files.append(a)
                k += 1
            # The same edit with the in-place flag removed and the shell
            # escapes off (`--sandbox` rejects e/r/w), so a caller can see the
            # content it would produce without running anything that writes.
            script = []
            for a in args:
                if a in files:
                    continue
                if base == "sed" and (a.startswith("--in-place") or re.match(r"^-[a-zA-Z]*i", a)):
                    rest = re.sub(r"^-([a-zA-Z]*?)i.*$", r"-\1", a) if not a.startswith("--") else "-"
                    if rest != "-":
                        script.append(rest)
                    continue
                script.append(a)
            for f in files:
                out.append({"path": _abs(f, c), "kind": base, "cwd": c,
                            "sim": (["sed", "--sandbox", *script] if base == "sed" else None)})
        elif base == "tee":
            for a in args:
                if not a.startswith("-"):
                    out.append({"path": _abs(a, c), "kind": "tee"})
        elif base in ("cp", "mv", "install", "rsync", "ln"):
            pos = [a for a in args if not a.startswith("-")]
            tdir = None
            for k, a in enumerate(args):
                if a in ("-t", "--target-directory") and k + 1 < len(args):
                    tdir = args[k + 1]
                elif a.startswith("--target-directory="):
                    tdir = a.split("=", 1)[1]
            if tdir:
                for src in [p for p in pos if p != tdir]:
                    out.append({"path": _abs(os.path.join(tdir, os.path.basename(src)), c), "kind": base,
                                "src": _abs(src, c)})
            elif len(pos) >= 2:
                dest = _abs(pos[-1], c)
                srcs = pos[:-1]
                if os.path.isdir(dest) or pos[-1].endswith("/"):
                    for src in srcs:
                        out.append({"path": os.path.join(dest, os.path.basename(src)), "kind": base,
                                    "src": _abs(src, c)})
                else:
                    out.append({"path": dest, "kind": base, "src": _abs(srcs[0], c) if len(srcs) == 1 else None})
        elif base == "truncate":
            for a in args:
                if not a.startswith("-") and not re.match(r"^[+-]?\d", a):
                    out.append({"path": _abs(a, c), "kind": "truncate"})
        elif base == "dd":
            for a in args:
                if a.startswith("of="):
                    out.append({"path": _abs(a[3:], c), "kind": "dd"})
        elif base in ("rm", "unlink", "shred"):
            # a removed generated file is a hand edit too (round 2, 2026-10-14)
            out += [{"path": _abs(a, c), "kind": base} for a in args if not a.startswith("-")]
        elif base in ("awk", "gawk") and any(a in ("-i", "--include") for a in args):
            k = next(m for m, a in enumerate(args) if a in ("-i", "--include"))
            if k + 1 < len(args) and args[k + 1] in ("inplace", "inplace.awk"):
                pos, m, script_seen = [], 0, any(a in ("-f", "--file", "-e", "--source") for a in args)
                while m < len(args):
                    a = args[m]
                    if a in ("-i", "--include", "-f", "--file", "-v", "--assign", "-e", "--source", "-F"):
                        m += 2
                        continue
                    if a.startswith("-"):
                        m += 1
                        continue
                    if not script_seen:
                        script_seen = True
                    elif "=" not in a:
                        pos.append(a)
                    m += 1
                out += [{"path": _abs(a, c), "kind": "awk -i inplace"} for a in pos]
        elif base == "npm" and len(args) >= 2 and args[0] == "pkg" and args[1] in ("set", "delete", "fix"):
            out.append({"path": _abs("package.json", c), "kind": "npm pkg " + args[1]})
        elif base == "git":
            out += [{"path": p, "kind": kind} for p, kind in _git_writes(args, c)]
        elif base == "curl":
            out += [{"path": p, "kind": "curl"} for p in _curl_writes(args, c)]
    return out


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    text = sys.stdin.read()
    if mode == "commit":
        try:
            print(json.dumps(commit_info(text)))
        except ParseError:
            print("null")
    elif mode == "push":
        try:
            print(json.dumps(push_issues(text)))
        except ParseError:
            print("null")
    elif mode == "guard":
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        try:
            pl = json.loads(text)
        except Exception:
            pl = {}
        sys.exit(guard(pl if isinstance(pl, dict) else {}, sys.argv[2] if len(sys.argv) > 2 else os.getcwd()))
    elif mode == "gh":
        try:
            print(json.dumps(gh_issues(text)))
        except ParseError:
            print("null")
    elif mode == "browser":
        try:
            print(json.dumps(browser_starts(text, browser_groups(sys.argv[2] if len(sys.argv) > 2 else os.getcwd()))))
        except ParseError:
            print("null")
    elif mode == "surveyor":
        print(json.dumps(surveyor_targets(text, sys.argv[2] if len(sys.argv) > 2 else os.getcwd())))
    elif mode == "writes":
        print(json.dumps(write_targets(text, sys.argv[2] if len(sys.argv) > 2 else os.getcwd())))
    else:
        print("usage: shellparse.py commit|push|gh|browser [root]|surveyor CWD|writes [cwd]|guard ROOT < input", file=sys.stderr)
        sys.exit(2)
