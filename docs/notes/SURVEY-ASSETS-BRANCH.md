# Survey assets branch (`track-survey-assets`)

Image-heavy track-survey output (frames, `gallery/tracks`, HTML reports) is hundreds of MB, so it lives on the standing branch `track-survey-assets`, which is never merged into the deploy branch `claude/f1-game-project-26h3ng`.

- Survey and gallery PRs use `track-survey-assets` as the base. Name survey branches `cursor/<id>-survey-<hash>` (the pattern the gallery builder scans).
- A survey finding that needs code, tooling or circuit changes goes in a separate PR into the deploy branch with no survey images.
- Use it every time you survey, shoot or rebuild galleries. If it is missing or stale, recut it from the deploy tip.
- Decided 2026-10-15 by Bryce: survey PRs do not merge to the deploy branch.
- Decided 2026-10-15 (~14:50Z) by Bryce: a survey PR merges INTO `track-survey-assets` (merge commit, never squash) once its CI is green and its diff carries only its own survey output. A survey PR that also touches `js/`, `css/`, `tools/`, `tests/` or `.claude/` is not stripped: strip it first, or move the code into a deploy-branch PR.
- No CI runs on PRs into this branch (#2179, 2026-10-15). It has no required check, and each survey PR used to start the full ready tier seconds before it merged (130 CI and 126 Docs guards runs in 24 h). The deploy branch's `ci.yml` filters `on.pull_request.branches` to the deploy branch, and this branch carries no `ci.yml` or `docs-guards.yml` of its own: a `pull_request` run takes its workflow from the PR's merge commit, so the base's copy would fire. So "green" for a survey PR means no failing check on its head (`ci-watch.mjs` says `= ci none`); the scope rule above is checked on the diff itself.
