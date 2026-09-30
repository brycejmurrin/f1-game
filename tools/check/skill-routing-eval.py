#!/usr/bin/env python3
# skill-routing-eval.py — which project skill fires for a realistic request? (2026-09-30)
# @doc Routes realistic requests through the REAL skill set via `claude -p` and scores which skill fired (correct/wrong/none).
# @skill slim-bloat
#
#   python3 tools/check/skill-routing-eval.py --queries tests/data/skill-routing/queries --out artifacts/skill-routing.json --model <session model>
#
# 8 queries per skill (5 should-fire, 3 near-misses a named neighbour owns) in
# tests/data/skill-routing/queries/<skill>.json. One `claude -p` per query in the
# repo root, so every real skill is in the available list; the FIRST Skill tool
# call (or a Read of a SKILL.md) before any other tool is the verdict. Detection
# follows the skill-creator's run_eval.py. Cost: one short call per query
# (~50k cached input tokens each); 216 queries take ~30 min at --workers 6.
# Baseline 2026-09-30 on claude-fable-5-1: 182/216 before the `paths:` removal, 214/216 after.
import argparse, json, os, re, select, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = str(Path(__file__).resolve().parents[2])
SKILL_RE = re.compile(r"\.claude/skills/([a-z0-9-]+)/")


def first_skill(query, model, timeout):
    cmd = ["claude", "-p", query, "--output-format", "stream-json", "--verbose",
           "--include-partial-messages"]
    if model:
        cmd += ["--model", model]
    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                         cwd=ROOT, env=env)
    start = time.time(); buf = ""; pending = None; acc = ""
    try:
        while time.time() - start < timeout:
            if p.poll() is not None:
                rest = p.stdout.read()
                if rest: buf += rest.decode("utf-8", "replace")
                break
            r, _, _ = select.select([p.stdout], [], [], 1.0)
            if not r: continue
            chunk = os.read(p.stdout.fileno(), 8192)
            if not chunk: break
            buf += chunk.decode("utf-8", "replace")
            while "\n" in buf:
                line, buf = buf.split("\n", 1)
                line = line.strip()
                if not line: continue
                try: ev = json.loads(line)
                except json.JSONDecodeError: continue
                if ev.get("type") == "stream_event":
                    se = ev.get("event", {}); t = se.get("type", "")
                    if t == "content_block_start":
                        cb = se.get("content_block", {})
                        if cb.get("type") == "tool_use":
                            name = cb.get("name", "")
                            if name in ("Skill", "Read"):
                                pending = name; acc = ""
                            else:
                                return "none:" + name
                    elif t == "content_block_delta" and pending:
                        d = se.get("delta", {})
                        if d.get("type") == "input_json_delta":
                            acc += d.get("partial_json", "")
                    elif t in ("content_block_stop", "message_stop"):
                        if pending:
                            try: inp = json.loads(acc)
                            except Exception: inp = {}
                            if pending == "Skill":
                                return "skill:" + str(inp.get("skill", "")).split(":")[-1]
                            m = SKILL_RE.search(str(inp.get("file_path", "")))
                            if m: return "skill:" + m.group(1)
                            return "none:Read"
                        if t == "message_stop":
                            return "none:end"
                elif ev.get("type") == "result":
                    return "none:result"
        return "none:timeout"
    finally:
        if p.poll() is None:
            p.kill(); p.wait()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--queries", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default=None)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--timeout", type=int, default=90)
    a = ap.parse_args()
    items = []
    for f in sorted(Path(a.queries).glob("*.json")):
        for q in json.loads(f.read_text()):
            items.append({"source": f.stem, "query": q["query"], "expect": q["expect"]})
    results = []
    with ThreadPoolExecutor(max_workers=a.workers) as ex:
        futs = {ex.submit(first_skill, it["query"], a.model, a.timeout): it for it in items}
        done = 0
        for fut in as_completed(futs):
            it = futs[fut]; got = fut.result()
            fired = got.split(":", 1)[1] if got.startswith("skill:") else None
            skills = {d.name for d in Path(ROOT, ".claude/skills").iterdir() if d.is_dir()}
            if it["expect"] not in skills:   # expects a subagent / no skill
                verdict = "correct" if fired is None else "wrong"
            else:
                verdict = "correct" if fired == it["expect"] else ("wrong" if fired else "none")
            results.append({**it, "fired": fired, "raw": got, "verdict": verdict})
            done += 1
            print(f"[{done}/{len(items)}] {it['source']:24} expect={it['expect']:24} got={got:32} {verdict}", file=sys.stderr, flush=True)
    Path(a.out).write_text(json.dumps(results, indent=1))
    print(f"wrote {a.out}: {len(results)} results", file=sys.stderr)


if __name__ == "__main__":
    main()
