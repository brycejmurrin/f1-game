# UI-matrix verification, regression proof and evidence

## Contents
- Default-first visual verification
- Regression: proving a CSS change broke no other shape
- Capture identity
- Hand-off and evidence

## Default-first visual verification

Bryce's profile first (`ios-iphone-landscape-844`, touch). Then fresh shipped appearance and device input
defaults (AGENTS.md §Seeing the game); stress scales, imported settings and legacy looks are separately
labelled comparisons. Record requested scale and painted zoom.

Inspect original full-size images with DOM/computed-style evidence; thumbnails and zero inspector findings
are insufficient. Exercise real scrolling both ways, the final action, keyboard focus visibility, and state
retention through resizing and disclosure changes. Capture initial, mid-scroll, end, return, open/closed,
and focus/rotation checkpoints. Show individual original captures when reporting usability.

`layout-audit` is static geometry; the scroll / final-action / focus / roundtrip checkpoints come from MCP
`apex_ui_inspect` (roundtrip) or `tools/ui/explorer.mjs` (skill ui-menu-a11y), or Playwright MCP
(`tools/mcp/playwright-mcp.sh`) / Chrome DevTools MCP only after the layout-audit / menu-mock job has exited
(`browser_close` first; AGENTS.md rule 5).

## Regression: proving a CSS change broke no other shape

1. Before editing: `cp artifacts/layout-audit/audit.json artifacts/layout-audit/audit.before.json`
   (a run MERGES into audit.json by screen|viewport, so the baseline is gone once you re-run).
2. After: re-run the same `--screens/--viewports/--scale` scope.
3. `node tools/ui/layout-audit.mjs --diff=artifacts/layout-audit/audit.before.json` (no browser,
   parent-only): `+`/`-` lines per cell, `= diff ok|NEW` last, exit 1 on any new
   clipped/offscreen/docOverflowX/tinyTaps/underHardware/starved/error finding; a skipped cell is listed
   as unmeasured, never a pass.
4. Add `fit-audit.mjs --scale=` for type/spacing floors (no exit code) and `test:baseline` (6 pixel PNGs)
   for identity.
5. Record baseline path, scope and the `= diff` line.

## Capture identity

For device-profile captures use the shared `tools/lib/ui-device-profile.mjs` resolver rather than
constructing `{hasTouch, viewport}` alone (`docs/notes/MOBILE-UI-EMULATION.md`). Explorer supports
`--device 'iPhone 13' --settings FILE` for a supplied baseline; without `--settings` the context uses fresh
shipped settings. Follow the user's requested baseline. Preserve the import result and actual scale in
evidence.

Full-screen geometry cells, browser-content device profiles, custom CSS resize stress cases and DPR1
optimized probes are distinct. Do not infer CSS dimensions or browser Page Zoom from screenshot pixel
dimensions. Record the actual engine; iPhone UA in Chromium does not establish Safari behavior.

## Hand-off and evidence

Shape: one parent, at most two reviewers. The parent runs the survey as ONE background job logging to
`artifacts/logs/` and spawns at most two read-only reviewers over the finished artifacts, never over a live
run. Reviewers return defect tables with screenshot paths and missing cells; the parent applies fixes via
`css-play` or `ui-menu-a11y`.

Publish the selected captures with
`node tools/shot/publish-evidence.mjs --dir artifacts/layout-audit --label <slug> --publish`
(`docs/EVIDENCE-STORAGE.md`); the PR body links the release assets, lists unmeasured cells as not run,
and records the `= diff` line when proving no regression.
