# Tyre severity authoring — 2026-09-30

Companion to the strategy/career-depth workstream (slice A) and
`docs/research/TYRE-STRATEGY-DESIGN.md` §5.5.

## Method

`tyreSeverity` is **surface / ambient / energy the layout cannot know**. Layout
work already emerges from the force-based load model; do not double-count
Pirelli 1–5 “track energy” grades (those are mostly cornering load).

Normalisation for measured circuit rates stays the Phase-5 rule: divide by the
seven-circuit 2026 mean **0.0493 s/lap**, clamp to **[0.4, 2.0]**.

Wear-OFF discipline is unchanged: `TyreModel` `LEVELS.off === 0` returns identity
grip/traction; characterization fixtures pin OFF. Authoring severity does not
alter that path.

## Anchors (unchanged)

| id | severity | source rate |
|---|---|---|
| redbull | 1.97 | Austria 0.097 |
| miami | 1.22 | Miami 0.060 |
| monaco | 1.01 | Monaco 0.050 |
| silverstone | 0.89 | Britain 0.044 |
| suzuka | 0.85 | Japan 0.042 |
| albert_park | 0.61 | Australia 0.030 |
| shanghai | 0.45 | China 0.022 |

Source: [F1 Chronicle 2026 tyre degradation](https://f1chronicle.com/2026-f1-tyre-degradation-data/).

## A1 — calendar / sourced (this PR)

| id | severity | evidence |
|---|---|---|
| catalunya | 2.00 | Softs **0.247 s/lap** vs era soft avg 0.113; heaviest 2026; “roughly double the next”; clamped ([half-season review](https://f1chronicle.com/f1-just-published-its-half-year-numbers-here-are-the-ones-it-didnt/)) |
| montreal | 0.40 | Evolution-dominated; measured slope ≈ flat / invisible deg (Chronicle) — model floor |
| hungaroring | 0.77 | Softs **0.038 s/lap** clean stint (Chronicle) ÷ 0.0493 |
| bahrain | 1.55 | Isola: Sakhir “most abrasive of the whole championship” ([GPblog / Pirelli](https://www.gpblog.com/en/news/tyre-degradation-analysis-from-bahrain-2023.html)); banded between Miami 1.22 and Austria 1.97 |
| monza | 0.55 | Pirelli Monza preview: degradation “rather limited”, one-stop default ([press.pirelli.com](https://press.pirelli.com/excitement-in-prospect-at-monza/)) |
| qatar | 1.60 | Hardest C1–C3 package; “one of the toughest” on tyres ([compound announcement](https://scuderiafans.com/pirelli-reveals-all-tire-compounds-for-second-half-of-the-2025-f1-season-many-changes-ahead/)) |
| singapore | 1.15 | Thermal stress is the main deg cause despite smooth asphalt ([Pirelli Singapore](https://press.pirelli.com/managing-the-heat-under-the-lights-in-singapore/)) |
| jeddah | 0.90 | Fresh street surface vs Bahrain abrasive (Isola contrast in same GPblog piece) |

Authored count after A1: **15 / 52** (7 anchors + 8).

## Deferred (A2)

Remaining circuits stay at default **1.0** (`TyreModel` `SEVERITY_DEFAULT`) until
a measured rate or a surface-class proxy with a cited source is written.
**1.0 is the calendar-neutral placeholder** — do not invent per-track guesses
in the model. Candidates: spa (resurfaced; thermal vs abrasion mix), zandvoort,
cota, mexico, interlagos, baku, vegas, abudhabi, imola, paul_ricard, and all
historic / classic-only layouts.
