# Engineering practice — research notes (2026-08)

Reading around while the Phase 5 verification runs finished. Unlike
`CI-RENDERING-PERFORMANCE.md`, most of this is **confirmatory**: the interesting
result is that three things this repo already does turn out to match canonical
practice closely, and the value is in knowing *which* parts are load-bearing so a
future refactor does not casually delete them.

Where something is a real gap it is called out as such. Nothing here was acted
on.

---

## 1. The game loop is right, and here is exactly why

`js/game.js` runs the accumulator pattern. Checked line by line against the
canonical description (Gaffer's "Fix Your Timestep!" and a good 2025 restatement
of it), it matches on every point that matters:

| Canonical requirement | This repo |
|---|---|
| Fixed physics step, decoupled from render | `PHYS_DT = 1/60`, `while (physAcc >= PHYS_DT)` |
| Clamp the frame delta so a tab-resume cannot inject a huge `dt` | `Math.min((now - lastFrame)/1000, 1/4)` — **the 1/4 s figure is exactly the recommended clamp** |
| Guard the spiral of death (physics slower than real time) | `steps < 5`, then `physAcc = 0` to drop the backlog |
| Interpolate the render between the two physics states | `renderAlpha = clamp(physAcc / PHYS_DT, 0, 1)` |

**Do not "simplify" any of these.** Each one is the fix for a specific,
hard-to-reproduce class of bug:

- Removing the `dt` clamp reintroduces **tunneling**: a car that moves 10 m per
  step at 60 Hz moves 120 m in one step after a 2-second tab stall, and discrete
  collision checks never see the barrier in between. This repo is more exposed
  than most because `updateCar` already has a "teleported" branch
  (`Math.abs(ds) > 20`) that exists for the same reason.
- Removing the `steps < 5` cap turns a slow frame into an unresponsive tab: the
  accumulator grows, more steps are needed, each round takes longer.
- Removing `renderAlpha` reintroduces visual stutter whenever the display rate
  is not a multiple of 60 Hz. Note this interacts with the rule in `CLAUDE.md`
  that rendered position must interpolate in **world space**, never lerped
  `(s, x)` — the interpolation has to exist *and* be done in the right space.

One thing the sources warn about that **does not apply here**: using a `double`
for accumulated time degrades to millisecond precision after ~3 hours of
wall-clock. This repo takes `now` from `requestAnimationFrame` in milliseconds
and only ever differences consecutive values, so it never accumulates a large
absolute time in a float. No action needed — recorded so nobody "fixes" it.

## 2. What `__apex.seed()` can and cannot promise

The repo's determinism story — seeded `simRnd()`, `__apex.seed()`, and
`tests/specs/agent-determinism.spec.js` — is sound for its actual use, which is
**same-machine, same-build reproducibility**. Worth writing down that this is a
strictly weaker property than the one the word "deterministic" usually implies:

> Floating-point addition is **not associative**: `(a + b) + c ≠ a + (b + c)` in
> general. Compilers reorder, architectures differ on denormals and rounding, and
> fused multiply-add computes `a*b + c` with one rounding instead of two.

So a seeded run is bit-identical **on the same engine on the same CPU**, and is
*not* guaranteed bit-identical across x86 vs ARM, or across V8 versions. Achieving
that would mean avoiding library transcendentals (own `sin`/`cos` or lookup
tables) or moving to fixed point — both far beyond anything this game needs.

**Where it actually matters here** is multiplayer: `js/net/netplay.js` gives each
peer full authority over its own car and replicates state, rather than running
one lockstep simulation on both sides. That design **does not require
cross-machine bit-identical floats** — and after reading the above, that looks
less like a convenience and more like the correct call. The header in
`js/net/handshake.js` refusing a peer on a different build is the other half of
the same defence. Worth stating plainly in `docs/MULTIPLAYER.md` sometime:
lockstep was never on the table, and floating point is why.

## 3. Legacy-code decomposition — this repo already has the hard part

The standard method for breaking up a large module (Feathers, and every
restatement of it since) is:

1. Identify **change points**.
2. Find **seams** — places you can alter behaviour without editing in place.
3. Write **characterization tests** that lock in what the code does *now*,
   correct or not.
4. Change, then refactor, re-running those tests after each small step.

The step everyone skips is 3, and it is the step that makes the rest safe.
**This repo has an unusually good example of it already**: `tools/graph-parity.cjs`
builds every track from a baseline ref *and* the working tree and diffs prop
geometry vertex for vertex. That is a characterization test in the strict sense —
it asserts nothing about correctness, only that behaviour did not change — and it
is exactly the tool you want pointed at a scenery refactor.

