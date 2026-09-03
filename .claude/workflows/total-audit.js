export const meta = {
  name: 'total-audit',
  description: 'Loop-until-dry lens-diverse audit of ALL code and ALL docs (cap 3 rounds), adversarially verified',
  whenToUse: 'Periodic whole-tree health sweep. Optional args: {known: ["file:line — claim"...] do-not-re-report list, knownKeys: [], maxGap: 8}.',
  phases: [
    { title: 'Find 1', detail: '19 domain finders, every file read in full' },
    { title: 'Verify 1', detail: '2 independent skeptics per finder batch, tiebreak on splits' },
    { title: 'Critic', detail: 'completeness critic names uncovered lenses' },
    { title: 'Find 2', detail: 'critic-driven gap finders' },
    { title: 'Verify 2', detail: 'same adversarial panel' },
    { title: 'Find 3', detail: 'final round if round 2 still yielded' },
    { title: 'Verify 3', detail: 'same adversarial panel' },
    { title: 'Synthesize', detail: 'dedup, prioritize, cross-reference the standing synthesis' },
  ],
}

const A = typeof args === 'string' ? JSON.parse(args) : (args || {})
const KNOWN = (A.known || []).map((k, i) => `${i + 1}. ${k}`).join('\n') || '(none supplied this run)'

const COMMON = `Repo: current workspace (check \`git branch --show-current\` if you need the branch — do not assume). STRICTLY READ-ONLY — never edit a file, never run Playwright/browser tests or any npm script (4-core box, flat prohibition); node --check is fine. Browser test runs may be in flight in the main session — never touch artifacts/logs or test processes.
Project shape: no-build IIFE modules, one global per file, load order in tools/manifest.cjs; AGENTS.md is the engineering reference (CLAUDE.md is a stub that imports it); docs/ splits into reference / research / archive. tests/ per-file semantics are OUT OF SCOPE (a dedicated audit is running) — do not audit test files.
KNOWN FINDINGS — already recorded, queued, or deliberately deferred. Do NOT re-report these or trivial variants of them:
${KNOWN}`

const RUBRIC = `Report findings of these kinds, each with real evidence you read yourself:
- bug: code would misbehave at runtime (wrong value, wrong branch, race, leak).
- dead-code: unreachable, write-only, or unused exports/branches/CSS.
- drift: a comment/doc/string says X, the code does Y. Cite both sides.
- contradiction: two live sources disagree (doc vs doc, comment vs comment, string vs table).
- duplication: the same non-trivial logic hand-written in 3+ places.
- mess: structural incoherence a maintainer would trip on (misplaced responsibility, misleading name, inconsistent idiom that invites bugs).
severity: high = user-visible misbehaviour, silently-wrong guard/tool, or agents/docs actively taught something false; low = everything else.
Be precise: file, 1-indexed line, one-sentence claim, the evidence (quote or describe exactly what you read at that line), a one-line fix. NO speculation — if you did not read the line, do not cite it. An empty findings list is a valid, honest answer.`

const FINDINGS_SCHEMA = {
  type: 'object', required: ['findings', 'filesRead'],
  properties: {
    filesRead: { type: 'number' },
    findings: { type: 'array', items: {
      type: 'object', required: ['file', 'line', 'kind', 'severity', 'claim', 'evidence', 'fix'],
      properties: {
        file: { type: 'string' }, line: { type: 'number' },
        kind: { enum: ['bug', 'dead-code', 'drift', 'contradiction', 'duplication', 'mess'] },
        severity: { enum: ['high', 'low'] },
        claim: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' },
      } } } },
}

const VERDICTS_SCHEMA = {
  type: 'object', required: ['verdicts'],
  properties: { verdicts: { type: 'array', items: {
    type: 'object', required: ['index', 'refuted', 'reason'],
    properties: { index: { type: 'number' }, refuted: { type: 'boolean' }, reason: { type: 'string' } },
  } } },
}

