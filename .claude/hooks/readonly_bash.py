

"""readonly_bash.py — the rules behind tools/hooks/readonly-bash.sh (PreToolUse Bash, wired from the `hooks:`
frontmatter of every read-only reporter agent, .claude/agents/README.md §Enforcement).

An ALLOWLIST on the simple commands .claude/hooks/shellparse.py finds (pipelines, lists, substitutions, `bash -c`,
wrappers stripped). Every simple command must be a read:

  * text and file readers: grep rg cat head tail ls wc sort uniq cut tr awk sed (no -i) jq diff cmp stat file du …;
    find without -delete / -exec / -ok / -fprint / -fls;
  * git's read-only subcommands (status log show diff blame grep ls-files rev-parse … fetch, branch/tag/remote/
    stash/worktree/config in their listing forms), never --output;
  * gh reads (pr/issue/run/repo/release/workflow view|list|checks|diff|status, search, api with GET and no fields);
    curl without an upload, a body, a non-GET method or an output file; wget only to stdout;
  * node --test, a node / python tool under tools/ (not tools/gen/, not a tools/docs/gen-*), with no write flag
    (--write --apply --update --fix --auto-raise --fold --save), `node -e` / `python3 -c` with no file-write call;
  * npm run test:*, npm ls / view / --version; shell plumbing (cd, export of assignments, test, true, sleep …).

A redirection, tee, mkdir or touch may target only /dev/null, scratch/ or artifacts/ (the agent's own report).
ONE exception per agent: READONLY_BASH_ALLOW (env) or $1, a regex the WHOLE command must match.
A seatbelt against accidents, not a boundary. Exit 2 refuses; an unreadable payload or command is a refusal.
"""
import json
import os
import re
import sys

ROOT = os.environ.get("CLAUDE_PROJECT_DIR") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, ".claude", "hooks"))
from shellparse import ParseError, commands  # noqa: E402

READERS = set("""grep egrep fgrep rg cat head tail ls wc sort uniq cut tr awk gawk sed jq yq diff cmp comm stat file du df
tree basename dirname realpath readlink pwd echo printf true false test [ date sleep which type printenv id whoami uname
nproc free uptime ps pgrep sha256sum sha1sum md5sum xxd od hexdump strings column nl paste fold expand fmt rev tac seq
cd pushd popd export set unset read wait shopt local declare less more zcat gzip-not tar-not""".split()) - {"gzip-not", "tar-not"}
GIT_READ = set("""status log show diff blame grep ls-files ls-tree ls-remote rev-parse rev-list cat-file describe shortlog
merge-base name-rev for-each-ref show-ref check-ignore check-attr var help version count-objects whatchanged
range-diff cherry fetch""".split())
# curl short options that take a value: scanning a cluster (-sSH) stops at the first one, the rest is its value.
CURL_VALUE = set("HXAeuwbcrmxyYzEKUQ")
CURL_WRITE = set("oOdFT")
GH_READ = {"view", "list", "checks", "diff", "status", "watch"}
WRITE_FLAG = re.compile(r"^--(write|apply|update|fix|auto-raise|fold|save|commit|push|delete|prune)(=|$)")
FILE_WRITE = re.compile(r"writeFileSync|appendFileSync|createWriteStream|copyFileSync|renameSync|unlinkSync|rmSync|mkdirSync|"
                        r"rmdirSync|writeFile\(|appendFile\(|\.write_text\(|\.write_bytes\(|shutil\.|os\.remove|os\.unlink|"
                        r"os\.rename|open\([^)]*['\"][wax+]")


def why(msg):
    sys.stderr.write("BLOCKED: " + msg + " — this agent is a read-only reporter (.claude/agents/README.md §Enforcement): "
                     "it writes nothing outside its report. Put the change in the report for the parent instead.\n")
    sys.exit(2)


def own_path(t):
    """True for a target the reporter may write: /dev/null & co, or under scratch/ or artifacts/ of this repo."""
    if t in ("/dev/null", "/dev/stdout", "/dev/stderr", "-") or re.fullmatch(r"/dev/fd/\d+", t):
        return True
    p = os.path.normpath(t if os.path.isabs(t) else os.path.join(os.getcwd(), t))
    root = os.path.realpath(ROOT)
    return any(p == os.path.join(root, d) or p.startswith(os.path.join(root, d) + os.sep) for d in ("scratch", "artifacts"))


