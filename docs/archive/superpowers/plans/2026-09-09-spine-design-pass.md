# Spine design pass — implementation plan (2026-09-09)

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans (or implement directly in-session). Design: `docs/superpowers/specs/2026-09-09-spine-design-pass-design.md`.

**Goal:** Improve crown + flank recipes and factory pairings via survey → carve → retune → catalog.

**Branch:** `cursor/spine-design-pass-69f7` off deploy tip.

## Task 1: Branch + baseline survey

- [ ] `git checkout -b cursor/spine-design-pass-69f7`
- [ ] Commit design doc if not already on branch
- [ ] `node tools/car/spine-station.mjs --team=all` (+ per-factory if needed) → `artifacts/spine-baseline/`
- [ ] Note placement / crown rows that look soft or violate content stations

## Task 2: Recipe carve (factory-priority ids)

Edit `js/car/liverytex.js` only for measured failures, one id cluster at a time:

1. Crowns on grid: `saddle`, `panel`, `stripe`, `twin`, `wrap`, `tricolour`, `chevron`
2. Flanks on grid: `band`, `sash`, `plate`, `duo`, `wordmark`, `number`, `code`, `logo`
3. Re-run spine-station after each cluster; keep `FLANK_SEEN` / SIDE_FILL rules

## Task 3: Unit gates

- [ ] `node --test tests/unit/fin-design.test.mjs`
- [ ] `node --test tests/unit/cover-legibility.test.mjs`
- [ ] Touched contrast path if recipes change large fills
- Background tooling-fast via verify-agent / test:tooling-fast when tree settles

## Task 4: Team retune

- [ ] `garage-angles` on teams that still look wrong after recipe carve
- [ ] Adjust `js/data/teams.js` pairings / optional tints only when recipe is correct but pairing fails
- [ ] Re-check cover-legibility for changed defaults

## Task 5: Catalog second wave

- [ ] Crowns: `wedge`, `rungs`, `carbon`, `bigmark`, crown `wordmark`
- [ ] Sides: `ribbon`, `lockup`, `title`, `emblem`
- [ ] Cull or restyle if still sticker-like at side+zoom (precedent: slash/bars)

## Task 6: Lit sign-off + PR

- [ ] Full factory `garage-angles` sheets → `/opt/cursor/artifacts/spine-design-pass/`
- [ ] Commit, push, draft PR vs `claude/f1-game-project-26h3ng`
- [ ] Name any unverified browser groups in PR body

## Verification

| check | command |
|---|---|
| placement | `node tools/car/spine-station.mjs --team=all` |
| fin / flank geometry | `node --test tests/unit/fin-design.test.mjs` |
| default contrast | `node --test tests/unit/cover-legibility.test.mjs` |
| lit look | `node tools/shot/garage-angles.mjs --team <id> --views hero,side,rear` (xvfb if needed) |
| fast gate | `npm run test:tooling-fast` (background) |
