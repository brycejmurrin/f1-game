# One runner for gate publication and merge arming

## Baseline

Fetched deploy source before creating the isolated branch
`cursor/land-arm-gap-10a3` at
`10a3cd507ba78ff71363a5717abe96180258321c`. Re-read current instructions and
checked open PR ownership before editing. Dependencies match the prepared
lock; no shared checkout pull or game-source edit was made.

The successful landing of PR #4311 provides one eligible baseline:
[Land run 41145297265](https://github.com/brycejmurrin/f1-game/actions/runs/41145297265).
Its workflow source at `b8b04c2d7116f72da06d3aad9cda6f109bfcdb99` is
byte-identical to the fetched baseline workflow.

| Job | Queue wait | Execution |
| --- | ---: | ---: |
| Post gate | 111 seconds | 10 seconds |
| Arm merge | 109 seconds | 9 seconds |

Raw timestamps are reproducible through GitHub's jobs endpoint:

```sh
gh api 'repos/brycejmurrin/f1-game/actions/runs/41145297265/jobs?per_page=100'
```

Queue wait is `started_at - created_at`; execution is
`completed_at - started_at`. This is one sample, not a latency distribution.
No candidate hosted saving is established. Other observed runs spent most
of their wait in resolve or gate queues; this change does not remove those.

## Change and safety boundaries

Gate publication and merge arming now execute as separate steps on one
runner. An eligible landing no longer schedules a separate arm job. The
unchanged arm shell independently re-reads the pause switch, PR head,
draft/labels and deploy tip, then invokes the same single pinned merge call.

The untrusted merge-result job stays separate, read-only and secret-free.
The combined write job has no checkout or repository-code execution. Its
permission union adds the arm step's existing `issues:read`; existing write
permissions are unchanged. `LAND_TOKEN` remains step-scoped. The fallback
token and its Pages warning remain intact.

The old administrative job allowances were ten minutes for posting and three
for arming. The combined cap is thirteen minutes. A trusted first step starts
one shared ten-minute clock before artifact download; GNU timeout bounds the
remaining post shell, reserving two seconds for integer-clock rounding and
TERM/KILL cleanup. An expired phase fails closed before arming. The arm step
retains its three-minute limit. Runner setup is outside the phase clock but
inside the combined cap; this is not exact identity with the old job timer.
No test timeout, tolerance, retry budget or ratchet is raised.

Post and arm retry outputs remain separate. The existing retry dispatcher
still deduplicates and stops at three immediate re-gates per head. An arm
failure does not discard an earlier post retry output. Failed posting never
arms, including a failure after partial output.

## Verification and limits

Tests execute the production shell with local GitHub stubs, plus the actual
step condition and retry routing. They cover veto/head/tip changes, a single
head-pinned merge, fallback tokens, unknown errors, failed posting, expired
or invalid phase deadlines, interrupted blocked API work, output preservation
and startup-environment isolation. Fixture tokens are synthetic.

The focused integration check passed **81 tests, zero failures or skips**.
The first broader floor exposed two new assertion shapes counted by the pin
ratchet. Both were strengthened to exact runtime output and complete step-order
comparisons; no ceiling was raised. The pin-pattern count stays **20 to 20**
and the broader pin count stays **42 to 42**. A fresh required floor verifies
the corrected tree separately from that focused check.
The post core, arm and retry shell bodies match the baseline byte-for-byte;
resolve, trusted rows, untrusted gate, sync and sweep jobs remain structurally
identical. Local evidence is under `artifacts/land-gap/`.

Actions scheduling and platform output delivery need hosted verification.
Before/after latency claims require successful eligible runs with queue and
execution times reported separately. One fewer scheduling boundary does not
establish a fixed time or monetary saving. This workflow change provides no
device FPS or thermal evidence.

References: [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax),
[job outputs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/pass-job-outputs),
[status expressions](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions),
[GNU timeout](https://www.gnu.org/software/coreutils/manual/html_node/timeout-invocation.html).
