export const meta = {
  name: 'code-survey',
  description: 'Whole-tree survey for dead code, bugs and performance — prior-art seed, static recon, loop-until-dry code-hunter finders, perspective-diverse finding-verifier panel',
  whenToUse: 'Periodic dead-code / bug / perf sweep over all of js/, tools/, tests/, css/ and the shell. Complements total-audit (which owns drift + docs). Optional args: {known: ["file:line — claim"], knownKeys: [], maxGap: 8, rounds: 3, focus: "dead-code"|"bug"|"perf"|null}.',
  phases: [
    { title: 'Prior art', detail: 'prior-art-scout — seeds the do-not-re-report list when args.known is empty (one call)', model: 'haiku' },
    { title: 'Recon', detail: 'haiku — run the static checkers, tabulate the real reference graph', model: 'haiku' },
    { title: 'Find 1', detail: '29 code-hunter slices — haiku+low effort on 4 data-shaped slices, sonnet+medium on domains, opus+high on engine, renderers, net, audio' },
    { title: 'Verify 1', detail: 'finding-verifier reachability + intent lenses per ≤15-claim chunk, finding-verifier tiebreak (opus, effort high) on high-severity splits' },
    { title: 'Critic', detail: 'opus — names the cross-cutting lenses no scope slice covered', model: 'opus' },
    { title: 'Find 2', detail: 'critic-driven code-hunter gap finders (effort high for engine-adjacent gaps)' },
    { title: 'Verify 2', detail: 'same adversarial panel' },
    { title: 'Find 3', detail: 'final round if round 2 still yielded' },
    { title: 'Verify 3', detail: 'same adversarial panel' },
    { title: 'Perf triage', detail: 'opus — rank confirmed perf findings by real frame-loop impact', model: 'opus' },
    { title: 'Synthesize', detail: 'opus — one prioritized report, every confirmed finding placed', model: 'opus' },
  ],
}

// ───────────────────────────────── args ─────────────────────────────────────

const A = typeof args === 'string' ? JSON.parse(args) : (args || {})
const MAX_ROUNDS = A.rounds || 3
const MAX_GAP = A.maxGap || 8
const FOCUS = A.focus ? `\nRUN FOCUS: this run cares most about **${A.focus}** findings. Still report the other kinds, but spend your reading budget on ${A.focus}.` : ''

// ──────────────────────────── shared prompt parts ────────────────────────────
// The custom agents (code-hunter, finding-verifier, prior-art-scout) carry
// their own read-only rules, tool limits and row formats in .claude/agents/;
// their prompts here pass only the slice, the lens and the claims. COMMON is
// for the default-agent stages (recon, critic, perf triage, synthesis).

const DELIBERATE = `Deliberate in this repo, never a finding: WGX (js/render/webgpu/) and TLX (js/render/three/) have NO script tag (injected from ApexRoster.DEFERRED); an \`__apex\` hook used only from tests or the console; a helper used only by tools/; a documented public API; the \`?v=dev\` tags (rewritten at deploy); the test-frozen scenery(api) contract. Never audit vendor/, node_modules/, artifacts/ or scratch/. Generated files — index.html's \`@gen-shell\` blocks, version.json, package.json test scripts (source: tests/groups.json), tools/README.md (source: \`@doc\` headers), js/roster.js, tools/carview.html — are reported against their SOURCE, never the output.`

const COMMON_BASE = `Repo: the current workspace (an unofficial WebGL2 F1 fan game, "Apex 26"). STRICTLY READ-ONLY — never edit a file. Never run Playwright, any browser, or any npm script: this is a 4-core box and browser runs may be in flight in the main session. \`node --check\`, \`grep\`, \`node tools/check/*.mjs\` and other static CLIs are fine and encouraged.
${DELIBERATE}`

const KNOWN_SCHEMA = {
  type: 'object',
  required: ['known'],
  properties: { known: { type: 'array', items: { type: 'string' }, description: 'One KNOWN row per string, in your row format.' } },
}

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings', 'filesRead', 'coverageNote'],
  properties: {
    filesRead: { type: 'number' },
    coverageNote: { type: 'string', description: 'What in your scope you did NOT read in full, and why. "all of it" is a valid answer.' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'line', 'kind', 'severity', 'hotness', 'claim', 'evidence', 'fix'],
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          kind: { enum: ['dead-code', 'bug', 'perf'] },
          severity: { enum: ['high', 'medium', 'low'] },
          hotness: { enum: ['per-frame', 'per-lap', 'boot', 'rare', 'n/a'] },
          claim: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
  },
}

const VERDICTS_SCHEMA = {
  type: 'object',
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['index', 'refuted', 'reason'],
        properties: { index: { type: 'number' }, refuted: { type: 'boolean' }, reason: { type: 'string' } },
      },
    },
  },
}

