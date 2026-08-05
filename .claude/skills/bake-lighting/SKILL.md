---
name: bake-lighting
description: Use when the user pastes a window.LightPresets = {…} blob or asks to bake these lighting settings, save lighting presets, apply copied lighting values, commit a lighting tune, or ship LIGHTING TUNER COPY VALUES output in Apex 26.
---

# Bake copied LIGHTING TUNER settings and push

The in-game **LIGHTING TUNER** (pause-menu page) stores the player's slider
edits in localStorage under the **current** `track|tod|weather` key (legacy
`"*"` profiles from older saves are still honoured) — and its **COPY VALUES**
button exports the file+local merge as a
`window.LightPresets = {…}` blob. This skill takes that
blob, writes it into the committed `js/game/light-presets.js` (the shipped baseline
everyone sees), bumps the cache version, and commits + pushes — the "apply" step
that turns a personal tuning session into the deployed look.

Background: `js/game/light-presets.js` is the low-precedence baseline; a player's
localStorage edits always win over it (see the tuner section in `CLAUDE.md`).
Baking a blob here changes the look for everyone on the deployed build.

## CRITICAL — `bake.mjs` does a FULL REPLACE, never a merge

**Never hand `bake.mjs` a partial object as if it were a patch.** It does not
merge keys into the existing file — it `JSON.stringify`s whatever object you
give it and replaces the ENTIRE `window.LightPresets = {…};` literal with
exactly that. A partial paste (say, just the one profile the user was tuning)
**silently wipes every other track/condition's baked lighting** — the file goes
from ~250 keys to 1, and that is a real, previously-hit failure mode, not a
hypothetical.

The **only** safe input is the in-game tuner's **COPY VALUES** button output —
that button itself does the merge (shipped file + this player's local edits)
before exporting, so its blob is always a complete snapshot, safe to use as a
full replacement. Never construct or hand-edit a `window.LightPresets = {…}`
object yourself and feed it to `bake.mjs` unless it is a complete copy of every
key that should survive.

`bake.mjs` now prints a best-effort WARNING (not a block — it still writes) when
the incoming blob has fewer than half the profile keys already shipped in
`js/game/light-presets.js`, as a tripwire for exactly this mistake. Treat that
warning as a stop sign: re-check the paste before trusting the diff.

**If you only need to update ONE key** (a single `track|tod|weather` or `"*"`
entry) and don't have a fresh COPY VALUES export, do NOT feed `bake.mjs` a
one-key object — hand-merge instead:
1. Read `js/game/light-presets.js` and parse the existing `window.LightPresets`
   object (it's plain JSON after the assignment).
2. `Object.assign` (or splice) just the one key's new value into that parsed
   object — leave every other key untouched.
3. Write the whole object back as `window.LightPresets = {…};`, preserving the
   rest of the file, and bump the cache version yourself (see `bump-cache`).
This is manual and deliberately outside `bake.mjs`'s job — its contract is "take
a full export, apply it," and a silent `--merge` mode would make a future
partial paste look safe when it is exactly the case that must not be. If a real
merge mode is ever added, it must be an explicit, separate flag (e.g. `--merge`)
that is opt-in and documented here, never the default.

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
   mkdir -p artifacts/tmp
   cat > artifacts/tmp/presets.txt <<'BLOB'
   <paste the user's window.LightPresets = {…}; here>
   BLOB
   ```

2. **Bake + bump** (writes `js/game/light-presets.js`, increments `?v=` across
   `index.html` + `version.json`; validates shape, never commits):
   ```sh
   node .claude/skills/bake-lighting/bake.mjs artifacts/tmp/presets.txt
   ```

3. **Review + syntax-check:**
   ```sh
   git --no-pager diff js/game/light-presets.js index.html version.json
   node --check js/game/light-presets.js
   ```
   Sanity: every key looks like `track|tod|weather`, values are plausible
   (lampLevel ~0.05–1, tint −1..1, etc.). If a knob id looks wrong, stop and ask
   — a typo'd id is silently ignored at runtime.

4. **Smoke (optional but cheap — catches a broken file):**
   ```sh
   npm run test:smoke
   ```

5. **Commit + push** to the active feature branch (`git branch --show-current`;
   never push to `main`). Use the git retry/backoff from the repo's git rules:
   ```sh
   git add js/game/light-presets.js index.html version.json
   git commit -m "Bake lighting presets: <one line — which tracks/conditions>"
   git push -u origin <dev-branch>
   ```

## Notes

- The helper takes the blob from a file arg OR stdin (`… bake.mjs - < blob`).
- It replaces the ENTIRE `window.LightPresets` literal — the export already
  includes existing file entries merged with the new edits, so nothing is lost
  **only if the input actually was a full COPY VALUES export** (see CRITICAL
  above). A hand-built partial object loses everything else, on purpose — the
  tool has no way to tell "a deliberately pruned export" from "an accidental
  partial paste," which is why it warns instead of guessing.
- Only `js/game/light-presets.js` values change the shipped look; a player's own
  localStorage still overrides them locally until they RESET.
- If the blob fails to parse, the helper prints the error and writes nothing —
  fix the paste (usually a stray trailing comma or truncated copy) and re-run.
- If the regex fails (`Could not find the window.LightPresets assignment`), the
  file must contain a line-anchored assignment: `window.LightPresets = {` … closing
  `};` on its own line (see the comment in `bake.mjs` — indented header examples
  must not match). Open `js/game/light-presets.js`, hand-fix the literal, run
  `node --check js/game/light-presets.js`, then re-run `bake.mjs`.
