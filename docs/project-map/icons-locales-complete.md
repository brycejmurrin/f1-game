# Icons and locale leaf map — complete

All78 tracked icon paths and both locale files are mapped. The six-line icon guide and both JSON files were fully read. All77 PNG resources were inspected as binary metadata, with complete chunk traversal, CRC validation, dimensions, bit depth, color type, byte size and SHA-256 recorded in `icons-metadata.json`. No visual quality or rendering claim is made from metadata. All PNG chunk CRCs passed and traversal accounted for every byte.

## Usage and provenance

The five top-level icons provide three180/192/512 application sizes, a512 maskable icon and a shared96 shortcut icon. Six candidate sets A–F each contain ten96 shortcut variants (five named shortcuts with ordinary/maskable versions), a180 apple-touch icon and32 favicon. Dimensions across the77 images:61 at96, seven at180, six at32, two at512 and one at192.

The guide at icons/shortcuts/README.md explains color treatments, safe-circle intent, the appearance picker, fixed manifest shortcut usage and installed-icon limits. It does not identify an in-repository generator; no generator provenance is invented. index.html:77 loads the default180 icon for both favicon and apple-touch. manifest.json references the top-level application and shared shortcut assets. sw.js:283 precaches application resources and set-specific favicon/apple-touch pairs. AppearanceOpts.applyIcon at js/ui/appearance-opts.js:402 switches only the document icon links to a selected A–F directory; it does not rewrite shortcut manifest entries. The guide matches that distinction. Source references establish intended consumers; no install/browser flow was exercised.

## Locale catalogs

locales/en.json contains exactly two English defaults: garage.preview.stop→STOP PREVIEW and settings.title→SETTINGS. Both literal fallback strings are present in index.html:3530 and895. locales/manifest.json contains only English, with ltr direction, reviewed status, two keys and hash17a19f8b. Recomputed SHA-256 of the complete English JSON starts17a19f8b, matching that manifest value.

The producer tools/gen/gen-locales.mjs scans I18n.t literal call sites and data-i18n HTML, emits sorted English defaults, refreshes hash8, and preserves non-English manifest rows when present. Its root parameter changes output/previous-manifest locations while scanCallSites uses the checkout-level ROOT; this is a source observation, not an exercised alternate-root contract. The consumer js/core/i18n.js reads the manifest; English and en-XA skip fetching a catalog because call-site fallback strings supply English. Non-English catalog requests encode the language and append the manifest hash. Failed fetches fall back to defaults. I18nDom applies translated text/attributes from fallback-bearing nodes when language is not plain English. Semantic LSP references for I18n.t returned four references across dom-apply and i18n. This small catalog does not mean the entire interface has been migrated.

## Cleanup findings and limits

The icon guide correctly qualifies installed-icon changes and shared shortcut behavior. No stale claim was established in these leaves. Binary metadata does not verify glyph appearance or the advertised80% safe circle. Locale catalog/hash consistency is a read-only calculation; no generator, lint, browser, network or runtime test was run.

## Fully read text identities

| Source | Lines | Bytes | SHA-256 |
|---|---|---|---|
| icons/shortcuts/README.md | 1–6 | 662 | 8a46c19d4879188bf771471c45fd1f210f8ef91f701e2a72b9c52518a9ce1b50 |
| locales/en.json | 1–4 | 76 | 17a19f8b8a2b891deac104ba6877ea32fd0da21bf9e71a01413deb85260b62f7 |
| locales/manifest.json | 1–9 | 123 | 73451103edb2eaf39a55c9aa1cdc1c112049836f4b10af3a7025724b19c95433 |
