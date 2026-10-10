# MCP bug survey — 2026-10-10

Read-only pass on ship tip (`22d941cf7` + local survey branch) via apex-tools MCP + screenshots.
Artifacts: `/opt/cursor/artifacts/bug-survey/` (and `artifacts/layout-audit/` for the matrix).

## Method
- Tree: `apex_doctor`, `apex_track_audit monza`, `apex_car_audit` ladder+crest, `float_all` job
- Browser: `ui_matrix` 6 screens × 3 viewports (~129 s), `apex_shot` monza orbit, `apex_hud_shot` phoneL-chase, `apex_agent` spa `world`
- Screenshots under `/opt/cursor/artifacts/bug-survey/`

## New / actionable findings

### B1 — Title menu CAREER / icon clipping (phone landscape)
`ui_matrix` / layout-audit: `#mb-career` clipped by `#menu-buttons` on `ios-iphone-landscape` (and icon SVGs clipped on 844 / desktop).  
Evidence: `artifacts/layout-audit/audit.json` title rows; `title-phone-clip.png`.  
Lane: UI Survey / `css/menus.css` or title markup — several UI Survey claims already live; do not duplicate without coordinating.

### B2 — `apex_shot` free-cam metadata reports game mode `helmet`
`apex_shot {cam:"orbit"}` correctly sets dbgCam (`dbgCamActive:true`) but `out.frame.camera.mode` stays `helmet` (leftover CamModes index). Misleading for agents asserting camera.  
Evidence: `shot-monza-orbit.json` + PNG.  
Fix idea: when `dbgCamActive`, report `camera.mode` as the free-cam id (`orbit`/`eye`/…) instead of CamModes.

### B3 — HUD phone overlaps (limits×inputs, flag×announce)
`apex_hud_shot` phone-landscape-844x390 chase: 2 medium overlaps (291 px² and 1981 px²).  
Evidence: `hud-shot-findings.md`, `hud-shot-phoneL-chase.png`.  
Lane: HUD Phase 0 / phone layout agents already claimed — hand off, do not fork.

### B4 — MCP arg inconsistency: `image` vs `inlineImage`
`apex_ui_shot` / `apex_shot` take `image`; `apex_hud_shot` takes `inlineImage` only (`image:true` → bad_args, though did-you-mean suggests `image` wrongly for the reverse).  
Evidence: `hud-shot-bad-args.json`, `ui-shot-title.json` (inlineImage refused on ui_shot).  
Fix: accept both names on HUD wraps (alias) and/or unify schema descriptions.

### B5 — `world().rivals[].lapsAhead` vs `lap` / `rel` contradiction
Spa `apex_agent` world: rivals with `lap:0`, `rel:"behind"`, yet `lapsAhead:1`. Ego P22 lap 0.  
Evidence: `agent-spa-world.json`.  
Likely wrap/arc signing in the agent world pack — needs a focused agent-view repro before a code change.

## Not bugs / expected
- `apex_car_audit` ladder marks Intermediate / Full Wet as `dead` in the dry parts ladder (wet compounds) — likely catalog intent; confirm before “fixing”.
- `float_all` exit 0; monza track audit ok.
- Garage desktop cell `page.click` timeout skip under load — re-run alone (AGENTS timeout rule).
- Data Hub deepScroll tall panels — informational, not findings.

## Improvements (non-defect)
1. Alias `image` ↔ `inlineImage` across shot/ui/hud MCP wraps.
2. Free-cam mode echo in `apex_shot` frame metadata (B2).
3. `ui_matrix` dryRun already returns `estimateMs` (landed #1338).

## Fixed in follow-up on this branch
- **B2** — `tools/shot/shot.mjs` echoes the free-cam id (`orbit`/…) on `frame.camera.mode` when `dbgCamActive`.
- **B4** — MCP aliases `image` ↔ `inlineImage` across `apex_hud_shot` / `apex_ui_shot` / `apex_shot`.
- **B1** — compact-wide live Home: `#menu-buttons` inline pad clears CAREER skew tip; under-brand rooms `justify-content:flex-start` so `.btn-ico` is not clipped.
- **B3** — `#announce` caution step follows `data-gap-drop` flag edge; phone `#hud-inputs` clears a visible `#hud-limits`.
- **B5** — `world().rivals[].lapsAhead` is lap-counter standing (`c.lap - p.lap`); road `gap` is `prog` minus that standing (keeps lapped-ahead contract).
