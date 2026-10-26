# Grok transcripts CLI — streamer design

**Date:** 2026-10-25  
**Status:** approved simple design (Bryce via DAD)  
**Owner lane:** Fleet D · W29a · `tools/transcripts/**`

## Goal

A Node CLI that **searches**, **exports**, and **digests** one or many Grok Bot
`ReadTranscript` JSONL dumps (each line one record). Operators can find a
substring, filter by role / content-block type / tool name, stream filtered
JSONL out, or print aggregate counts — without loading a whole dump into memory.

## Non-goals

- No SQLite (or any other index / DB).
- No TUI, web UI, or interactive browser.
- No mutation of dump files (read-only; export writes a separate path or stdout).
- No live ReadTranscript API / network fetch; paths are local files only.
- No Playwright / game runtime integration.

## Record shape (verified on real dumps)

Each non-empty line is JSON:

```json
{ "role": "user"|"assistant"|"tool"|…, "message": { "content": [ /* blocks */ ] } }
```

Content block types:

| `type` | fields used |
|---|---|
| `text` | `text` |
| `thinking` | `thinking` |
| `tool_use` | `id`, `name`, `input` |
| `tool_result` | `tool_use_id`, `name`, `result` |

Unknown roles / block types are still streamed and counted; filters simply miss them.

## Streamer architecture

1. Resolve each path argument to a readable file (globs optional later; MVP = explicit paths).
2. Open a `readline` interface over a file stream (`fs.createReadStream` + `readline.createInterface`).
3. For each line: trim; skip empty; `JSON.parse`; on failure increment a per-run bad-line counter and **continue** (stderr summary at end).
4. Hand the parsed record + `{ file, line }` to the active command (search / export / digest).
5. **Never** `readFileSync` the whole dump; never accumulate all records in an array for MVP commands (digest keeps only counters / top-N maps).

Shared libs under `tools/transcripts/lib/`:

- `stream.mjs` — async generator / callback over records
- `match.mjs` — role / type / tool / query filters
- `format.mjs` — human snippet + `--json` lines
- `digest.mjs` — counters + top tool names

## CLI surface

Entry: `node tools/transcripts/cli.mjs <cmd> …`  
(`#!/usr/bin/env node` shebang; bare invoke / `-h` / `--help` print usage, exit 0.)

### `search <paths…> --query <str> [filters] [--json] [--context N]`

- Case-insensitive substring match across: block `text` / `thinking`, tool `name`, and stringified `input` / `result`.
- Filters (AND): `--role user|assistant|tool`, `--type text|thinking|tool_use|tool_result`, `--tool <name>` (case-insensitive exact on block name).
- Default output: `file:line  role  type  snippet` (snippet truncated; with `--context N`, include ±N neighbour **records** from the same file around a hit — still streamed via a small ring buffer of size `N`, not a full load).
- `--json`: one JSON object per hit on stdout (`file`, `line`, `role`, `type`, `snippet`, optional `record`).

### `export <paths…> [filters] [--out file|-]`

- Stream matching **whole records** as JSONL to stdout (default / `--out -`) or `--out <file>` (overwrite).
- Same role / type / tool filters as search; no `--query` required (omit = pass all that match filters).

### `digest <paths…>`

Print counts only:

- files, lines (non-empty), bad JSON lines
- roles (`user` / `assistant` / `tool` / other)
- content-block types
- top tool names (by `tool_use` + `tool_result` `name`, top 10)

No full dump of text.

## Flags / exits

- Unknown flags, missing `--query` for search, missing paths → stderr usage + exit **2** (bad args).
- Unreadable path → stderr + exit **1**.
- Bad JSON lines → skip, keep streaming; print `bad_json_lines=N` on stderr at end (exit 0 if otherwise ok).
- Success → exit **0**.

## Output formats

| command | default | `--json` / `--out` |
|---|---|---|
| search | human one-liner per hit | NDJSON hit objects |
| export | JSONL records on stdout | JSONL to `--out` |
| digest | human key=value / indented counts | (MVP: human only) |

## Acceptance checks

1. `node tools/transcripts/cli.mjs` and `--help` print usage, exit 0.
2. `digest` on `tests/fixtures/grok-transcripts/sample.jsonl` reports expected file/line/role/type/tool counts.
3. `search … --query Mom` on a real dump (`uploads/Mom.jsonl`) returns ≥1 hit with `file:line`.
4. `export … --type tool_use` emits one JSON object per line, parseable, each with a `tool_use` block.
5. A fixture with a corrupt line yields a stderr bad-line count and still streams valid rows.
6. Unit test `tests/unit/transcripts-cli.test.mjs` covers parseArgs, match, digest counts, and spawn smoke of the three commands against the fixture.
7. Streamer does not buffer the whole file (enforced by design + unit test that processes a fixture via the stream helper and asserts per-line callbacks).

## Layout

```
tools/transcripts/cli.mjs
tools/transcripts/README.md
tools/transcripts/lib/{stream,match,format,digest,args}.mjs
tests/fixtures/grok-transcripts/sample.jsonl
tests/fixtures/grok-transcripts/with-bad-line.jsonl
tests/unit/transcripts-cli.test.mjs
docs/superpowers/specs/2026-10-25-grok-transcripts-cli-design.md
docs/changelog.d/grok-transcripts-cli.md
```

Registration: add the unit file to `tests/groups.json` `toolingFast` (alphabetical), then `npm run gen`. No `tools/manifest.cjs` entry (Node CLI, not a game module).
