# Phone-landscape (844x390, touch) validation shots for #1339 and #1345

Headless Chromium on SwiftShader, local serve of each PR head (#1339 d4b2880c6, #1345 7e0ad4b84).

- 1339-continue-card.png — title screen with a stored lastSession: CONTINUE card reads "MONZA · RACE", fits the viewport.
- 1339-settings-share-field.png — Settings > BACKUP & RESTORE: share-code textarea (390x52) + IMPORT SHARE CODE button (391x57), fully on screen.
- 1339-share-invalid.png — after tapping IMPORT with "APXS1.garbage": button reads INVALID CODE, no race started.
- 1345-title-phoneL.png — B1: CAREER MODES not clipped, secondary-row icons inside their buttons (TRACK DESIGNER / HOW TO PLAY labels still ellipsize by design).
- 1345-hud-phoneL-chase.png — B3: hud-survey chase cell, 0 findings; INPUTS trace sits below the S1-S3/limits slot, no overlap.
