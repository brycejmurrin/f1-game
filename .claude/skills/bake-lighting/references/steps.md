# Bake-lighting capture, review, ship

Load this when you have a blob and are ready to write
`js/game/light-presets.js`. Check the first line first: `window.LightEdits` is a
delta and goes through the merge path below; only `window.LightPresets` reaches
`bake.mjs`. The index's CRITICAL full-replace rule still applies — a partial
object handed to `bake.mjs` wipes every other key.

## The merge path (no bake.mjs) — proposals AND player pastes

`merge-proposals.mjs` takes two shapes and validates both the same way (ids /
ranges / slider-grid against live `TUNE_DEFS`), leaving every key it was not
given alone. It does **not** bump cache.

```sh
node .claude/skills/bake-lighting/merge-proposals.mjs                      # the proposals dir
node .claude/skills/bake-lighting/merge-proposals.mjs artifacts/tmp/edits.js   # one pasted export
```

- **Agent proposal** — `artifacts/lighting/proposals/<id>.json`, shape
  `{track, combos:{"dusk|dry":{…}}}` (schema in `docs/LIGHTING-PRESETS.md`).
  Parent merges; this is the only safe multi-agent path. Within a condition a
  proposal **REPLACES**: it is a considered whole profile, so dropping a knob is
  how it decides against one, and an empty map resets the condition.
- **Player paste** — `window.LightEdits = {…}` from COPY VALUES, keyed by the
  full `"track|tod|wx"` plus the `"*"` / `"*|tod"` layers a proposal cannot
  express. Within a condition a delta **MERGES**: two sliders moved is two knobs
  added, not the other eight deleted. A delta may never delete a condition.

Save the paste to a file and pass the path — it is read with `vm`, so the `//`
comments the export writes between blocks are fine.

## One-key hand-merge (no bake.mjs)

If you only need to update ONE `track|tod|weather` (or `"*"`) key and do not
have a fresh COPY VALUES export, do **not** feed `bake.mjs` a one-key object:

1. Read `js/game/light-presets.js` and parse the existing
   `window.LightPresets` object (plain JSON after the assignment).
2. `Object.assign` just that key's new value — leave every other key.
3. Write the whole object back as `window.LightPresets = {…};` and
   **bump-cache**.

A silent `--merge` default would make a future partial paste look safe.
If a merge mode is ever added it must be an explicit opt-in flag.

## Input shape

Keys are `"trackId|timeOfDay|weather"` (or `"*"`);
`timeOfDay` ∈ dawn|day|dusk|night, `weather` ∈ dry|wet|rain|fog|overcast.
Values are partial `{knobId: number}` maps (only non-default knobs). A
`window.LightPresets` blob is a FULL snapshot and REPLACES the whole literal;
a `window.LightEdits` blob (what COPY VALUES emits) is a DELTA and must go
through the merge path above.

## Steps

1. **Capture the blob** (file arg or stdin; wrapper optional):
   ```sh
   mkdir -p artifacts/tmp
   cat > artifacts/tmp/presets.txt <<'BLOB'
   <paste the user's window.LightPresets = {…}; here>
   BLOB
   ```

2. **Bake + bump** (writes presets, increments `?v=` + `version.json`;
   validates shape, never commits):
   ```sh
   node .claude/skills/bake-lighting/bake.mjs artifacts/tmp/presets.txt
   ```

3. **Review + syntax-check:**
   ```sh
   git --no-pager diff js/game/light-presets.js index.html version.json
   node --check js/game/light-presets.js
   ```
   Every key should look like `track|tod|weather`. A typo'd knob id is
   silently ignored at runtime — stop and ask.

4. **Smoke (optional):** `node tools/test-bg.mjs smoke`

5. **Commit + push** to the active feature branch (never `main`):
   ```sh
   git add js/game/light-presets.js index.html version.json
   git commit -m "Bake lighting presets: <which tracks/conditions>"
   git push -u origin <dev-branch>
   ```

## Notes

- Helper takes a file arg OR stdin (`bake.mjs - < blob`).
- Only `js/game/light-presets.js` changes the shipped look; a player's
  localStorage still overrides until RESET.
- Parse failure writes nothing — usually a stray trailing comma.
- Regex failure (`Could not find the window.LightPresets assignment`): the
  file must contain a line-anchored `window.LightPresets = {` … `};` on its
  own line. Hand-fix, `node --check`, re-run `bake.mjs`.
