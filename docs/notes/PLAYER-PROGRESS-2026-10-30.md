# Personal progress and measured lap review

Base: fetched deploy `ed60f0f62254c3d9c8d5b991b976edd1076b344d`.

Daily history is reached through Home → SAVES & DATA. It reads the existing
device-local Daily record without changing its schema or persistence. It shows at most seven saved dates and four classes per
date. Class numbers are local to a date; historical circuit identities and
medals are unavailable and are not reconstructed. Invalid backups are ignored.

Practice pathways expose three existing goal choices and three explicitly
self-reported checkboxes. Choosing a goal does not arm practice, change assists,
resume play or certify drill completion. Session reset clears the checklist.

The last-lap energy review reports measured net battery change in percentage
points for three sectors of one complete clean lap. It makes no causal claim
about braking or deployment. Pit/stint changes, weather changes, cautions,
incidents, rewinds and incomplete or non-finite sector-endpoint measurements
invalidate the receipt.
Returned forecast records are copied so callers cannot mutate owned state.

Static disclosure panels belong to index.html. Existing IIFE modules wire the
panels and render bounded history data; no new global, G member, script, lazy
bundle, package or evaluation-time dependency is introduced. DrivingCoach owns
the ephemeral checklist and RaceInsights owns the measured receipt. Existing
session lifecycle callbacks remain their reset boundary.

## Approved shell budget

Bryce replied "Yes" in the acting session to the explicit request to raise
shellNodes from 2,233 to 2,256 (+23), observed 2026-10-30 23:38 UTC.
The generated topic fragment records only tree.shellNodes +23. No other
tree-wide ceiling is raised. This accommodates the three native disclosure
panels and their labeled controls. The markup adds 23 nodes; the approved
ceiling covers exactly that growth.

## Evidence and limits

Before the budget update, the three affected unit suites passed 142 tests with
zero failures. Independent review checked selectors, static DOM ownership,
clean-lap validity and self-reported wording. The time-trial browser spec adds
a touch journey through all three panels at 844 by 390. It checks Home fits
without an extra history row, opens history through SAVES & DATA, and verifies
the same Home dimensions on return. The history remains visible with HELP TEXT
set to HIDE through the existing appearance preference API. It also checks history,
goal selection, checklist interaction and the empty measured-review state;
populated energy receipts are covered by unit tests rather than a real driven
lap. Structural, browser and remote CI verdicts are recorded separately in the
PR handoff; this note does not imply any unrun check passed.

The first placement directly in the Home grid caused phone overflow in CI and
changed the Home screenshots. The fixed history blueprint now lives in the
existing SAVES & DATA panel, reached by its existing Home shortcut. This keeps
all feature nodes and their IDs while restoring the original Home grid; no
CSS, session API or additional shell-budget change is needed. The relevant
Home-fit and screenshot checks must pass before that correction is accepted.

The subsequent full time-trial run passed 26 of 27 cases. Its desktop 200%
Help-anchor failure is retained in report46633. A diagnostic-only run44573
observed the reading pane change from 900 to 1252 pixels wide and its scroll
extent from 12872 to 8506 while reopening. The previous test readiness guard
compared only shape and density during one forced classification pass. The
test now reuses the existing bounded layout observer on the reading pane,
requires sampled geometry stability without truncation, and retains the real
anchor click and viewport/ARIA assertions. This changes test readiness only;
quiet sampled frames do not prove absence of every later asynchronous change.
