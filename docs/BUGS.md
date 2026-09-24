# Apex 26 — verified bugs (2026-09-24 hunt)

Findings from a read-of-code + targeted-test architecture pass on tip of
`claude/f1-game-project-26h3ng`. Only defects defended from current source are
listed. Speculative rewrites are out of scope. Historical fixed defects live in
[notes/DEFECT-LEDGER.md](notes/DEFECT-LEDGER.md).

Contributor map: [ARCHITECTURE-MAP.md](ARCHITECTURE-MAP.md). Module contract:
[ARCHITECTURE.md](ARCHITECTURE.md).

**Severity key:** critical = data loss / unplayable for many; high = common path
broken; medium = wrong outcome on a reachable path; low = cosmetic or rare.

---

## Fixed in this PR

### B1 — Wheel-wizard axis capture survived settings close / resume
**Severity:** high · **Status:** FIXED here

**Where:** `js/ui/key-binds.js` (`disarmAll`), `js/game.js` (`setPaused`)

**What:** `SET UP A WHEEL` calls `Input.beginAxisCapture`. While armed,
`pollGamepad` zeroes throttle/brake/steer every frame. The 2026-09-22 rebind fix
taught `disarmAll` to clear key/pad *button* slots, but not the wizard. Resume
paths (`HUD OFF`, `RECALIBRATE TILT`, and any `setPaused(false)`) hid
`#pmsettings` without calling `closeSettings()`, so an armed pad-capture slot
could also survive.

**Repro (before):** Pause → Settings → CONTROLS → SET UP A WHEEL → Esc/Back or
HUD OFF → resume. Stick/triggers do nothing until CANCEL (or forever if the
button is gone).

**Fix:** `disarmAll` aborts the wizard (`beginAxisCapture(null)`). `setPaused(false)`
calls `closeSettings()` so every resume path disarms.

**Test:** `tests/unit/key-binds.test.mjs` — disarm clears axis capture.

### B2 — Time trial still ran the +5 s track-limits ladder
**Severity:** low · **Status:** FIXED here (was OPEN in defect ledger)

**Where:** `js/game.js` (~4786)

**What:** TT invalidates the lap on the first counted cut (`incidentInvalidLap`),
but the fourth cut still did `penalty += 5` and announced `+5s TRACK LIMITS
PENALTY` in a mode with no race classification.

**Repro (before):** Time Trial → four counted cuts → false +5s banner.

**Fix:** Gate the ladder on `!isTimeTrial()`.

**Test:** `tests/unit/tt-lap-validity-vm.test.mjs` — fourth cut leaves `penalty` at 0.

---

## Open (verified, not fixed here)

### B3 — Lobby READY is not host-relayed (3–4 player guest UI lies)
**Severity:** medium · **Confidence:** high

**Where:** `js/net/lobby.js` READY handler (~443) vs HELLO relay (~426)

**What:** HELLO is relayed with `from` / `rank` so guests learn each other.
READY updates `_ready` keyed only by the direct connection `id`. On a guest that
is always the host peer, other guests' READY never arrives — their row stays
"choosing". Host START still works (`peersReady` on the host is correct).

**Repro:** Host + 2 guests; guest B taps READY; guest A's row for B stays
"choosing".

**Fix direction:** Mirror HELLO — host relays `{ ready, from }`; guests key
`_ready` by `from || id`.

### B4 — Championship points / FL / countback for cars that never finished
**Severity:** medium · **Confidence:** high (behavior); medium (design intent)

**Where:** `js/career/season-cal.js` `award()` (~317); feed `js/game.js` `endRace`
(`order = fin.concat(run, out)`)

**What:** `award()` zeros only `c.retired`. Still-running cars in `run` receive
table points, finishes histogram entries, and can take the fastest-lap bonus.
Reachable when the hard time cap ends a race (`raceT > 360 * lapsTarget`) or
when humans finish and the 2.2 s end delay cuts off backmarkers far from the line.