const R1 = [
  { k: 'game-core',    scope: 'js/game.js — the entire file, all ~8k lines. Emphases: dead branches, state-machine coherence, G-facade accessors that nothing consumes, comment drift around the extraction seams.' },
  { k: 'game-mod-abc', scope: 'every js/game/ file whose basename starts with a, b or c (agentview*, apex, ariastate, atmosphere, audio, bodyattitude, cam-*, cameras, career*, carmesh — ls js/game/ to enumerate).' },
  { k: 'game-mod-dm',  scope: 'every js/game/ file whose basename starts with d through m (debrisworld, hud, incidentsim, input, light-*, lighting, menunav, menus, music-lib — ls js/game/ to enumerate).' },
  { k: 'game-mod-nz',  scope: 'every js/game/ file whose basename starts with n through z (particles through uilayers — ls js/game/ to enumerate).' },
  { k: 'track-core',   scope: 'every js/track/ file EXCEPT scenery-*.js (tracks, spline, mesh, geom, graph, space, surface, models, themes, landmark-kit, circuit-kit, maps).' },
  { k: 'track-scenery', scope: 'js/track/scenery-data.js, scenery-nature.js, scenery-city.js, scenery-structures.js, scenery-identity.js — the buildProps split behind the 109-member frozen contract (docs/SCENERY-API.md).' },
  { k: 'circuits-1',   scope: 'the FIRST 20 files of ls js/circuits/ | sort. Emphasis: pattern consistency across circuit defs — same keys used the same way, stale comments, copy-paste residue from a sibling circuit. The 2026-08 audit never line-read ~20 of the 40 circuit scenery(api) callbacks — treat each scenery callback as FIRST-READ: grounding calls, placement args, side/sign conventions (+k = LEFT), s-ranges vs track.total.' },
  { k: 'circuits-2',   scope: 'the LAST 20 files of ls js/circuits/ | sort. Same emphases as circuits-1, including the first-read scenery(api) callback treatment.' },
  { k: 'render-glx',   scope: 'js/render/gfx.js, glx.js, everything under js/render/glx/ and js/render/shaders/, gltf.js, assets.js. Emphasis: shader-uniform drift, header truth, the Gfx seam contract.' },
  { k: 'render-alt',   scope: 'js/render/three/ EXCLUDING vendor/, and js/render/webgpu/. Emphasis: parity claims vs reality, descriptor-copy installation, frozen-backend drift. vendor/three-0.185.1 is vendored — do not audit it.' },
  { k: 'net',          scope: 'every js/net/ file plus worker/. Emphasis: wire-format comments vs code, handshake state machines, the host-authority rules in docs/MULTIPLAYER.md vs implementation.' },
  { k: 'data',         scope: 'every js/data/ file. Emphasis: cache TTLs vs prose, tab lifecycle, API-client error paths, write-only state.' },
  { k: 'car',          scope: 'every js/car/ file plus js/core/mat4.js and js/core/log.js. Emphasis: catalog/table coherence (parts vs docs/PARTS.md), driver-ratings keys vs teams.js codes, log namespace discipline.' },
  { k: 'shell',        scope: 'index.html (all of it), every css/ file, sw.js, manifest.json, version.json. Emphasis: dead selectors, ?v= coherence, DOM ids referenced by no JS, precache derivation, aria/text truth.' },
  { k: 'tools-1',      scope: 'every tools/ file whose basename starts with a through m, plus tools/README.md rows for them. Emphasis: does each tool still run against the current layout; stale ROOT assumptions; index truth.' },
  { k: 'tools-2',      scope: 'every tools/ file whose basename starts with n through z, plus their tools/README.md rows. Same emphases.' },
  { k: 'docs-ref',     scope: 'every docs/*.md at the top level (the engineering reference). For EACH factual claim naming a file, symbol, count or behaviour, verify it against the source it describes; report every falsehood as drift with both sides cited. For each concrete claim (command, path, count, group name, hook, branch, cache rule) check it against the tree (package.json scripts, tools/pick-tests.mjs, the named source file, tests/unit/ counts) and report DOC-DRIFT file:line OLD:"…" LIVE:"…" severity stale|blocker|nit — this replaces the retired doc-drift-auditor subagent.' },
  { k: 'docs-idx',     scope: 'docs/research/ (all files), docs/archive/ INDEX-level only (does docs/README.md describe what is actually there; are "cited from source" claims true — grep for the citations), AGENTS.md, CLAUDE.md stub, README.md, and every .claude/skills/*/SKILL.md. Emphasis: broken paths, false citations, stale commands. For each concrete claim (command, path, count, group name, hook, branch, cache rule) check it against the tree (package.json scripts, tools/pick-tests.mjs, the named source file, tests/unit/ counts) and report DOC-DRIFT file:line OLD:"…" LIVE:"…" severity stale|blocker|nit — this replaces the retired doc-drift-auditor subagent.' },
  { k: 'meta',         scope: 'spike/ (both READMEs + html), assets/ (pack manifests/licences, not binaries), package.json, playwright.config.js, .github/workflows/, tools/manifest.cjs cross-checked against index.html script tags. Emphasis: scripts that reference missing files, CI truth, licence hygiene.' },
]

