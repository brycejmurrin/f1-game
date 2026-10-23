#!/bin/bash
# usage: lift.sh <pr>  — drops a leading MERGE-HOLD: line, appends a Plan tick before ## Status (or at end)
set -e
S=${SCRATCH:?set SCRATCH to your scratchpad}
gh api repos/brycejmurrin/f1-game/pulls/$1 > $S/pr$1.json
python3 - $S/pr$1.json $S/patch$1.json <<'PY'
import sys,json
p=json.load(open(sys.argv[1])); b=p["body"] or ""
out=[];dropped=0
for l in b.split("\n"):
    if l.startswith("MERGE-HOLD:"): dropped+=1; continue
    out.append(l)
b="\n".join(out).lstrip("\n")
add="- [x] MERGE-HOLD lifted by OrchA 31 at merge"
if "\n## Status" in b:
    i=b.index("\n## Status"); b=b[:i].rstrip("\n")+"\n"+add+"\n"+b[i:]
else: b=b+"\n\n"+add
json.dump({"body":b},open(sys.argv[2],"w"))
print("head",p["head"]["sha"],"dropped",dropped,"draft",p["draft"],"mergeable",p.get("mergeable_state"))
PY
gh api -X PATCH repos/brycejmurrin/f1-game/pulls/$1 --input $S/patch$1.json -q '.number' >/dev/null && echo lifted $1
