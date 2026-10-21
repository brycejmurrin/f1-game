import json,sys
b=json.load(sys.stdin)["body"]
b=b.replace("state: verifying","state: pr-open")
b=b.replace("- [ ] **now:** `deploy.mjs --gate-only` remainder (Pages-gate suites; running)\n- [ ] ready-gate, then READY to OrchB 24",
 "- [x] `deploy.mjs --gate-only` on 0f55b251(+33741a27 helper) → exit 0, every Pages-gate suite verified (gate3)\n- [x] Fast-tier CI 39491956819: Structural guards green; `Selected specs (verdict)` red only because the plan DROPPED `props-over-road.spec.js` over budget (no test failed) — its group `circuits` run remotely: group passed 4/4 (39493656527)")
b=b.replace("Draft, head 33741a27 (33741a27 changes only `tests/helpers/factory-seat.js` over 0f55b251).",
 "Head 33741a27 (changes only `tests/helpers/factory-seat.js` over 0f55b251). ready-gate: Structural guards green; all Plan items closed.")
b=b.replace("- Browser: tiny, car, ui, hooks via `remote-group.mjs` (runs above); audit is node-only (in the floor)",
 "- Browser: tiny, car, ui, hooks, circuits via `remote-group.mjs` (runs above); audit is node-only (in the floor)")
b=b.replace("Finish the gate, ready-gate, READY to OrchB 24. Then the follow-up PR for TLX warm/garage overlap (a).",
 "Done — ready for review; READY sent to OrchB 24. Follow-up PR next: TLX warm/garage overlap (a).")
open("/home/user/f1-game/scratch/h8/pr-body.md","w").write(b)
print(b.count("- [ ]"))
