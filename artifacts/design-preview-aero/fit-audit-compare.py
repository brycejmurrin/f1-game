# Compare L22 car-fit-audit rows: each preview style vs the clone row it copies, same team,
# keeping only failures located within 4 cm of the preview part's own bbox (fit-probe split).
import json, subprocess, sys
D = "artifacts/design-preview-aero/fit"
head = json.load(open(f"{D}/car-fit-audit.json"))["cars"] + json.load(open(f"{D}/car-fit-audit-clones.json"))["cars"]
PAIRS = {"aero/x_wings": "aero/rake_setup", "aero/bridge_wing": "aero/medium", "aero/beam_twin": "aero/high",
         "aero/monkey_seat": "aero/extreme", "aero/spoon_wing": "aero/low", "floor/double_diffuser": "floor/gurney_edge"}
BOX = json.loads(subprocess.check_output(["node", "-e", """
import('./artifacts/design-preview-aero/fit-probe.mjs').then(({builds,split,bbox})=>{const o={};
for (const id of ['x_wings','bridge_wing','beam_twin','monkey_seat','spoon_wing','double_diffuser']){const {on,off}=builds('mclaren',id);o[id]=bbox(split(on,off).part)}
console.log(JSON.stringify(o))})"""]))
by = {(c["team"], c["style"]): c for c in head}
near = lambda at, b: at and all(b["lo"][k] - 0.04 <= at[k] <= b["hi"][k] + 0.04 for k in range(3))
tot = 0
for s, base in PAIRS.items():
    pid = s.split("/")[1]; n = 0
    for (team, st), c in by.items():
        if st != s: continue
        bk = {(r["check"], r["a"], r["b"]) for r in by[(team, base)]["rows"] if r.get("fail")}
        for r in c["rows"]:
            at = r.get("at") or r.get("where")
            if r.get("fail") and near(at, BOX[pid]):
                tag = "pre" if (r["check"], r["a"], r["b"]) in bk else "NEW"
                if tag == "NEW": n += 1; print(f"  {s} {team} {r['check']} {r['a']}|{r['b']} {r.get('value')} at {at}")
    print(f"{s}: {n} NEW fit failures at the part (vs {base})"); tot += n
sys.exit(1 if tot else 0)
