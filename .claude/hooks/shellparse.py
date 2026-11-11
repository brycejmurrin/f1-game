"""shellparse.py — the shell tokeniser behind the Bash hooks (bash-guard.py, tools/hooks/readonly-bash.sh).

`commands(text)` splits one Bash tool command into the SIMPLE COMMANDS a shell would run and returns them as
`Cmd` records: every element of a pipeline, a list (`;` `&&` `||` `&` newline), a subshell, a `{ …; }` group, an
`if/while/until/for/case` body, a `$(…)` / backtick / `<(…)` substitution (also inside double quotes), the script
of `bash -c` / `sh -c` / `eval`, and a heredoc or here-string that a shell reads on stdin.

What is NOT a command, by construction: a quoted string (a commit message, an `echo` argument, a `grep` pattern), a
heredoc body fed to anything but a shell (`cat > notes.md <<EOF`), a comment. A rule that reads `Cmd.argv` therefore
judges what runs, never what is merely mentioned.

`Cmd.argv` is the effective argv: env assignments (`VAR=x cmd`), a leading backslash (`\\pkill`), and the wrappers
that run their argument (`command`, `builtin`, `env [-i] [-u N] [-S str]`, `nice [-n N]`, `nohup`, `time [-p]`,
`timeout [opts] DUR`, `stdbuf`, `setsid`, `ionice`, `sudo [opts]`, `doas`, `exec [-a N]`, `xargs [opts]`,
`noglob`, `nocorrect`) are stripped; `Cmd.prog` is the basename of argv[0]. `Cmd.assigns` keeps the stripped
assignments, `Cmd.redirs` the redirections as (op, target), `Cmd.raw` the words before stripping.

A seatbelt, not a proof: a verb assembled at run time (`$x`, `${a}${b}`, a script file the command runs) is not
seen. Unbalanced quotes or an unterminated substitution raise ParseError; callers refuse then (fail closed).
"""
import os
import re
import shlex

__all__ = ["ParseError", "Cmd", "commands", "SHELLS"]


class ParseError(Exception):
    pass


SHELLS = {"sh", "bash", "dash", "zsh", "ksh", "ash"}
OPS = ["&&", "||", ";;&", ";;", ";&", "|&", "&>>", "&>", "<<<", "<<-", "<<", "<>", "<&", ">&", ">>", ">|",
       ";", "&", "|", "(", ")", "<", ">", "\n"]
REDIR = {"&>>", "&>", "<<<", "<<-", "<<", "<>", "<&", ">&", ">>", ">|", "<", ">"}
SEP = {"&&", "||", ";;&", ";;", ";&", ";", "&", "\n", "|", "|&", "(", ")"}
RESERVED_SKIP = {"if", "then", "else", "elif", "fi", "do", "done", "while", "until", "!", "{", "}", "esac", "]]"}
ASSIGN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=")


class Word:
    __slots__ = ("text", "subs", "quoted")

    def __init__(self):
        self.text, self.subs, self.quoted = [], [], False


class Cmd:
    __slots__ = ("raw", "argv", "prog", "assigns", "redirs", "heredocs", "pipe", "nested", "words")

    def __repr__(self):
        return "Cmd(%r)" % (self.argv,)


