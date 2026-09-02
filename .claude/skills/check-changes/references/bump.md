# Bump cache-busting version (folded from the bump-cache skill)

Apex 26 has **no build step**. Every local JS/CSS URL in `index.html` carries
`?v=<12-char sha256>` of that file. Unchanged assets keep stable URLs (and
Chrome/V8 caches) across releases. `version.json` and
`<meta name="apex-build">` are the **shell / service-worker generation** —
not the per-file digest — and since 2026-09-01 the COMMITTED value is a
consistent placeholder: `pages.yml` stamps the real, monotonic generation
(`2000 + commit count`) while staging, so `--apply` keeps the number and two
sessions can never collide on it (`tests/unit/deploy-stamp.test.mjs`).

## When to run

Run this **after editing any file under `js/` or `css/`**, or after adding /
removing a `<script>` or `<link>` tag — and **before committing**. If you
touched only docs, tests, tools, or `index.html`'s non-asset markup, you do
NOT need to bump.

## Steps

```sh
node tools/bump-cache.mjs --check            # exit 1 if hashes or shell drift
node tools/bump-cache.mjs --apply            # rehash tags; the generation is KEPT (the deploy stamps it)
node tools/bump-cache.mjs --apply --advance  # the old max+1 — only if you really need a new local generation
node tools/bump-cache.mjs --apply --at N --root _site   # what pages.yml runs while staging
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
- `verify-change.mjs` runs `bump-cache --check` inline; live vs deploy-tip
  `version.json` is **deploy-research** — never bump to "check" the deploy.
