# RaceControl capability pilot

Implements the first bounded consumer of the [architecture evolution design](../plans/2026-10-30-architecture-evolution.md).
Base: `01991a6c50bee13b52ae6d0531b1fe214f1a1bd3`, fetched deploy, isolated
`cursor/race-policy-port-01991a6c`. No directory or loading migration.

## Boundary and ownership

`RaceControl.create(G)` remains the public factory. It captures the original store
and constructs one frozen capability object for a private sibling factory. Only
the adapter sees G. The private machine owns its existing caution, storm, hold,
replay and notification state. It sees live scalar session/clock/weather reads and
leader lap, not the mutable grid, player, network service or store objects.
Persistence, announcement and network publication are explicit commands.

`types/race-control-port.d.ts` is the contract. The adapter creates no per-frame
objects. Scalar getters read through to current session state; network, wetness
and announcement calls forward to current services with their original receivers.
Persistence deliberately retains the creation-time store, matching prior behavior.
An absent/rejected banner returns false, preserving retry until accepted. Local
reset and low-grip notification still precede host-authority gating; WATCH and
frame-stamp bypasses retain their order. Leader lap stays unrounded until the
existing overtake-hold assignment; no-leader and incomplete harness leader remain
distinct.

This is a G-access boundary, not a fully pure race core. DebrisWorld, Storm,
TyreModel and Log remain explicit legacy global dependencies. No deep-freeze of
world state, new authoritative store, event bus or renderer change is introduced.
The dependency guard prevents accidental expansion; it is not a security sandbox.

## Enforcement and evidence

The existing RaceControl unit suite checks gameplay behavior and now includes:

- Adapter isolation/freeze, live scalar and service replacement, call receivers,
  optional announcement/wetness behavior and captured persistence ownership.
- Guest notification absence/rejection/acceptance and local-reset ordering.
- Scope-resolved allowed free names for the actual private machine; negative G
  and window-access probes prove this check is not vacuous.
- TypeScript checkJs over the actual factory body, its actual constant/helper
  sources, the port and declared legacy collaborator surfaces. Negative probes
  reject unknown player access and writes to readonly session/command properties.

The focused check intentionally keeps strictNullChecks/noImplicitAny off for
legacy internals; it does not claim whole-module or whole-project strict typing.
No generated usage-only shadow stands in for checking the factory expressions.
Other standalone RaceControl helpers and the compatibility adapter still use the
existing project checks. VM tests do not prove browser integration; the PR records
structural, focused browser and CI outcomes separately.

## Coordination and follow-up

The open PR path inventory showed no owner for these source/test paths. The JS
refactoring session is PR #4304 (DataExport); a scope notice was posted there.
That notice is not an acknowledgement. This pilot avoids its files and the
shared game.js, GameCtx, manifest, shell and loaders. Generated impact metadata is
regenerated from source rather than treated as authored ownership.

Keep the existing public factory and legacy globals for now. A later policy
extraction can replace a legacy global with another explicit capability when a
feature needs it; it must preserve ordering and be reviewed independently. Do not
replicate this adapter across unrelated modules without a demonstrated benefit.

## Guidance used

The design's primary sources remain applicable: [Cockburn's ports/adapters](https://alistair.cockburn.us/hexagonal-architecture/)
for explicit policy/effect interfaces, [TypeScript checkJs](https://www.typescriptlang.org/tsconfig/checkJs.html)
and [JSDoc](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html)
for incremental checks without converting shipped JavaScript, and [MDN Object.freeze](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze)
for shallow capability immutability. Freeze does not make returned world objects
immutable; this port avoids returning the grid/world in the first place.
