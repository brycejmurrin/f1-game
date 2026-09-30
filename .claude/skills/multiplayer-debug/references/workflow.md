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
     when `netPlay.owns(c)` is **true** — `owns()` answers "the wire owns this
     car", so it is the REMOTE cars it returns true for (`js/net/netplay.js`
     `owns`, and the `updateCar` early-out in `js/game.js`).
   - The host owns AI and race control and relays guest snapshots without
     changing authority.
   - Key rivals by content-derived ids (`wireId` / driver id), not `cars[]`
     index; grids can differ by player.

4. **Debug signalling as data crossing, not local gathering.**
   - `lobby().wire.candidates` and `turnProbe()` describe local gather.
   - `lobbySdp().remoteTypes` answers what the peer actually received.
   - If remote SDP has no `relay`, inspect SDP packing/truncation and make sure
     ICE prefetch completed before `RTCPeerConnection` construction.
   - **Relay candidates arrive last** — historically the invite/answer cap dropped
     them (`sdp.js` now round-robins by kind, so >=1 relay survives; still check
     `remoteTypes` before blaming ICE). Symptom: desktop host gathers fine,
     mobile guest never finishes ICE (`checking`/`connecting` forever). Probe ICE
     on the **stuck peer** (usually the guest), not only the host.

   - **Guest stuck ON the countdown (lights visibly lighting, never launches)
     is NOT an ICE symptom — signalling already worked.** If the connection is
     up (both peers show `net().active`/roles correctly), stop probing ICE and
     look at countdown *consumption* instead: `js/game.js` reads `netStart`
     (`{ at, hold, now() }`) each frame and derives `countT` from it
     (grep `countT = (COUNTDOWN_S`), which drives `lightsLit` (grep
     `lightsLit === COUNTDOWN_S`) and only clears `netStart` once
     `lightsLit === COUNTDOWN_S && countT > COUNTDOWN_S + startHold` — the
     "consumed; never carry it into the next race" comment. (Grep, never a line
     number: game.js moves every week and the three numbers that used to sit
     here were ~800 lines stale.) A guest stuck with lights lit but the race never starting
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
   - Handshake refuses mismatched builds because physics/track constants can
     differ. The build it compares is the shell's own
     `<meta name="apex-build">` (`js/net/handshake.js`, error `build_mismatch`)
     — it deliberately does NOT fetch `version.json`, so a peer that cannot
     read the meta tag fails as `build_unknown`.
   - If JS/CSS changed, run `node tools/gen/gen-shell.mjs --check` ([shell/cache](../../check-changes/references/bump.md): `?v=dev`, no bump); stale builds can make peers unable to
     connect by design.

8. **Verify in order.**
   - Run `npm run test:net-unit` before any browser group; it covers transport,
     SDP, rendezvous, QR, snapshot, and session contracts.
   - Run `test:net` in the background through `tools/ci/test-bg.mjs`.
   - Use real RTC scripts only for browser/ICE behavior that loopback cannot
     exercise.

## "Build mismatch" though both are on the live build

Not an encoding bug: `b` rides inside the invite/answer payload (`handshake.js` `createInvite`/`acceptInvite` -> `checkBuild(await localBuild(), payload.b)`), and the `#vs=` link only carries the code (`inviteUrl`/`inviteFromUrl`; a corrupt link is `corrupt_code`/`bad_code`, never `build_mismatch`). So one tab's `<meta name="apex-build">` is stale: an installed PWA / service-worker-cached shell, or a tab left open across a deploy. Compare `document.querySelector('meta[name=apex-build]').content` on BOTH devices with the live `index.html` (deploy-research; `res.mine`/`res.theirs` hold the numbers but the lobby shows only `res.message`, and `Log` prints just `handshake <action> fail build_mismatch`). `theirs > mine` = THIS device is stale. Also `build_unknown` = no meta and `version.json` fetch failed (offline phone). The link opened from Camera lands in Safari, not the installed app, so a mismatch there means Safari's cached shell. Offline pins: `node --test tests/unit/net-transport.test.mjs` (checkBuild/localBuild/inviteFromUrl/withoutInviteUrl), `lobby-codes.test.mjs` (codeFrom on pasted links), `net-qr.test.mjs`; the shell guard/stamp side is `service-worker.test.mjs` and `deploy-stamp.test.mjs`. Fixing means getting the stale device onto the current shell, never relaxing `checkBuild`. Record: both metas, which side is older, whether installed app or Safari tab.

## Rival never moves (connected, remote car frozen)

Trace the path in order, stop at the first broken link:
1. `__apex.net()` — `active`, `role`, `remotes[]` (one per rival, keyed `wire`/`driverId`), `buffered` = first remote's interpolation buffer (`remotes[i].buffered` per rival), `net` = session stats (clock sync). `remotes: []` = no grid slot bound (`slotFallback`), see `netplay.js` `status()`.
2. `buffered` 0 while the session is alive = packets held before clock sync (session `synced()` false; see the `autoPong` comment in `apex.js` `netLoopback`) or dropped by wire id mismatch; >0 but car still = interpolation/pose (`snapshot.js`, `netplay.js`), not transport.
3. Game side: `netPlay.owns(c)` must be true for the rival so `updateCar` early-outs (`js/game.js`, grep `netPlay.owns(c)`).
Offline (no browser), single files: `node --test tests/unit/net-session.test.mjs` (sync/routing), `net-snapshot.test.mjs` (interp), `net-authority.test.mjs` (who owns which car). Green = fault is browser/ICE side, go to step 6 above. The whole `npm run test:net-unit` (17 files) is the pre-browser gate (step 8), not needed to localise this.

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
- Reaching for `version.json` when a build handshake refuses: the handshake
  reads `<meta name="apex-build">` from the shell, not the deploy stamp.
- Debugging a guest stuck mid-countdown (lights already lit) as an ICE/relay
  problem when signalling already succeeded — check `countT`/`lightsLit`
  consumption of `netStart` in `js/game.js`, not candidates. `startPending` is
  boolean-only and can't diagnose it.
