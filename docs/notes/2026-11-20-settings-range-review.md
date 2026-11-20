# Settings range review · November 20, 2026

Kind: measurement · Re-measure-by: 2027-02-20

Some sliders opened with a placeholder that disagreed with the shipped setting, some engine presets used values between slider positions, and the camera tuner rounded away a digit of a framing adjustment. The updated controls address all three.

## November 20 baseline measurements

The baseline was commit `9648b4f07d`. An HTML input scan checked 56 explicit range inputs in the root game pages. A JavaScript syntax-tree scan checked 225 numeric definitions declaring literal `min`, `max` and `step`. For each definition the checks required ordered bounds, a positive step, a reachable upper endpoint and, when present, an in-range default on the step grid. All passed. These numbers describe declarations. A shared definition can appear on several screens.

| Surface | Evidence and decision |
|---|---|
| Settings and persistence | The baseline export registry contained 205 explicit preference rows across 11 groups. It includes switches, choices, bindings and compound saved records. The effective default comes from a saved value, the shipped defaults table or the owning subsystem. A shell input's initial value alone cannot establish the shipped default. |
| Steering and assistance | The 1–10 response, linearity, smoothing, lock, speed-steer, adaptive-buttons and driving-help controls had stale shell positions. The baseline runtime positions were 2, 6, 3, 7, 7, 5 and 1 respectively. At that revision, pace notch 11 represented 84% of the physics reference. Current defaults are listed below. |
| Audio | All 22 engine rows were checked against the audio model in its own units. Nine shell positions differed from the default tune. Previously 45 explicit preset fields fell between selectable positions across Broadcast (10), Trackside (12), Cockpit (12) and V10 (11). After the range edits, every model endpoint, shipped default and named preset is reachable. All 22 shell positions decode to their model defaults. At the audited revision, music and effects initialized at 6/10 and 2/10. |
| Global and per-screen appearance | The global interface, HUD and touch-button controls use quarter-percentage increments. The scan used underlying scale units. The phone UI floor was 50 and the HUD floor was 70. The per-screen registry expands to 20 numeric rows across eight screens. Width, height and spacing use 5- or 10-point steps where applicable. The career and designer split controls use one point. The new phone pause height/width (125/135) and garage width (115) lie on those grids. |
| Title screen | The landscape phone profile requested button size 106%, width control to 25, title size to 108% and art size to 86%, with art offsets of −7 and −2. Portrait button size is 105%, with automatic width. Width 0 means automatic. Screen fit can cap the painted result without changing the saved request. |
| Lighting and Photo Studio | The same 191 lighting definitions feed both editors. All 7,463 numeric knob overrides in 1,061 shipped lighting profiles were within bounds and on their step grid. Seventy-eight controls have more than 1,000 intervals. For example, ambient warmth has 14,160. This audit establishes numeric precision. Touch selection and perceptual differences need a device trial. |
| Camera, flyby and replay | The numeric registry scan included 12 camera framing/comfort definitions, two camera effects and ten flyby pose/duration/FOV definitions. A 0.025 m framing step was previously displayed as 0.03 m. Height, distance and side offset now display the precision of their actual step. Free-camera and photo FOV use 20–110°. Authored flyby shots have their own 15–90° limits. Playback scrubbers use either normalized ticks or a recording's duration. |
| Garage and specialist editors | The scan included five suspension/brake setup controls and three loading-card placement controls. Garage setup resolves defaults by team. The livery editor builds eight integer controls from its range table, with rotation in degrees, repeat count in units and the remaining fields in percent. Photo car placement uses 0.1% circuit position, 0.1 m lateral offset and 1° rotation. |

## Export coverage

These November 20 baseline counts come from the literal entries in the settings export allowlist. One compound record can describe many controls. Each group's data types were inspected in source. Numeric checks refer to the controls and profiles identified above.

| Export group | Rows | Range decision |
|---|---:|---|
| Audio | 23 | Volumes and engine tuning have numeric grids. Languages, routing, presets and switches use discrete choices. Voice settings, engine tune and layer levels use structured records. |
| Display | 25 | UI, HUD and touch size or opacity have numeric ranges. Renderer, XR, shape, quality and feature switches use fixed choices. Responsive defaults depend on the device. The migration version is metadata. |
| Accessibility | 4 | Reduced motion, focus and colourblind cue choices and the hold-mode map have discrete states. |
| Appearance | 42 | Title and per-screen layouts include numeric geometry. Themes, contrast, captions, presets, units and scene options use choices. Custom colours use hex values and saved profiles contain structured state. |
| HUD | 7 | Element movement and scaling are saved per layout. They accept finite offsets and positive finite scales. Profiles, visibility, mirror and the element switch map use discrete values. |
| Camera | 33 | Framing and comfort, flyby shots, garage arrival and the loading card contain numeric values. Camera modes, visor strength, cockpit finishes and effect choices use named levels or switches. |
| Lighting | 1 | The single tuning record contains the 191 numeric definitions and per-profile overrides checked above. |
| Driving | 46 | Input calibration, touch travel and dead zones have bounded values. Driving-line opacity, grid order, drive modes, race rules and assists use choices or switches. Axis mappings, profiles, dock layout and favourite tracks are structured. |
| Steering | 16 | Scaled driving controls include pace and steering response. Preset selection, toggles and schema version retain their existing semantics. |
| Controls | 2 | Keyboard and gamepad bindings are maps of actions to inputs. Numeric button IDs are identifiers. |
| Metrics | 6 | Overlay mode, page, position, size, log namespace and severity are switches, labels or filters. Size uses named tiers. |
| **Total** | **205** | |

