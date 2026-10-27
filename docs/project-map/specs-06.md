# Browser specs map — batch 06

All 160,000 assigned UTF-8 bytes were read in 24 individually returned chunks of at most 8,000 bytes. Whole-file manifest hashes match for all ten files. `specs-06-evidence.json` records whole/part/chunk SHA-256 values, read provenance, imports/hooks, intersecting case and assertion spans, setup and limits. Byte ranges are half-open; source lines inclusive. Lexical assertion sites and parameterized case declarations are not execution counts. No tests or browser runs were performed.

Eight files are complete. `tests/specs/hud-layout.spec.js` covers [44921,106339), starting inside the numeric-editor case (727–802); only suffix assertions are assigned. `tests/specs/lighting-tuner-grade.spec.js` covers [0,3779) of 20,046 bytes and ends mid-comment before all cases. Whole-file AST provides enclosing boundaries, not evidence of reading unassigned bytes.

## `tests/specs/hud-layout.spec.js`

HUD arrangement, fit and DOM/CSS geometry: valid numeric draft commits, selected recovery, compact metrics, independent HUD/button scales, moved sectors, opt-in readouts, portrait status/readability, warning chip, desktop controls, fit determinism, LCD parity and all 19 manual widgets.

Plain Playwright, page fixture; BOOT_MS/awaitTrackBuild/awaitApexBoot and hud-geometry helpers. Most races freeze physics/headless and inject safe-area CSS; selected cases keep normal HUD cadence or real GLX draw frames.

Only assigned tail; first case is a suffix. Synthetic text/visibility forces transient plates, not sporting events. Geometry uses half-pixel tolerances; LCD case collects 12 same-frame pairs at race pace. Previous appearance is pinned in shared race helper; moved-widget cases explicitly use shipped appearance.

| Case source lines | Contract / scenario | Assigned assertion sites inside case |
|---|---|---:|
| 727–802 (partial) | numeric HUD edits keep focused drafts visible and commit only valid completed values | 8 |
| 804–856 | Bring Into View recovers only the selected offscreen widget and survives Done and Resume | 13 |
| 866–893 | COMPACT drops both metric halves and leaves MAP and GAPS alone | 3 |
| 909–921 | sector plate clears BOOST and OT (notched landscape, ~140%) | 1 |
| 938–1008 | control rects are identical at HUD SIZE min / default / max | 7 |
| 1019–1066 | keeps its width and does not resize across ticks | 4 |
| 1068–1133 | small sectors right of Boost survive arranger Done and Resume | 5 |
| 1142–1170 | sector plate clears BOOST (phone landscape, 150%) | 1 |
| 1219–1279 | HUD ${…}%: announce/flag/limits/tyre/rel clear each other and touch controls | 2 |
| 1286–1305 | RELATIVE clears left steer / BRAKE; INPUTS clears right dock (buttons 150%) | 1 |
| 1311–1324 | INPUTS clears SPEED & GEAR at HUD 150% chase | 1 |
| 1338–1376 | tilt HUD 150%: tyre/plan clear gear; gear clears AERO/OT | 1 |
| 1391–1447 | HUD ${…}%: the card stays on screen and clears the map, timing row and RELATIVE | 7 |
| 1463–1526 | HUD 150%: tower and sectors stay ≥ 10 CSS px and clear dash/plan/announce | 3 |
| 1533–1561 | clears the touch dock when a warning shows | 4 |
| 1566–1575 | hides the whole touch stack, keeping only the pause button | 1 |
| 1594–1647 | two fits publish the same zTop and #minimap zoom matches it | 3 |
| 1709–1750 | cockpit wheel LCD and HUD speed show one number in the same frame | 2 |
| 1757–1831 | all widgets keep offscreen geometry through Done, Resume and rotation | 12 |

Cleanup: Transient status HTML/hidden flags restored in same evaluate; density restored; GLX draw wrapper restores after 12 samples; sample interval cleared after 3s. Browser/page lifecycle owns storage and freeze changes.

## `tests/specs/hud-mirror.spec.js`

Mirror counters/rect/target, cockpit glass orientation, touch chip and M toggle, radio clearance; TLX countdown preparation and WATCH PiP target reuse/flip restoration.

Fixture-backed GLX; TLX beforeEach seeds three + tlxForceGL. Red Bull dry day cockpit; presented-canvas helper, low render scale.

