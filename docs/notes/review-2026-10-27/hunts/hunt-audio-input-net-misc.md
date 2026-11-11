# Opus hunt: js/audio, input, net, xr, workers, camera, perf, agent (2026-10-27)
F1 low dead-code js/workers/bitmap-decode-client.js:75-134 + bitmap-decode-worker.js:114-143 — BitmapDecode.decode has no production caller (only assets.js uses stripEnabled/strip). Delete decode path + test cases. CODE-TRACED
F2 low perf bitmap-decode-client.js:144-170 / worker.js:23-39 — (packDecodeWorker=1 only) worker never terminated after strip; inflate keeps decompressing past `needed`. PLAUSIBLE
F3 low bug js/perf/thermal-drift.js:24,36-42,56 — cooldown only counts after a new baseline; measured gaps 160-200 s vs documented 60 s. Fix: decrement cool during re-baseline or fix comment. CONFIRMED (VM measured)
Traced clean: hold-buttons release nets, phone-pad, WebRTC teardown, session close, QR scan camera stop, XR session, audio unlock listeners.
Not covered: most of the 90-file slice (engine.js rest, input.js rest, netplay, lobby, nostr, governor, js/agent).
