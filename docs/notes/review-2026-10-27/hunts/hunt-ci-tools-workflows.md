# Opus hunt: tools/ci, tools/lib, workflows, hooks (2026-10-27)
F1 HIGH trust .github/workflows/land.yml:53 — on `pull_request`, GitHub runs the PR merge commit's land.yml; post/arm get write perms + LAND_TOKEN → a same-repo PR editing land.yml can post gate=success and merge itself, skipping merge-gate, hold, pause. No CODEOWNERS; protect-files doesn't guard .github/workflows. Fix: pull_request_target (base definition, no PR checkout) or pull_request as a no-permission relay with writes from workflow_run; plus path protection on .github/workflows/**. Test: lint that no write-permission job runs under pull_request. CODE-TRACED
F2 MED trust land.yml:213 — merge-result scripts (gen:check, ratchet tests) can fork a detached process that overwrites verdict/<n>.json before upload. Fix: own process group/uid + kill before verdict; post recomputes plan/distance itself. CODE-TRACED
F3 MED trust .claude/hooks/shellparse.py:1655 + merge_policy.py:155 + github-mcp-guard.sh:92 — a hand-written merge receipt still passes the merge door. Fix: deny merges unconditionally. (merge-gate.test.mjs:236 asserts acceptance.) CODE-TRACED
F4 MED trust github-mcp-guard.sh:97 / shellparse — removing `hold` or `dispatch:merge-pause` labels is unguarded. Fix: classify as ask. CODE-TRACED
F5 MED bug tools/ci/dispatch.mjs:410 — readState pushes any non-listed PR into closedPrs without checking state → open PR on another base gets closed_at null → archives a live worker. Fix: require state==="closed"; unknown closed_at keeps. CODE-TRACED
F6 low dispatch rule 4 lacks archive-sessions idle/push/in-flight guards (archive with unpushed work). CODE-TRACED
F7 low dead-config dispatch.json mergePause and baseBehindMax have no effect. CODE-TRACED
F8 low launch-gate.py:46 — receipt not consumed/bound: one ok receipt allows unlimited create_session in 120 s. CODE-TRACED
Notes: land-tip concurrency group can drop a pending train re-gate (low). write_gate CAS read-then-write (superseded by #3917).