class Lexer:
    """Tokens: ("w", Word) | ("op", str) | ("redir", op, fd). Heredoc bodies land on the redir as a 4th item."""

    def __init__(self, s, depth=0):
        if depth > 12:
            raise ParseError("nesting too deep")
        self.s, self.i, self.n, self.depth = s, 0, len(s), depth

    def peek(self, k=0):
        j = self.i + k
        return self.s[j] if j < self.n else ""

    def sub(self, body):
        return Lexer(body, self.depth + 1).run()

    def balanced(self, open_, close):
        """Raw text up to the matching close (quotes respected); self.i is past the opener."""
        start, depth = self.i, 1
        while self.i < self.n:
            c = self.s[self.i]
            if c == "\\":
                self.i += 2
                continue
            if c in "'\"":
                q = c
                self.i += 1
                while self.i < self.n and self.s[self.i] != q:
                    self.i += 2 if (q == '"' and self.s[self.i] == "\\") else 1
                self.i += 1
                continue
            if c == open_:
                depth += 1
            elif c == close:
                depth -= 1
                if depth == 0:
                    self.i += 1
                    return self.s[start:self.i - 1]
            self.i += 1
        raise ParseError("unterminated %s…%s" % (open_, close))

    def dollar(self, w):
        """At '$': $( … ), $(( … )), ${ … }, $' … ', $" … ", or a plain $."""
        nxt = self.peek(1)
        if nxt == "(" and self.peek(2) == "(":
            self.i += 3
            w.text.append("$((" + self.balanced("(", ")") + "))")
            if self.peek() == ")":
                self.i += 1
            return
        if nxt == "(":
            self.i += 2
            toks, end = Lexer(self.s, self.depth + 1).run_from(self.i, stop=")")
            self.i = end
            w.subs.append(toks)
            w.text.append("$(…)")
            return
        if nxt == "{":
            self.i += 2
            w.text.append("${" + self.balanced("{", "}") + "}")
            return
        if nxt == "'":
            self.i += 2
            out = []
            while True:
                if self.i >= self.n:
                    raise ParseError("unterminated $'")
                c = self.s[self.i]
                if c == "\\" and self.i + 1 < self.n:
                    out.append(self.s[self.i:self.i + 2])
                    self.i += 2
                    continue
                if c == "'":
                    self.i += 1
                    break
                out.append(c)
                self.i += 1
            w.text.append("".join(out))
            w.quoted = True
            return
        w.text.append("$")
        self.i += 1

    def dquote(self, w):
        self.i += 1
        w.quoted = True
        while True:
            if self.i >= self.n:
                raise ParseError("unterminated double quote")
            c = self.s[self.i]
            if c == '"':
                self.i += 1
                return
            if c == "\\" and self.i + 1 < self.n:
                nx = self.s[self.i + 1]
                w.text.append(nx if nx in '"\\$`\n' else "\\" + nx)
                self.i += 2
                continue
            if c == "$" and self.peek(1) in "({":
                self.dollar(w)
                continue
            if c == "`":
                self.backtick(w)
                continue
            w.text.append(c)
            self.i += 1

    def backtick(self, w):
        self.i += 1
        start = self.i
        while self.i < self.n and self.s[self.i] != "`":
            self.i += 2 if self.s[self.i] == "\\" else 1
        if self.i >= self.n:
            raise ParseError("unterminated backtick")
        body = self.s[start:self.i].replace("\\`", "`")
        self.i += 1
        w.subs.append(self.sub(body))
        w.text.append("`…`")

    def heredoc_bodies(self, pending):
        for tok in pending:
            delim, strip = tok[3], tok[1] == "<<-"
            lines = []
            while self.i < self.n:
                j = self.s.find("\n", self.i)
                line = self.s[self.i:] if j < 0 else self.s[self.i:j]
                self.i = self.n if j < 0 else j + 1
                if (line.lstrip("\t") if strip else line) == delim:
                    break
                lines.append(line)
            tok[3] = "\n".join(lines)
        pending.clear()

    def run(self):
        toks, end = self.run_from(0, stop=None)
        return toks

    def run_from(self, i, stop):
        self.i = i
        toks, pending, w, parens = [], [], None, 0
        want_delim = None

        def end_word():
            nonlocal w, want_delim
            if w is None:
                return
            text = "".join(w.text)
            if want_delim is not None:
                want_delim[3] = text            # a heredoc delimiter: quotes already removed
                pending.append(want_delim)
                want_delim = None
            else:
                toks.append(("w", w, text))
            w = None

        while self.i < self.n:
            c = self.s[self.i]
            if c in " \t":
                end_word()
                self.i += 1
                continue
            if c == "\\":
                if self.peek(1) == "\n":
                    self.i += 2
                    continue
                if w is None:
                    w = Word()
                w.text.append(self.peek(1))
                w.quoted = True
                self.i += 2
                continue
            if c == "#" and w is None:
                while self.i < self.n and self.s[self.i] != "\n":
                    self.i += 1
                continue
            if c == "'":
                if w is None:
                    w = Word()
                j = self.s.find("'", self.i + 1)
                if j < 0:
                    raise ParseError("unterminated single quote")
                w.text.append(self.s[self.i + 1:j])
                w.quoted = True
                self.i = j + 1
                continue
            if c == '"':
                if w is None:
                    w = Word()
                self.dquote(w)
                continue
            if c == "`":
                if w is None:
                    w = Word()
                self.backtick(w)
                continue
            if c == "$":
                if w is None:
                    w = Word()
                self.dollar(w)
                continue
            if c in "<>" and self.peek(1) == "(":
                end_word()
                self.i += 2
                sub_toks, end = Lexer(self.s, self.depth + 1).run_from(self.i, stop=")")
                self.i = end
                pw = Word()
                pw.subs.append(sub_toks)
                pw.text.append("<(…)")
                toks.append(("w", pw, "<(…)"))
                continue
            op = next((o for o in OPS if self.s.startswith(o, self.i)), None)
            if op is None:
                if w is None:
                    w = Word()
                w.text.append(c)
                self.i += 1
                continue
            # an operator ends the current word; a bare digit word before < or > is an fd number
            fd = None
            if op in REDIR and w is not None and not w.quoted and not w.subs and "".join(w.text).isdigit():
                fd, w = "".join(w.text), None
            end_word()
            self.i += len(op)
            if op == ")" and stop == ")" and parens == 0:
                if pending:
                    raise ParseError("heredoc inside a substitution never ended")
                return toks, self.i
            if op == "(":
                parens += 1
            elif op == ")":
                parens -= 1
            if op == "\n":
                toks.append(("op", "\n"))
                if pending:
                    self.heredoc_bodies(pending)
                continue
            if op in REDIR:
                tok = ["redir", op, fd, None]
                toks.append(tok)
                if op in ("<<", "<<-"):
                    want_delim = tok
                continue
            toks.append(("op", op))
        end_word()
        if stop is not None:
            raise ParseError("unterminated $( … )")
        if want_delim is not None:
            raise ParseError("heredoc with no delimiter")
        if pending:                              # heredoc opened on the last line: its body is empty
            for tok in pending:
                tok[3] = ""
        return toks, self.i


