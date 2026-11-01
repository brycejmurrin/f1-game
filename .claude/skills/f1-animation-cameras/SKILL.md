---
name: f1-animation-cameras
description: "Use when changing camera or animation motion: garage pit-work arrivals, chase, broadcast or Flyby cameras, camera tuners, follow blends, jumpy cuts, replay cameras that snap or keep a stale follow anchor after a seek. Not measuring lag or stills → playwright-probe; handling → tune-physics."
---

# Animation and cameras in f1-game

Start with [the local game guide](references/game.md), then trace the named
motion or camera owner. Separate car/world state from camera interpolation;
measure the transition that prompted the change with a deterministic fixture.

`node tools/check/skill-smoke.mjs --skill f1-animation-cameras --check` exercises
the local chase-rig contract. Replay snaps and stale follow anchors (entry → seek →
follow → exit → reentry): [references/replay.md](references/replay.md). A HIGHLIGHTS seek snap is designed
(`references/replay-diagnosis.md`; evidence contract `references/replay-workflow.md`). MEASURING camera lag, modes and
still framing: [playwright-probe camera measurements](../playwright-probe/references/cameras.md); FIXING lag
(rig, blend, tuner defaults) is this skill.
Flyby framing (cover, occlusion, sky, motion) has a no-browser node-VM report:
`node tools/shot/frame-report.mjs --track monza --frames 6` (MCP `apex_frame_report`); it covers Flyby only, not the director or mode cuts.
Garage mesh/ownership uses **garage-parts-livery**. The parent owns every
browser; subagents can inspect fixture, source and recorded evidence.

Camera file owners and the cut-jump recipe: [references/cut-jump.md](references/cut-jump.md).
Named symbols (`seekTo`, `GarageArrival.pose`, `G.snapGameCam`): apex-lsp, skill **code-nav**.
