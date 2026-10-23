# Fleet D iPhone / WebGPU / TLX reports (scratch, NEVER merge, no PR)
Pushed by DAD (Fleet D) on Bryce's direct yes, 2026-10-22 5:08 PM PT. Total 171M.
Redacted: BrowserStack session-URL auth_token values (sessions.txt x3) and a hardcoded BrowserStack username (run.mjs, suite/suite.mjs default, suite/README.md). Keys were always read from env. Left out: node_modules (npm dependency cache).

| Path | What | Size |
|---|---|---|
| browserstack-iphone/ (root) | First BrowserStack real-device profiling run (2026-10-21), landscape: iPhone 13 / iOS 18, iPhone 15 Pro / iOS 17, iPhone 17 Pro / iOS 26. Per-device JSON + PNG + logs, run.mjs, sessions.txt | 159M total |
| browserstack-iphone/run1-noapi, run2-portrait-gate | Early runs: no-WebGPU-API and portrait-gate checks | 3.3M, 1.4M |
| browserstack-iphone/deep/ | Deep pass, mostly iPhone 15 / iOS 26 (+ iPhone 13 / iOS 18): Monza medium repeats, render-scale 0.75/1, 300 s soak, Singapore night + ablation, UI | 52M |
| browserstack-iphone/suite/ | Quality matrix on iPhone 15 / iOS 26: Monza low/medium/high/ultra, Singapore night, UI; results/, logs, suite.mjs | 93M |
| live-ui-report/ | Live UI findings report (10 issues, 5 new), single-file HTML + build scripts + verify shots | 6.0M |
| live-pages-2026-10-22/ | Live GitHub Pages screenshots, garage/livery/menus at 1280x720, 390x844, 844x390 | 6.3M |
| tlx/ | TLX 3D-renderer probe Playwright scripts: tlx-probes.spec.js, tlx-probes.green.js, tlx-post.green.js, tlx-post.red.js | 156K |
