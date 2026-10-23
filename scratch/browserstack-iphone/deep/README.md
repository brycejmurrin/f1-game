Deep profiling run (Oct 21 2026, 9:39–10:05 PM PT). See RANKED-FIXES.md.
node deep.mjs race:<trk>:<tod>:<preset>[:scale=x][:ablate][:soak=secs] [device] [os]   |  node deep.mjs ui
LOCAL=1 → local headless Chromium. python3 an.py results/<file>.json prints the summary. local-prof.mjs = CDP CPU profiles (CPU=4).
Never call __apex.diag() without {download:false} on iOS (it aborts fetches).