// ──────────────────── phase 0: prior art + static recon ──────────────────────
// prior-art-scout seeds the do-not-re-report list when the caller passed none
// (one call, started first, awaited after recon so the two overlap). Recon is
// cheap, mechanical, model-light; its output is injected into every round-1
// finder so 29 agents do not each re-derive the same reference graph.

phase('Prior art')
const scoutRun = (A.known && A.known.length) ? null
  : agent(`slice: the whole tree — js/, tools/, tests/, css/, index.html, sw.js.
topic: dead code, runtime bugs and performance (frame budget).${A.focus ? ` Rows about ${A.focus} first.` : ''}
Return each KNOWN row as one string of \`known\`.`,
    { label: 'prior-art', phase: 'Prior art', agentType: 'prior-art-scout', effort: 'low', schema: KNOWN_SCHEMA })

phase('Recon')

const RECON_TASKS = [
  {
    k: 'global-graph',
    prompt: `Run \`node tools/check/scan-globals.mjs\` (add \`--check\` on a second run if it helps) and read artifacts/dep-graph.json if it writes one. That tool derives the REAL global-reference graph of this IIFE build with espree/eslint-scope.
Report, as plain text tables an auditor can cite:
1. Every global ASSIGNED by some file that NO other file reads (these are dead-code candidates — note which are legitimately entered from index.html, tests/, tools/ or ApexRoster.DEFERRED).
2. Every global READ that nothing in js/ assigns (load-order or typo hazards).
3. Any file whose global is read only by ONE other file (extraction/inline candidates).
Quote real numbers from the tool. If the tool fails, say exactly how it failed and fall back to grep.`,
  },
  {
    k: 'shell-graph',
    prompt: `Run \`node tools/check/shell-ids.mjs --json\` and \`node tools/check/tree-counts.mjs --offenders\`. Then, with grep only:
1. List every \`id="..."\` in index.html that NO file under js/ or css/ ever references (dead shell nodes).
2. List every CSS class defined in css/*.css that appears in no .html, .js file (dead selectors). Account for classes built by string concatenation — flag those as "dynamic, unverified" rather than dead.
3. Report the tree-counts offenders verbatim: bare catch blocks, waits, sleeps, CSS colour/spacing counts.
Report tables with counts. Never edit anything.`,
  },
  {
    k: 'api-surface',
    prompt: `Mechanical cross-reference sweep, grep and node only:
1. \`node tools/check/dup-keys.mjs\` — report any duplicate object-literal key it finds (this is a real merge hazard in this repo).
2. Enumerate every \`__apex\` hook registered in js/agent/apex.js and diff that set against the hooks documented in docs/DEBUG-HOOKS.md. Report: documented-but-missing, and registered-but-undocumented.
3. Enumerate every \`apex26.*\` localStorage key written anywhere in js/, and for each say which file(s) read it. Flag write-only keys.
4. Grep js/ for bare \`console.\` calls (AGENTS.md says all logging goes through Log) and list the offenders with file:line.
5. Grep js/ for \`addEventListener\` / \`setInterval\` / \`setTimeout\` / \`requestAnimationFrame\` calls whose file never calls the matching remove/clear — list them as leak CANDIDATES (do not judge, just tabulate file:line).
Report tables only. No opinions, no edits.`,
  },
]

const recon = await parallel(RECON_TASKS.map((t) => () =>
  agent(`${COMMON_BASE}\n\nYou are a RECON agent — mechanical evidence gathering, no judgement calls. ${t.prompt}`,
    { label: `recon:${t.k}`, phase: 'Recon', model: 'haiku', effort: 'low' })))

const RECON = recon.filter(Boolean).length
  ? `\n\nSTATIC RECON (already gathered by mechanical agents — cite it, do not re-derive it; VERIFY any line you actually report, the recon pass is fallible):\n${recon.filter(Boolean).map((r, i) => `--- recon ${RECON_TASKS[i] ? RECON_TASKS[i].k : i} ---\n${r}`).join('\n\n')}`
  : '\n\nSTATIC RECON: unavailable this run — derive what you need yourself.'

log(`recon: ${recon.filter(Boolean).length}/${RECON_TASKS.length} evidence packs gathered`)

const scout = scoutRun ? await scoutRun : null
const knownRows = (A.known && A.known.length) ? A.known : ((scout && scout.known) || []).slice(0, 30)
if (scoutRun) log(`prior art: ${knownRows.length} KNOWN rows seeded by prior-art-scout${scout ? '' : ' (scout returned nothing)'}`)
const KNOWN = knownRows.map((k, i) => `${i + 1}. ${k}`).join('\n') || '(none supplied this run)'

const COMMON = `${COMMON_BASE}

KNOWN FINDINGS — already recorded, queued, or deliberately deferred. Do NOT re-report these or trivial variants:
${KNOWN}${FOCUS}`

