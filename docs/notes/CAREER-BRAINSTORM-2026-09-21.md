# Career mode — brainstorm (2026-09-21)

Companion to `PRODUCT-BRAINSTORM-2026-09-16.md`, which was product-wide and
touched career exactly twice. Same rules: a static site with no backend, ranked
by impact × confidence ÷ cost, and a defect is separated from a feature with a
design question behind it.

Three research passes fed this: a full read of `js/career/` and `docs/CAREER.md`,
a survey of F1 24 / F1 25 / F1 Manager / Motorsport Manager mechanics and player
sentiment, and a survey of cheap career design (Retro Bowl, iGP Manager, New Star
Soccer, Football Manager, Quality-Based Narrative). Sources are in §7.

## 1. The budget line: rules are free, pixels are rationed

No career file is in `tests/data/ratchets.json`. Career *logic* has no size
ceiling at all. The tree ratchets are the binding constraint, and they bite on UI:

| metric | ceiling | slack |
|---|---|---|
| `cssClasses` | 566 | 5 |
| `shellNodes` | 1695 | 25 |
| `rawSpacing` | 301 | **0** |
| `rawColor` | 322 | **0** |
| `rawColorDistinct` | 178 | **0** |

The ratchet is two-sided — over the ceiling fails, and more than `slack` *under*
it also fails ("lower it"). At `slack: 0` the count must match **exactly**, so new
career UI must be built from existing tokens, with ~5 spare class names and ~25
spare shell nodes in the whole tree.

**This should decide the order of work.** A proposal that adds a screen is
competing for 25 DOM nodes. A proposal that adds a line to the results-sheet
settlement block, or a card to the hub, costs almost nothing. Everything in §4 is
sorted with that in mind.

The other structural note: the commit hook absorbs ≤ 40 lines of growth, so
anything substantial lands as a new IIFE module (`js/career/<name>.js` +
`tools/manifest.cjs` + `node tools/gen/gen-shell.mjs`), not as growth inside
`career.js` (1188 L) or `career-ui.js` (1281 L).

## 2. What career already gets right — do not rebuild these

Career is not a thin mode. 3,582 lines across six files, 101 browser tests and 44
node tests. Two things in particular are better than the shipping AAA games:

- **Objectives are aggregate, not instantaneous.** The single sharpest player
  criticism of F1 25's in-race challenges is that a "stay ahead for 4 laps" brief
  fails on a momentary pass or a pit entry. Apex 26 resolves briefs in
  `settleRound()` off `career.results`, and `objectiveLocked()` closes the pick
  once quali has run so you cannot choose with the answer in hand. This is the
  correct design and it is already shipped.
- **Save durability.** Save loss is the largest career-killer in the review
  corpus (21–33 % of substantive Steam reviews across four titles). Apex 26 has
  six slots in two sets, an IndexedDB mirror, a versioned migration ladder, and
  cross-tab conflict detection that refuses to overwrite a newer foreign save.
  That is better than the games being complained about. The one hole is §4.4.

Also already present and worth not re-proposing: multi-year contracts with a
market-value ladder, a per-round brief that is a *choice of three*, race-craft
scoring that pays reputation but never money, winter driver drift, a silly
season, sponsors, a facility ladder, and a derived budget cap.

## 3. THE DEFECT: the car stops developing, and then you always win

This is the only item here that is a defect rather than a design question, and it
is the reason to do any of this.

**Measured from the source:**

- Parts are **flat**. `grep prereq|requires|unlock js/car/parts.js` → zero. Any
  option is researchable at any time; ownership is permanent (`career.owned`).
- The budget ladder is **four levels and terminates**. `budgetUpgradeCost()`
  returns `null` once a rung would raise nothing, and the code's own comment
  measures the endpoint: "Ferrari 1830 / McLaren 2000 against a 2105 cap".
