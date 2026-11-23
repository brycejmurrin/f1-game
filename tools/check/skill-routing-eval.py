#!/usr/bin/env python3
# skill-routing-eval.py — which project skill fires for a realistic request? (2026-09-30; phone.json 2026-11-03)
# @doc Routes the phone.json prompts through the REAL skill set via `claude -p`; scores which skill fired (correct/wrong/none).
# @skill agent-config
#
#   python3 tools/check/skill-routing-eval.py --out artifacts/skill-routing.json --model <session model>
#   ... --root ../wt-base --alias old=new --runs 3 --grace 2 --prompts tests/data/skill-routing/phone.json
#   python3 tools/check/skill-routing-eval.py --compare base.json head.json   # no run: per-skill table + flips
#
# The prompts are tests/data/skill-routing/phone.json: per skill three `fire` prompts
# (should load it) and `near` rows (a neighbour owns them). One `claude -p` per
# prompt in the repo root (--root DIR: any checkout/worktree), so every real skill
# is in the available list; the FIRST Skill tool call (or a Read of a SKILL.md)
# before any other tool is the strict verdict. --grace K also records
# `late:<skill>` when that call comes within the K tool calls after a first
# non-skill tool (grace score). --runs N: majority verdict, agreement k/N per
# prompt. --alias old=new scores a fired `old` as `new` (merged skills on the base
# side). Detection follows the skill-creator's run_eval.py. Cost: one short call
# per prompt per run (~50k cached input tokens each). The deterministic guard that
# runs on every commit is tests/unit/skill-descriptions.test.mjs; this is the
# optional A/B after a fold or a description rewrite (skill agent-config).
# Output: {"header": {claude_version, model, ...}, "results": [...]}; --compare
# also reads the pre-2026-10-14 bare-list shape. Tests: tests/unit/skill-routing-eval.test.mjs (fake claude).
# Baseline 2026-09-30 on claude-fable-5-1: 182/216 before the `paths:` removal, 214/216 after.
import argparse, json, os, re, select, subprocess, sys, time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import as_completed
from pathlib import Path

ROOT = str(Path(__file__).resolve().parents[2])
PROMPTS = str(Path(ROOT, "tests/data/skill-routing/phone.json"))
SKILL_RE = re.compile(r"\.claude/skills/([a-z0-9-]+)/")


def scan(lines, grace=0, info=None):
    """Score one stream-json transcript -> (strict, graced). strict is
    `skill:<name>` or `none:<why>` from the FIRST tool call; graced is strict,
    or `late:<name>` when a Skill call / SKILL.md Read is one of the `grace`
    tool calls after a first non-skill tool."""
    cap = grace + 1                     # tool calls examined in total
    pending = None; acc = ""; strict = None; tools = 0
    for line in lines:
        line = line.strip()
        if not line: continue
        try: ev = json.loads(line)
        except json.JSONDecodeError: continue
        if ev.get("type") == "system" and ev.get("subtype") == "init" and info is not None:
            if ev.get("model"): info["model"] = ev["model"]
        if ev.get("type") == "stream_event":
            se = ev.get("event", {}); t = se.get("type", "")
            if t == "content_block_start":
                cb = se.get("content_block", {})
                if cb.get("type") == "tool_use":
                    tools += 1
                    name = cb.get("name", "")
                    if name in ("Skill", "Read"):
                        pending = name; acc = ""
                    else:
                        strict = strict or "none:" + name
                        if tools >= cap: return strict, strict
            elif t == "content_block_delta" and pending:
                d = se.get("delta", {})
                if d.get("type") == "input_json_delta":
                    acc += d.get("partial_json", "")
            elif t in ("content_block_stop", "message_stop"):
                if pending:
                    try: inp = json.loads(acc)
                    except Exception: inp = {}
                    name = None
                    if pending == "Skill":
                        name = str(inp.get("skill", "")).split(":")[-1]
                    else:
                        m = SKILL_RE.search(str(inp.get("file_path", "")))
                        if m: name = m.group(1)
                    pending = None
                    if strict is None:
                        strict = "skill:" + name if name else "none:Read"
                        if name: return strict, strict
                    elif name:
                        return strict, "late:" + name
                    if tools >= cap: return strict, strict
                elif t == "message_stop" and strict is None:
                    return "none:end", "none:end"
        elif ev.get("type") == "result":
            s = strict or "none:result"
            return s, s
    s = strict or "none:timeout"
    return s, s


