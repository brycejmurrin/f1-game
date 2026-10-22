# iPhone BrowserStack profiling — 2026-10-21

Real-device frame and hitch numbers from BrowserStack runs on 2026-10-21. The suite
lives outside this repo on Bryce's box; this note is the committed summary that
drove D·IP1 (phone ULTRA cap + weak-phone default in `js/perf/quality-preset.js`).

Related in-repo context: `docs/notes/PHONE-GPU-TEST-2026-10-21.md`,
`docs/notes/RENDER-SETTINGS-TOOLING-RESEARCH-2026-10-21.md`,
`docs/notes/PHONE-RENDERER-AB-2026-10-21.md`, `docs/notes/LIVE-FRAME-H10-2026-10-20.md`.

## Devices and backends

| device | OS | backend (as run) | notes |
|---|---|---|---|
| iPhone 15 | iOS 26, Safari | three.js / WebGPU | Primary racing + preset drive |
| iPhone 13 | iOS 18, WebGL | three.js WebGL2 path | Idle on default settings |
| iPhone 17 Pro | (BrowserStack) | — | Race-start load only in this pass |

Phones already boot at **RESOLUTION LOW** (`renderScale` 0.5) via `js/ui/scale.js`
`defaultResMode()`. The GRAPHICS preset is separate: capable phones had been
shipping **MEDIUM**; ULTRA was still selectable and flipped the legacy
`apex26.gfxHigh` desktop-memory boot tier.

## Racing — MEDIUM (iPhone 15)

60 s class samples, avg / 5% / 1% low (fps):

| circuit | avg | 5% | 1% | race load |
|---|---:|---:|---:|---:|
| Monza | 57.6 | 45.5 | 30.3 | 17.0 s |
| Singapore night | 45.3 | 31.3 | 21.7 | 16.6 s |

MEDIUM is playable on a current iPhone. Singapore night is the harder of the two
(night lamps / post), still above a soft 40 fps average.

## Preset drive — Monza 60 s (iPhone 15)

| GRAPHICS | avg fps |
|---|---:|
| LOW | 51.2 |
| MEDIUM | 57.6 |
| HIGH | 50.7 |
| ULTRA | **24.5** |

ULTRA detail: **24.5 avg / 14.1 1% low**; at `renderScale` 1.0 it held **11.9 fps**
with **no governor recovery**. That is the product reason ULTRA is capped on
phone-class devices (ceiling **HIGH**, row shows `ULTRA — NOT ON PHONES`).

LOW averaging below MEDIUM is consistent with the governor / tier floor trading
image cost for stability rather than maximising fps on an already-capable phone.

## Older phone — iPhone 13

Idle **24.9 fps** on the then-default settings (MEDIUM-class). That is why a
**weak** phone (no `navigator.gpu`, or `deviceMemory` &lt; 4) now defaults to
**LOW** instead of MEDIUM. iPhone 15-class devices with WebGPU stay on MEDIUM.

## Menu / garage hitches (iPhone 15)

| action | cost |
|---|---|
| Settings open | **3,711 ms** freeze |
| Back to title from race select (worst frame) | **1,228 ms** |
| Garage steady | 59–60 fps |
| Team switch → McLaren | **1,029 ms** |
| Livery changes | 107–173 ms |

Settings / navigation freezes are owned elsewhere (D·IP2 settings UI); recorded
here so the perf ledger does not lose them. Garage paint stays near vsync;
team switches are the expensive garage mutation.

## Race start load

| device | race start |
|---|---:|
| iPhone 17 Pro | **13.5 s** |
| older phones (this suite) | ~**4.5 s** |

The newer device being *slower* to enter a race matches the in-repo TLX vs GLX
phone A/B (`PHONE-RENDERER-AB-2026-10-21.md`: TLX race entry ~19 s vs GLX ~5.9 s
on the Mac GPU with phone caps). Treat 13.5 s as a load-path / backend cost, not
as evidence that ULTRA is fine.

## Product decisions taken from this pass

1. **ULTRA unavailable on phones** — auto-capped to HIGH; SettingRow disables
   ULTRA with a visible note (`GfxQuality.PHONE_ULTRA_NOTE` /
   `PHONE_CAP_TITLE`).
2. **Weak phones default LOW** — `GfxQuality.isWeakPhone()` + `defaultId`.
3. **Capable phones keep MEDIUM** — Monza 57.6 / Singapore night 45.3 on iPhone 15.
4. RESOLUTION LOW (0.5) at phone boot is unchanged and remains the fill-rate
   floor the governor climbs from.

## Suite provenance

BrowserStack Automate on real iOS Safari, 2026-10-21. Scripts and raw JSON are
not in this repository; they live on Bryce's machine. Re-runs should keep the
same columns (avg / 5% / 1%, load seconds, hitch ms) so this file can grow rows
without renaming the decisions above.
