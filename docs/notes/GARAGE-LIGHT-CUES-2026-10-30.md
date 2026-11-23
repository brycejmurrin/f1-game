# Garage light cues and moods (2026-10-30)

Lane B of the garage enter/leave content pass (PR #4215, `cursor/garage-shots-pitin-9d3a`).
Blender-authored LIGHT CUES that a garage sequence plays on top of the lighting mood,
plus three new MOODS. Everything lives in `js/garage/scene.js`: the eager shell is at
its script budget (`tests/unit/boot-load-budget.test.mjs`), so no new module was added.

## The contract

A sequence pose sets `context.cue = { id, t }` on setup-camera's per-frame ctx, which
reaches `GarageScene.live(liv, now, ctx)`:

- `id` — one of `GarageScene.CUES` (an ids array).
- `t` — cue SECONDS since the cue started, not a 0..1 fraction. A loop cue
  (`flashes`, `beacon`, `pulse`) repeats every `cueLen(id)` seconds; a one-shot cue
  (`lightsup`, `lightsout`, `spotsweep`) holds its last key. For `lightsup` and
  `lightsout` that is the identity (gain 1); `spotsweep` holds its reveal (spot on,
  room at 0.6) until the sequence drops the cue.
- Absent, null or an unknown id: live() skips the cue path completely and returns
  exactly the rig it returned before cues existed. Checked bit for bit against the
  pre-change scene.js (ea672ace): 512 frames (8 moods × night × door × time × ambient,
  the part-fit chase included), and in `tests/unit/garage-light-cues.test.mjs`.

`GarageScene.cueSample(id, t, out)` → `{ key, fill, wash, up, gantry, tint, flash, beacon, spot, spotx }`:
the gains multiply the mood's banks (key fixtures 0-1, fill 2-5, wash 6-9), the two
team dado uplights and the night gantry (1 = unchanged, clamped 0..4); `tint` is an
rgb multiplier on the ceiling fixtures or `null`; `flash` 0..1 is the press strobe;
`beacon` is `{ angle, gain }` or `null`; `spot` 0..1 is the ceiling follow-spot's gain
and `spotx` (metres) its lateral aim, with the shared `angle` channel as its tilt toward
the door (floor target `(spotx, 0, 4.4 * tan(angle))`); every other cue reports `spot` 0,
`spotx` 0. `out` comes from a first call
(`cueSample(id, t)` allocates one) and is reused; nothing allocates per frame.
`cueLabel(id)` gives the display name. The cue applies to a copy of the cached rig
(`cueRig`), so a cue never leaks into the mood's rig.

No geometry is added. Three light records exist only while a cue lights them
(`litRig` drops dark records): the photographers' STROBE at head height in the door,
aimed into the bay, with a glare pop; and the amber BEACON on the door lintel, a
narrow beam turning at the cue's angle, its glare orb brightening as it turns;
and the SPOTLIGHT follow-spot on the truss over the car (y 4.4), a narrow (cos 0.97 /
0.90) neutral-white beam at 16 × E, under the strobe's 34 × E and over the beacon's
9 × E, so the car keeps its highlights at the end key.

## Cues

| id | label | len | what |
|---|---|---|---|
| `lightsup` | LIGHTS UP | 2.4 s one-shot | Bank by bank as the shutter lifts: door-end washers at 0.30 s, fills at 0.85 s, keys at 1.45 s. Each bank strikes, stutters at half power and settles, like LED high-bay drivers. The uplights glow at 0.6 from the start. Start it with the door. |
| `flashes` | PHOTO FLASHES | 4.0 s loop | Race-win press pool: 11 irregular white pops (~20 ms rise, ≤110 ms tail), keys 1.1, uplights 1.6. |
| `beacon` | AMBER BEACON | 1.2 s loop | Retired car: the bay dims warm (key 0.55, fill 0.5, wash 0.45, uplights 0.35) and an amber beacon turns once per loop (50 rev/min). |
| `pulse` | PULSE | 3.2 s loop | Team-colour breathing: the uplights swell to 2.6× while the keys ease to 0.86. |
| `lightsout` | LIGHTS OUT | 6.0 s one-shot | Before the RACE! drive-out: five red beats 0.9 s apart deepen the ceiling tint to red while the room dims, then a 0.2 s blackout at 5.05 s and a slam back to full (1.25× overshoot) as the car goes. |
| `spotsweep` | SPOTLIGHT | 4.0 s one-shot | Reveal: by 0.4 s the bay drops to a quarter (uplights 0.4) and a hard white follow-spot picks up the floor by the door, pans across the bay (x -3 → 2.2 → -0.6 m) and settles straight down on the car at 3.0 s; over the last second the room comes back to 0.6 (uplights 1) under it. It holds that look. |

## Moods (GarageScene.MOODS)

| id | look | reference |
|---|---|---|
| `podium` | gilded ~2700 K keys, high team uplights, bloom 1.8 / glare 1.6 | race-win garage celebrations under the TV crews' warm lights, trophy and confetti gold |
| `rain` | flat ~7000 K overcast through the door, no sun, a grey lane, floor sheen 2.6 (wet epoxy) | wet race days at Spa, Silverstone and Interlagos |
| `neon` | magenta keys, cyan fills and washers, violet sky, night gantry | night street races in Las Vegas and Marina Bay |

The setup sheet's LIGHTING row lists every MOODS key. These three have no
`MOOD_NAMES` entry in `js/garage/setup-sheet.js`, so they show as PODIUM, RAIN and
NEON (the `id.toUpperCase()` fallback).

## Regenerate

```sh
python3 -m venv <scratch>/bpyenv && <scratch>/bpyenv/bin/pip install bpy==5.2.3
<scratch>/bpyenv/bin/python tools/gen/blender/garage-light-cues.py -- --output-dir artifacts/light-cues --write-runtime
# or: blender -b --python tools/gen/blender/garage-light-cues.py -- --output-dir artifacts/light-cues --write-runtime
node tools/shot/gen-scenery-locations.cjs   # scene.js is in the scenery catalog's digest
```

The script makes one Empty per cue and keys its custom properties (`key fill wash up
gantry tr tg tb flash beacon angle spot spotx`) with SINE / EASE_IN_OUT interpolation
(`angle` and `spotx` LINEAR). It exports the keys into the `// @blender-cues:start` … `end` block of
`js/garage/scene.js`, along with `CUE_SHA256`, the script's SHA256. Before writing,
it evaluates every F-curve in Blender at 240 Hz and checks it against the runtime's
ease (`cueValue`). Max error this run: 1.5e-5. It also writes
`artifacts/light-cues/garage-light-cues.{blend,json}`.

Blender route used: **bpy 5.2.3 from PyPI** in a venv (Python 3.13; "Blender 5.2.3
LTS"). The script reads F-curves through both the 4.x `action.fcurves` and the 5.x
layered `layers → strips → channelbags` API. The 4.2 route (`tools/env/install-blender.sh`)
was not run.

## Not verified

No browser run happened (subagent). Nobody has looked at the cues or moods on screen
on GLX, TLX or WGX, and the parent has not wired them into `arrival.js` or
`setup-camera.js` yet.
