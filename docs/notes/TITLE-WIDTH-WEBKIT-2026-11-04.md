# Title WIDTH in landscape, measured in WebKit (#4862 reopen)

Kind: measurement · Re-measure-by: 2026-12-04

Bryce reported from his iPhone, 2026-11-04 ~13:25 PST, that the landscape title WIDTH slider still moves the button
cluster sideways after #4865 (a208bfcc), live in build e3638a06. #4865 was measured only in Chromium. This note covers
the rule-outs from the reopen comment, run on the deploy tip ab0bc009.

## 1. Stale cache: ruled out

The live `index.html` (apex-sha e3638a06, which contains a208bfcc) loads `css/menu-destinations.css?v=e2dbd4e8cdf1`.
That file contains #4865's `grid-column: 1 / -1; justify-self: end; margin-inline: 0;` in the
`[data-title-btnw]` rule. `sw.js` keys its cache on the full `?v=` URL (no `ignoreSearch`), so a new deploy cannot be
served the old stylesheet.

## 2. A WebKit layout difference: not found in WebKit

Engine: Playwright WebKit 1.63 (`webkit-2359`, Linux). It shares iOS Safari's layout engine, but it is not iOS. Setup:
844×390, touch, `isMobile`, Bryce's whole `tests/data/settings-defaults-export.json`. UI SIZE resolves to
`--ui-scale` 1.09 and the cluster's zoom to 0.9919. Saved landscape layout: WIDTH 20, SIZE 91, X −2.

Cluster box (`#menu-buttons`) in px, with SIDE on AUTO. The real slider was moved with SETTINGS open, so the screen
was peeking:

| WIDTH | left | right | width |
|---:|---:|---:|---:|
| 20 | 557.4 | 819.3 | 261.9 |
| 30 | 557.4 | 819.3 | 261.9 |
| 40 | 481.7 | 819.3 | 337.6 |
| 60 | 312.9 | 819.3 | 506.4 |
| 80 | 144.1 | 819.3 | 675.2 |
| 100 | 59.2 | 819.3 | 760.1 |

- With SIDE on SWAPPED the left edge holds at −8.7 px and the right edge moves.
- `TitleLayout.apply()` with the sheet shut gives the same numbers. So does Chromium, at UI SIZE 1.0 (right edge 821).
- The hero grows from 246 to 744 px.
- WIDTH 20 and 30 match because both sit on the 16.5rem floor (#4816).

So in WebKit, WIDTH resizes the cluster. The outer edge stays put and the inner edge moves toward the art. That
movement is the #4865 design.

## 3. What is left

What Bryce calls sliding is most likely the inner edge sweeping left: the cluster's centre moves by half of its
growth. Portrait centres the cluster. Which edge to hold is Bryce's call, asked on #4862 with `needs-decision`.

Not measured: a real iPhone.
- BrowserStack Automate refused the session ("Automate testing time expired", Free plan, 2026-11-04 13:30 PST).
- The phone bridge (`js/agent/apex-bridge.js`) has no DOM-layout read, so it cannot report the cluster's box.

New pin: `tests/specs/ui-scale.spec.js`, "the real WIDTH slider, with Bryce's whole export and SETTINGS open…".