**Fix direction:** Require `c.finished` (or an explicit classified flag) for
points, finishes countback, and FL eligibility. Keep retirements at 0. Confirm
product intent for time-cap classification before changing standings.

### B5 — Cross-tab + quota can overwrite a newer mirror-only save
**Severity:** high · **Confidence:** medium-high

**Where:** `js/core/store.js` IDB flush (~275)

**What:** Single-tab boot/re-save of a quota-refused key was fixed (2026-09-22,
`lsOk`). Cross-tab remains: a failed `setItem` does not fire `storage`, so Tab B
never invalidates. Tab B's later successful save can queue `lsOk:true` with the
old value and replace Tab A's newer `lsOk:false` IDB row — the only durable copy
of the new save.

**Repro:** Two tabs; fill quota; save career in A (disk fails, mirror has V2);
act/save in B still on V1 → mirror becomes V1.

**Fix direction:** Refuse replacing `lsOk:false` with older `lsOk:true`; or stamp
generations / `BroadcastChannel` so peers learn about mirror-only writes.

### B6 — AI launch / tyre-class / mistake hashes omit race + season dimensions
**Severity:** medium (launch/tyre) / low–medium (mistakes) · **Confidence:** high

**Where:** `js/game.js` launch plan (~2174); mistake roll (~4899);
`js/race/weather-arc.js` `planFor` (~84)

**What:** Reliability and qualifying luck mix year via `Career.seasonSeed()` and
include round. Launch/`phaseRoll`/`tyreClass` hash only `simSeed + slot + skill`.
Mistake rolls key `simSeed + gridPos + lap + corner` with no round/season.
Changeable weather in career hashes session `simSeed` / `raceRound`, not
`seasonSeed()`. Stable grids replay the same launch/compound and corner mistakes
every race (and across career years while `simSeed` stays default).

**Fix direction:** Include championship draw round and, in career,
`Career.seasonSeed()` — same contract as `armReliability`.

### B7 — Settings import: `steerMode` (and peers) lack `oneOf`
**Severity:** medium · **Confidence:** high (malicious / hand-edited file)

**Where:** `js/ui/settings-export.js` SPEC; `js/game.js` / `js/input/input.js`
steer mode writers

**What:** `difficulty` is allowlisted; `steerMode` is not. `Input.setSteerMode`
coerces unknowns to `"tilt"`, but game.js can keep the raw string for HUD /
touch / calib, so UI and Input disagree after LOAD SETTINGS with
`"steerMode":"nope"`.

**Fix direction:** Add `oneOf: ["tilt","buttons","touch"]` (and peers such as
`hudProfile` / `drivingLine`); validate in game.js `setSteerMode` too.

### B8 — Garage `customLogo` import accepts any string
**Severity:** low · **Confidence:** medium

**Where:** `js/ui/settings-export.js`; sink `js/car/liverytex.js` (`img.src = src`)

**What:** Liveries/parts are shape-checked; `customLogo` only requires
`typeof === "string"`. No `data:image/...` prefix or size cap → storage abuse
via a huge or non-image data URL. XSS via `<img>` is unlikely.

**Fix direction:** Require `^data:image/(png|jpeg|webp);base64,` and a max length
matching the upload canvas path.

---

## Deliberately not listed as defects

- Race-mode cut laps still set `c.best` / FL with +5 s pricing — product ladder,
  recorded in the defect ledger as a balance decision.
- Pit-lane lap setting FL — matches real F1; rejected as a defect.
- Prior 2026-09-22 FIXED batches (ARMED resend, LEFT relay, pose `presentedAt`,
  store boot `lsOk`, red-flag restart, finisher coast, lexical `window.X`) —
  re-checked against the tree; still fixed.

## How this file relates to the ledger

`docs/notes/DEFECT-LEDGER.md` is the long chronological register. This file is
the **current credible shortlist** from the 2026-09-24 architecture/bug-hunt
pass: fixed items above, open items B3–B8 for follow-up. Prefer linking here
from PRs; promote lasting open items into the ledger when a campaign owns them.
