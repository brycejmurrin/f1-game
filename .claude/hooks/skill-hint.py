#!/usr/bin/env python3
"""UserPromptSubmit hook: name the skills a prompt matches, before any tool runs.

The routing eval's biggest loss (2026-10-14, 281 queries) is `none:Bash` — the
model runs a command before it loads the skill whose SKILL.md names the right
one. Descriptions alone do not fix it. This hook scores the prompt against
every `.claude/skills/*/SKILL.md` description (idf-weighted word overlap; the
"→ other-skill" redirect clauses are dropped so a neighbour's words do not
vote) and adds ONE factual line naming the top matches, at most two.

Output: plain stdout, which Claude Code adds as context for UserPromptSubmit
(https://code.claude.com/docs/en/hooks — "plain-text stdout is added as
context"; written as a statement, not an order, per the same page). No match
→ no output. Any error → no output (advisory, fail open; never blocks).

APEX_SKILL_HINT selects the mode for A/B runs of tools/check/skill-routing-eval.py:
  targeted (default) — matches + the one-line rule;  generic — the rule only;
  off — nothing.
"""
import json
import math
import os
import re
import sys

STOP = set("""a an and are as at be by can for from has have in into is it its
of on or that the their this to was when where which while with without use
used using any all not only one does done make makes get set new edit edits
change changes changed check run runs file files skill""".split())
MIN_SCORE = 4.5
RULE = ("In this repo a task that matches a skill starts with the Skill tool call for it, "
        "before Bash, Read or Grep: its SKILL.md names the commands, hooks and tests to use.")


# Phone verbs: the words are stopwords or too common to score, so match the shape.
VERBS = [
    (re.compile(r"^\W*(check|status|check it|check status|status\??|where are we)\W*$", re.I), "check"),
    (re.compile(r"\b(push|ship)\b.*\b(deploy|default|main)\b|^\W*(push|ship)( it)?\W*$", re.I), "ship"),
    (re.compile(r"\bhand-?off\b.*\b(prompt|brief)\b|\b(prompt|brief)\b.*\bhand-?off\b|\bcold[- ]start\b", re.I), "handoff"),
]


def words(text):
    return [w for w in re.findall(r"[a-z0-9][a-z0-9_.\-]*[a-z0-9]", text.lower())
            if len(w) > 2 and w not in STOP]


def description(path):
    with open(path, encoding="utf-8") as fh:
        head = fh.read(4096)
    m = re.match(r"---\n(.*?)\n---", head, re.S)
    if not m:
        return ""
    text = []
    for key in ("description", "when_to_use"):
        # A plain or quoted YAML scalar may continue on indented lines. Block
        # scalars (>|) carry the same description words for routing purposes.
        # Stop at the next top-level key, rather than silently dropping most
        # of a folded description such as check-changes' timeout vocabulary.
        km = re.search(r"^%s:[ \t]*(.*(?:\n[ \t]+[^\n]*)*)" % key, m.group(1), re.M)
        if km:
            scalar = km.group(1).strip()
            scalar = re.sub(r"^[>|][+-]?(?:\n|$)", "", scalar)
            text.append(" ".join(scalar.split()).strip("\"'"))
    joined = " ".join(text)
    # drop redirect clauses: "Not X (→ y)", "camera lag → playwright-probe;"
    joined = re.sub(r"[^.;:]*→[^.;]*[.;]?", " ", joined)
    return re.sub(r"\bNot\b[^.;]*[.;]?", " ", joined)


def matches(prompt, root):
    skills_dir = os.path.join(root, ".claude", "skills")
    docs = {}
    for name in sorted(os.listdir(skills_dir)):
        p = os.path.join(skills_dir, name, "SKILL.md")
        if os.path.isfile(p):
            docs[name] = set(words(description(p))) | set(words(name.replace("-", " ")))
    df = {}
    for toks in docs.values():
        for t in toks:
            df[t] = df.get(t, 0) + 1
    n = len(docs)
    ptoks = set(words(prompt))
    pinned = [name for rx, name in VERBS if name in docs and rx.search(prompt)]
    scored = []
    for name, toks in docs.items():
        s = sum(math.log((n + 1) / df[t]) for t in ptoks & toks)
        if s >= MIN_SCORE:
            scored.append((s, name))
    scored.sort(reverse=True)
    return (pinned + [name for _, name in scored if name not in pinned])[:2]


def main():
    mode = os.environ.get("APEX_SKILL_HINT", "targeted")
    if mode == "off":
        return
    data = json.load(sys.stdin)
    prompt = data.get("prompt") or ""
    if not prompt.strip() or prompt.lstrip().startswith("/"):
        return
    if mode == "generic":
        print(RULE)
        return
    root = os.environ.get("CLAUDE_PROJECT_DIR") or os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    names = matches(prompt, root)
    if names:
        print("Skill check: this prompt matches the description of " +
              " and ".join("`%s`" % n for n in names) + ". " + RULE)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