// The agent definitions pin one model (code-hunter: opus); a slice's tier still
// picks it, so data-shaped slices stay cheap: low → haiku, medium → sonnet,
// high → opus (the pre-agentType tiers, kept for cost).
const TIER_MODEL = { low: 'haiku', medium: 'sonnet', high: 'opus' }

// ───────────────────────── round-1 slices, effort-tiered ─────────────────────
// Every slice goes to agent code-hunter (its definition pins the model), so
// the tier is EFFORT, chosen by the SHAPE of the reading, not by file size:
//   low    — repetitive data-shaped files, pattern matching against a template
//   medium — ordinary domain modules
//   high   — dense stateful engine code, hot paths, security-facing protocol code

const R1 = [
  { k: 'game-loop',      e: 'high',   s: 'js/game.js, first half — read them ALL, in chunks. `wc -l js/game.js` first and split at the midpoint; the file grows every week, and a hard-coded split left its last ~800 lines unassigned to any agent. This is the entry point: the frame loop, physics integration, race flow. Highest-value scope in the tree. Emphases: per-frame allocation inside the loop, dead branches left by module extractions, G-façade properties nothing consumes, stale closures over race state, work done every frame that only changes per lap.' },
  { k: 'game-flow',      e: 'high',   s: 'js/game.js, second half through the LAST line — read them ALL, in chunks. Same emphases as the first half. Also: the AI and race-flow sections, and every `Module.create(G)` handoff — does each module actually receive what its file reads off G?' },
  { k: 'physics',        e: 'high',   s: 'every file in js/physics/ (aero-zones, ai-drive, body-attitude, brake-cue, collide, consts, debris-world, incident-sim). Emphases: sign and unit errors (+Y up, metres, radians, arc s, lateral x +right, +k = LEFT turn), per-frame allocation in collide/debris, constants duplicated between consts.js and game.js, and the AGENTS.md rule that nothing derived from track curvature may reach the player with assists off.' },
  { k: 'render-glx',     e: 'high',   s: 'js/render/gfx.js and every file in js/render/glx/ (glx.js, post.js, shadow.js, chunked.js) — NOT the shaders/ subdir. Emphases: per-frame GL state changes and uniform uploads that could be hoisted, buffers/textures created but never deleted, draw-call batching left on the table, dead uniforms, the Gfx seam contract.' },
  { k: 'render-wgx',     e: 'high',   s: 'every file in js/render/webgpu/ (wgx.js 6220 lines, wgsl-chunks, wgsl-post, wgsl-fx) — read wgx.js in full, in chunks. This backend has NO script tag by design (injected from ApexRoster.DEFERRED) — that is NOT dead code. Emphases: per-frame bind-group and pipeline churn, buffers written every frame that could be persistent-mapped, WGSL that diverges from the GLSL it mirrors, resources never destroyed.' },
  { k: 'render-tlx',     e: 'high',   s: 'every file in js/render/three/ (tlx.js, tlx-post, tlx-shadow, tlx-chunked, tsl-lit, tsl-post, tsl-sky, tsl-fx, tsl-chunks). The three.js library itself is vendored at vendor/three-0.185.1/ — NEVER audit that. Same DEFERRED caveat as WGX. Emphases: per-frame object/material allocation, node-material rebuilds, parity claims against GLX that are not true, disposal of geometries and render targets.' },
  { k: 'net',            e: 'high',   s: 'every file in js/net/ (lobby 1752, transport, netplay, nostr, handshake, rendezvous, sdp, session, snapshot, qr, scan, bytes). Emphases: data arriving from a peer or a relay that is used without validation (this is the security-facing surface); handshake/state-machine holes; reconnect paths that leak listeners or timers; snapshot encode/decode asymmetry; determinism leaks.' },
  { k: 'audio',          e: 'high',   s: 'every file in js/audio/ (engine.js 2451, spotify, panel, music-lib, rivals). Emphases: WebAudio nodes created per event and never disconnected (the classic leak), per-frame parameter writes that could be ramps, oscillators/buffers left running after a race ends, and dead layers in the engine mix.' },
  { k: 'track-core',     e: 'medium', s: 'every file in js/track/core/ (geom, line, mesh, space, spline, surface) plus js/track/tracks.js. This is the ENGINE half. Emphases: geometry built per frame that could be cached, allocation in centerline/curvature sampling, dead table entries, and frac-keyed reads that ignore `def._sceneryShift` (AGENTS.md says a raw frac read lands 2/3 of a lap away).' },
  { k: 'track-scenery',  e: 'medium', s: 'every file in js/track/scenery/ (city, nature, structures, identity, models, graph, data, circuit-kit, landmark-kit, themes). The 114-member scenery(api) contract is test-frozen — a member used by no circuit is still contract, report it as low severity only. Emphases: per-prop allocation during build, duplicated placement maths, unreachable emitter branches.' },
  { k: 'circuits-a',     e: 'low',    s: 'the FIRST 20 files of `ls js/circuits/*.js | sort`. These are DATA files following a shared template. Read each one. Look for: copy-paste residue from a sibling circuit (a key that names another track), keys the engine never reads, duplicate keys in one object literal, values outside plausible range (s beyond track.total, negative widths), and a curvature sign that contradicts the neighbouring comment.' },
  { k: 'circuits-b',     e: 'low',    s: 'the LAST 20 files of `ls js/circuits/*.js | sort`. Same instructions as circuits-a.' },
  { k: 'circuit-scen-a', e: 'medium', s: 'the FIRST 20 files of `ls js/circuits/scenery/*.js | sort` — the per-circuit scenery(api) callbacks. Emphases: props placed outside the track bounds or at an s past track.total, grounding calls omitted (floating/sunken props), side/sign convention errors, loops that allocate per prop, and whole blocks whose emitter is never reached.' },
  { k: 'circuit-scen-b', e: 'medium', s: 'the LAST 20 files of `ls js/circuits/scenery/*.js | sort`. Same instructions as circuit-scen-a.' },
  { k: 'glx-shaders',    e: 'medium', s: 'every file in js/render/glx/shaders/ (glsl-lit 1586, glsl-post 1460, glsl-sky, glsl-fx, glsl-chunks). Emphases: uniforms declared and never set from JS (and set-but-never-declared), branches on a constant, expensive per-fragment work that is loop-invariant or could be per-vertex, dead #ifdef paths, precision hazards.' },
  { k: 'render-shared',  e: 'medium', s: 'every file in js/render/shared/ (assets, driving-line, frustum, gltf, lamp-chunks, light-budget, post-common, shadow-pass). This is the backend-agnostic half — emphasis on helpers only one backend actually calls, and on per-frame work in frustum/shadow-pass.' },
  { k: 'car',            e: 'medium', s: 'every file in js/car/ (car3d 4136, liverytex 3129, car-mesh, car-draw, parts, liveries, helmets, ghost, crest-paths). Emphases: canvas/texture regeneration that could be cached, meshes rebuilt per frame or per car when one would do, catalog entries nothing references, and duplicated geometry maths across car3d/car-mesh/car-draw.' },
  { k: 'agent-api',      e: 'medium', s: 'every file in js/agent/ (apex.js 2841, agentview.js 2453, agentview-raster.js). This is the __apex dev API and the agent view. A hook used only from tests or a console is NOT dead code. Emphases: hooks that throw on a documented-valid call, hooks that silently no-op, raster work that allocates per call, and drift between a hook name and what it returns.' },
  { k: 'data',           e: 'medium', s: 'every file in js/data/ (telemetry 1532, api 834, hub, live, results, export, standings, teams, schedule, driver-ratings). Emphases: telemetry buffers that grow without bound, fetch paths with no error branch, cache TTL logic that never expires or always expires, response fields parsed and discarded, and per-frame telemetry sampling that could be throttled.' },
  { k: 'ui-a',           e: 'medium', s: 'these js/ui/ files: hud.js, select-screen.js, sheet-shape.js, menu-nav.js, track-maps.js, settings-export.js, results-sheet.js, modal.js. Emphases: DOM reads interleaved with writes (layout thrash) in anything that runs per frame or per pointer-move, listeners added on every screen entry and never removed, innerHTML rebuilt wholesale when one node changed, and handlers wired to ids that no longer exist in index.html.' },
  { k: 'ui-b',           e: 'medium', s: 'the REMAINING js/ui/ files: aria-state, css-zoom, debris-opts, dom, driving-line-opts, flags, key-binds, layers, onboard, quali-sheet, scale, scroll-fade, setting-row, settings-tabs. Same emphases as ui-a, plus: settings whose value is written to localStorage but never read back into the game.' },
  { k: 'input-perf-cam', e: 'medium', s: 'every file in js/input/ (input.js 1698, steer-tuning), js/perf/ (governor 719, renderer-picker 759, metrics-overlay 1146, quality-preset, gfx-debug-overlay, loop-health), js/camera/ (vantage, photo-cam, tuner-panel, offsets, mode-switch, cockpit-opts) and js/fx/ (particles, skidmarks). Emphases: per-frame allocation in particles and camera update, the governor acting on a metric it never actually samples, overlay DOM updated every frame instead of throttled, and input handlers doing work on every pointermove.' },
  { k: 'career-garage',  e: 'medium', s: 'every file in js/career/ (career-ui 1238, career 1070, custom-team, save-migrate, season-cal, season-ui) and js/garage/ (scene 1606, setup-sheet 1195, scene-live, scene-prims, scene-equipment, setup-tune). Emphases: save-schema fields written but never read (and vice versa) across save-migrate, migration branches for versions that can no longer exist, garage scene objects rebuilt on every slider move, and career economy maths with a wrong-direction sign.' },
  { k: 'lighting',       e: 'medium', s: 'every file in js/lighting/ EXCEPT presets.js (atmosphere, frame-lights, knobs, lighting, profiles, track-lights, tuner-panel). Emphases: per-frame light-array rebuilds, knobs declared in one file and consumed nowhere, the light budget being recomputed when nothing changed, and preset keys read with a name the preset table does not use.' },
  { k: 'lighting-data',  e: 'low',    s: 'js/lighting/presets.js ONLY — 17317 lines of pure data (window.LightPresets). Do NOT try to reason about rendering. Purely structural: duplicate keys inside one object literal, preset keys for circuits that do not exist in js/circuits/, circuits that have no preset entry, knob names in a preset that js/lighting/knobs.js does not define, and numeric values wildly outside their siblings\' range. Use grep and node to compare key sets rather than reading all 17k lines by eye.' },
  { k: 'race-core',      e: 'medium', s: 'every file in js/race/ (race-control, quali-model, quali-net, race-settings, reliability, daily-challenge), every file in js/core/ (log, store, mat4, hash32) and js/roster.js. NOTE js/roster.js is GENERATED — report drift against its source but never a style nit. Emphases: shared clamps in mat4 duplicated elsewhere, store.js subscribers never unsubscribed, race-control flags set but never read.' },
  { k: 'shell-css',      e: 'low',    s: 'index.html in full, every file in css/, sw.js, manifest.json. NOTE: index.html @gen-shell blocks and the ?v=dev tags are GENERATED and deliberate (AGENTS.md) — never report them. Emphases: dead CSS selectors and dead shell ids (cross-check the STATIC RECON tables at the end of this prompt), duplicated rule blocks, a sw.js precache list that does not match the shell, and script tags whose file does not exist.' },
  { k: 'tools',          e: 'medium', s: 'the tools/ tree (~40k lines across car, check, ci, env, gen, gfx, lib, lighting, mcp, moves, net, shot, track, ui and manifest.cjs). You cannot read all of it — read every file under tools/ci/ and tools/check/ in full, then skim the rest for the emphases. Emphases: a tool that would crash against the CURRENT layout (a path or symbol it references no longer exists), helpers in tools/lib/ that nothing imports, whole tools referenced by no skill/doc/script, and duplicated logic across tools that tools/lib/ already provides.' },
  { k: 'tests',          e: 'medium', s: 'tests/specs/ (118 spec files as of 2026-09-18 — `ls tests/specs/*.spec.js | wc -l`) and tests/helpers/. You cannot read them all in full — read every helper in full, then read specs selectively, prioritising the largest. Emphases ONLY: (a) dead code — helpers nothing imports, specs excluded from every group in tests/groups.json so they never run, skipped/commented-out tests; (b) bugs in the tests themselves — an assertion that cannot fail (expect(true), a tautology, an await-less expect), a spec that passes when the feature is broken; (c) perf — a fixture or page rebuilt per test that could be per-file. Do NOT audit what the tests assert about game semantics; that is another audit\'s job.' },
]

