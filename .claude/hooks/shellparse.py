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
  python3 shellparse.py gh < cmd       # JSON: [{"cmd", "decision": deny|ask|ref|deny-ref, "why"}] gh merge/ready/ref calls
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


class AgentRunError(ParseError):
    """A recognized execution wrapper cannot safely be inspected."""


class LiteralWord(str):
    """An argv word containing quoted/escaped shell punctuation."""


def protect_literal_operators(text):
    """Keep shlex from losing the distinction between ';' and shell `;`.
    Restore the characters after lexing; never reparse a leaf argv as shell."""
    prefix = "\ue000"
    while prefix in text:
        prefix += "\ue000"
    protected, replacements, out, quote, i = {}, {}, [], None, 0
    def literal(c):
        if c in replacements:
            return replacements[c]
        key = prefix + str(len(protected)) + "\ue001"
        protected[key] = c
        replacements[c] = key
        return key
    while i < len(text):
        c = text[i]
        if c == "\\" and quote != "'" and i + 1 < len(text):
            nxt = text[i + 1]
            if nxt in ";&|()<>\n`" and (quote is None or nxt in "`\n"):
                out.append(literal(nxt)); i += 2; continue
            out.extend((c, nxt)); i += 2; continue
        if c in "\"'" and (quote is None or quote == c):
            quote = None if quote else c
        out.append(literal(c) if quote and c in ";&|()<>\n`" else c)
        i += 1
    return "".join(out), protected


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
    source, protected = protect_literal_operators(strip_heredocs(text).replace("\\\n", " "))
    lx = shlex.shlex(source, posix=True, punctuation_chars=";&|()<>\n`")
    lx.whitespace = " \t\r"
    lx.whitespace_split = True
    lx.commenters = ""
    try:
        out = []
        for word in lx:
            literal = any(key in word for key in protected)
            for key, value in protected.items():
                word = word.replace(key, value)
            out.append(LiteralWord(word) if literal else word)
        return out
    except ValueError:
        return None


def split_commands(toks, seps=None):
    """[[argv tokens incl. redirections], …] split on separators. With a
    `seps` list, the separator before each command is appended to it (`|`
    marks a pipeline stage, so `echo 'git push -f' | bash` can be read)."""
    cmds, cur, last = [], [], ""
    for t in toks:
        if not isinstance(t, LiteralWord) and (t in SEPS or (t and set(t) <= set(";&|()\n`"))):
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


def agent_run_leaf(argv, cwd):
    """Unwrap only this checkout's known shell:false runner. None means an
    unrelated command; [] means help/read, which never execute a child."""
    if not argv:
        return None
    trusted = os.path.realpath(os.path.join(os.path.dirname(__file__), "../../tools/agent-run.mjs"))
    if os.path.realpath(os.path.join(cwd or os.getcwd(), argv[0])) == trusted:
        args = argv[1:]  # Executable shebang form of the same trusted script.
    else:
        if os.path.basename(argv[0]) not in ("node", "nodejs"):
            return None
        matches = [i for i, arg in enumerate(argv[1:], 1)
                   if os.path.realpath(os.path.join(cwd or os.getcwd(), arg)) == trusted]
        if not matches:
            return None
        if matches[0] != 1 and not argv[1].startswith("-"):
            return None  # A path passed as DATA to an unrelated node script.
        if matches[0] != 1:
            raise AgentRunError("agent-run requires node SCRIPT without Node options for guard inspection")
        args = argv[2:]
    boundary = args.index("--") if "--" in args else len(args)
    options, command = args[:boundary], args[boundary + 1:]
    if "--help" in options or "-h" in options or options[:1] == ["help"]:
        return []
    values = {"--output-level": "compact", "--offset": "0", "--limit": "16384"}
    allowed = {"--output-level", "--read", "--offset", "--limit", "--timeout-ms", "--status", "--since", "--pointer"}
    i = 0
    while i < len(options):
        if options[i] == "--progress":
            values["--progress"] = True
            i += 1
            continue
        name, eq, value = options[i].partition("=")
        if name not in allowed:
            raise AgentRunError("unknown agent-run option " + name)
        if not eq:
            i += 1
            value = options[i] if i < len(options) else ""
        if not value and name != "--pointer":
            raise AgentRunError(name + " needs a value")
        values[name] = value
        i += 1
    if values["--output-level"] not in ("compact", "diagnostic", "full"):
        raise AgentRunError("invalid agent-run output level")
    for name in ("--offset", "--limit", "--timeout-ms"):
        if name in values:
            try:
                # Match Number(value)'s common integer forms; reject ambiguous
                # forms conservatively rather than hide an executable child.
                number = float(values[name])
                if not number.is_integer() or number < (0 if name == "--offset" else 1) or number > 9007199254740991:
                    raise ValueError()
            except ValueError:
                raise AgentRunError("invalid agent-run numeric option " + name)
    if "--read" in values and "--status" in values:
        raise AgentRunError("agent-run --read and --status are exclusive")
    if "--read" in values or "--status" in values:
        if command:
            raise AgentRunError("agent-run readers cannot execute a command")
        if "--progress" in values or "--timeout-ms" in values:
            raise AgentRunError("agent-run execution options require a command")
        if "--since" in values and "--status" not in values:
            raise AgentRunError("agent-run --since requires --status")
        if "--status" in values and ("--pointer" in values or float(values["--offset"]) != 0 or float(values["--limit"]) != 16384):
            raise AgentRunError("agent-run collection/page options require --read")
        return []
    if not command:
        raise AgentRunError("agent-run requires -- executable [args...]")
    if "--since" in values or "--pointer" in values or float(values["--offset"]) != 0 or float(values["--limit"]) != 16384:
        raise AgentRunError("agent-run read options require a reader")
    return command


