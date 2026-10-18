# Procedural scenery and wet surfaces (adapted)

<!-- Source: https://github.com/scottstts/Threejs-Awesome-Graphics-Agent-Skills
     Commit: 897aaa0a49f9346f342993e1eb74a30479f82614
     License: MIT -->

Apex scenery is `scenery(api)` in `js/circuits/scenery/<id>.js` — instancing, not glTF imports.

| Upstream theme | Apex pattern |
|---|---|
| Vegetation / rocks | `api.tree`, `api.rock`, `TrackGraph.instance` migration |
| Buildings / grandstands | `api.building`, `references/instancing.md` |
| Wet road / puddles | Material + weather; coordinate with **lighting-tuner** |
| SSAO / depth | Renderer post; **renderer-debug** if missing on one backend |

Grounding: **survey-track** before dense dressing. Parity: `apex_graph_parity` tests.
