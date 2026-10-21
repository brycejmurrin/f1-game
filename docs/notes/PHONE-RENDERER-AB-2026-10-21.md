# Phone renderer A/B: TLX vs GLX (B·H23, 2026-10-21)

Bryce, 2026-10-21 05:12Z: "Keep both but let's test and side by side first." The question is whether phones
should default to GLX (plain WebGL2) instead of TLX (three.js). This note holds the measurements. Switching the
default is a later PR, after Bryce decides.

Gallery (one living page, republished per round): https://claude.ai/artifact/5UpT6gsdr4QyHcy3WxqFCr

## Harness

`scratch/h23/ab.mjs` (force-added) emulates the owner's phone in Chromium: 844×390 landscape, DPR 3, touch,
an iPhone Safari user agent. So `GLX.isMobile` and `mobileTier` are true, the pointer is coarse and the
resolution defaults to LOW (0.5). TLX is pinned to three's WebGL2 path (`apex26.tlxForceGL=1`), which is the
iPhone path (`PHONE-GPU-TEST-2026-10-21.md`, `facts.backendPick.api`). It renders on SwiftShader. Pixels and
memory counts from this box are valid. Its frame times are not (§3), so frame time comes from the macOS GPU census.

## Decision

Bryce, 2026-10-21 05:48Z (relayed by OrchB 26): **keep TLX as the default on phones.** GLX stays available through RENDERER.
The measurements below stand as the record. The TLX phone gaps they found are open follow-ups:

1. **Missing clouds and night stars on the TLX phone tier.** GLX draws them; TLX's frames at phone settings show a flat sky
   (Spa, Monza, Singapore, §1). First probe `__tlx.memState().sky.cache` on the phone profile to tell "off" from "empty", then
   decide whether it is a defect.
2. **Memory gap.** TLX holds 30 MiB more than GLX at the menu and 42–53 MiB more in a race (§2), and 59 MiB more JS heap on
   the Mac GPU (§3). This is mostly three's CPU geometry copies (`tlx.js` ~176), the cost that has jetsam-killed an iPhone
   tab before. Releasing them has failed four times (`CEILING-HISTORY.md` ~1478).
3. **Race entry takes 19.1 s on TLX against 5.9 s on GLX** (Mac GPU, phone caps, §3). It also let the start sequence override
   a `park()` in this harness.
4. Minor: TLX garage edges are more stair-stepped than GLX's at LOW (§1).

## Recommendation (as sent before the decision)

Default phones to GLX and keep TLX one tap away in RENDERER.

- **Memory.** On the same phone settings, GLX holds about 30 MB less at the menu and 42–53 MB less in a race (JS heap plus
  ArrayBuffer backing stores). On the real-GPU Mac it holds 59 MiB less JS heap.
- **Frame time.** On the Mac GPU with phone caps, GLX keeps its full quality tier at the same frame rate. TLX sheds to tier 3.
- **Race entry.** GLX enters a race in 5.9 s, TLX in 19.1 s.
- **Look.** The frames are close, and GLX shows more: clouds and night stars, and smoother edges in the garage.
- **Cost.** Two first-class renderers, so a look fix lands in both. GLX also has one 1.4 s block during race entry, against
  0.5 s for TLX.

Switching the default is a separate PR, after Bryce decides.

## 1. Look: 38 stills

- **Harness.** 28 stills in the first pass and 10 in a reshoot. `scratch/h23/ab.mjs stills --backend three|webgl2 --tier low|med`.
- **Scenes.** Menu, garage, Monza (helmet, chase, mirror), Monaco kerbs (orbit), Spa (chase, rain) and Singapore at night.
  MED 0.75 + UPSCALE was shot for four scenes.
- **Diff.** `scratch/h23/diff.py` counts the pixels whose summed |ΔRGB| exceeds 30, the same rule as `backend-compare.mjs`. It
  crops the most different third of the frame at 3× (native DPR-3 pixels) and writes a heat map.

| pair | % px differ | MAD | what differs |
|---|---|---|---|
| menu | 0.0 | 0.0 | identical (DOM over a backdrop) |
| garage | 13.6 | 5.6 | TLX edges stair-stepped; GLX smoother |
| monza helmet (LOW) | 10.2 | 6.5 | sky; a radio toast on one frame |
| monza straight | 13.9 | 5.7 | GLX cloud layer, TLX flat sky |
| monaco kerbs LOW / MED | 8.5 / 8.5 | 3.9 / 4.0 | hillside tone and haze |
| spa chase LOW / MED | 6.8 / 6.8 | 3.3 / 3.3 | sky only |
| spa rain | 12.0 | 4.2 | GLX overcast band; TLX road a little brighter |
| singapore night LOW / MED | 3.1 / 2.0 | 1.9 / 1.4 | GLX faint night clouds and stars |
| mirror (helmet, HUD on) | 4.9 | 3.2 | matches |