def commands(text, cwd=None, depth=0, strict=False, agent_leaves=None):
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
            yield from commands(body, cwd, depth + 1, strict, agent_leaves)
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
            if not isinstance(t, LiteralWord) and (t in REDIRS or t in (">", ">>")):
                tgt = raw[i + 1] if i + 1 < len(raw) else ""
                # `2>&1` style: shlex gives ">" then "&" — a separator, already split.
                redirs.append((t, tgt))
                i += 2
                continue
            if not isinstance(t, LiteralWord) and t == "<<<":
                herestr = raw[i + 1] if i + 1 < len(raw) else ""
                i += 2
                continue
            if not isinstance(t, LiteralWord) and t == "<":
                stdin_file = raw[i + 1] if i + 1 < len(raw) else ""
                i += 2
                continue
            if not isinstance(t, LiteralWord) and (t in ("<<", "<<-", ">&", "<&") or re.match(r"^[<>]+&$", t)):
                i += 2   # a heredoc delimiter, or an fd dup (2>&1)
                continue
            if re.match(r"^\d$", t) and i + 1 < len(raw) and not isinstance(raw[i + 1], LiteralWord) and (raw[i + 1] in REDIRS or raw[i + 1].endswith("&")):
                i += 1
                continue
            argv.append(t)
            i += 1
        env, argv = peel(argv)
        if not argv:
            continue
        for _ in range(8):
            leaf = agent_run_leaf(argv, cwd)
            if leaf is None:
                break
            extra_env, argv = peel(leaf or ["true"])
            env.update(extra_env)
            if leaf and agent_leaves is not None:
                assignments = " ".join(k + "=" + shlex.quote(v) for k, v in env.items())
                agent_leaves.append((assignments + " " if assignments else "") + shlex.join(argv))
        else:
            raise AgentRunError("agent-run nesting exceeds guard limit")
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
                    yield from commands(body, cwd, depth + 1, strict, agent_leaves)
                    continue
        if base == "eval" and depth < 4 and len(argv) > 1:
            yield from commands(" ".join(argv[1:]), cwd, depth + 1, strict, agent_leaves)
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
    noverify, skip, gitdir}]. `skip` is APEX_SKIP_GUARDS=1 on that command, `noverify`
    a --no-verify / -n that skips .githooks/pre-commit. Raises ParseError when the
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
        info = {"all": False, "paths": [], "include": False, "dry": False, "noverify": False,
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
                # git takes any unambiguous prefix: `--no-veri` is --no-verify (`--no-ve` is ambiguous with
                # --no-verbose and git refuses it). 2026-10-28 split: the git hook is the gate, so skipping it is refused.
                if len(a) >= 8 and "--no-verify".startswith(a.split("=", 1)[0]):
                    info["noverify"] = True
                if a in COMMIT_WITH_ARG:
                    j += 1
            else:
                # a short cluster: -am, -qm "msg", -mfoo, -nm (no-verify); -S/-u take the rest of the cluster
                for k, ch in enumerate(a[1:]):
                    if ch == "a":
                        info["all"] = True
                    if ch in ("i", "o"):
                        info["include"] = True
                    if ch == "n":
                        info["noverify"] = True
                    if ch in COMMIT_SHORT_ARG:
                        if k == len(a) - 2:
                            j += 1
                        break
                    if ch in ("S", "u"):
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
    "--no-verify": "--no-verify skips the pre-push hook",
}
# 2026-10-26 pass-4 red-team R1: a refspec or remote built from a shell variable (`git push origin "$B"`,
# `git push origin HEAD:${T}`) or a command substitution reaches the guard unresolved, so the deploy-branch
# check never sees the real destination. Such a push is refused: write the branch literally.
PUSH_OPAQUE = re.compile(r"[$`]")


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


def push_issues(text, branch_of=_current_branch, dests=None):
    """Why each `git … push …` in the command is refused (2026-10-14): a force
    (-f, --force, --force-with-lease, a +refspec), --mirror, --delete / -d / a
    `:dst` refspec, --all/--branches, --prune, a glob refspec, any push whose
    destination is the deploy branch — named in a refspec (`refs/heads/`,
    `heads/`), or implied by a bare/HEAD/@ push while on it — and the config
    that widens a push (`-c push.default=matching|current`, `-c remote.*.push`,
    `-c remote.*.mirror`, or the same settings in git config for a bare push).
    Long options are read by git's unambiguous-prefix rule, and an alias to
    push is expanded first (git_commands). [] = fine. Raises ParseError on
    untokenisable text. `dests`, when a list, collects (where, remote, branch)
    for every branch a push sends (the foreign-pusher check, foreign_push.py)."""
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
        for r in pos:
            if PUSH_OPAQUE.search(r):
                why.append(f"`{r}` is a shell expansion the guard cannot resolve: write the remote and branch literally")
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
            if dests is not None and dst and not (colon and not src):
                dests.append((where, pos[0], dst, _env))
        if not refspecs:
            cur = branch_of(where)
            if dests is not None and cur and cur != "HEAD":
                dests.append((where, pos[0] if pos else None, cur, _env))
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


# ---- commit signing ------------------------------------------------------------------
# Shared safety ban 5 (Transcript Auditor batch 9, D·W21e, 2026-10-24): commits stay
# signed. Refused: an inline `-c commit.gpgsign=<false>` / `tag.gpgsign` (also through
# GIT_CONFIG_KEY_<n>/VALUE_<n>), `--no-gpg-sign` (`--no-sign` on a tag) on any verb, and
# `git config` writing such a key false or unsetting it. Reading the key is fine.
SIGN_KEYS = ("commit.gpgsign", "tag.gpgsign")
FALSY = ("false", "no", "off", "0", "")


def signing_issues(text):
    """Why each `git …` in the command turns commit signing off; [] = fine. Raises ParseError."""
    found = []
    for env, argv, _cwd, i, _gd, cfg in git_commands(text, os.getcwd()):
        why = []
        for kv in cfg:
            k, eq, v = kv.partition("=")
            if k.lower() in SIGN_KEYS and eq and v.strip().lower() in FALSY:
                why.append(f"-c {kv}")
        for k, v in (env or {}).items():
            m = re.match(r"^GIT_CONFIG_KEY_(\d+)$", k)
            if m and v.lower() in SIGN_KEYS and str(env.get("GIT_CONFIG_VALUE_" + m.group(1), "")).lower() in FALSY:
                why.append(f"{k}={v}")
        verb = argv[i] if i < len(argv) else ""
        args = argv[i + 1:]
        for a in args:
            if a == "--no-gpg-sign" or (verb == "tag" and a == "--no-sign"):
                why.append(a)
        if verb == "config" and not any(x in ("--get", "--get-all", "--get-regexp", "--get-urlmatch", "--list", "-l",
                                                   "get", "list") for x in args):
            for j, a in enumerate(args):
                key, eq, val = a.partition("=")
                if key.lower() not in SIGN_KEYS:
                    continue
                if any(x in ("--unset", "--unset-all", "unset", "--remove-section") for x in args[:j]):
                    why.append(f"git config unsets {key}")
                elif eq:
                    pass   # `key=value` is not git config syntax
                else:
                    rest = [x for x in args[j + 1:] if not x.startswith("-")]
                    if rest and rest[0].strip().lower() in FALSY:
                        why.append(f"git config {key} {rest[0]}")
        if why:
            found.append({"cmd": " ".join(argv), "why": sorted(set(why))})
    return found


# ---- advisories (additionalContext, never a block) ---------------------------------
# Transcript Auditor batch 9 (2026-10-24): `ready-gate.mjs | tail` reported a refusal as a pass: a gate piped
# without `set -o pipefail` gets a reminder that the pipe's status is the last command's. (The held-file push
# advisory over fleet-owner.mjs was retired on 2026-10-27, docs/WORKERS.md.)
GATE_PIPED = re.compile(r"(ready|merge)-gate\.mjs(?:[^;&|\n]|>&|&>)*\|(?!\|)")


def gate_pipe_warning(text):
    # heredoc bodies and quoted strings are text being written or echoed, not the pipeline that runs
    m = GATE_PIPED.search(re.sub(r"'[^']*'|\"(?:[^\"\\]|\\.)*\"", " ", strip_heredocs(text)))
    if not m or "pipefail" in text:
        return ""
    g = m.group(1)
    return (f"bash-guard: `{g}-gate.mjs` is piped, so this command's exit status is the last pipe stage's, not the "
            f"gate's. Read the gate's own `= {g}-gate passed|refused` line, or artifacts/{g}-gate/<pr>.json (`\"ok\"`), "
            "before you report it; or run it unpiped / under `set -o pipefail`. The hooks read the receipt, so a "
            "refused gate never flips or merges, but a READY message built on `| tail` can be wrong.")


