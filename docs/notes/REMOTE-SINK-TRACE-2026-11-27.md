# Remote-data sink trace (#7092) — 2026-11-27

Kind: measurement · Re-measure-by: 2027-02-27 (or when a new js/data / js/net consumer lands).

Method: `node tools/check/html-sink-lint.mjs` (11 audited sites, 0 unaudited) plus a read of every remote-text consumer.

| Source | Consumer | Sink | Verdict |
|---|---|---|---|
| Jolpica / OpenF1 rows (`js/data/*`) | `Dom.el()` text, `textContent` | none; zero HTML sinks in `js/data` | clean |
| OpenF1 team-radio `url` | `real-race-script.js` keeps only `^https://` | link/audio target | scheme-filtered |
| OpenF1 session link | `real-race-tab.js:498` `encodeURIComponent(sessionKey)` on a constant origin | `a.href` | clean |
| Peer / lobby messages, share codes (`js/net/*`) | `wire-schema.js` validates; zero HTML sinks in `js/net` | none | clean |
| Imported files (garage/team, settings) | `Flags.svg` allows only table codes; `paintFold` escapes `< > "`; `aria-state` escapes | `innerHTML` | audited, allowlisted |
| `lightCopy(obj)` / `LightStore.restore(undo)` | was unvalidated | `profiles` -> localStorage | FIXED: whole-snapshot validation |

Pins: `html-sink-lint.test.mjs` (zone has no sink), `light-store-copy.test.mjs` (restore rejects invalid undo).
