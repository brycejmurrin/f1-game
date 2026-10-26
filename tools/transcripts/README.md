# tools/transcripts

Stream Grok Bot `ReadTranscript` JSONL dumps: search, export, digest.

Design: [`docs/superpowers/specs/2026-10-25-grok-transcripts-cli-design.md`](../../docs/superpowers/specs/2026-10-25-grok-transcripts-cli-design.md)

```sh
node tools/transcripts/cli.mjs --help
node tools/transcripts/cli.mjs digest path/to/dump.jsonl
node tools/transcripts/cli.mjs search dump.jsonl --query Mom
node tools/transcripts/cli.mjs search dump.jsonl --query send --type tool_use --json
node tools/transcripts/cli.mjs export dump.jsonl --type tool_use --out - | head
```

No SQLite. No web UI. Line-by-line readline parse; bad JSON lines are skipped with a stderr count.