PR_STATE_JS = ("import('./tools/ci/ready-gate.mjs').then((m) => { const r = m.api(`pulls?head=${process.argv[1]}&state=all"
               "&per_page=20`); console.log(JSON.stringify(r.error ? { error: r.error } : r.json)); })")


def closed_pr_refusal(dests, root):
    """Why a push to a cursor/* branch whose every PR is MERGED or CLOSED is refused (Transcript Auditor batch 9:
    W19c pushed after its PR merged, recreating the branch, then deleted it through the API), or "". One REST call
    per branch (GraphQL is blocked for Claude sessions); an API error fails open."""
    import subprocess
    for where, _remote, branch, penv in dests:
        if not str(branch).startswith("cursor/") or (penv or {}).get("APEX_CLOSED_PR_PUSH_OK") == "1":
            continue
        try:
            cmd = shlex.split(os.environ["APEX_PR_STATE_CMD"]) if os.environ.get("APEX_PR_STATE_CMD") else \
                ["node", "--input-type=module", "-e", PR_STATE_JS]
            r = subprocess.run(cmd + ["brycejmurrin:" + branch], cwd=root, capture_output=True, text=True, timeout=5)
            prs = json.loads(r.stdout) if r.returncode == 0 else None
        except Exception:
            prs = None
        if not isinstance(prs, list) or not prs or any(p.get("state") == "open" for p in prs):
            continue
        done = ", ".join("#%s %s" % (p.get("number"), "merged" if p.get("merged_at") else "closed") for p in prs[:5])
        return ("BLOCKED: every PR from %s is already finished (%s). A push would recreate or extend a branch nobody "
                "reviews, and a merged PR's branch is not a place for new work (Transcript Auditor batch 9). Start a "
                "new branch from the deploy tip and open a new PR; APEX_CLOSED_PR_PUSH_OK=1 as the push's own prefix "
                "only when Bryce reopened the PR.\n" % (branch, done))
    return ""


# ---- hand ratchet raises ----------------------------------------------------------
# Shared safety ban 1 (Fleet A + D, Bryce 2026-10-22): a ceiling rises only through
# the commit hook's `ratchets.mjs --auto-raise` (<= 40 lines of real growth into
# tests/data/ratchets.d/<branch>.json). `--update` snaps every ceiling to its value,
# raises included, so it is a hand raise; `--lower-only`, `--preview`, `--check`,
# `--fold`, `--json` and `--base` never raise. APEX_RATCHET_RAISE_OK=1 when Bryce
# typed the raise in this session.
RATCHET_RAISING = ("--update", "--fragment", "--absolute")
RATCHET_RUNNERS = ("node", "nodejs", "bun", "deno", "npx", "xargs")
AUTO_RAISE_MAX = 40   # the commit hook's absorb (AGENTS.md §Critical conventions)
# 2026-10-26 pass 4 (G8/H4): `ratchets\.json` dropped — a read of any *ratchets.json is not a raise; only a write verb is.
RATCHET_EVAL_RAISE = re.compile(r"autoRaise|\bupdate\b|--update|--fragment|--absolute|\bfold\b|writeFile|appendFile|writeJson|renameSync|truncate")


def ratchet_issues(text):
    """Every `ratchets.mjs` run that can raise a ceiling: [cmd]. [] = fine.
    Raises ParseError on untokenisable text."""
    found = []
    for env, argv, _redir, _cwd in commands(text, os.getcwd(), strict=True):
        if not argv or (env or {}).get("APEX_RATCHET_RAISE_OK") == "1":
            continue
        cmd = " ".join(argv)
        # `node -e "import('./tools/check/ratchets.mjs')…"` runs it with no visible flags. Only a script that
        # can RAISE counts: one that names autoRaise/update/fold or writes a file. A read-only import
        # (pinVerdict, PIN_METRICS, ratchetMode) is how an agent measures before shrinking (2026-10-26
        # second pass: two such reads were refused while paying a ceiling).
        if os.path.basename(argv[0]) in RATCHET_RUNNERS and any(
                a in ("-e", "--eval", "-p", "--print") and k + 1 < len(argv) and "ratchets" in argv[k + 1]
                and RATCHET_EVAL_RAISE.search(argv[k + 1])
                for k, a in enumerate(argv)):
            found.append(cmd)
            continue
        at = next((k for k, a in enumerate(argv) if os.path.basename(a) == "ratchets.mjs"), None)
        # the script must be what RUNS (`node …/ratchets.mjs`, `./…/ratchets.mjs`), not `echo ratchets.mjs`
        if at is None or not (at == 0 or os.path.basename(argv[0]) in RATCHET_RUNNERS):
            continue
        args = argv[at + 1:]
        if any("$" in a or "`" in a for a in args):
            found.append(cmd)          # $(…) arguments are unknown until the shell runs them
            continue
        if "--lower-only" in args or "--preview" in args:
            continue
        auto = [a.split("=", 1)[1] for a in args if a.startswith("--auto-raise=")]
        if any(not v.isdigit() or int(v) > AUTO_RAISE_MAX for v in auto):
            found.append(cmd)          # --auto-raise=N lifts the hook's 40-line cap
        elif any(a == f or a.startswith(f + "=") for a in args for f in RATCHET_RAISING):
            found.append(cmd)
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


def _gh_pr_number(words):
    """The PR a `gh pr merge|ready` names: `12`, `#12` or a …/pull/12 URL; None when it relies on the
    current branch (merge_policy.receipt_check then refuses: the receipt is per PR number)."""
    for w in words:
        m = re.match(r"^#?(\d+)$", w) or re.search(r"/pull/(\d+)(?:/|$)", w)
        if m:
            return int(m.group(1))
    return None


def _gh_drops_hold(argv):
    """True when a `gh pr|issue edit` argv removes the `hold` label: `--remove-label hold`, `--remove-label=a,hold`."""
    for i, a in enumerate(argv):
        v = None
        if a == "--remove-label" and i + 1 < len(argv):
            v = argv[i + 1]
        elif a.startswith("--remove-label="):
            v = a.split("=", 1)[1]
        if v is not None and any(x.strip().lower() == "hold" for x in v.split(",")):
            return True
    return False


def _hold_text():
    import merge_policy as P
    return P.ASK_HOLD


GH_GQL_CLOSE = re.compile(r"\bclosePullRequest\b")
GH_GQL_REF = re.compile(r"\b(createRef|updateRef|updateRefs|deleteRef|createCommitOnBranch)\b")
GH_GQL_BRANCH_MERGE = re.compile(r"\bmergeBranch\b")
GH_GQL_LABEL_DROP = re.compile(r"\b(removeLabelsFromLabelable|clearLabelsFromLabelable|deleteLabel|updateLabel)\b")
_KV = r"[\"']?\s*[:=]\s*[\"']?"


