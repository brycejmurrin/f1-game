# COTA survey captures (`cursor/cota-survey-fc61`)

**30** JPEG frames (`q≈80`, max width 1280 px, each &lt;300 KB). Commit with:

```sh
git add -f artifacts/shots/tracks/cota/*.jpg
```

Parent `artifacts/` is gitignored; force-add is required until the fleet `!artifacts/shots/tracks/**` exception lands.

- **Weather:** dry only (wx matrix after shared shot tooling PR).
- **Regenerate from PNG sources:** use `sharp` resize 1280 + JPEG q80 (see survey commit) or re-run `capture-jobs-supplement.jsonl` with `shot.mjs --jpeg`.

Raw GitHub URL pattern:

`https://raw.githubusercontent.com/brycejmurrin/f1-game/cursor/cota-survey-fc61/artifacts/shots/tracks/cota/<file>.jpg`
