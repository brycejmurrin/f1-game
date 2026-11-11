export const meta = {
  name: 'total-audit',
  description: 'Loop-until-dry lens-diverse audit of ALL code and ALL docs (cap 3 rounds), adversarially verified',
  whenToUse: 'Periodic whole-tree health sweep. Optional args: {known: ["file:line — claim"...] do-not-re-report list, knownKeys: [], maxGap: 8}.',
  phases: [
    { title: 'Prior art', detail: 'prior-art-scout — seeds the do-not-re-report list when args.known is empty (one call)', model: 'haiku' },
    { title: 'Slice plan', detail: 'haiku — lists js/ dirs and every circuit at run time (args.plan skips it)', model: 'haiku' },
    { title: 'Find 1', detail: 'domain finders, every file read in full — code-hunter slices tiered by reading shape (haiku on data, sonnet on domains, opus on the engine), docs-ref on the default agent, docs-idx on surface-reviewer; circuits chunked from the slice plan; the run logs how many agents it spawned' },
    { title: 'Verify 1', detail: '2 independent finding-verifier skeptics per ≤15-claim chunk, finding-verifier tiebreak on splits' },
    { title: 'Critic', detail: 'completeness critic names uncovered lenses' },
    { title: 'Find 2', detail: 'critic-driven code-hunter gap finders' },
    { title: 'Verify 2', detail: 'same adversarial panel' },
    { title: 'Find 3', detail: 'final round if round 2 still yielded' },
    { title: 'Verify 3', detail: 'same adversarial panel' },
    { title: 'Synthesize', detail: 'dedup, prioritize, cross-reference the standing synthesis' },
  ],
}

const A = typeof args === 'string' ? JSON.parse(args) : (args || {})
// Every spawn goes through spawn() so the run can state how many agents it started.
let spawned = 0
const spawn = (prompt, opts) => { spawned++; return agent(prompt, opts) }

// The custom agents (code-hunter, finding-verifier, prior-art-scout,
// surface-reviewer) carry their own read-only rules, tool limits and
// row formats in .claude/agents/; their prompts pass only the slice, the lens
// and the claims. COMMON is for the default-agent stages.

const SHAPE = `tests/ per-file semantics are OUT OF SCOPE (a dedicated audit owns them) — do not audit test files. vendor/ is vendored — never audit it.`

const COMMON_BASE = `Repo: current workspace (check \`git branch --show-current\` if you need the branch — do not assume). STRICTLY READ-ONLY — never edit a file, never run Playwright/browser tests or any npm script (4-core box, flat prohibition); node --check is fine. Browser test runs may be in flight in the main session — never touch artifacts/logs or test processes.
Project shape: no-build IIFE modules, one global per file, load order in tools/manifest.cjs; AGENTS.md is the engineering reference (CLAUDE.md is a stub that imports it); docs/ splits into reference / research / archive. ${SHAPE}`

const RUBRIC = `Report findings of these kinds, each with real evidence you read yourself:
- bug: code would misbehave at runtime (wrong value, wrong branch, race, leak).
- dead-code: unreachable, write-only, or unused exports/branches/CSS.
- drift: a comment/doc/string says X, the code does Y. Cite both sides.
- contradiction: two live sources disagree (doc vs doc, comment vs comment, string vs table).
- duplication: the same non-trivial logic hand-written in 3+ places.
- mess: structural incoherence a maintainer would trip on (misplaced responsibility, misleading name, inconsistent idiom that invites bugs).
severity: high = user-visible misbehaviour, silently-wrong guard/tool, or agents/docs actively taught something false; low = everything else.`

const PRECISION = `Be precise: file, 1-indexed line, one-sentence claim, the evidence (quote or describe exactly what you read at that line), a one-line fix. NO speculation — if you did not read the line, do not cite it. An empty findings list is a valid, honest answer.`

const KNOWN_SCHEMA = {
  type: 'object', required: ['known'],
  properties: { known: { type: 'array', items: { type: 'string' }, description: 'One KNOWN row per string, in your row format.' } },
}

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
    // needsBrowser: only a rendered or driven run can settle it (pixels, frame time, a GPU path, live input).
    // Such a claim is REPORTED under its own heading, never counted as refuted (plan §4.6).
    properties: { index: { type: 'number' }, refuted: { type: 'boolean' }, needsBrowser: { type: 'boolean' }, reason: { type: 'string' } },
  } } },
}