def api_endpoint(url):
    """`https://api.github.com/repos/o/r/pulls/1/merge?x` / `repos/o/r/…` / `/graphql` → `repos/o/r/pulls/1/merge`.
    A `${…}` / `$var` piece (a template or shell variable) reads as one opaque segment `X`."""
    u = re.sub(r"\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*", "X", str(url or ""))
    u = re.sub(r"^[a-z]+://", "", u, flags=re.I)
    u = re.sub(r"^api\.github\.com(:\d+)?", "", u, flags=re.I)
    u = re.sub(r"^(www\.)?github\.com(:\d+)?/", "web/", u, flags=re.I)
    return u.split("?", 1)[0].split("#", 1)[0].strip("/")


def _api_ready_pr(ep, hit):
    """The PR number when `hit` is a REST draft→ready flip (`…/pulls/<n>/ccr/ready_for_review`, or a
    `pulls/<n>` PATCH with draft=false); None for GraphQL or an opaque `X` segment, which stay a plain ask."""
    if not hit or hit[1] is None or not hit[1].startswith("Marking a draft ready"):
        return None
    m = re.search(r"(^|/)pulls/(\d+)(/|$)", ep)
    return int(m.group(2)) if m else None


def api_classify(method, endpoint, blob):
    """(decision, ask-text, endpoint) for one GitHub API call, or None to pass. ONE policy for every door
    (gh api, curl, wget, node -e fetch, python -c; 2026-10-26 system audit §10 — user grant, Bryce 2026-10-26
    ~23:00 PT: "Fix hook or guard or perm"):
      deny       squash/rebase merges (REST merge_method, GraphQL mergeMethod)
      deny-ref   …/git/refs writes and GraphQL ref mutations (shared safety ban 6)
      deny-write …/contents/<path> PUT|DELETE (a commit with no PR)
      ask        other merges (REST pulls/<n>/merge[-async], GraphQL merge/auto-merge, …/merges, web …/pull/<n>/merge),
                 draft→ready, state=closed on a pull or issue, update-branch, pages.yml/ci.yml dispatches
    Reads (GET, or no write verb) pass. https://docs.github.com/en/rest/pulls/pulls, …/rest/git/refs,
    …/rest/actions/workflows."""
    import merge_policy as P
    ep = api_endpoint(endpoint)
    m = (method or "GET").upper()
    b = blob or ""
    if ep == "graphql" or ep.endswith("/graphql"):
        if GH_GQL_MERGE.search(b):
            return ("deny" if re.search(r"\b(SQUASH|REBASE)\b", b, re.I) else "ask", P.ASK_MERGE, ep)
        if GH_GQL_READY.search(b):
            return ("ask", P.ASK_READY, ep)
        if GH_GQL_CLOSE.search(b):
            return ("ask", P.ASK_CLOSE, ep)
        if GH_GQL_REF.search(b):
            return ("deny-ref", "", ep)
        if GH_GQL_BRANCH_MERGE.search(b):
            return ("ask", P.ASK_REF, ep)
        if GH_GQL_LABEL_DROP.search(b):
            return ("ask", P.ASK_HOLD, ep)   # label ids are opaque: any removal may be `hold`
        return None
    if m in ("GET", "HEAD", "OPTIONS"):
        return None
    if re.search(r"^web/[^/]+/[^/]+/pull/[^/]+/merge$", ep):
        return ("ask", P.ASK_MERGE, ep)
    if re.search(r"(^|/)pulls/[^/]+/merge(-async)?$", ep) and m in ("PUT", "POST"):
        return ("deny" if re.search(r"merge_method" + _KV + r"(squash|rebase)", b, re.I) else "ask", P.ASK_MERGE, ep)
    if re.search(r"(^|/)pulls/[^/]+/update-branch$", ep) and m in ("PUT", "POST"):
        return ("ask", P.ASK_UPDATE_BRANCH, ep)
    # pass-4 red-team G1: the cloud session's own routes for a ready flip and auto-merge were classified "pass".
    if re.search(r"(^|/)pulls/[^/]+/ccr/ready_for_review$", ep) and m in ("PUT", "POST", "PATCH"):
        return ("ask", P.ASK_READY, ep)
    if re.search(r"(^|/)pulls/[^/]+/ccr/(auto_merge|merge)$", ep) and m in ("PUT", "POST", "PATCH"):
        return ("ask", P.ASK_MERGE, ep)
    if re.search(r"(^|/)(pulls|issues)/[^/]+$", ep) and m in ("PATCH", "POST"):
        if "pulls/" in ep and re.search(r"\bdraft" + _KV + r"(false|0)\b", b, re.I):
            return ("ask", P.ASK_READY, ep)
        if re.search(r"\bstate" + _KV + r"closed\b", b, re.I):
            return ("ask", P.ASK_CLOSE, ep)
        if "issues/" in ep and m == "PATCH" and re.search(r"\blabels\b", b) and not re.search(r"\bhold\b", b, re.I):
            return ("ask", P.ASK_HOLD, ep)   # a PATCH `labels` replaces the list
        return None
    if re.search(r"(^|/)git/refs(/|$)", ep):
        return ("deny-ref", "", ep)
    if re.search(r"(^|/)merges$", ep) and m == "POST":
        return ("ask", P.ASK_REF, ep)
    if re.search(r"(^|/)contents(/|$)", ep) and m in ("PUT", "DELETE", "POST", "PATCH"):
        return ("deny-write", "", ep)
    # WP-L4 (2026-10-27): removing `hold` asks on every REST route — DELETE …/issues/<n>/labels/hold, DELETE of
    # the whole list, a PUT that replaces the list without hold, and a DELETE/PATCH of the repo label itself.
    if re.search(r"(^|/)(issues|pulls)/[^/]+/labels/(hold|X)$", ep, re.I) and m == "DELETE":
        return ("ask", P.ASK_HOLD, ep)
    if re.search(r"(^|/)(issues|pulls)/[^/]+/labels$", ep) and (m == "DELETE" or (m == "PUT" and not re.search(r"\bhold\b", b, re.I))):
        return ("ask", P.ASK_HOLD, ep)
    if re.search(r"(^|/)repos/[^/]+/[^/]+/labels/(hold|X)$", ep, re.I) and m in ("DELETE", "PATCH"):
        return ("ask", P.ASK_HOLD, ep)
    w = re.search(r"(^|/)actions/workflows/([^/]+)/dispatches$", ep)
    if w and m == "POST" and (P.gated_workflow(w.group(2)) or w.group(2) == "X"):
        return ("ask", P.ASK_DISPATCH, ep)
    return None


GH_HOST = re.compile(r"(^|[/@.\s\"'`(])(api\.github\.com|(www\.)?github\.com/[^/\s]+/[^/\s]+/pull/)", re.I)
CURL_DATA = {"-d", "--data", "--data-raw", "--data-binary", "--data-ascii", "--data-urlencode", "--json", "-F", "--form",
             "--form-string"}