## Endpoint decisions

Lighting Tuner and Photo Studio pair each slider with a numeric field using the same minimum, maximum and step. Drag for a visual adjustment or type a known value for repeatable framing and lighting. The main tuner saves the committed edit to the active lighting profile. Photo Studio applies it only to the current photo session. All shipped lighting profiles retain their original range and precision.

## Current factory profile

The full November 20 owner settings informed the factory defaults beyond the appearance sample. Start with an empty settings store when comparing a fresh installation. An existing saved request can produce a different readout on another viewport because its underlying value still applies. The appearance sample contains only display and layout data. [Appearance sample](../../tests/data/phone-appearance-2026-11-20.json) · [Settings defaults](../../js/data/settings-defaults.js) · [Export registry](../../js/ui/settings-export.js)

| Controls | Factory behavior |
|---|---|
| UI, HUD and driving-button size | Each reads 100% at its own baseline. Underlying phone scales are 70, 100 and 143.25 respectively. On larger touch devices they are 109, 100 and 125. Fine-pointer desktop UI uses 115 at 1600 × 900 CSS px and above, or 100 in smaller windows. Both desktop HUD and button scales are 100. Saved scales retain quarter-point precision. |
| Home and screen appearance | The title uses the static drawing, normal text and standard contrast. The factory size of each title piece reads 100% in both orientations. Phone Pause button height/card width use underlying values 125/135 and Garage panel width uses 115. Phone Career requests Roomy and still fits compact windows. Data Hub uses underlined tabs and row stripes. An untouched phone shows the Shipped layout preset. |
| Driving and race setup | Standard adaptive buttons start at 6. Overall Speed reads 100% at notch 17 on the existing 1–19 grid. Notch 14 remains the underlying 1.0 simulation reference. A fresh solo Grand Prix draft opens with three laps at dusk, starting in a storm with changeable conditions. |
| Audio | Sound and music start off. At their factory mix, the volume readouts each show 100%. The underlying music, effects and radio gains are 0.7, 0.4 and 0.8 respectively. |
| Renderer, cockpit and garage | iPhone selects Low graphics and High resolution. The resolution choice controls 3D rendering independently of screenshot dimensions. The cockpit uses the forward seat and medium amber visor. The garage starts with the Flood room, Pitstop crew and Showroom lighting. |
| HUD and lighting | The phone HUD uses the owner's element selections and layout. Lighting starts from the revised profile values. Saved profile values continue to take precedence and Photo Studio edits are local to a shoot. |

[Phone defaults tests](../../tests/unit/phone-shipped-defaults.test.mjs) · [Scale tests](../../tests/unit/scale-defaults.test.mjs) · [Steering presets](../../js/input/steer-tuning.js) · [Solo race draft](../../js/race/race-settings.js) · [HUD element defaults](../../js/ui/hud-elements.js) · [Lighting profiles](../../js/lighting/presets.js)

## Baseline verification

At the audited revision, all 112 settings-export tests passed. A further 335 tests passed across the audio tuner, camera tuner, phone pad, per-screen looks, lighting slider effects, flyby editor and garage setup. Both runs reported zero skips.

The engine check decoded each integer input position as `lo + position × step` and compared both endpoints and the default to the tone model. It then tested every shipped preset field against the same grid. For Lighting, the check loaded the actual tuner definitions and compared numeric overrides by knob ID, allowing a tolerance of 0.0000001 of a step for floating-point arithmetic.

The ranges that depend on a live recording, a team setup, the current layout or a phone's fit limits require their subsystem's tests. Screenshot comparison alone cannot establish audio response, camera feel or the physical effect of every setting.

- [Settings export registry](../../js/ui/settings-export.js) · [Shipped defaults](../../js/data/settings-defaults.js) · [Steering mappings](../../js/input/steer-tuning.js)
- [Audio slider conversion](../../js/audio/panel.js) · [Engine tone model and presets](../../js/audio/tone-model.js) · [Audio tuner tests](../../tests/unit/audio-tune.test.mjs)
- [Screen appearance registry](../../js/ui/screen-looks.js) · [Title layout](../../js/ui/title-layout.js) · [Lighting slider tables](../LIGHTING-TUNER-SLIDERS.md)
- [Camera framing controls](../../js/camera/offsets.js) · [Camera tuner readout tests](../../tests/unit/camera-tuner-a11y.test.mjs) · [Garage setup](../../js/garage/setup-tune.js) · [Flyby authoring](../../js/camera/flyby-panel.js)