**The gap for Phase 4** (extracting from `js/game.js`) is that no equivalent
exists for the physics/game-loop side. Before extracting anything from
`updateCar` or `render`, the cheap move is a characterization harness in the same
spirit: fix a seed, drive a scripted input sequence through `__apex.act()` for N
steps, and snapshot the resulting `physState()` trace. Any extraction that
changes one number fails. `tests/specs/agent-determinism.spec.js` is close to this
already and may only need a stored baseline.

The other standard advice, which matches the plan already agreed:

- Extract the **easy, low-coupling** pieces first to build confidence and shrink
  the surface (here: aero zones, skid marks, the lighting profile store).
- Leave the genuinely entangled core alone unless there is a reason beyond
  tidiness. `updateCar`'s tyre model is ~470 lines of one continuous integration
  over ~40 interdependent locals; extracting it means inventing a state struct
  and risking the determinism above for no functional gain.

## 4. The no-build bet, revisited

Since `docs/ARCHITECTURE-REVIEW.md` §2 frames the whole codebase as a
consequence of "no build step", it is worth recording what the alternative looks
like in 2026, because it is no longer 2015:

- **Native ES modules + import maps are viable in production** and need no
  bundler. Import maps are supported across current browsers; this repo already
  ships an `<script type="importmap">` block in `index.html` for the vendored
  three.js.
- The old objection — "hundreds of small files will be slow" — is **much weaker
  under HTTP/2** than the folklore suggests, and practitioners report acceptable
  production results. But it is not *zero*: deep import graphs still serialise
  into waterfalls, because a module's dependencies are not discoverable until it
  has been fetched and parsed.
- The honest counter-argument is that ESM's benefits here are mostly **static
  analysis** — real dependency edges instead of a hand-maintained `manifest.cjs`,
  and unused-export detection instead of a review finding "~60 dead exports".

**This is not a recommendation to migrate.** 150 files, 140 script tags and a
load order pinned by `tests/unit/load-order.test.mjs` is a working system, and the
review's own law applies: the invariant has a guard, so it holds. The point of
recording it is that the *reason* for the bet should be "the guard works",
not "ESM would be slow" — the second half of that has quietly stopped being true.

---

## Sources

