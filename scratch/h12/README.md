# B·H12 live-memory helpers (handoff, 2026-10-21)

Pushed so nothing stays container-local (fleet rotation). `scratch/` is git-ignored; these were force-added on a
no-PR branch. Copy into a checkout's `scratch/h12/` to use.

- `leak-run.mjs` — phone-profile (844×390, isMobile, touch) race-cycle heap harness: post-GC `Runtime.getHeapUsage`,
  DOM counters, store-write counter, optional heap snapshots (`--snap DIR`, cycle 2 lap 1 too), `--root <checkout>` for
  A/B. `node scratch/h12/leak-run.mjs --cycles 3 --laps 5 --render-s 5 --out scratch/h12/run.json [--snap DIR] [--root DIR]`
- `digest.mjs` — bit-identity A/B: monza → spa → suzuka, seed 42, 3000 steps; `--mode vm` (raw car fields via
  game-vm) or `--mode browser` (`fieldState()`); `--root <checkout>`.
- `vm-retain.mjs` + `owner.py` — tag the old track with a marker class in game-vm, write a heap snapshot, find the
  track node id; then `get_heapsnapshot_retaining_paths` (chrome-devtools MCP) on it.
- `MEMORY-TOOLING-RESEARCH-2026-10-21.md` — draft of the note that rides PR #3391.
