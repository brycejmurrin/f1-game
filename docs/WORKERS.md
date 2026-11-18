# Workers — retired 2026-11-03

Retired 2026-11-03 (docs/plans/2026-11-03-agent-surface-reset.md §4.4). The lane contract is skill `steward`
(`.claude/skills/steward/SKILL.md` §Lane); labels: `steward/references/labels.md`; the Hand-off block:
`.github/pull_request_template.md`; vendors and `LAND_TOKEN`: `steward/references/vendors.md`; issue dependencies:
`steward/references/issues.md`; dispatch: skill `dispatcher` (`.github/workflows/dispatch.yml`).

Gate CLIs (self-document via `--help`; this file no longer carries command sections):
`node tools/ci/ready-gate.mjs`, `node tools/ci/ship-pr.mjs`, `node tools/ci/needs-sync.mjs`,
`node tools/ci/sync-pr.mjs`, `node tools/ci/merge-gate.mjs`.
