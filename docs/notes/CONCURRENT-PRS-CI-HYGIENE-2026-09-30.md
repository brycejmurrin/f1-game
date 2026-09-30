# Concurrent PRs / CI hygiene (2026-09-30)

Session notes for the concurrent-PR protocol land in AGENTS.md (§Concurrent
PRs) and docs/TESTING.md (§Merge train, §CI aggregator, §Flaky tests). This
file is the per-PR notes surface for that change — not a second source of
truth.

## What this PR adds

- AGENTS.md **Concurrent PRs**: sync once before the final CI run; own
  `docs/notes/<topic>.md` per PR; normalize shared sorted files via the
  merge-hygiene PR (#484) when merged; no ratchet raises outside the
  sanctioned route; report head SHA, never merge; stop on token failure;
  DRAFT until final; keep ~6 or fewer ready PRs open.
- TESTING.md: merge train (one big PR at a time, small ones batched), how the
  `CI` aggregator (#480) and fixed-name `Selected specs (verdict)` (#507) work,
  PR vs nightly coverage, flaky policy.
- `tools/ci/behind-ship.mjs`: non-blocking behind-count vs ship; `::warning::`
  over 10 commits; wired into Structural guards on `pull_request` only.
- Workflow hygiene: per-PR concurrency + cancel-in-progress on every
  `pull_request` workflow; heavy jobs (geometry sweeps, wide smoke, real-GPU
  renderer, emulated XR, desktop pack-smoke) stay off draft PRs.
- Explicit: no auto-update-branch bots, no require-up-to-date branch-protection
  rule — SYNC ONLY WHEN YOU MUST still stands, plus one sync before final CI.

## Normalize command (merge-hygiene #484)

When #484 has merged, normalize the conflict-prone JSON lists (one entry per
line, stably sorted) then regenerate the test-group scripts:

```sh
# check / --fix live on the merge-hygiene branch as tools/check/merge-hygiene.*
# until then, avoid unsorted appends that force same-line fights
node tools/gen/gen-test-groups.mjs
```

Until #484 lands, avoid unsorted appends to `tests/data/ratchets.json` /
`tests/groups.json` toolingFast lists that force same-line fights.
