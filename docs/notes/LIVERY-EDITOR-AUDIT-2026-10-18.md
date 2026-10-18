# Livery editor audit — 2026-10-18

Bryce's report: some garage livery controls grey out depending on others, and some do not appear to change any
colour. This note lists every control in the paint editor (`GARAGE → LIVERY → Create livery`, built by
`buildLiveryCreator` in `js/garage/setup-sheet.js` and regrouped by `js/garage/livery-design-editor.js`). For each one
it records what enables it, whether it changes the car, whether it persists, and whether it is consistent with the
other controls. The defects found are ranked at the end and fixed in the PRs listed there.

Base: `claude/f1-game-project-26h3ng` @ `f3b2d89d`. Open PRs #2749 (finishes) and #2752 (helmet) were not merged at
audit time and are not covered here.

## Method (measured)

- **Probe** — `scratch/livery-audit/probe.mjs` (regenerable, not committed). Boots the game at 852×393 with touch and
  `isMobile` (Bryce's phone shape) on TLX (`gfxBackend=three`), with GLX (`webgl2`) as the cross-check. It
  opens the editor for team index 2 (McLaren) and pauses rendering with `__apex.headless(true)`.
- **Changes render** — the probe rebuilds the draft from the editor's own DOM state, resolves it the way
  `resolveLivery` does (`Liveries.migratePaint`, then `Liveries.FIELDS`), and hashes two things for every
  control value: the real `Car3D.build` mesh (positions, vertex colours, surface ids) and the real
  `LiveryTex.buildAtlas` pixels. These are the only two inputs the renderers receive, so "no change in either" means
  "no change on screen" on every backend. Disabled controls are force-changed too, which checks that a grey-out is
  correct, not only that it is present.
- **Scenarios** — S0: a new draft on the team's own shape. S1: FIN SHAPE STANDARD, SPINE TOP CHECKERED (an adjustable
  two-colour pattern), DESIGN AREA WRAP, SPINE SIDE BAND, COVER BIND SADDLE WRAP. S2: S1 plus SPINE TOP CONTOURS (a line
  pattern), SPINE SIDE PLATE, TAIL STYLE NONE and FIN BADGE NUMBER.
- **Matrices** — every SPINE TOP id and every SPINE SIDE id against the three COVER BIND values; FIN HANDOFF against fin
  present/absent and TAIL FIN set/unset; HALO FINISH against HALO unset/grey/saturated; preview identity against
  saved identity for all 11 teams.
- **Persistence** (`scratch/livery-audit/persist.mjs`) — authors every control to a non-default value, then runs
  SAVE & FIT, `SettingsExport.collectGarage` → `applyGarage`, a page reload, and EDIT. It then reads the editor back.
- **TLX versus GLX** — the mesh and atlas are built on the CPU and are the same on every backend. The matrices run on
  GLX (`webgl2`) gave a result byte-identical to TLX. The full desktop GLX sweep did not finish: it stopped on a bug in
  the probe's own colour-restore step, not in the game, so desktop is covered only by those matrices. Screenshots are for
  visual sign-off only.

## Control table

Legend. **Enables**: what greys the control (— means it is always live). **Render**: values that changed the mesh or
atlas, out of the enabled values, per scenario S0 / S1 / S2 (D = disabled in that scenario). **Persists**: survives
SAVE & FIT, export/import, reload/EDIT, and garage → race. Every control passes this column (see below), so it is
omitted per row. **OK?**: the defect id, if there is one.