Two pairs were dropped because they compared different moments, not different renderers.

- **Start grid.** The start lights and grid reached different states on the two renderers.
- **MED helmet.** TLX's slower race entry let the start sequence reset the car to the grid after `park()`, so the TLX frame
  shows the grid. The same slow entry shows on real hardware (§3).

**Sky finding, not traced to a cause.** In these frames TLX draws no clouds or night stars on the phone tier, and GLX does. The
TLX sky has a cloud cache (`tlx.js` ~1648). Whether it is off or still empty at phone settings needs a follow-up probe of
`memState().sky.cache` before anyone calls it a defect.

## 2. Memory

Method: three forced GCs, then `Runtime.getHeapUsage`. The figure is `usedSize` plus `backingStorageSize` (ArrayBuffer data),
which matches `performance.memory` to within 1 MB. Each race is `__apex.race(id)` and `go()`, sampled after 10 s of racing. One
browser per backend. The numbers come from `scratch/h23/ab.mjs mem`.

| moment | TLX total (ArrayBuffers) | GLX total (ArrayBuffers) | TLX − GLX |
|---|---|---|---|
| menu | 83.1 (44.2) | 53.1 (26.9) | +30.0 |
| race 1 Monza | 111.0 (73.4) | 65.2 (39.1) | +45.8 |
| race 2 Monaco | 101.2 (72.9) | 59.1 (35.1) | +42.1 |
| race 3 Spa | 119.0 (73.6) | 66.5 (39.7) | +52.5 |

All figures are MiB. Reading the table:

- **In race.** The ArrayBuffer gap is about 34–38 MiB, and the JS heap adds about 9–19 MiB more. Together that is in line with
  the ~54 MB of CPU geometry copies that `tlx.js` ~176 warns about on phones.
- **Leaks.** Across three races neither renderer grows beyond its per-circuit spread.
- **The earlier B·H16 census.** It reported TLX at 148–182 MB at the menu, with a different harness and metric. These numbers
  are post-GC used-plus-backing in one harness, so compare the deltas, not the absolutes.

## 3. Real GPU: gpu-census run 39549012663

The run was on macos-latest, Monza, helmet cam, `ls=apex26.forceMobileTier=1`, with a 20 s autopilot window. Verdict: success
on all legs, `gpuErrors` 0. The TLX row is the `webgl2` leg, path webgl2, which is the iPhone path.

| | TLX (three WebGL2) | GLX |
|---|---|---|
| fps / p50 / p95 | 25.9 / 36.4 / 74.2 ms | 24.9 / 33.4 / 78.0 ms |
| governor at end | tier 3 (shed), scale 0.8 | tier 2 (no shed), scale 0.9 |
| race entry (raceCall → trackReady) | 19.1 s | 5.9 s |
| longest entry block | 0.50 s | 1.44 s |
| JS heap | 133.7 MiB | 74.5 MiB |
| mirror | 546 frames drawn, 276×79 | 549 frames drawn, 276×79 |

This GPU is the CI Mac's paravirtual Apple GPU, not an iPhone. The phone answer is Bryce's on-phone PHONE TEST › GPU TEST
(`PHONE-GPU-TEST-2026-10-21.md`), run once per renderer.

**Local frame times are not usable.** SwiftShader at phone DPR ran 0.2–0.4 fps on both renderers, at a 4× CPU throttle and
unthrottled alike. That is not a phone signal, so no local frame time is reported.

## 4. Feature gaps: GLX vs TLX on phone settings

The table comes from a code read with `mobileTier` on, checked against the stills. Most phone gates are set once in `game.js`
and apply to both renderers.

| feature | TLX on phone | GLX on phone |
|---|---|---|
| sun shadow | 1024², single map, PCSS off (`tlx-shadow.js:65,128`) | same (`glx/shadow.js:14,175`) |
| car / lamp shadow maps | off, blob decal | off, blob decal |
| SSAO | half-res, off at night or autoTier ≥ 4 (shared, `game.js` ~8247) | same |
| bloom | 3 levels at userTier 2 (shared) | same |
| SSR (road / paint) | dry SSR off at tier ≥ 2; wet kept (shared) | same |
| env cube | never built on phone | never built on phone |
| mirror | shared MirrorPass, lite rung (`mirror-pass.js:43-87`) | same |
| liveries / baked pack | shared, phone variants | same |
| AA | FXAA, no MSAA | FXAA, no MSAA; garage edges smoother |
| lamp slots per fragment | 16 (TLX cap) | 48 |
| clouds / stars | not drawn in these frames | drawn |
| CPU geometry copies | about 54 MB (`tlx.js:176`) | none |

GLX lacks nothing a phone player sees. The items only TLX has are cost caps: the lamp-slot cap, the mirror lamp cap, the
ssrTag drop and the sky-cache knob.
