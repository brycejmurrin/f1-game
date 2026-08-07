export const meta = {
  name: 'audit-verify-restructure',
  description: 'Audit the cleanup session + survey corpus, adversarially verify findings, synthesize a FIX-NOW/RESTRUCTURE/DEFER plan',
  whenToUse: 'One-off shape kept for provenance: verify a cleanup session diff + survey corpus, then map the restructure.',
  phases: [
    { title: 'Find', detail: '6 parallel auditors over the diff, triage corpus, docs, structure, guards' },
    { title: 'Verify', detail: 'adversarial skeptics per BUG finding; feasibility check per move cluster' },
    { title: 'Synthesize', detail: 'one prioritized deliverable' },
  ],
}

const SCRATCH = '/tmp/claude-0/-home-user-f1-game/dd697fb8-d0f3-5f5e-a10c-8086e2ae2df8/scratchpad'
const COMMON = `Repo: /home/user/f1-game, branch claude/project-cleanup-reorganize-rrztv6, tip a187ecb0.
STRICTLY READ-ONLY: do not modify any file. NEVER run Playwright, browser tests, or any npm test script (4-core box, flat prohibition). Allowed: Read/Grep/Glob, git commands, node --check, and at most ONE targeted "node --test tests/<one-file>.test.mjs" if essential.
The cleanup session's shipped diff is: git diff a162b00a..HEAD (13 commits).
Prior 11-agent survey corpus (already read every file in the project): ${SCRATCH}/code-survey-*.md, ${SCRATCH}/survey-*.md, master triage: ${SCRATCH}/code-survey-triage.md.
Report at most 8 findings — the most load-bearing ones, prioritized. Evidence must quote real code you read, with file:line.`

const FINDINGS_SCHEMA = {
  type: 'object', required: ['findings'],
  properties: { findings: { type: 'array', maxItems: 8, items: {
    type: 'object', required: ['severity', 'kind', 'file', 'claim', 'evidence'],
    properties: {
      severity: { enum: ['HIGH', 'LOW'] },
      kind: { enum: ['BUG', 'INCOHERENCE', 'UNAPPLIED', 'DOC-DRIFT', 'MESS'] },
      file: { type: 'string' }, line: { type: 'number' },
      claim: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' },
    } } } },
}
const MOVES_SCHEMA = {
  type: 'object', required: ['clusters'],
  properties: { clusters: { type: 'array', maxItems: 8, items: {
    type: 'object', required: ['name', 'rationale', 'moves', 'lockstep', 'risk'],
    properties: {
      name: { type: 'string' }, rationale: { type: 'string' },
      moves: { type: 'array', items: { type: 'object', required: ['from', 'to'],
        properties: { from: { type: 'string' }, to: { type: 'string' } } } },
      lockstep: { type: 'array', items: { type: 'string' } },
      risk: { type: 'string' },
    } } } },
}
const VERDICT_SCHEMA = {
  type: 'object', required: ['refuted', 'reason'],
  properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } },
}
const FEAS_SCHEMA = {
  type: 'object', required: ['feasible', 'gaps'],
  properties: { feasible: { type: 'boolean' }, gaps: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } },
}

