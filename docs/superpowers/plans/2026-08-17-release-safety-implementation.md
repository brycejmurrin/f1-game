# Release Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove verified release-safety defects in the shell, workflow dispatch,
vendored licence metadata, and browser-MCP wrappers.

**Architecture:** Keep runtime changes narrow and assertion-backed. Shell and
workflow validation become structural Node tests; wrappers share the existing
Chromium-path discovery and write all reports under the repository artifact
roots. No browser probe becomes a CI gate.

**Tech Stack:** Static HTML/JavaScript, GitHub Actions YAML, Node `node:test`,
Bash, Python 3, Chrome DevTools MCP.

## Global Constraints

- No new runtime dependency or build step.
- Browser probes are interactive diagnostics, never a replacement for
  Playwright.
- Cache build bump is the final runtime-shell edit.
- Browser tests run serially and only after source edits stop.
- Workflow inputs must not be interpolated into executable shell source.

---

### Task 1: Make service-worker registration build-safe

**Files:**
- Modify: `index.html:63-74,126`
- Modify: `tests/unit/load-order.test.mjs`

**Interfaces:**
- Consumes: stylesheet URLs with a uniform `?v=<build>` query.
- Produces: a service-worker registration URL exactly equal to
  `sw.js?v=<build>` when a build is present.

- [ ] **Step 1: Write the failing structural assertions**

```js
assert.doesNotMatch(shell, /href\*="\?v=\d+"/,
  "inline shell code must discover a version, not embed one");
assert.match(shell, /register\("sw\.js" \+ \(loaded \? "\?v=" \+ loaded : ""\)\)/,
  "service-worker registration must append the parsed build once");
```

- [ ] **Step 2: Run the focused suite**

Run: `node --test tests/unit/load-order.test.mjs`

Expected: FAIL because the shell contains the build-specific selector and
concatenates `?v=1281` with `loaded`.

- [ ] **Step 3: Implement the minimal shell correction**

```js
var link = document.querySelector('link[rel="stylesheet"][href*="?v="]');
// ...
navigator.serviceWorker.register("sw.js" + (loaded ? "?v=" + loaded : ""));
```

Apply the generic selector at both existing inline version-discovery sites.

- [ ] **Step 4: Re-run the focused suite**

Run: `node --test tests/unit/load-order.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/unit/load-order.test.mjs
git commit -m "fix: register service worker with parsed build"
```

### Task 2: Remove workflow-dispatch shell injection

**Files:**
- Modify: `.github/workflows/import-models.yml:43-114`
- Create: `tests/unit/import-models-workflow.test.mjs`

**Interfaces:**
- Consumes: workflow-dispatch URL and branch inputs.
- Produces: validated values passed through environment variables, never
  expression-expanded into shell command text; rejects the deploy branch.

- [ ] **Step 1: Write failing workflow-source assertions**

```js
assert.match(workflow, /env:\s*\n(?:.*\n)*?\s*MODEL_URL: \$\{\{ inputs\.url \}\}/);
assert.match(workflow, /case "\$COMMIT_BRANCH" in/);
assert.doesNotMatch(workflow, /git checkout -B \$\{\{ inputs\.commit_branch \}\}/);
```

- [ ] **Step 2: Run the focused suite**

Run: `node --test tests/unit/import-models-workflow.test.mjs`

Expected: FAIL because workflow expressions are embedded in shell commands.

- [ ] **Step 3: Implement validation and environment transport**

Use step-level `env` for `MODEL_URL` and `COMMIT_BRANCH`. Validate an HTTPS URL
with a shell `case` and validate branch syntax with
`^[a-z0-9][a-z0-9._/-]*$`; reject
`claude/f1-game-project-26h3ng` explicitly. Use only quoted variables:

```bash
case "$COMMIT_BRANCH" in
  claude/f1-game-project-26h3ng|""|*[!a-z0-9._/-]*)
    echo "unsafe branch"; exit 2 ;;
esac
git checkout -B "$COMMIT_BRANCH"
```

- [ ] **Step 4: Re-run the focused suite**

Run: `node --test tests/unit/import-models-workflow.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/import-models.yml tests/unit/import-models-workflow.test.mjs
git commit -m "fix: validate model-import workflow inputs"
```

### Task 3: Correct vendored licence governance

**Files:**
- Modify: `vendor/rapier-0.19.3/LICENSE`
- Create: `vendor/THIRD_PARTY_NOTICES.md`
- Modify: `tests/unit/net-trystero-api.test.mjs`

**Interfaces:**
- Consumes: each shipped `vendor/<name-version>/` directory.
- Produces: a text notice recording package, version, source, licence, and
runtime consumer; an Apache-2.0 Rapier licence file.

- [ ] **Step 1: Write failing vendor assertions**

```js
assert.match(read("vendor/rapier-0.19.3/LICENSE"), /Apache License[\s\S]*Version 2\.0/);
assert.match(read("vendor/THIRD_PARTY_NOTICES.md"), /rapier-0\.19\.3/);
assert.match(read("vendor/THIRD_PARTY_NOTICES.md"), /three-0\.184\.0/);
assert.match(read("vendor/THIRD_PARTY_NOTICES.md"), /jsqr-1\.4\.0/);
```