// code-hunter's card pins sonnet; a slice's reading shape still picks the tier at spawn
// (code-survey.js has the same table): low → haiku, medium → sonnet, high → opus.
const TIER_MODEL = { low: 'haiku', medium: 'sonnet', high: 'opus' }

// agentType: omitted = code-hunter; null = the default workflow agent (a
// docs-truth slice, not code); docs-idx is the agent-surface lens. `e` is the
// code-hunter effort tier (TIER_MODEL picks the model).
const R1 = [
  { k: 'game-core', dirs: [],    e: 'high', scope: `js/game.js — the entire file (\`wc -l js/game.js\` first; it grows weekly). Emphases: dead branches, state-machine coherence, G-facade accessors that nothing consumes, comment drift around the extraction seams.` },
  { k: 'game-mod-abc', dirs: ['js/agent/', 'js/audio/', 'js/camera/', 'js/car/', 'js/career/'], e: 'medium', scope: 'every file under js/agent/, js/audio/, js/camera/, js/car/ and js/career/ (ls each to enumerate). NOTE: js/game/ was dissolved into these domain directories in the 2026-09 restructure — a scope naming js/game/ reads nothing and reports a clean tree it never opened.' },
  { k: 'game-mod-dm', dirs: ['js/core/', 'js/data/', 'js/fx/', 'js/garage/', 'js/input/', 'js/lighting/'],  e: 'medium', scope: 'every file under js/core/, js/data/, js/fx/, js/garage/, js/input/ and js/lighting/ (ls each to enumerate; js/lighting/presets.js is generated data — skim, do not line-read).' },
  { k: 'game-mod-nz', dirs: ['js/perf/', 'js/physics/', 'js/race/', 'js/ui/'],  e: 'high', scope: 'every file under js/perf/, js/physics/, js/race/ and js/ui/ (ls each to enumerate).' },
  { k: 'track-core', dirs: ['js/track/'],   e: 'high', scope: 'js/track/tracks.js, js/track/circuit-elevations.js and everything under js/track/core/ (spline, mesh, geom, space, surface, line, pit).' },
  { k: 'track-scenery', dirs: ['js/track/'], e: 'medium', scope: 'everything under js/track/scenery/ (data, models, graph, themes, landmark-kit, circuit-kit, nature, structures, city, identity, pits) — the buildProps split behind the frozen scenery(api) contract (docs/SCENERY-API.md).' },
  { k: 'render-glx', dirs: ['js/render/'],   e: 'high', scope: 'js/render/gfx.js, glx.js, everything under js/render/glx/ (including glx/shaders/) and js/render/shared/. Emphasis: shader-uniform drift, header truth, the Gfx seam contract.' },
  { k: 'render-alt', dirs: ['js/render/'],   e: 'high', scope: 'js/render/three/ EXCLUDING vendor/, and js/render/webgpu/. Emphasis: parity claims vs reality, descriptor-copy installation, frozen-backend drift. The three.js build under vendor/ is vendored — do not audit it.' },
  { k: 'net', dirs: ['js/net/'],          e: 'high', scope: 'every js/net/ file plus worker/. Emphasis: wire-format comments vs code, handshake state machines, the host-authority rules in docs/MULTIPLAYER.md vs implementation.' },
  { k: 'data', dirs: ['js/data/'],         e: 'medium', scope: 'every js/data/ file. Emphasis: cache TTLs vs prose, tab lifecycle, API-client error paths, write-only state.' },
  { k: 'car', dirs: ['js/car/'],          e: 'medium', scope: 'every js/car/ file plus js/core/mat4.js and js/core/log.js. Emphasis: catalog/table coherence (parts vs docs/CAREER.md §Upgrade parts), driver-ratings keys vs teams.js codes, log namespace discipline.' },
  { k: 'shell', dirs: [],        e: 'low', scope: 'index.html (all of it), every css/ file, sw.js, manifest.json, version.json. Emphasis: dead selectors, ?v= coherence, DOM ids referenced by no JS, precache derivation, aria/text truth.' },
  { k: 'tools-1', dirs: [],      e: 'medium', scope: 'every tools/ file whose basename starts with a through m, plus tools/README.md rows for them. Emphasis: does each tool still run against the current layout; stale ROOT assumptions; index truth.' },
  { k: 'tools-2', dirs: [],      e: 'medium', scope: 'every tools/ file whose basename starts with n through z, plus their tools/README.md rows. Same emphases.' },
  { k: 'docs-ref', dirs: [],     agentType: null, scope: 'every docs/*.md at the top level (the engineering reference). For EACH factual claim naming a file, symbol, count or behaviour, verify it against the source it describes; report every falsehood as drift with both sides cited. For each concrete claim (command, path, count, group name, hook, branch, cache rule) check it against the tree (package.json scripts, tools/ci/pick-tests.mjs, the named source file, tests/unit/ counts) and report DOC-DRIFT file:line OLD:"…" LIVE:"…" severity stale|blocker|nit — this replaces the retired doc-drift-auditor subagent.' },
  { k: 'docs-idx', dirs: [],     agentType: 'surface-reviewer', scope: 'docs/research/ (all files), docs/archive/ INDEX-level only (does docs/README.md describe what is actually there; are "cited from source" claims true — grep for the citations), AGENTS.md, CLAUDE.md stub, README.md, and every .claude/skills/*/SKILL.md. Emphasis: broken paths, false citations, stale commands. For each concrete claim (command, path, count, group name, hook, branch, cache rule) check it against the tree (package.json scripts, tools/ci/pick-tests.mjs, the named source file, tests/unit/ counts) and report DOC-DRIFT file:line OLD:"…" LIVE:"…" severity stale|blocker|nit — this replaces the retired doc-drift-auditor subagent.' },
  { k: 'js-misc', dirs: ['js/assets/', 'js/editor/', 'js/overlay/', 'js/share/', 'js/workers/', 'js/xr/'], e: 'medium', scope: 'every file under js/assets/, js/editor/, js/overlay/, js/share/, js/workers/ and js/xr/ (ls each to enumerate). Emphases: comment and doc drift, write-only state, modules nothing loads (tools/manifest.cjs), teardown that never runs.' },
  { k: 'meta', dirs: [],         e: 'low', scope: 'spike/ (both READMEs + html), assets/ (pack manifests/licences, not binaries), package.json, playwright.config.js, .github/workflows/, tools/manifest.cjs cross-checked against index.html script tags. Emphasis: scripts that reference missing files, CI truth, licence hygiene.' },
]

