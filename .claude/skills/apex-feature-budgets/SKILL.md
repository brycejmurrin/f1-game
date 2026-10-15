---
name: apex-feature-budgets
description: "Use when scoping a harness lane: shot/time/message caps; Lighting ≤1. Launch → agent-fleet."
---

# Apex feature budgets (harness + cloud lanes)

Numbers below come from `agent-fleet` `references/launch-policy.md` and
`AGENTS.md` unless marked **TODO** (not yet measured in-repo).

## Per-lane / per-job caps (launch prompt)

| Budget | Limit | Source / notes |
|---|---|---|
| Cloud-agent **shots** (apex-eval / `shot.mjs` / Playwright capture) | **≤ 25** per job unless the user raises the cap | `launch-policy.md` — sample the matrix instead of exhaustively capturing every menu/track |
| **Time box** | Abort at **> ~90 min** with no OWNED push | `launch-policy.md` |
| **Message box** | Abort at **> ~400 messages** with no OWNED push | `launch-policy.md` |
| **Relaunch** | Never fork/relaunch an errored or >400-message agent on the **same** prompt without new evidence or narrower OWNED | `launch-policy.md` |
| **Nested subagents** | **≤ 2** parallel inside one cloud agent; more → separate agents with disjoint OWNED | `launch-policy.md` |
| **Review farm** | **≤ 2** concurrent review agents unless the user overrides | `launch-policy.md` |
| **Resolve swarm** | Only red/dirty PRs with no specialist owner; one `--claim` per PR | `launch-policy.md` |

## Lane mutex (one owner per path family)

| Lane | Mutex | OWNED (typical) |
|---|---|---|
| **Lighting** | **≤ 1** concurrent lighting agent | `js/lighting/**` only — no scenery PRs from that lane | `launch-policy.md` |
| **Garage CSS** | UI Survey lane | **TODO:** exact glob in launch template (see `css-play` / survey-ui-matrix splits) |
| **`js/car/*`** | Cars lane | `js/car/*` |
| **Scenery** | Tracks lane | `js/circuits/scenery/*` |
| **`js/game.js`** | Claim before edit | `who-is-on-it` `--claim` required (`launch-policy.md`) |

## CI / merge desk caps (not a worker’s job to widen)

| Cap | Value | Tool |
|---|---|---|
| Ready PRs holding full-tier CI | **3** (`MAX_LIVE`) | `ready-full-cap.mjs` |
| Armed PRs (any method) | **2** (`MAX_ARMED`) | `pr-board.mjs` / `ci-watch` |
| Ready PRs repo-wide (pacing) | **~6 or fewer** | `ci-watch` |
| Draft→ready after green | Owner within **15 min** | `ci-watch` |

## Sync / Finish agent budgets

| Budget | Limit | Source |
|---|---|---|
| Sync agent stall | Abort past **~120 messages** or **> 2** tip moves with no progress while clean-behind | `launch-policy.md` |
| Sync scope | Only when CONFLICTING/DIRTY or required tip check red — not clean-behind | `AGENTS.md` §Git branch & deploy |

## Abort procedure (hit any cap)

1. Stop new captures / browser groups (`AGENTS.md` rule 5 — one group per batch).
2. Push whatever OWNED work is verified; open or update the **draft** PR with
   Plan + `claim:` line (`who-is-on-it`).
3. Set fleet `state: blocked`, `needs-orchestrator: yes`; message orchestrator
   with head SHA and what was **not run** (`agent-fleet` `references/worker.md`).
4. `--release` the claim only when truly done or handing off.

## Evidence discipline

- Pin long Chromium/visual smoke to **PR Pages preview** or a pinned `apex-sha`
  — not the moving production github.io (`launch-policy.md`).
- A pass that needed a retry counts as **red** until quarantined or fixed
  (`AGENTS.md` rule 9).

## TODO (needs a measured note in `docs/notes/`)

- Per-lane shot sub-budgets (e.g. lighting vs HUD survey) beyond the global 25.
- Whether harness lanes share the 400-message limit with orchestrator turns.
- Formal Lighting lane queue file (today: orchestrator enforces ≤1 manually).
