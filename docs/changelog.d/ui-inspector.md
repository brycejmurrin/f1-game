Fixed: UI exploration now notices toggle changes, reports native control roles and inherited disabled state, and distinguishes scrolling axes when reporting offscreen controls.
New: Read-only developer UI inspection with live setting bindings, hit-test and CSS diagnostics, and replay state differences.
Fixed: Boxless display:contents ancestors no longer falsely clip usable controls in inspector reports; outer real clipping remains detectable.
New: Adaptive CSS reports include viewport, scale, safe-area tokens and ancestor layout/scroll context, with bounded viewport sweeps that restore the original size.
New: Adaptive inspection records bounded classification histories, forward/reverse path differences, inherited/container CSS candidates and provenance-checked native audit findings.
New: UI inspection can emulate a touch phone (`--touch`, `--boot`, real safe-area insets via `--safe`) and print a one-line-per-issue `--summary`; a busy box exits 75.
Fixed: Inspector no longer reports controls as blocked from an unsettled first layout or a bare-page hit test, and counts a native label as part of its control's tap target.
