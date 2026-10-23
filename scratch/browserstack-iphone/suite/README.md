# Apex iPhone profiling suite (BrowserStack Automate)
Needs: BROWSERSTACK_ACCESS_KEY (env), BROWSERSTACK_USERNAME (defaults REDACTED). Node + selenium-webdriver (../node_modules).
Run one scenario (iPhone 15 / iOS 26 landscape by default):
  node suite.mjs race:monza:default:medium:matrix          # drive 60s (RACE_S) + renderScale 1/0.75/0.5 + upscaler@0.75
  node suite.mjs "race:singap|marina:night:default"        # street circuit at night, default preset
  node suite.mjs ui                                        # title->settings->race select->back, garage orbit/team switch, livery x6
  node suite.mjs <scenario> "iPhone 13" 18                 # other device
Full suite in parallel (<=5 on Free plan):
  for s in race:monza:default:{low,medium,high,ultra}:matrix "race:singap|marina:night:default"; do node suite.mjs "$s" & done; wait; node suite.mjs ui
Summarize: python3 summarize.py   (reads results/*.json; screenshots results/*.png)
Notes: preset is forced by localStorage apex26.gfxPreset = JSON string ("low") + apex26.gfxHigh (ultra=1), then reload.
Driving = in-page port of js/perf/soak-run.js closed-loop autopilot via __apex.probe/scan/setInput.
