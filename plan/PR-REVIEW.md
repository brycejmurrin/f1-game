# Open-PR review by the orchestrator, 2026-11-25 ~09:00Z

Input for the overnight re-plan. Raw state: scratch/scope/pr-state.tsv (mergeable, ahead/behind, size, gate row).

## What the 25 open PRs show

1. **The gate keeps re-measuring as the tip moves.** 13 of 21 ready+land PRs read "merge-gate waiting — the deploy tip moved since the gate measured X: re-gating". Each of the 8+ merges at 08:32–08:49Z restarted the gate on every queued PR. Landing one PR at a time against a moving tip doesn't scale past ~10 queued. **#6561** (trains as the default lane, cap 12, board orphans, re-snap stale trains) is the fix. It is CLEAN, with the gate passed at 08:57Z; Bryce can merge it by hand (the #6528 never-armed bug). Merge it FIRST, and launch no batch of land-bound PRs before it is on the tip.
2. **A dead train orphans its cars.** Train #6540 (cars #6431 #6436 #6466 #6529 #6534, built at d520d375) went dirty once #6529 and #6534 merged outside it. Its 3 other cars have been stuck 4–5 h, now ~180 behind. Rule for the night: when Bryce or the bot merges a PR that sits in a train, the train is dead. Its cars need a sync, and land must rebuild. (#6561 re-snaps; until then the orchestrator launches CONTINUE for them.) A worker for #6431 and #6466 launched at 09:03Z.
3. **#6436 overlaps #6561** on PROTECTED land machinery: `.github/workflows/land.yml`, `tools/ci/merge-train.mjs`, `tests/unit/merge-train.test.mjs`. After #6561 merges, #6436 needs a sync, a superseded-check (T1 "close an unarmed green train" may already be covered) and Bryce's config-ok re-tick. Serial, never parallel with other land.yml work (land.yml thinning after #6561 is the same files: one chain #6561 → #6436 → thinning).
4. **The gate rows that refuse are mostly owner-fixable, not CI:** plan=FAIL (#6522, #6566), config=FAIL (#6541: routine, added 09:02Z), gen/ratchets/retest=FAIL (#6549: sync worker told). Each was refused once and nobody saw it for 20–60 min. Overnight the :49 light check must read every ready+land PR's gate row and route each FAIL row.
5. **Gardener carves are small and fragmented.** #6527 #6530 #6531 #6532 #6535 #6538 #6539 are 7 refactor PRs of 54–327 lines, each paying a full browser-lane CI (30–48 jobs) and its own gate chase. #6539 is stacked on #6531. Future gardener carves go 2–3 per PR by area (the `batch` label, issue with `## Members`/`## Merge order`). Exception: carves that touch game.js/hud.js/ai-drive.js stay small and serial (high conflict).
6. **Lanes.** Browser lane (js/css/index.html): #6522 #6525 #6527 #6530 #6531 #6532 #6535 #6538 #6539 #6541 #6562 #6564 #6567 #6568 #6572 = 15. Fast lane (tooling/docs): #6431 #6436 #6466 #6514 #6537 #6549 #6561 #6566 #6574 = 9 (+ train #6540). The browser lane is the bottleneck; new overnight launches should lean fast-lane until it drains below ~6.
7. **Shared hot files in flight:** js/physics/ai-drive.js (#6527 carve 7, #6541 brakeTarget, #6568 AI pace, likely #6564 field spread), js/physics parts (#6572), the HUD (#6530 sectors; #6518 merged). Units touching ai-drive.js wait until #6527, #6541 and #6568 land. The #6572 snap follow-up touches player forces (game.js/physics) and waits for #6572.
8. **Labels to use for organizing:** `batch` + `batched` (one PR closes several members; dispatch.mjs semantics), `blocked` ("Blocked by #n"), `needs-decision` (Bryce-only), `ready`/`claimed` on issues, `hold` (veto; never set by an agent on Bryce's work), `priority` (Bryce only, never an agent), `needs-device` + `phone` for the morning window, `source:*` for hunts, `epic` for parents (#6545, #6559). The scoped queue should name the label set per new issue (one type, one `area:*`, one `source:*`).

## Proposed rules for the overnight run

- **Order of unblocking:** #6561 (Bryce merge) → the first train → the orphans synced → #6436 (Bryce re-tick) → land.yml thinning.
- **Batch new work** into PRs of 2–3 units, about 400 changed lines at most, same area and same lane. Never batch browser-lane units that touch different hot files.
- **Cap in-flight:** browser lane ≤ 6 open (draft + ready), fast lane ≤ 6. Launch at most 3 new workers per :19 cycle, and only while ready+land < 10.
- **Never merge outside a train while a train holds that PR** (tell Bryce: "merge enabled" PRs that are cars in an open `train` PR break the train).
- **Stuck-gate policy:** gate pending > 60 min with ci=ok and no FAIL row → toggle `land` only if an agent set it; if Bryce set it → morning list.
</content>
</invoke>
