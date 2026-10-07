# MCP host-timeout opportunities (2026-10-07)

Evidence: mobile agent **Mcp Whooo** (`bc-01a1147f…`) — `apex_shot_survey` dual timed out on host MCP; CLI succeeded; parallel surveys hit `lock_held`.

## Shipped in this change (server 1.12.0)

| Gap | Fix |
|---|---|
| Long shot surveys block MCP | Auto-route ≥5 shots / multi-track / `async:true` → job `shot_survey` |
| Multi-track "parallel" | `tracks` queues sequentially; one Chromium |
| No CLI for jobs | `tools/shot/track-shot-survey.mjs` + `= shot i/n` progress |
| HUD ~2–45 min sync | `apex_hud_*` default → jobs `hud_shot` / `hud_survey` (`sync:true` opt-out) |

## Still open (P1)

| Tool | Issue | Suggested fix |
|---|---|---|
| `apex_shot` / `apex_agent` | Cold boot often >60 s on host | Desc wall-time; hint `apex_track` for ≥2 shots; optional `--vm` for non-raster agent cmds |
| `apex_garage` open | Ready wait up to 180 s | Publish open ETA; progress refuse |
| `apex_track` open | ~27–30 s borderline at 60 s | Session already good; document |
| Job status | Tail only | Surface `= shot` / cell progress more clearly in `out` |
| True parallel browsers | Agents ask | Refuse permanently — AGENTS.md one lock |

## Already good patterns

`apex_graph_parity` all→job, `apex_ui_*` + `ui_matrix`/`ui_gallery` jobs, `apex_car_audit` refuse→`parts_sweep`, `apex_frame_report` + `frame_fleet`.
