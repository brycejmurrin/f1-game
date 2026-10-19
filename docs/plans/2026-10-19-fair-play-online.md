# Fair-play online — reduced collisions and a clean-racing score (2026-10-19)

Date: 2026-10-19  
Status: **PLAN** — docs-only; implement later as draft PRs against
`claude/f1-game-project-26h3ng`. No game code in this PR.  
Parent: [feature roadmap Tier 2](2026-10-04-feature-roadmap.md#tier-2-deepens-the-racing-each-needs-its-own-plan)
([#1588](https://github.com/brycejmurrin/f1-game/issues/1588)).  
Scope: how online races offer reduced / ghosted collisions, what the netplay
wire carries, and a clean-racing score with results readout. A path written
`js/<new>/…` is PROPOSED.

## Related (do not duplicate)

| Doc / module | Relationship |
|---|---|
| [`2026-10-04-feature-roadmap.md`](2026-10-04-feature-roadmap.md) Tier 2 | One-line backlog item; this file is that plan |
| `js/net/netplay.js` | Pose publish / relay / `_nOk` contact prediction |
| `js/net/snapshot.js` | 13-byte car wire (`CAR_BYTES`); no fair-play fields today |
| `js/physics/collide.js` | `pairContact` / resolve; already skips `ownsPose` and dual-static pairs |
| `js/race/damage.js` | `contact(a,b,impact)` from `collideFx` |
| `js/career/career.js` `craftScore` | Offline race-craft from hits / walls / cuts — **do not reuse as the online score** without an explicit mapping |
| `js/ui/results-sheet.js` | Incidents card + career craft rows — readout hook |

## Check-first (issue #1588)

Confirmed on tip `7b27c153` (2026-10-19):

- **No** `fairPlay` / `cleanRacing` / `collisionMode` / ghosted-collision mode
  under `js/net/**` or `js/race/**` (ripgrep).
- Netplay carries **pose only**: `NetSnapshot.writeCar` packs
  `id, s, x, head, speed, gear+flags(deploy/offroad/kerb/brake), lap`
  (`CAR_BYTES = 13`). No contact impulse, no fair-play mode bit, no score.
- Contact is **resolved locally** on each peer: `Collide.pairContact` reads
  remote predict fields `_nOk/_nProg/_nX/_nSpd` written by the netplay tick,
  then separates / scrubs. Host does **not** authoritatively resolve hits.
- Career already has offline `craftScore(p)` from `hits` / `hitSev` /
  `wallHits` / cuts / penalties — used for reputation, not shown as an
  online “clean racing” number on friend-race results.

The feature is still unbuilt. Plan before code.

## Goal

Friend races (WebRTC, 2–4 players) can opt into a **fair-play collision mode**
where peer-to-peer shunts are softened or ghosted so a desync or lag spike
does not ruin a lap, and every human leaves with a **clean-racing score** on
the results sheet that rewards leaving racing room without hiding real
incidents from the incident list.

## Non-goals

- Server authority, anti-cheat, or ranked ladders (static Pages host).
- Changing AI-vs-AI or single-player collision feel (offline craft stays).
- Expanding the 13-byte pose packet with contact impulses (too late, too
  lossy) — mode and score travel on **reliable events**, not the snapshot.
- Touching `js/game.js` beyond a one-line `Module.create` if unavoidable;
  prefer net / race / ui modules.

## Current contact path (file evidence)

```
netplay tick
  → interp.predict → c._nOk/_nProg/_nX/_nSpd   (js/net/netplay.js ~1284–1298)
  → encodeSnapshot / encodeAged               (js/net/snapshot.js)
collide step
  → pairContact uses predict fields for remotes (js/physics/collide.js ~469–524)
  → ownsPose / dual netPlay.owns early-outs
  → side scrub or rear speed transfer + contactT
collideFx (game.js)
  → Damage.contact, shake, hits/hitSev counters
```

Hidden-tab note already exists: a frozen tab must not publish poses or peers
solve contact against a ghost (`netplay.js` ~1322–1326). Fair-play mode
extends that idea to **intentional** soft contact between live humans.

## Design

### A. Collision modes (lobby option)

| Mode id | Behaviour | Who feels it |
|---|---|---|
| `full` | Today's resolve (default; preserves current feel) | everyone |
| `reduced` | Human–human contacts: lower separation gain, lower scrub, no / tiny `Damage.contact` severity; AI contacts unchanged | humans only |
| `ghost` | Human–human: **no** pose correction and **no** damage; optional translucent rival draw while overlapping; AI unchanged | humans only |

Lobby: one reliable enum on room create / `RACE_SETTINGS` sync (mirror weather
/ mix pattern in `js/net/lobby*.js`). Mid-race changes refused.

#### How each peer resolves contact

Every peer still runs `pairContact` locally (no host rewind). Mode gates the
**response**, not the detection:

1. Detect overlap as today (predict pose for remotes).
2. If either car is AI → existing resolve.
3. If both human and mode is `ghost` → record a soft event for scoring, skip
   `_colResolvePair` separation / scrub / `collideFx` damage.
4. If `reduced` → run resolve with scaled gains (proposed constants in
   `js/<new>/race/fair-play.js`), and feed `Damage.contact` a capped impact.
5. Visual: ghost mode may set a short `c._fairGhost` for the car draw path
   (TLX/GLX already tint; keep it a flag, not a second mesh).

Desync rule: because each peer resolves independently, `ghost` / `reduced`
must not depend on agreeing who “caused” the hit for physics — only for
**score blame** (below), which uses local closing-speed sign and can diverge
slightly; show the local player's own score, not a host-authoritative board.

### B. Wire contract

| Channel | Payload | Notes |
|---|---|---|
| Lobby / settings (reliable) | `fairCollide: "full"\|"reduced"\|"ghost"` | Handshake-required; unknown → `full` |
| Snapshot (20 Hz, unreliable) | **unchanged** 13-byte car | No mode bit per pose |
| Reliable event `FAIR_SCORE` (end of race or on retire) | `{ id, score01, inputs: {…} }` | Optional live HUD tick ≤ 1 Hz if wanted later |
| Reliable event `FAIR_HIT` (optional, ghost/reduced) | `{ id, other, closing, t }` | For incident list parity; cap rate |

Handshake: mixed builds that lack the settings key treat the room as `full`
(already the “unknown type dropped” pattern for snapshot type 2).

### C. Clean-racing score

A pure function `FairPlay.score(inputs) → { score01, grade, parts }` in
`js/<new>/race/fair-play.js` (IIFE, no DOM).

**Inputs** (all already on the local player car or coach insights, or cheap
counters added beside `hits`):

| Key | Source today | Weight (proposed) | Direction |
|---|---|---:|---|
| `hits` | `collideFx` / car field | 0.28 | more → worse |
| `hitSevSum` | sum of impact scalars | 0.18 | more → worse |
| `wallHits` | wall model | 0.12 | more → worse |
| `cuts` / track-limits | race control | 0.14 | more → worse |
| `penaltyS` | sporting regs | 0.14 | more → worse |
| `ghostOverlaps` | fair-play soft events (new) | 0.08 | more → worse (ghost mode only) |
| `cleanLaps` | laps with none of the above | 0.06 | more → better |

Start at `1.0`, subtract weighted saturated terms (same shape as
`craftScore`), clamp to `[0,1]`. Map to a letter or percent for the sheet.

**Do not** silently alias career `craft` — online score should stay readable
when career is off, and ghost overlaps have no craft analogue.

### D. Results readout

- `js/ui/results-sheet.js`: when `G.netPlay && fairCollide !== "full"` (or
  always in friend races once shipped), add a `res-personal` row
  `CLEAN RACING · 87% (A−)` beside the existing incidents card (~L322).
- Optional: one line in the share text envelope later (out of scope unless
  share-cards asks for it).

## Build slices (proposed PRs)

| # | Slice | Files (proposed / existing) | Unit tests |
|---|---|---|---|
| 0 | This plan + parent link | `docs/plans/…` | docs-integrity |
| 1 | `FairPlay` pure score + mode table | `js/<new>/race/fair-play.js`, `tools/manifest.cjs`, gen shell | `tests/unit/<new>/fair-play-score.test.mjs` — golden vectors for weights; mode enum freeze |
| 2 | Lobby setting + handshake default | `js/net/lobby.js` / `lobby-codes.js` / session settings sync only | `tests/unit/<new>/net-fair-collide-settings.test.mjs` |
| 3 | Collide response gate | `js/physics/collide.js` (thin hook), `fair-play.js` | `tests/unit/<new>/fair-play-collide.test.mjs` — ghost skips separation; reduced caps scrub; AI pair unchanged |
| 4 | Results row + optional `FAIR_SCORE` event | `js/ui/results-sheet.js`, `js/net/netplay.js` event bind | unit DOM-free builder test + existing net-session patterns |

Browser: one netplay smoke only if slice 3+4 need it (`pick-tests`); prefer
unit/VM. **Note:** a concurrent hunter owns broad `js/net/**` edits — fair-play
build slices must take only the listed surfaces and merge origin if that PR
lands first.

## Risks

- **Feel:** `reduced` that still shoves the car will get the same complaints as
  F1 25; bias toward ghost for the first shippable default in friend lobbies,
  keep `full` as the sim default.
- **Score farming:** sitting in ghost overlaps to block without damage — the
  `ghostOverlaps` term and a short non-scoreable pit/grid window mitigate.
- **Desync optics:** two players may disagree slightly on who “hit”; show
  **your** score only in v1.
- **Ratchets / game.js:** no growth in `js/game.js`; collide hook must stay a
  few lines or move the gate entirely into `fair-play.js` called from collide.

## Open questions for the owner

1. Default friend-lobby mode: `ghost` or `reduced`?
2. Should offline quick race expose the same modes, or online-only?
3. Letter grade vs percent vs both on the results sheet?

## Done when

- [x] Confirmed nothing exists in `js/net` / `js/race` for fair-play.
- [x] Plan covers collision resolution per peer, wire, score inputs/weights,
      results readout, and unit-test file list.
- [ ] Build slices (out of scope for this docs PR).
