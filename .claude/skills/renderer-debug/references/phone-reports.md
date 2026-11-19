# A report from a phone: the evidence ladder and the GPU census

Load from SKILL.md when the defect was seen on a real device (iPhone, Safari,
a Mac) rather than in a container probe.

The owner's device path is TLX on WebGPU (Metal), `THREE PATH: WEBGPU`
(memory `bryce-iphone-tlx-webgpu`). Container probes pin `apex26.tlxForceGL=1`
(`.claude/rules/render-tlx.md`), so they never exercise that path.

## Ladder, cheapest first

1. Ask for the on-device overlay: open the game with `?gfxdebug=1` (or set
   `apex26.gfxDebug="1"`) and paste its Copy line (`js/perf/gfx-debug-overlay.js`).
   Free, and it is the reporter's device: read the backend, the
   `three api=… pin=… soft=…` row (which TLX leg bound) and `gpuErrors`.
2. `gpu-census.yml` on `macos-latest`: a real GPU, but **Chromium/Dawn on Metal,
   not WebKit/Safari** (read its `path:` row and the Verdict step). A green census
   does not clear a WebKit-only failure (derivative uniformity, `uncapturederror`,
   the `var<private>` cap: the "Five WGSL rules" in `.claude/rules/render-wgx.md`).
3. A real iPhone Safari: the `browserstack` MCP (`docs/AGENT-SURFACE.md`; real iOS
   devices, outward and metered).
4. A software probe here: WGSL/pipeline validation only (AGENTS.md
   §Verification).

## Dispatching the census

On your pushed branch:
the GitHub MCP `actions_run_trigger` on `gpu-census.yml` (ref `<branch>`, inputs `track`, `tod`, …);
never `gh workflow run`: a gh write is recorded as Bryce's own act and `bash-guard.sh` refuses it.

Only a request-only leg (`leg`, `lf_*`, `lrm_*` in
`.github/gpu-census-request.json`; the dispatch form is at GitHub's input cap) still goes by
editing that file on your branch and pushing.
