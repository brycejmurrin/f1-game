# Skill / MCP / tooling scout — 2026-10-18

Bryce asked for a web sweep of agent skills, MCP servers and CLIs that could help this repo (code, graphics, game design,
UI, Chromium, agent workflow). Plugins already judged are in `PLUGIN-SKILL-POLICY-2026-10-18.md` (branch
`cursor/plugin-policy-fixes-9c4d`) and are not repeated here. Four read-only research agents each took a slice; this note is
the merged result. Nothing was installed and no repo config was changed.

**Verification limits — read before trusting a row.** `api.github.com` (WebFetch and `gh`) returned 403 in this session, so
stars, last-push date and licence come from the GitHub MCP `search_repositories` (same fields). READMEs were opened only for
the rows marked "README" below (Serena, ast-grep-mcp, Knip, semgrep/mcp, vgpu, webgpu_inspector_mcp, threejs-skills,
claude-code-action, anthropics/skills webapp-testing, Penpot, game-creator, axe MCP). Every other row rests on repo metadata
plus the agent's prior knowledge and says UNVERIFIED where it matters. "Pushed" is `pushed_at`, not the default-branch commit.
Numbers are as of 2026-10-18. Facts about this repo were checked on the tree: no `tsconfig`/`jsconfig`, no knip, no
`ast-grep`, no actionlint/zizmor, no glslang, no axe in `package.json`; `npm run typecheck` is `tools/check/check-gctx.mjs`
(espree parity + optional tsc over `types/game-ctx.d.ts`); 16 workflows under `.github/workflows/`.

Pattern across all slices: **the best fits are offline CLIs, not MCP servers.** The four MCPs we have already cost ~18k tokens
for `apex-tools` alone, and anything that launches its own browser or calls its own LLM breaks rules 4/5/10 (one browser
group, no browser in a subagent).

## Top 10, ranked by value for this repo

| # | Candidate | Slot | Why it ranks | Verdict |
|---|---|---|---|---|
| 1 | **zizmor** (zizmorcore/zizmor) | CLI in `tools/check`, `tooling-fast` | 16 workflows, some merge/arm-capable (fleet, pages); static security lint, offline, MIT, pushed 2026-10-18 | ADOPT |
| 2 | **actionlint** (rhysd/actionlint) | CLI in `tools/check`, `tooling-fast` | Catches expression/shell typos before a 23 min Pages train; one static binary; pairs with zizmor | ADOPT |
| 3 | **ast-grep CLI** (ast-grep/ast-grep) | project skill + `tools/` wrapper | Structural search/codemod on plain-JS IIFEs, no tsconfig, no MCP cost, MIT, 16.3k★. Binary is `ast-grep`; **`sg` is the Linux setgid tool on this box** (`/usr/bin/sg`) — never call it `sg` | ADOPT |
| 4 | **glslangValidator** (KhronosGroup/glslang) | unit test over GLSL ES sources (GLX/TLX) | Shader-compile errors found offline instead of in a 10–40 min SwiftShader group; `apt install glslang-tools` or release binary | ADOPT |
| 5 | **axe-core + @axe-core/playwright** (dequelabs) | one spec inside an existing browser group | Real WCAG engine for DOM menus/HUD (canvas excluded), deterministic JSON, MPL-2.0 devDependency, no MCP | ADOPT |
| 6 | **glTF-Transform** `inspect`/`validate` (donmccurdy) | read-only step in skill `asset-pack` | Cheap audit of the baked model pack; MIT, same maintainer family as three's glTF loader | ADOPT (read-only use) |
| 7 | **stylelint** | `tools/check` | Enforces "no raw colours outside `:root` tokens", duplicate selectors; feeds `css-play` / `slim-bloat` | TRY (was ADOPT in its slice; keep the config tiny — commit hook budget) |
| 8 | **naga-cli** (gfx-rs/wgpu) | `tools/` second opinion for WGSL | Offline WGSL validation; Tint stays authoritative for Chrome | TRY |
| 9 | **Spector.js** (BabylonJS) | recipe in skill `renderer-debug` | WebGL2 frame capture via `addInitScript`, dump JSON to `artifacts/`; must not ship | TRY |
| 10 | **Knip** (webpro-nl/knip) | spike on `tools/` + `tests/` only | Dead exports/files for real Node code; will mis-report `js/` (classic `<script>` globals) without an entry list | TRY (scoped) |