- **AI teams never develop parts.** `rolloverTeams()` moves only `career.tdev`,
  clamped to ±8 stat points — `TDEV_TO_PACE = 0.0025`, so ±2 % pace — and then
  *halves it every winter* back toward the fixed tier baseline.
- **There are no regulations.** `grep -rni "regulation" js/` has no career hits.

So the player's car climbs monotonically to a permanent ceiling while the AI is
anchored to its tier with a ±2 % wobble that decays. Past roughly season two or
three there is no development decision left and no mechanism that can ever take
the advantage back.

This is exactly the failure players describe in F1 25 — five separate EA forum
threads converge on "R&D is broken … the grid order freezes … regulation changes
no longer reset anything" — but mirrored. There the curve terminates *below* the
win condition ("a fully maxed My Team car is still third-slowest"). Here it
terminates *above* it. Same root cause: **purely vertical progression with no
reset.** The design literature is blunt that vertical progression eventually
stops meaning anything and horizontal progression is what lasts.

Three candidate cures, cheapest first. They compose.

1. **Regulation resets.** Every N seasons, a rules change de-owns a slice of
   `career.owned` in affected categories. Data table + a loop in `rollover()`.
   This is the release valve every one of these games has and Apex 26 lacks.
2. **AI teams develop parts too**, so the top shelf is a moving target rather
   than a finish line.
3. **Inverse-scaled research income** — research cost or credit income scaled by
   constructors' position. This is F1 25's actual mechanic and it keeps the
   midfield alive without rubber-banding the *racing*, which players hate.

## 4. The list, ranked

Score is impact × confidence ÷ cost. S is a session or less, M a few, L more.
"UI" is the scarce resource from §1.

| # | Idea | Cost | UI | Score | What it changes |
|---|---|---|---|---|---|
| 1 | **Regulation resets** (§3) | M | none | 4.5 | The only fix for the one real defect. Pure rollover logic + a data table |
| 2 | **Player-authored season target** | S | 1 row | 4.0 | `deal.goal` already exists with exactly one type (`champPos`), set *by the game*. Let the player commit to a finishing position at signing, with reward and penalty both scaling. A difficulty dial disguised as roleplay — and it attacks the "AI difficulty is never right" complaint from the other end |
| 3 | **Career save export / import** | S | 1 button | 3.5 | `settings-export.js` explicitly EXCLUDES saves. Given §2, this is the last hole in an otherwise best-in-class save layer, against the single largest cause of abandoned careers |
| 4 | **Constructors' prize money** | S | none | 3.0 | `prizeFor(pos)` pays on *your* finish only. The constructors' championship currently has no economic consequence at all |
| 5 | **Rivals, derived from results** | S–M | 2 lines | 3.0 | Every input already exists — `career.results`, `career.moves`, per-driver ratings. A rival is an id, an interaction score, and one line pre-race and one post-race on surfaces that already exist. See the caveat below |
| 6 | **More goal types** | S | none | 2.5 | One type today. Wins, podiums, beat-your-team-mate, constructors' position — same machinery, four more rows |
| 7 | **Records book** | M | 1 tab | 2.5 | `career.history` caps at 10 seasons and stores only totals. Best result per circuit, streaks, firsts, rivals beaten. Pure serialisation, no simulation — and it is the strongest known driver of "I don't want to delete this save" |
| 8 | **Sponsor risk tiers** | S | 1 row | 2.0 | Sponsors exist (MY TEAM). Offer three briefs at different risk/pay instead of one, so a P9 finish can be tense |
| 9 | **Per-track AI difficulty calibration** | M | none | 2.0 | `career.results` already holds the per-round history to auto-calibrate from the player's own delta at each circuit. No shipping F1 game does this well, and uncalibrated per-track pace is career-fatal |
| 10 | **Weekend inbox (QBN storylets)** | M–L | 1 panel | 1.5 | Highest ceiling, highest risk — see §6. Gated text cards with real mechanical effects, one per weekend, never blocking |
| 11 | Driver dealbreakers (named, visible contract expectations that scale with rating) | M | 1 row | 1.5 | Makes MY TEAM's second seat a relationship rather than a slot |
| 12 | Facility cadence — cost = target level, one upgrade per round | S | none | 1.2 | Paces the economy by arithmetic instead of balance passes. Retro Bowl's trick |