| Section | Control | Field | Enables | Render S0 / S1 / S2 | OK? |
|---|---|---|---|---|---|
| Colour palette | 9 palette buttons | c1, c2, patternTint, patternSecond | — | unit-tested (`livery-design.test.mjs`) | |
| Body | FINISH | finish | — | 8/8 · 8/8 · 8/8 | |
| Body | PRIMARY, ACCENT | c1, c2 | — | mesh+atlas | |
| Body | BODY STRIPE, NOSE STRIPE, NOSE CAP, SIDEPOD, LOWER, UPPER | stripe… | — | mesh | |
| Body | DETAIL | accent | — | mesh+atlas | |
| Body | SIDEPOD FINISH | podFinish | — | 8/9 (GLOSS = INHERIT while FINISH is GLOSS) | D9 |
| Body | BODY SPLIT | bodySplit | — | 1/1 | |
| Engine cover | ENGINE COVER | cover | — | mesh+atlas · mesh · mesh (a full-cover pattern hides the crown, as intended) | |
| Engine cover | COVER FINISH | coverFinish | — | 8/9 (as SIDEPOD FINISH) | D9 |
| Engine cover | SPINE HEIGHT, COVER VENTS | spineHeight, coverVents | — | all | |
| Spine top | SPINE TOP (40 designs) | spineLogo | per-pill: wordmark greys under SPONSORS CLEAN | 39/39 | |
| Spine top | DESIGN COLOUR | patternTint | an adjustable pattern | D · atlas · atlas | |
| Spine top | SECOND DESIGN COLOUR | patternSecond | a two-colour pattern | D · atlas · D | |
| Spine top | BAND | spineTint | a band-painting SPINE TOP | atlas · **D but paints** · **D but paints** | **D4** |
| Spine top | SADDLE | saddleTint | SADDLE top / SADDLE WRAP / shoulder side | D · atlas · atlas | |
| Spine top | SUN, 2ND BAND | sunTint, bandTint2 | WRAP / TRICOLOUR top | D (correct) | |
| Spine pattern | DESIGN AREA, WRAP SIDES | patternPlacement, patternSide | an adjustable pattern; SIDES also needs WRAP | D · all · all | |
| Spine pattern | WIDTH, REPEATS, OFFSET, TAPER, OPACITY, ROTATION, STRETCH | pattern* | an adjustable pattern (REPEATS: not ribbon/gradient/two-tone) | D · atlas · atlas | |
| Spine pattern | LINE WEIGHT | patternWeight | a stroked pattern | D · D · atlas | |
| Spine pattern | SWAP COLOURS / RESET SETTINGS | — | two-colour / any adjustable pattern | unit-tested | |
| Cover sides | SPINE SIDE (17) | spineSide | per-pill: wordmark/duo/title grey under CLEAN | 16/16 | |
| Cover sides | FLANK FILL, PLATE | sideTint, plateTint | a fill side / PLATE or TITLE | D/atlas as expected | |
| Cover sides | COVER BIND | coverBind | — | **SPINE ONLY 0/1** · 2/2 · 2/2 | **D5** |
| Cover sides | FIN HANDOFF | finHandoff | — | **CONTRAST 0/1** · 2/2 · 2/2 | **D6** |
| Wings | WING FLAPS | wingCarbon | — | 1/1 | |
| Wings | WINGS, REAR WING | wing, rearWing | flaps painted | mesh(+atlas) | |
| Wings | WING FINISH | wingFinish | — | 8/9 | D9 |
| Tail fin | FIN SHAPE | finShape | — | 4/4 | |
| Tail fin | TAIL FIN, TAIL GRAPHIC, TAIL STYLE, FIN BADGE | fin, finArt, finStyle, finBadge | a fin (GRAPHIC: also a motif or a number/code badge) | correct when greyed | |
| Tail fin | TAIL STYLE | finStyle | a fin | **CHEVRON 0/1 on McLaren** (TEAM is already chevron) | **D7** |
| Tail fin | FIN FINISH | finFinish | — | 8/9 | D9 |
| Team marks | mark colour rows (per team), OUTLINE | logo, logo2, logo3 | — | atlas | |
| Team marks | NUMBER FONT, SPONSORS | numFont, sponsors | — | all | |
| Cockpit | HALO | halo | — | mesh | |
| Cockpit | HALO FINISH | haloFinish | — | **0/9 · 0/9 · 0/9** | **D3** |
| Cockpit | MIRROR HOUSING, MIRROR FINISH, T-CAM | mirrorTint, mirrorFinish, tcam | — | all | |
| Wheels | RIM, CALIPER, SIDEWALL INK | rimTint, caliperTint, sidewallInk | — | mesh | |
| Review | UNDO, REDO, COMPARE ORIGINAL, NAME, SAVE & FIT, CANCEL | — | — | unit-tested; COMPARE shares D1 | D1 |
| Every greyed control | — | — | reason only in `title` | — | **D2, D8** |

