# Generated evidence storage

Store new screenshot runs, survey galleries and generated reports as **GitHub
Release assets**, outside the Git object database. Keep runtime assets and reviewed
Playwright baselines in Git. Existing `track-survey-assets` PRs and pinned links
remain supported; do not rewrite or delete their history as part of this workflow.

## Preserve an existing CI artifact

Use **Actions → Archive evidence → Run workflow**. Select the completed capture's
run ID, its exact artifact name, and a short label such as `monza-survey`. Once this
workflow has merged into the default branch, it can also be dispatched with:

```sh
gh workflow run archive-evidence.yml --repo brycejmurrin/f1-game \
  -f run_id=123456789 -f artifact_name=car-shots -f label=monza-survey
```

The job downloads only that artifact and publishes a checksum-verified release
bundle. Its summary contains the download links. The checkout used for packaging
is the workflow-run head; **the actual captured revision remains unverified**.
A capture job can use another input ref or a PR merge commit, so the run head
alone is not proof of what produced the screenshots. Preserve the producer's
manifest and consult its checkout logs when identifying the actual capture SHA.

The publisher executes from the selected workflow revision, not the packaging
checkout; there is no dependency installation or capture-script execution. The
bundle records the original run URL, attempt, event, artifact name and workflow
head, with a separate explicit `captureSourceSha: null` marker. Run it before the
Actions artifact expires.

This route uses the GitHub runner's token and needs no personal token. Some
managed development environments provide API proxy credentials that cannot upload
binary release assets; an upload-host HTTP 401 there is not evidence that a bundle
was stored. Use this workflow or an authenticated local GitHub CLI instead.

## Capture, inspect, publish

Run the uploader from the checkout that produced the capture, before changing
revisions. Its provenance describes that checkout at packaging time; include the
capture tool's own report/metadata when available.

Capture into a dedicated directory under `artifacts/` or `scratch/`. Review that
directory before publishing: its regular files, including nested gallery assets,
will be bundled. Symlinks and dependency/repository directories are refused.

```sh
# Inspect the selected files without writing a bundle or contacting GitHub.
node tools/shot/publish-evidence.mjs --dir artifacts/track-survey/monza --label monza-survey --plan

# Package locally; tar must be installed. Nothing uploads by default.
node tools/shot/publish-evidence.mjs --dir artifacts/track-survey/monza --label monza-survey

# Package and upload. Push code first when its source link must be accessible.
node tools/shot/publish-evidence.mjs --dir artifacts/track-survey/monza --label monza-survey --publish
```

Publication uses authenticated `gh` access to `brycejmurrin/f1-game` with permission
to write repository contents. It creates one `evidence-<label>-<archive-hash>`
prerelease per bundle with `--latest=false`.
It does not edit an existing release, overwrite an asset, or publish a game build.
Evidence tags point to the fixed parentless scaffold commit
`bbc4c0a112921e790535ea52fc04e9c74a1271fb` (8 files, about 35 KB). They do not pin
the large game history or make a future historical purge harder. The packaging
checkout SHA lives as text in the manifest; archive bytes are release assets.
Download the uploaded assets, rather than GitHub's automatic source-code archives,
which contain only the storage scaffold.
The existing desktop tag trigger is `desktop-v*`, which excludes evidence tags.

The JSON result includes the release URL and stable `releases/download/...` links
for these three assets:

- A `.tar.gz` archive containing `manifest.json` and the capture under `files/`.
- A separate manifest with the source SHA, branch, dirty status, tracked-diff hash,
  bundle timestamp and SHA-256/size of each bundled file.
- A `.sha256` file covering the archive and manifest.

Copy the release or asset links into the relevant PR or document. A dirty capture
is explicitly marked; its source SHA alone does not reproduce uncommitted changes.
Publish from a clean, pushed source commit when reproducibility matters. Untracked
source contents are not included in the tracked-diff hash.

Local packages and receipts remain under ignored `artifacts/evidence-uploads/`.
If publication fails, the error prints the prepared receipt path. Retry that exact
bundle rather than generating another one:

```sh
node tools/shot/publish-evidence.mjs --receipt artifacts/evidence-uploads/<bundle>/receipt.json --publish
```

A retry checks existing release metadata and asset digests and returns matching
links. Authentication failures, changed local files, conflicting tags, draft
releases and checksum mismatches stop for inspection. No `--clobber` or deletion
is used. One bundle per release also supports repositories with immutable releases,
where published assets cannot be appended or replaced.

## Download and verify

```sh
gh release download <evidence-tag> --repo brycejmurrin/f1-game --dir artifacts/downloaded-evidence
cd artifacts/downloaded-evidence
sha256sum -c <archive-name>.tar.gz.sha256
tar -xzf <archive-name>.tar.gz
# Open files/index.html locally when the capture contains a gallery.
```

GitHub hosts the download, not an executable gallery website. Relative gallery
links remain intact after extraction. Release access follows repository access;
private evidence needs an authenticated client.

## Retention

| Evidence | Storage and retention |
| --- | --- |
| Routine CI screenshots, traces, failed runs | Existing Actions artifacts, normally 7–30 days; these links expire |
| Evidence needed by a PR or lasting documentation | Publish a reviewed release bundle and retain while linked |
| Duplicate or superseded runs | Keep locally/temporarily; do not promote every run to durable storage |
| Runtime assets and reviewed regression baselines | Keep in Git with their code and tests |

No automatic release deletion is configured. Before retiring a bundle, check PR
and documentation references and preserve any evidence still needed. GitHub release
assets are durable until explicitly removed; they are not an independent backup.
Each asset must be **under 2 GiB**; split larger surveys by circuit or capture set.
The uploader creates three assets, below GitHub's 1,000-assets-per-release limit.

This prevents future Git growth. It does not remove already committed images or
change existing PR history. Continue existing survey PRs against their existing
base; new image-only capture work needs an upload and links, not a Git image PR.
Code or tooling fixes still use a normal deploy-branch PR.
The older `tools/ci/publish-shots.mjs` writes Git image branches and is a legacy
maintenance tool; use the release uploader for new evidence.

## Sources

- [Release storage quotas](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases#storage-and-bandwidth-quotas)
- [Creating releases with assets](https://cli.github.com/manual/gh_release_create)
- [Asset digests and download URLs](https://docs.github.com/en/rest/releases/assets)
- [Immutable releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository#editing-a-release)
- [Actions artifact expiry and access](https://docs.github.com/en/actions/managing-workflow-runs/downloading-workflow-artifacts)
- [Downloading a named artifact](https://cli.github.com/manual/gh_run_download)
- [Workflow run metadata](https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run)
