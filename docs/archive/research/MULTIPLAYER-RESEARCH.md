# Multiplayer — feasibility investigation

> **Status: direction chosen; Phase 0 has LANDED.** This document is the survey
> that preceded the decision — it deliberately keeps the full option space, so
> the reasoning stays checkable. What was actually chosen, and what is built:
>
> **Chosen:** two-player **contact** racing over WebRTC with **no backend** —
> manual offer/answer code paste for signalling, distributed authority (each
> peer fully owns its own car; the host additionally owns the AI and race
> control). That is option **C** in §1 at 2 players, on the zero-infrastructure
> signalling path in §5. §4's recommendation to ship no-contact first was NOT
> taken; contact is in scope from the start.
>
> **Built:** the §3.1 role split (`human` / `local`), the per-car input seam,
> and per-car part multipliers — see `tests/specs/multiplayer-roles.spec.js` and
> `__apex.carRoles/carRole/carInput`. Networking itself is not built yet.
>
> One correction to §3.1 below, found while implementing it: the audit of
> "what breaks with two humans" **missed `playerMods`**, a module-level
> singleton of the local player's part multipliers that was read inside the
> human branch — including unconditionally by `muBase`, the lateral-grip term.
> A second human would have accelerated, braked and *cornered* on the local
> player's upgrades. It is now per-car (`c.mods`). The lesson generalises: the
> `isPlayer` audit caught branches keyed on the flag, but not singletons that
> the flag's branches happened to *read*. Anything module-scoped and named
> `player*` deserves the same scrutiny.

The question is not "can this game do multiplayer" — it can. The question is
**which multiplayer**, because three very different features get called that
word, they cost roughly 1×, 6× and 20× each, and only the most expensive one
needs a server.

---

## 1. Bottom line

| # | Feature | Infra needed | Effort | Recommendation |
|---|---|---|---|---|
| A | **Shared ghosts + global leaderboard** — race a friend's recorded lap | none (share a string) → optional read-only host | ~2–3 days | **Do this first.** The data layer already exists. |
| B | **Live lobby, no contact** — 2–8 humans on track together, cars pass through each other | WebRTC signalling only | ~2–3 weeks | **The real MVP.** Dodges the single hardest netcode problem entirely. |
| C | **Contact racing** — humans can hit each other, with penalties and race control | authoritative host (a peer, or a Worker) | ~6–10 weeks | Phase it in on top of B. Don't start here. |

The recommended netcode is **host-authoritative state replication with local
prediction for your own car** — *not* deterministic lockstep, for a specific
reason given in §4.

The recommended transport is **WebRTC DataChannel**, with a signalling path
that starts as manual code paste (zero infrastructure, works on GitHub Pages
today) and can graduate to a broker later without touching the game code.

---

## 2. What the codebase already gives you

This project is much better positioned for network play than a typical hobby
game engine, for four concrete reasons.

### 2.1 The simulation is already seeded and already segregated

`js/game.js:455–467` — there is a real seeded LCG (`simSeed` / `simRnd`) and a
documented, test-enforced rule that **sim paths never touch `Math.random()`**
while cosmetic paths deliberately do. `tests/specs/agent-determinism.spec.js` guards
it, and its header records the five leaks that were closed to get there.

That is the exact discipline network play needs, and it is normally the thing
you have to retrofit painfully. Here it is done.

### 2.2 The physics loop is already fixed-step

`js/game.js:5006–5019` — an accumulator drives `update(PHYS_DT)` in constant
1/60 s chunks with a substep cap and render interpolation between the last two
steps (`rPrev*` snapshots). Every car already carries pre-step position,
heading and yaw for interpolation.

Network play needs exactly this: a fixed tick to number, and an interpolation
mechanism to hide the gaps. Both exist and are load-bearing already, so remote
cars can reuse the interpolation the local car uses.

### 2.3 There is already an "external input" seam

`_testInput` (`js/game.js:637`, consumed at `2366`, `2414`, `2523`) lets an
outside caller supply `{steer, throttle, brake}` in place of `Input`. `__apex`
drives it (`js/game/apex.js:919`) and `act()`/`step()`/`rollout()` already pump
the simulation deterministically from outside the render loop.

A remote player's input is the same shape. The seam a netcode layer needs is
already cut, already tested, and already has a headless driver.

### 2.4 Ghost replay is already a network format

`js/car/ghost.js` records a lap as parallel `(t, s, x)` arrays at 20 Hz and
replays it as a translucent car (`js/game.js:4715–4755`). Per the file header
that is deliberately *everything* needed to reconstruct a pose — no world
coordinates, no heading.