WGX excluded; hardware behavior not established. GLX requires soft pixels; TLX orientation pixels conditional on available capture. Contrast must decide at least one glass; GLX PiP omitted. Helper assertions sit outside named test bodies.

| Case source lines | Contract / scenario | Assigned assertion sites inside case |
|---|---|---:|
| 352–359 | GLX renders the mirror pass, composites it into #hud-mirror, and the key turns it off | 1 |
| 371–427 | TLX prepares an enabled mirror before the countdown advances and reuses its target in the race | 21 |
| 428–431 | TLX renders the mirror pass, composites it into #hud-mirror, and the key turns it off | 0 |
| 435–444 | TLX reuses the mirror target for WATCH PiP and restores the rear view on exit | 0 |

Cleanup: Radio hidden after measuring; mirror disabled by key; PiP subject removed and bc-on removed. Page lifecycle handles backend preferences.

## `tests/specs/hungaroring-foundation.spec.js`

Racing coordinates, lighting exclusions, valid required hero models, sampled terrain/elevation basin and finite sufficiently open barriers.

Raw Playwright page plus BOOT_MS; Hungaroring day dry.

20 off-road terrain probes and 100 profile samples; bounds characterize this circuit only. No screenshot or pageErrors fixture.

| Case source lines | Contract / scenario | Assigned assertion sites inside case |
|---|---|---:|
| 14–83 | migrates terrain, models, dressing, and barriers onto track-owned contracts | 21 |

Cleanup: Page lifecycle only.

## `tests/specs/image-grade-visual.spec.js`

Black/shadow/highlight/channel grade response, real slider extrema, five shipped-condition tonal histograms.

GLX fixtures, soft-capture JPEG decoder, serial grade block; 640x360 fixed fog=1 camera, neutral grade, frozen physics/clock, held governor, pack settle or disable fallback.

Pair premise checks tier/post path, newer present, env and exact owned camera; third blacks capture repeats premise. JPEG numerical deltas are coarse image tests, not visual approval. Extreme and representative histogram tests lack full capturePair premise guards. Five condition rows come from one parameterized source case.

| Case source lines | Contract / scenario | Assigned assertion sites inside case |
|---|---|---:|
| 362–397 | blacks visibly change the deepest image detail | 10 |
| 399–408 | shadows predominantly change dark pixels | 4 |
| 410–416 | highlights predominantly change bright pixels | 1 |
| 418–425 | red gain predominantly changes the red channel | 2 |
| 427–450 | grade extremes keep the race canvas renderable and move the frame off neutral | 5 |
| 464–479 | ${…} ${…} ${…} retains broad tonal range | 3 |

Cleanup: JPEG attachments; optional capture directory; browser lifecycle clears tuning/governor/freeze. Module last-capture buffer overwritten.

## `tests/specs/imola-foundation.spec.js`

Required Senna/bridge/nine water models, no suppressed ids; racing terrain/exclusions/water, corner-aligned elevation, shoulder gaps and walls; night required models remain valid.

racePage/pageErrors fixtures; Imola day diagnostic and night rebuild.

Profile 500; shoulder 240x2 samples ignore null gaps. Diagnostic validity is not appearance approval.

| Case source lines | Contract / scenario | Assigned assertion sites inside case |
|---|---|---:|
| 54–78 | required models and pit supersedes | 5 |
| 80–111 | terrain, elevation, walls and night rebuild | 18 |

Cleanup: Page lifecycle; rebuild changes same fixture race.

## `tests/specs/instanced-draw.spec.js`

Instance API and largest-batch GPU upload, frustum-only all/none culling, shadow API, ordinary scene remains nonblank.

GLX racePage fixture, Monza TrackGraph batches.

Math delegated to unit suite. Culling upload:false proves counts, not packed buffer order despite title. Shadow case checks function existence only; PNG >20KB is coarse nonblank heuristic.

| Case source lines | Contract / scenario | Assigned assertion sites inside case |
|---|---|---:|
| 23–30 | exposes the batches() consumer API | 1 |
| 32–73 | a real track's batches() payload uploads as GL instance buffers | 7 |
| 75–113 | culling packs the visible instances to the front of the buffer | 5 |
| 115–118 | instanced geometry can cast shadows | 1 |
| 120–131 | ordinary draws are unaffected — the scene still renders | 1 |

Cleanup: Both temporary instanced batches freed explicitly. Browser lifecycle owns track buffers.

## `tests/specs/interlagos-foundation.spec.js`

Racing-frame finish plateau, required heroes/lake vertices, props budget below 620k, grounded terrain and finite collision walls.