const FINDERS = [
  { key: 'session-diff', prompt: `${COMMON}
You are the SESSION-DIFF REVIEWER. Read "git log --oneline a162b00a..HEAD" then the full "git diff a162b00a..HEAD" hunk by hunk (use git diff per-file where big: js/game.js, js/game/cam-modes.js, js/game/physics-consts.js, js/game/agentview.js, js/game/apex.js, tests/agent-view.spec.js, index.html, the css files, tools/*). Hunt for: real correctness bugs introduced by the session; half-applied edits (a change made in one place whose twin site was missed); extraction-seam errors (cam-modes G-wiring: camMode/camCutT accessors, the deferred setCamMode arrow, TDZ hazards; physics-consts destructure completeness vs its object keys); alias-removal leftovers (any remaining reference to __apex visible/worldModel/frame/plan as API calls); css deletions that changed behavior beyond intent; incoherent comments the session itself introduced. The user says the code "seems like a total mess" — find what they might be seeing. Verify every suspicion against the actual current file before reporting.` },
  { key: 'triage-completeness', prompt: `${COMMON}
You are the TRIAGE COMPLETENESS AUDITOR. Read ${SCRATCH}/code-survey-triage.md fully, then cross-check each JS-BATCH item against the CURRENT tree: which were actually applied and which were NOT (many comment-drift OLD/NEW specs from code-survey-gamejs/game-play/game-ui/render/circuits were only partially landed — e.g. render backend citation fixes, circuit elevation comments, agent-surface sky()/penalties comments, HOW TO PLAY "4 modes", stale z-index comments, spike three-spike.html TRACK_VM gap, bodyattitude LAT_MAX mirror). For each unapplied item verify it is STILL valid (the code may have moved) and report it as kind UNAPPLIED with the exact current fix. Also list any JS-BATCH item that was applied WRONGLY. Read the individual code-survey-*.md reports for the full spec text where the triage is terse.` },
  { key: 'docs-vs-code', prompt: `${COMMON}
You are the DOCS-VS-CODE VERIFIER for the rewritten docs as the tree stands NOW (post cam-modes + physics-consts extractions). Check CLAUDE.md (file map completeness/accuracy — every js/game module incl. cam-modes.js + physics-consts.js, commands, counts, deploy branch claude/f1-game-project-26h3ng), docs/ARCHITECTURE-REVIEW.md (open-defect register entries still accurate? anything fixed-but-listed-open or vice versa), README.md, docs/ARCHITECTURE.md (module tables vs current tree, the states paragraph, extraction notes). Report kind DOC-DRIFT with exact OLD text and corrected NEW text in the fix field.` },
  { key: 'guard-health', prompt: `${COMMON}
You are the GUARD-SUITE HEALTH AUDITOR. Read tests/load-order.test.mjs, tests/docs-integrity.test.mjs, tests/test-groups.test.mjs, tests/test-coverage-audit.test.mjs, tests/module-size.test.mjs, tests/comment-citations.test.mjs, tests/vstd-invariant.test.mjs, tests/scenery-api-contract.test.mjs, tests/agentview-api-contract.test.mjs, tests/hooks-documented.test.mjs, tests/component-inventory.test.mjs, plus playwright.config.js RENDER_SPECS and package.json test:* scripts. Report: (a) guards whose expectations are stale after the session's changes; (b) ratchets sitting far from their real value; (c) known never-fail/vacuous assertions (the survey found tests/ui-button-touch.spec.js "throttle button visible"; tests/coplanar-faces.test.mjs roster floor >=24 vs sibling's ===roster); (d) EXACTLY which guard files/lines must change to allow a tests/ directory split (specs/unit/helpers/data) and tools/ subdirectories — quote the path-pattern assumptions (e.g. ls("tests", ...) flat readdir, "tests/" string prefixes in scripts, testMatch globs, coverage-audit walks).` },
  { key: 'mess-hunter', prompt: `${COMMON}
You are the FRESH-EYES MESS HUNTER. Ignore the prior reports' known findings; look for what makes this codebase FEEL messy that they did not itemize: (1) top-of-file comment sprawl — files whose header essays have accreted contradictory eras; (2) duplicated/near-duplicated logic still present (beyond the known clamp/lerp/wrapDelta backlog); (3) leftover scaffolding from this session (stray comments referencing removed things, transitional notes that read as noise); (4) index.html organization (1,600 lines — is its section structure coherent?); (5) inconsistent idioms between sibling modules in js/game/ (creation patterns, export shapes); (6) the artifacts/scratch dirs leaking into git status; (7) anything in git status right now that should not be there (run git status --short). Prioritize by what a developer opening the repo cold would trip over first.` },
]

const SURVEYOR_PROMPT = `${COMMON}
You are the RESTRUCTURE SURVEYOR. The user wants a FULL restructure. Produce a concrete, ordered move map as clusters. Candidate clusters to evaluate (add better ones if you see them): (1) tests/ split into tests/specs/ (111 *.spec.js), tests/unit/ (49 *.test.mjs/cjs), tests/helpers/ (the 7 helper js files), tests/data/ already exists — with snapshots dir handling (menu-baseline.spec.js-snapshots must stay adjacent to its spec per Playwright convention); (2) tools/ subdirectories by the README's own taxonomy (test-infra/, track/, capture/, lighting/, net/, car/, ui/) with the baseline JSONs and carview.html placed deliberately; (3) js/game/ naming unification squashed→hyphenated (debrisworld→debris-world etc., 13 files) — evaluate honestly whether the payoff justifies the churn and say NO-GO if not; (4) any next game.js extraction that is genuinely low-crossing (read the G façade region first; the garage cluster is KNOWN blocked, sky-state is KNOWN inside render(), pre-race screens KNOWN many-crossing).
For EVERY cluster: list each move (from→to), the COMPLETE lockstep edit list with file paths — tools/manifest.cjs (FULL/TRACK_VM/HARD_EDGES/CARVIEW arrays), index.html script tags, package.json test:* script paths, playwright.config.js (testDir/testMatch/RENDER_SPECS/testIgnore/snapshot paths), tests/load-order.test.mjs, tests/test-coverage-audit + tools/test-coverage-audit.mjs walkers, tests/test-groups.test.mjs (docs/TESTING.md coverage-table rows), tests/docs-integrity.test.mjs (ls("tests",...) flat readdirs, tools/README bidirectional scan incl. subdir walk it already has, skills path assertions), docs/TESTING.md, tools/README.md, CLAUDE.md, .claude/skills/*/SKILL.md path references, tools/pick-tests.mjs RULES, tools/test-bg.mjs, ci.yml step paths — and an honest risk paragraph. Order clusters by value/risk. Verify every lockstep claim by reading the actual guard code, not from memory.`