// ── Slice plan: the circuit list and js/ dir set are LISTED at run time (args.plan or one haiku step), never
// hard-coded — a static first/last-N split left a dozen circuits unread. Each R1 slice declares the js/
// dirs it owns (`dirs:`; tests/unit/agent-surface.test.mjs checks they cover every js/ dir); a dir the plan finds
// that no slice owns gets a slice of its own.
const PLAN_SCHEMA = {
  type: 'object', required: ['jsDirs', 'circuits'],
  properties: {
    jsDirs: { type: 'array', items: { type: 'string' }, description: 'each `ls -d js/*/` line, e.g. "js/net/"' },
    circuits: { type: 'array', items: { type: 'string' }, description: 'each circuit id: the basename of each `ls js/circuits/*.js` file without .js' },
  },
}
const CIRCUIT_CHUNK = 12   // a circuit is a PAIR of files (def + scenery callback)
const chunk = (xs, n) => { const out = []; for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n)); return out }
phase('Slice plan')
const PLAN = A.plan || await spawn(`Mechanical listing, no judgement, read no file. Run exactly \`ls -d js/*/\` and \`ls js/circuits/*.js\` and return their lines (circuits as bare ids).`,
  { label: 'slice-plan', phase: 'Slice plan', model: 'haiku', effort: 'low', schema: PLAN_SCHEMA })