def _strip(argv):
    """Effective argv and the env assignments the wrappers carried."""
    assigns, i = [], 0
    while i < len(argv) and ASSIGN.match(argv[i]):
        assigns.append(argv[i])
        i += 1
    argv = argv[i:]
    while argv:
        a0 = argv[0].lstrip("\\")
        b = os.path.basename(a0)
        rest = argv[1:]
        def opts(with_arg=()):
            j = 0
            while j < len(rest):
                x = rest[j]
                if x == "--":
                    return j + 1
                if not x.startswith("-") or x == "-":
                    return j
                j += 2 if x in with_arg else 1
            return j
        if b in ("command", "builtin"):
            if rest[:1] and rest[0] in ("-v", "-V"):
                return [], assigns           # a lookup, not a run
            argv = rest[1:] if rest[:1] == ["-p"] else rest
            continue
        if b in ("nohup", "noglob", "nocorrect"):
            argv = rest
            continue
        if b == "exec":
            argv = rest[opts(("-a",)):]
            continue
        if b == "time":
            argv = rest[opts():]
            continue
        if b == "env":
            j = 0
            while j < len(rest):
                x = rest[j]
                if x in ("-u", "--unset", "-C", "--chdir"):
                    j += 2
                elif x in ("-S", "--split-string") and j + 1 < len(rest):
                    try:
                        rest = rest[:j] + shlex.split(rest[j + 1]) + rest[j + 2:]
                    except ValueError:
                        raise ParseError("env -S string")
                elif x.startswith("-S") and len(x) > 2:
                    try:
                        rest = rest[:j] + shlex.split(x[2:]) + rest[j + 1:]
                    except ValueError:
                        raise ParseError("env -S string")
                elif x == "--":
                    j += 1
                    break
                elif x.startswith("-"):
                    j += 1
                elif ASSIGN.match(x):
                    assigns.append(x)
                    j += 1
                else:
                    break
            argv = rest[j:]
            continue
        if b == "nice":
            argv = rest[opts(("-n", "--adjustment")):]
            continue
        if b == "ionice":
            argv = rest[opts(("-c", "-n", "-p", "-P", "-u", "--class", "--classdata")):]
            continue
        if b in ("stdbuf", "setsid", "chrt", "taskset"):
            argv = rest[opts(("-i", "-o", "-e")):]
            if b in ("chrt", "taskset") and argv:
                argv = argv[1:]              # the priority / cpu mask
            continue
        if b == "timeout":
            j = opts(("-s", "--signal", "-k", "--kill-after"))
            argv = rest[j + 1:]              # the duration
            continue
        if b in ("sudo", "doas"):
            j = opts(("-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-T", "-U", "--user", "--group"))
            rest2 = rest[j:]
            while rest2 and ASSIGN.match(rest2[0]):
                assigns.append(rest2[0])
                rest2 = rest2[1:]
            argv = rest2
            continue
        if b == "xargs":
            argv = rest[opts(("-I", "-i", "-d", "-E", "-e", "-s", "-L", "-l", "-n", "-P", "-a", "--delimiter",
                              "--max-args", "--max-procs", "--arg-file", "--replace", "--max-lines")):]
            continue
        break
    return argv, assigns


