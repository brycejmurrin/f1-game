# Skill / tool audit — game-systems

Hands-on audit of the **game-systems** skill and tool group (2026-10-01).
Branch tip at start: `origin/claude/f1-game-project-26h3ng` @ `5fa849bb1` (later
moved while fixes were cut). Each item was exercised by following its
`SKILL.md` / tool header as a new agent would, with small inputs. Network /
GPU / secret-gated work is marked **not testable**.

## Verdict counts

| Verdict | Count |
|---|---|
| works | 18 |
| works with caveats | 12 |
| broken (fixed in this audit) | 4 |
| not testable | 5 |

## Skills

| Item | Verdict | Evidence / command run | Issue found | Fix PR or proposal |
|---|---|---|---|---|
| **ai-racecraft** | works with caveats | `node --test tests/unit/ai-drive.test.mjs` (92 pass; skill says ~100); `ai-race.mjs ratings --json`; `pace --track monza --diff normal --laps 1`; `line --track monza`; `field --seconds 60 --runs 1`; `tactics --laps 2 --runs 1`; `band --seconds 30`; `human --seconds 60`; `ai-strategy-census.mjs --laps 2` | Skill test-count drift (92 ≠ ~100). Several dispatched CLIs ignored `--help` and ran full work (see tools). Stuck/rescue has no CLI counter (skill already says so). | Help: #682. Ranked: add a stuck/rescue census CLI (proposal R1). |
| **career-mode** | works | `node --test tests/unit/career-settle.test.mjs` (54 pass); `node tools/car/career-economy.mjs --years 1` (~204 s, PASS, readable economy table) | `career-economy.mjs --help` started Chromium (~3 min). Skill correctly says there is no `test:career`. | Help: #682. |
| **season-mode** | works with caveats | `node --test tests/unit/season-cal.test.mjs` (48 pass; skill says 46) | Stale test count in SKILL.md (46 → 48). | Proposal R2: refresh skill test counts in a docs-only sweep (all skills). |
| **race-incidents-control** | works with caveats | `node --test tests/unit/race-control.test.mjs` (36 pass; skill says 35); `incident-gate` + `reliability` (17 pass) | Stale test count (35 → 36). Browser group `physics-core` not run (SwiftShader cost). | Proposal R2. |
| **steward** | works with caveats | `who-is-on-it.mjs` (lists pushes/claims); `session-status.mjs`; `ci-watch.mjs --once` without `GH_TOKEN` → `= ci unknown` even though `gh auth status` was logged in | `ci-watch` required env token; Cursor Cloud often has only `gh` auth. Skill itself is clear on draft/ready dedupe and sync-pr. | #679 (`gh auth token` fallback). |
| **tune-physics** | works with caveats | `player-dyn.mjs --json` (finite tables); `player-dynamics-vm.test.mjs` (14 pass); `check-physics.mjs bank` (PASS); `physics-tune-sweep.mjs --help` previously ran a full multi-circuit sweep | `--help` footguns on player-dyn / physics-tune-sweep. Skill correctly steers A/B to VM first. | #682. |
| **input-controls** | works | `node --test tests/unit/ui-improve-pass.test.mjs` (stick dead-zone case pass; 51 total); `key-binds.test.mjs` (30 pass) | No CLI beyond browser group `input` (by design). | — |
| **audio-debug** | works with caveats | `audio-test.cjs` against live `http.server 8099` → PASS; against dead port → uncaught `ERR_CONNECTION_REFUSED`; `--help` was treated as a URL | Defaulted to `localhost:8099` with no self-serve (unlike career-economy / check-physics); skill implied “just run it”. | #678. |
| **multiplayer-debug** | works with caveats | `npm run test:net-unit` (297 pass); `rtc-e2e.mjs` progressed through invite/answer/ready on localhost; `nostr-local.cjs` starts | Public `nostr-probe` / TURN need network and optional deps (`ws`, `@noble/curves`). Skill commands omit `nostr-local` / `rtc-e2e-room` path. | Proposal R3: skill Quick Reference should list the local room-code recipe (`nostr-local` + `rtc-e2e-room`). |
| **data-hub** | works with caveats | `node --test tests/unit/data-api-status.test.mjs` (+ results / lazy-loader) — 29 pass | Live Jolpica/OpenF1 fetches need network (skipped). Skill is clear that empty tabs are often delayed free data. | — |

## Tools

