# MCP host-timeout opportunities (2026-10-07)

Evidence: mobile agent **Mcp Whooo** (`bc-01a1147f…`) — `apex_shot_survey` dual timed out on host MCP; CLI succeeded; parallel surveys hit `lock_held`.

## Shipped

| Gap | Fix | Where |
|---|---|---|
| Long shot surveys block MCP | Long / multi-track `apex_shot_survey` → job `shot_survey` | #1184 |
| Multi-track "parallel" | `tracks[]` queues sequentially; one Chromium | #1184 |
| No CLI for jobs | `tools/shot/shot-survey.mjs` | #1184 |
| HUD ~2–45 min sync | `apex_hud_*` default → jobs `hud_shot` / `hud_survey` (`async:false` opt-out) | #1192 |

## Still open (P1)

| Tool | Issue | Suggested fix |
|---|---|---|
| `apex_shot` / `apex_agent` | Cold boot often >60 s on host | Desc wall-time; hint `apex_track` for ≥2 shots; optional `--vm` for non-raster agent cmds |
| `apex_garage` open | Ready wait up to 180 s | Publish open ETA; progress refuse |
| `apex_track` open | ~27–30 s borderline at 60 s | Session already good; document |
| Job status | Tail only | Surface shot / cell progress more clearly in `out` |
| True parallel browsers | Agents ask | Refuse permanently — AGENTS.md one lock |

## Already good patterns

`apex_graph_parity` all→job, `apex_ui_*` + `ui_matrix`/`ui_gallery` jobs, `apex_car_audit` refuse→`parts_sweep`, `apex_frame_report` + `frame_fleet`.