const bucket = (f) => `${f.file}:${f.kind}:${Math.round((f.line || 0) / 20)}`
const seen = new Set()
for (const k of (A.knownKeys || [])) seen.add(k)

const finderPrompt = (scope, round) => `${COMMON}
You are a ROUND-${round} AUDITOR. Your scope: ${scope}
Read every in-scope file IN FULL (large files too — read them in chunks until you have read all of it). Then report.
${RUBRIC}`

const refutePrompt = (batch, who) => `${COMMON}
You are ADVERSARIAL SKEPTIC ${who}. Below are findings from one auditor. For EACH, open the cited file at the cited line YOURSELF and try to REFUTE it. Refute (refuted=true) if: the claim misreads the code; the cited line does not say what is claimed; the behaviour is a deliberate, documented choice (check AGENTS.md and docs/ before deciding); it duplicates a KNOWN finding above; or it is immaterial style noise no maintainer would act on. Default to refuted=true when uncertain — only findings that survive hostile reading matter. Return one verdict PER finding, index-aligned.
FINDINGS: ${'$'}{JSON.stringify(batch)}`

async function verifyBatch(fresh, round) {
  if (!fresh.length) return []
  const compact = fresh.map((f, i) => ({ index: i, file: f.file, line: f.line, kind: f.kind, severity: f.severity, claim: f.claim, evidence: f.evidence }))
  const votes = await parallel([1, 2].map((who) => () =>
    agent(refutePrompt(compact, who).replace('${JSON.stringify(batch)}', JSON.stringify(compact)),
      { label: `verify${round}:${fresh[0].file.split('/').pop()}+${fresh.length}`, phase: `Verify ${round}`, schema: VERDICTS_SCHEMA, effort: 'medium' })))
  const good = votes.filter(Boolean)
  if (!good.length) return []
  const refCount = fresh.map(() => 0), heard = fresh.map(() => 0)
  for (const v of good) for (const verdict of v.verdicts) {
    if (verdict.index >= 0 && verdict.index < fresh.length) { heard[verdict.index]++; if (verdict.refuted) refCount[verdict.index]++ }
  }
  const out = []
  for (let i = 0; i < fresh.length; i++) {
    const f = fresh[i]
    if (heard[i] === 0) continue
    if (f.severity === 'high' && good.length === 2 && refCount[i] === 1) {
      const tie = await agent(refutePrompt([compact[i]], 3).replace('${JSON.stringify(batch)}', JSON.stringify([compact[i]])),
        { label: `tiebreak${round}:${f.file.split('/').pop()}:${f.line}`, phase: `Verify ${round}`, schema: VERDICTS_SCHEMA, effort: 'high' })
      const t = tie && tie.verdicts && tie.verdicts[0]
      if (t) { heard[i]++; if (t.refuted) refCount[i]++ }
    }
    const kill = f.severity === 'high' ? refCount[i] >= 2 : refCount[i] >= 1
    if (!kill) out.push({ ...f, skepticsHeard: heard[i], refutes: refCount[i] })
  }
  return out
}

const confirmed = []
const coverage = R1.map((r) => r.k)
let gapPrompts = null