// ───────────────────────── the adversarial verify panel ──────────────────────
// Agent finding-verifier, twice per claim with DIFFERENT lenses (redundancy
// catches wrong claims; diversity catches claims that are wrong in a way one
// lens is blind to), then a high-effort tiebreak when a high-severity finding
// splits them. It takes ≤ 15 claims per call, so a batch is chunked.

const SKEPTICS = [
  {
    who: 'REACHABILITY',
    lens: `REACHABILITY AND MECHANISM. For a dead-code claim: search the ENTIRE tree yourself — js/, index.html, css/, tests/, tools/, docs/, and string-keyed dispatch tables and dynamically-built names — for any consumer. One consumer anywhere refutes the claim. For a bug claim: work out whether the triggering state is actually reachable, and whether an earlier guard already prevents it. For a perf claim: check the stated hotness against reality — open the caller chain and confirm the code really does run per frame. A perf claim whose hotness is inflated is REFUTED.`,
  },
  {
    who: 'INTENT',
    lens: `INTENT AND MATERIALITY. Before judging, check whether the thing is DELIBERATE: AGENTS.md, the relevant docs/ file, and the comments around the cited line (PACE as a ground-speed scale not a cap; ratcheted file sizes; generated files that must not be hand-edited, and the list below). Refute anything that is a documented or obviously-intentional design decision. Then ask materiality: would a maintainer actually act on this? Style noise, a micro-optimisation in boot or rare code, a "could be cleaner" with no defect behind it — all REFUTED.`,
  },
]

