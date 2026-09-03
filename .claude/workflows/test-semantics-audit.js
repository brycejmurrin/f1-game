export const meta = {
  name: 'test-semantics-audit',
  description: 'Read all 160 test files in full; per-file semantic verdicts; design the group taxonomy, the tests/ split map, and change-aware CI selection',
  whenToUse: 'Re-audit all test files semantically (per-file verdicts, taxonomy, split map, CI selection design).',
  phases: [
    { title: 'Audit', detail: '8 batch auditors, ~20 test files each, read in full' },
    { title: 'Design', detail: 'taxonomy + dir split + change-aware CI selection' },
    { title: 'Check', detail: 'feasibility skeptic on the CI design' },
  ],
}

const COMMON = `Repo: current workspace (inspect \`git branch --show-current\` for current branch). STRICTLY READ-ONLY. NEVER run Playwright/browser tests or npm test scripts (4-core box, flat prohibition); node --check is fine. Context: 111 Playwright *.spec.js + 49 node *.test.mjs/cjs + 7 helpers live FLAT in tests/; groups are the test:* scripts in package.json; docs/TESTING.md is the reference; timing data may exist in artifacts/logs/*.log (grep for the spec name; absent is fine). Known-already (do not re-derive, but DO confirm if you see them): ui-audit.spec.js 34 tests/0 expects and ui-desktop.spec.js 5/0 are screenshot galleries; menu-survey mostly screenshot-only; ui-button-touch "throttle button visible" wraps its expect in an if; coplanar-faces kept a >=24 roster floor; camera-driving-hooks "spin rotates heading" computes positions it never asserts; headless-api "obs() returns false" accepts both outcomes; tracks-visual is skip-gated deliberately.`

const FILE_SCHEMA = {
  type: 'object', required: ['files'],
  properties: { files: { type: 'array', items: {
    type: 'object', required: ['file', 'purpose', 'assertionQuality', 'costTier', 'verdict'],
    properties: {
      file: { type: 'string' },
      purpose: { type: 'string' },
      assertionQuality: { enum: ['strong', 'mixed', 'weak', 'vacuous'] },
      weakSpots: { type: 'string' },
      costTier: { enum: ['trivial', 'cheap', 'moderate', 'heavy', 'unknown'] },
      overlaps: { type: 'array', items: { type: 'string' } },
      verdict: { enum: ['keep', 'strengthen', 'merge', 'split', 'regroup'] },
      verdictDetail: { type: 'string' },
    } } } },
}

phase('Audit')
const allFiles = await agent(`${COMMON}
List every test file: run ls tests/*.spec.js tests/*.test.mjs tests/*.test.cjs (plus tests/manual/*.spec.js). Return them as JSON.`,
  { label: 'inventory', phase: 'Audit', effort: 'low', schema: { type: 'object', required: ['files'], properties: { files: { type: 'array', items: { type: 'string' } } } } })

const files = allFiles.files
const BATCHES = []
const per = Math.ceil(files.length / 8)
for (let i = 0; i < files.length; i += per) BATCHES.push(files.slice(i, i + per))
log(`auditing ${files.length} test files in ${BATCHES.length} batches`)

const audited = await pipeline(
  BATCHES,
  (batch, _b, i) => agent(`${COMMON}
You are batch auditor ${i + 1}/${BATCHES.length}. Read EACH of these files IN FULL and judge it semantically — what does it actually prove?
${batch.join('\n')}
Per file report: purpose (one line, what failing would MEAN); assertionQuality — strong (would catch the regression it exists for), mixed, weak (thresholds arbitrary / assertions tangential), vacuous (cannot fail / screenshot-only / condition-wrapped expects); weakSpots (name the specific vacuous/weak assertions with line numbers); costTier (heavy = boots browser + builds circuits repeatedly or >2 min in any artifacts/logs timing you find; trivial = pure-node ms); overlaps (other test FILES asserting substantially the same thing — name them only if you are confident); verdict — keep / strengthen (fix weak asserts) / merge (into which file) / split (what into what) / regroup (which test:* group it really belongs to); verdictDetail (one sentence). Judge honestly — "keep" should be the majority for a healthy suite, but do not rubber-stamp.`,
    { label: `audit:batch${i + 1}`, phase: 'Audit', schema: FILE_SCHEMA })
)

