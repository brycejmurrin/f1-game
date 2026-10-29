# Parent brief and evidence publication

- Brief checklist: every frame incl. storm weather; a "Code & scenery deep-dive"
  section (emitter counts with verified file:line); the source branch/commit and
  published evidence URL.
- New capture output stays under ignored `artifacts/` or `scratch/`. Publish with
  `node tools/shot/publish-evidence.mjs --dir artifacts/<capture> --label <slug> --publish`
  and link the release assets; do not force-add images to a survey branch.
  See `docs/EVIDENCE-STORAGE.md` for plan, local packaging, retries and retention.
- Existing survey PRs keep their `track-survey-assets` base and pinned links.
  Code/scenery fixes use a separate image-free deploy-branch PR.
- Shots: more than 3 go through `apex_shot_survey` / `apex_track op survey`, not
  a loop of `apex_shot` (a serial loop costs a browser boot per shot).
- **apex-tools MCP down?** Every `apex_*` route has a CLI under `tools/` (map:
  `docs/AGENT-SURFACE.md`); the surveys `tools/shot/shot-survey.mjs` /
  `track-session.mjs` are browser (parent only).
