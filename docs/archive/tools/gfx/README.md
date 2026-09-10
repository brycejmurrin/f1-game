# Archived gfx one-shot / closed repros

Closed research CLIs removed from the live `tools/gfx/` surface:

| File | Why archived |
|---|---|
| `wgx-vid-repro.mjs` | Closed `vertex_index` repro; unit tests pin the lesson |
| `wgpu-flag-test.mjs` | Flag matrix evidence already in notes |
| `soft-present-bench.mjs` | Perf note tool; software blit ≠ player FPS |
| `heap-stages.mjs` | One-off TLX/GLX heap staging |

Prefer `gfx-probe.mjs` / `wgx-validate.mjs --static` for agent work.