CURL_ARG = {"-H", "--header", "-o", "--output", "-u", "--user", "-A", "--user-agent", "-e", "--referer", "-b",
            "--cookie", "-c", "--cookie-jar", "-w", "--write-out", "-m", "--max-time", "--connect-timeout", "-x",
            "--proxy", "--retry", "--retry-delay", "--retry-max-time", "-T", "--upload-file", "--cacert", "--cert",
            "--key", "-D", "--dump-header", "--output-dir", "-r", "--range", "-y", "-Y", "-z", "--limit-rate",
            "--resolve", "--connect-to", "--stderr", "--trace", "--trace-ascii", "--oauth2-bearer", "-K", "--config",
            "--variable", "--expand-url", "--expand-data"}
SCRIPT_URL = re.compile(r"""(https?://(?:api\.)?github\.com/[^\s"'`)]+|`https?://(?:api\.)?github\.com/[^`]+`)""", re.I)


def _data_arg(v, c):
    """A curl/wget body argument; `@file` is read (a missing file reads as empty)."""
    if v.startswith("@") and v != "@-":
        return v + " " + _read(_abs(v[1:], c))
    return v


def _http_from_script(body, interp):
    """[(method, url, blob)] for GitHub calls in a `node -e` / `python -c` body (fetch, https.request, requests.*)."""
    out = []
    if not re.search(r"github\.com", body, re.I):
        return out
    urls = [u.strip("`") for u in SCRIPT_URL.findall(body)]
    if not urls:
        return out
    mm = re.search(r"""method\s*[:=]\s*["'`](\w+)""", body, re.I) or \
        re.search(r"\brequests\.(put|post|patch|delete)\s*\(", body, re.I) or \
        re.search(r"""-X\s*["']?(PUT|POST|PATCH|DELETE)""", body)
    method = (mm.group(1) if mm else ("POST" if re.search(r"\bbody\s*[:=]|\bdata\s*=|\bjson\s*=", body) else "GET")).upper()
    for u in urls:
        out.append((method, u, body))
    return out


def http_issues(text, cwd=None):
    """[{cmd, decision, ask, why}] for GitHub API writes made with curl, wget, `node -e`/`--eval`/`-p` fetch or
    `python -c` (2026-10-26 system audit §10: the egress proxy swaps ANY Authorization header for the admin App token,
    so `curl -X PUT …/pulls/N/merge` squash-merged with no hook in the way). The policy is api_classify, the
    same as `gh api`. Raises ParseError on untokenisable text."""
    out = []
    for _env, argv, _r, c in commands(text, cwd or os.getcwd(), strict=True):
        b = os.path.basename(argv[0])
        args = argv[1:]
        calls = []
        if b == "curl":
            method, urls, data, get = None, [], [], False
            k = 0
            while k < len(args):
                a = args[k]
                nxt = args[k + 1] if k + 1 < len(args) else ""
                if a in ("-X", "--request"):
                    method = nxt.upper(); k += 2; continue
                if a.startswith("--request="):
                    method = a.split("=", 1)[1].upper()
                elif re.match(r"^-X[A-Za-z]+$", a):
                    method = a[2:].upper()
                elif a in CURL_DATA:
                    data.append(_data_arg(nxt, c)); k += 2; continue
                elif any(a.startswith(f + "=") for f in CURL_DATA if f.startswith("--")):
                    data.append(_data_arg(a.split("=", 1)[1], c))
                elif re.match(r"^-d.+", a):
                    data.append(_data_arg(a[2:], c))
                elif a == "--url":
                    urls.append(nxt); k += 2; continue
                elif a.startswith("--url="):
                    urls.append(a.split("=", 1)[1])
                elif a in ("-G", "--get"):
                    get = True
                elif a in ("-I", "--head"):
                    method = method or "HEAD"
                elif a in CURL_ARG:
                    k += 2; continue
                elif not a.startswith("-"):
                    urls.append(a)
                k += 1
            if get:
                method = "GET"
            method = method or ("POST" if data else "GET")
            calls = [(method, u, " ".join(data)) for u in urls if GH_HOST.search(" " + u)]
        elif b == "wget":
            method, urls, data = None, [], []
            k = 0
            while k < len(args):
                a = args[k]
                nxt = args[k + 1] if k + 1 < len(args) else ""
                if a.startswith("--method="):
                    method = a.split("=", 1)[1].upper()
                elif a == "--method":
                    method = nxt.upper(); k += 2; continue
                elif re.match(r"^--(post|body)-(data|file)=", a):
                    v = a.split("=", 1)[1]
                    data.append(_read(_abs(v, c)) if "-file=" in a else v)
                    if a.startswith("--post-"):
                        method = method or "POST"
                elif re.match(r"^--(post|body)-(data|file)$", a):
                    data.append(_read(_abs(nxt, c)) if a.endswith("file") else nxt)
                    if a.startswith("--post-"):
                        method = method or "POST"
                    k += 2; continue
                elif a in ("-O", "--output-document", "-o", "--output-file", "--header", "-U", "--user-agent", "-e",
                           "--execute", "-P", "--directory-prefix", "--user", "--password", "-T", "--timeout"):
                    k += 2; continue
                elif not a.startswith("-"):
                    urls.append(a)
                k += 1
            method = method or ("POST" if data else "GET")
            calls = [(method, u, " ".join(data)) for u in urls if GH_HOST.search(" " + u)]
        elif b in ("node", "nodejs", "bun", "deno", "python", "python3"):
            for m_, a in enumerate(args[:-1]):
                if a in ("-e", "--eval", "-p", "--print", "-c"):
                    calls += _http_from_script(args[m_ + 1], b)
        for method, url, blob in calls:
            hit = api_classify(method, url, blob)
            if hit:
                row = {"cmd": " ".join(argv)[:200], "decision": hit[0], "ask": hit[1], "why": f"{b} {method} {hit[2]}"}
                if _api_ready_pr(hit[2], hit):
                    row["api_ready_pr"] = _api_ready_pr(hit[2], hit)
                out.append(row)
    return out


POLL_WATCH = re.compile(r"\b(ci-watch(\.mjs)?|gh\s+(run|api|pr\s+(checks|view|status|list))|git\s+(log|ls-remote|fetch)|"
                        r"api\.github\.com|pr-board(\.mjs)?)\b")


def _blank_quotes(t):
    """Quoted text blanked (prose is not a command), except a shell `-c` body, which IS commands."""
    out, i, n = [], 0, len(t)
    while i < n:
        ch = t[i]
        if ch in "'\"":
            j = i + 1
            while j < n and t[j] != ch:
                j += 2 if (ch == '"' and t[j] == "\\") else 1
            body = t[i + 1:j]
            out.append(" " + body + " " if re.search(r"(^|\s)-[a-z]*c\s*$", t[:i]) else " ")
            i = j + 1
        else:
            out.append(ch)
            i += 1
    return "".join(out)


