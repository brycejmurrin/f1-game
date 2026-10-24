# Device Farm iPhone runs, analysed: what 35 sessions proved, what was noise, what to run next (2026-10-24)

A·Y1 (Fleet A analyst, OrchA 31's lane). Bryce, 2026-10-24 ~00:10Z: "spawn 3 fable sessions to hunt for bugs and
perf improvements and analyze our aws runs and results". This note reads EVERY AWS Device Farm iPhone session to
date and turns them into ranked, evidence-backed next steps for phone performance. It is read-only: no device
minutes were spent, nothing was built. Sources: `DEVICE-FARM-LEDGER-2026-10-23.md` (rows 1–22; row 22 and the
row-21 correction are on PR #3666's branch), `AWS-DEVICE-FARM-IPHONE-2026-10-23.md` (§5–§10b),
`NIGHT-ENTRY-WEBGPU-2026-10-23.md`, `TOUCH-BOOST-FIRST-PRESS-2026-10-23.md`, `PERF-KNOWN-WINS-2026-10-23.md`,
`PERF-IPHONE-AUDIT-2026-10-21.md`, `tools/perf/devicefarm-iphone.mjs`, and the device comments on PRs #3604, #3618,
#3631, #3640, #3651, #3653, #3657, #3581, #3482, #3479, #3666.

Bryce plays THREE PATH: WEBGPU on an iPhone, so the WebGPU leg is ranked first throughout; the iPhone 14 WebGL2 leg
(iOS ≤ 18 players, latched devices, the player's own pin) has its own section.

Conventions. "Cold" = the first race entry of a session on a unit no earlier run had used (`report.unit`, the first 8
characters of `mobile: deviceInfo` uuid). "Warm" = Safari already holds the WebGPU pipelines (the cache survives a
reload, a Safari kill AND "Clear History and Website Data": §3). All units iOS 27.0, Safari 27. Times in seconds
unless marked. Nothing here is Bryce's own phone: Device Farm offers no iOS 26 unit.

## 1. Every run

Rows are sessions (one Device Farm remote-access or automated session each). The ledger's row numbers are kept;
runs the ledger omits (A·W14's PR BEFORE/AFTER sessions, A·W15's touch runs, A·O6's boot runs) get letters.
"Build" is the live Pages build at run time. ‡ = a unit whose history is unknown (pooled, may have held pipelines).

| # | when (Z) | device · unit | build | lane · scenario | key metrics |
|---|---|---|---|---|---|
| 1 | 10-23 01:39 | 18 Pro Max ‡ | pre-#3603 | A·D1 `run --legs 0` | AUTO boots `api=webgl2` on WebKit; `navigator.gpu` true |
| 2 | 01:44 | 18 Pro Max ‡ | pre | A·D1 `--legs 2` | 60 fps both paths all phases; WebGPU cold 29.3 / warm 0.82; WebGL2 cold 6.5 / warm 0.24 |
| 3 | 02:03 | 18 Pro Max ‡ | pre | A·D1 `--legs 4` GPU-GL-GL-GPU | 60 fps; WebGPU cold 30.4 then 5.8 (`mirrorPrepare` 28.2 / 4.1); WebGL2 6.4 then 3.2; thermal 0 throughout |
| 4 | 02:03 | iPhone 14 ‡ | pre | A·D1 `--legs 4` | **WebGPU 60 fps at every scale; WebGL2 55.7 default · 51.0 @0.75 · 41.8 @1.0**, fill 8.07 ms/full frame; WebGPU cold 33.9 (`mirrorPrepare` hit the 30 s timer, window 55.4) then 9.4; WebGL2 11.8 then 5.7; thermal 0 |
| 5 | 02:26 | iPhone 14 ‡ | pre | A·D1 `auto` + Instruments | Safari debugger wedged after xctrace disconnect; 33.7 device-min, no result |
| 6 | ~02:30 | iPhone 14 ‡ | pre | A·W14 `--legs 4` GL first (#3604 BEFORE) | first WebGPU leg warm 42.9 (scene 16.6, mirror 16.9, draw 5.2, fx 4.2); first WebGL2 leg 9.4 → the 30 s belongs to WebGPU, not to session order |
| 7 | 02:53 | 18 Pro Max ‡ | pre | A·D1 `auto` 2 legs | WebGPU cold 31.6 (`mirrorPrepare` 29.4), WebGL2 7.2; 60 fps; Instruments trace 3 s only; 18.5 device-min billed for 7 min of test |
| A | ~02:4x | 18 Pro Max ‡ | pre (old build) | A·W14 `--legs 4` GL first (#3604 BEFORE, "before-i18") | WebGPU leg 2 cold 28.8 (mirror 7.6); WebGL2 leg 1 6.8 (mirror 1.0); legs 3/4 3.2 / 5.3 |
| 8 | ~03:0x | 18 Pro Max ‡ | #3603 branch + #3604 (raw.githack) | A·W13 visual | `api=webgpu`, `gpuErrors 0`, renders; entry 10.5 (`mirrorPrepare` 7.2), reload 3.8 (2.4) |
| B | 06:59 | 18 Pro Max ‡ | 6931fdf7 (#3604 in) | A·W14 `--legs 4` GL first, on arm | WebGL2 9.3 (mirror 0.30); WebGPU 16.1 (mirror 0.54, warm 13.8: scene ~7.8, draw ~3.5, fx ~1.9); legs 3/4 2.7 / 4.9 |
| C | 07:0x | 18 Pro Max ‡ same unit, +1 min | 6931fdf7 `?tlxMirMrt=0` | A·W14 off arm | WebGL2 13.2 (mirror 2.43); WebGPU 11.5 ⚠ (mirror 1.48; scene 3.5 — the on arm had just filled the cache); legs 3/4 3.2 / 5.2 |
| 10 | 07:07 | 18 Pro Max ‡ | post (20919) | A·D1 `--scenario cache` | WebGPU `programWarm` 7.3 → 2.3 → 0.24 → 0.24 after a Safari kill (windows 9.1 / 3.8 / 1.7 / 2.8); WebGL2 2.3 → 0.37 → 0.37 → 0.24 (5.3 / 1.9 / 2.9 / 1.9) |
| 11 | 07:23 | 18 Pro Max ‡ | post (20919) | A·D1 `--scenario races` | 60 fps every race both paths; WebGPU p99 17–22 vs WebGL2 21–25 ms; WebGPU cold Monza dry 10.2 · rain 5.1 · **night 14.1** · Singapore night 3.0 · Spa rain 2.8 · Monaco 2.5; WebGL2 5.3 / 2.9 / 3.6 / 2.8 / 3.5 / 2.8 |
| 12 | 08:27 | iPhone 14 B86EBFDD ‡ | post (20919) | A·D1 `--scenario warmplus` default then warmPlus | default: entry 20.2 (`mirrorPrepare` 16.1, `programWarm` 2.6), worst frame **243 ms**, 2 frames > 100; warmPlus 2nd: 11.9, worst 89, 0 > 100 |
| 13 | 08:35 | iPhone 14 F0544D0A, Safari cleared per arm | post | A·D1 `--scenario warmplus` warmPlus then default | warmPlus 1st: 24.5 (`mirrorPrepare` 20.7, `programWarm` 5.8), worst **266 ms**, 2 > 100; default 2nd: 8.2, worst 86, 0 > 100 → the clear does NOT clear the pipeline cache |
| 14 | 08:43 | iPhone 14 B6CBB218 | post | A·D1 `--legs 4` | **WebGPU 59.5 / 59.4 / 59.5** default/0.75/1.0; **WebGL2 52.8 / 46.2 / 38.4**, fill 9.87 ms/full frame; WebGPU cold 18.5 then 9.2, warm 1.86 / 0.45; WebGL2 16.5 then 5.7 |
| 15 | 09:00 | iPhone 14 6AC4D1A1 | post | A·D1 `--scenario tracks` 3 night circuits | Monza night 1st 23.4 (`programWarm` ends 7.75, `mirrorPrepare:end` 23.28), Singapore 7.5, Vegas 5.2; 59.7 / 60.0 / 59.7 fps, worst 44 / 32 / 46 ms |
| 16 | ~10:00 | 18 Pro Max 034D496E / B2620BE8 | live 10:10Z | A·O6 `devicefarm-boot.mjs` (#3616) | first visit FCP 1.15, load 1.75, title wired 1.52; 250 requests / 1.04 MB wire (240 JS, 2.4 MB decoded); after a Safari kill wired 0.26–0.30; reload wired 1.1–1.2 (revalidates 250 files); `?apex=1` +0.86 |
| D | ~1x:xx | 18 Pro Max 8CCEE2EE | 20959 | A·W14 `--scenario races --pins webgpu` (#3618 BEFORE) | cold Monza dry 9.36 · rain 5.16 · **night 14.42** (scene 8.0, async pipelines 9.9) · Singapore night 3.01 · Spa rain 2.55 · Monaco 2.60; race max 62 / 46 / 48 / 49 / 42 / 49 ms |
| E | ~14:5x | 18 Pro Max D56CA871 | e8228c48 (21093, #3618 in) | A·W14 same (#3618 AFTER) | 9.27 · 5.11 · **14.85** (scene 7.4, pipelines 10.4) · 2.96 · 2.56 · 2.44; race max 37 / 36 / 49 / 34 / 43 / 39; frames ≥ 50 ms 1 → 0 |
| F | ~17:4x | 18 Pro Max D238FC21 (had run #3640's check earlier) | 269f66a4 (#3651 in) | A·W14 same (#3651 AFTER) | 9.32 · 5.08 · **3.13** (scene 0.68, pipelines 0.64) · 2.48 · 2.56 · 2.53; race max 58 / 37 / 46 / 31 / 43 / 38 |
| 17 | 17:52 | iPhone 14 6F16A3E6 (fresh) | ≥ b2cca9a2 (#3631 in) | A·D1 `--scenario tracks monza:night` | entry 22.3; `programWarm` **17.9** (scene 10.8, draw 3.9 incl. rig 1.12 / 28 pairs, fx 2.2, post 0); `mirrorPrepare` ends 0.1 after it; mirror `prep`: 2 frames, 0 refused, 1 pass 13 ms; menu warm before it 10.6 (garage scene 7.9, post 1.76); race 59.8 fps, max 37 ms |
| 18 | 19:18 | iPhone 14 9AF452C8 (fresh) | 9003114e (#3581 #3479 #3482 in) | A·D1 `visor,soak,photo` | visor WebGPU 59.9 / 59.8 / 60.0 / 60.0 (tier 3 / 3 / 4 / 4); WebGL2 51.3 / 54.7 / 54.4 / 51.5 (tier 0 / **4** / **4** / 0); first entry 18.4 (cold, Bahrain night). Soak WebGPU @0.5: medium 59.9 · low 59.8 · medium 59.3; ladder 1 / 0.75 / 0.5 → 60.0 / 59.9 / 59.9, scale reads back; governor 60 s: 58.6 fps, max 125 ms, 15 frames > 50, settles 0.55 / tier 3. Photo: 37 controls ≥ 44 px, capture **217 × 122** |
| 19 | 21:40 | iPhone 14 DDFC72D5 (fresh) | ffb5c921 (#3659 in) | A·D1 visor arms off, on-over, on-add, refr-over, off | WebGL2 48.2 (0) · 47.4 (3) · 52.7 (0) · 51.0 (0) · 48.1 (0); WebGPU 60.0 (4) · 58.9 (3, off-spec) · 60.0 (4) · 52.7 (0, 26 frames > 50) · 59.9 (0); row 18's `add` trip did not reproduce |
| 20 | 21:55 | iPhone 14 E10B1CDA (fresh) | ffb5c921+ | A·D1 visor ×12 WebGL2, blocks A/B | tier per arm A: off 0 · add 3 · over 4 · add 4 · over 4 · off 0; B: off 0 · over 4 · add 4 · over 0 · add 0 · off 4; mean fps add 52.9 · over 52.4 · off 52.2; p95 23–27 ms everywhere |
| 21 | 22:59 | iPhone 14 5F20C32D (fresh) | 5e325f91 (#3653 #3662 in) | A·D1 `tracks monza:night` (= row 17) | entry **18.4**; race warm **14.0** (scene 9.5, draw 3.4 incl. rig 1.11 / 28, fx 1.1, post 0); `programWarm` 14.9; menu warm 7.5 (garage scene 6.7, post 0.16); menu + race 27.4 → 21.5; 59.9 fps, max 42 ms |
| 22 | 23:56 | iPhone 14 5A29F8B2 (fresh) | 95f836e9 (#3658 in) | A·D1 `photo --photo-scales auto,1`, visor ×7 WebGL2 | capture **869 × 489** at both scales; visor fps/tier off 52.4/0 · add 49.0/0 · over 48.2/3 · off 49.0/**3** · over 50.9/4 · add 52.6/4 · off 52.6/0 — the tier carries across the harness reload |
| G | 10-23 | 18 Pro Max 034D496E, 32CFAFDB, … (7 sessions, runs 3–9) | live (pre-#3640) | A·W15 `--touch` (#3611) | first BOOST tap after lifting GAS: worst rAF gap **742 / 737 / 734 / 748 / 853 / 756 / 934 ms**, once per device (survives a Safari kill); later taps 19–37 ms; frame JS ≤ 27 ms; run 9 attributes it to a first-use WebGPU pipeline (`_rigFxA`, cockpit ERS bar) |

Not in the table: Fleet D's own iPhone 14 / 14 Pro sessions (Grok lane, 01:27Z onward; ask DAD). Also seen in raw
artifacts, never reproduced: one iPhone 14 WebGPU `GPUDevice.createBuffer: Unable to create buffer` (present
failed), and `TLX on a phone: three keeps ~54 MB of CPU geometry copies` on every phone.

Count: about 35 sessions (ledger rows 1–8 and 10–22, with ledger row 9 split into B and C, plus A–G; row G is seven sessions and row 16 two), roughly 450 device-minutes
against the 1,000-minute trial (703.73 left at 09:08Z before rows 12–22 and D–F; read
`aws devicefarm get-account-settings --query accountSettings.trialMinutes` for the balance). A remote-access
session bills about 13 device-minutes however short (A·O6).

## 2. Trends across builds

### 2a. Cold first WebGPU race entry (the number Bryce feels on a new phone or after a shader-changing deploy)

| device | pre-#3604 | 6931fdf7 (#3604) | 20919 (#3603 + #3604) | ≥ b2cca9a2 | 5e325f91 (#3653 + #3662) |
|---|---|---|---|---|---|
| 18 Pro Max, entry window | 29.3 / 30.4 / 31.6 / 28.8 (rows 2, 3, 7, A) | 16.1 (B, ‡) | 9.1 window / 7.3 `programWarm` (row 10, ‡); 10.2 Monza dry (row 11, ‡); 9.4 / 9.3 (D, E) | 9.3 (F) | — |
| iPhone 14, entry window | 33.9 (row 4), 42.9 warm (row 6) | — | 20.2 / 24.5 (rows 12, 13); 18.5 (row 14, day); 23.4 (row 15, night) | 22.3 (row 17, night); 18.4 (row 18, Bahrain night) | **18.4** (row 21, night) |
| iPhone 14, race `programWarm` | ~30 (timer) | — | 2.6 / 5.8 inside a 16–21 s `mirrorPrepare` (rows 12, 13); 4.6 inside 20 s (row 15) | 17.9 (row 17) | 14.9 (row 21) |

Reading. The 30 s pre-fix number was the first WebGPU compile plus a duplicated world compile for the mirror.
#3604 removed the duplicate (mirror stage 3–25× smaller, same build, rows B/C) and the 18 Pro Max settled at
9.1–10.2 s cold, 2.5–3 s with a cache. The iPhone 14 settled at 18–24 s and is now at 18.4 s on two fresh units
(rows 18, 21; different circuits). #3653 + #3662 took 2.9 s off the race warm (16.9 → 14.0) and 3.1 s off the menu
warm (10.6 → 7.5): removed, not moved (the row-21 correction). The remaining cold cost on the iPhone 14 is 14 s of
race compiles plus 7.5 s of menu compiles, of which `scene` (the lit family) is 9.5 s. A·W14's lavapipe census
(#3653 comment 6373777876) says no single lit feature is worth more than 2 % of that except the 60–85 finishes
(−12 %, now landed as #3662); all eight features off only buys −22 %. **The lit core itself is the cost.**

### 2b. First night race (the per-variant compile)

| | Monza night cold build | night-only new pipelines |
|---|---|---|
| 18 Pro Max, 20919 / 20959 / 21093 | 14.1 / 14.42 / 14.85 (rows 11, D, E) | 9.9 / 10.4 s |
| 18 Pro Max, 269f66a4 (#3651) | **3.13** (F) | 0.64 s |
| iPhone 14, first race of the unit IS night | 23.4 / 22.3 / 18.4 (rows 15, 17, 21) | n/a (nothing to reuse) |

#3651 (a lamp-bake placeholder with the wrong filter forked the lit WGSL) is the largest single win measured on
device: −11.3 s, 18× the run-to-run noise of §2e. It helps every phone that has raced a day race first; it cannot
help a phone whose first ever race is a night race (rows 15/17/21 compile the lit family either way).

### 2c. Frame rate

- 18 Pro Max: 60 fps on both paths in every phase, every circuit, rain and night included (rows 2, 3, 7, 11, D–F).
  Frame time cannot rank anything there; only the p99 tail (WebGPU 17–22 vs WebGL2 21–25 ms) and the worst frame move.
- iPhone 14 WebGPU: 59.4–60.0 fps at every render scale, every circuit, with or without the visor (rows 4, 14, 15,
  17, 18, 19, 21). The only sub-60 WebGPU windows are the governor soak (58.6 over 60 s with 15 frames > 50 ms, row
  18) and the off-spec forced `refr-over` arm (52.7, row 19).
- iPhone 14 WebGL2: 55.7 → 52.8 at the default scale between pre and post builds (rows 4, 14; different units), 41.8
  → 38.4 at full resolution; fill slope 8.07 → 9.87 ms per full frame. Helmet cam at Bahrain night with the visor off
  reads 48.1–52.6 across four units (rows 18–22).

### 2d. Governor tier (`autoTier`) and the harness artefact

Rows 18–22 read the governor tier per visor arm on WebGL2: trips to tier 3–4 in 11 of 20 visor-on arms and 3 of 12
visor-off arms. A·D1's row-22 finding explains most of it: the harness reloads the page over a live race, the
governor's crash sentinel (`js/perf/governor.js` `SENT_ACTIVE` + `SENT_TICKED`, `_floorFromStrikes`: 1 strike floors
tier 2, 2+ floor 4) counts that as a jetsam kill, and the floor carries into the next arm (row 22's "off" at tier 3
right after a tripped arm; row 20's final "off" at tier 4). #3666 clears the sentinel before each harness reload and
records `crashStrikes` per arm; **no visor tier reading before that fix is evidence about the visor.** A·W40
(`PERF-GOVERNOR-QUANTUM-2026-10-23.md`, PR branch `cursor/governor-vsync-step-a40g`) owns the governor side of
#3657; this note does not re-derive it.

### 2e. Noise estimates (use these before calling a delta real)

| metric | run-to-run / unit-to-unit spread measured | from | rule of thumb |
|---|---|---|---|
| cached race cold build, 18 Pro Max, same scenario, 3 units | 9.36 / 9.27 / 9.32; 5.16 / 5.11 / 5.08; 3.01 / 2.96 / 2.48; 2.55 / 2.56 / 2.56 | D, E, F | **±0.5 s (±3–5 %)**; the 2.48 is a real #3651 side effect |
| cold first entry, iPhone 14, same build, first arm | 20.2 vs 24.5 (one arm differs: warmPlus); 18.5 (day) vs 23.4 (night) | rows 12–15 | **±2–3 s** between fresh units; a cold-entry claim under 4 s needs ≥ 3 fresh units |
| cold first entry, 18 Pro Max, pre-fix | 28.8 / 29.3 / 30.4 / 31.6 | rows 2, 3, 7, A | ±1.5 s |
| per-stage warm (`scene`, `draw`, `fx`), iPhone 14 cold | scene 10.8 → 9.5, draw 3.85 → 3.4, rig 1.12 → 1.11 | rows 17, 21 | the rig's 1.12 / 1.11 s on two units pins stage noise at about ±1 %; the −12 % scene drop matched an independent lavapipe prediction (−12.6 %), so it is real |
| lavapipe compile census | ±8 % | #3653 comment | needs ≥ 3 runs for a 10 % claim |
| fps, 60 Hz-capped phone | 59.4–60.0 | every 18 Pro Max row | ±0.5 fps; use p99 / worst frame instead |
| fps, iPhone 14 WebGL2 helmet cam, visor off, tier 0 | 51.3 / 51.5 (one unit); 48.2 / 48.1; 50.8 / 51.1 / 50.7; 52.4 / 52.6 | rows 18–22 | **±0.3 fps within a unit at a fixed tier; ±2.5 fps between units**; a tier change moves it up to +5 fps, so pin the tier or the fps is the governor's, not the renderer's |
| worst frame in a 20 s race window, iPhone 14 WebGPU | 37 / 42 / 44 / 46 / 32 ms | rows 15, 17, 21 | ±7 ms; only > 100 ms frames are a finding |
| warm entry floor (cache full) | 1.7–2.9 s both paths | rows 10, 11 | the floor, not noise: `gridCountdown` 0.73–0.86, `warmCarAssets` 0.69–0.82 (1.44 on iPhone 14, row 15), `loadTrack` 0.36–0.41, scenery ~1 s uncached |
| thermal state | 0 (nominal) at every poll in rows 3, 4, 7 | `mobile: deviceInfo` | the scenarios after row 11 do not poll it (§5) |

What the noise does NOT allow: ranking the renderers by fps on an 18 Pro Max; reading a visor or blend cost from an
unpinned WebGL2 fps; calling a 1–2 s cold-entry change on one fresh unit a win; reading any absolute GPU time from
WebGPU `timestamp-query` on iOS (45–97 ms per 16.7 ms frame, rows 2, 4).

## 3. Proven, noise, and which earlier conclusions hold

**Proven (two or more independent sessions, or a delta far outside §2e):**

1. On the iPhone 14, three.js WebGPU holds 60 fps at every render scale while WebGL2 drops to 38–42 at full
   resolution and 52–56 at the default (rows 4 and 14, two units, four legs each). #3603's AUTO → WebGPU is right.
2. The dominant cold cost is the first-use Metal pipeline compile of TLX's lit family, not the mirror, not session
   order (rows 6, B/C, 17; #3631's `prep` capture shows the mirror ready 42 ms after the warm).
3. Safari's WebGPU pipeline cache survives a reload, a Safari kill and "Clear History and Website Data" (rows 10,
   13, 7 of A·W15's touch runs). A player pays the compile once per device per shader-source change.
4. #3604 cut the mirror stage 3–25× (same build, rows B/C); #3651 cut the first night race 14.4 → 3.1 s (D/E/F);
   #3658 fixed the Photo capture size (217 × 122 → 869 × 489, rows 18/22); #3479's LOW is no longer slower than
   MEDIUM at 0.5 (59.8 vs 59.9, row 18, one run but the sign flipped from the iPhone 15 before-data).
5. `warmPlus` does not remove the first-race hitch: whichever arm runs first on a unit gets two frames > 100 ms
   (243 / 266 ms), whichever runs second gets none (rows 12, 13, opposite orders).
6. #3659's `over` blend is perf-neutral against `add` on WebGL2 (row 20: 4 arms each, equal trips, equal fps).
7. The first BOOST press on WebGPU stalled 734–934 ms once per device on seven sessions (G), attributed by Event
   Timing to a first-use pipeline (`_rigFxA`). #3640 pre-mints it; **its device AFTER has not been run**.
8. The per-variant compile is real and large (night +10 s, rain +2.4 s of async pipelines on the 18 Pro Max, D/E).

**Likely, one sample (needs one confirming fresh unit):** #3653 + #3662's −2.9 s race warm / −5.9 s menu + race on
the iPhone 14 (row 21 vs 17; the stage split matches the lavapipe prediction, which is why it is "likely" and not
"noise"). The iPhone 14 governor soak settling at scale 0.55 / tier 3 with `autoShed` 1 (row 18).

**Noise or artefact (do not act on):** every visor `autoTier` reading (§2d); #3604's "28.8 → 16.1 total" (two
different unit histories; the mirror column is the proof, the total is a bound); row 12 vs 13's 20.2 vs 24.5 first
entry (confounded by the arm); the "13–15 s of `mirrorPrepare` that is not compile" on build 20919 (rows 12, 13, 15):
on ≥ b2cca9a2 the mirror ends 0.1 s after the warm (row 17) and no run has reproduced the gap since, so it was either
build-specific or an instrumentation boundary, and it is closed unless it returns.

**Earlier conclusions that no longer hold:**

- "AUTO = WebGL2 on WebKit" and "the shipped iPhone path is TLX WebGL2" (`PERF-IPHONE-AUDIT` §4): reversed by #3603.
- "`mirrorPrepare` is mirror work" (§6 of the AWS note): it was the whole program warm; the stage is `programWarm` now.
- "The visor trips the governor on WebGL2" (#3581 comment, row 18; #3657's title): a harness artefact until a run
  with #3666's sentinel clear says otherwise.
- "Part of the row-21 drop may be compiles moved to the menu": corrected in #3666 (both warms shrank).
- "A Safari data clear gives a cold arm" (`--scenario warmplus` design): it does not; only a fresh unit is cold.
- `PERF-KNOWN-WINS` row 1 ("pre-warm night and rain on the menu"): superseded by #3651 (one lit WGSL for day and
  night) and #3618 (variants moved into the covered warm). The speculative menu-idle warm was ruled out by OrchA 27.
- `PERF-KNOWN-WINS` row 3 ("post warm on the WebGPU leg"): refuted on device (rows 12, 13); keep the gate.

## 4. Ranked next experiments and code levers

Ranking = Bryce's path first (WebGPU, iPhone) × size of the measured cost × confidence ÷ (code + device-minutes).
Device-minute costs assume the 13-minute session floor and the measured scenario times (§1). Cross-checked against
`PERF-KNOWN-WINS` so nothing landed or refuted is repeated; the items A·W40 (governor) and A·W41 (TLX draw census,
#3667) own are cited, not re-proposed.

| rank | lever or experiment | evidence | expected gain | cost | owner / issue |
|---|---|---|---|---|---|
| 1 | **Lit-WGSL stability across deploys.** The compile is paid once per device per shader-source change (§3.3). Every merge that changes the generated lit WGSL (a TSL edit, a constant baked into the graph, a build-order rename) re-charges 14 s + 7.5 s to every iPhone 14 and ~9 s to every 18 Pro Max on its next race. Experiment, no device: hash the lit shader modules per build with A·W14's lavapipe census method (#3653 comment 6373777876; the script is in that session's scratch, not the repo) across the last N deploys and count how many re-keyed the family. Lever: a CI advisory that prints the lit-WGSL hash delta per PR; then a Device Farm confirm on a unit that holds the previous build's cache (does a non-shader deploy stay warm?) | rows 10, 13, G; #3651 §2 (names and one tap re-keyed 16/44 pipelines) | removes repeat 20 s cold entries for every phone on deploys that need not change the WGSL; today's deploy cadence is several game merges a day | 0 device-min for the census; 1 session ≈ 15 min for the confirm | #3672 |
| 2 | **First-race hitch attribution on the iPhone 14 WebGPU.** Two frames > 100 ms (243 / 266 ms) in the first race of a unit, not covered by the post or caster warm (rows 12, 13). The harness records the max, not where it landed. Add the game state, `PerfSpans` stage and `memState().matMissKeys` delta at each > 100 ms frame (the `--touch` arm already has the recorder shape), run once on a fresh unit | rows 12, 13; #3618 "the day race still builds 13 pipelines at first draw" | the two worst frames of every first race on every phone; a fix follows the attribution (likely more `_LATE_LIT`-style pre-mints) | 1 session ≈ 15 min (tracks scenario, 1 circuit) | #3673 |
| 3 | **Entry floor: `warmCarAssets` and `gridCountdown` off the critical path.** With the cache full every entry is 1.7–2.9 s, of which `warmCarAssets` 0.7–1.4 s and `gridCountdown` 0.7–0.9 s are path-independent; on the iPhone 14 cold entry `warmCarAssets` ran 1.36 → 2.80 s BEFORE `programWarm` started at 3.16 (row 15) | rows 10, 11, 15 | ~1–1.5 s on every race entry on every phone, warm or cold | code M (overlap the car-asset warm with the program warm, or run it at menu time); verify 1 session ≈ 15 min | #3674 |
| 4 | **#3640's device AFTER (first BOOST stall).** The fix is live; the proof is one `--touch 3` run on an 18 Pro Max | G, #3640 Plan "[~] Deferred" | confirms a 0.75–0.93 s stall gone from the first BOOST of every cockpit-cam race | 1 session ≈ 13 min | A·D1 run; no new issue (tracked on #3640) |
| 5 | **Memory and jetsam from the artifacts already paid for.** No run has measured memory; `performance.memory` is absent in Safari; the one `createBuffer` failure and the 54 MB CPU-copy warning are the only signals. The `auto` runs (rows 5, 7) downloaded a 290 MB iOS syslog whose `memorystatus` / jetsam and WebContent footprint lines were never parsed; reports stay 400 days | AWS note §7; ledger "also seen" | a real phone memory profile for the first time, and the answer to whether `PERF-KNOWN-WINS` row 9 (54 MB CPU copies) matters on a 6 GB phone | 0 device-min (a syslog parser over `list-artifacts` output); future `auto` runs get it for free | #3675 |
| 6 | **iPhone 14 WebGL2 fill levers, flags only.** Fill slope 8–10 ms per full frame and 48–53 fps at the default scale (rows 4, 14, 18–22). Two levers already ship behind flags: fixed render targets (`PERF-KNOWN-WINS` row 4) and SGSR1 upscale (row 7, #1652). One session: off / fixed-targets / SGSR / both at renderScale 0.5 and 0.75, governor pinned | rows 4, 14; KNOWN-WINS 4, 7 | up to the full-res gap (38 → 60 fps is not reachable; a stable 55+ at 0.75 is) for iOS ≤ 18 and latched players | 1 session ≈ 20 min, no code | A·D1 run; existing issues #1652 and the KNOWN-WINS row-4 hold |
| 7 | **Lit-core compile size.** `scene` is 9.5 of 14 s on the iPhone 14 and no feature kill buys more than 2 % (#3653 census). The remaining options are structural: fewer lit layouts per pool (the rig's 28 pairs = 1.1 s; the "C candidate"), or a reduced phone lit graph compiled first with the full one swapped in after the lights | rows 17, 21; #3653 census | the 9.5 s is the only remaining double-digit cost on Bryce's path | code L, high look risk; measure on lavapipe first (0 device-min), then 1 fresh-unit session | A·W14's lane (cite, do not start); no new issue until the lavapipe number exists |
| 8 | **Boot: 250 files on first visit, revalidated on every reload.** Wired 1.52 s cold, 1.1–1.2 s on reload (row 16) | row 16, #3515 | ~1 s per reload; the SW should make a reload free | tracked in #3515 (open, claimed) | cite only |
| 9 | Governor: vsync-quantum probe, one-frame stalls, thermal-drift default | rows 18, 20, 22 | — | — | A·W40, PR branch `cursor/governor-vsync-step-a40g` |
| 10 | Per-pass triangle and draw census, index-only LOD | — | iPhone 14 WebGPU already holds 60 fps, so this is memory and thermal headroom, not fps | — | A·W41, #3667 (#2631, #2657) |

Not ranked, because the data says no: pre-warming night and rain on the menu (superseded); flipping the WebGPU post
warm (refuted); any fps-based renderer A/B on the 18 Pro Max (capped); far-skyline culls for Singapore / Vegas (60
fps at 239–278k vertices, row 15); a physics catch-up change (#3620, measured no change).

## 5. Method fixes for the harness

In order of how much evidence each would have saved so far.

1. **Record the build in the report.** The ledger's "build" column is hand-derived from deploy times; several rows
   read "post" or "live ≥ …". `PROBE` should add the shell's `apex-build` meta (and `version.json`'s `apex-sha` when
   reachable) to `report.boot`, and every scenario row should carry it. A·O6's `devicefarm-boot.mjs` already reads
   the meta.
2. **Treat the first arm of every session as its own row.** Whichever arm runs first on a unit is the cold one
   (rows 12/13, B/C). Either prime the unit with a throwaway entry before the A/B, or report "first arm" separately
   and alternate which arm leads across sessions (rows 19/20 did this; rows 12/13 learned it the hard way).
3. **Repeat counts from §2e.** Cold-entry deltas: ≥ 3 fresh units for anything under 4 s. Cached-entry deltas: 2
   sessions for 1 s. fps on WebGL2: pin the governor (`__apex.renderScale(0.5)` and a fixed tier, as `soak` does)
   or read `autoTier` and discard arms where it moved. A fresh unit is the only cold cache; `report.unit` is the key,
   and a shared `units.json` (unit → sessions seen) would let a lane pick "fresh" on purpose instead of by luck.
4. **Clear the crash sentinel before every harness reload and record `crashStrikes` per arm** (#3666 does this).
   Until it merges, no `autoTier` from the visor scenario is evidence.
5. **Poll thermal state in every scenario.** Only the `--legs` bench polls `mobile: deviceInfo`; the `tracks`,
   `visor`, `soak` and `races` scenarios never read it, so the 20–60 s fps windows cannot separate heat from a
   change. One call per arm.
6. **Attribute hitches, not just count them.** `HITCH_ARM` / `SAMPLE` keep `max`, `n50`, `n100`. Keep the time, the
   game state, the active `PerfSpans` stage and the `matMissKeys` delta for every frame over 100 ms (lever 2).
7. **Record `warm.history`** on every entry read (it carried the row-21 correction) and the `where: menu` warm's
   stage split, so menu-vs-race moves are visible without a second run.
8. **Do not report WebGPU `timestamp-query` as GPU ms on iOS** (rows 2, 4); keep it as a relative fill signal only.
9. **Budget per session, not per minute** (13-minute floor): chain scenarios as `visor,soak,photo` does; never run a
   `--legs 0` proof alone again.
10. **Automated route only for syslog, video or tcpdump** (lever 5); remote access for everything else. Instruments
    does not work on Device Farm (row 5, 7).

## 6. Sent and filed

Issues filed from §4 and §5 (title prefix `[A·perf]`, labels `ready` + an area label): #3672 lit-WGSL stability
across deploys (lever 1), #3673 first-race hitch attribution (lever 2), #3674 the entry floor (lever 3), #3675 memory
and jetsam from the paid-for syslogs (lever 5), #3676 the harness method fixes (§5). Levers 4 and 6 are device runs
for A·D1 (Bryce's "Go" in A·D1's session), proposed to the orchestrator with the exact scenarios; lever 7 is
A·W14's; 9 and 10 are A·W40's and A·W41's. The note itself is PR #3671.
