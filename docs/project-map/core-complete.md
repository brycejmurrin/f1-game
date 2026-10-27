# Core complete source map

## Goal and source
All 16 files / 3,597 lines in js/core were fully read by GPT-6.1 Sol complete_core at c4dc493d9. Long files were read in contiguous untruncated chunks. Attached LSP references covered all 18 globals plus SaveMigrate. Runtime source was not changed.

## File coverage and contracts

| File | Full lines | Contract |
|---|---:|---|
| clipboard.js | 85 | Frozen async clipboard read/write with modal-aware textarea write fallback, selection/focus cleanup. |
| dev-flags.js | 117 | Nine flags; URL, saved value, default resolution. |
| dom-apply.js | 59 | I18n text/attribute application and locale lifecycle subscription. |
| hash32.js | 31 | FNV-1a, avalanche mix, deterministic unit float; career, daily, rating, editor, handshake consumers. |
| i18n-pseudo.js | 34 | Accent/padding transform with placeholder markers. |
| i18n.js | 300 | Language/catalog loading, interpolation/plural, Intl caches and ready/change events. |
| lazy-bundles.js | 842 | Manifest-driven race/audio/net/agent/data/track loading and readiness/retry ownership; game consumer. |
| log.js | 210 | Namespaced console/buffer levels and bounded flattened records; 788 LSP references across 206 files. |
| mat4.js | 98 | Scalar/vector/matrix helpers, output-writing transforms; 163 M4 references in 63 files. |
| menu-sheet-gate.js | 127 | Settings visibility/focus quiet gate and parked warm counters; game/garage/lazy consumers. |
| native-download.js | 173 | Capacitor Filesystem/Share export, safe owned-cache pruning and blob-anchor interception. |
| native.js | 79 | Call-time native platform, origin, plugin and share-base detection. |
| save-schema-registry.js | 252 | Persistence owner/version/lane/validator resolution and dynamic settings ingestion. |
| script-loader.js | 254 | Dependency scheduler, version/SRI, retries/deadlines, generation/inflight/evaluated ownership. |
| store.js | 878 | Cached JSON/raw persistence, durable failures, revisions, career write lock, IDB mirror, time trials, migration helpers. |
| wake-lock.js | 58 | Deduplicated wake-lock lifecycle and late-grant/release handling; game caller. |

## Data flow and LSP evidence
Game composes ScriptLoader and LazyBundles with live G hooks. GameStore is the persistence seam (247 references / 62 files); SettingsDefaults/GarageDefaults/SaveSchemaRegistry supply defaults/ownership. SaveMigrate is required by the final store export. I18n composes I18nPseudo and is applied by I18nDom. NativeDownload consumes Native and optional Log. MenuSheetGate coordinates warm work with settings. ScriptLoader has 11 consumer files including renderer/track/XR/share/agent loading.

## Findings
- i18n-pseudo.js:12 promises placeholder preservation. Padding at lines 22–26 can corrupt marker digits before restoration at line 29. Read-only VM probe expand('a{name}') returned bracketed accented a followed by NUL, 0~, NUL. This is a reproduced implementation/contract discrepancy.
- SaveSchemaRegistry header says settings ingestion happens at evaluation; the actual caller is SettingsExport evaluation (js/ui/settings-export.js:318), which should be named for clarity.
- Hash32.unit career-only wording requires function-specific caller verification before editing; module-wide callers alone do not prove this claim stale.

## Verification and remaining goal
All core bodies fully read; consumer bodies not universally read. No browser or runtime fixes. Continue outstanding domains and game.js; parent owns docs validation and commit.
