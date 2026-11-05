# GitHub Actions capacity and queue policy

This reset replaces the previous label state machine with three intent labels and durable requests on
`bot/actions-state`. The new coordinator defaults to **shadow**: it may explain proposed admissions but must not
launch workers, dispatch validation, cancel runs, delete labels or merge. Existing workflows remain authoritative
until an explicit, reviewed cutover. A committed implementation is not evidence that live migration occurred.

## Labels

The complete supported catalog is `.github/labels.json`.

| Label | Applies to | Effect after cutover |
|---|---|---|
| `queue:ready` | Open issues | Request one implementation scope, subject to dependencies, batch membership, pause and a reservation. |
| `queue:paused` | Issues and PRs | Stop admitting new expensive work and prevent merge. Preserve ownership and evidence. |
| `queue:priority` | Issues and PRs | Owner-direct preference among existing eligible requests; no additional validation request. |

Fresh issue templates apply no labels. Filing a finding is not permission to launch work. The coordinator alone
reserves ownership; labels, claim comments and PR-body owner fields cannot create or steal a lease. Native issue
blockers are authoritative prerequisites. Batch membership is explicit ledger state, never inferred from every
issue reference in prose. A batch parent and its members cannot launch duplicate implementations.

Owner-established pauses are sticky: an app-mediated removal does not resume the work. Resume requires the owner's
authoritative action. Missing provenance or dependency evidence remains pending. Priority does not bypass pauses,
prerequisites, fairness, full validation or runner limits. A label event may consume a small control job; it does not
create another expensive validation request. Enqueue time and lease heartbeat are separate from `updated_at`.

## Commands

Use one `/apex` command in a GitHub comment. Owner controls require Bryce's direct GitHub provenance, not an app
using his login. Agents may request work; an agent cannot grant approval, clear an owner's pause or grant itself
merge authority. An accepted command records intent; consult the ledger/status before claiming it ran.

| Location | Command | Intent |
|---|---|---|
| PR | `/apex merge` | Request merge of the current head after comprehensive affected validation and trusted gates. |
| Issue or PR | `/apex recover` | Request ownership recovery; never displace a proven live owner. |
| PR | `/apex approve <sha>` | Owner approves that exact full 40-hex head; a changed head needs new approval. |
| Parent issue | `/apex batch #123 #456` | Explicitly group implementation scope; validate each member and avoid parent/member double admission. |
| Control issue #3899 | `/apex pause workers` or `/apex resume workers` | Stop/resume implementation launches. |
| Control issue #3899 | `/apex pause validation` or `/apex resume validation` | Stop/resume expensive validation admissions. |
| Control issue #3899 | `/apex pause merges` or `/apex resume merges` | Stop/resume merging. |
| Control issue #3899 | `/apex pause all` or `/apex resume all` | Apply all three controls. |

These are the reset protocol, available for effects only when its trusted runtime is active. Shadow acceptance
must report proposed effects without performing them. Global controls live in ledger state, not control labels.

## Admission and evidence

Implementation launches require a configured trusted protected-code host adapter (`WORKER_HOST_ADAPTER`). Without
verified provider startup/lifecycle capability, the coordinator records that prerequisite and launches no worker;
a routine endpoint returning a session-looking id alone is insufficient. The address carries an exact launch id.
A worker whose launch is still firing stays pending without edits and retries verification only on native resume
after trusted binding. Ambiguous/unavailable identity never grants ownership or authorizes another fire. Trusted
reconciliation requires exact-session terminal evidence before releasing capacity. The saved prompt is
`tools/ci/worker-prompt.md`; installing a prompt does not establish provider capability.

Persist a request and attempt before dispatch. A trusted startup claims the reservation atomically. Replayed
events or duplicate dispatches cannot create another owner. A lease timeout is not proof a live worker stopped;
recovery checks actual execution. Late completion of an obsolete attempt cannot overwrite its replacement.

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
plans, receipts and ownership proof before a compare-and-swap removes them from active state. Replayed requests
reuse archived evidence rather than relaunching; archive failures retain the live record. Automatic compaction
starts above 4 MiB, archives at most two requests per cycle, and leaves current work intact. An operator may run
`node tools/ci/actions/cli.mjs compact` against an installed ledger. The 64 MiB read/write guard stops admission
before an oversized ledger becomes unreadable.

Sessions cannot cancel runs or bypass the coordinator. Trusted cleanup may cancel attempts proven obsolete,
recording why and the replacement; cancellation is never test success. A pause stops new admissions and merge,
not an implicit claim that already-running work was killed. PR success does not prove a successful Pages release.

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
   plan with owner claims, pauses, merge requests, dependencies and explicit batch membership preserved:

   ```sh
   node tools/ci/actions/cli.mjs snapshot --out artifacts/actions-label-snapshot.json
   node tools/ci/actions/cli.mjs migration-plan --snapshot artifacts/actions-label-snapshot.json --out artifacts/actions-migration-plan.json
   node tools/ci/actions/cli.mjs migrate --snapshot artifacts/actions-label-snapshot.json
   ```

   The last command is a dry run. Parse explicit Members sections for legacy batches; ordinary issue references
   and Merge order prose are not automatic membership or implementation prerequisites.

2. Apply only the reviewed snapshot, supplying the successful installed validation run id:

   ```sh
   node tools/ci/actions/cli.mjs migrate --apply --snapshot artifacts/actions-label-snapshot.json --validation-run <run-id>
   ```

   This initializes/preserves paused ledger state, writes the complete snapshot durably to `bot/actions-state`,
   and verifies its remote digest. It then sets and reads back paused repository mode, disables the old dispatch
   and landing consumers, and requires legacy executions to become terminal before label deletion. Cancellation
   requests are not terminal proof: if draining is still pending, inspect the runs and safely resume the same
   snapshot migration after they finish. No imported backlog launches while migration is paused.

3. The checkpointed migration deletes all old label definitions, creates exactly the three queue labels, and
   imports the reviewed intent/membership under paused controls. Migration-generated events cannot launch old
   consumers. Keep the durable snapshot and migration receipts; local artifacts alone are not the backup.

4. Activate separately, after migration reports complete and current protected-tree validation still matches:

   ```sh
   node tools/ci/actions/cli.mjs activate --validation-run <run-id>
   ```

   Activation verifies the immutable backup, completed migration, exact three-label live catalog, disabled old
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
