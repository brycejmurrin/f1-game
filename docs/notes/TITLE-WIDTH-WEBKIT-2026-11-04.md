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

## 3. More rule-outs

Each is Bryce's export at 844×390 touch, in both engines:

- **Safari version.** His export's UA is `Version/26.6.2`. The token `iPhone OS 18_7` in it is Apple's frozen UA, not his iOS
  version. Safari 26.4 fixed CSS `zoom` for `width`, `max-width`, `margin`, `calc()` and `getBoundingClientRect`
  ([WebKit 26.4 notes](https://webkit.org/blog/17862/webkit-features-for-safari-26-4/)), so his phone has the same zoom model as
  the WebKit measured here.
- **Notch safe areas.** `--sal`/`--sar` were set to 59 px. The right edge still holds (760.3 px) in both engines.
  Side finding: from WIDTH ~85 the cluster runs past the left safe area to x ≈ 0, because its `max-width`
  (`100 * --vwz - --gap`) ignores the insets. That is a separate fix.
- **Density.** `body[data-density]` is `compact` at 852×393, 896×414, 926×428 and 932×430, so every iPhone landscape size
  gets the #4865 rule.
- **The doors inside.** Every door (`#mb-*`) and every group grows with WIDTH, and all hold the right edge (811 px).
- **iOS text autosizing** ([WebKit bug 272351](https://bugs.webkit.org/show_bug.cgi?id=272351): `zoom` on wide blocks).
  `css/tokens.css` already pins `text-size-adjust: 100%`.

## 4. The likely cause: a stale build on the phone

The build before #4865 (e2432a0c) reproduces the report in both engines. From WIDTH 20 to 50 the **right edge moves
759.8 → 797.6 → 819.3 px** while the width grows, so the whole cluster slides. Above 50 it pins. Bryce's saved
WIDTH is 20, so his first drags fall exactly in that band. The live build (and this tip) pins the right edge from 20
up.

A phone can keep the old build after a deploy:
- The service worker serves the shell network-first, but only on a navigation (`sw.js`, the `req.mode ===
  "navigate"` branch).
- A home-screen app resumed from the background does not navigate. It keeps the page it booted.
- `js/ui/update-check.js` then shows `UPDATE READY · RELOAD`, which reloads only when tapped.

The same day, #4871 (the POS plate) was exactly this. The code was correct, and a full relaunch fixed it on his iPhone.

Next step: a PHONE TEST on #4862. Fully close the app, reopen it, and check that Settings shows build 25140 or later.
Then drag WIDTH from 20 to 50. If the cluster still slides on 25140+, that is evidence of a device-only cause, and the
next step is a layout read through the phone bridge.

Not measured: a real iPhone.
- BrowserStack Automate refused the session ("Automate testing time expired", Free plan, 2026-11-04 13:30 PST).
- The phone bridge (`js/agent/apex-bridge.js`) has no DOM-layout read, so it cannot report the cluster's box.

New pin: `tests/specs/ui-scale.spec.js`, "the real WIDTH slider, with Bryce's whole export and SETTINGS open…".
