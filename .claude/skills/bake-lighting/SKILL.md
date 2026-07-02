---
name: bake-lighting
description: Bake the in-game LIGHTING TUNER's copied settings into the shipped js/light-presets.js and commit + push. Use when the user pastes a "window.LightPresets = {…}" blob (the panel's COPY VALUES export) and wants it saved into the game / deployed. Triggers - "bake these lighting settings", "save my lighting presets", "apply the copied lighting values", "commit the lighting tune", "here are my LightPresets", a pasted window.LightPresets = {…} object.
---

# Bake copied LIGHTING TUNER settings and push

The in-game **LIGHTING TUNER** (pause-menu page) stores per-`(track, time-of-day,
weather)` values in localStorage and its **COPY VALUES** button exports the
file+local merge as a `window.LightPresets = {…}` blob. This skill takes that
blob, writes it into the committed `js/light-presets.js` (the shipped baseline
everyone sees), bumps the cache version, and commits + pushes — the "apply" step
that turns a personal tuning session into the deployed look.

Background: `js/light-presets.js` is the low-precedence baseline; a player's
localStorage edits always win over it (see the tuner section in `CLAUDE.md`).
Baking a blob here changes the look for everyone on the deployed build.

## Input

The user pastes the exported blob, e.g.:

```js
window.LightPresets = {
  "monaco|night|wet": { lampLevel: 0.34, ssrWetMul: 1.1, tint: 0.1 },
  "*": { vibrance: 0.24 }
};
```

Keys are `"trackId|timeOfDay|weather"` (or `"*"` for a global baseline);
`timeOfDay` ∈ dawn|day|dusk|night, `weather` ∈ dry|wet|rain|fog|overcast. Values
are partial `{knobId: number}` maps (only non-default knobs). The export is a
FULL snapshot (file merged with local edits), so it REPLACES the whole literal —
you don't merge by hand.

## Steps

1. **Capture the blob.** Write exactly what the user pasted to a scratch file
   (keep the `window.LightPresets = …;` wrapper or just the `{…}` — the helper
   accepts either):
   ```sh
   cat > "$SCRATCH/presets.txt" <<'BLOB'
   <paste the user's window.LightPresets = {…}; here>
   BLOB
   ```

2. **Bake + bump** (writes `js/light-presets.js`, increments `?v=` across
   `index.html` + `version.json`; validates shape, never commits):
   ```sh
   node .claude/skills/bake-lighting/bake.mjs "$SCRATCH/presets.txt"
   ```

3. **Review + syntax-check:**
   ```sh
   git --no-pager diff js/light-presets.js index.html version.json
   node --check js/light-presets.js
   ```
   Sanity: every key looks like `track|tod|weather`, values are plausible
   (lampLevel ~0.05–1, tint −1..1, etc.). If a knob id looks wrong, stop and ask
   — a typo'd id is silently ignored at runtime.

4. **Smoke (optional but cheap — catches a broken file):**
   ```sh
   npm run test:smoke
   ```

5. **Commit + push** to the active dev branch (see `CLAUDE.md` — currently
   `claude/f1-game-project-26h3ng`; never push to `main`). Use the git retry/
   backoff from the repo's git rules:
   ```sh
   git add js/light-presets.js index.html version.json
   git commit -m "Bake lighting presets: <one line — which tracks/conditions>"
   git push -u origin <dev-branch>
   ```

## Notes

- The helper takes the blob from a file arg OR stdin (`… bake.mjs - < blob`).
- It replaces the ENTIRE `window.LightPresets` literal — the export already
  includes existing file entries merged with the new edits, so nothing is lost.
- Only `js/light-presets.js` values change the shipped look; a player's own
  localStorage still overrides them locally until they RESET.
- If the blob fails to parse, the helper prints the error and writes nothing —
  fix the paste (usually a stray trailing comma or truncated copy) and re-run.