const VERIFY_CHUNK = 15
const bucket = (f) => `${f.file}:${f.kind}:${Math.round((f.line || 0) / 20)}`
const seen = new Set()
for (const k of (A.knownKeys || [])) seen.add(k)

const claimRows = (rows) => rows.map((c) => `${c.index}. ${c.file}:${c.line} — [${c.kind}, ${c.severity}, ${c.hotness}] ${c.claim} | finder's evidence: ${c.evidence}`).join('\n')

const refutePrompt = (rows, sk) => `lens: ${sk.lens}
${DELIBERATE}
Also REFUTED: a claim that duplicates one of these KNOWN items —
${KNOWN}
Schema mapping: index = the number the claim carries below; refuted=true for REFUTED, STALE, NEEDS-BROWSER or whenever you are unsure (start the reason with your verdict word); refuted=false only for CONFIRMED. One verdict per claim.
claims:
${claimRows(rows)}`

async function verifyBatch(fresh, round) {
  if (!fresh.length) return []
  const ph = `Verify ${round}`
  const compact = fresh.map((f, i) => ({ index: i, file: f.file, line: f.line, kind: f.kind, severity: f.severity, hotness: f.hotness, claim: f.claim, evidence: f.evidence }))
  const tag = `${fresh[0].file.split('/').pop()}+${fresh.length}`
  const chunks = []
  for (let j = 0; j < compact.length; j += VERIFY_CHUNK) chunks.push(compact.slice(j, j + VERIFY_CHUNK))
  const calls = SKEPTICS.flatMap((sk) => chunks.map((rows, ci) => ({ sk, rows, ci })))

  const votes = await parallel(calls.map((c) => () =>
    agent(refutePrompt(c.rows, c.sk), { label: `v${round}:${c.sk.who.toLowerCase()}:${tag}${chunks.length > 1 ? `#${c.ci + 1}` : ''}`, phase: ph, agentType: 'finding-verifier', effort: 'medium', schema: VERDICTS_SCHEMA })))

  if (!votes.some(Boolean)) { log(`verify ${round}: every skeptic call failed on ${tag} — ${fresh.length} findings dropped unjudged`); return [] }

  const refutes = fresh.map(() => 0), heard = fresh.map(() => 0), why = fresh.map(() => [])
  votes.forEach((v, n) => {
    if (!v) return
    const inChunk = new Set(calls[n].rows.map((r) => r.index))
    for (const verdict of (v.verdicts || [])) {
      const i = verdict.index
      if (inChunk.has(i)) { heard[i]++; if (verdict.refuted) { refutes[i]++; why[i].push(verdict.reason) } }
    }
  })

  const out = []
  for (let i = 0; i < fresh.length; i++) {
    const f = fresh[i]
    if (heard[i] === 0) continue                       // nobody judged it — do not assert it
    // A high-severity finding the two lenses SPLIT on gets a high-effort decider.
    if (f.severity === 'high' && heard[i] === 2 && refutes[i] === 1) {
      const tie = await agent(`${refutePrompt([compact[i]], { lens: 'TIEBREAK — two skeptics split on this claim, one refuted it, one did not. You are the decider. Apply BOTH lenses: is the code genuinely reachable/hot as claimed, AND is it a defect rather than a deliberate design choice (AGENTS.md, the relevant docs/ page)? Decide on the merits, not by splitting the difference.' })}\n\nThe refuting skeptic said: ${JSON.stringify(why[i])}`,
        { label: `tiebreak${round}:${f.file.split('/').pop()}:${f.line}`, phase: ph, agentType: 'finding-verifier', model: 'opus', effort: 'high', schema: VERDICTS_SCHEMA })
      const t = tie && tie.verdicts && tie.verdicts[0]
      if (t) { heard[i]++; if (t.refuted) { refutes[i]++; why[i].push(`[tiebreak] ${t.reason}`) } }
    }
    // high severity must be refuted twice to die; medium/low dies on one refute.
    const kill = f.severity === 'high' ? refutes[i] >= 2 : refutes[i] >= 1
    if (!kill) out.push({ ...f, round, skepticsHeard: heard[i], refutes: refutes[i] })
  }
  return out
}

// ───────────────────── find → verify, looped until dry ───────────────────────

const confirmed = []
const coverage = R1.map((r) => `round1:${r.k}`)
const coverageNotes = []
let gapPrompts = null
let roundsRun = 0

// Agent code-hunter's input contract is slice / focus / known; the rest is
// the lens this survey adds (hotness, severity, schema mapping, recon).
const finderPrompt = (scope, round) => `slice: ${scope}
focus: ${A.focus || 'bug, perf and dead-code'}
known:
${KNOWN}

Round ${round} of a whole-tree survey. Read every in-scope file IN FULL (large files in chunks) unless the slice says to sample.
${DELIBERATE}
hotness (required on every row): per-frame = runs in the render/physics loop every frame; per-lap = per lap, corner, sector, pointer or resize event; boot = startup, asset bake, circuit build, screen construction; rare = everything else; n/a for a non-perf row. A micro-optimisation in boot or rare code is NOISE — do not report it.
severity: high = user-visible misbehaviour, a frame-loop cost a player would feel, or a genuinely large dead subsystem; medium = real but bounded; low = true but small.
Schema mapping: your FINDING row's mechanism → claim; the trace (for dead-code, the search that found no consumer) plus your confidence → evidence; proposed fix → fix; your covered / not covered lines → coverageNote.${RECON}`

for (let round = 1; round <= MAX_ROUNDS; round++) {
  const prompts = round === 1
    ? R1.map((r) => ({ label: `find:${r.k}`, effort: r.e, text: finderPrompt(r.s, round) }))
    : (gapPrompts || []).map((g, i) => ({ label: `find${round}:gap${i + 1}`, effort: g.hard ? 'high' : 'medium', text: finderPrompt(g.scope, round) }))

  if (!prompts.length) { log(`round ${round}: no prompts left — audit is dry, stopping`); break }
  roundsRun = round
  const tally = prompts.reduce((acc, p) => { acc[p.effort] = (acc[p.effort] || 0) + 1; return acc }, {})
  log(`round ${round}: ${prompts.length} code-hunter finders (effort ${Object.entries(tally).map(([e, n]) => `${n}×${e}`).join(', ')})`)

  // pipeline, not a barrier: each finder's batch goes straight into the
  // skeptics while the other finders are still reading.
  const roundOut = await pipeline(
    prompts,
    (p) => agent(p.text, { label: p.label, phase: `Find ${round}`, agentType: 'code-hunter', model: TIER_MODEL[p.effort], effort: p.effort, schema: FINDINGS_SCHEMA }),
    (res, p) => {
      if (!res) { log(`${p.label}: finder returned nothing`); return [] }
      if (res.coverageNote) coverageNotes.push(`${p.label}: ${res.coverageNote}`)
      const fresh = []
      for (const f of (res.findings || [])) {
        const key = bucket(f)
        if (seen.has(key)) continue     // dedup against ALL findings ever seen,
        seen.add(key); fresh.push(f)    // not just confirmed ones — else rejects
      }                                 // resurface every round and never converge
      return verifyBatch(fresh, round)
    },
  )

  const survived = roundOut.filter(Boolean).flat()
  log(`round ${round}: ${survived.length} findings survived the skeptics (${survived.filter((f) => f.severity === 'high').length} high)`)
  confirmed.push(...survived)
  if (round === MAX_ROUNDS) break
  if (!survived.length) { log(`round ${round} yielded nothing new — stopping early`); break }

  // ── completeness critic: what lens did 29 scope-shaped finders miss? ──
  const critic = await agent(`${COMMON}

You are the COMPLETENESS CRITIC. A dead-code, bug and performance survey has run ${round} round(s). Scopes covered so far:
${JSON.stringify(coverage, null, 1)}

Finders self-reported these coverage gaps:
${coverageNotes.slice(-40).join('\n') || '(none reported)'}

Confirmed findings so far (file / kind / hotness / claim):
${JSON.stringify(confirmed.map((f) => ({ file: f.file, kind: f.kind, hotness: f.hotness, claim: f.claim })), null, 1)}

The finders were sliced by DIRECTORY. That structurally blinds them to anything that only shows up when you look ACROSS directories, and to any file a scope owner admitted skipping. Name what is still missing.

Cross-cutting lenses worth considering (drop the ones already well covered, and add better ones of your own):
- the frame budget end to end: walk one frame from the loop in game.js through physics, AI, track sampling, the renderer and the HUD, and find the work that repeats;
- allocation churn: every object/array/closure/string built per frame anywhere in the tree;
- listener / timer / GL-resource / WebAudio-node lifetime across a full screen transition (menu → race → results → menu);
- the G façade: properties game.js publishes that no module reads, and properties a module reads that game.js can leave undefined;
- boot cost: what runs before the first frame that could be deferred or cached;
- determinism: paths where Math.random or wall-clock time leaks past the __apex.seed contract;
- untrusted input: anything from a peer, a relay, a URL param or localStorage used without validation;
- a whole subsystem nothing entered: a feature reachable from no menu path;
- duplicated logic across directories that has already drifted apart;
- the largest files that a scope owner admitted it could not read in full.

Return up to ${MAX_GAP} gap prompts. Each becomes the \`slice:\` of one code-hunter agent, so make it SELF-CONTAINED: which lens, which concrete files to open, and what would count as evidence. Set hard=true on a prompt that needs deep engine/renderer/protocol reasoning (it will be given the highest effort). Return an EMPTY list if the survey is genuinely saturated — that is a real and useful answer.`,
    {
      label: 'critic', phase: 'Critic', model: 'opus', effort: 'high',
      schema: {
        type: 'object', required: ['gapPrompts'],
        properties: { gapPrompts: { type: 'array', items: {
          type: 'object', required: ['scope', 'hard'],
          properties: { scope: { type: 'string' }, hard: { type: 'boolean' } } } } },
      },
    })

  gapPrompts = critic ? (critic.gapPrompts || []).slice(0, MAX_GAP) : []
  if (critic && critic.gapPrompts && critic.gapPrompts.length > MAX_GAP) {
    log(`critic proposed ${critic.gapPrompts.length} gaps; capped to ${MAX_GAP} — the rest were NOT run`)
  }
  coverage.push(...gapPrompts.map((g, i) => `round${round + 1}:gap${i + 1}: ${g.scope.slice(0, 90)}`))
}

// ───────────────── perf triage: a different question, a different pass ───────
// A perf finding is not true or false the way a bug is — it is worth it or not.
// That judgement needs the whole-loop picture, so it gets its own opus pass.

const perfFindings = confirmed.filter((f) => f.kind === 'perf')
let perfTriage = null
if (perfFindings.length) {
  phase('Perf triage')
  perfTriage = await agent(`${COMMON}

You are the PERFORMANCE TRIAGE. Below are ${perfFindings.length} performance findings that already survived adversarial verification. Your job is not to re-litigate whether they are true — it is to rank them by REAL IMPACT on this game.

Build the picture first: read the frame loop in js/game.js and the renderer entry in js/render/glx/glx.js so you know what actually happens per frame, and read js/perf/governor.js and js/perf/loop-health.js to see what the game already measures and already adapts.

Then for each finding decide:
- **impact**: would a player on a mid-range machine notice it? Estimate the cost honestly (allocation per frame → GC pressure; a redundant uniform upload → near zero; an O(n²) over 20 cars → real).
- **effort**: a one-line hoist, a local refactor, or a redesign.
- **risk**: could the fix change rendering or physics behaviour? In this repo that matters — physics changes need the characterization gate, renderer changes need a boot-evidence check.

Output markdown, ordered strictly by impact-per-unit-effort — best first. Group them: "### Free wins" (high impact, one-line fix, no behaviour risk), "### Worth doing", "### Only if profiling confirms", "### Not worth it". Every finding lands in exactly one group; do not invent findings.

FINDINGS:
${JSON.stringify(perfFindings, null, 1)}`,
    { label: 'perf-triage', phase: 'Perf triage', model: 'opus', effort: 'high' })
}

// ─────────────────────────────── synthesis ──────────────────────────────────

phase('Synthesize')

const counts = confirmed.reduce((a, f) => { a[f.kind] = (a[f.kind] || 0) + 1; return a }, {})

const report = await agent(`${COMMON}

You are the SYNTHESIZER. ${confirmed.length} findings survived adversarial verification in a whole-tree survey for dead code, bugs and performance (${JSON.stringify(counts)}). Write ONE markdown report:

1. \`## Verdict\` — 4-8 sentences. How healthy is this tree? Where does the rot concentrate — which directories, which kind? Is the dominant problem dead weight, real defects, or wasted frame budget? Say something a maintainer could not have guessed from the file list.
2. \`## Fix now\` — the findings worth committing immediately, ordered by severity then by how cheap the fix is. One line each: \`file:line — claim → fix\`. Group by kind, and inside each kind note which are js/ (AGENTS.md: no cache bump needed, the deploy rewrites ?v=dev) and which are tools/tests/docs.
3. \`## Delete\` — every confirmed dead-code finding, batched into commits a maintainer could actually make (one per subsystem). For each batch, name the guard that must stay green: \`npm run test:guards\` always; note where \`tools/check/scan-globals.mjs --check\` or a ratchet update (\`node tools/check/ratchets.mjs --update\`) applies.
4. \`## Frame budget\` — the performance story in prose, then defer to the triage ranking below. If the triage is empty, say so.
5. \`## Defer\` — real findings not worth acting on now, each with the reason.
6. \`## Coverage and blind spots\` — what was surveyed, what the round-N critics added, what finders admitted they could not read in full, and what remains genuinely unsurveyed. Be honest; this section is what makes the next run cheaper.

Rules: every one of the ${confirmed.length} confirmed findings lands in exactly one of sections 2, 3, 4 or 5 — none may be dropped. Invent nothing that is not in the list. Where a finding needs verification before anyone acts on it, say which command proves it (per AGENTS.md: \`npm run test:tooling-fast\`, \`node tools/track/verify-track.cjs <id>\`, a single spec, or \`node tools/ci/pick-tests.mjs\`).

PERF TRIAGE (already ranked by a dedicated pass — reference it in section 4, do not redo it):
${perfTriage || '(no perf findings)'}

CONFIRMED FINDINGS:
${JSON.stringify(confirmed, null, 1)}

COVERAGE NOTES FROM FINDERS:
${coverageNotes.join('\n') || '(none)'}`,
  { label: 'synthesize', phase: 'Synthesize', model: 'opus', effort: 'high' })

return {
  report,
  perfTriage,
  confirmed,
  counts,
  totalConfirmed: confirmed.length,
  roundsRun,
  coverage,
  coverageNotes,
}