const PLANNED = []
const notCovered = []
if (PLAN && PLAN.circuits && PLAN.circuits.length) {
  chunk(PLAN.circuits, CIRCUIT_CHUNK).forEach((ids, i) => PLANNED.push({ k: `circuits-${i + 1}`, e: 'low', scope: `these circuits, each a PAIR read in full — the def js/circuits/<id>.js and its dressing closure js/circuits/scenery/<id>.js: ${ids.join(', ')}. Emphasis: pattern consistency across circuit defs — same keys used the same way, stale comments, copy-paste residue from a sibling circuit. Treat each scenery callback as FIRST-READ: grounding calls, placement args, side/sign conventions (+k = LEFT), s-ranges vs track.total.` }))
  const owned = new Set(R1.flatMap((r) => r.dirs || []).concat(['js/circuits/']))
  for (const d of (PLAN.jsDirs || []).map((x) => x.replace(/\/?$/, '/'))) {
    if (!owned.has(d)) PLANNED.push({ k: `dir:${d}`, e: 'medium', scope: `every file under ${d} (ls it to enumerate) — a directory no static slice owns yet. Emphases: drift, dead code, write-only state, and whether anything loads it (tools/manifest.cjs).` })
  }
  log(`slice plan: ${PLAN.circuits.length} circuits in ${Math.ceil(PLAN.circuits.length / CIRCUIT_CHUNK)} slices; ${PLANNED.filter((s) => s.k.startsWith('dir:')).length} unowned js/ dirs added`)
} else {
  notCovered.push('js/circuits/ (slice plan failed)', 'js/ dirs no static slice owns (slice plan failed)')
  log('slice plan FAILED — circuits and unowned js/ dirs are NOT audited this run (see notCovered)')
}
const SLICES = R1.concat(PLANNED)

const VERIFY_CHUNK = 15
const bucket = (f) => `${f.file}:${f.kind}:${Math.round((f.line || 0) / 20)}`
const seen = new Set()
for (const k of (A.knownKeys || [])) seen.add(k)

// ── Prior art: seed the do-not-re-report list when the caller passed none ──
let knownRows = A.known || []
if (!knownRows.length) {
  const scout = await spawn(`slice: the whole tree — js/, tools/, css/, index.html, sw.js, docs/, AGENTS.md, .claude/skills/ (not tests/).
topic: runtime bugs, dead code, doc/comment drift, contradictions, duplication.
Return each KNOWN row as one string of \`known\`.`,
    { label: 'prior-art', phase: 'Prior art', agentType: 'prior-art-scout', effort: 'low', schema: KNOWN_SCHEMA })
  knownRows = ((scout && scout.known) || []).slice(0, 30)
  log(`prior art: ${knownRows.length} KNOWN rows seeded by prior-art-scout${scout ? '' : ' (scout returned nothing)'}`)
}
const KNOWN = knownRows.map((k, i) => `${i + 1}. ${k}`).join('\n') || '(none supplied this run)'

const COMMON = `${COMMON_BASE}
KNOWN FINDINGS — already recorded, queued, or deliberately deferred. Do NOT re-report these or trivial variants of them:
${KNOWN}`

const SCHEMA_MAP = `Schema mapping: your row's mechanism or gap → claim; what you read (quote, trace, and your confidence) → evidence; proposed fix → fix; kind from the list above; filesRead = files you read in full.`

const finderPrompt = (r, round) => {
  if (r.agentType === null) return `${COMMON}
You are a ROUND-${round} AUDITOR. Your scope: ${r.scope}
Read every in-scope file IN FULL (large files too — read them in chunks until you have read all of it). Then report.
${RUBRIC}
${PRECISION}`
  if (r.agentType === 'surface-reviewer') return `units: ${r.scope}
Extract every claim one of these units makes about another (or about a file it names) and probe it; one DOC-DRIFT row per false or stale claim.
report: scratch/total-audit/round${round}-${r.k}.md
task hint: an agent follows these docs to run AGENTS.md's loop (pick-tests → tooling-fast → test-bg → deploy.mjs --gate-only) and to route a request to the right skill.
known (do not re-report):
${KNOWN}
${RUBRIC}
${SCHEMA_MAP} Every false or stale CLAIM row, collision and cycle is one finding (kind drift or contradiction).`
  return `slice: ${r.scope}
focus: bug, dead-code, plus drift, contradiction, duplication and mess as defined below
known:
${KNOWN}

Round ${round} of a whole-tree audit. Read every in-scope file IN FULL (large files in chunks). ${SHAPE}
${RUBRIC}
${SCHEMA_MAP}`
}