**The caveat on #5**, and it is load-bearing: `AI-PERSONALITY-PLAN-2026-09-16.md`
§10 records that the mistake model ships at roughly **one mistake per car per 75
laps**, against a default race of **three laps**. AI personality is currently
unobservable in normal play. So a rivalry system must be built from *results* —
positions, gaps, who took what from whom in the standings — and not from on-track
behaviour, until that gate is met.

## 5. The through-line

Items 1, 2 and 5 are one idea in three parts: **give the career something that
can take the advantage back.** Today a career has one arc (climb) and no second
act. A regulation reset supplies jeopardy from the rules, a player-authored
target supplies it from ambition, and a rival supplies it from a person. None of
the three needs a screen, and all three are logic against state that already
exists.

Everything else on the list is polish on an already-good mode.

## 6. Recommended against

- **Frequent mandatory text interactions.** Football Manager's press conferences
  are the most-criticised system in that game — "extremely repetitive", "such
  little effect it doesn't really matter", and exhausting in volume. If #10 is
  built: at most one per weekend, never blocking, always with a visible
  mechanical consequence, and never with a single right answer. If it cannot meet
  those four, it is filler and should not ship.
- **Anything that needs a new screen**, until the CSS ratchets have room. §1 is
  not a formality — `rawColor` at `slack: 0` fails the gate on one new literal.
- **Hidden progression.** Board-expectation opacity is the second-most-criticised
  thing in FM. If #2 ships, the target belongs on the hub in one sentence with
  progress against it.
- **Deterministic tyre degradation**, if strategy ever becomes a career decision.
  Motorsport Manager's sharpest criticism is that fixed per-compound wear "makes
  this a maths game" — players solve it once and strategy becomes a lookup table.

## 7. Decisions this needs from the owner

1. **Is the §3 defect worth fixing, and by which of the three cures?** Regulation
   resets change what "owning a part" means, which is a product decision, not a
   bug fix.
2. **Should a career be finishable?** It is currently unbounded — `career.year++`
   with no cap, archive capped at 10 seasons. A bounded arc (3–5 seasons to a
   "legend" outcome) is what the short-session literature favours, and six slots
   make completed careers a natural collection. This is a genuine fork.
3. **Is a narrative layer (#10) wanted at all**, given §6? It has the highest
   ceiling here and the worst precedent.
4. **How much of the 25-node shell budget may career spend**, against the rest of
   the game's needs?

## 8. Sources

Research was run as three parallel passes; full source lists are in the session
transcript. Load-bearing citations:

- F1 25 R&D ceiling: five EA forum threads (`forums.ea.com`, Cloudflare-blocked
  to direct fetch, read via search summaries — titles and URLs confirmed, exact
  wording not verbatim-verified).
- Player sentiment: ~3,200 Steam reviews pulled from the Steam review API across
  F1 24, F1 25, F1 Manager 24 and Motorsport Manager. **Reddit was unreachable**
  (blocked to the crawler, 403/429 to curl), so no claim here rests on it.
- Motorsport Manager mechanics: community guides, not developer documentation.
- Quality-Based Narrative: Emily Short, "Beyond Branching"; Failbetter StoryNexus
  dev diary.
- Progression design: Game Developer on short-vs-long-term progression and on
  first-session length; Mobile Free To Play on session design.
- Retro Bowl economy, iGP Manager levels/design points, CFB26 dealbreakers and
  history hub, Nemesis System (whose own stated inspiration was sports
  commentary).

Nothing in this file has been built. Every item is a proposal.
