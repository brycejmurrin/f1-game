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

KNOWN GAPS (documented, not silently claimed): writes made by an interpreter
(`python3 -c "open(...,'w')"`, `node -e "fs.writeFileSync(…)"`), by `git
apply`/`patch`, or through a variable or command substitution in the target
are not seen. Unparseable text (an unbalanced quote) yields a conservative
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
WRAPPERS = {"sudo", "exec", "nice", "nohup", "command", "time", "builtin", "stdbuf", "timeout", "xargs"}
SHELLS = {"sh", "bash", "dash", "zsh"}
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


def split_commands(toks):
    """[[argv tokens incl. redirections], …] split on separators."""
    cmds, cur = [], []
    for t in toks:
        if t in SEPS or (t and set(t) <= set(";&|()\n`")):
            if cur:
                cmds.append(cur)
            cur = []
            continue
        cur.append(t)
    if cur:
        cmds.append(cur)
    return cmds


def peel(argv):
    """Strip leading VAR=value assignments and wrapper commands. Returns
    (env_assignments, argv)."""
    env = {}
    i = 0
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
                elif argv[i] in ("-u", "-C", "-S"):
                    i += 1
                i += 1
            continue
        if base in WRAPPERS:
            i += 1
            # wrapper flags (nice -n 5, timeout 30, sudo -u x, xargs -0 …)
            while i < len(argv) and (argv[i].startswith("-") or (base in ("timeout",) and re.match(r"^\d", argv[i]))
                                     or (base == "nice" and i > 0 and argv[i - 1] == "-n")):
                if argv[i] in ("-n", "-u", "-g", "-I", "-L", "-P", "-s", "-k") and i + 1 < len(argv):
                    i += 1
                i += 1
            continue
        break
    return env, argv[i:]


def commands(text, cwd=None, depth=0, strict=False):
    """Yield (env, argv, redirects, cwd) for every simple command, with
    `sh -c BODY` unwrapped and `cd` tracked. `strict` raises ParseError on
    untokenisable text (here or in a `-c` / eval body) instead of yielding
    nothing, so a caller that must not miss a command can fail closed."""
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
    for raw in split_commands(toks):
        # Pull redirections out of the argv.
        argv, redirs = [], []
        i = 0
        while i < len(raw):
            t = raw[i]
            if t in REDIRS or t in (">", ">>"):
                tgt = raw[i + 1] if i + 1 < len(raw) else ""
                # `2>&1` style: shlex gives ">" then "&" — a separator, already split.
                redirs.append((t, tgt))
                i += 2
                continue
            if t in ("<", "<<", "<<<", "<<-", ">&", "<&") or re.match(r"^[<>]+&$", t):
                i += 2   # input redirection, a heredoc delimiter, or an fd dup (2>&1)
                continue
            if re.match(r"^\d$", t) and i + 1 < len(raw) and (raw[i + 1] in REDIRS or raw[i + 1].endswith("&")):
                i += 1
                continue
            argv.append(t)
            i += 1
        env, argv = peel(argv)
        if not argv:
            continue
        base = os.path.basename(argv[0])
        if base == "cd" and len(argv) > 1 and cwd:
            nxt = os.path.expanduser(argv[1])
            cwd = os.path.normpath(nxt if os.path.isabs(nxt) else os.path.join(cwd, nxt))
            continue
        if base in SHELLS and depth < 4:
            j = 1
            body = None
            while j < len(argv):
                if re.match(r"^-[a-z]*c[a-z]*$", argv[j]):
                    body = argv[j + 1] if j + 1 < len(argv) else None
                    break
                if not argv[j].startswith("-"):
                    break
                j += 1
            if body is not None:
                yield from commands(body, cwd, depth + 1, strict)
                continue
        if base == "eval" and depth < 4 and len(argv) > 1:
            yield from commands(" ".join(argv[1:]), cwd, depth + 1, strict)
            continue
        yield env, argv, redirs, cwd


# ---- git commit ---------------------------------------------------------------
GIT_GLOBAL_WITH_ARG = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env", "--exec-path", "--super-prefix"}
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
    for env, argv, _r, cwd in commands(text, start, strict=True):
        if os.path.basename(argv[0]) != "git":
            continue
        i = 1
        gitdir = None
        while i < len(argv) and argv[i].startswith("-"):
            a = argv[i]
            if a in GIT_GLOBAL_WITH_ARG:
                if a == "-C" and i + 1 < len(argv):
                    gitdir = argv[i + 1]
                i += 2
                continue
            i += 1
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


# ---- writes -------------------------------------------------------------------
def _abs(p, cwd):
    p = os.path.expanduser(p)
    return os.path.normpath(p if os.path.isabs(p) else os.path.join(cwd or os.getcwd(), p))


def write_targets(text, cwd):
    """Files (absolute) a command writes: redirections, sed/perl -i, tee,
    cp/mv/install/rsync/ln destinations, truncate, dd of=."""
    out = []
    for _env, argv, redirs, c in commands(text, cwd):
        for op, tgt in redirs:
            if tgt and not tgt.startswith("&") and tgt != "/dev/null":
                out.append({"path": _abs(tgt, c), "kind": "append" if ">>" in op else "redirect"})
        base = os.path.basename(argv[0])
        args = argv[1:]
        if base in ("sed", "gsed", "perl"):
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
    return out


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    text = sys.stdin.read()
    if mode == "commit":
        try:
            print(json.dumps(commit_info(text)))
        except ParseError:
            print("null")
    elif mode == "writes":
        print(json.dumps(write_targets(text, sys.argv[2] if len(sys.argv) > 2 else os.getcwd())))
    else:
        print("usage: shellparse.py commit|writes [cwd] < command", file=sys.stderr)
        sys.exit(2)
