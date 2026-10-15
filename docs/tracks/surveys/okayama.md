# Okayama — circuit survey (2026-10-14)

Pacific GP / TI Circuit Aida. **36** survey JPEGs (`artifacts/shots/tracks/okayama/`, q80, ≤1280px, <300KB). Captures: `shot.mjs --jpeg --present-timeout 90 --capture-retries 4 --wait 120` (SwiftShader / TLX default).

## Panel grid (36 frames)

| ![00 track picker still](../../../artifacts/shots/tracks/okayama/00-track-picker-still.jpg) | ![s1 dunlop eye](../../../artifacts/shots/tracks/okayama/s1-dunlop-eye__day-dry.jpg) | ![s1 dunlop eye](../../../artifacts/shots/tracks/okayama/s1-dunlop-eye__day-fog.jpg) |
| **00 track picker still** · wx=dry · tod=day | **s1 dunlop eye** · wx=dry · tod=day | **s1 dunlop eye** · wx=fog · tod=day |

| ![s1 dunlop eye](../../../artifacts/shots/tracks/okayama/s1-dunlop-eye__day-overcast.jpg) | ![s1 dunlop eye](../../../artifacts/shots/tracks/okayama/s1-dunlop-eye__day-rain.jpg) | ![s1 dunlop eye](../../../artifacts/shots/tracks/okayama/s1-dunlop-eye__day-wet.jpg) |
| **s1 dunlop eye** · wx=overcast · tod=day | **s1 dunlop eye** · wx=rain · tod=day | **s1 dunlop eye** · wx=wet · tod=day |

| ![s1 pit orbit](../../../artifacts/shots/tracks/okayama/s1-pit-orbit__day-dry.jpg) | ![s1 pit orbit](../../../artifacts/shots/tracks/okayama/s1-pit-orbit__day-fog.jpg) | ![s1 pit orbit](../../../artifacts/shots/tracks/okayama/s1-pit-orbit__day-overcast.jpg) |
| **s1 pit orbit** · wx=dry · tod=day | **s1 pit orbit** · wx=fog · tod=day | **s1 pit orbit** · wx=overcast · tod=day |

| ![s1 pit orbit](../../../artifacts/shots/tracks/okayama/s1-pit-orbit__day-rain.jpg) | ![s1 pit orbit](../../../artifacts/shots/tracks/okayama/s1-pit-orbit__day-storm.jpg) | ![s1 pit orbit](../../../artifacts/shots/tracks/okayama/s1-pit-orbit__day-wet.jpg) |
| **s1 pit orbit** · wx=rain · tod=day | **s1 pit orbit** · wx=storm · tod=day | **s1 pit orbit** · wx=wet · tod=day |

| ![s1 pit orbit](../../../artifacts/shots/tracks/okayama/s1-pit-orbit__dusk-dry.jpg) | ![s1 pit orbit](../../../artifacts/shots/tracks/okayama/s1-pit-orbit__night-dry.jpg) | ![s1 stand ts](../../../artifacts/shots/tracks/okayama/s1-stand-ts__day-dry.jpg) |
| **s1 pit orbit** · wx=dry · tod=dusk | **s1 pit orbit** · wx=dry · tod=night | **s1 stand ts** · wx=dry · tod=day |

| ![s2 hairpin ts](../../../artifacts/shots/tracks/okayama/s2-hairpin-ts__day-dry.jpg) | ![s2 hairpin ts](../../../artifacts/shots/tracks/okayama/s2-hairpin-ts__day-fog.jpg) | ![s2 hairpin ts](../../../artifacts/shots/tracks/okayama/s2-hairpin-ts__day-overcast.jpg) |
| **s2 hairpin ts** · wx=dry · tod=day | **s2 hairpin ts** · wx=fog · tod=day | **s2 hairpin ts** · wx=overcast · tod=day |

| ![s2 hairpin ts](../../../artifacts/shots/tracks/okayama/s2-hairpin-ts__day-rain.jpg) | ![s2 hairpin ts](../../../artifacts/shots/tracks/okayama/s2-hairpin-ts__day-wet.jpg) | ![s2 turn1 ts](../../../artifacts/shots/tracks/okayama/s2-turn1-ts__day-dry.jpg) |
| **s2 hairpin ts** · wx=rain · tod=day | **s2 hairpin ts** · wx=wet · tod=day | **s2 turn1 ts** · wx=dry · tod=day |

| ![s2 turn1 ts](../../../artifacts/shots/tracks/okayama/s2-turn1-ts__day-fog.jpg) | ![s2 turn1 ts](../../../artifacts/shots/tracks/okayama/s2-turn1-ts__day-overcast.jpg) | ![s2 turn1 ts](../../../artifacts/shots/tracks/okayama/s2-turn1-ts__day-rain.jpg) |
| **s2 turn1 ts** · wx=fog · tod=day | **s2 turn1 ts** · wx=overcast · tod=day | **s2 turn1 ts** · wx=rain · tod=day |

| ![s2 turn1 ts](../../../artifacts/shots/tracks/okayama/s2-turn1-ts__day-wet.jpg) | ![s2 williams orbit](../../../artifacts/shots/tracks/okayama/s2-williams-orbit__day-dry.jpg) | ![s2 williams orbit](../../../artifacts/shots/tracks/okayama/s2-williams-orbit__day-fog.jpg) |
| **s2 turn1 ts** · wx=wet · tod=day | **s2 williams orbit** · wx=dry · tod=day | **s2 williams orbit** · wx=fog · tod=day |

| ![s2 williams orbit](../../../artifacts/shots/tracks/okayama/s2-williams-orbit__day-overcast.jpg) | ![s2 williams orbit](../../../artifacts/shots/tracks/okayama/s2-williams-orbit__day-rain.jpg) | ![s2 williams orbit](../../../artifacts/shots/tracks/okayama/s2-williams-orbit__day-wet.jpg) |
| **s2 williams orbit** · wx=overcast · tod=day | **s2 williams orbit** · wx=rain · tod=day | **s2 williams orbit** · wx=wet · tod=day |

| ![s3 hobbs ts](../../../artifacts/shots/tracks/okayama/s3-hobbs-ts__day-dry.jpg) | ![s3 hobbs ts](../../../artifacts/shots/tracks/okayama/s3-hobbs-ts__day-fog.jpg) | ![s3 hobbs ts](../../../artifacts/shots/tracks/okayama/s3-hobbs-ts__day-overcast.jpg) |
| **s3 hobbs ts** · wx=dry · tod=day | **s3 hobbs ts** · wx=fog · tod=day | **s3 hobbs ts** · wx=overcast · tod=day |

| ![s3 hobbs ts](../../../artifacts/shots/tracks/okayama/s3-hobbs-ts__day-rain.jpg) | ![s3 hobbs ts](../../../artifacts/shots/tracks/okayama/s3-hobbs-ts__day-wet.jpg) | ![s3 last ts](../../../artifacts/shots/tracks/okayama/s3-last-ts__day-dry.jpg) |
| **s3 hobbs ts** · wx=rain · tod=day | **s3 hobbs ts** · wx=wet · tod=day | **s3 last ts** · wx=dry · tod=day |


## Verification

```text
node tools/track/verify-track.cjs okayama
```
