# Regenerates findings.jsonl, SYNTHESIS.md and PLANS.md from rows.py + status.py.
import json, sys, collections, importlib.util
S, D = sys.argv[1], sys.argv[2]
def load(n):
    sp = importlib.util.spec_from_file_location(n, f"{S}/{n}.py"); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m
rows = load("rows").ROWS; st = load("status"); lanes = load("lanes")
K = ["id","batch","file","line","kind","severity","confidence","defect","impact","fix","effort","subsystem","verified","synth_check","impact_class","patterns","dup_of"]
F = [dict(zip(K, r)) for r in rows]
ids = [f["id"] for f in F]; assert len(ids) == len(set(ids)), "duplicate id"
for f in F:
    if f["dup_of"]: assert f["dup_of"] in ids, f["id"]
with open(f"{D}/findings.jsonl", "w") as o:
    for f in F: o.write(json.dumps(f, ensure_ascii=False) + "\n")
W = {"high": 3, "med": 2, "low": 1}
CL = {"player": 2, "pipeline": 1, "hygiene": 0}
def score(f):
    s = W[f["severity"]] * 2 + {"high": 2, "med": 1, "low": 0}[f["confidence"]] + CL[f["impact_class"]]
    if f["verified"] != "reviewer" and not (f["synth_check"] or "").startswith("confirmed"): s -= 1
    if (f["synth_check"] or "").startswith("confirmed"): s += 0.5
    if f["id"] in st.HIDDEN_BUG: s += 1.5
    return s
live = [f for f in F if not f["dup_of"]]
ranked = sorted(live, key=lambda f: (-score(f), f["id"]))
# lane coverage: every live finding in exactly one lane
own = collections.Counter(i for L in lanes.LANES for i in L["ids"])
miss = [f["id"] for f in live if own[f["id"]] == 0]; dupl = [i for i, n in own.items() if n > 1]
unknown = [i for i in own if i not in ids]
assert not dupl and not unknown, (dupl, unknown)
lane_of = {i: L["id"] for L in lanes.LANES for i in L["ids"]}
def esc(t): return str(t).replace("|", "\\|")
def cite(f): return f"`{f['file']}{(':' + f['line']) if f['line'] else ''}`"
P = st.PATTERNS
pat = collections.Counter(p for f in live for p in f["patterns"])
out = []
w = out.append
w("# Test suite review 2026-10-19 — synthesis\n")
w("Generated from `findings.jsonl`, `reports/` and the status table below; issue #2952. Pass 1 is findings only: nothing here is fixed. `PLANS.md` holds the pass-2 lanes.\n")
w("## Status\n")
w(f"- Reports in: **{st.k_in}/22** batches ({st.k_final} final, {st.k_partial} partial). Updated {st.UPDATED}.")
w(f"- Findings: {len(F)} rows, {len(live)} after de-duplication; {sum(1 for f in F if f['verified']=='reviewer')} reviewer-verified, {sum(1 for f in F if f['verified']!='reviewer')} subagent-unverified; {sum(1 for f in F if (f['synth_check'] or '').startswith('confirmed'))} re-checked by the synthesis on the tree.")
w(f"- Not yet in: {', '.join(st.PENDING)}.\n")
w("| batch | state | report |\n|---|---|---|")
for b, s_, r in st.TABLE: w(f"| {b} | {s_} | {r} |")
w("\n## Top 25 by player or pipeline impact\n")
w("Score = 2×severity + confidence + impact class (player 2, pipeline 1, hygiene 0), −1 if unverified and not re-checked, +0.5 if re-checked on the tree. Ties break by id.\n")
w("| # | id | cite | kind | sev | defect → impact | fix | lane | verified |\n|---|---|---|---|---|---|---|---|---|")
for n, f in enumerate(ranked[:25], 1):
    v = f["verified"] + (f" · synth: {f['synth_check']}" if f["synth_check"] else "")
    w(f"| {n} | {f['id']} | {esc(cite(f))} | {f['kind']} | {f['severity']} | {esc(f['defect'])} → **{esc(f['impact'])}** | {esc(f['fix'])} | {lane_of.get(f['id'],'—')} | {esc(v)} |")
w("\n**Hidden product bugs** (a test passes over a real defect): " + "; ".join(f"{k} {v}" for k, v in st.HIDDEN_BUG.items()) + ".\n")
w("\n## Recurring patterns\n")
w("Counted over de-duplicated rows; a row can carry several patterns. Counts grow as batches arrive.\n")
w("| pattern | rows | what it looks like | examples |\n|---|---|---|---|")
for key, label, desc in P:
    ex = ", ".join(f["id"] for f in live if key in f["patterns"])
    w(f"| {label} | {pat.get(key,0)} | {desc} | {ex or '—'} |")
w("")
for line in st.PATTERN_NOTES: w(line)
w("\n## Gaps by subsystem\n")
by = collections.defaultdict(list)
for f in live:
    if f["kind"] == "gap": by[f["subsystem"]].append(f)
for sub in sorted(by):
    w(f"- **{sub}**: " + "; ".join(f"{f['id']} {f['defect']}" for f in by[sub]))
w("")
for line in st.GAP_NOTES: w(line)
w("\n## Debugger findings\n")
for line in st.DEBUGGER: w(line)
w("\n## Verification\n")
for line in st.VERIFY: w(line)
w("\n## Rows by subsystem\n")
cnt = collections.Counter(f["subsystem"] for f in live)
w(", ".join(f"{k} {v}" for k, v in cnt.most_common()) + "\n")
if miss: w(f"Unassigned to a lane: {', '.join(miss)}\n")
open(f"{D}/SYNTHESIS.md", "w").write("\n".join(out))
# PLANS
o = []; w = o.append
w("# Test suite review 2026-10-19 — pass-2 fix plans\n")
w("Generated with `SYNTHESIS.md`. Each lane is one PR-sized owner session; OWNED globs are disjoint between lanes. A lane stays **draft** until every batch it draws from has a final report.\n")
for line in lanes.PREAMBLE: w(line)
w("\n## Order and dependencies\n")
for line in lanes.ORDER: w(line)
w("\n## Lanes\n")
for L in lanes.LANES:
    fin = all(b in st.FINAL for b in L["batches"])
    state = "ready to launch" if fin and L.get("ready", True) else "draft"
    eff = collections.Counter(next(f["effort"] for f in F if f["id"] == i) for i in L["ids"])
    w(f"### {L['id']} — {L['name']} ({state})\n")
    w(f"- **Goal:** {L['goal']}")
    w(f"- **Owned:** " + ", ".join(f"`{g}`" for g in L["owned"]))
    w(f"- **Closes:** {', '.join(L['ids'])} ({len(L['ids'])} findings; effort S×{eff['S']} M×{eff['M']} L×{eff['L']})")
    w(f"- **Draws from batches:** {', '.join(L['batches'])}" + ("" if fin else " — waiting on: " + ", ".join(b for b in L["batches"] if b not in st.FINAL)))
    w(f"- **Verify:** `{L['verify']}`")
    w(f"- **Effort:** {L['effort']}")
    w(f"- **Model:** {L['model']}")
    w(f"- **Depends on:** {L.get('deps','none')}")
    if L.get("slices"): w("- **PR slices:** " + "; ".join(L["slices"]))
    w("")
if miss: w(f"**Unassigned findings:** {', '.join(miss)}\n")
open(f"{D}/PLANS.md", "w").write("\n".join(o))
top = ranked[0]
print(f"rows {len(F)} live {len(live)} lanes {len(lanes.LANES)} miss {miss}")
print(f"TOP {top['id']}: {top['defect'][:90]}")
