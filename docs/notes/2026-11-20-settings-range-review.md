# Settings range review · November 20, 2026

Kind: measurement · Re-measure-by: 2027-02-20

Some sliders opened with a placeholder that disagreed with the shipped setting, some engine presets used values between slider positions, and the camera tuner rounded away a digit of a framing adjustment. The updated controls address all three.

## Coverage

The baseline was commit `9648b4f07d`. An HTML input scan checked 56 explicit range inputs in the root game pages. A JavaScript syntax-tree scan checked 225 numeric definitions declaring literal `min`, `max` and `step`. For each definition the checks required ordered bounds, a positive step, a reachable upper endpoint and, when present, an in-range default on the step grid. All passed. These numbers describe declarations. A shared definition can appear on several screens.

| Surface | Evidence and decision |
|---|---|
| Settings and persistence | The baseline export registry contains 205 explicit preference rows across 11 groups. It includes switches, choices, bindings and compound saved records. The effective default comes from a saved value, the shipped defaults table or the owning subsystem. A shell input's initial value alone cannot establish the shipped default. |
| Steering and assistance | The 1–10 response, linearity, smoothing, lock, speed-steer, adaptive-buttons and driving-help controls had stale shell positions. Their existing fresh-install positions are 2, 6, 3, 7, 7, 5 and 1 respectively. The shell now reflects those positions. Pace retains its separate 1–19 scale, with 11 representing 84% of reference pace. |
| Audio | All 22 engine rows were checked against the audio model in its own units. Nine shell positions differed from the default tune. Previously 45 explicit preset fields fell between selectable positions across Broadcast (10), Trackside (12), Cockpit (12) and V10 (11). After the range edits, every model endpoint, shipped default and named preset is reachable. All 22 shell positions decode to their model defaults. Music and effects ship at 6/10 and 2/10. |
| Global and per-screen appearance | The global interface, HUD and touch-button controls use quarter-percentage increments. Phone UI size has a 50% floor. HUD size has a 70% floor. The per-screen registry expands to 20 numeric rows across eight screens. Width, height and spacing use 5- or 10-point steps where applicable. The career and designer split controls use one point. The new phone pause height/width (125/135) and garage width (115) lie on those grids. |
| Title screen | The new landscape phone defaults set button size to 106%, width control to 25, title size to 108% and art size to 86%, with art offsets of −7 and −2. Portrait button size is 105%, with automatic width. Width 0 means automatic. Screen fit can cap the painted result without changing the saved request. |
| Lighting and Photo Studio | The same 191 lighting definitions feed both editors. All 7,463 numeric knob overrides in 1,061 shipped lighting profiles were within bounds and on their step grid. Seventy-eight controls have more than 1,000 intervals. For example, ambient warmth has 14,160. This audit establishes numeric precision. Touch selection and perceptual differences need a device trial. |
| Camera, flyby and replay | The numeric registry scan included 12 camera framing/comfort definitions, two camera effects and ten flyby pose/duration/FOV definitions. A 0.025 m framing step was previously displayed as 0.03 m. Height, distance and side offset now display the precision of their actual step. Free-camera and photo FOV use 20–110°. Authored flyby shots have their own 15–90° limits. Playback scrubbers use either normalized ticks or a recording's duration. |
| Garage and specialist editors | The scan included five suspension/brake setup controls and three loading-card placement controls. Garage setup resolves defaults by team. The livery editor builds eight integer controls from its range table, with rotation in degrees, repeat count in units and the remaining fields in percent. Photo car placement uses 0.1% circuit position, 0.1 m lateral offset and 1° rotation. |

## Export coverage

These counts come from the literal entries in the settings export allowlist. One compound record can describe many controls. Each group's data types were inspected in source. Numeric checks refer to the controls and profiles identified above.

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

Keep the HUD and driving ranges device- and mode-aware. The owner’s 143.25% driving-button size is reachable at the current quarter-point step. It interacts with tilt and drag steering, so the title-screen update leaves it as a personal setting. The owner’s graphics, race, audio and camera preferences likewise remain separate from the shipped menu appearance.

## Verification

All 112 settings-export tests passed. A further 335 tests passed across the audio tuner, camera tuner, phone pad, per-screen looks, lighting slider effects, flyby editor and garage setup. Both runs reported zero skips.

The engine check decoded each integer input position as `lo + position × step` and compared both endpoints and the default to the tone model. It then tested every shipped preset field against the same grid. For Lighting, the check loaded the actual tuner definitions and compared numeric overrides by knob ID, allowing a tolerance of 0.0000001 of a step for floating-point arithmetic.

The ranges that depend on a live recording, a team setup, the current layout or a phone's fit limits require their subsystem's tests. Screenshot comparison alone cannot establish audio response, camera feel or the physical effect of every setting.

- [Settings export registry](../../js/ui/settings-export.js) · [Shipped defaults](../../js/data/settings-defaults.js) · [Steering mappings](../../js/input/steer-tuning.js)
- [Audio slider conversion](../../js/audio/panel.js) · [Engine tone model and presets](../../js/audio/tone-model.js) · [Audio tuner tests](../../tests/unit/audio-tune.test.mjs)
- [Screen appearance registry](../../js/ui/screen-looks.js) · [Title layout](../../js/ui/title-layout.js) · [Lighting slider tables](../LIGHTING-TUNER-SLIDERS.md)
- [Camera framing controls](../../js/camera/offsets.js) · [Camera tuner readout tests](../../tests/unit/camera-tuner-a11y.test.mjs) · [Garage setup](../../js/garage/setup-tune.js) · [Flyby authoring](../../js/camera/flyby-panel.js)