Raw Playwright page and BOOT_MS; Interlagos day dry.

1000 profile samples; 200x3 terrain samples ignore null. Geometry budget detects growth only, not missing content.

| Case source lines | Contract / scenario | Assigned assertion sites inside case |
|---|---|---:|
| 14–43 | uses racing coordinates and reproduces the finish plateau elevation | 8 |
| 45–76 | emits required hero models and Guarapiranga lake | 4 |
| 78–91 | keeps track-owned dressing within a focused geometry budget | 1 |
| 93–114 | keeps terrain grounded and collision barriers finite | 5 |

Cleanup: Page lifecycle only.

## `tests/specs/jump-start.spec.js`

Held throttle incurs >=5s, delayed manual launch zero; first-green fast legal build crosses reaction speed gate and penalizes; stock/fast auto-throttle exempt.

GLX fixtures plus shared-page toMenu/pinFreePlay; Monza count state stepped deterministically at 1/60.

Full 22-car field, real wear, legal exact parts and no contact/manual input positive controls. Tests launch penalty after green, not movement before green; bounded 600 countdown and 30 launch steps.

| Case source lines | Contract / scenario | Assigned assertion sites inside case |
|---|---|---:|
| 20–36 | throttle held at lights-out adds +5 s | 2 |
| 38–56 | waiting for green before throttle accrues no false-start penalty | 2 |
| 61–92 | a manual launch inside the reaction window is a false start, and only when the car really moved | 3 |
| 94–152 | auto-throttle is exempt through the reaction window, including a fast legal build | 13 |

Cleanup: setInput cleared in manual cases and before auto launches; shared menu resets between stock/fast. Page lifecycle handles preferences.

## `tests/specs/lighting-ab.spec.js`

Live fog sun/exposure, lamp fog OFF/ON twice >3% luminance increase, <=48 night lights and day-off, palette-scaled flood emission, PCSS pixel response >0.1%, night-fog exposure [0.94,1.05).

GLX fixtures + soft-capture; headless for lighting-state-only cases, real rendering for lamp/PCSS cases.

Pinned clock/tier/physics for pixel A/B; full-fog fixed camera. PCSS measures changed picture, not exact edge shape; no TLX/WGX coverage here.

| Case source lines | Contract / scenario | Assigned assertion sites inside case |
|---|---|---:|
| 92–101 | weather() applies lighting live (fog mutes sun + lifts exposure) | 2 |
| 103–150 | night fog GLOWS around lamps (the lamp-fog knobs add luminance to one fogged frame) | 3 |
| 152–182 | night light budget: lamps on at night, off by day, exposure per table | 6 |
| 184–223 | PCSS contact-hardening rig is alive: SHADOW SOFTEN changes the shadow edges in the picture | 3 |
| 225–231 | dark sessions keep their exposure floors in fog (night must stay night) | 2 |

Cleanup: JSON diagnostic attachments; browser lifecycle owns settings. A/B glow ends on shipped knobs; no explicit PCSS reset.

## `tests/specs/lighting-tuner-grade.spec.js`

Introductory provenance explains expensive tuner menu actions and dispatched walk design; no executable case/hook/assertion in assigned prefix.

Assigned prefix imports GLX fixtures and declares 300s collection-time budget.

Ends mid-comment at byte 3779 of 20046; later tuner behavior belongs to next batch. Comments describe historical measurements, not runs in this mapping.

| Case source lines | Contract / scenario | Assigned assertion sites inside case |
|---|---|---:|
| — | Introductory prefix only | 0 |

Cleanup: No executable resource acquired in prefix.

## Production navigation and scope

Attached apex-lsp ties GameHud to `js/ui/hud.js` and `js/game.js` plus arrange/dock/layout modules; HudLayout to arrange, HUD, elements and camera switching. LightTune production references include profiles, atmosphere, tuner, game, shadows and photo studio. SportingRegs reaches jump-start penalty, pit lane and race control. Tracks is shared widely; circuit-specific foundation assertions consume diagnostics through the agent surface. MirrorPass references connect game, car drawing, layout, garage and agent controls. The checker cannot see `GLX.createInstancedBatch` on its shared facade; symbol lookup locates backend implementations in GLX, TLX and WGX. This mapping does not infer identical backend coverage from those definitions.

No processes were launched, no runtime/test sources changed, and nothing was staged or committed. Temporary mapping scripts remain ignored under scratch; the two support outputs are the only intended deliverables.
