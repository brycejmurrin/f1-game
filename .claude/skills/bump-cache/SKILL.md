---
name: bump-cache
description: Use when JS/CSS changed, index.html script/link tags changed, the user says bump the version or cache bust, or Apex 26 asset changes need a new ?v=N/version.json build. For live vs deploy-tip version.json use deploy-research — do not bump to "check" the deploy.
---

# Bump cache-busting version

Apex 26 has **no build step**. Every asset in `index.html` is loaded with a
`?v=N` query string. Browsers (and the GitHub Pages CDN) cache by full URL, so a
changed `js/*.js` or `css/*.css` file is **invisible to users until N is
incremented**. This is the single most-forgotten step in the repo.

## When to run

Run this **after editing any file under `js/` or `css/`**, or after adding /
removing a `<script>` or `<link>` tag — and **before committing**. If you touched
only docs, tests, tools, or `index.html`'s non-asset markup, you do NOT need to bump.

## Steps

The ritual is a tool. Prefer it over the sed one-liners (they are the fallback
when you cannot run Node):

```sh
node tools/bump-cache.mjs --check            # exit 1 if tags/version.json drift
node tools/bump-cache.mjs --apply            # everything to max+1
node tools/bump-cache.mjs --apply --merge origin/claude/f1-game-project-26h3ng
                                             # cross-lineage: max(ours, theirs)+1
```

Never `--apply` while a browser test run is in flight — the bump is the LAST
edit before commit.

Manual fallback:

1. Read the **highest** existing version, not the first match — a stray stale
   tag from a previous manual edit means `head -1` can hand you an old number:
   ```sh
   grep -o '?v=[0-9]\+' index.html | sed 's/?v=//' | sort -n | tail -1
   ```
2. Increment it by 1 and replace **every** instance in one shot:
   ```sh
   sed -i -E 's/\?v=[0-9]+/?v=NEW/g' index.html   # NEW = max(step 1) + 1
   ```
3. **Sync `version.json` to the SAME number** — this is NOT optional:
   ```sh
   echo '{ "build": NEW }' > version.json
   ```
   The shell version guard in `index.html` fetches `version.json` (no-store) and
   force-reloads a stale installed PWA when the deployed build is newer than the
   cached shell. `index.html` itself has no `?v=`, so this is the ONLY thing
   that refreshes the HTML markup for installed-app users.
4. Verify both are uniform (one distinct version, matching build) **and that
   NEW is strictly greater than the max read in step 1** — landing on or below
   the old max ships nothing, even though the diff looks like a bump:
   ```sh
   grep -o '?v=[0-9]\+' index.html | sort -u && cat version.json
   ```
   The grep must print exactly one line, and the build number must equal it. If
   the grep prints two lines, a manual edit left a stale tag — re-run step 2.

## Notes

- Bump by exactly **+1** per logical change set; don't jump numbers. If a merge
  finds the other side already at a higher N, resolve to max(both)+1 in BOTH files.
- `AGENTS.md` deliberately names no number ("check `index.html` for the current
  N") — trust `index.html`, and don't add a literal N to AGENTS.md.
- This pairs with the `check-changes` skill, which reminds you to bump as part of
  pre-push validation.