| Item | Verdict | Evidence / command run | Issue found | Fix PR or proposal |
|---|---|---|---|---|
| `tools/check/ai-race.mjs` | works | no-arg prints usage; `ratings` / `pace` / `line` / `field` / `tactics` / `band` dispatch | — | — |
| `ai-pace.mjs` | works with caveats | `--track monza --diff normal --laps 1` → median 2:22.167 | No `--help` (ran work). | #682 |
| `ai-field.mjs` | works | `--seconds 60 --runs 1` → spread/passes/dwell table | `--seconds` floor 60 (skill ok). No `--help`. | #682 |
| `ai-tactics.mjs` | works | `--laps 2 --runs 1` → intervals / stuck / atkOnPlayer=0 | Has `--help`. | — |
| `ai-line.mjs` | works with caveats | monza → 3 scored corners, approach negative / apex deep | No `--help`. | #682 |
| `ai-human.mjs` | works with caveats | `--seconds 60` → yield/contact rates | No `--help`. | #682 |
| `ai-ratings.mjs` | works | via `ai-race.mjs ratings --json` | Has `--help`. | — |
| `ai-band.mjs` | works | `--seconds 30` → reverseOnly checklist | Has `--help`. | — |
| `ai-strategy-census.mjs` | works | `--track bahrain --laps 2` (~32 s wall) | Has `--help`. Default 10 laps ~5 min (header warns). | — |
| `defend-duel.mjs` | broken → fixed | smoke `--fracs 1 --gaps 4 --dxs 0 --secs 3` works; header said `node scratch/defend-duel.mjs` (file missing); `--help` ran full 280-cell grid; no `@skill` so README paired `—` | Stale path + silent `--help` + missing skill tag | #673 |
| `player-dyn.mjs` | works with caveats | `TRACK=monza FRAC=0.0 --json` | No `--help`. | #682 |
| `physics-tune-sweep.mjs` | works with caveats | accidental `--help` ran full default sweep (monza/suzuka/bahrain) | No `--help`; very expensive default | #682. Proposal R4: refuse unknown flags via `cli-args.mjs` (same class as garage tools). |
| `check-physics.mjs` | works | no-arg → usage; `bank` → PASS | Self-serves via harness. | — |
| `audio-test.cjs` | broken → fixed | needed external server; `--help` = invalid URL | Self-serve + help | #678 |
| `tools/car/career-economy.mjs` | works with caveats | `--years 1` PASS (~3.4 min) | No `--help` (started Playwright). | #682 |
| `tools/net/rtc-e2e.mjs` | works | local 2-peer handshake reached READY | Slow / machine-dependent (header says so). | — |
| `tools/net/rtc-e2e-3p.mjs` | not testable | — | Needs minutes + network stack; skipped to keep machine free for CI. | Run after net edits only. |
| `tools/net/rtc-e2e-room.mjs` | not testable | — | Needs `ws` + `nostr-local`; skipped full E2E this pass. | Proposal R3. |
| `tools/net/nostr-local.cjs` | works | starts on `:7448` after `npm i --no-save ws` | Correctly refuses without `ws`. | — |
| `tools/net/nostr-probe.mjs` | not testable | — | Needs public WSS + `@noble/curves`. | — |
| `tools/net/rtc-sync-probe.mjs` | not testable | — | Shares port 4468 with rtc-e2e-3p; long; skipped. | — |
| `tools/ci/ci-watch.mjs` (steward) | broken → fixed | without env token: `= ci unknown`; with `gh auth token`: lists jobs | Env-only auth | #679 |
| `tools/ci/who-is-on-it.mjs` / `session-status.mjs` | works | both print useful handoff | `@skill` on who-is-on-it is `check-changes` (steward documents it) — intentional split. | — |

## Fix PRs opened this audit

| PR | Concern | Status |
|---|---|---|
| [#673](https://github.com/brycejmurrin/f1-game/pull/673) | defend-duel path + `--help` + `@skill ai-racecraft` | draft until CI green |
| [#678](https://github.com/brycejmurrin/f1-game/pull/678) | audio-test self-serve + `--help` | draft until CI green |
| [#679](https://github.com/brycejmurrin/f1-game/pull/679) | ci-watch `gh auth token` fallback | draft until CI green |
| [#682](https://github.com/brycejmurrin/f1-game/pull/682) | `--help` on remaining expensive game CLIs | draft until CI green |

## Ranked proposals (not built)

1. **R1 — Stuck/rescue census CLI** (ai-racecraft). Skill documents `stuckT`/`rescueT` with no instrument; `ai-field` dwell is a weak proxy. A VM tool sampling per-car stuck/rescue events over N seeds would close the gap the skill already names.
2. **R2 — Skill test-count hygiene**. Several SKILL.md files hard-code test counts that drift (`season-cal` 46→48, `race-control` 35→36, `ai-drive` ~100→92). Prefer “run `node --test …`” without counts, or generate counts.
3. **R3 — multiplayer-debug local room-code recipe**. Skill Quick Reference lists `rtc-e2e` / `rtc-e2e-3p` but not the `nostr-local.cjs` + `rtc-e2e-room.mjs` path that actually tests room codes without public relays.
4. **R4 — Adopt `cli-args.mjs` on measurement CLIs**. Hand-rolled `flag()` still ignores unknown flags (`--tema`, typos). The garage tools already learned this lesson; ai-* / defend-duel / physics-tune-sweep should too.
5. **R5 — `remote-group.mjs` same gh-auth fallback** as ci-watch (out of lane for this group’s primary skills, but same Cursor Cloud footgun).

## Notes for the next agent

- Do not merge these PRs here; keep drafts until the exact head is green, then mark ready.
- Stay off shared files other audit groups own (`tools/ci/` beyond ci-watch was avoided except the help-list regen for tooling-fast).
- Browser groups (`modes`, `physics-core`, `input`, `ui`, `net`, `hooks`, `collisions`) were intentionally not run — AGENTS.md cost; named as not-run.
