# Multiplayer modules and hooks

Moved from SKILL.md; the skill links here.

## Modules

| Module | Role |
|---|---|
| `js/net/transport.js` | Two channels: `state` unreliable/unordered, `event` reliable/ordered; `loopback()` is deterministic and in-page |
| `js/net/sdp.js` | Packs gathered SDP facts into a scannable invite code; round-robins candidates by kind so a relay survives the cap |
| `js/net/handshake.js` | ICE -> slim SDP -> deflate -> base64url invite; refuses mismatched builds (authoritative `apex-build` meta; `version.json` fallback only when unstamped) |
| `js/net/nostr.js` | Public Nostr rendezvous, signalling only; the relay list is its `RELAYS` array |
| `js/net/rendezvous.js` | Backup room-code courier; typed errors, never throws; no default URL — `localStorage` key `apex26.rendezvous` |
| `js/net/snapshot.js` | Fixed-size per-car snapshots, interpolation, road-following extrapolation |
| `js/net/session.js` | Clock sync, packet routing, heartbeat |
| `js/net/ice.js` | `NetIce`: the STUN/TURN list `NetTransport.rtc()` gathers with (one cache; the public names stay on `NetTransport`) |
| `js/net/interp.js` | `NetInterp`: draws a rival smoothly from late, reordered or missing poses (peeled from `NetSnapshot`) |
| `js/net/quali-wire.js` / `js/net/strategy-wire.js` | `QualiWire` validates a peer's qualifying time; `StrategyWire` is the versioned tyre/pit payload on the reliable channel (both peeled from `NetPlay`) |
| `js/net/netplay.js` | Authority: own car never corrected; host relays guests and owns AI/race control |
| `js/net/lobby.js` | VS FRIEND UI; sequential invites; profiles filed by connection |
| `js/net/lobby-codes.js` | Paste/copy/share/scan/QR routes for invite and answer codes (`codeFrom` on pasted links) |
| `js/net/lobby-roster.js` | Stateless roster DOM leaves (team lookup, seat rows) |
| `js/net/qr.js` / `js/net/scan.js` | `NetQr` encodes the invite QR; `NetScan` reads one in-page (BarcodeDetector, else jsQR) — the phone Camera→Safari route needs neither |
| `js/net/spectate.js` | `NetSpectate` driver/spectator role policy for seats and send gates |
| `js/net/bytes.js` | `NetBytes` shared base64url/hex codecs (loads first in LAZY_NET) |
| `js/net/lobby-settings.js` | Lobby race settings (the full module list: `LAZY_NET` in `tools/manifest.cjs`) |

## Hooks

Hooks (`js/agent/apex-net.js`; `turnProbe` is in `js/agent/apex.js`):

| Hook | Use |
|---|---|
| `__apex.net()` | **Primary remotes/buffers inspector** — role, grid slots, clock sync, buffered packets; `{ active: false }` when solo |
| `__apex.netLoopback(opts)` | Start one-page deterministic peer session |
| `__apex.netPeerSend(state, atMs?, wireId?)` | Publish remote state into the local session |
| `__apex.netTick(nowMs?)` | Pump net session by virtual time |
| `__apex.netStartArm(nowMs, atMs?, hold?)` | Test synchronized lights-out |
| `__apex.netHostStart()` | Exercise host start scheduling |
| `__apex.netPeerClose()` / `netStop()` | Drop peer or end local session |
| `__apex.lobbyInviteAnother()` | Mint a further host invite |
| `__apex.lobbyReady(v?)`, `lobbyStart()` | Drive waiting-room controls |
| `__apex.lobbySdp()` | Inspect SDP that actually crossed |
| `__apex.lobbyPairs()` | Inspect ICE candidate-pair state |
| `__apex.turnProbe(ms?)` | Probe TURN relays with relay-only gathers |

