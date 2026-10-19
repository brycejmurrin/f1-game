# Deferred repository history cleanup — development continues

Date: 2026-10-19. Status: DEFERRED; no execution or maintenance window scheduled.
Backlog: [#2945](https://github.com/brycejmurrin/f1-game/issues/2945).

The user asked to save the remaining cleanup plan and said, “we are not ready to
stop development.” Continue normal feature work, commits, PRs and releases.
Saving or merging this document does not authorize a history rewrite, force-push,
ref/backup deletion, PR closure, development freeze or replacement repository.
The future-work issue stays deferred and must not enter the autonomous ready queue.

## What is already complete

[PR #2935](https://github.com/brycejmurrin/f1-game/pull/2935) merged the historical
release workflow extension, a catalog of 21 verified evidence bundles containing
7,739 original files, and 13 documentation-link replacements. Use the
[release evidence policy](../EVIDENCE-STORAGE.md) for new generated captures.
Runtime assets and reviewed regression baselines remain in Git.

The [October 19 measurement](../notes/REPO-SIZE-2026-10.md) found 753.32 MiB
potential ordinary-clone savings in a local rewrite rehearsal. Original GitHub PR
refs still retained 4,194 of 4,196 candidate image blobs. That hypothetical rewrite
changed all six snapshot-time PR heads and their deploy base, and stripped 18,599
commit signatures. These dated results do not establish hosted-storage savings or
a safe rollout. Old history, recovery refs and backups remain necessary.

## Preparation that can coexist with development

These are saved future tasks, not instructions to begin them automatically:

- [ ] Audit remaining image dependencies in archived HTML, producer metadata,
  other branches, PR descriptions and external documents. Review full-resolution
  source links as well as the extracted gallery's local thumbnails.
- [ ] Migrate any evidence still needed, verify actual uploaded/downloaded bytes
  and origin metadata, and update its consumers through ordinary PRs. Retain the
  original Git objects until all relevant consumers have been accounted for.
- [ ] Refresh full-history size and branch/tag/archive/PR inventories at an agreed
  snapshot. Distinguish normal clone transfer size from GitHub-retained objects;
  record uncertainties about forks, caches and server garbage collection.
- [ ] Make an independent current recovery backup, verify restoration, and repeat
  the isolated rehearsal against that snapshot. Record protected contents,
  commit/signature/link changes, PR merge-base/check impacts and measured savings.
- [ ] Account for new commits and PRs arriving during preparation. Reconcile the
  delta and refresh the inventory again before proposing any remote operation.
  Never reuse the October 19 rewrite mapping against a moving repository.

Development can continue throughout this preparation. Do not require every PR to
close or wait for development to finish. Preserve active PR histories as a stated
constraint; do not quietly substitute recreated PRs or reset branches.

## Separate future decision before any cutover

- [ ] Present concrete options, measured benefits and limitations, with an explicit
  disposition for every active PR and a recovery procedure for contributors.
- [ ] Check whether an option actually meets the user's PR-preservation and
  storage goals. If GitHub retains the old objects or the option disrupts active
  work, explain that tradeoff and keep destructive cleanup deferred.
- [ ] Obtain a new user decision on that specific rollout. If a viable option
  requires a temporary write restriction, propose its bounded scope, duration and
  recovery procedure separately. No pause is approved by this plan.
- [ ] Define acceptance and rollback checks before execution: expected ref and
  content mappings, PR continuity, representative artifact restoration, current
  links, and separately measured clone versus hosted-storage outcomes.
- [ ] Retire recovery refs/backups only under a separately approved retention
  decision after successful verification; their deletion is not an automatic
  consequence of uploading evidence or completing a rehearsal.

No remote cleanup should run merely because these preparation tasks are complete.
Until a future go/no-go decision, keep shipping through the normal workflow and
keep generated evidence outside Git history.

## Evidence and related guidance

- [Historical evidence catalog](../evidence/historical-catalog.json): selections,
  release links, checksums, origin metadata and verification receipts.
- [Repository size findings](../notes/REPO-SIZE-2026-10.md): snapshot scope,
  standalone pack comparisons, PR-ref retention and signature loss.
- [Evidence storage](../EVIDENCE-STORAGE.md): capture promotion, download checks
  and retention policy. Archived producer links still need a separate audit.