const claimRows = (rows) => rows.map((c) => `${c.index}. ${c.file}:${c.line} — [${c.kind}, ${c.severity}] ${c.claim} | finder's evidence: ${c.evidence}`).join('\n')

const refutePrompt = (rows, who) => `You are independent skeptic ${who}. Also REFUTED: a deliberate, documented choice (check AGENTS.md and docs/ before deciding); a duplicate of one of these KNOWN items; immaterial style noise no maintainer would act on.
KNOWN:
${KNOWN}
Schema mapping: index = the number the claim carries below; refuted=true for REFUTED, STALE or whenever you are unsure (start the reason with your verdict word); refuted=false only for CONFIRMED; needsBrowser=true (refuted=false) for NEEDS-BROWSER — a claim only a rendered or driven run can settle is reported, not refuted. One verdict per claim.
claims:
${claimRows(rows)}`

async function verifyBatch(fresh, round) {
  if (!fresh.length) return []
  const compact = fresh.map((f, i) => ({ index: i, file: f.file, line: f.line, kind: f.kind, severity: f.severity, claim: f.claim, evidence: f.evidence }))
  const tag = `${fresh[0].file.split('/').pop()}+${fresh.length}`
  const chunks = []
  for (let j = 0; j < compact.length; j += VERIFY_CHUNK) chunks.push(compact.slice(j, j + VERIFY_CHUNK))
  const calls = [1, 2].flatMap((who) => chunks.map((rows, ci) => ({ who, rows, ci })))
  const votes = await parallel(calls.map((c) => () =>
    spawn(refutePrompt(c.rows, `${c.who} of 2`),
      { label: `verify${round}:${tag}${chunks.length > 1 ? `#${c.ci + 1}` : ''}`, phase: `Verify ${round}`, agentType: 'finding-verifier', schema: VERDICTS_SCHEMA, effort: 'medium' })))
  // one usable vote per skeptic, as before: a skeptic counts only if every chunk it judged came back
  const voters = [1, 2].filter((who) => calls.every((c, n) => c.who !== who || votes[n]))
  if (!voters.length) return []
  const refCount = fresh.map(() => 0), heard = fresh.map(() => 0), browserIdx = new Set()
  votes.forEach((v, n) => {
    if (!v || !voters.includes(calls[n].who)) return
    const inChunk = new Set(calls[n].rows.map((r) => r.index))
    for (const verdict of (v.verdicts || [])) {
      if (!inChunk.has(verdict.index)) continue
      heard[verdict.index]++
      if (verdict.needsBrowser) browserIdx.add(verdict.index)
      else if (verdict.refuted) refCount[verdict.index]++
    }
  })
  const out = []
  for (let i = 0; i < fresh.length; i++) {
    const f = fresh[i]
    if (heard[i] === 0) continue
    if (f.severity === 'high' && voters.length === 2 && refCount[i] === 1) {
      const tie = await spawn(refutePrompt([compact[i]], '3 — the tiebreak: two skeptics split on this claim'),
        { label: `tiebreak${round}:${f.file.split('/').pop()}:${f.line}`, phase: `Verify ${round}`, agentType: 'finding-verifier', schema: VERDICTS_SCHEMA, effort: 'high' })
      const t = tie && tie.verdicts && tie.verdicts[0]
      if (t) { heard[i]++; if (t.refuted) refCount[i]++ }
    }
    // high dies on two refutes, or when every skeptic that answered refuted it; low dies on one refute.
    const kill = f.severity === 'high' ? (refCount[i] >= 2 || refCount[i] === heard[i]) : refCount[i] >= 1
    if (!kill) out.push({ ...f, skepticsHeard: heard[i], refutes: refCount[i], needsBrowser: browserIdx.has(i) || undefined })
  }
  return out
}

const confirmed = []
const coverage = []   // the finders that actually returned, never the slice list
let gapPrompts = null

for (let round = 1; round <= 3; round++) {
  const prompts = round === 1
    ? SLICES.map((r) => ({ label: `find:${r.k}`, agentType: r.agentType, effort: r.e, text: finderPrompt(r, round) }))
    : (gapPrompts || []).map((g, i) => ({ label: `find${round}:gap${i + 1}`, effort: 'medium', text: finderPrompt({ k: `gap${i + 1}`, scope: g }, round) }))
  if (!prompts.length) { log(`round ${round}: no prompts — stopping`); break }
  log(`round ${round}: ${prompts.length} finders`)

  const roundConfirmed = await pipeline(
    prompts,
    (p) => spawn(p.text, { label: p.label, phase: `Find ${round}`, schema: FINDINGS_SCHEMA,
      ...(p.agentType === null ? {} : { agentType: p.agentType || 'code-hunter' }),
      ...(p.agentType === undefined && p.effort ? { model: TIER_MODEL[p.effort], effort: p.effort } : {}) }),
    (res, p) => {
      if (!res || !res.findings) { log(`${p.label}: finder returned nothing — its slice is NOT covered`); notCovered.push(p.label); return [] }
      coverage.push(p.label)
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

  const critic = await spawn(`${COMMON}
You are the COMPLETENESS CRITIC. Rounds so far covered these scopes: ${JSON.stringify(coverage)}. Confirmed findings so far (file/kind/claim): ${JSON.stringify(confirmed.map((f) => ({ file: f.file, kind: f.kind, claim: f.claim })))}
Name what an exhaustive audit is STILL missing — cross-cutting lenses no domain slice covers. Candidates to consider (drop any that are already well covered, add your own): G-facade accessor coherence between game.js and its modules; localStorage apex26.* key schema coherence; window.__apex hooks vs docs/DEBUG-HOOKS.md truth; silent catch blocks swallowing errors; event-listener/interval leaks across screen transitions; determinism (__apex.seed) leak paths; postMessage/WebRTC/Nostr input validation; hot-path allocation churn; aria/accessibility contract vs AriaState; cache-bust ?v= coherence across index.html/sw.js/version.json.
Return up to ${(A.maxGap || 8)} gap prompts, EACH the self-contained \`slice:\` of one code-hunter agent (scope + files to read + lens). Return an EMPTY list if the audit is genuinely saturated.`,
    { label: 'critic', phase: 'Critic', effort: 'high', schema: { type: 'object', required: ['gapPrompts'], properties: { gapPrompts: { type: 'array', items: { type: 'string' } } } } })
  gapPrompts = critic ? critic.gapPrompts.slice(0, (A.maxGap || 8)) : []
  gapPrompts.forEach((g, i) => log(`round${round + 1}-gap${i + 1} planned: ${g.slice(0, 80)}`))
}

const synthesis = await spawn(`${COMMON}
You are the SYNTHESIZER. Below are ${confirmed.length} adversarially-verified findings from a whole-tree audit (code + docs). Write ONE markdown report:
1. "## Verdict" — 3-6 sentences: how healthy is this tree after the cleanup campaign, where does the remaining mess concentrate.
2. "## Fix now" — findings worth immediate commits, ordered by severity, each as "file:line — claim → fix". Batch them: which are js/ (need one cache bump), which are docs/tools (no bump).
3. "## Needs a browser" — findings whose skeptics said needsBrowser: report them with the probe that would settle each (an __apex hook, a spec, a screenshot); they are neither confirmed nor refuted.
4. "## Defer" — real but not now, with reasons.
5. "## Coverage" — what was audited (the finders that returned: ${JSON.stringify(coverage)}), what round-N critics added, and what was NOT covered this run: ${JSON.stringify(notCovered)}.
Do not invent findings not in the list; do not drop any confirmed finding — every one lands in exactly one of sections 2-4.
FINDINGS: ${JSON.stringify(confirmed)}`,
  { label: 'synthesize', phase: 'Synthesize', effort: 'high' })

log(`agents spawned this run: ${spawned}`)
return { report: synthesis, confirmed, totalConfirmed: confirmed.length, coverage, notCovered, agentsSpawned: spawned }