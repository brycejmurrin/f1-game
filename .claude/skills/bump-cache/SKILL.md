---
name: bump-cache
description: Increment the cache-busting `?v=N` version in index.html after editing any JS or CSS file. Use whenever you change a file under js/ or css/ (or add/remove a <script>/<link> tag) so GitHub Pages and browsers fetch the new asset instead of a stale cached copy. Triggers - "bump the version", "cache bust", "I edited game.js", before committing JS/CSS changes.
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

1. Read the current version:
   ```sh
   grep -o '?v=[0-9]\+' index.html | head -1
   ```
2. Increment it by 1 and replace **every** instance in one shot:
   ```sh
   sed -i -E 's/\?v=[0-9]+/?v=NEW/g' index.html   # NEW = current + 1
   ```
3. Verify the replacement is uniform (one distinct version, no stragglers):
   ```sh
   grep -o '?v=[0-9]\+' index.html | sort -u
   ```
   This must print exactly one line. If it prints two, a manual edit left a
   stale tag — re-run step 2.

## Notes

- Bump by exactly **+1** per logical change set; don't jump numbers.
- The number in `CLAUDE.md` ("currently v=N") is documentation only and is often
  behind the real value — trust `index.html`, and don't churn CLAUDE.md for this.
- This pairs with the `check-changes` skill, which reminds you to bump as part of
  pre-push validation.
