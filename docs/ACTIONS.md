# GitHub Actions capacity and queue policy

This reset replaces the previous label state machine with two PR intent labels and durable requests on
`bot/actions-state`. The new coordinator defaults to **shadow**: it may explain proposed admissions but must not
dispatch validation, cancel runs, delete labels or merge. Legacy validation remains authoritative until reviewed cutover. The retired coding-agent dispatcher stays disabled
in every mode. This coordinator never creates, assigns or resumes a coding-agent task. A committed implementation is not evidence that live migration occurred.

## Labels

The complete supported catalog is `.github/labels.json`.

| Label | Applies to | Effect after cutover |
|---|---|---|
| `queue:paused` | PRs | Stop admitting expensive validation and prevent merge. Preserve test evidence. |
| `queue:priority` | PRs | Owner-direct preference among existing eligible requests; no additional validation request. |

Ready PRs automatically enter the validation queue. Draft feedback remains bounded. Readiness is not merge
authorization: `/apex merge` is required before the trusted landing path may act. Issue creation, issue labels,
implementation plans and batch membership do not admit work. Humans and user-authorized native agents perform
implementation independently; the coordinator only schedules tests, diagnostics, releases and requested merges.

Owner-established pauses are sticky: an app-mediated removal does not resume the work. Resume requires the owner's
authoritative action. Missing provenance or dependency evidence remains pending. Priority does not bypass pauses,
prerequisites, fairness, full validation or runner limits. A label event may consume a small control job; it does not
create another expensive validation request. Enqueue time and lease heartbeat are separate from `updated_at`.

## Commands

Use one `/apex` command in a GitHub comment. Owner controls require Bryce's direct GitHub provenance, not an app
using his login. Agents may request PR checks/merge; an agent cannot grant approval, clear an owner's pause or grant itself
merge authority. An accepted command records intent; consult the ledger/status before claiming it ran.

| Location | Command | Intent |
|---|---|---|
| PR | `/apex merge` | Request merge of the current head after comprehensive affected validation and trusted gates. |
| PR | `/apex recover` | Request recovery of missing test-executor evidence; never launch or reassign a coding agent. |
| PR | `/apex approve <sha>` | Owner approves that exact full 40-hex head; a changed head needs new approval. |
| Control issue #3899 | `/apex pause validation` or `/apex resume validation` | Stop/resume expensive validation admissions. |
| Control issue #3899 | `/apex pause merges` or `/apex resume merges` | Stop/resume merging. |
| Control issue #3899 | `/apex pause all` or `/apex resume all` | Apply both validation and merge controls. |

These are the reset protocol, available for effects only when its trusted runtime is active. Shadow acceptance
must report proposed effects without performing them. Global controls live in ledger state, not control labels.

## Admission and evidence

Persist a validation request and attempt before dispatching a GitHub Actions test executor. Trusted startup
claims the test reservation atomically. Replayed events cannot execute a second copy of the same attempt.
Recovery checks actual GitHub run/attempt evidence; a timeout does not prove an existing executor stopped.
Late completion of an obsolete attempt cannot overwrite its replacement. There are no implementation-agent
leases, host adapters, issue-work producers or routine endpoints in this system.

For a PR, the newest head supersedes older validation. Across PRs, use fair admission with owner priority inside
capacity limits; do not claim GitHub concurrency groups provide durable FIFO. Keep durable FIFO for explicit
experiment admission within each runner pool; GitHub still controls physical start order. Release work retains
bounded capacity, with an active Pages train and the newest pending tip.

Draft feedback is deliberately bounded and is not merge evidence. Ready heads require comprehensive affected
validation: missing, failed, timed-out or silently omitted tasks prevent success. Labels and body edits may change
intent but do not duplicate completed test work. Test workers are read-only. Trusted finalization verifies the
expected head, base and complete required evidence before publishing the required `gate` status. Only the trusted
merge path may merge; only the release path may publish. Unknown API state never becomes success.