A 90-second lap is ~1,800 samples × 3 numbers. Rounded and delta-encoded that
is a few KB — small enough to put in a URL fragment or a clipboard paste.
**Feature A is mostly a serialiser and a share button.**

It also proves the renderer can already draw a car that is not in the `cars`
array and not simulated — which is what a remote car is.

### 2.5 The `(s, x)` representation is a latency advantage

Most networked racers dead-reckon a remote car in free 3D and it drifts off the
road. Here every car has an arc position `s` and a lateral offset `x`, so
extrapolating a stale remote car is `s += speed·Δt` — **it stays on the track by
construction**, follows the elevation and banking for free, and cannot end up
inside a barrier while extrapolating. This meaningfully softens the visual cost
of 100 ms of latency.

---

## 3. What actually blocks it

Five real obstacles, in rough order of how much work each is.

### 3.1 `isPlayer` conflates two different ideas

There are ~40 `c.isPlayer` branches, and they mean two different things that
multiplayer must separate:

| Meaning | Should become | Examples |
|---|---|---|
| **This car is human-driven** (authority + physics model) | `c.human` | full bicycle model vs kinematic AI (`js/game.js:2622` vs `2843`), collision `invMass` 0.5 (`2149`, `2224`), no AI rubber-band (`2286`), input source (`2366`, `2414`, `2523`) |
| **This car is MINE, on THIS screen** (presentation) | `c.local` | camera rig, HUD, engine audio (`update()` end), haptics/`navigator.vibrate` (`2506`, `2513`), penalty announcements (`2494`), decal atlas tier (`js/game.js:1112`) |

This split is the single highest-value refactor in the whole effort, it is
mechanical, and **it is independently testable with zero networking** — drive
car 2 from a scripted input source and assert it behaves like a player car.

Note the asymmetry it exposes: AI cars run a *kinematic* lateral model
(`js/game.js:2843`), the player runs a full per-axle bicycle model with slip
angles, weight transfer and the friction ellipse. A remote human must run the
player model, or they will handle visibly differently from the car their owner
is driving — and the corrections will fight constantly.

### 3.2 The singleton `player` — smaller than it looks

`js/game.js:512` (`let cars = [], player = null`) and `1012`
(`player = cars.find(c => c.isPlayer)`).

The good news: inside the whole simulation block (lines 1900–3300) there are
only **13** `player.` references, and most are local presentation (engine audio,
skid audio). Only three are genuine multi-human problems:

- **`js/game.js:2287`** — the AI rubber-band reads `player.prog`. With several
  humans this must become "nearest human", or be disabled in multiplayer
  (recommended: disabled — rubber-banding is unfair when the target is a person).
- **`js/game.js:2064`** — `if (player.finished) resultT = 2.2` ends the race when
  *the* player finishes. Needs "all humans finished, or timeout".
- **`js/game.js:2261–2266`** — the collision writeback rebuilds `px`/`pz` from
  `(s, x)` only when the collision pass actually moved the player. This is the
  correct place to apply a host correction, and CLAUDE.md's warning applies
  directly: **a correction must write `px`/`pz`, never leave the car to be
  rebuilt from `(s, x)` unconditionally**, or it goes back on the road's rails.

The rest of the coupling is UI/results/season and lives outside the sim.

### 3.3 Pausing stops the world

