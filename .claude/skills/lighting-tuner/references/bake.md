# Bake copied LIGHTING TUNER settings and push

**TWO INPUTS, TWO TOOLS. Read the first line of the paste.**

## Contents

- CRITICAL — `bake.mjs` is a FULL REPLACE
- Capture, review, ship
- Read-only preflight receipts

| paste starts with | what it is | tool |
|---|---|---|
| `window.LightEdits = {…}` | a DELTA — only the player's own overrides, what COPY VALUES emits | `merge-proposals.mjs` (merge) |
| `window.LightPresets = {…}` | a full SNAPSHOT of every profile | `bake.mjs` (full replace) |

COPY VALUES exports `window.LightEdits`, a DELTA that `bake.mjs` refuses by name. Either tool
writes shipped `js/lighting/presets.js` (no cache bump; localStorage outranks it until RESET).

Live knob work without a paste → the lighting-tuner index (`SKILL.md`).

Per-track agent proposals: see the merge path below. Never let a subagent write
`js/lighting/presets.js`.

## CRITICAL — `bake.mjs` is a FULL REPLACE

**Never hand `bake.mjs` a partial object.** It replaces the entire
`window.LightPresets = {…};` literal, so a one-profile paste silently wipes
~1,000 other keys. Its only safe input is a complete snapshot. A key-count
WARNING (incoming < half of shipped) is a stop sign, not a block; a
`window.LightEdits` paste is refused outright, because that shape is now an
expected input and guessing wrong destroys the file.

Commands: Steps (snapshot, `bake.mjs`) and The merge path (`merge-proposals.mjs`) below.

## Capture, review, ship

Load this when you have a blob and are ready to write
`js/lighting/presets.js` (the table at the top picks the tool).

### The merge path (no bake.mjs) — proposals AND player pastes

`merge-proposals.mjs` takes two shapes and validates both the same way (ids /
ranges / slider-grid against live `TUNE_DEFS`), leaving every key it was not
given alone. It does **not** bump cache.

```sh
node .claude/skills/lighting-tuner/scripts/merge-proposals.mjs                      # the proposals dir
node .claude/skills/lighting-tuner/scripts/merge-proposals.mjs artifacts/tmp/edits.js   # one pasted export
```

- **Agent proposal** — `artifacts/lighting/proposals/<id>.json`, shape
  `{track, combos:{"dusk|dry":{…}}}` (schema in `../../../../docs/LIGHTING.md`).
  Parent merges; this is the only safe multi-agent path. Within a condition a
  proposal **REPLACES**: it is a considered whole profile, so dropping a knob is
  how it decides against one, and an empty map resets the condition.
- **Player paste** — `window.LightEdits = {…}` from COPY VALUES, keyed by the
  full `"track|tod|wx"` plus the `"*"` / `"*|tod"` layers a proposal cannot
  express. Within a condition a delta **MERGES**: two sliders moved is two knobs
  added, not the other eight deleted. A delta may never delete a condition.

Save the paste to a file and pass the path — it is read with `vm`, so the `//`
comments the export writes between blocks are fine.

### One-key hand-merge (no bake.mjs)

If you only need to update ONE `track|tod|weather` (or `"*"`) key and do not
have a complete shipped snapshot, do **not** feed `bake.mjs` a one-key object:

1. Read `js/lighting/presets.js` and parse the existing
   `window.LightPresets` object (plain JSON after the assignment).
2. `Object.assign` just that key's new value — leave every other key.
3. Write the whole object back as `window.LightPresets = {…};` and
   `node tools/gen/gen-shell.mjs --check` (no bump: [shell/cache](../../check-changes/references/bump.md)).

Prefer the explicit `merge-proposals.mjs` path for partial player deltas.

### Input shape

Keys are `"trackId|timeOfDay|weather"`, `"*"`, or `"*|timeOfDay"`;
`timeOfDay` ∈ dawn|day|dusk|night, `weather` values must be registered in the current game settings.
Values are partial `{knobId: number}` maps (only non-default knobs).

### Steps

1. **Capture the blob** (file arg or stdin; wrapper optional):
   ```sh
   mkdir -p artifacts/tmp
   cat > artifacts/tmp/presets.txt <<'BLOB'
   <paste the user's window.LightPresets = {…}; here>
   BLOB
   ```

2. **Bake** (writes presets only, never commits; no cache bump:
   [shell/cache](../../check-changes/references/bump.md); validates key syntax,
   registered knobs, finite values, range and slider grid):
   ```sh
   node .claude/skills/lighting-tuner/scripts/bake.mjs artifacts/tmp/presets.txt
   ```

3. **Review + syntax-check:**
   ```sh
   git --no-pager diff js/lighting/presets.js
   node --check js/lighting/presets.js
   ```
   Every key and knob must pass the script validator.

4. **Smoke (optional):** `node tools/ci/test-bg.mjs smoke`

5. **Commit** `js/lighting/presets.js` on the active feature branch (two calls, AGENTS.md rule 12),
   message `Bake lighting presets: <which tracks/conditions>`.

### Dry run (no write into js/)

`--check` (see Read-only preflight receipts) prints a receipt and writes nothing. Verdict: `Merged N incoming profile(s): W written, K knob(s).` rc 0; any error lists
`file: key.id …` and rc 1 with nothing written. `bake.mjs` reads bare JSON or a JS
literal only: a leading `//` comment line fails to parse, so strip comments from a
`window.LightPresets` paste first (`window.LightEdits` goes through `merge-proposals`, which tolerates them).

### Notes

- Helper takes a file arg OR stdin (`bake.mjs - < blob`).
- Parse failure writes nothing — usually a stray trailing comma.
- Regex failure (`Could not find the window.LightPresets assignment`): the
  file must contain a line-anchored `window.LightPresets = {` … `};` on its
  own line. Hand-fix, `node --check`, re-run `bake.mjs`.

## Read-only preflight receipts

Both scripts accept `[file] --check` (alias `--dry-run`) and `--json`.
Before writes, validate registered track/time/weather keys, `*` and `*|tod`,
registered knob ids, finite range and slider-grid values through the shared
`tools/lighting/preset-validation.mjs`. Receipts list added/deleted/changed
profiles deterministically. `--check` creates no output or shipped-file edits.
A snapshot deletion receipt requires reviewing every removed key; a player
COPY VALUES delta belongs in merge-proposals, never full replacement.
