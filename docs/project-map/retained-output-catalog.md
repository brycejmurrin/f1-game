# Retained output catalog

This catalog classifies all 5,776 entries in the frozen retained inventory. It is separate from the original 5,109-entry source scope. retained-output-evidence.json records each entry’s frozen size, kind and hash where available, method, classification and provenance. Raw historical paths are confined to JSON evidence.

| Classification | Entries |
|---|---:|
| retained-authored-input | 70 |
| canonical-hash-duplicate | 4691 |
| generated-log-or-receipt | 78 |
| excluded-own-analysis | 233 |
| structured-diagnostic | 53 |
| binary-generated-output | 13 |
| excluded-profile-or-symlink | 168 |
| historical-novel-source | 463 |
| generated-html-or-cached-document | 4 |
| generated-diagnostic-or-test-fixture | 3 |

The inventory has 4,750 canonical hash duplicates (including entries classified under stronger exclusion boundaries). Final parent reconciliation closed all 4,750 canonical duplicate identities with no unresolved match. Inherited evidence keeps the canonical read/inspection method. Historical novel ranges use the eight final snapshot reports; their unchanged blocks are closed by snapshot-identity.json and retained-identity-closure.json: all 2,289 equal blocks across 463 retained source identities match current canonical bytes, and equal/novel unions cover every source byte. Retained authored inputs use the four final retained-source reports. A report reference documents delegated reading; it does not claim this catalog manually reread those bytes.

Structured diagnostics received complete machine parsing and recursive traversal for 450 safe JSON or JSONL files. Evidence contains types, node counts, depth, root cardinality, parse-error types and identity checks; payloads and object keys are omitted. JSONL shot fixtures allow comment lines under their producer contract. Parse errors are recorded rather than silently counted as successful reads.

Generated logs, receipts, cached HTML and binary captures/packages receive metadata and provenance treatment. They are historical observations, not current test results. Shader extracts belong to the offline shader-validator output contract. CI watcher state stores already-reported jobs. Survey temporary directories include intentionally tiny or invalid image fixtures and generated galleries; their presence does not prove visual quality. Exact historical producers are explicitly unproven where only path-family evidence exists.

Installed TinyFish 0.1.0 (MIT) and chrome-devtools-mcp 1.12.0 (Apache-2.0) checkouts are external tool dependencies, not authored game source. Only supplied safe package identities are used.

The inventory’s excluded boundaries remain excluded. Entire browser profiles receive metadata-only treatment, including individual entries the inventory happened to list. No profile, secret, recovery payload, dependency/cache tree or symlink target was opened. Own mapping outputs are excluded from recursive source work. The JSON evidence preserves every original boundary without publishing its paths here.

No novel authored source outside the planned raw scopes remains.

This is a frozen metadata census, not a claim to have manually read generated logs or every retained byte. No files were deleted; no historical scripts, tests, browser, network or runtime tools were executed. Only the requested catalog outputs were written.
