VERDICT: FIX — the steps are in the right order but run-ci is written as optional, which leaves ready-gate with nothing to read; CI is never watched; and "session ENDS" contradicts AGENTS rule 13.
METRICS: 31 lines / ~2.1 KB (~530 tok) / description ~128 chars / 0 references files (none linked)
PATHS: OK. docs/VERIFICATION.md, docs/WORKERS.md, tools/ci/pick-tests.mjs, tools/ci/ready-gate.mjs, land.yml, the `run-ci` label and the `CI: run` body marker (ci.yml:184-205, :371) all exist. "WORKERS §2/§3/§5" are numbered contract items, not headings (soft anchor).
COMMANDS: OK. `ready-gate.mjs --pr <n>` exists (USAGE ready-gate.mjs:317). The claim about `deploy.mjs --pr` holds: openPr (deploy.mjs:802-813) runs `gh pr create --fill`, which opens a READY PR without the template.

FIRST-WRONG-STEP: step 3 (SKILL.md:22). `run-ci` appears only as a parenthetical ("for draft CI"), so the draft is allowed to stay without CI.
Then step 4 (`ready-gate --pr`) has no evidence to read. It wants `Structural guards` green on the tip (ready-gate.mjs:65-80) or the local stamp `artifacts/logs/tooling-fast-ready.sha` (:35). Nothing in the repo writes that stamp (grep: ready-gate is the only reference). So without run-ci, ready-gate exits 1 "none", and the agent either guesses or loops on it.

| # | sev | file:line | problem | fix |
|---|---|---|---|---|
| 1 | high | SKILL.md:16-22 | run-ci reads as optional and its timing is unclear. It is the only evidence ready-gate can read (the stamp has no writer). | Step 1: open the draft WITH `run-ci` (or the `CI: run` body line). Step 4: "needs the fast tier green on this head". |
| 2 | high | SKILL.md:22-23 | No CI watch between push and gate. Rule 13 needs `subscribe_pr_activity` plus a `ci-watch.mjs --sha <head> --timeout 30 --failures-only` Monitor. ready-gate exits 1 while CI is pending. | Add "watch (rule 13) until `= ci passed`, then gate". Do not suggest `ready-gate --wait`: it polls (rule 13 bans shell polls). |
| 3 | high | SKILL.md:25-26 | "the session ENDS … not this session". AGENTS rule 13 says re-subscribe after the draft→ready flip and never report done with a red or pending check. In practice the worker stays subscribed until the dispatcher archives it (review-fix-plan WP-R2). The ready flip starts the FULL tier, which can go red after `land`. | "Re-subscribe after the flip. A red on your head stays your work (steward) until the merge or the archive." Settle the wording with WORKERS.md:21-25 and steward:26,159. |
| 4 | med | SKILL.md:23 | Gate prerequisites are missing. ready-gate also refuses an open Plan (only `land:` is exempt), a CONFLICTING PR (sync first) and an already-ready PR (ready-gate.mjs:149). | "Tick or strike every Plan item except `- [ ] land: …`. Leave that one open (template:23-25). DIRTY → `sync-pr.mjs`." |
| 5 | med | SKILL.md:13,25 | Calls `gate` "a check". land.yml now posts it as a commit STATUS, context `gate`, deliberately not a check run (land.yml:28-33, #3914). An agent that looks for a check-run named `gate` will not find one. | Say "the `gate` commit status". |
| 6 | med | SKILL.md:20-21 | The pre-push floor is WORKERS §3 (`tooling-fast --changed` + one spec). AGENTS rule 3 says full `tooling-fast` before every code push, and step 1 pushes before any verification. The three disagree. | Point at whichever floor WP-R1 picks; say that the first draft push is exempt (rule 12). |
| 7 | low | SKILL.md:16-18 | Never mentions the Plan rules (one `now:` item, tick with evidence, never delete) or the Hand-off fence. "Template body" alone leaves the agent to discover them. | One line linking rule 12 and WORKERS "The Hand-off block". |
| 8 | low | SKILL.md:3 | "push to the deploy branch" routes here, but that push is refused. | Keep the trigger and add "(never pushed directly)" to the body; already partly said at :14. |
| 9 | low | steward/SKILL.md:147-159 | Steward §12 repeats ship steps 4-5 almost word for word. "Mark it ready / land it" matches both skills. | Make one of them the home (ship) and leave a pointer in the other. |

TRIGGER: routing is mostly clean. check-changes sends "landing on the deploy branch" to ship. check covers status only. Steward overlaps on ready/land (row 9). Three asks ("ship it", "open the draft PR", "land #123") all route here; "land #123" may also hit steward.
STALE NUMBERS: none in the skill (it cites no figures). Good.
STRUCTURE: short, no references/, no line over 400 chars. Duplicates WORKERS §5 and steward §12.
ENFORCEMENT: the ready-flip receipt is hook-enforced (merge_policy.py), so step 4's "exit 0" is enforced. The session-merge ban and squash ban are hook-enforced (:30-31 could be a pointer). run-ci-before-gate is prose only; a ready-gate message that says "no evidence: add run-ci" would enforce it.

OUT OF SCOPE:
- tools/ci/ready-gate.mjs:35 / steward/SKILL.md:90-91: claim that a full tooling-fast writes `tooling-fast-ready.sha`. No writer exists in the repo.
- AGENTS.md rule 12: "`deploy.mjs --pr` is the gated, ready form" conflicts with ship's "never".
- deploy.mjs:783,799,811: notes still say "Merge Desk arms MERGE" (retired).
- docs/WORKERS.md:23,103: says the ruleset requires `CI` and `gate`. The brief says `gate` is the only required check, and land.yml `post` re-checks CI itself before a pass. Verify the live ruleset and fix one or the other.
- docs/WORKERS.md:19,21-25: "subscribe only while CI runs" / "session ENDS" vs AGENTS rule 13 (re-subscribe after the flip).

COVERED: SKILL.md in full. Checked against WORKERS.md, land.yml, ready-gate (header, draftProblem, guardsVerdict), merge-gate (plan/land: rule), deploy.mjs --pr, the ci.yml run-ci/`CI: run` rules, the PR template, and the check / check-changes / steward descriptions.
NOT COVERED: merge-gate.mjs body beyond its rows; merge_policy.py receipt freshness; the live GitHub ruleset (not readable here); handoff skill.
