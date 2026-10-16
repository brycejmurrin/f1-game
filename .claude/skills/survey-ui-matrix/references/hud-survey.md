## Fast path for the RACE HUD: `apex_hud_survey` / `tools/shot/hud-survey.mjs`

The menus above are `layout-audit`; the in-race HUD (devices × cameras × MOVE &
SIZE presets × theme / CVD / contrast / text × HUD / UI / BUTTON size × MAP /
GAPS / MIRROR × HudElements toggles × night × track) is one CLI that boots a
race, measures every HUD box (overlap, missing-vs-expected, offscreen, unsafe,
tiny text, page errors) and writes `report.json`, `findings.md`, `index.html`
and contact sheets under `artifacts/hud-survey/<stamp>/`. Browser-free first:

```sh
node tools/shot/hud-survey.mjs --self-test               # pure logic, no browser
node tools/shot/hud-survey.mjs --list --matrix leads     # cells + cost, no browser
node tools/shot/hud-survey.mjs --matrix quick --only chase-default   # 1 boot, ~2 min
node tools/shot/hud-survey.mjs --matrix quick            # 13 cells / 3 boots, ~10 min
node tools/shot/hud-survey.mjs --matrix quick --no-shots --gl llvmpipe   # MEASURE FIRST: 5.4 min, then --only <cells with findings> for pixels
node tools/shot/hud-survey.mjs --matrix leads            # static-audit repros with numeric checks
# full ≈ 45 min (pairwise); exhaustive ≈ 4 h → shard it: --shard i/n, then --merge <dirs>,
# or dispatch .github/workflows/hud-survey.yml (llvmpipe shards + one merged artifact)
```

MCP: `apex_hud_shot` (one cell's knobs → `structuredContent` {shot, findings,
measurements} + a `resource_link` to the PNG) and `apex_hud_survey` (`matrix`,
`only`, `shard`, `noShots` → findings summary + links to findings.md /
index.html). Both take `scratch/apex-browser.lock` — `apex_status` first. A
`missing` finding is the point: an element the settings promise but the page
hides (the expected-visible rules live in `tools/lib/hud-survey-matrix.mjs`).