`js/game.js:4980` — `tickBody` returns before the physics accumulator when
`paused`. In multiplayer a client cannot stop the shared world. The pause menu
needs a mode where the sim keeps stepping behind the overlay (which the lighting
tuner's "render while paused" branch already half-demonstrates), and the pause
menu's tuner panels need to be inert or local-only during a session.

### 3.4 Cross-machine determinism is *not* guaranteed

This is the finding that decides the architecture, so it's worth being precise:
the seeding work makes runs reproducible **on the same engine build**. It does
not make them reproducible **across machines**.

ECMAScript does not specify the exact results of `Math.exp`, `Math.sin`,
`Math.pow`, `Math.atan2` — they are implementation-approximated, and results
differ between V8/JSC/SpiderMonkey and even between V8 versions. The driving
model uses all of them on the hot path: `damp()` is exp-based (`js/game.js:2605`
and throughout), `STEER_EXPO` is a `Math.pow`, banking is `Math.sin`, slip
angles are `Math.atan2`, `aeroGrip` is `** 2` on a transcendental-fed value.

At 90 m/s a one-ULP divergence becomes a visible car-length in seconds.

**Therefore: no lockstep.** Making this engine bit-deterministic across browsers
would mean replacing every transcendental on the sim path with a fixed
polynomial approximation — which would perturb the driving feel and invalidate
every physics regression baseline in the suite. That is a bad trade for a game
whose handling has clearly been tuned by hand.

State replication does not care about any of this.

### 3.5 Version skew between peers

Peers on different cached builds have different track splines, different physics
constants, and different barrier positions. The infrastructure to detect this
already exists: `version.json` `{build: N}` and the shell's no-store version
guard in `index.html`, plus the service worker's build-keyed cache
(`sw.js:20`). A lobby handshake should exchange the build number and refuse to
connect on mismatch, with "reload to update" as the remedy.

Scenery does **not** need to match — props never affect physics, so a peer with
a different prop seed is harmless. Only the spline, the wall positions and the
physics constants matter.

---

## 4. Netcode model

**Host-authoritative state replication, with client-side prediction for your own
car and interpolation + track-frame extrapolation for everyone else's.**

One peer (the lobby creator) runs the authoritative `update()` loop including
any AI, collision resolution and race control. Clients:

- run their **own** car locally at full rate from local input — zero input lag,
  which is non-negotiable in a driving game;
- send their input stream to the host (small, ~10 bytes/tick, send at 30–60 Hz);
- receive snapshots at 15–20 Hz and render remote cars from an interpolation
  buffer held ~100 ms in the past, extrapolating along `s` when a packet is late;
- apply host corrections to their own car as a *blended* error over a few frames
  (never a snap), written through to `px`/`pz` per §3.2.

Why this and not the alternatives:

- **vs lockstep** — §3.4. Lockstep would be lovely here given the seeding work,
  but the floating-point substrate won't support it across browsers.
- **vs full-mesh peer authority** ("everyone owns their own car, trust the
  others") — actually fine for Feature B, where nothing needs arbitrating. It
  breaks the moment contact matters, because two clients will disagree about who
  hit whom and both will be certain. Start mesh-ish for B, add a host for C.
- **vs a dedicated server** — see §5; it costs infrastructure this project
  deliberately doesn't have, and buys anti-cheat that a fan game doesn't need.

### Bandwidth is a non-issue

Per car per snapshot: `s` (u32, cm), `x` (i16, cm), `head` (u16 angle),
`speed` (u16, cm/s), `gear`+flags (u8), lap counter (u8) ≈ **12 bytes**.

| Field | Bytes/snapshot | At 20 Hz |
|---|---|---|
| 8 humans, no AI (Feature B) | 96 | ~1.9 KB/s ≈ 15 kbit/s |
| 22 cars, host sims the AI (Feature C) | 264 | ~5.3 KB/s ≈ 42 kbit/s |

That is trivially within DataChannel capacity even on mobile. **Bandwidth will
never be the constraint here — latency and authority will be.**

### The collision problem, and how to avoid it for a year

Contact between two humans at closing speed is the hardest part of any
networked racer, and it is worth stating plainly: with 100 ms RTT, two players
will *never* agree on a side-by-side rub, and no amount of engineering fully
fixes that — it is arbitrated, not solved.

`resolveCollisions` (`js/game.js:2116`) already resolves in the `(prog, x)`
plane with mass weighting and relaxation passes, and already has a "player is
heavier" rule (`invMass` 0.5) that exists to stop the AI shoving you around.
That rule is **unfair between two humans** and must become symmetric in
multiplayer.

But the far better move for the MVP is to **turn contact off**. Ship Feature B
as no-collision "ghost lobby" racing — you see rivals, you race their lines and
their lap times, you cannot touch them. Many web racers ship exactly this, for
exactly this reason. It removes the arbitration problem, removes the need for a
host to be authoritative at all, and still delivers the thing people actually
want: someone else on track with them.

---

## 5. Hosting and signalling, given static GitHub Pages

The project's stated constraints are hard ones: no build step, no frameworks,
no backend, static files on GitHub Pages. There is currently **no networking
code of any kind** in `js/` — the only outbound traffic is the read-only
Jolpica/OpenF1 data hub (`js/data/api.js:13–14`).

WebRTC gives peer-to-peer data with no server *once connected*, but every
WebRTC connection needs a signalling exchange first. Options, cheapest first:

| Option | Infra | Cost | Trade-off |
|---|---|---|---|
| **Manual code paste** — host generates an offer blob, guest pastes it back | **none** | £0 | Works on GitHub Pages *today*. Clunky but genuinely usable for "race my mate". Good enough to prove the whole stack. |
| **Public broker** (PeerJS cloud, or Trystero over BitTorrent trackers / MQTT / Nostr) | none of ours | £0 | A third-party dependency and an ESM bundle to vendor — the repo already has precedent (`vendor/three-0.184.0`, `vendor/rapier-0.19.3`). Reliability is not ours to control. |
| **Cloudflare Worker + Durable Object** | one Worker | £0 on free tier | ~100 lines. Gives room codes, presence, and later an authoritative referee. Breaks the "no backend" property — but only for multiplayer; single-player stays fully static and offline-capable. |

**Recommendation:** build behind a `Transport` interface and implement manual
paste first. It costs nothing, it proves the netcode, and swapping in a broker
later is a single file.

TURN relay is the one thing that genuinely costs money — some symmetric-NAT
peers will not connect P2P at all. Budget for "connection failed, try again
later" as a real, unfixable-for-free outcome affecting a minority of players.

---

## 6. Staged plan

### Phase 0 — split `isPlayer` (no networking)

Split into `human` (authority/physics) and `local` (input/HUD/audio/camera) per
§3.1. Add a per-car input source so a non-local human car reads
`c.netInput` instead of `Input`. Fix the three singleton-`player` sites in §3.2.

*Deliverable:* two human-model cars on track, the second driven by a scripted
input source, behaving identically to the first. Fully headless-testable via
`__apex`. **Nothing about this phase is speculative — it is a straight quality
improvement to the car model even if multiplayer never ships.**

*Test groups to re-run:* `test:behaviour`, `test:collision`, `test:physics`,
`test:agent`.

### Phase 1 — Feature A: shared ghosts

Serialise `Ghost`'s `(t, s, x)` arrays + track id + build number + driver
identity into a compact shareable string (delta + varint + base64url, target
< 4 KB). Add import/export in the time-trial UI. Extend the existing local TT
leaderboard (`ttBoard`/`ttBoardAdd`, `js/game/store.js:35–41`) to hold imported
ghosts alongside local times.

*Delivers real multiplayer value with zero infrastructure and zero netcode.*

### Phase 2 — Feature B: live lobby, no contact

New `js/net/` domain (four IIFE modules, per the project's conventions —
remember `tools/manifest.cjs` + `index.html` script tags + `?v=N` +
`version.json`):

- `js/net/transport.js` — the transport interface, plus a **loopback transport**
  that connects two instances in one page with simulated latency and packet loss
- `js/net/snapshot.js` — quantised encode/decode, interpolation buffer,
  track-frame extrapolation
- `js/net/session.js` — lobby, build-number handshake, clock sync, presence
- `js/net/netplay.js` — `NetPlay.create(G)`, the game-side module on the `G` façade

Plus a lobby screen in `js/game/menus.js` and remote-car rendering (which is
mostly the ghost draw path generalised).

The loopback transport is the important bit: **the entire netcode becomes
testable in Playwright with no network at all**, which is the only way it will
stay working in a suite this size.

### Phase 3 — Feature C: contact racing

Host-authoritative collisions, symmetric `invMass` between humans, correction
blending, AI grid fill under host control, race control (flags, penalties,
`updateCaution`) driven from host state, and host migration or graceful
collapse-to-single-player when the host leaves.

---

## 7. What not to do

- **Don't pursue deterministic lockstep.** §3.4. The seeding work is excellent
  and worth keeping for A/B testing and agent benchmarking, but it does not
  extend across engines, and making it do so would cost the game its hand-tuned
  feel.
- **Don't start with contact.** It is the hardest problem and the least of what
  players are asking for when they say "multiplayer".
- **Don't rewrite the physics.** The correct integration point is the *input*
  seam and the *collision writeback* seam. Both already exist.
- **Don't let the arc reach the remote driver either.** CLAUDE.md's rule that
  nothing derived from track curvature may steer the player applies equally to a
  networked car: a remote car smoothed toward the racing line to hide jitter is
  the same on-rails bug wearing a different hat. Smooth in world space and along
  `s`, never toward the centreline.
- **Don't make single-player depend on the network.** The service worker's
  offline install (`sw.js`) is a real feature; multiplayer must be additive.

---

## 8. Open questions

1. **How many players?** 2 (invite a friend) has a much simpler UX than 8
   (lobby, room codes, presence). The netcode is the same; the UI is not.
2. **Humans-only, or humans + AI fill?** AI fill is what makes a 3-player race
   feel like a Grand Prix, but it puts 22 cars on the host and needs the host to
   sim and broadcast all of them.
3. **Identity.** Everything today is anonymous localStorage. Even ghost sharing
   wants a display name; a leaderboard wants something harder to spoof.
4. **Cheating.** With P2P and no server, a modified client can do anything.
   For a fan game, "don't care" is a legitimate answer for live racing — but an
   asynchronous *global* leaderboard is the one feature that genuinely can't
   survive it without server-side validation.
5. **Mobile.** The touch/tilt steering modes and PerfGov's feature-shedding mean
   a phone client may be running at 30 fps with substeps dropped
   (`js/game.js:5017`, `physAcc = 0` on backlog). Dropped substeps are lost sim
   time and will drift against the host clock — snapshot timestamps and a clock
   sync are required, not optional.
