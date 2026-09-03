# Do not "simplify" these

Each row is a measured failure. An agent under "make it smaller" pressure
reaches for these first. They are not bloat.

| Temptation | Why it stays | Evidence |
|---|---|---|
| Bare speed vs `VMAX` / a literal | `PACE` is a scale, not a cap. Use `vTop()`/`vStd()`/`aStd()`. | `tools/check/vstd-lint.mjs`, `docs/PHYSICS.md` |
| `Tracks.curvature()` on the player with assists off | The arc must not reach the driver. | physics-contract-auditor; `docs/PHYSICS.md` columns |
| `dt` clamp, `steps < 5`, `renderAlpha` | Tab-resume tunneling, spiral of death, stutter. | `../../../../docs/notes/ENGINEERING-PRACTICE-NOTES.md` §1 |
| Split `updateCar()` or `render()` | Continuous integration / one draw; inventing a struct risks characterization. | `docs/ARCHITECTURE.md` §Reorg |
| Extract garage preview "because it's big" | ~15 new `G` accessors — moves coupling, does not remove it. Sort by **boundary crossings**, not lines. | same §, 2026-08 table |
| IIFE → `import`/`export` | No ES modules (vendored three.js only). | `tests/unit/global-registry.test.mjs` |
| Delete a bug-explaining comment | The one growth the size ratchet tolerates (`codeLines` ignores it). The comment **is** the test the suite cannot write. | `docs/notes/CEILING-HISTORY.md` header |
| Delete a `catch` without the why-comment | Silent-catch ratchet: empty catch needs the sentence. | `tests/unit/silent-catch.test.mjs` |
| Restore `other-file.js:412` citations | Ceiling is 0. Cite the **symbol**. | `tests/unit/comment-citations.test.mjs` |
| Raise a ceiling so the extract "fits" | Ratchet exists because extraction happened once and the file grew back. | `ARCHITECTURE.md`; ratchets slack rule |
| Copy constants out instead of moving them | aerozones leftover; settings then `ReferenceError`. `grep` the old names. | `ARCHITECTURE.md` § leftovers |
| Flatten `HARD_EDGES` / script order | Eval-time destructure order is load-bearing. | `tools/manifest.cjs`, `load-order.test.mjs` |
| "Fix" seeded float associativity / lockstep net | Same-machine reproducibility only; peers have authority. | ENGINEERING-PRACTICE-NOTES §2 |
| Put a skill under `.cursor/skills/` | Second tree = CLAUDE.md vs AGENTS.md drift again. | `skill-progressive.test.mjs` |
| Paste a catalog into `SKILL.md` | Fat always-loaded skills burn tokens. Official cap 500; project template thinner. | `skill-progressive.test.mjs`; Context7 Agent Skills best-practices |
| "Do not simplify" these tests back | `shared-math`, `perf-governor`, `wait-polling` pin the bug they caught. | those suite headers |

## Rationalizations

| Excuse | Reality |
|---|---|
| "Fewer lines is simpler" | Nested ternaries and deleted comments are how characterization went red. |
| "This comment is obvious" | If it names a fixed bug, a column, or a leftover — keep it. |
| "I'll extract render later" | Do not start. Take cohesive blocks **around** it. |
| "The auditor can chrome-start" | Never hand a subagent a browser run. Parent uses mcp-probe. |
| "I'll bump the ceiling and extract next PR" | Next PR never comes. Lower now or do not extract. |
