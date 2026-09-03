# Audit remediation programme

## Goal

Resolve the verified defects and guard gaps from the repository-wide audit
without combining unrelated protocol, rendering, gameplay, and documentation
changes into an unreviewable release.

## Non-goals

- Rewriting the no-build IIFE architecture.
- Changing driving physics or circuit layouts unless a specific verified defect
  requires it.
- Treating an opt-in renderer as pixel-identical to GLX without a stable
  cross-backend visual test.

## Delivery order

### 1. Release hygiene and instruction integrity

- Correct the service-worker registration URL and make version discovery
  independent of a hardcoded build number.
- Add a structural regression test for the inline shell version/registration
  contract.
- Replace the incorrect Rapier licence, introduce an attributed third-party
  registry, and guard vendored licence presence/content.
- Make browser test batching serial by default; retain an explicit opt-in for
  higher concurrency.
- Establish `CLAUDE.md` as the canonical engineering guide and make
  `AGENTS.md` a tested pointer or exact derived copy.
- Correct verified stale counts and branch/output-path guidance in live agent
  documentation and skills.

### 2. Gate reliability and coverage

- Put `{ polling: 100 }` in common rendering-page fixture waits, then reduce
  the wait-polling ceiling only after isolated verification.
- Eliminate assertion-swallowing waits where a test can deterministically
  assert readiness.
- Run asset-pack verification in CI and add graph-parity routing for graph
  changes.
- Expand mandatory smoke coverage with incident-driven boot/API checks only
  after its measured CI budget is updated.
- Trial menu baselines as a non-blocking CI signal before making them a deploy
  requirement.

### 3. Security and networking

- Make Nostr `directExchange` surface relay rejection rather than waiting for
  the global timeout; add deterministic socket tests.
- Encrypt Worker-rendezvous payloads only alongside a compatible conflict
  identity scheme and an integration test. Do not silently change invite
  interoperability.
- Remove static TURN credentials from the shipped client only when a deployed
  credential broker and failure fallback exist.
- Add bounded abuse protection to the Worker endpoint, preserving public room
  links and the two-minute expiry model.

### 4. Renderer lifecycle and deferred-backend parity

- Give WGX and TLX ownership-aware material-map release behavior on replacement
  and unload; add a lifecycle regression test that observes destruction.
- Correct the stale WGX asset-support documentation.
- Bound decal/team mesh cache lifetimes without invalidating visible cars.
- Keep sky/instancing parity work separate until a reliable browser backend
  probe exists.

### 5. Structural debt and content coverage

- Extract `game.js`/`apex.js` only by a measured boundary with a stable
  contract and characterization tests.
- Add foundation coverage incrementally for unrepresented circuits, beginning
  with venues carrying existing float/budget/urban-risk signals.
- Drive known clip/float debt toward zero rather than widening baselines.

## Safety rules

- One logical concern per commit and PR update.
- No browser tests run concurrently; no source edits while a browser run is in
  flight.
- Cache bump is the last source edit in a JS/CSS/shell-runtime change set.
- Network protocol changes require compatibility, cancellation, refusal, and
  expiry tests before deployment.
- Third-party licence corrections retain upstream text and provenance.

## Acceptance criteria

Each tranche must have:

1. A targeted regression test that fails on the pre-fix behavior where
   practical.
2. `npm run test:tooling-fast` green after dependency installation.
3. The change-selected tests from `pick-tests`, serially run where browser
   coverage applies.
4. Cache/version alignment after runtime JS/CSS/shell changes.
5. A pushed commit and updated draft PR before wider testing.

## Deferred decisions

- Whether Worker rendezvous encryption and TURN brokering are deployed depends
  on an operator-owned endpoint and rollout plan.
- Whether visual baselines become blocking depends on measured GitHub runner
  reproducibility.
- Backend pixel parity and a build-system migration are separate design
  decisions, not audit-fix work.
