# Up to four players, and seats you can't both take

## Context

VS FRIEND works today as a two-player feature: real WebRTC, distributed
authority (each peer owns its own car), a waiting room, room codes over Nostr,
and — as of build 928 — qualifying, where both humans set a real lap and the
grid comes out of it.

Two things are wrong with it as a *party* feature.

**Both players can pick the same driver.** `localProfile()`
(`js/net/lobby.js:86`) sends `{team, driver}` where `driver` is the seat index
`0|1`, and `pickRemoteSlot()` (`js/net/netplay.js:72-87`) falls back exact seat
→ same team → any free car. So two players choose Verstappen and one silently
races somebody else. Nobody is told.

**It is two players by construction** — one `RTCPeerConnection`, one
`remoteCar`, one `interp`, one `_peerProfile`, one `peerReady`, a two-slot
`separateGrid()`, a two-row `#vs-me`/`#vs-them` DOM.

Decisions already taken: star topology through the host, but NetPlay
restructured around a map of peers so a later mesh is a transport change and
not a rewrite; both room code and invite link scale; **driver-level**
exclusivity, so two players can still be team-mates.

### What is already N-ready

- `NetSnapshot.encodeSnapshot(tick, entries)` takes an array with a count byte,
  up to 255 cars (`js/net/snapshot.js:115-125`), and each entry already carries
  an explicit `id`.
- `createInterp` holds no car identity — "one per remote car" is the design
  (`js/net/snapshot.js:168-171`).
- Trystero rooms are natively N-peer: `getPeers()`, `onPeerJoin(id)`,
  `send(data, id)` (`vendor/trystero-0.25.3/core/room.js:109-202`).
- `swapGridSlots(a, b)` (`js/game.js:1357`) is pairwise but composable — a
  chain of swaps assigns 3-4 humans distinct slots.
- `ownsRaceControl()` / `ownsClassification()` (`js/net/netplay.js:415-423`)
  are role checks, not peer counts, and are `true` when solo.
- `setCarRole(c, human, local)` (`js/game.js:1339`) already separates "driven
  by a person" from "the car on this screen", and `modsFor` is per-car.

### The two findings that shape the order of work

