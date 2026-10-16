---
name: survey-prs-merge-to-assets-cap5
description: "2026-10-15 Bryce: green survey PRs merge into track-survey-assets (merge commits); full-tier ready cap 5 while queue-depth says ok, 3 on hold"
metadata:
  node_type: memory
  type: project
  originSessionId: ef12c769-9941-5fd4-8a7f-d488dee68ee2
  modified: 2026-10-15T21:39:30.450Z
---

Bryce, 2026-10-15 ~14:50Z (Merge Desk orchestrator session), answering "We still have tons of open prs":
- Survey PRs (base `track-survey-assets`, 53 open) MERGE INTO `track-survey-assets` with merge commits once green and stripped to their own images; they still never go to the deploy branch. Lane: `[Merge Desk] survey PRs → track-survey-assets`.
- Full-tier ready cap: `ready-full-cap.mjs --cap 5` while `queue-depth.mjs` says ok; back to the default 3 when it says hold. (Superseded 2026-10-16: the cap and the push hold were retired, CI/CD review #2333 finding 7.)
- Old never-CI drafts (#1545 #1776 #1800 #1947): sync and add `run-ci`, not close.
- ~21:42Z: DRAFT pushes may go through during a queue hold (a draft without `run-ci` starts no CI); ready-PR pushes and adding `run-ci` still wait for `= queue ok`. Also approved: CHANGELOG fragments (one tooling PR), and merging survey #2090 keeping the base's copy of the conflicting file.

**Why:** the open-PR count stayed high: survey PRs had no merge path, and the cap of 3 full-tier runs limited merges to about 5 or 6 an hour.

**How to apply:** (cap retired 2026-10-16; the survey-PR rule stands) a survey PR that carries js/css/tools/tests is not stripped and does not merge. See [[standing-merge-desk]] and [[pr-auto-merge]].