def _build(toks, out, depth, nested, pipe=None):
    """Group tokens into simple commands, appending Cmd records (and those of every substitution) to `out`.
    `pipe` is one counter shared by every nesting level, so a pipeline id names one pipeline in the whole text."""
    if depth > 12:
        raise ParseError("nesting too deep")
    pipe = pipe if pipe is not None else [0]

    def new_id():
        pipe[0] += 1
        return pipe[0]
    here = [new_id()]
    state = {"case": 0, "pattern": False, "skip": False}
    cur = {"words": [], "redirs": []}

    def flush():
        ws = cur["words"]
        if ws or cur["redirs"]:
            c = Cmd()
            c.words = ws
            c.raw = [t for _, t in ws]
            c.argv, c.assigns = _strip(c.raw)
            c.prog = os.path.basename(c.argv[0].lstrip("\\")) if c.argv else ""
            c.redirs = [(op, tgt) for op, tgt in cur["redirs"]]
            c.heredocs = [body for op, body in cur.get("bodies", [])]
            c.pipe, c.nested = here[0], nested
            out.append(c)
            for w, _ in ws:
                for st in w.subs:
                    _build(st, out, depth + 1, True, pipe)
        cur.clear()
        cur.update(words=[], redirs=[], bodies=[])
        state["skip"] = False

    cur["bodies"] = []
    i = 0
    while i < len(toks):
        t = toks[i]
        if t[0] == "op":
            op = t[1]
            if state["pattern"] and op == ")":
                state["pattern"] = False
                i += 1
                continue
            flush()
            if op not in ("|", "|&"):
                here[0] = new_id()
            if op in (";;", ";&", ";;&") and state["case"]:
                state["pattern"] = True
            i += 1
            continue
        if t[0] == "redir":
            op, tgt = t[1], None
            if op in ("<<", "<<-"):
                cur["bodies"].append((op, t[3] or ""))
                cur["redirs"].append((op, ""))
                i += 1
                continue
            if i + 1 < len(toks) and toks[i + 1][0] == "w":
                tw = toks[i + 1]
                tgt = tw[2]
                for st in tw[1].subs:
                    _build(st, out, depth + 1, True, pipe)
                if op == "<<<":
                    cur["bodies"].append((op, tgt))
                i += 2
            else:
                i += 1
            cur["redirs"].append((op, tgt or ""))
            continue
        w, text = t[1], t[2]
        at_start = not cur["words"]
        if state["pattern"] and at_start:
            if text == "esac":
                state["pattern"] = False
                state["case"] = max(0, state["case"] - 1)
            i += 1                               # a case pattern word (up to its ')')
            continue
        if state["skip"]:
            if text == "in" and state["skip"] == "case":
                state["skip"] = False
                state["pattern"] = True
            i += 1
            continue
        if at_start and not w.quoted:
            if text in RESERVED_SKIP:
                if text == "esac":
                    state["case"] = max(0, state["case"] - 1)
                i += 1
                continue
            if text in ("for", "select"):
                state["skip"] = "for"            # `for x in a b` up to the separator
                i += 1
                continue
            if text == "case":
                state["case"] += 1
                state["skip"] = "case"
                i += 1
                continue
            if text == "function":
                i += 2                           # `function name`
                continue
            if text == "[[":
                state["skip"] = "test"
                i += 1
                continue
        cur["words"].append((w, text))
        i += 1
    flush()


def _expand(cmds, depth):
    """Add the commands a shell would run from `bash -c STR`, `eval STR`, and a heredoc a shell reads."""
    extra = []
    for k, c in enumerate(cmds):
        if c.prog in SHELLS:
            args = c.argv[1:]
            script = None
            j = 0
            while j < len(args):
                a = args[j]
                if a == "-c" or (a.startswith("-") and not a.startswith("--") and "c" in a[1:]):
                    script = args[j + 1] if j + 1 < len(args) else ""
                    break
                if a in ("-o", "+o", "-O", "+O", "--rcfile", "--init-file"):
                    j += 2
                    continue
                if not a.startswith(("-", "+")):
                    break
                j += 1
            if script is not None:
                extra += commands(script, depth + 1)
                continue
            reads_stdin = j >= len(args) or "-s" in args
            if reads_stdin:
                for p in cmds[:k + 1]:
                    if p.pipe == c.pipe or p is c:
                        for body in p.heredocs:
                            extra += commands(body, depth + 1)
        elif c.prog == "eval":
            extra += commands(" ".join(c.argv[1:]), depth + 1)
    return cmds + extra


def commands(text, depth=0):
    """Every simple command `text` would run, as Cmd records (ParseError when the text cannot be tokenised)."""
    if depth > 6:
        raise ParseError("nesting too deep")
    toks = Lexer(text, 0).run()
    out = []
    _build(toks, out, 0, depth > 0)
    return _expand(out, depth)
