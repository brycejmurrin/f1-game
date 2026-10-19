# Rapier JS pin check (#2872) — 2026-10-19

**Decision: KEEP the pin (`@dimforge/rapier3d-compat` 0.19.3, vendored).** Archiving
the JS-bindings repo does not break a vendored file. One licence-file defect found
(below); it is a follow-up, not a reason to move.

## Current pin

- Vendored at `vendor/rapier-0.19.3/rapier.mjs` (2.24 MB, WASM inlined as base64),
  with its `package.json` (`@dimforge/rapier3d-compat` 0.19.3, `Apache-2.0`) and `LICENSE`.
- Loaded lazily and only by `js/physics/debris-world.js`: `RAPIER_URL` resolves
  `../../vendor/rapier-0.19.3/rapier.mjs` and `import(url)` runs after boot. No CDN,
  no `<script>` tag; `sw.js` leaves it out of the install precache. The CSP needs
  `'wasm-unsafe-eval'` (`tools/gen/gen-shell.mjs`).
- Spike harnesses (`spike/physics/*`) import the same file.

## Upstream status (checked 2026-10-19)

| Claim | Evidence |
|---|---|
| the `dimforge/rapier.js` repo is archived (read-only since 2026-07-12) and its README says it was merged into the main `dimforge/rapier` repo | https://github.com/dimforge/rapier.js |
| The package is NOT deprecated or renamed: same npm name, `latest` = 0.21.0, no `deprecated` field on 0.19.3 / 0.20.0 / 0.21.0 | https://registry.npmjs.org/@dimforge/rapier3d-compat |
| Publish dates: 0.19.3 = 2025-11-05 (repo URL: the archived JS repo); 0.20.0 = 2026-08-08 and 0.21.0 = 2026-09-25 (repo URL now `dimforge/rapier`) | same registry document |
| So the successor is the same package, now released from the Rust monorepo | https://github.com/dimforge/rapier (the monorepo) and the registry above |
| Licence is Apache-2.0 on every version checked | registry above |
| A `-deterministic-compat` variant exists | https://registry.npmjs.org/@dimforge/rapier3d-deterministic-compat |
| 0.21.0 compat `rapier.mjs` is ~4.34 MB (vs 2.24 MB), and no performance changelog was found | `docs/notes/PERF-RESEARCH-2026-10-17.md` §3 |

Not verified: the monorepo's `typescript/` layout and its changelog were not readable
through the fetch tool.

## Options

| Option | Risk |
|---|---|
| **Keep 0.19.3 vendored (recommended)** | Nothing to run or break; no network dependence. Cost: no upstream fixes from the 0.20/0.21 line. The debris world is cosmetic and bounded, and incident takeovers have a hard time-cap. |
| Move to 0.21.0 `rapier3d-compat` | ~2× bytes on a lazy phone load; float results may change, and the debris world feeds race logic (`debris-world.js`), so physics specs (`debris`, `physics-boot`, incident) must be re-baselined. Needs a phone-side `step()` measurement first. Buys nothing the game currently lacks. |
| Move to the deterministic build | Same size cost; only worth it if determinism between clients becomes a requirement (VS FRIEND). Not today. |
| Fork or re-vendor from the monorepo | Pure maintenance cost; no gain over the npm artifact. |

## Recommendation

Keep the pin. Revisit only if (a) a Rapier bug hits the debris or incident world, or
(b) a browser change breaks the 0.19.3 WASM. If so, the target is
`@dimforge/rapier3d-compat` 0.21.x, with the PERF-RESEARCH measurements first.

## Defect found: wrong licence text vendored

`vendor/rapier-0.19.3/LICENSE` contains the **three.js MIT licence**
("Copyright © 2010-2026 three.js authors"), not Apache-2.0 as the package's own
`package.json` states. `desktop/scripts/notices.mjs` ships that file as Rapier's notice, so
the generated third-party notices carry the wrong licence for Rapier. Apache-2.0 also
asks for the licence text to travel with redistributions.

Follow-up issue body (to be filed by the orchestrator; this lane may not touch `vendor/**`):

> **vendor: replace `vendor/rapier-0.19.3/LICENSE` with the Apache-2.0 text.**
> The file holds the three.js MIT licence. Rapier (`@dimforge/rapier3d-compat` 0.19.3) is
> Apache-2.0 per its `package.json` and the npm registry
> (https://registry.npmjs.org/@dimforge/rapier3d-compat). Replace it with the Apache-2.0
> text from the npm tarball or https://github.com/dimforge/rapier.js, re-run the desktop
> notices generator and check `tests/unit` notice/vendor tests.
> Done when: LICENSE is Apache-2.0 and the generated notices list it for Rapier.
