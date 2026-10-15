# Baku City Circuit — survey (2026-10-14)

**Branch:** `cursor/baku-survey-e759` (on shared shot tooling) · **Live:** https://brycejmurrin.github.io/f1-game/  
**Theme:** `street_night` · **Shots:** 36 JPEGs in `artifacts/shots/tracks/baku/`

## Audits

```sh
node tools/track/verify-track.cjs baku
node tools/track/audit-circuit.cjs baku
```

**Re-capture (2026-10-15):** **36** JPEGs — `node tools/shot/shot.mjs --batch artifacts/shots/tracks/baku/capture-jobs.jsonl --jpeg --present-timeout 90 --capture-retries 4 --wait 120` (shared shot tooling #1862, SwiftShader).

## Panel grid (36 frames)

| ![lt castle dusk dry park](../../../artifacts/shots/tracks/baku/lt-castle-dusk-dry-park.jpg) | ![lt castle night dry park](../../../artifacts/shots/tracks/baku/lt-castle-night-dry-park.jpg) | ![lt flame dawn dry orbit](../../../artifacts/shots/tracks/baku/lt-flame-dawn-dry-orbit.jpg) |
| **lt castle dusk dry park** · wx=dry · tod=day | **lt castle night dry park** · wx=dry · tod=day | **lt flame dawn dry orbit** · wx=dry · tod=day |

| ![lt flame dusk dry orbit](../../../artifacts/shots/tracks/baku/lt-flame-dusk-dry-orbit.jpg) | ![lt flame night dry orbit](../../../artifacts/shots/tracks/baku/lt-flame-night-dry-orbit.jpg) | ![lt start dusk dry orbit](../../../artifacts/shots/tracks/baku/lt-start-dusk-dry-orbit.jpg) |
| **lt flame dusk dry orbit** · wx=dry · tod=day | **lt flame night dry orbit** · wx=dry · tod=day | **lt start dusk dry orbit** · wx=dry · tod=day |

| ![lt start night dry orbit](../../../artifacts/shots/tracks/baku/lt-start-night-dry-orbit.jpg) | ![lt straight dawn dry park](../../../artifacts/shots/tracks/baku/lt-straight-dawn-dry-park.jpg) | ![lt straight dusk dry park](../../../artifacts/shots/tracks/baku/lt-straight-dusk-dry-park.jpg) |
| **lt start night dry orbit** · wx=dry · tod=day | **lt straight dawn dry park** · wx=dry · tod=day | **lt straight dusk dry park** · wx=dry · tod=day |

| ![lt straight night dry park](../../../artifacts/shots/tracks/baku/lt-straight-night-dry-park.jpg) | ![sec castle day dry park](../../../artifacts/shots/tracks/baku/sec-castle-day-dry-park.jpg) | ![sec flame day dry orbit](../../../artifacts/shots/tracks/baku/sec-flame-day-dry-orbit.jpg) |
| **lt straight night dry park** · wx=dry · tod=day | **sec castle day dry park** · wx=dry · tod=day | **sec flame day dry orbit** · wx=dry · tod=day |

| ![sec maiden day dry orbit](../../../artifacts/shots/tracks/baku/sec-maiden-day-dry-orbit.jpg) | ![sec start day dry orbit](../../../artifacts/shots/tracks/baku/sec-start-day-dry-orbit.jpg) | ![sec straight day dry park](../../../artifacts/shots/tracks/baku/sec-straight-day-dry-park.jpg) |
| **sec maiden day dry orbit** · wx=dry · tod=day | **sec start day dry orbit** · wx=dry · tod=day | **sec straight day dry park** · wx=dry · tod=day |

| ![sec t1 day dry park](../../../artifacts/shots/tracks/baku/sec-t1-day-dry-park.jpg) | ![wx castle day fog park](../../../artifacts/shots/tracks/baku/wx-castle-day-fog-park.jpg) | ![wx castle day overcast park](../../../artifacts/shots/tracks/baku/wx-castle-day-overcast-park.jpg) |
| **sec t1 day dry park** · wx=dry · tod=day | **wx castle day fog park** · wx=dry · tod=day | **wx castle day overcast park** · wx=dry · tod=day |

| ![wx castle day rain park](../../../artifacts/shots/tracks/baku/wx-castle-day-rain-park.jpg) | ![wx castle day storm park](../../../artifacts/shots/tracks/baku/wx-castle-day-storm-park.jpg) | ![wx castle day wet park](../../../artifacts/shots/tracks/baku/wx-castle-day-wet-park.jpg) |
| **wx castle day rain park** · wx=dry · tod=day | **wx castle day storm park** · wx=dry · tod=day | **wx castle day wet park** · wx=dry · tod=day |

| ![wx flame day fog orbit](../../../artifacts/shots/tracks/baku/wx-flame-day-fog-orbit.jpg) | ![wx flame day overcast orbit](../../../artifacts/shots/tracks/baku/wx-flame-day-overcast-orbit.jpg) | ![wx flame day rain orbit](../../../artifacts/shots/tracks/baku/wx-flame-day-rain-orbit.jpg) |
| **wx flame day fog orbit** · wx=dry · tod=day | **wx flame day overcast orbit** · wx=dry · tod=day | **wx flame day rain orbit** · wx=dry · tod=day |

| ![wx flame day storm orbit](../../../artifacts/shots/tracks/baku/wx-flame-day-storm-orbit.jpg) | ![wx flame day wet orbit](../../../artifacts/shots/tracks/baku/wx-flame-day-wet-orbit.jpg) | ![wx start day fog orbit](../../../artifacts/shots/tracks/baku/wx-start-day-fog-orbit.jpg) |
| **wx flame day storm orbit** · wx=dry · tod=day | **wx flame day wet orbit** · wx=dry · tod=day | **wx start day fog orbit** · wx=dry · tod=day |

| ![wx start day overcast orbit](../../../artifacts/shots/tracks/baku/wx-start-day-overcast-orbit.jpg) | ![wx start day rain orbit](../../../artifacts/shots/tracks/baku/wx-start-day-rain-orbit.jpg) | ![wx start day storm orbit](../../../artifacts/shots/tracks/baku/wx-start-day-storm-orbit.jpg) |
| **wx start day overcast orbit** · wx=dry · tod=day | **wx start day rain orbit** · wx=dry · tod=day | **wx start day storm orbit** · wx=dry · tod=day |

| ![wx start day wet orbit](../../../artifacts/shots/tracks/baku/wx-start-day-wet-orbit.jpg) | ![wx straight day fog park](../../../artifacts/shots/tracks/baku/wx-straight-day-fog-park.jpg) | ![wx straight day overcast park](../../../artifacts/shots/tracks/baku/wx-straight-day-overcast-park.jpg) |
| **wx start day wet orbit** · wx=dry · tod=day | **wx straight day fog park** · wx=dry · tod=day | **wx straight day overcast park** · wx=dry · tod=day |

| ![wx straight day rain park](../../../artifacts/shots/tracks/baku/wx-straight-day-rain-park.jpg) | ![wx straight day storm park](../../../artifacts/shots/tracks/baku/wx-straight-day-storm-park.jpg) | ![wx straight day wet park](../../../artifacts/shots/tracks/baku/wx-straight-day-wet-park.jpg) |
| **wx straight day rain park** · wx=dry · tod=day | **wx straight day storm park** · wx=dry · tod=day | **wx straight day wet park** · wx=dry · tod=day |


## Verification

```text
node tools/track/verify-track.cjs baku
```