def _lines(p, timeout):
    start = time.time(); buf = ""
    while time.time() - start < timeout:
        if p.poll() is not None:
            rest = p.stdout.read()
            if rest: buf += rest.decode("utf-8", "replace")
            break
        r, _, _ = select.select([p.stdout], [], [], 0.2)
        if not r: continue
        chunk = os.read(p.stdout.fileno(), 8192)
        if not chunk: break
        buf += chunk.decode("utf-8", "replace")
        while "\n" in buf:
            line, buf = buf.split("\n", 1)
            yield line
    else:
        return                          # timed out: scan() reports none:timeout
    yield from buf.split("\n")         # EOF / exit: drain the tail


def first_skill(query, model, timeout, root=ROOT, grace=0, info=None):
    cmd = ["claude", "-p", query, "--output-format", "stream-json", "--verbose",
           "--include-partial-messages"]
    if model:
        cmd += ["--model", model]
    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                         cwd=root, env=env)
    try:
        return scan(_lines(p, timeout), grace, info)
    finally:
        if p.poll() is None:
            p.kill(); p.wait()


def majority(vals):
    """Most common value (ties: first seen) and its count."""
    return Counter(vals).most_common(1)[0]


def fired_of(got, alias):
    if got.startswith(("skill:", "late:")):
        name = got.split(":", 1)[1]
        return alias.get(name, name)
    return None


def score(expect, fired, skills):
    if expect not in skills:   # expects a subagent / no skill
        return "correct" if fired is None else "wrong"
    return "correct" if fired == expect else ("wrong" if fired else "none")


def parse_alias(specs):
    out = {}
    for spec in specs or []:
        for pair in spec.split(","):
            if not pair.strip(): continue
            if "=" not in pair: raise SystemExit(f"--alias wants old=new, got {pair!r}")
            old, new = (s.strip() for s in pair.split("=", 1))
            out[old] = new
    return out


def load_prompts(path):
    """phone.json -> [{source, query, expect}]: a `fire` prompt expects its own skill, a `near` row its neighbour."""
    data = json.loads(Path(path).read_text())
    skills = data.get("skills", data)
    items = []
    for name, row in skills.items():
        if not isinstance(row, dict): continue
        for q in row.get("fire", []):
            items.append({"source": name, "query": q, "expect": name})
        for n in row.get("near", []):
            items.append({"source": name, "query": n["q"], "expect": n["expect"]})
    return items


def load_results(path):
    data = json.loads(Path(path).read_text())
    return data["results"] if isinstance(data, dict) else data


def compare(a_path, b_path, out=sys.stdout):
    A, B = load_results(a_path), load_results(b_path)
    key = lambda r: (r["source"], r["query"])
    amap, bmap = {key(r): r for r in A}, {key(r): r for r in B}
    common = [k for k in amap if k in bmap]
    rows = {}
    for k in common:
        src = k[0]; a, b = amap[k], bmap[k]
        kind = "fire" if a["expect"] == src else "near"
        r = rows.setdefault(src, {"fire": [0, 0, 0], "near": [0, 0, 0]})
        r[kind][0] += a["verdict"] == "correct"
        r[kind][1] += b["verdict"] == "correct"
        r[kind][2] += 1
    w = max([len("skill")] + [len(s) for s in rows])
    cell = lambda c: f"{c[0]}/{c[2]} → {c[1]}/{c[2]}"
    print(f"{'skill':{w}}  {'should-fire base→head':>21}  {'near-miss base→head':>19}  {'delta':>5}", file=out)
    tf, tn = [0, 0, 0], [0, 0, 0]
    for src in sorted(rows):
        f, n = rows[src]["fire"], rows[src]["near"]
        for i in range(3): tf[i] += f[i]; tn[i] += n[i]
        d = (f[1] + n[1]) - (f[0] + n[0])
        print(f"{src:{w}}  {cell(f):>21}  {cell(n):>19}  {d:+5d}", file=out)
    print(f"{'TOTAL':{w}}  {cell(tf):>21}  {cell(tn):>19}  {(tf[1] + tn[1]) - (tf[0] + tn[0]):+5d}", file=out)
    flips = [k for k in common if amap[k]["verdict"] != bmap[k]["verdict"]]
    print(f"\nflipped: {len(flips)}", file=out)
    for k in flips:
        a, b = amap[k], bmap[k]
        print(f"  {k[0]}  expect={a['expect']}  {a['verdict']}({a.get('fired')}) → {b['verdict']}({b.get('fired')})  {k[1]}", file=out)
    only = len(amap) + len(bmap) - 2 * len(common)
    if only:
        print(f"\n{only} prompts in only one file (not compared)", file=out)
    return 0