const perFile = audited.filter(Boolean).flatMap((a) => a.files)
log(`per-file verdicts: ${perFile.length}`)

phase('Design')
const design = await agent(`${COMMON}
You are the TAXONOMY + CI DESIGNER. Inputs: (A) per-file semantic verdicts below; (B) package.json test:* scripts; (C) docs/TESTING.md sections 1-2; (D) tools/ci/pick-tests.mjs (read it fully — its RULES map changed paths to groups and its --since flag diffs a ref); (E) .github/workflows/ci.yml (read fully — note the measured budgets, the OOM/NODE_OPTIONS story, the cancelled-vs-failed lesson in its header); (F) tests/unit/test-groups.test.mjs + tests/unit/test-coverage-audit.test.mjs + playwright.config.js (what currently enforces the taxonomy).
Produce ONE markdown deliverable, three sections:
## 1. Group taxonomy — the corrected test:* group structure: which files move groups (from the regroup verdicts), which groups merge/split, the strengthen list (weak/vacuous asserts to fix, each with its file:line and the one-line fix), and the merge candidates. Keep group NAMES stable where possible (19 docs cite them).
## 2. tests/ split map — the specs/unit/helpers/data directory mapping for every file (feed the audit verdicts in: a file being merged should merge BEFORE moving), preserving the R2 lockstep list already recorded in docs/archive/research/AUDIT-SYNTHESIS-2026-08.md (read its R2 section and do not contradict it — extend it with anything the per-file audit adds, e.g. snapshot dirs, manual/).
## 3. Change-aware CI — a concrete ci.yml design: a "selected" job that computes the push/PR diff (document exact git refs for both event types), runs node tools/ci/pick-tests.mjs --since <ref> to get groups, runs the NODE-ONLY groups directly, and runs AT MOST a fixed browser budget (define it against the documented ~90-115 s/test SwiftShader cost and the 35-min job cap); a FALLBACK-TO-FULL-GATE rule listing the infra paths that force the existing three-job gate (package.json, tools/manifest.cjs, .github/**, playwright.config.js, tests/helpers, index.html script block, sw.js, version bumps); how the existing guards/sweeps/smoke jobs coexist (they stay the deploy gate; selection is additive on non-deploy branches); and the failure-mode notes the ci.yml header demands (timeout budgets stated per step, no cancel-in-progress on push).
Be decisive and specific; every claim about pick-tests/ci.yml must come from the files you read.
(A) PER-FILE VERDICTS: ${JSON.stringify(perFile)}`,
  { label: 'design', phase: 'Design', effort: 'high' })

phase('Check')
const feas = await agent(`${COMMON}
You are the FEASIBILITY SKEPTIC for a CI test-selection design. Read .github/workflows/ci.yml and tools/ci/pick-tests.mjs fully, then audit the DESIGN below for: git-ref errors (what does github.event.before contain on force-push/first-push? does the PR case need fetch-depth adjustments?), pick-tests invocation mismatches (flags that don't exist, output format assumptions), budget arithmetic vs the documented per-test costs, fallback-path completeness, and interactions with the workflow_call deploy gate. List every gap precisely; do not rewrite the design.
DESIGN: ${design}`,
  { label: 'feasibility', phase: 'Check', schema: { type: 'object', required: ['gaps'], properties: { gaps: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } } }, effort: 'high' })

return { design, feasibilityGaps: feas ? feas.gaps : ['feasibility agent failed'], perFileCount: perFile.length, perFile }