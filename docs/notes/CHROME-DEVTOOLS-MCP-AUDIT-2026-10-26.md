# chrome-devtools-mcp pin audit — 1.7.0 → 1.11.0 → 1.12.0 (issue #3509)

Read-only audit by A·W62, 2026-10-26. Upstream changelog:
https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/CHANGELOG.md
(npm publish times from `npm view chrome-devtools-mcp time`: 1.7.0 2026-08-10, 1.8.0 08-25,
1.9.0 09-08, 1.10.0 09-23, 1.11.0 10-15, 1.12.0 10-22).

## State found

Issue #3509 (filed 2026-10-22) asks for a re-audit before leaving 1.7.0. That re-audit was
already done and shipped the same day: commit `8f549115` bumped the pin in
`tools/mcp/chrome-devtools-mcp.sh` to **1.11.0** and turned
`tools/mcp/chrome-devtools-runtime.mjs` into a version gate (`UNPATCHED_VERSIONS = ['1.11.0']`;
any unaudited version still fails closed). It is on the deploy tip.

| Item in the issue | Answer |
|---|---|
| 1. `apex-dialog-close-v1` vs new code | Retired for 1.11.0. #2902 (dialog-blocked click) is fixed upstream since 1.10.0 (#2794); #2903 (close_page selected fallback) is covered by the pages-snapshot refresh plus #3042. Verified live per `8f549115`. |
| 2. Tool surface vs `.claude/settings.json` and `output-level-mcp` | Dialect move (draft-07 → 2020-12): issue reports 28 schemas changed, 0 parameter-level breaks. Page-scoped tools take a required `pageId` since 1.8 — callers and skills must pass it. |
| 3. `npm run test:mcp` and smoke on the new version | Pin assertions updated in `apex-tools-mcp` / `chrome-server-fixes` tests by `8f549115`. |

## 1.11.0 → 1.12.0 delta (not yet audited live)

Relevant to this repo:
- Heap snapshot tools paginate by default (#3201, #3195); heap analysis without a browser (#3156).
  Our memory-census recipes that read whole snapshots will see paged output.
- `evaluate_script` is blocked while a dialog is open (#3196) and surfaces non-Error thrown or
  rejected values (#3127) — the same "[object Object]" class as #3512.
- Console output now includes unhandled-rejection reasons (#3148): useful for boot-error triage.
- Page-scoped tools on different pages run in parallel (#3252, #3243): ordering assumptions in
  `cdmcp-*` scripts should be re-read.
- `take_snapshot` wait is bounded and `resize_page` size reporting was added then reverted (#3132, #3308).
- Pagination fix: omitted `pageSize` with `pageIdx` 0 returns everything (#3134).
- `--watchConfig` and layered config reload are new flags we do not use.

No upstream change in the changelog touches the two files the old patch edited
(`tools/input.ts` dialog path, `McpContext.close_page`) except #3241 (clear handled dialog in
`McpPage.getDialog()`), so the gate's SHA256 guards would need re-checking, not the patch.

## Recommendation

Stay on **1.11.0**. Bumping to 1.12.0 is a one-line pin change plus adding `'1.12.0'` to
`UNPATCHED_VERSIONS`, but it needs a live boot here first (tools/list diff, a dialog click, a
close_page of the selected tab, one heap snapshot). That needs a chrome-devtools session and a
`.claude/**`-adjacent allow-rule check, so it is left as a tracked item, not done blind.

## Tracker checklist (also posted on #3509)

- [x] Re-audit 1.7.0 → 1.11.0, retire `apex-dialog-close-v1` for 1.11.0 (`8f549115`)
- [x] Pin bumped to 1.11.0, fail-closed gate kept
- [ ] Boot 1.12.0 live: `tools/list` diff vs 1.11.0, dialog click, selected close_page, heap snapshot pagination
- [ ] If clean: pin `chrome-devtools-mcp@1.12.0`, add to `UNPATCHED_VERSIONS`, update the two pin tests
- [ ] `docs/AGENT-SURFACE.md` (the `chrome-devtools-official` row still says `@1.7.0` by hand) — refresh with the pin
- [ ] Confirm skills / `cdmcp-*` scripts pass `pageId` on page-scoped tools