- [Taming Time in Game Engines](https://andreleite.com/posts/2025/game-loop/fixed-timestep-game-loop/) — accumulator pattern, spiral of death, the 0.25 s clamp, float non-associativity
- [Gaffer on Games — Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/) — the canonical statement
- [Working Effectively with Legacy Code — key points](https://understandlegacycode.com/blog/key-points-of-working-effectively-with-legacy-code/) and [seams + characterization tests](https://docs.synapsestudios.com/concepts/legacy/) — the change-point → seam → characterize → refactor loop
- [God Class anti-pattern: how to break it apart](https://eden-technologies.eu/blog/god-class-antipattern/) — Extract Class, incremental verification
- [ES modules in production](https://www.bryanbraun.com/2020/10/23/es-modules-in-production-my-experience-so-far/) and [ES Modules + import maps](https://stevendcoffey.com/blog/esmodules-importmaps-modern-js-stack/) — the no-build ESM case
- [ES Modules are terrible, actually](https://gist.github.com/joepie91/bca2fda868c1e8b2c2caf76af7dfcad3) — the counter-case, incl. request waterfalls

---

# Part 3 — two subsystem sanity checks

Same treatment: what the field says, and whether this repo's choice holds up.

## 5. Multiplayer: the topology and the shipped TURN relay both check out

Two claims in `docs/MULTIPLAYER.md` that read like rationalisations turn out to
match the published numbers.

**"UP TO FOUR PLAYERS, in a STAR."** The practitioner consensus is that a WebRTC
**full mesh is reliable to about four participants**, because each peer must
upload N−1 streams — a six-person mesh needs five simultaneous uploads per peer.
So four is roughly where mesh stops working, and this repo caps at exactly four
*and* uses a star (host relays between guests) rather than a mesh, which is the
more conservative of the two. `netplay.js`'s "the host RELAYS — authority does
not move; it is a courier" is the right shape.

**"A TURN RELAY SHIPS BY DEFAULT."** This is the claim that looks like
over-engineering for a fan game, and it is not:

- **Both peers behind symmetric NAT is ~5–10% of connections**, and that case
  cannot be solved by STUN at all — TURN is the only path.
- The repo's own stated reason is narrower and, if anything, underplayed: on the
  **same Wi-Fi** the only host candidate a browser offers is mDNS-obfuscated, and
  when that name will not resolve the sole remaining pair is srflx-to-srflx,
  which needs router hairpinning many home routers do not do. That is a *local*
  failure mode, which is exactly the case a couch-multiplayer game hits most.

So a game that shipped STUN-only would fail for a noticeable minority and would
fail *worst* in its most common scenario. Keep the relay.

The corollary is `prefetchIce()`: `iceServers` are fixed at construction, so a
credentials fetch that lands 200 ms late gathers STUN-only and every wire dump
reads `relay:0` while the relay is demonstrably alive. That is why it must be
awaited before a connection is built — and why the `Log.warn` added to
`transport.js` in this pass matters, since that failure was previously silent.

## 6. The service-worker version guard is the right pattern

`index.html`'s shell guard fetches `version.json` with `no-store` and force-reloads
a stale installed shell. Worth recording that this is **not** a workaround for
something the platform does better:

- A service worker only checks for a new version of *itself* on navigation, and
  browsers may only re-check after a **24-hour** window. Relying on that alone
  means a stale shell can persist for a day.
- `index.html` itself carries no `?v=`, so it is the one file the cache-bust
  convention cannot refresh. Something outside the cache-bust scheme has to
  notice, and a no-store fetch of a tiny version file is the cheapest such thing.
- `skipWaiting()` alone is not sufficient and is mildly dangerous on its own: it
  activates a new worker under pages still running the old assets, which is how
  you get a client holding half of each build. The standard advice is to pair it
  with a deliberate reload — which is what this shell guard is.

One thing worth knowing that the current design already sidesteps: a hard reload
(shift-reload) bypasses the service worker entirely, so "tell the user to hard
refresh" is a real escape hatch if a worker ever wedges.

## Sources (Part 3)

- [WebRTC P2P: how mesh scales](https://antmedia.io/how-to-create-webrtc-peer-to-peer-communication/) — the ~4-participant mesh ceiling and N−1 upload cost
- [A deep dive into WebRTC, ICE, STUN and TURN](https://akashsahani2001.medium.com/building-real-time-p2p-communication-a-deep-dive-into-webrtc-ice-stun-and-turn-e645492230c5) — symmetric-NAT-on-both-ends at ~5–10%
- [TURN server in WebRTC: when you need it](https://bloggeek.me/webrtcglossary/turn/)
- [The service worker lifecycle](https://web.dev/articles/service-worker-lifecycle) and [handling updates with immediacy](https://developer.chrome.com/docs/workbox/handling-service-worker-updates) — update checks, the 24 h window, skipWaiting + reload

---

# Part 4 — a real gap: localStorage in Safari Private Browsing

> Companion reading: `docs/research/PLATFORM-INPUT-NOTES.md` collects the other
> platform behaviours that are invisible on a desktop — pointer capture, the top
> layer, `zoom`, `(pointer: coarse)`, and iPadOS dropping the WebGL context on
> backgrounding. This section is the same shape of problem in the storage layer.

The first thing in these notes that is **not** confirmatory. Recorded here
because it is a user-facing failure with no diagnostics, not a style question.

## What the platform does

- localStorage is **~5 MiB per origin**, and exceeding it throws
  `QuotaExceededError`.
- **Safari on iOS in Private Browsing sets the quota to ~0** — *any* write
  throws, immediately, on an empty store. This is long-standing WebKit behaviour,
  not an edge case.

## What this repo does with that

`js/core/store.js`:

```js
set(k, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
```

The write failure is swallowed completely — no `Log`, no return value, no signal
of any kind. And `GameStore` keeps a `_cache` Map in front of it (added to kill
per-frame `getItem` + `JSON.parse` in the render loop, which is a good reason),
so **reads keep returning the cached value for the rest of the session**.

That combination produces the worst possible shape of failure:

1. The player changes settings, builds a car, plays a career. Everything appears
   to work, because the cache answers every read.
2. They reload. **All of it is gone**, with no error at any point.

Everything under `apex26.` is affected: career saves (six slots), liveries, the
custom team, part setups, camera and lighting tuning, ghosts, the time-trial
board. The blast radius is the entire persistence layer.

There is a second, smaller exposure on the same path: `apex26.customLogo` stores
a **data URL** for MY TEAM's emblem. It is downscaled to `CUSTOM_LOGO_MAX = 384`
px first, which is the right instinct, but a 384 px PNG as base64 is still on the
order of a hundred KB against a 5 MiB budget shared with everything else — so on
a normal browser this is the single largest thing the game stores, and the most
likely trigger for a genuine quota exception rather than a private-mode zero.

## What to do about it

Not "stop using localStorage" — it is the right store for this data. The gap is
that a failed write is indistinguishable from a successful one.

1. **Log it.** One `Log.warn("game", …)` in the `catch` turns an invisible
   failure into something `__apex.logs({ns:"game"})` can show. This is the same
   fix applied to `js/game/audio.js` and `js/net/transport.js` in this pass, and
   the same reasoning: a documented debug namespace that cannot emit a line is
   not a debug namespace.
2. **Make `set` report success**, so callers that care (career save, custom logo
   upload) can tell the player their work was not stored. The logo upload in
   particular is a deliberate user action with an obvious place to put a message.
3. **Detect the dead store once at boot** — a probe write/read/delete — and say
   so plainly. "Progress will not be saved in Private Browsing" is a sentence a
   player can act on; silence is not.
4. Consider whether the customLogo data URL belongs in IndexedDB instead. The
   repo already uses it for the music library (`js/game/music-lib.js`), so the
   dependency exists, and IndexedDB's quota is far larger.

None of this was implemented in this pass — it is a behaviour change to the
persistence layer and deserves its own commit and its own test.

> **Postscript (2026-08): the fix shipped.** `js/core/store.js` no longer
> swallows anything: every failed read or write goes through `noteBroken()`,
> which records the DOMException name on `store.broken`, emits one loud
> `Log.warn("game", …)` on the FIRST failure ("settings and saves will NOT
> survive a reload", with the iOS-Private-Browsing hint on
> `QuotaExceededError`) and buffer-only `Log.info` on every later one, and
> `__apex.persistState()` (js/game/apex.js) exposes the state so the failure
> is testable. Of the four recommendations above: **#1 is done**; **#3 is
> half-done** (the first failure is announced plainly, but via `Log` on first
> use rather than a boot-time probe, and there is still no player-facing
> message); **#2 and #4 remain open** — `set()` still returns nothing, and
> `apex26.customLogo` is still a data URL in localStorage. The 4b table below
> is the pre-fix measurement; `js/game.js` has since gained 1 `Log` call (the
> race-start envelope line).

## Sources (Part 4)

- [MDN — Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) — the ~5 MiB per-origin figure
- [Fix: HTML5 game localStorage quota exceeded on Safari iOS](https://bugnet.io/blog/fix-html5-game-localstorage-quota-exceeded-on-safari-ios) — Private Browsing reducing the quota to ~0
- [WebKit bug 157010](https://bugs.webkit.org/show_bug.cgi?id=157010) — QuotaExceededError in private mode, from WebKit's own tracker

## 4b. Where the silence actually is

`docs/ARCHITECTURE-REVIEW.md` records "340 `catch` blocks in `js/`; 59 `Log`
call sites" as a single number, which is true and not actionable. Measured per
file, it becomes a work list. Counting `catch (` against `Log.<level>(` across
`js/` (excluding `vendor/`):

| file | catch | Log | fully empty `catch {}` |
|---|---:|---:|---:|
| `js/net/nostr.js` | 37 | **0** | 16 |
| `js/game/spotify.js` | 35 | **0** | 17 |
| `js/game.js` | 26 | **0** | 16 |
| `js/net/lobby.js` | 25 | **0** | 14 |
| `js/render/webgpu/wgx.js` | 26 | 2 | 12 |
| `js/render/three/tlx.js` | 29 | 9 | 11 |
| `js/physics/debris-world.js` | 17 | 1 | 12 |
| `js/physics/incident-sim.js` | 12 | **0** | 7 |

**Totals: 379 `catch`, 165 of them completely empty.**

Two things worth saying before anyone treats this as 379 bugs:

- **Most empty catches are correct.** Disconnecting an already-disconnected
  WebAudio node, closing a closed context, probing for a feature — these have
  nothing to report and a log line would be noise. The count is a starting
  point, not a defect list.
- **The ones that matter are where the catch hides a USER-VISIBLE outcome.** By
  that filter the priority order is clear from the table: `nostr.js` and
  `lobby.js` (a multiplayer connection that silently never forms — and
  `nostr.js` already intercepts a vendor `console.warn` to detect relay
  rejection, so it has the seam and just does not use `Log`), `spotify.js` (a
  soundtrack that silently never plays), and `store.js` (§4 above — the whole
  persistence layer).

`js/game/audio.js` and `js/net/transport.js` moved off this list during this
pass (0 → 4 and 0 → 3) by logging exactly the failures that present as a symptom
with no cause. The same three-or-four-site treatment would clear the top of the
table without touching the other 350.