Runners-up worth one line: **Serena** (30k★, LSP-backed symbol tools; GPL app/MIT SolidLSP; MCP tool-list cost unmeasured —
trial only to measure it, SKIP above ~15 tools); **claude-code-action** as an on-demand `@claude review` job (read-only
permissions, never on fork PRs); **anthropics/skills skill-creator** description/eval loop against our routing eval.

## Full table (about 60 rows examined)

Columns: ★ = stars, push = pushed_at, lic = licence. "plug" = where it would live. "conflict" = against AGENTS.md rules.

### Code

| Name / URL | ★ | push | lic | What | Plug | Conflict / trust | Verdict |
|---|---|---|---|---|---|---|---|
| ast-grep — github.com/ast-grep/ast-grep | 16.3k | 2026-10 | MIT | tree-sitter structural search/lint/rewrite | skill + CLI | can rewrite generated files: scope paths. Local, no secrets | ADOPT |
| ast-grep-mcp — github.com/ast-grep/ast-grep-mcp (README) | 479 | 2026-10-17 | MIT | 4-tool MCP over ast-grep | `.mcp.json` via `uvx` | needs `uv`+network at setup; Claude Code config form unverified | SKIP until the CLI skill proves too clumsy |
| Knip — github.com/webpro-nl/knip (README) | 12.5k | 2026-10-17 | ISC | unused files/exports/deps; `@knip/mcp` exists | CLI | import-graph tool vs script-tag globals; adds a devDependency | TRY scoped |
| Repomix — github.com/yamadashy/repomix | 28.9k | 2026-10-18 | MIT | pack repo/subset to one file, `--compress` | CLI | huge packs unless `--ignore`d; never the hosted site | TRY low priority |
| Serena — github.com/oraios/serena (README) | 30.4k | 2026-10-15 | GPL-3 app / MIT LSP | LSP-backed symbol find/refs/rename | MCP | tool-list cost unknown; `.serena/` cache; weak cross-file refs on globals (unverified) | TRY (measure) |
| mcp-language-server — isaacphi/mcp-language-server | 1.6k | 2026-03-01 | BSD-3 | any LSP as MCP | MCP | Go toolchain; Serena better maintained | SKIP |
| TypeScript `checkJs` — microsoft/TypeScript | 111k | 2026-10 | Apache-2.0 | `tsc --noEmit` over JSDoc | CLI | tsc is already installed and used by `check-gctx.mjs`; a repo-wide `checkJs` would be a new gate over 100s of globals | SKIP (already partly in place; separate decision) |
| typescript-language-server | 2.6k | 2026-10 | Apache-2.0 | LSP backend | — | comes with Serena | SKIP |
| jscodeshift — facebook/jscodeshift | 10k | 2026-10-13 | MIT | AST codemods | CLI | recast reprints files; ratchet line counts | SKIP (ast-grep) |
| 0x — davidmarkclements/0x | 3.6k | 2025-09-30 | MIT | Node flamegraphs | CLI | Node only; stale-ish | SKIP |
| Clinic.js — clinicjs/node-clinic | 6k | 2024-09-19 | MIT | Node diagnostics | CLI | stale >12 mo | SKIP |
| Semgrep MCP — semgrep/mcp (README) | 685 | 2025-10-28 archived | MIT | Semgrep scan MCP | MCP | archived; cloud token for findings | SKIP |
| mcp-server-tree-sitter — wrale | 309 | 2026-05-21 archived | MIT | tree-sitter MCP | MCP | archived | SKIP |
| dependency-cruiser / Biome / oxc | 7k/26k/23k | 2026-10 | MIT | module graph / lint+format | CLI | module-graph tools share Knip's globals weakness; Biome/oxc add a second lint layer, **not evaluated** against our lint tools | SKIP (unevaluated) |

### Graphics

