# Survey assets branch (`track-survey-assets`)

Image-heavy track-survey output (frames, `gallery/tracks`, HTML reports) is hundreds of MB, so it lives on the standing branch `track-survey-assets`, which is never merged into the deploy branch `claude/f1-game-project-26h3ng`.

- Survey and gallery PRs use `track-survey-assets` as the base. Name survey branches `cursor/<id>-survey-<hash>` (the pattern the gallery builder scans).
- A survey finding that needs code, tooling or circuit changes goes in a separate PR into the deploy branch with no survey images.
- Use it every time you survey, shoot or rebuild galleries. If it is missing or stale, recut it from the deploy tip.
- Decided 2026-10-15 by Bryce: survey PRs do not merge to the deploy branch.
- No CI runs on PRs into this branch (#2179, 2026-10-15). It has no required check, and each survey PR used to start the full ready tier seconds before it merged (130 CI and 126 Docs guards runs in 24 h). The deploy branch's `ci.yml` filters `on.pull_request.branches` to the deploy branch, and this branch carries no `ci.yml` or `docs-guards.yml` of its own: a `pull_request` run takes its workflow from the PR's merge commit, so the base's copy would fire.
