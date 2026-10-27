# Game entry: complete boot range map

## Goal and source
GPT-6.1 Sol complete_core fully read js/game.js lines 1–3000 at c4dc493d9 in fifteen separate 200-line chunks. Earlier truncated reads of 1–800 were reread. This report claims no coverage after 3000.

## Architecture by range
- 1–147: DOM registry, ScriptLoader/LazyBundles injection closures, deferred instance reconstruction, awaited RendererBoot, idle optional asset pack. Renderer failure ends boot.
- 148–400: persisted preferences with guards, stable circuit IDs, season/career/grid identity, PhysicsConsts/DriveTune/PaceMath composition. Manual gears follow input mode.
- 401–700: local track readback uses two Newton steps to avoid another hairpin leg; matching track/world lateral basis; energy/aero helpers; independent seedable simulation RNG and cosmetic randomness; synchronized TT recordings; line crossings deferred to RaceControl.
- 701–1000: state transition owner, track/cars/clocks, sporting watches, camera/debug ownership. Independent flow gp/season/career and session race/tt/quali axes; practice and duel gates. Input ownership handles pause/network neutrality.
- 1001–1200: announcement and audio placeholders; pooled scratch; centisecond time formatting; world/yaw interpolation; shared render/camera basis and reflected preview transform.
- 1201–1600: engaged-career garage isolation; active-aero visuals; build/livery cache; tyre-normalized mods; explicit human/local/player roles and stable wire identity; deterministic grid assembly and predeclared car state.
- 1601–1900: grid policy, net deterministic fallback, red-flag restart preserving driven clocks/fuel/penalties, scratch reset and timeline break; ordinary grid reset and seeded launch/strategy.
- 1901–2200: renderer resource ownership, current ground matrix, build identity and cleanup. Worker/paced builds use generation/liveness checks; late worlds cannot be adopted. Circuit metadata is rejected by synchronous build.
- 2201–2400: speculative title preparation, quiet settings gates, lamp/program/Flyby warming and retargeted build ownership. Authoritative pose feeds snapped camera and smoothing reset.
- 2401–2800: race entry transaction yields for loading paint, ensures required lazy session, permits optional audio/light degradation, checks save/season ownership, resets prior owners, joins/builds correct world, constructs race field and warm assets. Atomic count entry arms HUD/input/audio/wake/orientation. SessionEntry and RaceEntryProfile guard stale commits and preserve rejection for awaiting callers.
- 2801–3000: authoritative network classification validates complete driver-id bijection before mutation. End-race cleans resources and recording, separates qualifying/TT/normal result routes, applies sporting penalties and host order. Championship settlement continues after this range.

## LSP evidence
Anonymous async IIFE at line 5 has 952 members and 276 functions. G declaration is at 3038 (outside read range), G.state contract types/game-ctx.d.ts:370; no G.setState member. RendererBoot.start module fallback points renderer-boot.js:202 (caller coverage unverified). SessionEntry.create at session-entry.js:11 and RaceEntryProfile.runSession at perf/race-entry-profile.js:381.

## Verified comment findings
- game.js:2468 says asynchronous only to await scenery and all callers ignore result. Actual race body awaits multiple prerequisites and startRace explicitly retains rejecting promise for awaiting callers at 2770.
- Catch-up comment around 1001 contains duplicated and stranded fragments.
- Renderer selection comment at 44–48 requires RendererBoot body corroboration before correction.
- Extracted tuning declarations left confusing orphan commentary near 405–412; actual values are sourced through DriveTune.

## Remaining coverage and verification
No browser/test/source changes in agent. Middle 3001–6200 and tail 6201–9554 assigned separate complete readers. Cross-range integration and final docs validation belong to parent.
