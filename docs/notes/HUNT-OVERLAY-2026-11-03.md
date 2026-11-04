# Bug hunt: broadcast / stream overlay (2026-11-03)

Kind: hunt · Re-measure-by: 2027-02-01

Lane 11 HALF:front (`lane:cursor`). Slice OWNED: `js/overlay/**`, `overlay.html`,
`tests/unit/overlay*`. Correctness, edge cases, layout and overlay-local perf.
Product gap #1552 (WebRTC/Nostr STREAM OVERLAY setting) is out of scope.

Method: prior-art scout → code-hunter on `js/overlay/*` + `overlay.html` →
finding-verifier on every candidate. apex-lsp outlines first; no browser run
(AGENTS.md rule 5). Tip at claim: `dca168790f`.

## Ranked findings

| # | Sev | Where | Verdict | What | Action |
|---|-----|-------|---------|------|--------|
| 1 | P0 | `js/overlay/publisher.js` `input()` | CONFIRMED | Ranked cars omitted `prog`/`speed`. `OverlayFeed.battle` defaults both to 0 → `Broadcast.battles` gap `(0-0)/floor = 0` → BATTLE paints for any 2+ car field (even a 5 s interval). `intervalS` alone cannot feed `battles()` (prog-only contract). | **Fixed:** synthesise `prog`/`speed` from `gapToLeaderS` (else cumulative `intervalS`) at nominal 70 m/s. Test: `overlay-publisher.test.mjs` "HUNT-OVERLAY". |
| 2 | P2 | `overlay.html` `@media (max-width:700px)` | CONFIRMED | Phone block pins tower `left:12px` / sectors `right:12px` with no `body[data-side="right"]` mirror (desktop has one). `?side=right` stacks both panels on the wrong edges under 700px. | **Fixed:** right-side overrides in the 700px block. Test: `overlay-render.test.mjs` "HUNT-OVERLAY". |
| 3 | P2 | `overlay.html` `.ov-row` height vs `render.js` paint | CONFIRMED | CSS row height was 31px; paint uses `((pos-1)*34)px`. Lower slots drift ~3px each (row 20 ≈ 57px). | **Fixed:** row height 34px to match the translate step. Same test as #2. |
| 4 | P2 | `js/overlay/render.js` `clear()` | PARTIAL | `clear()` zeroes `data-flash` but does not `clearTimeout` `flashTimers`. Pending timeout only clears flash (does not re-set `"1"`) — re-flash-after-clear claim REFUTED; next `paint()` can still flash because labels reset to `S1`… | Open: clear timers in `clear()`; optional keep last sector labels on dispose. |
| 5 | P2 | `js/overlay/bridge.js` `host` | PARTIAL / STALE e2e | `report()` / peer TTL only on BC traffic or `peers()`. Ghost hello with no publisher never expires alone. Wired game path already calls `bridge.peers()` every tick (FIXED #4457 / publisher test). | Open: host-side `HELLO_MS` sweep for the no-publisher case. |
| 6 | P1 | `tapCaptions` / announce MO | PARTIAL | Observer fires `read()` on every delivery — CONFIRMED. Multiple caption ids from `showAnnounce`'s three sync `textContent` writes — REFUTED (MO batches one microtask). Multi-task hide/class updates can still double-fire. | Open: rAF coalesce if a real double-caption shows up in OBS. |
| 7 | P3 | `js/overlay/publisher.js` tick | OPEN | `differ.next()` always returns at least `{v,seq,t}`; publisher `send`s seq-only patches at 4 Hz (OBS BC churn). | Open: skip `send` when patch has no keys beyond `v`/`seq`/`t`. |
| 8 | P3 | `js/overlay/render.js` `boot`/`paint` | OPEN | `subscribe()` return discarded — no `close()` on `pagehide`. `paint` accepts `{v:1}` without `OverlayFeed.accept` (no `seq` check). | Open: store sub + pagehide close; accept before merge. |
| 9 | P3 | `publisher.js` `pit: !!r.retired` | OPEN | Tower "PIT" label maps retirement only; live pit-stop cars stay blank until field exposes `inPit`. | Open: wire when `__apex.field` carries pit state; comment until then. |
| 10 | P3 | `feed.js` `createDiffer` | OPEN (low) | Unchanged ticks still touch lazy `rows` getters via `same("rows",…)`. | Open: cache row snapshot on `previous`. |

## Do-not-re-report (prior art)

Publisher silent-peer TTL on tick (#4457); battle re-arm on leave-race; tower rebuild
every 4 Hz; BATTLE-after-results / caption latch; transparent bg / phone panel polish;
#1551 BC publisher; #1553 captions-only / contrast / reduced motion; OBS CEF separate
profile (documented until #1552).

## Covered

`bridge.js`, `feed.js`, `publisher.js`, `render.js`, `overlay.html`,
`tests/unit/overlay-{feed,publisher,render}.test.mjs`.

## Not covered

Live OBS Browser Source, WebRTC slice #1552, in-game TV HUD (`TvGraphics`) parity.
