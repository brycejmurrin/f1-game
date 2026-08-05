# UI P2 Shared Primitives — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Collapse duplicated chip/row/option geometry without adding new class families (B2 is subtractive per the program design).

**Architecture:** Prefer grouped selectors in `css/components.css` over a new `.choice-chip` family (that would increase the COMPONENTS.md family count). Local files keep fill, radius, and selected-state; shared geometry (display, min-height, align) lives once.

**Spec:** program design §4 P2.

## First slice (this PR)

1. One chip-geometry rule in `components.css` covering `.sel-chip`, `.opt-btn`, `.dh-pill`, `.dh-dchip`, `.dh-sortbtn`, `.dh-livebtn`, `.dh-tbtn`, `.dh-ratebtn`, `.dh-legend-item`.
2. Delete duplicate `min-height` / `display: inline-flex` blocks from `data.css` and `tuner.css` / `menus.css` where they only restate that rule.
3. Remove redundant `h3.sel-label { font-size: var(--label)… }` from `menus.css` (`.sel-label` in components already owns it).
4. Move `#vsfriend .vs-two` two-column switch from `@media (min-width: 620px)` to `@container sheet (min-width: 620px)`.

## Later slices (not this commit)

- `.list-row` slots for `.res-row` / `.dh-row` (higher risk — zebra/podium/team-edge diverge)
- `.option-card` surface only for `.cs-opt` / `.team-tile` / `.track-row` (layout stays local)
- `.status-badge` shell for `.spf-fact` / `.trb` / `.cs-opt-tag` / `.dh-lane-ses`

## Constraints

- Class family count in `docs/COMPONENTS.md` must not rise.
- `tests/component-inventory.test.mjs` + `test:tooling-fast` green.
- No `menu-baseline` refresh unless intentional.
