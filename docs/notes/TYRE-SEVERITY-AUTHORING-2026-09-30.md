# Tyre severity authoring — 2026-09-30

Companion to the strategy/career-depth workstream (slice A, #1562) and
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

Fleet mean of all **52** authored values after slice A (2026-10-18): **≈ 1.04**
(slightly above the 1.0 neutral default — expected while the seven-anchor sample
skews high).

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

## A1 — calendar / sourced (prior PR)

| id | severity | evidence |
|---|---|---|
| catalunya | 2.00 | Softs **0.247 s/lap** vs era soft avg 0.113; heaviest 2026; clamped ([half-season review](https://f1chronicle.com/f1-just-published-its-half-year-numbers-here-are-the-ones-it-didnt/)) |
| montreal | 0.40 | Evolution-dominated; measured slope ≈ flat / invisible deg (Chronicle) — model floor |
| hungaroring | 0.77 | Softs **0.038 s/lap** clean stint (Chronicle) ÷ 0.0493 |
| bahrain | 1.55 | Isola: Sakhir “most abrasive of the whole championship” ([GPblog / Pirelli](https://www.gpblog.com/en/news/tyre-degradation-analysis-from-bahrain-2023.html)); banded between Miami 1.22 and Austria 1.97 |
| monza | 0.55 | Pirelli Monza preview: degradation “rather limited”, one-stop default ([press.pirelli.com](https://press.pirelli.com/excitement-in-prospect-at-monza/)) |
| qatar | 1.60 | Hardest C1–C3 package; “one of the toughest” on tyres ([compound announcement](https://scuderiafans.com/pirelli-reveals-all-tire-compounds-for-second-half-of-the-2025-f1-season-many-changes-ahead/)) |
| singapore | 1.15 | Thermal stress is the main deg cause despite smooth asphalt ([Pirelli Singapore](https://press.pirelli.com/managing-the-heat-under-the-lights-in-singapore/)) |
| jeddah | 0.90 | Fresh street surface vs Bahrain abrasive (Isola contrast in same GPblog piece) |

## A2 — remaining calendar + legacy (#1562, 2026-10-18)

### 2026 REAL calendar (10 circuits that lacked severity)

| id | severity | evidence |
|---|---|---|
| spa | 0.85 | Hard **0.042 s/lap** at Spa 2026 ([Belgian GP telemetry](https://f1chronicle.com/belgian-grand-prix-2026-telemetry-deep-dive/)) ÷ 0.0493 |
| zandvoort | 1.05 | Banking vertical load; no 2026 Chronicle rate — band ~1.0 (Pirelli Dutch GP energy notes) |
| madrid | 1.18 | New Madring asphalt; street-circuit band 1.1–1.25 until a measured rate exists |
| baku | 0.82 | Long straights / low lateral; one-stop Baku band below Monaco 1.01 |
| sepang | 1.48 | Hot abrasive permanent; historic Sepang ≈ Sakhir (Pirelli) — near Bahrain 1.55 |
| cota | 1.12 | Bumpy COTA surface + thermal; between Miami 1.22 and neutral |
| mexico | 1.08 | Altitude rear-limited; moderate-high (Pirelli Mexico previews) |
| interlagos | 0.92 | Compact São Paulo; moderate historic deg band |
| vegas | 1.05 | Street thermal; below Singapore 1.15 (Pirelli Las Vegas heat notes) |
| abudhabi | 0.88 | Smooth Yas Marina one-stop band; near Silverstone cluster |

### Legacy / classic-only (27 circuits)

Proxy bands only where no published 2026 rate exists — **permanent low** (0.68–0.90),
**neutral** (0.95–1.05), **abrasive / hot** (1.10–1.42). See inline comments in
each `js/circuits/<id>.js` file.

| id | severity | band |
|---|---|---|
| buddh | 1.42 | hot abrasive |
| korea | 1.38 | hot abrasive |
| paul_ricard | 1.28 | hot abrasive |
| portimao | 1.25 | abrasive permanent |
| istanbul | 1.22 | high lateral |
| mugello | 1.18 | high-speed permanent |
| jacarepagua | 1.12 | abrasive permanent |
| brands_hatch | 1.10 | short abrasive UK |
| kyalami | 1.05 | moderate permanent |
| watkins_glen, mosport, zolder, imola | 1.02 | near-neutral |
| nurburgring, donington, mont_tremblant, fuji | 1.00 | calendar-neutral proxy |
| buenos_aires, estoril | 0.98 | near-neutral |
| dijon | 0.95 | low-moderate historic |
| magny_cours | 0.88 | smooth permanent |
| sochi | 0.86 | smooth asphalt |
| okayama | 0.84 | smooth permanent |
| jerez | 0.82 | smooth test track |
| anderstorp | 0.90 | low-moderate |
| hockenheim | 0.72 | long-straight low energy |
| indianapolis | 0.68 | low-deg road course (above model floor 0.4) |

Authored count: **52 / 52**. Unit gate: `tests/unit/tyre-model.test.mjs` (“every
circuit def declares tyreSeverity…”).