The active ledger keeps live work and a fixed, sharded archive manifest. Verified immutable pages retain retired
plans, receipts and test-attempt proof before a compare-and-swap removes them from active state. Replayed requests
reuse archived evidence rather than relaunching; archive failures retain the live record. Automatic compaction
starts above 4 MiB, archives at most two requests per cycle, and leaves current work intact. An operator may run
`node tools/ci/actions/cli.mjs compact` against an installed ledger. The 64 MiB read/write guard stops admission
before an oversized ledger becomes unreadable.

Sessions cannot cancel runs or bypass the coordinator. Trusted cleanup may cancel attempts proven obsolete,
recording why and the replacement; cancellation is never test success. A pause stops new admissions and merge,
not an implicit claim that already-running tests were killed. PR success does not prove a successful Pages release.

## Cutover and label removal

The installation credential needs Actions variable read/write access as well as repository content, workflow,
issue and label permissions. A `403` from the variables API stops migration before label deletion.

Request identities include the protected controller revision so a queued older controller cannot reuse a newer
controller's validation plan. GitHub's native control queue is bounded at 100 pending jobs; an unadmitted request
whose adapter was cancelled must be rerun with its original event. Durable admission starts at the ledger write.

Live cutover is pending. These are operator commands, not steps a worker may run. Editing or merging the code PR
does not run them. Use the authenticated repository transport without printing credentials. First install the
reviewed workflows on the protected branch and obtain a successful Actions validation run for that exact tree.

1. Export every live label definition and attachment, including closed issues/PRs. Review an idempotent migration
   plan preserving PR pauses, explicit merge requests and head-scoped approvals. Issue history remains in the
   snapshot as evidence; it is never converted into implementation work:

   ```sh
   node tools/ci/actions/cli.mjs snapshot --out artifacts/actions-label-snapshot.json
   node tools/ci/actions/cli.mjs migration-plan --snapshot artifacts/actions-label-snapshot.json --out artifacts/actions-migration-plan.json
   node tools/ci/actions/cli.mjs migrate --snapshot artifacts/actions-label-snapshot.json
   ```

   The last command is a dry run. Legacy issue claims and batch membership are archival evidence only; they do not
   create coordinator requests or coding-agent ownership.

2. Apply only the reviewed snapshot, supplying the successful installed validation run id:

   ```sh
   node tools/ci/actions/cli.mjs migrate --apply --snapshot artifacts/actions-label-snapshot.json --validation-run <run-id>
   ```

   This initializes/preserves paused ledger state, writes the complete snapshot durably to `bot/actions-state`,
   and verifies its remote digest. It then sets and reads back paused repository mode, disables the old dispatch
   and landing consumers, and requires legacy executions to become terminal before label deletion. Cancellation
   requests are not terminal proof: if draining is still pending, inspect the runs and safely resume the same
   snapshot migration after they finish. No imported backlog launches while migration is paused.

3. The checkpointed migration deletes all old label definitions, creates exactly the two PR queue labels, and
   imports reviewed PR intent under paused validation/merge controls. Migration-generated events cannot launch old
   consumers. Keep the durable snapshot and migration receipts; local artifacts alone are not the backup.

4. Activate separately, after migration reports complete and current protected-tree validation still matches:

   ```sh
   node tools/ci/actions/cli.mjs activate --validation-run <run-id>
   ```

   Activation verifies the immutable backup, completed migration, exact two-label live catalog, disabled old
   consumers and successful Actions validation for the current protected tree. A moved tip requires fresh
   validation. Only verified activation enables bounded reconciliation; owner-established pauses remain sticky.

5. If operation must stop, freeze the replacement system and preserve its state:

   ```sh
   node tools/ci/actions/cli.mjs rollback --reason "describe the observed failure"
   ```

   Rollback sets paused repository/ledger mode and all controls. It does not recreate old labels or re-enable old
   consumers. Inspect durable state and evidence before another verified activation.

Legacy labels have no runtime meaning in the reset protocol. Historical decisions and archived reports retain
their original names as evidence; they do not authorize the new system. No remote migration was performed while
editing these policy files.
