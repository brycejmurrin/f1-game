# Cache busting — there is no bump (folded from the bump-cache skill)

Apex 26 has **no build step** and, since 2026-09-03, **no cache bump in
development**. Every tagged JS/CSS URL in the committed `index.html` reads
`?v=dev`; `tools/gen/gen-shell.mjs` writes the tag blocks (and `tools/carview.html`,
the `sw.js` precache seed and `js/roster.js`) from `tools/manifest.cjs`.
`pages.yml` stages the site and runs
`node tools/ci/bump-cache.mjs --apply --at <2000 + commit count> --root _site`,
which rewrites every tag to that file's 12-char SHA-256 and stamps the shell
generation — so the deployed shell is content-addressed and the committed one
never changes for a hash. `version.json` and `<meta name="apex-build">` are a
consistent placeholder (`tests/unit/deploy-stamp.test.mjs`).

## What to run

| you changed | run |
|---|---|
| any `js/` or `css/` file | nothing — the tag already reads `?v=dev` |
| `tools/manifest.cjs` (new / moved / removed file, roster or edge) | `node tools/gen/gen-shell.mjs` |
| `sw.js` DEV rule / precache seed | `node tools/gen/gen-shell.mjs --check` + `npm run test:service-worker` |

```sh
node tools/gen/gen-shell.mjs --check     # every generated block byte-identical to the manifest
node tools/ci/bump-cache.mjs            # repo check: every tag is ?v=dev, meta == version.json
```

`bump-cache.mjs --apply` without `--root` REFUSES (exit 2): a habitual
repo-side run would put 151 hashes back into the shell. Never hand-edit a
`@gen-shell` block, `version.json` or the `apex-build` meta —
`tests/unit/load-order.test.mjs` fails on drift.

## Notes

- On a dev host (`localhost` / `127.0.0.1`) `sw.js` serves assets
  network-first with the cache as offline fallback, because `?v=dev` URLs are
  not immutable; the deployed site stays cache-first.
- `verify-change.mjs` runs `bump-cache --check` inline as an advisory dev-token
  check; live vs deploy-tip `version.json` is **deploy-research**.
