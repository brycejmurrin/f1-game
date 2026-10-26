# Device Farm ledger — every iPhone run so far (2026-10-23)

One table of every AWS Device Farm run on Apex 26, so lanes stop re-deriving it. Method, tools and the full
write-ups are in `AWS-DEVICE-FARM-IPHONE-2026-10-23.md` (§ references below) and in the PRs named in each row.
Asked for by OrchA 28 (Bryce in OrchA 28's session, about 01:12 PT: "Any sessions that are idle or waiting review
the aws runs and burn for more perf improvements"). Append new runs at the end of §1; do not rewrite old rows.

All devices are iOS 27.0, Safari 27, three.js r185/r186 (TLX). "Build" is the live site at run time:
- **pre** = before #3603/#3604; AUTO picks WebGL2 on WebKit.
- **post** = live build 20919, after #3603 (AUTO picks WebGPU) and #3604 (warm-up fix; the stage is renamed
  `mirrorPrepare` → `programWarm`).

Device Farm keeps Safari's cache between sessions on a unit (§8), so a "first" entry is cold only on a known-unused
unit. Rows marked † ran on a unit with unknown history. From e23476eb, `run` records the unit in `report.unit`.

## 1. Runs

| # | when (Z) | device | build | lane / tool | what | WebGPU result | WebGL2 result | where |
|---|---|---|---|---|---|---|---|---|
| 1 | 01:39 | 18 Pro Max | pre | A·D1 `run --legs 0` | proof: AUTO boot | — | AUTO boots `api=webgl2` (`isWebKit`), `navigator.gpu` true | note §1 |
| 2 | 01:44 | 18 Pro Max | pre | A·D1 `run --legs 2` | BENCHMARK paths, 1 leg/path | 60 fps all phases; cold 29.3 s (first leg); warm 821 ms | 60 fps; cold 6.5 s; warm 237 ms | §5 |
| 3 | 02:03 | 18 Pro Max | pre | A·D1 `run --legs 4` | paths, GPU-WGL-WGL-GPU | 60 fps; cold 30.4 / 5.8 s (`mirrorPrepare` 28.2 / 4.1 s); warm 221–234 ms | 60 fps; cold 6.4 / 3.2 s (`mirrorPrepare` 4.7 / 1.6 s) | §6 |
| 4 | 02:03 | iPhone 14 | pre | A·D1 `run --legs 4` | paths, GPU-WGL-WGL-GPU | **60 fps at every scale**; cold 33.9 / 9.4 s (`mirrorPrepare` 30.0 s = safety timer, window 55.4 s); warm 2.9 s / 412 ms | **42 fps at full res** (p95 34 ms), 51 at 0.75, 55.7 default; fill 8.07 ms/full frame; cold 11.8 / 5.7 s | §6 |
| 5 | 02:26 | iPhone 14 | pre | A·D1 `auto` + Instruments | automated, 2 legs | leg 1 started; Safari debugger wedged after xctrace "Device got disconnected"; 33.7 device-min, no result | — | §7 |
| 6 | ~02:30 | iPhone 14 | pre | A·W14 (#3604 BEFORE) | paths, WGL first | first WebGPU leg warm 42.9 s (scene 16.6, mirror 16.9, draw 5.2, fx 4.2) | first WebGL2 leg 9.4 s | #3604, §6 correction |
| 7 | 02:53 | 18 Pro Max | pre | A·D1 `auto` + Instruments | automated, 2 legs | cold 31.6 s (`mirrorPrepare` 29.4 s); warm 228 ms; 60 fps; Instruments trace only 3 s | cold 7.2 s; warm 247 ms; 60 fps | §7 |
| 8 | ~03:0x | 18 Pro Max † | #3603 branch + #3604 | A·W13 (raw.githack) | AUTO visual check, storage cleared | `api=webgpu`, `gpuErrors 0`; bodywork, sky and helmet cam render; entry first 10.5 s (`mirrorPrepare` 7.2 s), after reload 3.8 s (2.4 s) | — | #3603 Plan |
| 9 | 06:59–07:17 | 18 Pro Max † | 6931fdf7 (#3604) | A·W14 AFTER on/off | paths ×4, WGL first, `?tlxMirMrt=0` off arm | first WebGPU cold build on 16.1 s / off 11.5 s ⚠ (off ran second, warm cache); mirror stage on 536 / off 1 475 ms | first WebGL2 cold on 9.3 / off 13.2 s; mirror 299 / 2 432 ms | #3604 comment 6359610979 |
| 10 | 07:07 | 18 Pro Max † | post | A·D1 `run --scenario cache` | entry: first / reload / reload / Safari kill | `programWarm` 7.3 / 2.3 / 0.24 / **0.24 s**; window 9.1 / 3.8 / 1.7 / 2.8 s | `programWarm` 2.3 / 0.37 / 0.37 / 0.24 s; window 5.3 / 1.9 / 2.9 / 1.9 s | §8 |
| 11 | 07:23 | 18 Pro Max † | post | A·D1 `run --scenario races` | 6 races per path | 60 fps all; p99 17–22 ms; cold Monza dry 10.2, rain 5.1, **night 14.1**, Singapore night 3.0, Spa rain 2.8, Monaco 2.5 s | 60 fps all; p99 21–25 ms; cold 5.3 / 2.9 / 3.6 / 2.8 / 3.5 / 2.8 s | §9 |

| 12 | 08:27 | iPhone 14 B86EBFDD | post | A·D1 `--scenario warmplus` | default 1st, warmPlus 2nd (no clear) | default: entry 20.2 s, max frame 243 ms, 2 >100 ms; warmPlus: 11.9 s, max 89 ms, 0 >100 ms | — | §10 |
| 13 | 08:35 | iPhone 14 F0544D0A | post | A·D1 `--scenario warmplus` | warmPlus 1st, default 2nd, Safari cleared | warmPlus: 24.5 s, max 266 ms, 2 >100 ms; default: 8.2 s, max 86 ms, 0 >100 ms. warmPlus does not fix the first-race hitch; a Safari clear keeps the pipeline cache | — | §10 |
| 14 | 08:43 | iPhone 14 B6CBB218 | post | A·D1 `run --legs 4` | paths, GPU-WGL-WGL-GPU | **59.5 fps all scales**; cold 18.5 / 9.2 s | **38.4 fps at full res**, 52.8 default; cold 16.5 / 5.7 s | §10b |
| 15 | 09:00 | iPhone 14 6AC4D1A1 | post | A·D1 `--scenario tracks` | Monza / Singapore / Vegas night | 59.7 / 60.0 / 59.7 fps; entry 23.4 (1st) / 7.5 / 5.2 s; `mirrorPrepare` ends 15.5 s after `programWarm` | — | §10b |

| 16 | ~10:00 | 18 Pro Max 034D496E / B2620BE8 | live (10:10Z) | A·O6 `devicefarm-boot.mjs` (#3616) | cold boot to menu | first visit: FCP 1.15 s, load 1.75 s, title wired 1.52 s, 250 requests / 1.04 MB (240 JS, 2.4 MB decoded); after a Safari kill (warm cache) wired 0.26–0.30 s, FCP ~0.1 s; reload wired 1.1–1.2 s (revalidates 250 files); `?apex=1` adds ~0.86 s | — | #3616 |

| 17 | 17:52 | iPhone 14 6F16A3E6 (fresh) | live ≥ b2cca9a2 (#3631) | A·D1 `--scenario tracks --tracks monza:night` | A·W14's `mirror().prep` capture, first WebGPU entry | entry 22.3 s; `programWarm` **17.9 s** (scene 10.8, draw 3.9, fx 2.2, post 0); `mirrorPrepare` ends 0.1 s after it; `prep`: 2 frames, 0 refused, 1 pass of 13 ms. The old 15.5 s mirror "gap" is gone: the cost is the cold WebGPU program compile itself. Race 59.8 fps, max 37 ms | — | #3652 |

| 18 | 19:18 | iPhone 14 9AF452C8 (fresh) | live 9003114e (#3581, #3479, #3482 in) | A·D1 `--scenario visor,soak,photo` (#3654) | OrchA 31's follow-ups. **Visor (#3581)**: HELMET cam, Bahrain night, arms off / on (`clear·medium·refraction off`) / refr (`…refraction medium`) / off. **Soak (#3479)**: GRAPHICS medium / low / medium at renderScale 0.5, then 1 → 0.75 → 0.5, then the governor 60 s. **Photo (#3482)**: native taps from the title | visor 59.9 / 59.8 / 60.0 / 60.0 fps (tier 3 / 3 / 4 / 4: the governor drifts with or without the visor); VisorOptics paint 0.2 ms avg, 1 ms max, 0 errors; bend map 6 ms once; first entry 18.4 s (cold). Soak: medium 59.9 · **low 59.8** (`lookPostShed` on) · medium 59.3 fps — LOW is no longer slower than MEDIUM; ladder 60.0 / 59.9 / 59.9 fps, scale reads back 1 / 0.75 / 0.5 (no linger); governor 60 s 58.6 fps, max 125 ms, 15 frames > 50 ms, settles at 0.55, `autoShed` 1 | visor 51.3 / 54.7 / 54.4 / 51.5 fps — **the visor trips the governor**: autoTier 0 with it off (both ends), 4 with it on, so it costs look tiers, not fps; paint 0.15–0.24 ms, bend map 13 ms. Photo (backend WebGPU after the soak): opened by a real tap, 37 controls all ≥ 44 px, CAPTURE/CLOSE on screen, 0 page errors; **capture is 217 × 122 px** (the title scene's low-res backing canvas, `js/ui/photo-studio.js` capture() copies `G.canvas` as is) | #3654 |

| 19 | 21:40 | iPhone 14 DDFC72D5 (fresh) | live ffb5c921 (#3659 in) | A·D1 `--scenario visor --arms off,on-over,on-add,refr-over,off` (#3663) | #3659's AFTER for #3657: HELMET cam, Bahrain night, one build, `visorblend=over` (the new WebGL2 default) vs `visorblend=add` (the old plus-lighter); each row reads `body[data-visor-blend]` | control: off 60.0 (tier 4) / **on-add 60.0** (tier 4, 1 frame > 33 ms) / off 59.9 (tier 0); forced on-over 58.9 (tier 3, 16 > 33 ms) and refr-over 52.7 (tier 0, 26 frames > 50 ms, max 141 ms) — `over` is not a WebGPU path in the build, so these two are off-spec; the refr-over hitches came with the governor back at tier 0 | off 48.2 (tier 0) / on-over 47.4 (**tier 3**) / **on-add 52.7 (tier 0)** / refr-over 51.0 (tier 0) / off 48.1 (tier 0). **Inconclusive**: the old `add` blend did NOT reproduce row 18's tier-4 trip on this unit, so the AFTER cannot show #3659 removed it. No arm costs fps beyond noise; blend reads back `over`/`add` as set; VisorOptics paint 0.16–0.25 ms, 0 errors. Row 18's trip (unit 9AF452C8) may be unit- or session-specific | #3663 |

| 20 | 21:55 | iPhone 14 E10B1CDA (fresh) | live ffb5c921+ | A·D1 `--scenario visor --visor-pins webgl2 --arms off,on-add,on-over,on-add,on-over,off,off,on-over,on-add,on-over,on-add,off` (#3663) | #3657 order test (A·W35 / OrchA 31): each blend 4× on WebGL2, each blend leads one block | — | autoTier per arm, block A: off 0 · add 3 · over 4 · add 4 · over 4 · off 0; block B: off 0 · over 4 · add 4 · over 0 · add 0 · off 4. Trips (tier ≥ 3): **add 3/4, over 3/4**, off 1/4. Mean fps add 52.9 · over 52.4 · off 52.2; p95 23–27 ms everywhere; paint 0.14–0.25 ms; 0 errors. **Neither blend is worse**: visor-on raises the governor's chance of shedding in a 20 s window (6/8 vs 1/4), the blend does not change it, and the trip is not first-arm-only (later arms trip too; the last off arm tripped). #3659's `over` is perf-neutral against `add` | #3663 |

| 21 | 22:59 | iPhone 14 5F20C32D (fresh) | live 5e325f91 (#3653, #3662 in) | A·D1 `--scenario tracks --tracks monza:night` (same as row 17) | OrchA 31: cold first WebGPU race after #3653 (late-variant winding twin dropped) and #3662 (60–85 finish tints on demand) | entry **18.4 s** (row 17: 22.3); race warm **14.0 s** (row 17: 16.9): scene **9.5** (10.8), draw **3.4** (3.85) incl. rig **1.11 s / 28 pairs** (1.12 / 28, unchanged), fx **1.1** (2.2), post 0; `programWarm` 14.9 s (17.9); race 59.9 fps, max 42 ms. Menu warm before the race: 7.5 s (garage scene 6.7, post 0.16); row 17's build ran one too, 10.6 s (garage scene 7.9, post 1.76), read from its `warm.history`. Menu + race 27.4 → 21.5 s: the compiles were removed, not moved to the menu (an earlier draft of this row said otherwise) | — | #3664 |
Not in this table: Fleet D's own iPhone 14 / 14 Pro sessions (`apex-iPhone14`, 01:27Z onward, Grok lane). Their

| 22 | 23:56 | iPhone 14 5A29F8B2 (fresh) | live 95f836e9 (#3658 in) | A·D1 `--scenario photo,visor --photo-scales auto,1 --visor-pins webgl2 --arms off,on-add,on-over,off,on-over,on-add,off` (#3666) | Bryce's "All": Photo Studio capture at render scale auto vs 1 (#3482 / #3658), visor governor repeat (#3657) | — | **Photo:** capture **869 × 489 at both scales** (backing `#game` 633 × 245 at auto 0.5, 1266 × 489 at 1; row 18 was 217 × 122): #3658 fixed it on device, the capture no longer follows the render scale; 37 controls ≥ 44 px, 0 page errors. **Visor** (fps / autoTier): off 52.4 / 0 · add 49.0 / 0 · over 48.2 / 3 · off 49.0 / **3** · over 50.9 / 4 · add 52.6 / 4 · off 52.6 / 0. The off arm right after a tripped arm stayed at tier 3: the tier carries across the harness reload. Likely cause: the harness reloads over a live race, which the governor's crash sentinel counts as a strike (`js/perf/governor.js` init: 1 strike floors tier 2, 2+ floor 4), so rows 18–22's per-arm tiers are partly harness artefact. #3666 now clears `apex26.raceActive`/`raceTicked` before each harness reload and records `crashStrikes` per arm | #3666 |
numbers live with Fleet D. Ask DAD on the bus.

| 23 | 00:53 (10-24) | 18 Pro Max 8B45A799 (fresh) | live 13d33447 (build 21236) | A·D1 `run --touch 3` (#3666 harness) | #3640's first-BOOST AFTER (A·Y1 lever 4): GAS hold → lift → tap BOOST, 3 cycles ~2.6 s apart, helmet/WebGPU default | first BOOST tap worst frame **23 ms** (before #3640: 734–934 ms, run G); every tap 21–23 ms, 0 frames > 50 ms, 0 long tasks; WebKit delivered taps 2/3 and 4/5 as pairs 67 ms apart (3 real taps). Not tested: Bryce's 00:30Z "every press, a hitch" at real straight-to-straight spacing; A·W45's hypothesis (#3677) needs 25–30 s gaps and deploy-ON pairs, which the harness does not do yet | — | this row |
| 24 | 02:37 (10-24) | iPhone 14 0DD650F5 (fresh) | live 68942c7c (build 21276) | A·D2 `run --scenario flags --flag-pin webgl2 --flag-arms off,fixed,sgsr,both,off --flag-scales 0.5,0.75 --track monza:day` | A·Y1 lever 6: do fixed targets / SGSR move WebGL2 fill-bound frame rate? Bryce's "Go" typed in A·D2. API-path entry (cold) | fps / p95 ms / frames > 50 ms at scale 0.5 \| 0.75: **off** 52.4 / 30 / 0 \| 46.5 / 34 / 0; **fixed** 48.1 / 33 / 1 \| 44.2 / 36 / 2; **sgsr** 52.5 / 30 / 1 \| 46.3 / 35 / 1; **both** 50.0 / 31 / 1 \| 47.7 / 33 / 0; **off again** 49.6 / 33 / 5 \| 45.4 / 34 / 0. The two `off` arms differ by 2.8 fps (0.5) and 1.1 fps (0.75), so the noise floor is ~1–3 fps and **no lever is distinguishable from it**; fixed reads lowest (−4 fps at 0.5), SGSR and both sit within the off spread. Caveats: the governor tier moved during the 0.5 arms (tierMoved true for off, fixed, both, off; tier 3 → 0, sgsr/both read back tier 3/4), so 0.5 compares different tiers; thermal 0 throughout; one pass per arm; 0 hitches > 100 ms. Both flags read back as set. Wall 10.3 min (02:37:44–02:48:02); billed minutes not yet reported (session STOPPING) | artifacts/devicefarm/2026-10-24T02-37-44 (local, not committed) | this row |
| 25 | 02:52 (10-24) | 18 Pro Max A07A0CFC (fresh) | live 68942c7c (build 21276) | A·D2 `run --touch 5 --touch-gap 28 --touch-pair` (harness from #3701) | Bryce's "Go": BOOST every-press baseline for A·W45 (#3677), helmet/WebGPU | **INVALID as an every-press test.** The 28 s gap was not applied: the 5 press cycles ran 21 s end to end (a press every ~4.2 s, taps at 4.4, 8.3, 12.1, 15.8, 19.7 s), so the endpoint ignored the long W3C pause. WebKit also delivered three pointerdowns per tap (18 for 5 cycles, 2 pressed each: ON then OFF), and the car had speed 0.001 at the read, so BOOST was not exercised at speed. Frames in the tap windows: p95 21 ms, max 47 ms (first press 29, second 47), 0 > 50 ms, 0 long tasks. The page showed an `__err_overlay` element at +723 ms (cause not read) and the music stream was refused (NotAllowedError). Fix: the gap is now waited with a client-side sleep (this PR). `--entry menu` has no effect on `--touch` (it uses `__apex.race`). Needs a re-run, on a new Go | artifacts/devicefarm/2026-10-24T02-52-40 (local) | this row |
| 26 | 22:59 (10-25) | 18 Pro Max B2620BE8 (fresh) | live b86aedbd (build 21419; #3677 BOOST fix in) | A·D2 `run --touch 5 --touch-gap 28 --touch-pair` | Bryce's Go: BOOST every-press AFTER the fix, helmet/WebGPU, spacing now applied (presses at 4.3, 33.5, 62.7, 92.0, 121.0 s) | **First press: one 722 ms frame** (+735 ms after the pointerdown; spans: five audio begin/end pairs, `GameAudio.resume state=running` ×6 logged at the same instant, after `GameAudio.init state=suspended` at 4.3 s, so the first user gesture resumed the audio context). **Presses 2–5 (ON/OFF pairs): worst frame 19–28 ms, 0 > 50 ms, 0 long tasks.** No every-press hitch. Caveats: the car had speed 0 at the read (GAS is held 1.5 s per cycle, so it coasts to rest in the 28 s gap: presses 2–5 happen at low speed, which A·W45's hypothesis may need otherwise); WebKit delivered 3 pointerdowns per tap; grid countdown showed two 3.5–3.8 s `count` frames in the load list before the presses. Not a before/after: row 25 was the invalid baseline | artifacts/devicefarm/2026-10-25T22-59-44 (local) | this row |
| 27 | 23:07 (10-25) | 18 Pro Max 9701DEFE (fresh) | live b86aedbd (build 21419; #3685 patch 17 in) | A·D2 `run --scenario lsab,opus --ls-pin webgpu --track monza:night` (arms A = `tlxTagDiscard=0`+`tlxDepthDiscard=0`, B = default, A) | Bryce's Go: patch 17 A/B, helmet cam, 30 s per arm | fps / p95 / p99 / frames > 50 ms: **A** 60.0 / 17 / 17 / 0; **B** 59.8 / 17 / 17 / 2; **A again** 59.8 / 17 / 18 / 2. Counters confirm the switch: B read `tag.discards` = `depth.discards` = 2151, A read 0 and `discard:false`. **No fps difference: all arms sit at the 60 Hz cap**, so the bandwidth saving is not measurable this way (it would show as thermal or headroom, not fps). No hitches > 100 ms. Mirror discards and the three-lap protocol were not run. The opus part failed on a script timeout (the endpoint's execute/async timeout; fixed, see row 28) | artifacts/devicefarm/2026-10-25T23-07-34 (local) | this row |
| 28 | 23:15 (10-25) | iPhone 14 E48B8DD2 (fresh) | live build 21432 (#3690 rg11b10 in) | A·D2 `run --scenario lsab,opus --ls-pin webgl2 --track monza:night --ls-arms off=tlxScene11:0\|on=tlxScene11:1\|off` | Bryce's Go: #3690 rg11b10 scene colour A/B on WebGL2, plus A·H18's Opus probe | fps / p50 / p95 / p99 / frames > 33 ms / > 50 ms: **off (RGBA16F)** 45.7 / 22 / 30 / 33 / 13 / 5; **on (rg11b10)** 42.5 / 23 / 32 / 38 / **55** / 7; **off again** 47.0 / 21 / 29 / 34 / 19 / 5. The two `off` arms differ by 1.3 fps; `on` is **3.2–4.5 fps lower with 3–4× the frames over 33 ms**, so on this phone rg11b10 is slower, not faster (thermal 0; the governor tier was not read). **Banding check: unusable.** The stills are dark and a Safari "download apex-diag.json" dialog covers the centre of both, with the cars at different positions. **Opus (#3710), iOS 27.0 Safari (UA says iPhone OS 18_7):** `canPlayType` ogg/webm/caf = "probably"; decodeAudioData of the 0.06 s clips: ogg ok 63 ms (first decode), webm ok 5 ms, caf ok 3 ms (3840 samples at 48 kHz); MP3 control ok 21 ms (1.08 s). `OfflineAudioContext` present, `webkitOfflineAudioContext` absent | artifacts/devicefarm/2026-10-25T23-15-23 (local; opus-probe.json) | this row |
| 29 | 23:23 (10-25) | iPhone 14 Pro 20ACE5A3 (fresh) | live build 21432 (#3713 in) | A·D2 `run --scenario coldrace --cold-pin webgpu --track monza:day` (new `coldrace` scenario) | A·W50 (#3713): cold first race on the player's path, WebGPU | Only the first arm is cold. **menu30** (menu prep, then 30 s idle on RACE SETTINGS, then START): the menu's own prep took **55.5 s** to settle. `warm.history` has two records, **both `where:"menu"`**: at 17.2 s total 28.75 s (scene 7.8, fx 6.2, post 3.1, mirror 7.3, draw 4.4) and at 52.0 s total 17.0 s (scene 2.8, mirror 5.5, draw 2.1, rig 5.7); none is `where:"race"`. So **#3713 moved the scene and mirror warm into the menu**. At race entry the stage table (>= 50 ms) shows only **rigWarm 5.7 s**, warmCarAssets 0.26 s and mirrorPrepare 67 ms, inside a 39.1 s player-pace entry window (introGarage 10.7 s, flyby 20 s). The first version of this row read the menu's own warm as paid at race start; that was wrong (corrected 2026-10-25 after A·W50's question). Later arms ran in the same session, so they are **warm** and not a valid title-idle dose test: title0 `warm.total` 5.2 s, title15 0.38 s, title45 0.32 s, second 0.34 s (rigWarm 81–121 ms in all four); frames after settle 59.5–59.8 fps, worst 47–67 ms. **Not collected:** frozenMs and longestMs during the entry (the sample window starts after GO), gpuMs, memory peak, and the WebGL2 arm. A valid S5 dose needs one fresh unit per arm | artifacts/devicefarm/2026-10-25T23-23-51 (local) | this row |

Also seen, not yet reproduced (OrchA 27's read of the raw artifacts):
- An iPhone 14 WebGPU session logged `TLX: present failed — GPUDevice.createBuffer: Unable to create buffer`:
  memory pressure on a 6 GB phone.
- Every phone logs `TLX on a phone: three keeps ~54 MB of CPU geometry copies`.

## 2. Ranked opportunities (from §1)

1. **First-run WebGPU warm-up on mid-range phones (iPhone 14).** Pre-fix, the first WebGPU entry ran 34–55 s
   there, and `mirrorPrepare` hit the 30 s safety timer twice (row 4). #3604 cut the mirror stage 3–25× on the
   18 Pro Max (row 9), and AUTO now sends every iOS 26+ phone down this path (#3603). **The post-fix build has
   never been measured on an iPhone 14.** That is the highest-value missing run, because it is the device class
   where WebGPU wins on frame rate (row 4) and loses most on entry. It needs Fleet D's device or a cross-fleet ask.
2. **Per-variant WebGPU pipeline builds (row 11).** The first night race costs 14.1 s against 3.6 s on WebGL2,
   and the first rain race 5.1 s against 2.9 s. Fix: pre-warm the night and rain variants on the menu or during
   the countdown. Owner: A·W14 (assigned by Bryce via OrchA 27).
3. **On WebGPU, the first load skips the post-chain and shadow-caster warms (row 10).** Cause, from
   `js/render/three/tlx.js` `runProgramWarmStages`:
   - The post warm runs only when `warmPlusOn() || performance.now() - _warmAt < 3000`.
   - The caster warm runs only when `warmPlusOn()`.
   - `warmPlusOn()` defaults to true only on three's WebGL backend.

   On the 18 Pro Max's first WebGPU load the scene compile took 4.4 s, so the gate tripped: `post 0`, `shadow 0`.
   On the reload (scene 0.2 s) the post warm ran and cost 1.9 s; later loads, 0.05 s. WebGL2 warms post in the
   lights on every load (1.15 s first). Per the code's own comments, skipped post quads and casters compile on the
   first visible present and the first sun pass, i.e. mid-race. So the first WebGPU race on a phone probably
   carries that work as a hitch, and the "1.9 s on the 2nd load" is the post warm finally running. Untested fix:
   make `warmPlusOn()` default on for WebGPU too (moves the work into the lights). It can be A/B'd with no code via
   `localStorage apex26.tlxWarmPlus=1`. A clean A/B needs a cold pipeline cache per arm (a Safari data clear or a
   known-unused unit) and a first-race frame-hitch probe. `tlx.js` changes also need the render-tlx gate
   (`gfx-probe` + `gpu-census.yml`).
4. **Path-independent entry floor of about 2 s (rows 10, 11):** `gridCountdown` 0.73–0.86 s, `warmCarAssets`
   0.69–0.82 s, `loadTrack` 0.36–0.41 s, and about 1 s of `scenery` when uncached. With shaders warm, this is now
   most of every race entry on every phone and renderer.
5. **WebGPU memory headroom on 6 GB phones.** The iPhone 14 `createBuffer` failure (OrchA 27's read) and the
   54 MB CPU geometry copies. A device loss there now flips the phone to WebGL2 permanently through #3603's
   kill switch (`apex26.tlxWebKitGL`), which silently costs those players the 7–43 % frame-rate win from row 4 (default to full resolution).
6. **Instrumentation gaps.**
   - WebGPU `timestamp-query` reads 45–97 ms per frame on iOS while frames arrive every 16.7 ms, so it is unusable
     as absolute GPU time (§5, §6).
   - On the 18 Pro Max both paths sit at Safari's 60 Hz rAF cap, so frame time cannot rank them there.
   - Use a GPU-bound phone (iPhone 14), or a CPU frame-work metric, for render A/Bs.

## 3. How to run Device Farm (for other lanes)

- **Tool:** `node tools/perf/devicefarm-iphone.mjs`:
  - `devices`
  - `run --device "<name>" [--legs 0|2|4] [--scenario cache|races --pins webgpu,webgl2] [--url <public https>]`
  - `auto` (server-side; adds video, syslog and a tcpdump; Instruments is unusable)
- **Setup:** unzip AWS CLI v2 (https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip) into your scratchpad,
  then set `APEX_AWS_CLI=<dir>/bin/aws` and `AWS_CA_BUNDLE=/root/.ccr/ca-bundle.crt`. Credentials come from env;
  never print them. Expect your auto-mode classifier to ask Bryce before the CLI install and before the first
  metered session.
- **Before a run:** claim the device on the bus:
  `node tools/ci/fleet-bus.mjs send HANDOFF --to A "DF CLAIM <device> <lane> <min>"`.
  Fleet A uses the iPhone 18 Pro Max; Fleet D uses the iPhone 14 and 14 Pro. Sessions sit in STOPPING for minutes
  after they end and count against account concurrency (`PENDING_CONCURRENCY`).
- **Budget:** the account's 1,000-minute free trial had 703.73 minutes left at 09:08Z (both fleets combined).
  `aws devicefarm get-account-settings --query accountSettings.trialMinutes` reads the current balance.
- **Billing lesson (A·O6, measured):** a remote access session bills while it sits in STOPPING, about **13
  device-minutes per session however short** (A·O6's sessions billed 26.9 / 13.5 / 13.3 / 13.0 / ~13 min). Wall
  time under-counts, so this note's earlier "about 16 / 48 device-minutes" figures are low. Budget per session,
  not per minute of test: batch several measurements into one session (as `--scenario cache` and `tracks` do).
- **Flaky session start:** one unit failed `POST /session` straight after PREPARING ("remote debugger did not
  return any connected web applications"). A retry fixes it.

- **Entry path (A·W43, 2026-10-24):** the harness enters races through `__apex.race`, which skips race settings'
  `prepareMenuCarAssets`. Every entry-time figure above (rows 17 and 21 included) is a **cold-API path** no player
  takes: warmCarAssets 3.5–4.7 s there against 7 ms via menu → RACE SETUP → START. Use `--entry menu` (the player's
  path; waits for the menu's own prep, then presses START RACE) for any entry-time claim. Each row's JSON now carries
  `entryPath`. `--entry menu` is untested on a device as of this note; its first run needs a Go.