def judge(c):
    a, p = c.argv, c.prog
    for op, t in c.redirs:
        if op in (">", ">>", ">|", "&>", "&>>", "<>") and not own_path(t):
            why("the command redirects output into %s" % (t or "a file"))
    if not a:
        return
    args = a[1:]
    if p in ("tee", "mkdir", "touch"):
        for t in (x for x in args if not x.startswith("-")):
            if not own_path(t):
                why("`%s %s` writes outside scratch/ and artifacts/" % (p, t))
        return
    if p in ("sed", "perl") and any(x == "--in-place" or (x.startswith("-") and not x.startswith("--") and "i" in x[1:]) for x in args):
        why("an in-place edit (%s -i)" % p)
    if p == "sed":
        scripts = [args[k + 1] for k, x in enumerate(args[:-1]) if x in ("-e", "--expression")]
        scripts += [x.split("=", 1)[1] for x in args if x.startswith("--expression=")]
        if not scripts and not any(x in ("-f", "--file") or x.startswith("--file=") for x in args):
            scripts = [x for x in args if not x.startswith("-")][:1]
    if p == "sed" and any(re.search(r"(?:^|[;{}\s\d/$!])[wWe](?:\s|;|$)|(?:^|[;{}\s\d$!])[wW]\s*\S", x) for x in scripts):
        why("a sed script with a w / W (write a file) or e (run a command) command")
    if p == "perl":
        return
    if p == "find":
        bad = [x for x in args if x in ("-delete", "-exec", "-execdir", "-ok", "-okdir", "-fprint", "-fprint0", "-fprintf", "-fls")]
        if bad:
            why("find %s runs or writes" % bad[0])
        return
    if p == "sort" and any(x == "-o" or x.startswith(("-o", "--output")) for x in args):
        why("sort -o writes a file")
    if p in ("awk", "gawk") and any(re.search(r"\bsystem\s*\(|\bprintf?\b[^;}]*[>|]|\|\s*getline", x) for x in args):
        why("an awk program that runs a command or writes a file")
    if p == "yq" and any(x in ("-i", "--inplace") or x.startswith("--inplace=") or re.fullmatch(r"-[A-Za-z]*i[A-Za-z]*", x) for x in args):
        why("yq -i edits the file in place")
    if p == "uniq" and len([x for x in args if not x.startswith("-")]) >= 2:
        why("uniq IN OUT writes its second file")
    if p == "tree" and any(x == "-o" or x.startswith("-o") for x in args):
        why("tree -o writes a file")
    if p == "xxd" and any(x in ("-r", "-revert") for x in args) and len([x for x in args if not x.startswith("-")]) >= 2:
        why("xxd -r IN OUT writes a file")
    if p == "date" and any(x in ("-s", "--set") or x.startswith("--set=") for x in args):
        why("date -s sets the clock")
    if p in READERS:
        return
    if p == "git":
        i = 0
        while i < len(args) and args[i].startswith("-"):
            i += 2 if args[i] in ("-C", "-c", "--git-dir", "--work-tree") else 1
        sub, rest = (args[i], args[i + 1:]) if i < len(args) else ("", [])
        if any(x.startswith("--output") for x in rest):
            why("git --output writes a file")
        listing = not [x for x in rest if not x.startswith("-")]
        if sub in GIT_READ or not sub:
            return
        pos = [x for x in rest if not x.startswith("-")]
        if sub == "symbolic-ref" and len(pos) <= 1 and not set(rest) & {"-d", "--delete"}:
            return
        if sub == "reflog" and (not pos or pos[0] in ("show", "exists")) or sub == "notes" and (not pos or pos[0] in ("list", "show")):
            return
        if sub == "branch" and (listing or set(rest) & {"--list", "-l", "--contains", "--merged", "--no-merged", "--show-current"}):
            return
        if sub == "tag" and (listing or set(rest) & {"--list", "-l", "--contains"}):
            return
        if sub == "remote" and (listing or rest[:1] in (["-v"], ["show"], ["get-url"])):
            return
        if sub == "stash" and rest[:1] in (["list"], ["show"]):
            return
        if sub == "worktree" and rest[:1] == ["list"]:
            return
        if sub == "config" and set(rest) & {"--get", "--get-all", "--get-regexp", "--list", "-l", "get"}:
            return
        if sub == "config" and len(pos) == 1 and not [x for x in rest if x.startswith("-") and x not in ("--global", "--local", "--system", "--show-origin")]:
            return
        why("`git %s` is not a read (it can move the index, HEAD, a ref, the tree or the config)" % sub)
    if p == "gh":
        w, k = [], 0
        while k < len(args):
            if args[k] in ("-R", "--repo"):
                k += 2
                continue
            if not args[k].startswith("-"):
                w.append(args[k])
            k += 1
        if w[:1] == ["api"]:
            method = next((args[k + 1].upper() for k, x in enumerate(args[:-1]) if x in ("-X", "--method")), None)
            method = method or next((x[2:].upper() for x in args if re.fullmatch(r"-X[A-Za-z]+", x)), None) \
                or next((x.split("=", 1)[1].upper() for x in args if x.startswith("--method=")), None)
            fields = any(x in ("-f", "-F", "--field", "--raw-field", "--input") or x.startswith(("--field=", "--raw-field=")) for x in args)
            if (method or "GET") == "GET" and not fields:
                return
            why("gh api with a method or fields writes through the API")
        if w[:1] == ["search"] or w[:2] == ["auth", "status"] or w[:2] == ["label", "list"] or (len(w) >= 2 and w[1] in GH_READ):
            return
        why("`gh %s` is not a read" % " ".join(w[:2]))
    if p == "curl":
        if any(x in ("-o", "-O", "--output", "--remote-name", "-T", "--upload-file", "-d", "--data", "--data-raw", "--data-binary",
                     "-F", "--form", "--json") or x.startswith(("--output=", "--data", "-o", "-d")) and x not in ("-o-",) for x in args):
            why("curl with an output file or a request body")
        for x in args:
            if x.startswith("-") and not x.startswith("--") and x != "-o-":
                for ch in x[1:]:
                    if ch in CURL_WRITE:
                        why("curl with an output file or a request body (-%s)" % ch)
                    if ch in CURL_VALUE:
                        break
        method = next((args[k + 1].upper() for k, x in enumerate(args[:-1]) if x in ("-X", "--request") or re.fullmatch(r"-[A-Za-z]*X", x)), "GET")
        method = next((x.split("=", 1)[1].upper() for x in args if x.startswith("--request=")), None) \
            or next((m.group(1).upper() for m in (re.fullmatch(r"-[A-Za-z]*X([A-Za-z]+)", x) for x in args) if m), None) or method
        if method not in ("GET", "HEAD"):
            why("curl -X %s" % method)
        return
    if p == "wget":
        if any(x in ("-O-", "--spider") or re.fullmatch(r"-[A-Za-z]*O-", x) for x in args) \
                or any(re.fullmatch(r"-[A-Za-z]*O", x) and args[k + 1:k + 2] == ["-"] for k, x in enumerate(args)):
            return
        why("wget writes a file (use curl, or wget -O -)")
    if p in ("node", "python", "python3", "bun"):
        code = [args[k + 1] for k, x in enumerate(args[:-1]) if x in ("-e", "--eval", "-p", "--print", "-c")]
        if code:
            if any(FILE_WRITE.search(x) for x in code):
                why("an interpreter file write (node fs / python open for writing)")
            return
        if "--test" in args or args[:1] in (["--check"], ["-c"]) and p == "node" or args[:2] == ["-m", "json.tool"] or args[:1] in (["--version"], ["-v"], ["-V"]):
            return
        script = next((x for x in args if not x.startswith("-")), "")
        rel = os.path.relpath(os.path.realpath(script), os.path.realpath(ROOT)).replace(os.sep, "/") if script else ""
        if rel.startswith("tools/") and not rel.startswith(("tools/gen/", "tools/hooks/")) and not re.match(r"tools/docs/gen-", rel):
            bad = [x for x in args if WRITE_FLAG.match(x)]
            if bad:
                why("%s %s writes" % (rel, bad[0]))
            return
        why("`%s %s` is not a read-only tool under tools/ (generators and scripts elsewhere can write)" % (p, script or "-"))
    if p == "npm":
        w = [x for x in args if not x.startswith("-")]
        if w[:1] in (["ls"], ["view"], ["outdated"], ["explain"]) or args[:1] in (["--version"], ["-v"]):
            return
        if w[:1] in (["run"], ["run-script"]) and len(w) > 1 and w[1].startswith("test:"):
            return
        why("`npm %s` is not a read" % " ".join(w[:2]))
    if p == "env" and not args:
        return
    why("`%s` is not on the read-only list" % p)


def main():
    try:
        d = json.load(sys.stdin)
        c = (d.get("tool_input") or {}).get("command") if isinstance(d, dict) else None
        if not isinstance(c, (str, type(None))):
            raise ValueError
    except Exception:
        sys.stderr.write("BLOCKED: readonly-bash could not read the command out of the hook payload (fail closed).\n")
        sys.exit(2)
    if not c:
        sys.exit(0)
    allow = os.environ.get("READONLY_BASH_ALLOW") or (sys.argv[1] if len(sys.argv) > 1 else "")
    if allow and re.fullmatch(allow, c):
        sys.exit(0)
    if c.startswith("export APEX_SUBAGENT=1\n"):
        c = c[len("export APEX_SUBAGENT=1\n"):]
    try:
        cmds = commands(c)
    except (ParseError, RecursionError) as e:
        sys.stderr.write("BLOCKED: readonly-bash could not tokenise this command (%s), so it refuses it (fail closed).\n" % e)
        sys.exit(2)
    for cmd in cmds:
        judge(cmd)
    sys.exit(0)


if __name__ == "__main__":
    main()
