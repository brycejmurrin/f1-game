# Replayable lazy-request fault fixture

Base: freshly fetched deploy b97531beb82c432551bec956861e697c971085fb.
The fixture adds saved declarative request schedules to the existing boot-guard
Playwright seam. It reuses the current session, ordinary-action adapter, scenario
validator and oracle implementation. A caller owns the browser/context; the
fixture owns only its routing handler, holds, watchdogs and transfer observers.
No production game file, G member, load order or package changes.

## Use and scope

Import replayFaultScenario from the new fault-schedule helper and supply the
existing performAction and matchesOracle adapters from the explorer browser
module. The boot-guard spec demonstrates the complete call. Returned evidence
contains a normalized JSON scenario and bounded events. Failed replays attach
the same data as error.faultEvidence, including cleanup outcomes.

The extension accepts three fault operations:

```json
{"type":"faultHold","id":"circuit","path":"/js/circuits/monaco.js","timeoutMs":15000}
{"type":"faultWait","id":"circuit"}
{"type":"faultRelease","id":"circuit","outcome":"continue"}
```

Ordinary actions trigger the request and navigate away between these operations.
There are at most four unique holds/paths and 256 total actions. Paths are exact
same-origin root-mounted JavaScript pathnames under /js/, without traversal,
queries or wildcards. Request cache-busting queries do not affect matching.
Watchdogs begin when armed and accept integer deadlines from 100 to 30000 ms.
Only renderer-classified script requests qualify; same-URL fetch/XHR cache warms
pass through without consuming a hold. Each hold intercepts its first matching
script request only. Continue falls back to
earlier routes; reject aborts with the generic network-failure code.

Wait requires actual interception. Release requires that observation and waits
for the exact Request object's terminal transfer; an installed rule or completed
route operation cannot establish delivery. Completion rejects expired,
unobserved, unreleased and failed holds. Finally cleanup releases pending holds,
removes only the fixture's handler and drains intercepted route operations.

Terminal transfer does not prove application consumption. Scenario authors must
choose an observable application readiness condition and a meaningful oracle.
The browser acceptance proves the payload remains pending at an explicit
read-only checkpoint before leaving the picker. It then checks Monaco residency
after continue, or failure acknowledgement/successful recovery after reject,
and verifies Home/menu remains active. The attachment records both residency
and the loader's retained warning, independent of console printing.
It also proves that holding an already-loaded script fails as unobserved.

This is a reusable fixture API. The explorer replay CLI and minimizer do not
accept these extra operations. The earlier broader integration remains an
unpublished prototype; this slice uses paths outside the active explorer PR's
ownership. It adds no second browser controller or copied ordinary-action driver.
Mounted subdirectory URLs and service-worker-owned requests are outside this
fixture's scope; the existing explorer session blocks service workers.

## Verification

The existing boot-script-repair-overlay unit file covers validation, observation,
exact-request transfer identity, deadlines, cleanup and failure evidence using a
fake context. Those checks do not establish real browser behavior. The parent
runs the full existing boot-guard spec through test-bg and records its separate
verdict and scenario attachments in the PR handoff. No test tolerance is widened
and no gameplay change is needed to admit the fixture.

## Primary sources

Playwright documentation checked 2026-10-30 during this implementation:

- [Route API](https://playwright.dev/docs/api/class-route): fallback continues
  through earlier matching handlers, while abort represents a failed request.
- [BrowserContext API](https://playwright.dev/docs/api/class-browsercontext):
  requestfinished/requestfailed identify terminal transfers; unroute can remove
  a specific handler without clearing another fixture's routes.
- [Network guide](https://playwright.dev/docs/network): context routing and
  service-worker visibility constraints motivate the explicit SW-blocked scope.
- [Request API](https://playwright.dev/docs/api/class-request#request-resource-type),
  checked 2026-10-31: resourceType distinguishes renderer-classified script,
  fetch and XHR requests. Real browser acceptance exposed a background cache
  warm requesting an already-evaluated script's URL; URL matching alone was
  insufficient evidence of lazy-script interception.

Independent review also inspected the installed Playwright implementation:
fallback reports this handler complete before invoking older handlers. This is
a library implementation observation, not an ECMAScript scheduling guarantee.