| Name / URL | ★ | push | lic | What | Plug | Conflict / trust | Verdict |
|---|---|---|---|---|---|---|---|
| glslang — KhronosGroup/glslang | 3.6k | 2026-10-16 | NOASSERTION (BSD-style + Khronos) | reference GLSL ES validator | unit test | needs apt/binary once; offline, no GPU | ADOPT |
| naga-cli — gfx-rs/wgpu | 18.3k | 2026-10-17 | Apache-2.0 | WGSL/GLSL/SPIR-V validate+convert | CLI | Rust toolchain/binary; rules differ slightly from Tint | TRY |
| Tint — google/dawn | — | — | BSD-3 (unverified) | Chrome's WGSL compiler | CLI | no standalone Linux binary verified | UNVERIFIED |
| Spector.js — BabylonJS/Spector.js | 1.6k | 2026-10-12 | MIT | WebGL frame capture | `renderer-debug` recipe | vendor bundle, dev only | TRY |
| glTF-Transform — donmccurdy/glTF-Transform | 2.0k | 2026-10-16 | MIT | glTF inspect/validate/optimise | `asset-pack` step | KTX2 step shells to toktx; changes to `assets/pack` go through `tools/gen/assets.mjs verify` | ADOPT read-only |
| meshoptimizer / gltfpack — zeux | 8.6k | 2026-10-14 | MIT | mesh compression | CLI | needs meshopt decoder in loaders (unverified) | SKIP |
| basis_universal — BinomialLLC | 3.1k | 2026-10-16 | Apache-2.0 | KTX2/UASTC encoder | CLI | touches all three backends; phone format support | SKIP until size is a measured problem |
| pixelmatch — mapbox/pixelmatch | 7k | 2026-10-06 | ISC | pixel diff | node helper | pixels are never an assertion source (AGENTS.md) | TRY review diffs only |
| odiff — dmtrKovalenko/odiff | 3.3k | 2026-10-13 | MIT | fast image diff | binary | per-platform binary | SKIP |
| vgpu — vercel-labs/vgpu (README) | 2.6k | 2026-10-16 | MIT | WebGPU lib; `npx vgpu check`, skill, MCP | CLI only | young (2026-05); library unused; hosted MCP is network | TRY `check` once; SKIP skill/MCP |
| webgpu_inspector — brendan-duncan | 374 | 2026-10-10 | MIT | WebGPU capture (extension) | — | needs real Chrome/GPU | SKIP |
| webgpu_inspector_mcp — lpenguin (README) | 0 | 2026-08-27 | none | 29-tool WebGPU Inspector MCP | MCP | no licence, 0★, own Chrome, ~29 tools | SKIP |
| CloudAI-X/threejs-skills (README) | 3.6k | 2026-07-09 | MIT | 10 three.js skills | skills | README clone commands point at another repo (supply-chain flag); assumes ES-module three | SKIP |
| lygia — patriciogonzalezvivo/lygia | 3.5k | 2026-09-14 | custom/NOASSERTION | shader function library | reference | non-standard licence vs shipped code | SKIP |
| blender-mcp — ahujasid | unverified | — | — | Blender MCP | MCP | needs Blender; no modelling pipeline | SKIP |

### Game design / UI

| Name / URL | ★ | push | lic | What | Plug | Conflict / trust | Verdict |
|---|---|---|---|---|---|---|---|
| axe-core — dequelabs/axe-core | 7.7k | 2026-10-15 | MPL-2.0 | WCAG rule engine | spec | `#game` excluded; in an existing group | ADOPT |
| @axe-core/playwright — dequelabs/axe-core-npm | 727 | 2026-10-17 | MPL-2.0 | `AxeBuilder` for specs | `tests/specs` + `groups.json` + TESTING.md row + `npm run gen` | one run with an existing group | ADOPT |
| axe MCP — dequelabs/axe-mcp-server-public (README) | 8 | 2026-10-13 | proprietary | scan+remediate MCP | MCP/Docker | paid key, opaque data flow | SKIP |
| stylelint | 11.5k | 2026-10-15 | MIT | CSS lint | `tools/check` | keep config minimal | TRY |
| Style Dictionary | 4.9k | 2026-10-16 | Apache-2.0 | token compiler | CLI | adds a build step | SKIP |
| Open Props — argyleink/open-props | 5.5k | 2026-10-11 | MIT | CSS token scales | reference | own tokens exist | SKIP (read for easing/shadow scales) |
| pa11y | 4.6k | 2026-10-13 | LGPL-3 | a11y CLI | — | own Puppeteer browser | SKIP |
| Penpot (+ `mcp/`) — penpot/penpot (README) | 61k | 2026-10-18 | MPL-2.0 | design tool + MCP | MCP | needs running instance; Node 22 | SKIP |
| Excalidraw MCP | 5.5k | 2026-03-24 | MIT | hosted diagram MCP | MCP | remote endpoint, no privacy text | SKIP |
| game-creator — PlayableIntelligence/game-creator (README) | 345 | 2026-10-17 | MIT | Phaser/three skills (polish, audio, QA) | read, cherry-pick | assumes Vite; outbound calls to here.now etc.; small unknown maintainer | TRY read-only |
| wshobson/agents `game-development` | 41k | 2026-10-17 | MIT | Unity/Minecraft plugins | plugin | Unity-centric; marketplace context cost | SKIP |
| cannon-es — pmndrs | ~2.1k | unverified | MIT | JS rigid bodies | reference | ESM; duplicates Rapier side-worlds | SKIP |
| Rapier — dimforge | 5.9k | 2026-10-17 | Apache-2.0 | physics; JS repo archived 2026-07-12 and moved into the Rust monorepo | docs check | **verify the debris-world Rapier pin is a maintained package** | TRY (pin check) |
| global_racetrajectory_optimization — TUMFTM | 619 | 2023-07-06 | LGPL-3 | min-curvature racing line | paper reference | stale; Python | SKIP (read for AI line maths) |
| tread — aunyks (Pacejka JS) | 2 | 2026-02-07 | unverified | tyre model | — | unproven | SKIP |