- [ ] **Step 2: Run the focused suite**

Run: `node --test tests/unit/net-trystero-api.test.mjs`

Expected: FAIL until the licence and notice exist.

- [ ] **Step 3: Install upstream licence text and write notices**

Replace the Rapier file with the complete Apache License 2.0 text. Add a
human-readable notice table that identifies Rapier, three.js, Trystero, jsQR,
their vendored directory, upstream source URL, licence, and Apex runtime
feature.

- [ ] **Step 4: Re-run the focused suite**

Run: `node --test tests/unit/net-trystero-api.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add vendor/rapier-0.19.3/LICENSE vendor/THIRD_PARTY_NOTICES.md tests/unit/net-trystero-api.test.mjs
git commit -m "fix: document vendored runtime licences"
```

### Task 4: Make Chromium/TinyFish wrappers reliable diagnostics

**Files:**
- Modify: `tools/mcp-cli.mjs:55-62`
- Modify: `tools/chrome-devtools-mcp.sh:10,59-66`
- Modify: `tools/tinyfish-mcp.sh:88-150`
- Modify: `tools/cdmcp-measure.py`
- Modify: `tests/unit/cdmcp-measure.test.mjs`

**Interfaces:**
- Consumes: an installed Chromium path, MCP JSON-RPC responses, and optional
  TinyFish proxy session state.
- Produces: a single Chromium launcher path, pinned MCP package version,
  JSON-escaped TinyFish requests, and Chromium reports under `artifacts/`.

- [ ] **Step 1: Write failing wrapper-source assertions**

```js
assert.doesNotMatch(read("tools/mcp-cli.mjs"), /\/opt\/pw-browsers\/chromium/);
assert.match(read("tools/mcp-cli.mjs"), /chrome-devtools-mcp\.sh/);
assert.match(read("tools/tinyfish-mcp.sh"), /json\.dumps/);
assert.doesNotMatch(read("tools/cdmcp-measure.py"), /\/tmp\/chrome-devtools-mcp-/);
```

- [ ] **Step 2: Run the focused suite**

Run: `node --test tests/unit/cdmcp-measure.test.mjs`

Expected: FAIL on the current hardcoded Chromium and report-path behavior.

- [ ] **Step 3: Implement the shared wrapper behavior**

Make `mcp-cli.mjs` spawn `tools/chrome-devtools-mcp.sh run` rather than `npx`
with a hardcoded executable. Pin the fallback package version in
`chrome-devtools-mcp.sh` using one `MCP_VERSION` constant. Build TinyFish URL
and query JSON with Python `json.dumps`, not `printf` interpolation. Configure
the Chromium measurement tool to copy or emit report files beneath
`artifacts/logs/cdmcp/`.

- [ ] **Step 4: Re-run the focused suite and live discovery**

Run:

```bash
node --test tests/unit/cdmcp-measure.test.mjs
python3 tools/cdmcp-cli.py list-tools
```

Expected: PASS; live discovery prints a nonzero tool count.

- [ ] **Step 5: Commit**

```bash
git add tools/mcp-cli.mjs tools/chrome-devtools-mcp.sh tools/tinyfish-mcp.sh \
  tools/cdmcp-measure.py tests/unit/cdmcp-measure.test.mjs
git commit -m "fix: harden diagnostic MCP wrappers"
```

### Task 5: Align operational instructions

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `.claude/skills/mcp-probe/SKILL.md`
- Modify: `.claude/skills/check-changes/SKILL.md`
- Modify: `tests/unit/docs-integrity.test.mjs`

**Interfaces:**
- Consumes: the canonical `CLAUDE.md` policy.
- Produces: a tested `AGENTS.md` mirror and no stale hardcoded suite/build
counts in live agent paths.

- [ ] **Step 1: Write failing parity assertion**

```js
assert.equal(read("AGENTS.md"), read("CLAUDE.md"),
  "AGENTS.md must remain an exact mirror of the canonical Claude guide");
```

- [ ] **Step 2: Run the focused suite**

Run: `node --test tests/unit/docs-integrity.test.mjs`

Expected: FAIL because the two guidance files differ.

- [ ] **Step 3: Make policy and skill text consistent**

Copy the canonical guide to `AGENTS.md`. Update live guidance to state one
browser group is recommended, the tool cap is only a ceiling, the deploy branch
is protected instead of `main`, and repository captures use `artifacts/` or
`scratch/`. Remove stale numeric prose where a command can report the value.

- [ ] **Step 4: Re-run the focused suite**

Run: `node --test tests/unit/docs-integrity.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md CLAUDE.md .claude/skills/mcp-probe/SKILL.md \
  .claude/skills/check-changes/SKILL.md tests/unit/docs-integrity.test.mjs
git commit -m "docs: synchronize agent operating guidance"
```

## Verification

- [ ] Run `npm run test:tooling-fast`.
- [ ] Run `node tools/ci/pick-tests.mjs --staged` and execute only selected
  Node-safe checks before browser work.
- [ ] Bump the shell cache build as the final runtime change, then re-run
  `tests/unit/load-order.test.mjs`.
- [ ] Push each logical commit and update the draft PR before starting the next
  tranche.
