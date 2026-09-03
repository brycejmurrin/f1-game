# Multiplayer debug workflow — layer classify, loopback, ICE/TURN, three-player, mistakes

Load from the SKILL.md index when the task needs this detail.

## Workflow / Implementation

1. **Classify the failure by layer.**
   - Lobby/UI: invite buttons, ready/start, seats, QR/scan.
   - Signalling: invite/answer strings, Nostr or room-code rendezvous.
   - ICE/TURN: candidates crossed, relay availability, nominated pair.
   - Game wire: snapshot ids, authority, interpolation, countdown/start.

2. **Prefer loopback before a browser/network run.**
   - Use `NetTransport.loopback()` via `__apex.netLoopback()` to remove real ICE
     and wall-clock timing.
   - Pass `nowMs`, then drive `__apex.netTick(nowMs)` explicitly.
   - Inject latency/jitter/loss only after the zero-latency path is understood.

3. **Preserve authority boundaries.**
   - A player's own car is never corrected by the host.
   - Remote cars are posed from replicated state; local physics must early-out
     when `netPlay.owns(c)` is false.
   - The host owns AI and race control and relays guest snapshots without
     changing authority.
   - Key rivals by content-derived ids (`wireId` / driver id), not `cars[]`
     index; grids can differ by player.

4. **Debug signalling as data crossing, not local gathering.**
   - `lobby().wire.candidates` and `turnProbe()` describe local gather.
   - `lobbySdp().remoteTypes` answers what the peer actually received.
   - If remote SDP has no `relay`, inspect SDP packing/truncation and make sure
     ICE prefetch completed before `RTCPeerConnection` construction.
   - **Relay candidates arrive last** — if the invite/answer string is truncated,
     relay entries are the ones dropped. Symptom: desktop host gathers fine,
     mobile guest never finishes ICE (`checking`/`connecting` forever). Probe ICE
     on the **stuck peer** (usually the guest), not only the host.

   - **Guest stuck ON the countdown (lights visibly lighting, never launches)
     is NOT an ICE symptom — signalling already worked.** If the connection is
     up (both peers show `net().active`/roles correctly), stop probing ICE and
     look at countdown *consumption* instead: `js/game.js` reads `netStart`
     (`{ at, hold, now() }`) each frame and derives `countT` from it
     (`countT = (COUNTDOWN_S + startHold) - (netStart.at - netStart.now()) / 1000`,
     ~line 2970), which drives `lightsLit` (~line 2993) and only clears
     `netStart` once `lightsLit === COUNTDOWN_S && countT > COUNTDOWN_S +
     startHold` (~line 3008-3012, the "consumed; never carry it into the next
     race" comment). A guest stuck with lights lit but the race never starting
     means that consumption path never satisfied its exit condition — check the
     guest's own `countT`/`lightsLit` progression via `G.countT`/`G.lightsLit`
     (test-only accessors) or step through `netStartArm`/`netHostStart`, not the
     ICE/candidate layer.
   - **`__apex.net().startPending` is a boolean only** — it reflects
     `!!G.netStart` (see `netHostStart()` in `js/agent/apex.js`), i.e. whether a
     start has been armed at all. It carries none of `netStart`'s actual fields
     (`at`, `hold`, `now`) and cannot tell you *why* a guest is stuck mid-
     countdown — for that, inspect `countT`/`lightsLit` progression directly as
     above, not `startPending`.

5. **Mobile QR flow is out-of-band.**
   - Desktop host shows a QR; the phone guest opens the encoded URL in **Safari
     via the Camera app** (or paste), not the in-page scan UI. Do not debug
     mobile join by expecting the guest to use `NetScan` inside the game page.

6. **Debug ICE with candidate pairs.**
   - Run `await __apex.turnProbe()` first: no relay and dead relay are different
     fixes.
   - If relays exist but no connection forms, use `await __apex.lobbyPairs()`.
   - `recv: 0` across pairs means checks leave but no answer returns; a
     succeeded-but-not-nominated pair means something else ended first.

7. **Respect build handshakes.**
   - Handshake refuses mismatched `version.json` builds because physics/track
     constants can differ.
   - If JS/CSS changed, run `node tools/gen-shell.mjs --check` (no cache bump is needed (tags read `?v=dev`; `pages.yml` stamps the hashes at deploy) — after a `tools/manifest.cjs` change run `node tools/gen-shell.mjs`); stale builds can make peers unable to
     connect by design.

8. **Verify in order.**
   - Run `npm run test:net-unit` before any browser group; it covers transport,
     SDP, rendezvous, QR, snapshot, and session contracts.
   - Run `test:net` in the background through `tools/test-bg.mjs`.
   - Use real RTC scripts only for browser/ICE behavior that loopback cannot
     exercise.

## Three-player (star topology)

Three peers use a **star topology**: guest B and guest C each connect to the
host; the host **relays** snapshots between them (no direct B↔C link). Invites
are **sequential** — mint one invite, accept, then `lobbyInviteAnother()` for
the next guest. Prefer the dedicated script:

```sh
npm run rtc:e2e-3p
```

Background-tab throttling can stall WebRTC timers in a real browser — for
reliable 3-player debugging use `__apex.headless(true)` or the headless RTC
scripts above rather than three background tabs.

## Common Mistakes

- Fixing a guest by correcting the local player's car from host state; that
  violates the authority model.
- Using `cars[]` index across peers; custom-team selection can change grid
  length/order.
- Treating local candidate counts as proof that the peer received relay
  candidates; inspect `lobbySdp().remoteTypes`. Relay arrives last — truncation
  drops it first (host OK, guest stuck).
- Expecting mobile guests to join via in-page scan; they open the QR URL in
  Safari/Camera, out of band.
- Building `RTCPeerConnection` before awaiting ICE server prefetch; servers are
  fixed at construction.
- Letting Nostr or room-code failures throw through the lobby; rendezvous errors
  must be typed so the UI can fall back to link/QR.
- Creating several host invites simultaneously; the lobby intentionally makes
  invites sequential so pasted answers are matchable by humans.
- Running browser net tests before `test:net-unit`, making deterministic unit
  failures look like WebRTC flake.
- Forgetting `version.json` in build handshakes after JS/CSS edits.
- Debugging a guest stuck mid-countdown (lights already lit) as an ICE/relay
  problem when signalling already succeeded — check `countT`/`lightsLit`
  consumption of `netStart` in `js/game.js`, not candidates. `startPending` is
  boolean-only and can't diagnose it.
