# R2 Opus hunt: audio, input, net, perf, xr, workers
F1 low bug js/perf/thermal-drift.js:42,56 — after stepped(), cool only counts down once a new baseline exists: 1+6+6 windows ≈130 s vs the documented ~60 s; second governor step ~70 s late. Fix: decrement cool during baseline collection (or COOL_WINDOWS=0). Test: tests/unit/thermal-drift.test.mjs assert firstDue window count. CODE-TRACED
F2 low bug js/xr/xr-session.js:258-264 — late attachSession from a cancelled session1 is not undone when start() already set _session=session2 (detach only if !_session). Fix: pass session to attach/detach, ignore stale. PLAUSIBLE
Checked clean: bitmap worker lifecycle, iOS audio resume, touch/pointer cancel release, transport/nostr/scan/session teardown, haptics, radio-voice cache.
Not covered: js/camera, js/agent, most of audio/input/net/xr/perf.