def poll_loops(text):
    """[{why}] for a shell poll loop (2026-10-26 system audit: orchestrators ran 120-iteration `ci-watch --once; sleep`
    loops; AGENTS.md rules 4 and 13 say subscribe + one Monitor, never a loop): a for/while/until loop whose header or body
    sleeps AND watches CI/git/the API/the bus, or any `seq …` loop that sleeps. Heredoc bodies and quoted prose are
    not commands."""
    t = _blank_quotes(strip_heredocs(text))
    out = []
    for m in re.finditer(r"(^|[;&|(\s])(for|while|until)\b([\s\S]*?)\bdo\b([\s\S]*?)\bdone\b", t):
        head, body = m.group(3), m.group(4)
        whole = head + " " + body
        if not re.search(r"\bsleep\b", whole):
            continue
        # pass-4 H12: `for i in 1 2 3; do git fetch origin && break; sleep 5; done` is a bounded retry of a
        # network call (a literal list of <= 5 items, no seq, a `break` in the body), not a poll.
        lit = re.match(r"\s*\w+\s+in((?:\s+[\w.-]+){1,5})\s*;?\s*$", head)   # head is the text AFTER the keyword
        if m.group(2) == "for" and lit and re.search(r"\bbreak\b", body) and not re.search(r"\bseq\b", head):
            continue
        w = POLL_WATCH.search(whole)
        if w:
            out.append({"why": m.group(2) + " … " + re.sub(r"\s+", " ", w.group(0)) + " … sleep"})
        elif re.search(r"\bseq\b", head):
            out.append({"why": "seq … sleep"})
    return out


