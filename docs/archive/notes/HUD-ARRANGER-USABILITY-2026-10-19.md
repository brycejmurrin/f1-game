# HUD arranger usability follow-up

The unrestricted v4 layout model lets every arranged widget retain its own position and positive size. This follow-up makes that freedom easier to use without adding automatic placement constraints.

## Changes

- **Bring Into View:** an explicit toolbar action moves the selected widget into the visible viewport and safe insets, preserving its size. An oversized widget exposes its leading edge. A widget hidden by its current mode gets an explanation. Reset continues to restore the automatic shipped layout.
- **Numeric editing:** drafts remain in the focused field and do not write settings. A completed valid edit commits once. Empty, non-finite and non-positive size values restore the previous value. HUD preview waits until focus leaves the numeric fields, keeping the form readable while typing or tabbing.

## Worktree ownership

Recovery and its unit tests were implemented in `cursor/hud-recovery-worktree-7c9e`; numeric editing and its unit tests in `cursor/hud-numeric-worktree-7c9e`; browser regressions in `cursor/hud-coverage-worktree-7c9e`. The parent integrates the disjoint diffs and owns serialized browser execution and image inspection.

## Verification scope

Start with fresh shipped appearance/input settings at 844×390 touch and 1280×720 mouse. Inspect original screenshots and DOMs while typing, after committing, during scrolling in both directions, and in portrait. Separately label enlarged UI cases. Exercise recovery with real taps, preserve scale and unrelated widgets, and complete Done → Back → Back → Resume. Check editor exit/focus behavior, resize/rotation and the existing moved-sector stability regressions.

Artifacts are under `artifacts/hud-next/`. The PR records actual test verdicts. Browser evidence uses Chromium touch emulation; a physical iPhone and WebKit runtime are unavailable in this environment.