1. **`cars[]` index is NOT stable across peers.** `makeCars()` filters the
   custom team by `!t.custom || ti === teamIdx` (`js/game.js:1424`) and
   iterates `Career.gridDrivers(team)`, so grid length and ordering differ per
   peer. That is why `onState` ignores the wire id and takes `pkt.cars[0]`
   (`js/net/netplay.js:177-179`) — the id on the wire is decorative today.
   `driverId = teamId + ":" + seat` (`js/game.js:1450`, via `seasonDriverId` in
   `js/game/store.js:59`) is content-derived and is the only stable key.
   *(Latent bug this exposes: `netOrder()` at `js/game.js:2331-2350` has the
   guest adopt the host's classification keyed on `cars.indexOf(c)` — the very
   index that isn't stable. Phase B fixes it.)*

2. **Therefore exclusivity comes first.** Once no two humans hold the same
   seat, `driverId` is a unique stable key for every human car on every screen,
   which is exactly what the N-peer refactor needs. The other order means
   inventing a peer-id → car map and then throwing it away.

### Where this picks up

Build 929 on `claude/multiplayer-support-exploration-581p41` landed the first
slice of Phase A: `G.peerSeats()` (`js/game.js`) reads the profiles the room
already exchanges, `peerSeats()` in `js/net/lobby.js` exposes them, and
`buildTeamOptions()` in `js/game/setup-ui.js` disables a driver chip another
player holds, labelled TAKEN. No new wire traffic; returns empty off-line, so
every solo mode is untouched.

---

## Status (build 934)

Phases A, B and C's structural half are DONE, verified and on
`claude/multiplayer-seat-exclusivity-q34ksy`. What remains is **C.2** (the
multi-joiner rendezvous — the piece that lets a third person actually
arrive) and all of **Phase D**.

Three latent bugs were fixed on the way, none of them in the plan:

- `netOrder()` re-read the host's grid indices against a differently-ordered
  local array. Wrong results, at a close finish, invisibly.
- `separateGrid()` silently left two humans stacked when the local player
  held the last grid box.
- Room membership derived from `_peers`, which only a HELLO fills — so a peer
  who said READY before their profile landed was invisible and START stayed
  disabled. HELLO and READY have no ordering guarantee, so this would have
  failed intermittently in production.

Two notes for whoever picks this up:

- **`test:tiny`'s render specs take ~205 s against a 240 s timeout on a
  SwiftShader box.** They fail under ANY concurrent load. Verified against an
  unmodified baseline — do not go hunting for a regression. Worktrees
  parallelise editing for free; they do not parallelise rendering.
- **The pre-existing specs earned their keep three times.** Every failure was
  a working path narrowed without noticing, and `multiplayer-session.spec.js`
  runs LAST — a clean sheet at 45/65 means nothing.

## Phase 0 — branches

The Phase A(1) commit (`2693003`) sits on
`claude/multiplayer-support-exploration-581p41`, based on build 928. The
designated work branch `claude/multiplayer-seat-exclusivity-q34ksy` is
currently the deploy-branch head (`3e8a71c`, build 929, the overtake/caution
work). Merge 581p41 into the designated branch and continue there:

```sh
git fetch origin claude/multiplayer-support-exploration-581p41
git merge origin/claude/multiplayer-support-exploration-581p41
```

Expect a conflict in `index.html` (`?v=`) and `version.json` — resolve to a
single build number **higher than the deploy branch's**, i.e. 930, and apply
the standard bump: `sed -i -E 's/\?v=[0-9]+/?v=930/g' index.html` plus
`version.json`. Every subsequent phase bumps again.

---

## Phase A — finish exclusivity

### A.1 Yield on a clash, with an ordering that survives N

Do **not** write `if (role === "guest") move()`. Write a precedence rule that
already generalises:

- Add `seatRank()` to `js/net/lobby.js` — `0` for the host, `1` for a guest
  (later: `1 + joinIndex`). The rule is *"yield to any peer of lower rank
  holding your seat"*, which is host-wins today and join-order-wins at four
  players, with no rewrite.
- Add `resolveSeatClash()` next to `peerSeats()` (`js/net/lobby.js:328` in the
  merged tree). It runs on exactly two triggers, both funnelling into it:
  - the `EV.HELLO` handler (`js/net/lobby.js:249`), after `_peerProfile` is
    written;
  - `roomChanged("car")` (`js/net/lobby.js:314`), so returning from the garage
    into a seat that was taken while you were in there also resolves.
- On no clash it must be a no-op — it will run on every HELLO.

### A.2 Where the yielder goes

Add `firstFreeSeat(preferTeamId)` in `js/net/lobby.js`:

1. the team-mate seat on the same team (`1 - driver`), if free;
2. otherwise walk `Teams.LIST` in order for the first `(team, seat)` held by
   nobody of lower rank.

"Free" = not in `peerSeats()` restricted to lower-rank peers. With two players
step 1 always succeeds; step 2 is what makes three and four players work
unchanged.

### A.3 Applying the move

In one place, so the garage and the lobby cannot disagree:

- write `G.teamIdx` / `G.driverIdx` and `store.set("team"|"driver", …)` — the
  same pair every other writer uses (`js/game.js:186-187`, `js/game.js:7408`);
- `say("Verstappen was taken — you're in Tsunoda's seat.")` through the
  existing status line (`js/net/lobby.js:72`, `#vs-status` at
  `index.html:600`, already `role="status" aria-live="polite"`). Not
  `isError` — it is a notice, not a failure;
- re-send `EV.HELLO` with the corrected `localProfile()`;
- `setReady(false)` — the same reasoning `roomChanged` already uses at
  `js/net/lobby.js:320`: your READY was for a car you are no longer in;
- `renderRoom()`, and `G.buildSetup()` if `#carsetup` is open, so the chips
  repaint under the player.
- Mods do not need recomputing here — `startRace()` calls
  `recomputePlayerMods()` (`js/game.js:2221`) on the way to the grid. Confirm
  that before relying on it; if not, expose `recomputePlayerMods` on the G
  façade (`js/game.js:2556` block) and call it.

### A.4 The team-picker hole

`buildTeamPicker()`'s tile handler (`js/game/menus.js:93-101`) sets
`G.driverIdx = 0` unconditionally. Switching to a team whose seat 0 is taken
therefore drops you straight into a taken seat with a disabled chip under you.

- Pick the first seat on that team not in `G.peerSeats()` instead of hardcoding
  `0`. Same `store.set("driver", …)` write.
- Add the taken seats to the tile's `tm-sub` line (`js/game/menus.js:89-90`,
  which already lists both drivers' surnames) so it reads before you tap, e.g.
  `#1 Verstappen (TAKEN)  ·  #22 Tsunoda`.

### A.5 Make the silent fallback observable

Leave `pickRemoteSlot()`'s fallback chain in place — a peer on an older build
must still be raceable — but record when it fires: set a
`lastSlotFallback: "team" | "any" | null` and surface it in
`netPlay.status()` (`js/net/netplay.js:445`). It costs nothing and gives the
tests a way to assert that exclusivity actually removed the fallback path
rather than merely making it unlikely.

### A.6 Tests

New spec `tests/multiplayer-seats.spec.js`, added to `test:net` in
`package.json:34`. Rig is the existing two-peers-in-one-page one — `lobbyFake`
(`js/game/apex.js:1976`), `lobbyWatch`, `lobbyPeerEvent(type, data)` — and the
`enterRoom(page, role)` helper pattern from `tests/multiplayer-room.spec.js:27`.

1. **The guest yields.** Enter as guest on `redbull/0`; `lobbyPeerEvent("hello",
   {team:"redbull", driver:0})`; assert `lobbyRoom().profile.driver === 1`,
   `#vs-status` is non-empty, and READY has dropped.
2. **The host does not.** Same setup as host; assert `profile.driver === 0`,
   unchanged.
3. **A taken seat cannot be picked.** With a peer on `redbull/0`, open the
   garage on Red Bull; the `#cs-driver .sel-chip[data-cs-driver="0"]` is
   `disabled` and its text contains `TAKEN`.
4. **The team picker respects it.** With a peer on `redbull/0`, pick Red Bull
   from `#teampicker`; assert `apex26.driver === "1"`, not `"0"`.
5. **Team-mates are still legal.** Peer on `redbull/0`, we pick `redbull/1`;
   nothing moves.
6. **Solo is untouched.** No session: `G.peerSeats()` is `[]`, no chip is
   disabled, picking a team still lands on seat 0.

Run: `npm run test:net` and `npm run test:parts` (the garage chips are covered
by `tests/parts-setup-ids.spec.js:115`).

---

## Phase B — one peer becomes many, on the same wire

**Contract for this phase: no behaviour change.** Still exactly two players,
still one transport. `npm run test:net` and `npm run test:net-unit` must pass
with no edits to existing specs — only additions. Everything here is turning a
singleton into a keyed collection.

### B.1 A stable numeric car id

The snapshot's per-car `id` is a `u8` (`js/net/snapshot.js:80`), so the
`driverId` string cannot go on the wire directly. Derive a byte from the same
content:

```
wireId(c) = Teams.LIST.findIndex(t => t.id === c.team.id) * 2 + c.seat
```

`Teams.LIST` is 11 fixed teams plus exactly one appended `custom` entry
(`syncCustomTeam()`, `js/game.js:177-183`), so indices are identical on every
peer even though the custom team's *contents* differ — ids run 0..23. Add
`wireId(c)` / `carFromWireId(id)` on the G façade next to the rest of the
multiplayer seam (`js/game.js:2627`), and a unit assertion that
`Teams.LIST.length` and the custom entry's position are what the formula
assumes.

### B.2 NetPlay around a map

In `js/net/netplay.js`:

- `remoteCar` / `interp` / `peerProfile` / `peerLaps` / `peerResult` →
  one `remotes: Map<wireId, {car, interp, profile, mods, laps, result}>`.
- `onState` (`:170`) reads **every** entry and pushes each into the interp for
  its own `id`; the `pkt.cars[0]` hack goes. An unknown id is ignored, not
  guessed at.
- `pickRemoteSlot(profile)` → `claimSlot(profile, claimed)`: **exact seat
  only**, excluding cars already claimed. Phase A guarantees this succeeds; a
  failure returns `{ok:false, error:"seat_taken"}` rather than silently racing
  the wrong car. Keep A.5's fallback behind an explicit
  `allowFallback` flag used only for a peer that failed the build check.
- `owns(c)` (`:433`) becomes a Set membership test, mirroring
  `incidentSim.owns` (`js/game.js:3172`).
- `predict(now)` (`:439`) → `predict(car, now)`; update the contact-resolution
  caller in `js/game.js`.
- `peerArmed` boolean (`:283`) → a Set; `nameTheMoment()` fires when every
  known peer has armed.
- `handBackToAI(reason)` → `handBackToAI(wireId, reason)`, tearing down one
  entry and leaving the rest racing.
- `status()` (`:445`) reports an array of remotes instead of one `remoteId`.
  Update `docs/DEBUG-HOOKS.md`.

### B.3 `separateGrid` for N

`separateGrid()` (`js/net/netplay.js:102-117`) becomes: build the list of human
cars, sort by a key every peer computes identically (`wireId` ascending, host
first), and assign them `hostPos, hostPos+1, …` by a chain of
`G.swapGridSlots`. Fix the edge case the exploration surfaced: if
`hostPos + n - 1` runs off the end of the grid, walk *backwards* from
`localCar.gridPos` instead of no-opping — today it silently leaves two humans
stacked.

### B.4 Per-peer keys elsewhere

- `qualiPeer` (`js/game.js:796`) → `qualiPeers` keyed by `driverId`;
  `onPeerQuali` (`js/game.js:846`) writes into it. `qualiDriven()`
  (`js/game.js:855`) already builds a `driverId` map, so it needs little more
  than accepting several.
- `netOrder()` (`js/game.js:2329-2350`): the host reports classification keyed
  by `driverId`, not `cars.indexOf(c)`, and the guest adopts by the same key.
  This is the latent cross-peer bug from finding 1 — fix it here, where the
  key finally exists.

### B.5 Lobby side

- `_peerProfile` (`:470`) → `_peers: Map<peerId, profile>`; `peerReady`
  (`:271`) → per-peer. `peerSeats()` from A(1) already returns an **array**,
  so its signature does not change — it just stops being at most one entry.
- `EV.HELLO` and `EV.READY` payloads gain a `from` peer id, and the session
  gains a `peerId`. This is the one wire change in Phase B. Bump the handshake
  build check so a 929 peer is refused rather than misparsed —
  `js/net/handshake.js` already refuses a build mismatch.
- `renderRoom()`'s START gate becomes "every peer ready"; the message at
  `js/net/lobby.js:395` stops saying "Both".

### B.6 Tests

Extend `tests/net-snapshot.test.mjs` with a multi-entry round-trip keyed by id
(the codec already supports it — assert the *reader* now uses it). Add to
`tests/multiplayer-session.spec.js` a two-remote case driven through
`netPeerSend` with distinct ids. Run `npm run test:net`, `npm run test:net-unit`,
`npm run test:modes`, `npm run test:career` (classification keying).

---

## Phase C — the transport becomes N-peer

Star topology: every guest holds one session to the host; the host holds one
per guest and relays.

### C.1 Sessions as a map

`js/net/lobby.js` holds `sessions: Map<peerId, session>` rather than the single
`session` (`:471`). `session.js` stays exactly as it is — one session per
transport is correct; there are simply several. The pump loop
(`pumpTimer`) iterates them.

### C.2 Rendezvous accepts more than one joiner

- `js/net/nostr.js:166-186` sets `handling = true` and `finish()`es on the
  first payload, so a second joiner is ignored. The host must keep listening
  and answer each joiner, keyed by the Trystero peer id `onPeerJoin` already
  provides (`vendor/trystero-0.25.3/core/room.js:109-202`).
- `js/net/rendezvous.js:250-268` `swap()` trades one `"offer"` for one
  `"answer"`; slots become per-joiner.
- Invite link / QR need no format change — the host re-gathers an offer after
  each accept, so the same route hands out several invites in turn.

### C.3 The host relays

Guest→guest state does not flow directly. Each guest publishes its own car to
the host; the host publishes **every** car it owns or has heard from as one
multi-entry snapshot. This is precisely what `encodeSnapshot`'s count byte and
per-entry `id` were reserved for, and it is why B.1 had to come first. The cost
is roughly half a frame of extra guest-to-guest latency — the accepted price of
star over mesh, and interpolation already absorbs it.

Race control and classification need nothing new: `ownsRaceControl()` /
`ownsClassification()` are already host-only predicates.

### C.4 The room screen holds four

- `index.html:571-586`: `#vs-me` / `#vs-them` → a `#vs-grid` container the
  lobby fills with one self row plus N peer rows, reusing `driverLine()`
  (`js/net/lobby.js:341`) unchanged.
- `css/overlays.css:655` `.vs-driver` and the `vs-two` layout class need to
  survive four rows on a phone in landscape.
- Bump `?v=` **and** `version.json` — this is the markup change the shell
  version guard exists for (CLAUDE.md, Critical conventions).

### C.5 Per-peer loss

The heartbeat already hands an abandoned car back to the AI; with B.2's
per-entry teardown it does so for one peer without touching the others. A host
disconnect still ends the session for everyone — that is inherent to star and
should be stated in the lobby copy, not papered over.

### C.6 Tests

`NetTransport.loopback()` returns a pair (`js/net/transport.js:68`); add a
`loopbackStar(n)` helper returning a host endpoint plus n guest endpoints so
the node suites can drive three and four peers with no browser. Extend
`__apex.lobbyFake` / `lobbyPeerEvent` to take a peer id. Run
`npm run test:net`, `npm run test:net-unit`.

---

## Phase D — the race with three and four humans

1. **Grid** — B.3's `separateGrid` exercised for real: four humans in
   P12-P15, every peer agreeing, no car stacked.
2. **Qualifying** — `Quali` (`js/game/quali.js`) merges N driven human laps
   with the modelled field; the sheet lists every human. `EV.QUALI` already
   carries `driverId`, so B.4 is most of it.
3. **Results** — `js/game/results.js` shows several human rows; the "you" row
   stays keyed on `isPlayer` (i.e. `local`), which is already correct.
4. **HUD** — rival gap lines and map markers for up to three others
   (`js/game/hud.js`).
5. **Lights-out** — host waits for every ARMED (B.2); the single start hold
   roll (`js/net/netplay.js:317`) stays host-drawn and broadcast, which is
   already right for N.
6. **Docs** — the `js/net/` block in `CLAUDE.md`, `docs/DEBUG-HOOKS.md` for
   the changed `netPlay.status()` / `__apex.net()` shape, and the
   `test:net` / `test:net-unit` descriptions.

---

## Verification

Per phase, before each commit:

```sh
npm run test:tiny          # nothing else is worth running if this is red
npm run test:net           # the browser multiplayer specs
npm run test:net-unit      # the wire suites, ~1 s
npm run test:tooling-fast  # load order + docs integrity + api contract
```

Phase A additionally: `npm run test:parts` (garage chips). Phase B
additionally: `npm run test:modes`, `npm run test:career` (classification
keying). Phase C additionally: `npm run test:ui` (the room screen grew rows).

No track or scenery files are touched, so `tools/verify-track.cjs` and the
full-fleet sweeps are not needed.

Every phase bumps `?v=N` across `index.html` **and** `version.json` to the same
N, higher than whatever the deploy branch is on — Phase C in particular changes
markup, which only the version guard refreshes.

Manual end-to-end, once C lands, using `tools/rtc-e2e.mjs` (`npm run rtc:e2e`)
extended to three browsers: three peers into one room, two of them picking the
same driver, and confirm the yield message appears on the right screen and all
three grid up in distinct boxes.

## Commits

One commit per phase slice, on
`claude/multiplayer-seat-exclusivity-q34ksy`, pushed with
`git push -u origin claude/multiplayer-seat-exclusivity-q34ksy`. No pull
request unless asked.