def gh_issues(text, cwd=None):
    """[{cmd, decision: deny|ask, why}] for every `gh` call that merges a PR,
    arms auto-merge, flips a draft ready or moves a branch outside a PR
    (red-team round 2, 2026-10-14): `gh pr merge` (deny with --squash/-s or
    --rebase/-r, else ask), `gh pr ready` (not --undo), and `gh api` on
    …/pulls/<n>/merge, …/merges, …/git/refs (a write: deny-ref, refused outright since batch 9), a PATCH of a pull with
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
                # audit4 A1: `--admin` bypasses the required check (branch protection does not bind admins), so
                # a merge with it lands an ungated head; refused like a squash.
                if _gh_truthy(a, "--admin"):
                    method = "admin"
                if re.match(r"^-[A-Za-z]+$", a):
                    for ch in a[1:]:
                        if ch in GH_MERGE_ARG:
                            break
                        if ch in "sr":
                            method = "squash" if ch == "s" else "rebase"
            out.append({"cmd": cmd, "decision": "deny" if method else "ask", "kind": "merge", "pr": _gh_pr_number(words[2:]),
                        "why": f"gh pr merge --{method}" if method else "gh pr merge"})
        elif words[:2] == ["pr", "ready"]:
            if "--undo" not in argv:
                out.append({"cmd": cmd, "decision": "ask", "kind": "ready", "pr": _gh_pr_number(words[2:]), "why": "gh pr ready"})
        elif words[:2] in (["pr", "edit"], ["issue", "edit"]) and _gh_drops_hold(argv):
            out.append({"cmd": cmd, "decision": "ask", "ask": _hold_text(), "why": f"gh {words[0]} edit --remove-label hold"})
        elif words[:2] in (["label", "delete"], ["label", "edit"]) and any(w.lower() == "hold" for w in words[2:3]):
            out.append({"cmd": cmd, "decision": "ask", "ask": _hold_text(), "why": f"gh label {words[1]} hold"})
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
            blob = " ".join(fields)
            method = method or ("POST" if fields else "GET")
            hit = api_classify(method, endpoint or "", blob)
            if hit:
                row = {"cmd": cmd, "decision": hit[0], "ask": hit[1], "why": f"gh api {method} {hit[2]}"}
                if _api_ready_pr(hit[2], hit):
                    row["api_ready_pr"] = _api_ready_pr(hit[2], hit)
                out.append(row)
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
                "apex_hud_survey", "apex_hud_mock", "apex_track", "apex_ui_fit", "apex_ui_shot", "apex_ui_inspect", "apex_diagnostics", "apex_profile", "apex_job_start"}


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


def _honors_help(path):
    try:
        with open(path, encoding="utf8", errors="replace") as f:
            src = f.read(400000)
    except OSError:
        return False
    return "exitIfHelp(" in src or '"--help"' in src or "'--help'" in src


def _browser_script(path, args, cwd):
    """Why running this script (path) with args boots a browser, else None."""
    res = _abs(path, cwd) if cwd else path
    names = {path, res}
    b = os.path.basename(path)
    # `--help` / `-h` / `help` print and exit (2026-10-26 audit: `tools/shot/agent.mjs --help` and
    # `verify-change.mjs --help` were blocked in a read-only subagent) — but only for a script that HONOURS the
    # flag (exitIfHelp, or a literal "--help" in its source); the census producers do not (test-bg.mjs does since audit4 C2), and an
    # ignored flag must never authorize Chromium.
    if (any(a in ("--help", "-h") for a in args) or args[:1] == ["help"]) and _honors_help(res):
        return None
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
    if b in ("js-debugger-mcp.sh", "js-debugger-cli.mjs", "js-debugger-mcp.mjs", "js-debugger-smoke.mjs"):
        return None if args and args[0] in ("help", "--help", "-h", "list-tools", "--list-tools", "status") else b
    if b in ("apex-tools-mcp.sh", "apex-tools-mcp.mjs"):
        k = _first_positional(args, set())
        if k + 1 < len(args) and args[k] == "call":
            t = args[k + 1] if args[k + 1].startswith("apex_") else "apex_" + args[k + 1]
            return f"{b} call {t}" if t in APEX_BROWSER else None
        return None
    if b == "diagnostics.mjs":
        # The supervisor's JSON dryRun/op fields do not suppress execution.
        # Only its explicit VM producer is browser-free; unknown invocations
        # stay closed rather than depending on a future default.
        return None if args and args[0] == "vm_lifecycle" else b
    if b in ("mem-census.mjs", "gpu-mem-census.mjs", "gfx-probe.mjs"):
        # These producers do not implement the generic --plan/--dry-run
        # escape hatch. An ignored flag must not authorize Chromium.
        return b
    if b == "explorer.mjs":
        return None if ((args and args[0] in ("brief", "report")) or
                        any(a in ("--list", "--help") for a in args)) else b
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
        elif b in SHELLS:
            k = _first_positional(args, set())
            if k < len(args) and os.path.basename(args[k]) in ("js-debugger-mcp.sh", "apex-tools-mcp.sh"):
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


# ---- pass-4 red-team additions (2026-10-26) ----------------------------------------
CONFIG_WRITE_KEYS = re.compile(r"^(core\.hookspath|push\.default|remote\.[^.]+\.(push|mirror|pushurl)|include\.path|includeif\..*\.path|alias\.(push|commit|merge))$", re.I)
CONFIG_OPT_ARG = {"-f", "--file", "--blob", "--type", "--default", "--comment", "--value", "--url"}


def config_issues(text):
    """[{cmd, why}] for a `git config` WRITE of a key that switches hooks or push targets (core.hooksPath,
    push.default, remote.*.push|mirror|pushurl, include.path, an alias shadowing push/commit/merge), or the same
    key through `-c`/GIT_CONFIG_KEY_n. Reads (--get, --list, -l, --show-origin) pass. Raises ParseError."""
    found = []
    for env, argv, cwd, i, _gitdir, cfg in git_commands(text, os.getcwd()):
        why = []
        for kv in cfg:
            k = kv.partition("=")[0]
            if CONFIG_WRITE_KEYS.match(k):
                why.append(f"-c {k} widens or disables a guard")
        for n in range(0, 20):
            k = (env or {}).get(f"GIT_CONFIG_KEY_{n}")
            if k and CONFIG_WRITE_KEYS.match(k):
                why.append(f"GIT_CONFIG_KEY_{n}={k}")
        if i < len(argv) and argv[i] == "config":
            args = argv[i + 1:]
            reading = any(a in ("--get", "--get-all", "--get-regexp", "--list", "-l", "--show-origin", "--show-scope") for a in args)
            # 2026-10-28 (commit-hook split: core.hooksPath now carries the whole commit gate): skip option VALUES
            # (`--file .git/config core.hooksPath x` read `.git/config` as the key) and read git 2.46's subcommand
            # form (`git config set|unset|replace-all <key>`); removing or renaming the `core` section drops it too.
            keys, k = [], 0
            while k < len(args):
                a = args[k]
                if a in CONFIG_OPT_ARG:
                    k += 2
                    continue
                if not a.startswith("-"):
                    keys.append(a)
                k += 1
            if keys and keys[0] in ("get", "list"):
                reading = True
            elif keys and keys[0] in ("set", "unset", "replace-all", "add"):
                keys = keys[1:]
            section = keys[1:2] if keys and keys[0] in ("remove-section", "rename-section") else (
                keys[:1] if any(a in ("--remove-section", "--rename-section") for a in args) else [])
            if not reading and section and section[0].lower() == "core":
                why.append("git config removes or renames the core section (core.hooksPath)")
            elif not reading and keys and CONFIG_WRITE_KEYS.match(keys[0]):
                why.append(f"git config {keys[0]} is a write")
        if why:
            found.append({"cmd": " ".join(argv), "why": sorted(set(why))})
    return found


INTERP = ("python", "python3", "node", "nodejs", "perl", "ruby", "php", "lua", "bun", "deno", "tsx")
# GitHub URLs inside an interpreter body are NOT listed here: http_issues already classifies `node -e fetch(…)` and
# `python -c` calls to api.github.com with the gh api policy (deny squash, ask merge/ready …).
WRAPPED_VERB = re.compile(r"\b(git\s+(push|config|merge|rebase|reset|stash)|gh\s+(pr\s+(merge|ready)|api))\b")


def wrapped_issues(text):
    """[cmd] for a git push/config/merge or a GitHub write hidden in an interpreter body (`python3 -c
    "os.system('git push …')"`, `node -e`, `perl -e`), or behind an obfuscated command word (`g''it`, `${X}t`,
    `$GIT push`). The parser cannot inspect those; a plain command can be checked (pass-4 red-team X5/R5)."""
    found = []
    # quote-split command words (`g''it push`, `gi"t" push`) survive tokenisation as `git`; the raw text is checked
    # first, and a ParseError (an unbalanced quote) leaves the regex fallbacks in bash-guard.sh to decide.
    if re.search(r"\bg['\"]+it\b|\bgi['\"]+t\b|\bg['\"]*i['\"]+t\b", text) and re.search(r"\b(push|merge|config)\b", text):
        return [text.strip()[:120]]
    try:
        cmds = list(commands(text, os.getcwd(), strict=True))
    except ParseError:
        return found
    for env, argv, _redir, _cwd in cmds:
        if not argv:
            continue
        head = argv[0]
        if re.search(r"[$`]", head) and WRAPPED_VERB.search(" ".join(argv[1:])):
            found.append(" ".join(argv))
            continue
        if os.path.basename(head) in INTERP:
            for k, a in enumerate(argv):
                if a in ("-c", "-e", "--eval", "-p", "--print", "-E") and k + 1 < len(argv) and WRAPPED_VERB.search(argv[k + 1]):
                    found.append(" ".join(argv))
                    break
    return found


KILL_SCAN = re.compile(r"\bxargs\b(\s+-\S+)*\s+(kill|pkill)\b|\bos\.kill\s*\(|\bprocess\.kill\s*\(|\bProcess\.kill\b|\bkill\s+(-\S+\s+)*\$\(\s*(pgrep|ps|lsof|fuser)\b")


def kill_issues(text):
    """[cmd] for a process kill that finds its target by scanning (xargs kill after ps/pgrep/lsof, os.kill,
    process.kill, `kill $(pgrep …)`): the same orphaned-browser hazard as `pkill -f` (pass-4 H12)."""
    t = _blank_quotes(strip_heredocs(text))
    hits = [m.group(0) for m in KILL_SCAN.finditer(t)] + [m.group(0) for m in KILL_SCAN.finditer(text) if "kill" in m.group(0) and ("os." in m.group(0) or "process." in m.group(0))]
    return sorted(set(hits))


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
    # Invalid trusted wrappers must not fall through raw-command regexes: the
    # dangerous leaf is behind node and those fallbacks cannot see it.
    try:
        list(commands(cmd, os.getcwd(), strict=True))
    except AgentRunError as error:
        sys.stderr.write("BLOCKED: cannot inspect agent-run command: " + str(error) + ".\n")
        return 2
    except ParseError:
        if "agent-run.mjs" in cmd:
            sys.stderr.write("BLOCKED: cannot parse agent-run command; use a literal supported invocation.\n")
            return 2
    try:
        allc = commit_info(cmd)
        c = [x for x in allc if not x.get("dry") and not x.get("skip")]
        paths = sorted({p for x in c for p in x.get("paths") or []})
        gd = next((x["gitdir"] for x in c if x.get("gitdir")), "") or "-"
        print(len(allc), "1" if c else "0", "1" if any(x.get("all") for x in c) else "0", gd, " ".join(paths))
    except ParseError:
        allc = []
        print("NULL")
    dests = []
    try:
        pushes = push_issues(cmd, dests=dests)
        raises = ratchet_issues(cmd)
        gh = gh_issues(cmd) + http_issues(cmd)
        polls = poll_loops(cmd)
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
    if raises and os.environ.get("APEX_RATCHET_RAISE_OK") != "1":
        sys.stderr.write("BLOCKED: `" + raises[0] + "` can RAISE a size ceiling by hand (shared safety ban 1). A ceiling "
                         "rises only through the commit hook's --auto-raise (<= 40 lines of real growth, written to this "
                         "branch's tests/data/ratchets.d/<branch>.json). Extract code to fit, lower with "
                         "`ratchets.mjs --update --lower-only`, or ask Bryce; APEX_RATCHET_RAISE_OK=1 only when he typed "
                         "the raise in this session.\n")
        return 2
    if dests and os.environ.get("APEX_FOREIGN_PUSH_OK") != "1":
        import foreign_push
        for where, remote, branch, penv in dests:
            if (penv or {}).get("APEX_FOREIGN_PUSH_OK") == "1":   # the push's own prefix, not any text
                continue
            msg = foreign_push.check(where, remote, branch)
            if msg:
                sys.stderr.write(msg)
                return 2
    if browser:
        sys.stderr.write("BLOCKED: a subagent never starts a browser run (AGENTS.md §Verification 10) — "
                         + ", ".join(sorted(set(browser))) + ": one group saturates this box and the parent owns the "
                         "only Playwright process. Run the node-only checks (verify-change.mjs --fast, node --test, "
                         "verify-track.cjs) and report the browser groups as NOT RUN; the parent starts them.\n")
        return 2
    cfgw = config_issues(cmd)
    if cfgw:
        sys.stderr.write("BLOCKED: `" + cfgw[0]["cmd"] + "` — " + "; ".join(cfgw[0]["why"]) + " (pass-4 red-team R2: it "
                         "switches git's hooks or push targets off for every worktree and later session in this container).\n")
        return 2
    # 2026-10-28 commit-hook split, step 1 (Bryce: "Yes, split it"; docs/plans/2026-10-27-landing-and-agent-ops.md
    # §4): .githooks/pre-commit is the commit gate for Cursor and Codex today and becomes the one owner of
    # test:guards for every host, so `git commit --no-verify` / `-n` (any unambiguous `--no-veri…` prefix, in a
    # short cluster, through an alias) is refused. APEX_SKIP_GUARDS=1 stays the sanctioned bypass (both gates honour it).
    unverified = [x for x in allc if x.get("noverify") and not x.get("dry")]
    if unverified:
        sys.stderr.write("BLOCKED: `git commit --no-verify` / `-n` skips .githooks/pre-commit, the git commit gate "
                         "(test:guards, docs-integrity, the ratchet auto-raise; AGENTS.md rule 12). Commit without it; "
                         "if the guards themselves are the change, prefix APEX_SKIP_GUARDS=1 instead.\n")
        return 2
    wrapped = wrapped_issues(cmd)
    if wrapped:
        sys.stderr.write("BLOCKED: `" + wrapped[0] + "` runs a git push / merge / config write inside an interpreter body "
                         "or through an obfuscated command word, which the guard cannot inspect (pass-4 red-team X5). "
                         "Run it as one plain shell command.\n")
        return 2
    kills = kill_issues(cmd)
    if kills:
        sys.stderr.write("BLOCKED: `" + kills[0] + "` kills processes by scanning for them (pass-4 H12: `xargs kill`, "
                         "os.kill, process.kill), which orphans the browsers of a live run exactly like `pkill -f` "
                         "(AGENTS.md §Verification 7). Kill one listed PID of your own, or `node tools/ci/test-bg.mjs --stop`.\n")
        return 2
    unsigned = signing_issues(cmd)
    if unsigned:
        sys.stderr.write("BLOCKED: `" + unsigned[0]["cmd"] + "` turns commit signing off (" + "; ".join(unsigned[0]["why"])
                         + ") — shared safety ban 5 (Transcript Auditor batch 9). Commits stay signed; if signing "
                         "fails, report the error in your PR or to Bryce instead of disabling it.\n")
        return 2
    refs = [x for x in gh if x["decision"] == "deny-ref"]
    if refs:
        sys.stderr.write("BLOCKED: `" + refs[0]["cmd"] + "` (" + refs[0]["why"] + ") " + P.DENY_REF + "\n")
        return 2
    writes = [x for x in gh if x["decision"] == "deny-write"]
    if writes:
        sys.stderr.write("BLOCKED: `" + writes[0]["cmd"] + "` (" + writes[0]["why"] + ") " + P.DENY_WRITE + "\n")
        return 2
    if polls and os.environ.get("APEX_POLL_OK") != "1" and not re.search(r"(^|[;&|(]\s*)APEX_POLL_OK=1\s", cmd):
        sys.stderr.write("BLOCKED: a shell poll loop (" + "; ".join(sorted({p["why"] for p in polls})) + ") — AGENTS.md "
                         "rules 4 and 13: subscribe, then at most one `ci-watch.mjs --once`, or ONE Monitor on "
                         "`node tools/ci/ci-watch.mjs --sha <sha> --failures-only` / `node tools/ci/wait-for.mjs`; never "
                         "a for/while … sleep loop (2026-10 week: three 120-iteration loops in one orchestrator). "
                         "APEX_POLL_OK=1 <command> for a bounded retry of a network call.\n")
        return 2
    closed = closed_pr_refusal(dests, root) if dests and os.environ.get("APEX_CLOSED_PR_PUSH_OK") != "1" else ""
    if closed:
        sys.stderr.write(closed)
        return 2
    ctx = gate_pipe_warning(cmd)
    deny = [x for x in gh if x["decision"] == "deny"]
    if deny:
        P.emit("deny", P.DENY_METHOD + " (" + deny[0]["why"] + ")")
        return 0
    # `gh pr merge` is denied outright, like the MCP door (WP-L4, 2026-10-27: no session merges or arms; the old
    # receipt path opened only to a hand-written artifacts/merge-gate/<n>.json). `gh pr ready <n>` takes the
    # ready receipt, tied to the PR's LIVE head (merge_policy.live_head); an unknown head refuses.
    merges = [x for x in gh if x.get("kind") == "merge"]
    if merges:
        P.emit("deny", P.DENY_GATE_MERGE + " (" + merges[0]["why"] + ")")
        return 0
    gated = [x for x in gh if x.get("kind") == "ready"]
    receipts = P.project_root()   # CLAUDE_PROJECT_DIR, the same root github-mcp-guard.sh reads
    for x in gated:
        live = P.live_head(receipts, x.get("pr")) if x.get("pr") else None
        ok, why = P.receipt_check(receipts, "ready", x.get("pr"), live, verify_files=True, require_head=True)
        if not ok:
            P.emit("deny", P.DENY_GATE_READY + " (" + x["why"] + ": " + why + ")")
            return 0
    # 2026-10-26: no APEX_MERGE_DESK silent pass here any more (system audit §10: the env was set for EVERY session,
    # so a worker's GraphQL/REST merge-by-id or ready flip never asked). An ask asks whoever runs the session.
    # A REST ready flip (`gh api …/ccr/ready_for_review`, curl, …) passes with the same fresh ready-gate receipt
    # as `gh pr ready` and the MCP door; without one it still asks, with the DENY_GATE_READY text.
    rest = []
    for x in gh:
        if x.get("kind") == "ready":
            continue
        n = x.get("api_ready_pr")
        if n and x.get("decision") == "ask":
            live = P.live_head(receipts, n)
            ok, why = P.receipt_check(receipts, "ready", n, live, verify_files=True, require_head=True)
            if ok:
                continue
            x = dict(x, ask=P.DENY_GATE_READY + " (" + why + ")")
        rest.append(x)
    if rest:
        P.emit("ask", (rest[0].get("ask") or P.ASK_MERGE) + " (" + rest[0]["why"] + ")", ctx)
    elif ctx:
        P.emit(None, None, ctx)
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
    elif mode == "agent-run":
        leaves = []
        try:
            list(commands(text, sys.argv[2] if len(sys.argv) > 2 else os.getcwd(), strict=True, agent_leaves=leaves))
        except AgentRunError as error:
            sys.stderr.write("BLOCKED: cannot inspect agent-run command: " + str(error) + ".\n")
            sys.exit(2)
        except ParseError:
            if "agent-run.mjs" in text:
                sys.stderr.write("BLOCKED: cannot parse agent-run command; use a literal supported invocation.\n")
                sys.exit(2)
        print("\n".join(leaves))
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
