# graph.js leaves the boot wall — parse measurement (U3.1, #6954)

Kind: measurement · Re-measure-by: 2027-01-15

`js/track/scenery/graph.js` (TrackGraph, ~12 KB stripped) moved from FULL to LAZY_TRACK_BUILD (#6920 part A).
Wall: 299 scripts / 4,062,154 B codeBytes -> 298 / 4,050,153 B on 93713c0e (-12,001 B net: graph.js -12,169 B,
the lazy-bundles readiness check +168 B). This is ~0.3% of the wall, not D4 done.

Link-window reading: waived by Bryce in the #6954 / #6920 thread (issue body, "Planning corrections" 6); not
recorded in docs/DECISIONS.md.

Headless parse measurement: not run in this container (no GPU, node vm only measures compile + eval of the
20 files, and eval is dominated by the files after graph.js). Method for the owner of the next carve:
`new vm.Script(src)` per LAZY_TRACK_BUILD file, then run after the eager TRACK_VM prefix; graph.js reads only
Math and Number at eval.