phase('Find')
log('6 auditors fanning out over the diff, triage corpus, docs, guards, structure')

function verifyFinding(finderKey, x) {
  if (x.kind !== 'BUG' && x.kind !== 'INCOHERENCE') {
    return Promise.resolve({ ...x, finder: finderKey, verdict: 'accepted-unverified' })
  }
  const lenses = x.severity === 'HIGH' ? ['correctness', 'does-it-reproduce'] : ['correctness']
  return parallel(lenses.map((lens) => () => agent(
    `${COMMON}
You are an adversarial SKEPTIC (${lens} lens). Try to REFUTE this finding by reading the actual code it cites. A finding survives only if the code really shows the problem TODAY on this branch. Default to refuted=true if the evidence does not hold up, the cited code has changed, the "bug" is deliberate and documented, or the claim overstates.
FINDING: ${JSON.stringify(x)}`,
    { label: `verify:${finderKey}:${(x.file || '').split('/').pop()}`, phase: 'Verify', schema: VERDICT_SCHEMA, effort: 'medium' }
  ))).then((vs) => {
    const votes = vs.filter(Boolean)
    const refutes = votes.filter((v) => v.refuted).length
    const killed = x.severity === 'HIGH' ? refutes === votes.length && votes.length > 0 : refutes > 0
    return { ...x, finder: finderKey, verdict: killed ? 'refuted' : 'confirmed',
             skepticNotes: votes.map((v) => v.reason).join(' | ') }
  })
}

const findingsWork = pipeline(
  FINDERS,
  (f) => agent(f.prompt, { label: `find:${f.key}`, phase: 'Find', schema: FINDINGS_SCHEMA }),
  (res, f) => res ? parallel(res.findings.map((x) => () => verifyFinding(f.key, x)))
                      .then((list) => ({ finder: f.key, findings: list.filter(Boolean) }))
                  : null
)

const movesWork = agent(SURVEYOR_PROMPT, { label: 'find:restructure', phase: 'Find', schema: MOVES_SCHEMA })
  .then((m) => !m ? null : parallel(m.clusters.map((c) => () => agent(
    `${COMMON}
You are the FEASIBILITY CHECKER for one proposed restructure cluster. Read the ACTUAL guard-test source files named in its lockstep list (plus tests/docs-integrity.test.mjs, tests/load-order.test.mjs, tools/manifest.cjs, playwright.config.js, package.json regardless). Answer: does the lockstep list COMPLETELY cover what breaks? List every gap (a guard/config/reference the cluster missed). Note anything that makes the cluster a bad idea outright.
CLUSTER: ${JSON.stringify(c)}`,
    { label: `feas:${c.name}`, phase: 'Verify', schema: FEAS_SCHEMA, effort: 'medium' }
  ).then((f) => ({ ...c, feasibility: f })))).then((cs) => cs.filter(Boolean)))

const [finderResults, clusters] = await Promise.all([findingsWork, movesWork])

phase('Synthesize')
const confirmed = (finderResults || []).filter(Boolean)
  .flatMap((r) => r.findings.filter((x) => x.verdict !== 'refuted'))
const refutedCount = (finderResults || []).filter(Boolean)
  .flatMap((r) => r.findings).filter((x) => x.verdict === 'refuted').length
log(`verified findings: ${confirmed.length} kept, ${refutedCount} refuted; clusters: ${(clusters || []).length}`)

const synthesis = await agent(
  `${COMMON}
You are the SYNTHESIZER. Below are (A) verified audit findings and (B) restructure clusters with feasibility checks. Produce ONE deliverable in markdown with exactly three sections:
## FIX-NOW — deduplicated correctness/coherence items, ordered by severity, each with file:line and the concrete fix (merge duplicates across finders; drop anything vague);
## RESTRUCTURE — the move clusters worth doing, in execution order, each with its final lockstep edit list (fold in the feasibility gaps), a one-line go/no-go verdict and why;
## DEFER — everything else, one line each with the reason.
Be decisive and specific — this document drives implementation directly. Do not pad.
(A) FINDINGS: ${JSON.stringify(confirmed)}
(B) CLUSTERS: ${JSON.stringify(clusters)}`,
  { label: 'synthesize', phase: 'Synthesize' }
)

return { synthesis, confirmed, clusters, refutedCount }