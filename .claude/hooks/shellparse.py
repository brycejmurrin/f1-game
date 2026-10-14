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


# ---- git push ------------------------------------------------------------------
DEPLOY_BRANCH = "claude/f1-game-project-26h3ng"
PUSH_WITH_ARG = {"-o", "--push-option", "--repo", "--receive-pack", "--exec"}


def _current_branch(cwd):
    try:
        import subprocess
        r = subprocess.run(["git", "-C", cwd or ".", "rev-parse", "--abbrev-ref", "HEAD"],
                           capture_output=True, text=True, timeout=5)
        return r.stdout.strip()
    except Exception:
        return ""


def push_issues(text, branch_of=_current_branch):
    """Why each `git … push …` in the command is refused (2026-10-14): a force
    (-f, --force, --force-with-lease, a +refspec), --mirror, --delete / -d / a
    `:dst` refspec, --all, or any push whose destination is the deploy branch —
    named in a refspec, or implied by a bare/HEAD push while on it. [] = fine.
    Raises ParseError on untokenisable text."""
    found = []
    start = os.getcwd()
    for _env, argv, _r, cwd in commands(text, start, strict=True):
        if os.path.basename(argv[0]) != "git":
            continue
        i = 1
        gitdir = None
        while i < len(argv) and argv[i].startswith("-"):
            if argv[i] in GIT_GLOBAL_WITH_ARG:
                if argv[i] == "-C" and i + 1 < len(argv):
                    gitdir = argv[i + 1]
                i += 2
                continue
            i += 1
        if i >= len(argv) or argv[i] != "push":
            continue
        where = _abs(gitdir, cwd) if gitdir else (cwd or start)
        why, pos = [], []
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
                if key in ("--force", "--force-with-lease", "--force-if-includes"):
                    why.append(f"force push ({a})")
                elif key == "--mirror":
                    why.append("--mirror rewrites every remote ref")
                elif key == "--delete":
                    why.append("--delete removes a remote branch")
                elif key == "--all":
                    why.append("--all pushes every local branch (the deploy branch included)")
                elif key in PUSH_WITH_ARG and "=" not in a:
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
            src, colon, dst = r.partition(":")
            if colon and not src:
                why.append(f"delete (refspec {r})")
            if not colon:
                dst = src
            if dst == "HEAD" or (not colon and src == "HEAD"):
                cur = cur if cur is not None else branch_of(where)
                dst = cur
            if dst.startswith("refs/heads/"):
                dst = dst[len("refs/heads/"):]
            if dst == DEPLOY_BRANCH:
                why.append(f"the destination is the deploy branch {DEPLOY_BRANCH}")
        if not refspecs:
            cur = branch_of(where)
            if cur == DEPLOY_BRANCH:
                why.append(f"a bare push from the deploy branch {DEPLOY_BRANCH} pushes it")
        if why:
            found.append({"cmd": " ".join(argv), "why": sorted(set(why))})
    return found


# ---- writes -------------------------------------------------------------------
def _abs(p, cwd):
    p = os.path.expanduser(p)
    return os.path.normpath(p if os.path.isabs(p) else os.path.join(cwd or os.getcwd(), p))


# Allow-listed "read" commands that write a named file (R4-SUPPLY-4, 2026-10-10):
# `git checkout <ref> -- f`, `git restore --source=<ref> f`, `git diff --output=f`,
# `sed -n 'w f'`, `curl -so f URL` each overwrote a generated file with no hook.
CHECKOUT_WITH_ARG = {"-b", "-B", "--orphan", "--conflict", "--pathspec-from-file", "-s", "--source"}
GIT_OUTPUT_CMDS = {"diff", "log", "show", "diff-tree", "diff-index", "diff-files", "whatchanged",
                   "range-diff", "format-patch"}
# curl options whose argument is a file curl WRITES (`-` is stdout), and the
# short options that take an argument (the rest of a cluster is that argument).
CURL_WRITE_ARG = {"-o", "--output", "-D", "--dump-header", "-c", "--cookie-jar", "--trace", "--trace-ascii",
                  "--stderr", "--libcurl"}
CURL_SHORT_ARG = set("AbcCdDeEFhHKmoPQrtTuUwxXyYz")


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
        while k < len(rest):
            a = rest[k]
            if a == "--":
                after = rest[k + 1:]
                break
            if a in CHECKOUT_WITH_ARG:
                branch = branch or a in ("-b", "-B", "--orphan")
                k += 2
                continue
            if a in ("--staged", "--worktree"):
                staged, worktree = staged or a == "--staged", worktree or a == "--worktree"
            elif re.match(r"^-[A-Za-z]", a) and not a.startswith("--"):
                flags = a[1:].split("s", 1)[0]   # -sHEAD~5: the rest is restore's source
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
        out += [(p, "git-" + sub) for p in paths]
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
    git checkout/restore pathspecs and --output, curl -o."""
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
    elif mode == "writes":
        print(json.dumps(write_targets(text, sys.argv[2] if len(sys.argv) > 2 else os.getcwd())))
    else:
        print("usage: shellparse.py commit|push|writes [cwd] < command", file=sys.stderr)
        sys.exit(2)