def claude_version(root):
    try:
        r = subprocess.run(["claude", "--version"], capture_output=True, text=True,
                           cwd=root, timeout=30)
        return r.stdout.strip() or None
    except Exception:
        return None


def main(argv=None):
    ap = argparse.ArgumentParser(description="Score which project skill `claude -p` fires per phone.json prompt.")
    ap.add_argument("--prompts", default=PROMPTS, help="phone.json (default: tests/data/skill-routing/phone.json)")
    ap.add_argument("--out", help="result JSON path (required unless --compare)")
    ap.add_argument("--model", default=None)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--timeout", type=int, default=90)
    ap.add_argument("--root", default=ROOT, help="checkout to run `claude -p` in (default: this script's repo)")
    ap.add_argument("--alias", action="append", help="old=new[,old2=new2]: a fired old counts as new (repeatable)")
    ap.add_argument("--runs", type=int, default=1, help="runs per prompt; verdict = majority, agreement k/N")
    ap.add_argument("--grace", type=int, default=0, help="also record late:<skill> within K tool calls after a non-skill tool")
    ap.add_argument("--compare", nargs=2, metavar=("A.json", "B.json"), help="no run: per-skill base→head table + flipped prompts")
    a = ap.parse_args(argv)
    if a.compare:
        return compare(*a.compare)
    if not a.out:
        ap.error("--out is required (unless --compare)")
    if a.runs < 1: ap.error("--runs must be >= 1")
    if a.grace < 0: ap.error("--grace must be >= 0")
    alias = parse_alias(a.alias)
    root = str(Path(a.root).resolve())
    items = load_prompts(a.prompts)
    if not items:
        ap.error(f"no prompts in {a.prompts}")
    # an expect is a skill if either checkout (or an alias target) has it, so a
    # base checkout missing a new skill still scores that skill's prompts
    skills = set(alias.values())
    for r in {root, ROOT}:
        d = Path(r, ".claude/skills")
        if d.is_dir(): skills |= {x.name for x in d.iterdir() if x.is_dir()}
    info = {}
    header = {"claude_version": claude_version(root), "model": a.model, "root": root, "prompts": a.prompts,
              "runs": a.runs, "grace": a.grace, "alias": alias,
              "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

    def one(it):
        return [first_skill(it["query"], a.model, a.timeout, root, a.grace, info) for _ in range(a.runs)]

    results = []
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        futs = {ex.submit(one, it): it for it in items}
        done = 0
        for fut in as_completed(futs):
            it = futs[fut]; runs = fut.result()
            got, k = majority([s for s, _ in runs])
            late, _ = majority([g for _, g in runs])
            fired = fired_of(got, alias)
            verdict = score(it["expect"], fired, skills)
            row = {**it, "fired": fired, "raw": got, "verdict": verdict}
            if a.grace:
                gfired = fired_of(late, alias)
                row.update(grace=late, grace_fired=gfired, grace_verdict=score(it["expect"], gfired, skills))
            if a.runs > 1:
                row.update(agreement=f"{k}/{a.runs}", runs=[s for s, _ in runs])
            results.append(row)
            done += 1
            extra = (f" {k}/{a.runs}" if a.runs > 1 else "") + (f" {late}" if late.startswith("late:") else "")
            print(f"[{done}/{len(items)}] {it['source']:24} expect={it['expect']:24} got={got:32} {verdict}{extra}", file=sys.stderr, flush=True)
    header["model_seen"] = info.get("model")
    Path(a.out).write_text(json.dumps({"header": header, "results": results}, indent=1))
    print(f"wrote {a.out}: {len(results)} results", file=sys.stderr)
    line = f"strict {sum(r['verdict'] == 'correct' for r in results)}/{len(results)}"
    if a.grace:
        line += f"  grace(K={a.grace}) {sum(r['grace_verdict'] == 'correct' for r in results)}/{len(results)}"
    print(line, file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