**Persistence: every field passes.** 62 authored fields went through SAVE & FIT, then export/import with 0 lost and 0
changed, then reload and EDIT with 0 differences. `Liveries.FIELDS`, the custom-liveries `LIVERY_FIELDS` list and the
editor's `LIV_DRAFT_COLORS` + `LIV_DRAFT_PILLS` are the same set, so garage → race carries every field. The four
`FIELDS` keys the probe could not author are `logo2` (McLaren's mark has no second shape, so it has no row) and the three
helmet fields (no rows on this base; #2752 adds them). This passes today, but the margin is thin: see D10.

## Defects, ranked

| # | Rank | Defect | Evidence | Fix (PR) |
|---|---|---|---|---|
| D1 | High | **The garage preview is not the car you save.** The live preview resolves the draft as `id: "default"` (`livePreviewDraft`, setup-sheet.js), which `LiveryTex.markOnField` / `markBase` / `markPalette` treat as the team's own paint job and give the brand mark palette (Ferrari's yellow shield, for example). SAVE & FIT writes `id: "custom_…"`, so the marks re-colour from the paint as soon as you save. COMPARE ORIGINAL shares the same path. | Atlas pixels differ between preview and saved on 11 of 11 teams (2.3–5.6 % of the atlas: the crest, cover and fin marks). Screenshot pair, Ferrari phone TLX: yellow shield on the cover in the editor, white mark after SAVE. | Fix PR 2 |
| D2 | High | **A greyed control never says why on a phone.** The reason is only the row's `title` (hover tooltip), and the screen-reader description is the static hint, not the reason. On touch, a row just dims. | DOM: every dependency row and every pattern row; `title` is not exposed on touch. | Fix PR 1 |
| D3 | High | **HALO FINISH does nothing** unless HALO is set to a saturated colour. Car3D paints an unset or grey halo as bare metal, not paint (`haloS`, car3d.js), and finishes only remap paint vertices. There is no grey-out. | 0 of 9 values change the mesh with HALO unset or grey `[0.5,0.5,0.52]`; with `[0.9,0.2,0.5]`, MATTE and CHROME both change it. | Fix PR 1 (greyed with a reason) |
| D4 | Medium | **BAND is greyed while it paints.** Under COVER BIND SADDLE WRAP the saddle fill falls back to BAND (`saddleFill`), but `FILL_SURFACES.spineTint` has no `binds`, so the row greys whenever SPINE TOP is not a band design. | S1 and S2: disabled, but force-setting it changes the atlas. Under INDEPENDENT the same design gives no change (grey is correct there). | Fix PR 1 (rule lives in `LiveryTex.FILL_SURFACES`, LD's file: coordinated) |
| D5 | Medium | **COVER BIND SPINE ONLY changes only the CAP design.** It changes the atlas for 1 of 40 SPINE TOP ids and 0 of 17 SPINE SIDE ids, but it is never greyed. SADDLE WRAP is live for 35 of 40. | Bind × top/side matrix. | Fix PR 1 (pill greyed with a reason) |
| D6 | Low | **FIN HANDOFF CONTRAST needs a fin** (it derives the fin plate's colour), but it stays live with FIN SHAPE NONE. HARD CUT stays live correctly (it also stops the cover pattern at the tail). | S0 (no fin): CONTRAST 0/1; with a fin it acts. | Fix PR 1 |
| D7 | Low | **TAIL STYLE TEAM duplicates a named style.** McLaren's TEAM motif is CHEVRON, so CHEVRON looks like a dead pill. | 0/1 on McLaren in S0 and S1; 7/7 once TEAM is not the start value. | Fix PR 1: TEAM names its motif ("TEAM · CHEVRON") |
| D8 | Low | **Two grey looks for one state.** Colour and pill rows dim to 0.38 (`carsetup.css`); pattern range rows dim to 0.75 (`tuner.css .tune-off`). | CSS. | Fix PR 1 |
| D9 | — | Region finish GLOSS = INHERIT while FINISH is GLOSS. Expected (INHERIT means "use FINISH"); not a defect. | 8/9 in every scenario. | none |
| D10 | Medium (latent) | **The import cap is two fields from silently dropping paint.** `GARAGE_KEYS_MAX = 64` fields per livery (`js/ui/settings-export.js` `cleanLivery`). A fully authored livery has 62 today, so two more fields (LD is adding zones) and an export/import loses fields with no warning. | Field count, persist probe. | Reported to P2 (`js/ui/**` owner); not OWNED |
| D11 | — | Helmet fields have hints and draft slots but no rows. | Fixed by #2752. | none |
| D12 | Low | **Default-value vocabulary is mixed.** TEAM, INHERIT, DEFAULT, STANDARD, LOGO and NONE all mean "what the team ships", and no pill marks the team's own default. | DOM. | Noted; no fix in this pass |

## Coordination

- `js/garage/setup-sheet.js` builds the editor's DOM but is outside this worker's OWNED globs, and #2752 edits it, so
  D1 and the setup-sheet half of D2 wait for #2752 to merge and for an OK from the orchestrator.
- D4's rule and D7's motif name live in LD's files (`liverytex.js` `FILL_SURFACES`, `livery-graphics.js` `TAIL_STYLE`).
- D10 is P2's (`js/ui/settings-export.js`).