### Browser / agent workflow

| Name / URL | ★ | push | lic | What | Plug | Conflict / trust | Verdict |
|---|---|---|---|---|---|---|---|
| zizmor — zizmorcore/zizmor | 6.7k | 2026-10-18 | MIT | Actions security lint | CLI/`tooling-fast` | will flag existing workflows; triage first. Offline unless online audits (needs token) | ADOPT |
| actionlint — rhysd/actionlint | 4.3k | 2026-07-16 | MIT | workflow lint (+shellcheck) | CLI | none | ADOPT |
| claude-code-action — anthropics (README) | 9.6k | 2026-10-16 | MIT | Claude in Actions | workflow | second agent beside Merge Desk; needs `ANTHROPIC_API_KEY`; code goes to Anthropic; must be review-only, label-triggered, never fork PRs | TRY |
| claude-code-security-review — anthropics | 6.4k | 2026-02-11 | MIT | AI diff security review Action | workflow | stale; built-in `/security-review` exists | SKIP |
| anthropics/skills `webapp-testing` (README) | 182k repo | 2026-10-09 | per-skill | Python Playwright skill | skill | own Chromium, ignores the one-browser lock | SKIP (steal "recon then act") |
| anthropics/skills `skill-creator`, `mcp-builder` | — | — | per-skill | skill evals / MCP guide | already loaded | none | TRY skill-creator vs routing eval |
| reviewdog | 9.7k | 2026-10-18 | MIT | linter → PR comments | workflow | comment noise on draft-PR-as-log | SKIP |
| danger-js | 5.5k | 2026-10-01 | MIT | PR rule engine | CI | duplicates hooks/guards | SKIP |
| nektos/act | 72k | 2026-08-09 | MIT | local Actions | CLI | needs Docker; low fidelity | SKIP |
| Lighthouse CI — GoogleChrome | 7.1k | 2026-10-17 | Apache-2.0 | per-commit Lighthouse | CI | perf on SwiftShader is noise; `lighthouse_audit` already in chrome-devtools | SKIP |
| lighthouse-mcp (priyankark / danielsogl) | 211 / 72 | 2026-10 | MIT | Lighthouse MCPs | MCP | redundant, extra Chromium | SKIP |
| perfetto-mcp — antarikshc | 221 | 2026-04-10 | Apache-2.0 | Perfetto analysis MCP | MCP | Android focus; chrome-devtools has traces | SKIP |
| browser-use | 118k | 2026-10-17 | MIT | LLM browser agent | MCP/CLI | own browser + LLM, telemetry unverified | SKIP |
| Stagehand / mcp-server-browserbase | 25.7k | 2026-10-17 | MIT / Apache | cloud browser automation | — | third-party cloud; MCP archived | SKIP |
| promptfoo | 26k | 2026-10-18 | unverified | eval harness | CLI | API keys, model calls leave box | SKIP |
| MCP registry / punkpeye/awesome-mcp-servers / claude-plugins-official | 7.4k / 96k / 42k | 2026-10 | — | discovery | lookup | registry entries are self-published | TRY discovery only |

## Browser findings (no new MCP needed)

- **WebGPU headless flags.** Chrome's own guidance (developer.chrome.com/blog/supercharge-web-ai-testing) targets a real GPU:
  `--headless=new --enable-unsafe-webgpu --enable-features=Vulkan --use-angle=vulkan --disable-vulkan-surface`. A
  third-party Linux software preset (agent-browser.dev/webgpu) adds `--use-vulkan=swiftshader --use-webgpu-adapter=swiftshader`
  and may need `VK_ICD_FILENAMES` for the SwiftShader ICD. Not confirmed on our Chromium build: check
  `navigator.gpu.requestAdapter()` before believing it. `--use-angle=swiftshader` is the WebGL path, a different backend.
  Either way it is still a software probe, not GPU evidence (AGENTS.md; `gpu-census.yml` is the real signal).
