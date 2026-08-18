---
name: bump-cache
description: Use when JS/CSS changed, index.html script/link tags changed, the user says bump the version or cache bust, or Apex 26 asset changes need a new content-hash / version.json build. For live vs deploy-tip version.json use deploy-research — do not bump to "check" the deploy.
---

# Bump cache-busting version

Apex 26 has **no build step**. Every local JS/CSS URL in `index.html` carries
`?v=<12-char sha256>` of that file. Unchanged assets keep stable URLs (and
Chrome/V8 caches) across releases. `version.json` and
`<meta name="apex-build">` are a **monotonic shell / service-worker
generation** — not the per-file digest.

## When to run

Run this **after editing any file under `js/` or `css/`**, or after adding /
removing a `<script>` or `<link>` tag — and **before committing**. If you
touched only docs, tests, tools, or `index.html`'s non-asset markup, you do
NOT need to bump.

## Steps

```sh
node tools/bump-cache.mjs --check            # exit 1 if hashes or shell drift
node tools/bump-cache.mjs --apply            # rehash tags; shell = max+1
node tools/bump-cache.mjs --apply --merge origin/claude/f1-game-project-26h3ng
                                             # cross-lineage: max(ours, theirs)+1
```

Never `--apply` while a browser test run is in flight — the bump is the LAST
edit before commit.

`--apply` rewrites every tagged `src`/`href` to the file's current digest and
sets both `version.json` and `<meta name="apex-build">` to
`max(local, --merge)+1` (or `--at N`). Do not `sed` every tag to one integer
— that is the old global-`?v=N` scheme and fails `load-order.test.mjs`.

## Notes

- Shell generation advances by **+1** per logical change set. If a merge
  finds the other side already higher, `--apply --merge <ref>` takes
  `max(both)+1`.
- `AGENTS.md` names no literal build number — trust `version.json`.
- Pairs with **check-changes** (`bump-cache --check` inside `verify-change`).
