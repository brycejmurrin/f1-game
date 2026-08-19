# Bake-lighting capture, review, ship

Load this when you have a full COPY VALUES blob and are ready to write
`js/game/light-presets.js`. The index's CRITICAL full-replace rule still
applies — a partial object wipes every other key.

## Per-track proposal merge (no bake.mjs)

When many tracks propose in parallel, each writes
`artifacts/lighting/proposals/<id>.json` (schema in `docs/LIGHTING-PRESETS.md`).
Parent merges — this is the only safe multi-agent path:

```sh
node .claude/skills/bake-lighting/merge-proposals.mjs
```

It Object.assigns only the proposed `"track|tod|wx"` keys, validates ids /
ranges / slider-grid against live `TUNE_DEFS`, and leaves `"*"` plus every
other track alone. It does **not** bump cache.

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
Values are partial `{knobId: number}` maps (only non-default knobs). A real
COPY VALUES export is a FULL snapshot and REPLACES the whole literal.

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
