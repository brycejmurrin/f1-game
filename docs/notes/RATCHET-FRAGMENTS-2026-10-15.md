# Ratchet raise fragments — why `ratchets.json` stopped conflicting (2026-10-15, #2291)

## What conflicted (measured)
`git merge-tree --write-tree` of each PR head against the deploy tip `b8add7aa`, 2026-10-15 ~22:10Z:

| PR | its ratchets.json diff | conflict |
|---|---|---|
| #2231 | `js/game.js` codeLines 5202→5204, lines 9488→9493 | ratchets.json |
| #2242 | `js/game.js` codeLines 5200→5214, lines 9486→9501 | ratchets.json + CHANGELOG.md |
| #2254 | `js/agent/apex.js` codeLines 2349→2381, lines 3345→3384 | ratchets.json |
| #2289 | `js/agent/apex.js` codeLines 2349→2350, lines 3345→3346 | ratchets.json |

In every case the SOURCE (`js/game.js`, `js/agent/apex.js`) auto-merged. The fight was two absolute ceilings for the
same module on the same JSON line: other PRs had already raised game.js, and an extraction had lowered apex.js to
3277 on the tip. The 2026-09-29 normalizer (`docs/notes/MERGE-HYGIENE-2026-09-29.md`: sorted keys, one metric per
line) solved DIFFERENT modules; no layout of an absolute number can solve the SAME module.

## Why not a merge driver
- Git runs a custom driver only when `merge.<name>.driver` is set in the merging repository's git config
  (https://git-scm.com/docs/gitattributes#_defining_a_custom_merge_driver). `.gitattributes` alone cannot define it,
  and nothing puts it into GitHub's server-side config.
- GitHub's docs describe conflicts as "different changes to the same line of the same file", resolvable only by
  editing on GitHub or in a local clone and pushing back. They describe no merge-driver or `.gitattributes`
  mechanism (https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/addressing-merge-conflicts/about-merge-conflicts,
  read 2026-10-15). Reports from users say GitHub's merge button ignores even the built-in `merge=union`
  (https://github.com/rubocop-hq/rubocop/pull/3594). Other forges document the same limit: GitLab.com ignores custom
  drivers (https://docs.gitlab.com/user/project/repository/files/git_attributes), and so does Bitbucket Cloud
  (https://jira.atlassian.com/browse/BCLOUD-20234).
- `union` on JSON would keep both number lines anyway (`.gitattributes` header).

## The design
- `ratchets.mjs --auto-raise` (the commit hook) on a topic branch writes `value − ceiling` into
  `tests/data/ratchets.d/<branch>.json`. Only that branch ever writes that file, so it never shares a hunk.
- `load()` = ratchets.json + the sum of every fragment. `loadAt(ref)` does the same at a ref, so `--base` still names
  each raise once. `measure`, `verdict`, the absorb gate and every exact-slack rule are unchanged.
- Line counts add under a clean three-way merge, so a merged tip's effective ceiling equals its measured value
  (`tests/unit/ratchet-merge-hotspot.test.mjs` asserts it).
- `--update` (a deliberate snap, and deploy.mjs's conflict cure) and `--fold` write the sum back as absolutes and
  delete the fragments. A fold commit touches only ratchets.json and deletes fragment files, which no open PR edits
  either, so it conflicts with no open PR. `npm run fold` runs it together with the CHANGELOG fold
  (`docs/changelog.d/README.md`): one Merge Desk fold PR when the fragments pile up.
- The deploy branch or a detached HEAD still writes absolutes: nothing merges into either except through a PR.
- The fragments are tool-written: `protect-files.py` refuses a hand edit, like ratchets.json.
