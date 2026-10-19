# race-1 helpers

`cdp-hit.mjs` — breakpoint hit counter for a Node test (the js-debugger MCP's `debugger_targets` lists only Chrome pages, #2957).

    node cdp-hit.mjs <test.mjs> '<urlSubstr>::<lineRegex>[@@<expr>]' ...

Empty `urlSubstr` matches any script (vm-evaluated sources with no filename). Breakpoint lands on the first line matching the regex
of each parsed script (instrumentation pause, so vm scripts are covered); removed after 3 hits. `@@expr` is evaluated in the paused
frame and printed as `EVAL[n]`. Output: `HIT xN` / `NOT-HIT` / `UNPLACED` per spec. `CDP_DEBUG=1` echoes the CDP stream.
Run it alone (one inspector at a time, never beside a browser run). Used on ai-band, race-entry-profile, fleet-flags, mirror-lights,
pit-lane, race-flow-fixes-vm.
