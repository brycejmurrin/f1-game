# Service-worker release recovery matrix

Implemented against base `ed60f0f62254c3d9c8d5b991b976edd1076b344d`.
This extends `tests/specs/perf-sw-cache-hit.spec.js`; no production worker or
cache policy changes are required.

## What runs

The new test starts an ephemeral loopback HTTP origin and a fresh Chromium
context with service workers explicitly allowed. The origin serves the actual
checkout's `sw.js`, appending only a release-number comment so the browser sees
different script bytes for releases A and B. The attachment records the SHA-256
of the unmodified worker source. Shell HTML and assets are minimal fixtures,
including a real content-hashed script and matching `apex-build` metadata.
The generated optional roster still runs through the real install code, using
inert asset responses rather than loading the game.

| Cell | Expected evidence |
| --- | --- |
| A installs | Activated controller URL A, settled cache A, handshake A, shell and script A |
| A launches offline | Fresh page served through SW while origin returns 503; shell and script A |
| B install is interrupted | Essential script returns 503; partial B cache is not settled; active controller and handshake remain A |
| Offline after failed B | Cached shell and script A still load, with controller and handshake A |
| B recovers | Restored required asset permits B to settle, activate and serve shell/script B |
| Recovered B launches offline | Origin returns 503; controlled page, handshake and cached shell/script all identify B |

Failures return at the HTTP server, including worker-owned requests. The test
does not rely on `context.setOffline()` or Playwright page routing. Every
navigation records `response.fromServiceWorker()`; offline cells also have
origin-failure evidence. A worker event or successful registration alone never
counts as activation. The `pwa-recovery-matrix` JSON attachment includes the
observations collected before a failure as well as bounded origin requests.

## Running and limits

The parent/browser owner runs the existing spec through the repository harness:

```sh
node tools/ci/test-bg.mjs --spec tests/specs/perf-sw-cache-hit.spec.js
```

For a targeted development run, use the ordinary Playwright entrypoint with
`--grep "real service worker preserves"`. Unit checks for the origin and release
fixtures are in `tests/unit/sw-build-meta.test.mjs`.

This validates the real worker's lifecycle and cache handling with a synthetic
application shell. It does not establish full-game offline play, installed iOS
PWA behavior, OS process eviction, Safari equivalence or real-device performance.
The existing first-race precache test remains the full-game coverage in this
spec. Browser acceptance must be reported separately from fixture unit checks.

## Primary documentation

Checked live 2026-10-30: [Playwright service-worker documentation](https://playwright.dev/docs/service-workers).
It documents Chromium-only worker support, events occurring before activation,
worker-owned request visibility, `response.fromServiceWorker()`, and the inability
to route updated worker main-script requests. These constraints motivate the
real HTTP fixture and explicit controller/cache observations.