for (let round = 1; round <= 3; round++) {
  const prompts = round === 1
    ? R1.map((r) => ({ label: `find:${r.k}`, text: finderPrompt(r.scope, round) }))
    : (gapPrompts || []).map((g, i) => ({ label: `find${round}:gap${i + 1}`, text: finderPrompt(g, round) }))
  if (!prompts.length) { log(`round ${round}: no prompts — stopping`); break }
  log(`round ${round}: ${prompts.length} finders`)

  const roundConfirmed = await pipeline(
    prompts,
    (p) => agent(p.text, { label: p.label, phase: `Find ${round}`, schema: FINDINGS_SCHEMA }),
    (res) => {
      if (!res || !res.findings) return []
      const fresh = []
      for (const f of res.findings) {
        const key = bucket(f)
        if (seen.has(key)) continue
        seen.add(key); fresh.push(f)
      }
      return verifyBatch(fresh, round)
    },
  )
  const flat = roundConfirmed.filter(Boolean).flat()
  log(`round ${round}: ${flat.length} findings survived the skeptics`)
  if (!flat.length) break
  confirmed.push(...flat)
  if (round === 3) break

  const critic = await agent(`${COMMON}
You are the COMPLETENESS CRITIC. Rounds so far covered these scopes: ${JSON.stringify(coverage)}. Confirmed findings so far (file/kind/claim): ${JSON.stringify(confirmed.map((f) => ({ file: f.file, kind: f.kind, claim: f.claim })))}
Name what an exhaustive audit is STILL missing — cross-cutting lenses no domain slice covers. Candidates to consider (drop any that are already well covered, add your own): G-facade accessor coherence between game.js and its modules; localStorage apex26.* key schema coherence; window.__apex hooks vs docs/DEBUG-HOOKS.md truth; silent catch blocks swallowing errors; event-listener/interval leaks across screen transitions; determinism (__apex.seed) leak paths; postMessage/WebRTC/Nostr input validation; hot-path allocation churn; aria/accessibility contract vs AriaState; cache-bust ?v= coherence across index.html/sw.js/version.json.
Return up to ${(A.maxGap || 8)} gap prompts, EACH a self-contained auditor instruction (scope + files to read + lens). Return an EMPTY list if the audit is genuinely saturated.`,
    { label: 'critic', phase: 'Critic', effort: 'high', schema: { type: 'object', required: ['gapPrompts'], properties: { gapPrompts: { type: 'array', items: { type: 'string' } } } } })
  gapPrompts = critic ? critic.gapPrompts.slice(0, (A.maxGap || 8)) : []
  coverage.push(...gapPrompts.map((g, i) => `round${round + 1}-gap${i + 1}: ${g.slice(0, 80)}`))
}

const synthesis = await agent(`${COMMON}
You are the SYNTHESIZER. Below are ${'$'}{0} adversarially-verified findings from a whole-tree audit (code + docs). Write ONE markdown report:
1. "## Verdict" — 3-6 sentences: how healthy is this tree after the cleanup campaign, where does the remaining mess concentrate.
2. "## Fix now" — findings worth immediate commits, ordered by severity, each as "file:line — claim → fix". Batch them: which are js/ (need one cache bump), which are docs/tools (no bump).
3. "## Feed the restructure" — findings the W2 restructure (R1 audio-panel, R2 tests/ split, R3 tools/ subdirs — read docs/archive/research/AUDIT-SYNTHESIS-2026-08.md RESTRUCTURE section) should fold in, mapped to the wave that absorbs them.
4. "## Defer" — real but not now, with reasons.
5. "## Coverage" — what was audited (the scopes), what round-N critics added, and what remains genuinely unaudited.
Cross-reference: where a finding extends or corrects docs/archive/research/AUDIT-SYNTHESIS-2026-08.md, say so explicitly. Do not invent findings not in the list; do not drop any confirmed finding — every one lands in exactly one of sections 2-4.
FINDINGS: ${'$'}{JSON.stringify(confirmed)}`.replace("${0}", String(confirmed.length)).replace('${JSON.stringify(confirmed)}', JSON.stringify(confirmed)),
  { label: 'synthesize', phase: 'Synthesize', effort: 'high' })

return { report: synthesis, confirmed, totalConfirmed: confirmed.length, coverage }