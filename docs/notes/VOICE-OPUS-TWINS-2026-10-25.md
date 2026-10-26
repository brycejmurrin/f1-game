# Voice Opus twins for the default packs (A·W51, option A)

Scope: `george`, `fable`, `emma`, `heart` only. Each gets `<pack>.opus.bin` plus an `opus` block in `<pack>.json`.
The MP3 `.bin` files are byte-identical to the deploy tip (sha256 table in the PR body).

Generated with `node tools/gen/voicepack.mjs --opus-only --id <voice> --kokoro scratch/voicepack --ffmpeg /usr/bin/ffmpeg`
(kokoro-js in a scratch install; the twin re-renders the same trimmed Kokoro output, never transcodes the MP3).

Option B (twins for all 24 packs) is NOT built: it awaits Bryce's decision.
The iPhone Opus decode probe (A·D2, `--scenario opus`, #3708) runs after #3729 is live and names the container.
