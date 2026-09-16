# Process speed-up research, 2026-09-16 — five plans

Written by five parallel research passes (read-only against the tree, web
sources cited inline, unverified claims marked) after the same day's landing
(`../../notes/AGENT-PROCESS-RESEARCH-2026-09-16.md` §5) and the fifteen plans
in `../2026-09-16-process-speedup-next.md`. Each file goes BEYOND those: it
does not repeat an item already planned, and where a measurement contradicts
one, it says so (the VM-harness plan overturns item 3).

| Plan | Headline | Read it for |
|---|---|---|
| [testing.md](testing.md) | 67 of 119 specs use no DOM API — a `vmPage` adapter would run them UNMODIFIED against the Node VM instead of hand-porting twins; V8 code caches for the 4.8 MB VM boot; a committed spec-timing file for shard packing; the Playwright 1.63 features the pin already pays for (`lock`, `retryStrategy`) | the twin programme's next 80 % |
| [vm-harness.md](vm-harness.md) | MEASURED: 70 % of `elevation-tracks-vm`'s 399 s is physics stepping with a 22-car field (3.13 ms a step), 13 % `Tracks.build`, scenery 0.4 %, car meshes once per file — so a `worker_threads` pool (399 s → ~120 s), not a build cache; `carMeshes:false`; a `trackProfile`-driven grade search; the browser `?boot=bare` seam | the fast tier's floor, with the profile |
| [ci.md](ci.md) | a base-red verdict line in every run summary ("whose red is it"), a per-job inputs-hash verdict cache generalising the train's reuse, a `status.json` in the Pages artifact, a home-made landing bot; closes larger runners, self-hosted GPU and per-session auto-merge PRs with sources | the shared deploy branch under five agents an hour |
| [measurement.md](measurement.md) | a nightly CI process dashboard committed as JSON, per-test duration history from the live reporter, five waste detectors in the hooks, a transcript-derived session ledger (no per-call hook cost), time ratchets that never run what they measure | making the next audit a file read |
| [agent-ergonomics.md](agent-ergonomics.md) | `if:` filters and `async` on the hooks (90 % fewer spawns), SessionStart `additionalContext`, a `Stop` hook, `permissions.defaultMode: "auto"` + sandbox instead of a 40-entry allow list, a 120-line AGENTS.md re-cut with four path-scoped rules, `docs/agent-index.json`, `context: fork` skills, `WorktreeCreate` for `node_modules` | the per-turn and per-session tax |

Cross-cutting order (from the five files' own rankings): the hook filters and
SessionStart context (an hour), the worker pool for `elevation-tracks-vm`
(half a day, the fast tier's floor), the base-red verdict line (3 h), the
`vmPage` adapter spike on ONE spec (a day, decides the twin programme), then
the dashboard and the per-job verdict cache.
