# tools/moves — live move plans only

Applied Phase 2 / Phase 4 / batch plans live in
[`docs/archive/moves/`](../../docs/archive/moves/). They are historical
records — `from` paths are gone, so `move-tree.mjs` must not re-run them.

**Live:**
- `spike-backends.json` — reversible WGX/TLX spike map (keep until reverse lands)

```sh
node tools/gen/move-tree.mjs tools/moves/spike-backends.json --plan
```