- **Playwright built-ins**, from the agent's knowledge, not re-verified: `--only-changed` maps through imports and our specs
  load `js/` by script tag, so it under-selects (keep `pick-tests`/`select-specs`); trace viewer
  (`trace: 'retain-on-failure'`), `test.step`, and `toMatchAriaSnapshot` for menu/HUD assertions need no dependency.
  Check playwright.dev before relying on any flag.
- Already covered, do not add: Lighthouse (`chrome-devtools` `lighthouse_audit`), heap/CPU/trace
  (`chrome-devtools`, `apex_profile`), device emulation (Playwright presets), BrowserStack accessibility scan (connected).

## Rule conflicts that recur (so the next sweep skips them)

1. Anything spawning its own browser (browser-use, Stagehand, pa11y, webapp-testing, Lighthouse CI, webgpu_inspector_mcp):
   rules 4, 5, 10.
2. Anything adding a build/codegen step (Style Dictionary, Vite-based game kits): "No build step".
3. Anything sending diffs or page content to a third party (axe MCP, hosted vgpu MCP, claude-code-action w/o review-only).
4. ES-module / bundler assumptions (threejs-skills, cannon-es, game-creator templates).
5. MCP tool-list cost: nothing recommended here adds a server; Serena is the only MCP worth measuring.

## How to adopt the top 3

Each is a normal PR following the loop in AGENTS.md; none needs a browser group.

### 1–2. zizmor + actionlint (one PR)

1. Install in the SessionStart path or CI only as a pinned release binary (check the release page for the current version
   and checksum; do not `curl | sh`). Locally: `pip install zizmor` or the release tarball; actionlint: release tarball.
2. Add a new workflow-lint script under `tools/check/`: spawns `actionlint` and `zizmor --format plain .github/workflows`, **skips with a
   notice when a binary is absent** (same shape as `check-gctx.mjs`'s optional tsc leg), exit 1 on findings not in an
   allowlist file a baseline JSON under `tests/data/`.
3. First run will report existing findings: record them as the baseline in the same PR, one fix PR per real finding after.
   Check `who-is-on-it.mjs` first, since workflows are shared surface.
4. Wire into `package.json` test scripts via `tests/groups.json` → `npm run gen` (never hand-edit generated scripts), add a
   `docs/TESTING.md` §5 row, and a unit test with a fixture workflow. Verify: `node --test` the new test,
   `npm run test:tooling-fast`, `deploy.mjs --gate-only`.
5. Install in CI via a pinned step in the job that runs `tooling-fast` (the container lacks both binaries today).

### 3. ast-grep as a skill (no MCP)

1. Add `ast-grep` (npm `@ast-grep/cli` devDependency or release binary). Always invoke as `ast-grep`/`npx ast-grep`,
   **not `sg`** (`/usr/bin/sg` is the setgid utility here).
2. New project skill `.claude/skills/ast-grep/SKILL.md` (use `agent-config` for description budget and the routing eval;
   mirror to `.agents/skills` with `tools/env/mirror-skills.sh`). Content: read-only queries by default
   (`ast-grep run -l js -p 'Module.create($G)' js/`), rule files under `tools/ast-grep/rules/`, never `--update-all`
   on `js/` without `pick-tests` and the ratchets in mind, never rewrite a file listed as generated (rule 11).
3. Seed 3–4 rules that encode existing conventions: bare `console.*` (use `Log`), `Tracks.curvature(` call sites (the
   physics column table), `localStorage` keys without the `apex26.` prefix, `c.xOn` reads. Check each against the existing
   lints first (`vstd-lint.mjs` etc.) and keep only what they miss.
4. Verify: skill-routing eval via `agent-config`; `node --test tests/unit/agent-config.test.mjs`.

(Glslang, axe and glTF-Transform follow the same shape: optional-binary lint script or one spec in an existing group. They
are the next three PRs; write each as its own issue before starting.)

## Ideas that are cheap and need nothing installed

- Run `skill-creator`'s description-optimisation loop on the three skills with the weakest routing-eval scores.
- Read (do not install) game-creator's polish/audio references before the next game-feel pass (`tune-physics`).
- Pin check: the debris-world Rapier dependency vs the archived rapier JS-bindings repo.
