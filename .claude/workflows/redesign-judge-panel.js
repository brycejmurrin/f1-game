export const meta = {
  name: 'redesign-judge-panel',
  description: 'Three independent architecture redesigns for Apex 26, judged against explicit criteria, synthesized into one recommendation',
  whenToUse: 'Judge panel over competing architecture designs; kept for provenance and reuse on the next big design question.',
  phases: [
    { title: 'Design', detail: '3 designers with different priors' },
    { title: 'Judge', detail: '2 judges score all designs against fixed criteria' },
    { title: 'Synthesize', detail: 'winner + grafted best ideas' },
  ],
}

const COMMON = `Repo: /home/user/f1-game (READ-ONLY — no edits, no test runs, no browsers).
Context: an unofficial WebGL2 F1 fan game. ~156 JS files, no build step, every file a "use strict" IIFE assigning one global; load order hand-maintained in tools/manifest.cjs mirrored by index.html script tags; a ~7,943-line js/game.js owns all closure state and hands extracted modules a "G" façade of live getters/setters (Module.create(G)); three renderer backends installed by descriptor-copy onto the GLX global; 111 Playwright specs + 76 unit suites; a family of structural guard tests substitutes for a compiler (load-order, docs-integrity, contract freezes, ratchets). Read docs/ARCHITECTURE-REVIEW.md (the standing review: the founding bet, the governing law "what a test asserts stays true; what only prose says drifts", open defects, backlog), docs/ARCHITECTURE.md, AGENTS.md, tools/manifest.cjs, and skim js/game.js's G façade region (~lines 2540-2770) plus one or two js/game/ modules to ground yourself. The codebase is heavily developed BY AI AGENTS in parallel sessions — the architecture must protect against agents drifting out of sync, which is the root cause of most historical damage. Constraints that are non-negotiable: GitHub Pages static hosting; physics determinism (tests/specs/physics-characterization.spec.js pins bit-stable laps; render()/updateCar() must not be carved up); the game must keep working on phones; the existing test suite is the safety net and must survive any migration incrementally (no big-bang rewrite — the repo's mess came from exactly that kind of unsynchronized bulk change).`

const DESIGN_SCHEMA = {
  type: 'object', required: ['name', 'thesis', 'moduleSystem', 'stateDesign', 'rendererSeam', 'guardsRetired', 'guardsKept', 'migrationPlan', 'risks', 'costEstimate'],
  properties: {
    name: { type: 'string' }, thesis: { type: 'string' },
    moduleSystem: { type: 'string' }, stateDesign: { type: 'string' },
    rendererSeam: { type: 'string' },
    guardsRetired: { type: 'array', items: { type: 'string' } },
    guardsKept: { type: 'array', items: { type: 'string' } },
    migrationPlan: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    costEstimate: { type: 'string' },
  },
}
const SCORE_SCHEMA = {
  type: 'object', required: ['scores', 'bestIdeasPerDesign', 'verdict'],
  properties: {
    scores: { type: 'array', items: { type: 'object', required: ['design', 'agentSafety', 'noBuildEthos', 'migrationRisk', 'determinism', 'payoffPerEffort', 'total', 'reason'],
      properties: { design: { type: 'string' }, agentSafety: { type: 'number' }, noBuildEthos: { type: 'number' }, migrationRisk: { type: 'number' }, determinism: { type: 'number' }, payoffPerEffort: { type: 'number' }, total: { type: 'number' }, reason: { type: 'string' } } } },
    bestIdeasPerDesign: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string' },
  },
}

const DESIGNERS = [
  { key: 'esm-nobuild', brief: 'PRIOR: keep ZERO build step but adopt native ES modules + import maps (the repo already uses an importmap for vendored three.js). Globals become exports; the import graph replaces tools/manifest.cjs and HARD_EDGES; JSDoc + tsc --checkJs --noEmit in CI provides types without compilation; sw.js precache regenerated from a module list. Design the state layer (what replaces the G god-object), the renderer seam (replace descriptor-copy with a real port interface), and a leaf-first strangler migration with a window-global bridge shim so unconverted IIFEs keep working at every step.' },
  { key: 'ts-vite', brief: 'PRIOR: accept a MINIMAL build step (Vite or esbuild, TypeScript) as the honest fix — the guard suite is a hand-built compiler and the project pays for it daily. Argue where the no-build bet stops paying for an agent-developed codebase; design the TS module/state/renderer architecture, source maps + deploy pipeline on GitHub Pages, and an incremental JS-allowed→TS migration that keeps every Playwright spec green throughout. Be honest about what breaks (cache-bust scheme, __apex debug surface, the "file you edit is the file that runs" property) and how you compensate.' },
  { key: 'harden-iife', brief: 'PRIOR: the IIFE+globals architecture is FINE for this project size — the mess came from process, not architecture. Design the maximal hardening WITHOUT changing the module system: dissolve G into a few owned state objects with documented ownership; a generated (not hand-written) manifest; stronger contract freezes; typed JSDoc checked in CI over the existing IIFEs; the renderer port formalized while keeping descriptor-copy compat; conventions promoted into guards. Argue why migration-free beats both ESM and TS options on payoff-per-risk for a fan game maintained by agents.' },
]

phase('Design')
log('3 designers working from different priors')
const designs = (await parallel(DESIGNERS.map((d) => () => agent(
  `${COMMON}\n\nYou are one of three independent architects. ${d.brief}\n\nProduce a COMPLETE, decisive redesign per the schema. migrationPlan must be ordered concrete steps each leaving the suite green. Be specific to THIS repo (name real files/guards), not generic.`,
  { label: `design:${d.key}`, phase: 'Design', schema: DESIGN_SCHEMA, effort: 'high' }
)))).filter(Boolean)

phase('Judge')
const judged = (await parallel(['pragmatist', 'agent-operations'].map((lens) => () => agent(
  `${COMMON}\n\nYou are a JUDGE (${lens} lens: ${lens === 'pragmatist' ? 'total cost vs real payoff for a solo-owner fan game; migration risk given the test suite' : 'which design best prevents the historical failure mode — parallel AI agent sessions drifting out of sync — and best serves agents as the primary contributors'}). Score each design 1-10 on: agentSafety (compiler/tooling-enforced boundaries vs conventions), noBuildEthos (preserves what the no-build bet actually buys), migrationRisk (10 = safest), determinism (10 = physics untouched), payoffPerEffort. Extract the single best idea from EACH design worth keeping regardless of the winner. DESIGNS: ${JSON.stringify(designs)}`,
  { label: `judge:${lens}`, phase: 'Judge', schema: SCORE_SCHEMA, effort: 'high' }
)))).filter(Boolean)

phase('Synthesize')
const synthesis = await agent(
  `${COMMON}\n\nYou are the SYNTHESIZER. Given three designs and two judges' scores, produce the final recommendation in markdown: (1) the winning direction and WHY (use the scores); (2) the synthesized architecture — winner plus the grafted best ideas from the runners-up; (3) a phased migration plan specific to this repo, each phase leaving the suite green, with which guard tests retire at which phase; (4) an honest "when NOT to do this" paragraph. Decisive, concrete, no padding.\nDESIGNS: ${JSON.stringify(designs)}\nJUDGES: ${JSON.stringify(judged)}`,
  { label: 'synthesize', phase: 'Synthesize', effort: 'high' }
)

return { synthesis, designs: designs.map((d) => d.name), judged }