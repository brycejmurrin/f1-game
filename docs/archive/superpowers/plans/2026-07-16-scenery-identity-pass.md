# Scenery Identity Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship all 24 tracks’ Top-3 scenery identity fixes, backed by a shared toolkit of helpers, palette packs, and STYLES/FURN/BARRIER retunes.

**Architecture:** Shared kit lands first in `js/tracks.js` + `js/track-scenery-data.js`. Track work is batched by theme; each track agent edits only `js/tracks/<id>.js` (and brief if needed). Cull/reshape before adding verts.

**Tech Stack:** Vanilla IIFE JS, WebGL2 procedural boxes, Playwright/`__apex` survey tools, no build step.

## Global Constraints

- Procedural coloured boxes only (no textures)
- Props must never sit on tarmac (`rejBox` / `onTrack`)
- Prefer reallocate verts over unbounded growth (~50k aspirational; street tracks already heavier)
- Track-keyed `STYLES`/`FURN`/`BARRIER` — avoid mutating `THEME_DEF` unless intentional
- New `def` keys must be whitelisted in `LIST = DEFS.map` in `js/tracks.js`
- Cache bump (`?v=` + `version.json`) once per batch ship
- Spec: `docs/superpowers/specs/2026-07-16-scenery-identity-pass-design.md`
- Skills: `scenery-dress`, `survey-track`, `bump-cache`
- Do NOT commit unless the user asks
- Protect unrelated user WIP (`js/input.js`, quality-pass work)

---

## Task 0: Shared toolkit

**Files:** `js/tracks.js`, `js/track-scenery-data.js`, `docs/SCENERY-API.md`

- [ ] Add helpers listed in spec § Shared toolkit (at minimum for Batch 1–2: `underpassPortal`, `floodMast`/`floodMastRing`, `ledFacadeBands`, `concreteCanyon`, `sailCanopy`/`gridshellCanopy`, `runoffApron`)
- [ ] Add ATM/COL palette packs (or documented constants) in `track-scenery-data.js`
- [ ] Wire helpers into the `api` object passed to `scenery(api)`
- [ ] Document signatures in `docs/SCENERY-API.md`
- [ ] `node tools/verify-track.cjs monaco` (smoke that buildProps still works)

---

## Task 1: Batch 1 — Night streets (parallelizable per track)

Each track: implement Top-3 from spec Appendix A; `verify-track <id>`; survey if feasible.

### 1a singapore
- [ ] Cool night pal + underpass portals + MBS lean

### 1b vegas
- [ ] Strip re-side/reorder + Sphere simplify + cull off-route / verge neon

### 1c jeddah
- [ ] Grey canyon + open sea corridor + LED tunnel densify

### 1d baku
- [ ] Castle `w:` squeeze + Caspian void + Flame Towers LED fire

- [ ] Batch verify `--all` subset or all four; bump cache once

---

## Task 2: Batch 2 — Desert nights

### 2a bahrain — sail canopy, tall floods, sparse desert
### 2b qatar — flood ring, green→sand verge, Tilke paddock language
### 2c abudhabi — gridshell hotel, marina corridor, thin cityFront

- [ ] Batch verify + cache bump

---

## Task 3: Batch 3 — Green permanents A

spa, monza, silverstone, suzuka, imola, redbull — Top-3 each per checklist.

- [ ] Batch verify + cache bump

---

## Task 4: Batch 4 — Green / park B

montreal, interlagos, albert_park, hungaroring, zandvoort, cota, mexico

- [ ] Add remaining shared helpers if needed (`bankedKerbStrip`, `bowlSeatWall`, `observationTowerVeil`)
- [ ] Batch verify + cache bump; fix `docs/tracks/cota.md` tower placement with cota Top-3

---

## Task 5: Batch 5 — Modern / hybrid

miami, shanghai, madrid, monaco — Top-3 each; STYLES.madrid / shanghai retunes

- [ ] Final `verify-track --all`
- [ ] Final cache bump
- [ ] Check off Appendix A in the design spec

---

## Parallel dispatch rules

1. **Shared kit agent** owns `js/tracks.js` + `js/track-scenery-data.js` exclusively.
2. **Track agents** own only `js/tracks/<id>.js` (+ optional `docs/tracks/<id>.md`).
3. If a helper is not yet on `api`, track agents may inline equivalent geometry and leave a `// TODO(shared): use X` comment — or wait for Task 0.
4. Never edit `js/input.js` or unrelated quality-pass files.
5. One cache bump per completed batch (parent or designated agent).
