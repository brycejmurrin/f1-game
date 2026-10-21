# Live debugger — boot, race entry, garage warm (B·H29, 2026-10-21)

Lane B·H29 (fleet B, wave 26). It hunts load-time stalls on the phone path: race entry, the TLX garage/menu
program warm, GLX's race-entry block, and boot to first title paint and first tap. Evidence comes from
gpu-census JSON (macos-latest, Apple GPU) and `__apex` race-entry marks. Software frames are not GPU evidence.

## Findings

| id | file:line | severity | verdict | evidence |
|---|---|---|---|---|
| B1 | js/game.js startRaceBody (`RaceEntryProfile.requestWarm`) | info | BY-DESIGN | See §B1. TLX's 19.1 s entry from #3419 happens only on `entry=api`. Players take `entry=menu`, which enters in 2.0–2.5 s. |
| B2 | js/game.js `introWarm` / js/render/three/tlx.js `startProgramWarm` | high | CONFIRMED (census) | See §B2. The player waits for the TLX menu warm: menu `prepWaitMs` is 19–35 s on TLX against 3.3–4.2 s on GLX. |
| B3 | js/render/three/tlx.js `startProgramWarm` usePost | medium | measuring | See §B3. The noEnv rule (B·H16's 191630a2) is under a same-base census A/B, 2× per side. |

### B1. The 19.1 s TLX race entry is the `api` path

gpu-census 39549012663 (#3419) entered with `__apex.race()` (`entry=api`). Its TLX race entry breaks down as:
- `mirrorPrepare` 15.5 s, which waits on `gfx.warm()`: 14.95 s in total;
- the warm stages: scene 3877 ms, fx 3863 ms, post 2642 ms, mirror 480 ms, draw 4087 ms;
- 3.3 s of main-thread block, longest 502 ms.

GLX has no `warm()`, so the same path entered in 5.9 s. The deploy-tip api census 39585811689 measured TLX-WebGL2 at
35.2 s, with a warm of 22.1 s and a longest block of 6.3 s.

A player never takes this path. `menuFinish` warms the world while the menu idles, and `startRaceBody` then skips the
warm (`warm:skipped-menu`). The `entry=menu` legs measured:

| census | TLX-WebGL2 entry | TLX-WebGPU entry | GLX entry |
|---|---|---|---|
| 39550539641 (deploy @50cc71dd) | 2.03 s | 0.96 s | 1.18 s |
| 39549545270 (cfefcbf7 + noEnv rule) | 2.54 s | 1.15 s | 1.66 s |

The residue is starts that bypass `menuFinish`: Daily, lobby and agent starts. That gap was already parked by OrchB 24
(BOOT-LOAD-TOOLING-RESEARCH §Prior art). Read TLX race-entry numbers only from `entry=menu` legs.

### B2. The player waits on the menu warm, not the race entry

On a menu leg, `menu.prepWaitMs` runs from RACE SETTINGS to `menuPrep()` being settled with the garage prewarmed.
`introWarm` holds RACE! behind the card for the same window, so a player who taps RACE! early waits for whatever is
left of it.

| census | TLX-WebGL2 | TLX-WebGPU | GLX |
|---|---|---|---|
| 39550539641 | 20.2 s | 19.0 s | 3.3 s |
| 39549545270 | 34.6 s | 21.3 s | 4.2 s |

The menu warm's `warmHistory[0]` on TLX-WebGL2:
- 39550539641: scene 3433, fx 1316, post 2126, mirror 3403, draw 5013 ms; total 15.3 s.
- 39549545270: scene 6542, fx 1604, post 3351, mirror 9374, draw 5075 ms; total 26.0 s.

The draw stage sits at the 5 s `_gpuSettled` cap in most runs. Per #3408, the fence is not stuck: other runs settle
"done" in 2.0–4.5 s. The cap therefore measures real GPU-process work.

### B3. noEnv warm rule, same-base A/B

#3408 left this measurement open. Base is the deploy tip 17454150, on branch `cursor/live-debug-boot-1-base-h29a`.
PR is the same tip plus 191630a2, on `cursor/live-debug-boot-1-h29a`. Both run gpu-census `entry=menu` on
macos-latest, 2× per side:

| side | run | TLX-WebGL2 prepWait / garage frames | TLX-WebGPU prepWait / garage frames | GLX |
|---|---|---|---|---|
| base | 39656588971 | | | |
| base | 39656626526 | | | |
| PR | 39656593801 | | | |
| PR | 39656631564 | | | |
