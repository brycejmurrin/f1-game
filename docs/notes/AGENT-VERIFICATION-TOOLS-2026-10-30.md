# Source-bound verification and bounded coordination reads

Base: `ed60f0f62254c3d9c8d5b991b976edd1076b344d`, fetched from the deploy
branch on 2026-10-30. These additions extend existing tools; GitHub remains the
task/claim/handoff authority. No command here launches agents, reserves paths,
changes labels, retries CI, merges a PR or grants permission.

## Verification receipts

The ordinary `tooling-fast` CLI writes its existing legacy log plus an immutable
per-run `artifacts/logs/verification-<uuid>.log` and neighboring receipt JSON.
Concurrent or nested verification cannot replace another run's evidence. The version-1 receipt names
the runner PID/run id, exact selected test files and their start/end byte hashes, start/end source identity,
terminal verdict, timestamps and SHA-256 of the finished log. A running receipt
replaces the previous completion before tests start. An older runner cannot
overwrite a newer receipt sharing its log path.

Source identity reuses `work-tree-id.mjs`: the entire committable tree, including
dirty and untracked inputs with ignore rules honored. This conservative scope
avoids guessing a test's transitive source dependencies. Committing exactly the
tested bytes preserves applicability; any other committable edit makes evidence
stale. Ignored artifacts do not invalidate it. This is a source identity, not a
fingerprint of installed dependencies, generated ignored files, environment
variables or external services. Changing those inputs requires fresh evidence.

`session-status.mjs` reports receipt applicability independently of historical
log verdicts: `current`, `stale`, or `unknown`. A current failed receipt remains
a failure. Missing/unfinished evidence and unavailable source identities remain
unknown. Selected test files are also checked, including ignored fixtures and symlink targets. Missing or changed selected inputs cannot retain current evidence. A changed source during execution or a modified log cannot establish a
current pass. The summary counts current passing receipts while preserving the
existing historical-log counts. Listed suites delimit coverage: a subset receipt
cannot satisfy the existing full-suite ready gate. The gate/stamp protocol is
unchanged; receipts are advisory and self-authored, not a security boundary.

## Why a PR is waiting

```sh
node tools/ci/pr-wait.mjs --pr 4381 --json
node tools/ci/pr-wait.mjs --fixture artifacts/pr-snapshot.json --json
```

The GET-only collector reads the PR, current-head CI workflow runs/jobs and gate
statuses, then rechecks the head. It excludes ignored edit/label runs using their
`display_title`, even when their workflow name remains `CI`. Output retains all
observed reasons, job ids and timestamps. Pending concurrency, runner queue,
execution, real failures, gate refusal/revalidation and landing are distinct.
A merged PR's deployment remains unknown without explicit ancestry evidence.
Endpoint errors, capped pagination and head drift retain incompleteness; exit 2
means incomplete/invalid input, not that the PR's tests failed. This is a bounded
snapshot, not a monitor. It does not infer queue position or test assertions.

## Delegation overlap

```sh
node tools/ci/path-overlap.mjs --brief artifacts/brief.json --json
```

A brief contains `owned`, optional `forbidden`, optional sibling `assignments`
with their `owner` and `owned`, and optional numeric `ignorePr`. Paths are literal
repository-relative files or directories ending `/`; globs and traversal are
rejected. The tool compares proposed ownership with open-PR file diffs (including
old rename paths), sibling ownership and contradictions in the brief. Each live
PR head is rechecked after collecting its files. An offline `--fixture` accepts
an explicit inventory for deterministic review. `complete` refers only to this
bounded observed inventory; unpushed work and subsequent changes remain unknown.
An overlap is advisory and exits 0; incomplete coverage exits 2. Recheck before
editing; no snapshot reserves a path. Default limits are three pages per endpoint
and 50 inspected PRs. Offline JSON is capped at 1 MiB; briefs allow 128 owned/forbidden paths, 32 sibling assignments and 200 retained overlaps. Truncation is explicit incomplete evidence. No messaging or phone-bridge paths are changed.

## Primary sources

Inspected 2026-10-30:

- [GitHub workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency):
  `queue: max` allows up to 100 pending entries; FIFO follows time waiting on the
  concurrency group, not dispatch time. An exact position is not inferred here.
- [GitHub issue dependencies](https://docs.github.com/en/rest/issues/issue-dependencies):
  useful for a later blocker audit, separate from this path-overlap implementation.
- [Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer): existing
  traces already expose action/source/network evidence. These tools add source
  binding and coordination interpretation rather than another trace viewer.

Current MCP tools are exposed through the existing app connection; adding these
local CLIs does not imply hosted MCP registration or provider delivery support.
