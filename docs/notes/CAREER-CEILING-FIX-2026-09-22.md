# The career progression ceiling — measured, and how to fix it

Follow-up to `CAREER-BRAINSTORM-2026-09-21.md` §3, which called this the one
real defect in career mode but asserted it from reading the code. This measures
it, and one of the measurements contradicts the brainstorm. Nothing here is
built yet.

## 1. What I measured

**The whole catalog is NOT solved early** — the brainstorm implied otherwise.
`tools/car/career-economy.mjs --years 6` over six seasons:

```
catalog: 271 priced options · research multiplier 3x
owning the WHOLE catalog costs 88,485 cr
six seasons earn 36,744 (cadillac) – 70,946 (MY TEAM) cr
= 41.5%–80.2% of the catalog, 1.2–4.7 re-specs a season
```

The tool's own reading calls 2–4 re-specs a season healthy. The economy is fine.

**But you never need the whole catalog — you need twelve parts.** The ceiling is
the fitted cap, and a probe over every real team (`Parts.getMods` / `getCost`
against a greedy best-build under each team's cap) gives the number that matters:

| | |
|---|---|
| `Career.budgetCap()` | **2105 cr** — a hard constant derived from the catalog |
| research for an optimal capped build | ~18,900–22,800 cr |
| the full budget ladder | 16,500 cr (2500 + 5000 + 9000) |
| income | ~6,100–8,100 cr a season |
| **seasons until the car is finished** | **2.6 – 3.7** |

A career is unbounded (`career.year++`, no cap). The car is finished before
season four. After that there is no development decision left in the mode.

**And a second defect the brainstorm missed entirely: at the cap, the teams
converge.** Six of eleven — mercedes, ferrari, mclaren, redbull, astonmartin,
cadillac — all reach `budgetCap` and land on materially the same optimal build:

```
YOU at cap:  0.88 / 2.30 / 3.69 / 2.10      (mercedes)
             0.89 / 2.30 / 3.69 / 2.11      (ferrari)
             0.88 / 2.32 / 3.72 / 2.11      (mclaren)
             0.88 / 2.30 / 3.69 / 2.09      (redbull)
```

Only the low-works teams stay differentiated (haas capped at 808, williams 1080,
alpine 1456) — and those are the seats you leave. So once you are near the top,
**which seat you hold stops changing your car**, which quietly guts the contract
ladder that the rest of career mode is built around. Two progressions terminate,
not one.

**AI cars never leave their factory build.** `js/game.js:1871` resolves every AI
from `Parts.getFactorySetup(team)`; only the player and the MY TEAM mate read
`getTeamParts()`. `rolloverTeams()` moves nothing but `tdev`, ±8 stat points at
`TDEV_TO_PACE = 0.0025` (±2 % pace), halved every winter toward the tier
baseline.

## 2. Two of the three cures I proposed are wrong

Worth recording, because one of them is a trap I would have walked into.

**Inverse-scaled research income does not fix a terminating curve.** It moves the
terminus. Measured at 2.6–3.7 seasons, halving income buys season seven and the
mode is in exactly the same place. Reject.

**Regulation resets that de-own the player's parts are a punishment, not a
reset.** This is the trap. Because the AI is static, anything that removes only
the player's parts leaves them *worse* than a grid that lost nothing — the
player pays for a rule change nobody else obeys. Any reset has to be
**symmetric** or it is a tax with a story attached.

That leaves the third cure, which needs the symmetry the first two lack.

## 3. The fix: regulations as a legality filter, applied grid-wide

**The mechanism already exists.** `Parts._resolve()` (parts.js:642) calls
`isOptionAvailable(opt, team)` on every category of every resolution and falls
back to `DEFAULTS` when it returns false — that is how supplier locks already
work. And `resolveSetup()` is the single path for **both** the player's career
build and every AI factory build.

So a regulation is: a set of option ids that `isOptionAvailable()` rejects for a
period. Nothing else has to change for it to reach the whole grid.

What that buys, all of it falling out of the existing fallback:

- **Symmetric by construction.** Every AI factory preset re-resolves through the
  same filter. The rule change is not something done to the player.
- **Non-destructive.** `career.owned` is untouched — you keep everything you
  researched, it is simply not legal this era, and it comes back when the era
  lapses. The "ownership is permanent" contract the whole economy rests on
  survives, which the de-owning version would have broken.
- **Development re-opens.** A different legal set makes a different build optimal
  under the cap, so seasons 4+ have research in them again.
- **Convergence stops being permanent.** §1's second defect recurs only until the
  next era.

### The evidence it works

Modelling one era — premium `engine + aero + floor` options illegal grid-wide,
resolved exactly as `_resolve()`'s fallback would:

```
 4 of 11 grid slots change hands on the AI side alone

 mclaren      7.82 -> 6.37     works 2000 -> 1470
 ferrari      7.26 -> 5.90           1830 -> 1250
 astonmartin  6.82 -> 5.52           1740 -> 1245
 haas         4.39 -> 4.44            505 ->  435
 williams     4.28 -> 4.32            675 ->  550
```

The field **compresses**: spread 3.54 → 2.05, a 42 % narrowing, because a
backmarker's preset was barely using the premium options and a front-runner's
was built on them. Two backmarkers come out marginally *ahead*. That is a
pecking-order shake-up rather than a flat nerf, and it is the release valve F1 25
players say their game lost.

A third effect, free: `budgetAt(lvl) = worksCost(team) × BUDGET_MULT[lvl]`, and
works costs fall grid-wide under an era (2000 → 1470 for mclaren). **The fitted
cap is regulation-sensitive without writing a line for it** — the ceiling itself
moves rather than standing still.

### Two caches that must be invalidated, or the era is a no-op

Both found by reading, and both would ship silently broken:

1. **`Parts.factoryCache`** (parts.js:689) is keyed `${team.id}|${team.engine}`.
   No era in the key, so every AI would keep racing its pre-regulation build —
   the exact asymmetry §2 says makes this a punishment. The key needs the era.
2. **`Career._budgetCap`** (career.js:440) memoises "dearest option per category,
   summed, minus the dearest single one" on first call. A regulation changes
   which options are legal, so the cap would be computed from parts nobody may
   fit.

No hot-path concern: every `resolveSetup` call site (game.js 1694, 1780, 1871,
1918) is grid-build or setup time. The "an AI reads aeroLoad continuously"
comment at 1918 is about the stored scalar, not the resolve.

## 4. What it costs

Logic only. No new screen, and the UI ratchets (`cssClasses` 566/566,
`shellNodes` 1695/1695) leave no room for one — an era announcement rides the
offers sheet and the hub card that already exist.

| piece | where | size |
|---|---|---|
| era table (which ids, how long, what it is called) | a new `regulations` module under `js/career/` | data |
| the predicate | `isOptionAvailable()` + era in `factoryCache` key | small |
| era advance + `_budgetCap` invalidation | `rollover()` | small |
| surfacing (one line on the hub, one on the offers sheet) | `career-ui.js` | small |
| tests | `career-settle` + a new node test | — |

New module rather than growth in `career.js` (1188 L) — the commit hook absorbs
only 40 lines, and the lockstep is IIFE + `tools/manifest.cjs` + `gen-shell`.

## 5. The decision this needs

One real question, and it is a product one:

**How hard should an era hit?** The modelled 3-of-12 categories costs a
front-runner ~19 % of its car and hands two backmarkers a small gain. Softer (1–2
categories) is a nudge; harder (5+) is a reset that will annoy a player who just
finished their build. My recommendation is **3 categories every 4 seasons**,
which lands the first era after the car is finished (2.6–3.7 seasons) rather than
during the climb — but the cadence is yours.

Two smaller ones, both answerable later:
- Should an era be **visible in advance** (announced a season ahead, so research
  can be aimed at it) or land at the winter? Announcing it is more interesting
  and costs one more field.
- Does the **convergence** defect (§1) deserve its own fix — a per-team
  `budgetCap` so the seat ladder keeps meaning something at the top — or does the
  era churn make it tolerable?
