# Generated Output Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put every disposable repository-local log, report, screenshot, gallery, profile, and render beneath `artifacts/` or `scratch/` without moving shipped assets or tracked visual baselines.

**Architecture:** A shared test helper gives every screenshot-producing suite a port-scoped `artifacts/galleries-<port>/<suite>/` path. Interactive capture tools default to `scratch/captures/`, render tools default to `scratch/renders/`, and profiles default to `scratch/profiles/`; explicit CLI output overrides remain supported. A dry-run-first migration utility preserves existing ignored output before legacy ignore rules are removed.

**Tech Stack:** Node.js ESM, Playwright, filesystem APIs, shell verification, Markdown documentation.

## Global Constraints

- Preserve the concurrent user edits in `CLAUDE.md`; merge with the latest file instead of replacing it.
- Do not delete or overwrite existing generated output. Migration conflicts receive a `.legacy-N` suffix.
- Keep `artifacts/test-results-<port>/`, `artifacts/report-<port>/`, `artifacts/logs/`, and `artifacts/tmp/`.
- Keep shipped media under `assets/`, committed generated runtime inputs in place, and tracked Playwright baselines under `tests/*-snapshots/`.
- Do not generate Linux/SwiftShader visual baselines from macOS.
- Do not introduce dependencies, symlinks, duplicate writes, `/tmp` output, or repository-root fallback paths.
- Preserve all explicit tool output arguments and `--out` options.
- Because JavaScript files change, bump every `?v=547` reference in `index.html` and `version.json` build `547` to `548`. If concurrent work advances build `547`, use exactly one greater than the latest build and apply that value everywhere.
- Do not create git commits unless the user explicitly requests them.

---

### Task 1: Port-scoped test gallery path helper

**Files:**
- Create: `tests/output-paths.js`
- Create: `tests/output-paths.spec.js`

**Interfaces:**
- Produces: `galleryDir(suite: string, ...segments: string[]): string`
- Produces: `galleryPath(suite: string, ...segments: string[]): string`
- Produces: `galleryUrl(suite: string, ...segments: string[]): string`
- All three functions use `process.env.APEX_PORT || "3456"` and reject path traversal.

- [ ] **Step 1: Write the failing helper contract tests**

Create `tests/output-paths.spec.js`:

```js
// @ts-check
import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { galleryDir, galleryPath, galleryUrl } from "./output-paths.js";

test("gallery paths are port-scoped and create their parent directories", () => {
  const port = process.env.APEX_PORT || "3456";
  const dir = galleryDir("output-paths", "nested");
  const file = galleryPath("output-paths", "nested", "frame.png");

  expect(dir).toBe(resolve(import.meta.dirname, "..", "artifacts", `galleries-${port}`, "output-paths", "nested"));
  expect(file).toBe(resolve(dir, "frame.png"));
  expect(existsSync(dir)).toBe(true);
  expect(galleryUrl("output-paths", "nested", "frame.png"))
    .toBe(`/artifacts/galleries-${port}/output-paths/nested/frame.png`);
});

test("gallery paths reject traversal and empty segments", () => {
  expect(() => galleryPath("../escape", "frame.png")).toThrow(/safe path segment/);
  expect(() => galleryPath("suite", "..", "frame.png")).toThrow(/safe path segment/);
  expect(() => galleryPath("suite", "")).toThrow(/safe path segment/);
});
```

- [ ] **Step 2: Run the tests and verify the helper is missing**

Run:

```sh
npm test -- tests/output-paths.spec.js
```

Expected: FAIL because `tests/output-paths.js` does not exist.

- [ ] **Step 3: Implement the helper**

Create `tests/output-paths.js`:

```js
// @ts-check
import { mkdirSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

function port() {
  const value = process.env.APEX_PORT || "3456";
  if (!/^\d+$/.test(value)) throw new Error(`invalid APEX_PORT: ${value}`);
  return String(Number(value));
}

function safe(parts) {
  for (const part of parts) {
    if (!SAFE_SEGMENT.test(part) || part === "." || part === "..") {
      throw new Error(`expected safe path segment, received: ${part}`);
    }
  }
  return parts;
}

export function galleryDir(suite, ...segments) {
  const dir = resolve(
    REPO_ROOT,
    "artifacts",
    `galleries-${port()}`,
    ...safe([suite, ...segments])
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function galleryPath(suite, ...segments) {
  const parts = safe([suite, ...segments]);
  if (segments.length === 0) {
    throw new Error("galleryPath requires a filename");
  }
  const file = resolve(REPO_ROOT, "artifacts", `galleries-${port()}`, ...parts);
  mkdirSync(dirname(file), { recursive: true });
  return file;
}

export function galleryUrl(suite, ...segments) {
  return "/" + posix.join(
    "artifacts",
    `galleries-${port()}`,
    ...safe([suite, ...segments]).map(encodeURIComponent)
  );
}
```

- [ ] **Step 4: Run the helper tests**

Run:

```sh
npm test -- tests/output-paths.spec.js
```

Expected: 2 tests pass and the run writes only beneath `artifacts/`.

- [ ] **Step 5: Version-control checkpoint**

Review `tests/output-paths.js` and `tests/output-paths.spec.js`. Do not commit unless the user explicitly requests a commit.

---

### Task 2: Root UI and parts screenshot writers

**Files:**
- Modify: `tests/ui-audit.spec.js`
- Modify: `tests/ui-desktop.spec.js`
- Modify: `tests/ui-button-touch.spec.js`
- Modify: `tests/hud-audit.spec.js`
- Modify: `tests/parts-budget.spec.js`
- Modify: `tests/parts-catalog.spec.js`
- Modify: `tests/parts-persistence.spec.js`
- Modify: `tests/dev-tools.spec.js`

**Interfaces:**
- Consumes: `galleryPath(suite, ...segments)` from Task 1.
- Produces: suite-specific PNGs beneath `artifacts/galleries-<port>/<suite>/`.

- [ ] **Step 1: Strengthen the helper test with the suite naming contract**

Add to `tests/output-paths.spec.js`:

```js
test("each producer can own a stable suite directory", () => {
  const port = process.env.APEX_PORT || "3456";
  expect(galleryPath("ui-audit", "portrait-main.png"))
    .toContain(`/artifacts/galleries-${port}/ui-audit/portrait-main.png`);
  expect(galleryPath("parts-budget", "budget-default.png"))
    .toContain(`/artifacts/galleries-${port}/parts-budget/budget-default.png`);
});
```

- [ ] **Step 2: Run the helper test**

Run:

```sh
npm test -- tests/output-paths.spec.js
```

Expected: 3 tests pass.

- [ ] **Step 3: Replace hard-coded UI screenshot paths**

Add `galleryPath` imports and use the following exact suite names:

```js
import { galleryPath } from "./output-paths.js";
```

```js
// tests/ui-audit.spec.js
await page.screenshot({
  path: galleryPath("ui-audit", `${name}.png`),
  fullPage: false,
});

// tests/ui-desktop.spec.js
await page.screenshot({
  path: galleryPath("ui-desktop", `${name}.png`),
  fullPage: false,
});

// tests/hud-audit.spec.js
await page.screenshot({
  path: galleryPath("hud-audit", `hud-audit-${name}.png`),
  fullPage: false,
});
```

In each file with literal names, replace:

```js
path: "tests/ui-screenshots/<filename>.png"
```

with the matching suite:

```js
path: galleryPath("ui-button-touch", "<filename>.png")
path: galleryPath("parts-budget", "<filename>.png")
path: galleryPath("parts-catalog", "<filename>.png")
path: galleryPath("parts-persistence", "<filename>.png")
path: galleryPath("dev-tools", "<filename>.png")
```

Keep each existing filename unchanged. Correct the `ui-audit` header to:

```js
// Run with: npm test -- tests/ui-audit.spec.js
// Output: artifacts/galleries-<port>/ui-audit/
```

- [ ] **Step 4: Prove no root UI writer retains the legacy path**

Run:

```sh
rg -n 'tests/ui-screenshots' \
  tests/ui-audit.spec.js tests/ui-desktop.spec.js tests/ui-button-touch.spec.js \
  tests/hud-audit.spec.js tests/parts-budget.spec.js tests/parts-catalog.spec.js \
  tests/parts-persistence.spec.js tests/dev-tools.spec.js
```

Expected: no matches.

- [ ] **Step 5: Run one representative screenshot-producing suite**

Run:

```sh
npm test -- tests/ui-desktop.spec.js
```

Expected: PASS; PNGs exist under the run's `artifacts/galleries-<port>/ui-desktop/`, and no new files appear under `tests/ui-screenshots/`.

- [ ] **Step 6: Version-control checkpoint**

Review only the eight screenshot writers and helper test additions. Do not commit unless explicitly requested.

---

### Task 3: Inspection, accuracy, and ad-hoc gallery writers

**Files:**
- Modify: `tests/inspect/_capture.js`
- Modify: `tests/f1-track-accuracy.spec.js`
- Modify: `tests/galleries/track-lap-audit.spec.js`
- Modify: `tests/galleries/track-trace.spec.js`
- Modify: `tests/galleries/all-tracks-buildings.spec.js`

**Interfaces:**
- Consumes: `galleryDir`, `galleryPath`, and `galleryUrl` from Task 1.
- Produces: output under one suite directory per writer.

- [ ] **Step 1: Move the inspection contact sheet to the helper contract**

In `tests/inspect/_capture.js`, replace the old output root with:

```js
import { galleryDir, galleryPath, galleryUrl } from "../output-paths.js";

const OUTROOT = galleryDir("inspect");
```

Write frames and sheets with:

```js
fs.writeFileSync(galleryPath("inspect", circuit, `${circuit}-${pct}.png`), buf);
fs.writeFileSync(galleryPath("inspect", `${circuit}-sheet.png`), sheet);
```

Generate contact-sheet image URLs with:

```js
const cells = labels.map((pct) => `
  <div class="cell">
    <img src="${galleryUrl("inspect", circuit, `${circuit}-${pct}.png`)}">
    <span>${pct}%</span>
  </div>`).join("");
```

Keep `OUTROOT` only if another line still needs the directory; otherwise remove
the unused constant and `path` import. The page has already navigated to the
active Playwright origin, so retain that origin and remove the unsupported
`baseURL` option:

```js
await page.setContent(html);
```

- [ ] **Step 2: Move the accuracy report**

In `tests/f1-track-accuracy.spec.js`, import `galleryDir`:

```js
import { galleryDir } from "./output-paths.js";
const OUT = galleryDir("f1-track-accuracy");
```

Remove the old `path.join(import.meta.dirname, "f1-track-accuracy")` assignment.
Keep all existing filenames and report JSON names.

- [ ] **Step 3: Move each excluded gallery**

Use imports relative to `tests/galleries/`:

```js
import { galleryDir, galleryPath } from "../output-paths.js";
```

Apply these exact suite roots:

```js
// track-lap-audit.spec.js
const BASE_OUT = galleryDir("track-lap-audit");

// track-trace.spec.js
const outDir = galleryDir("track-trace", TRACK);

// all-tracks-buildings.spec.js
const OUT = galleryDir("all-tracks-buildings");
```

Keep existing `path.join` calls when they join beneath these safe absolute
directories. Update the file headers to the real paths and commands:

```js
// npm test -- tests/galleries/track-lap-audit.spec.js
// npm test -- tests/galleries/track-trace.spec.js
// npm test -- tests/galleries/all-tracks-buildings.spec.js
// Output: artifacts/galleries-<port>/<suite>/
```

Remove the misleading `--update-snapshots` line from `track-lap-audit`; it uses
ordinary `page.screenshot()` output.

- [ ] **Step 4: Run focused path and gallery checks**

Run:

```sh
npm test -- tests/output-paths.spec.js
TRACK=monza FRAMES=2 npm test -- tests/galleries/track-trace.spec.js
```

Expected: helper tests pass; the two trace frames appear beneath
`artifacts/galleries-<port>/track-trace/monza/`.

- [ ] **Step 5: Verify no test writer uses a legacy generated directory**

Run:

```sh
rg -n 'tests/(ui-screenshots|track-trace|f1-track-accuracy|all-tracks-buildings)|galleries/ui-screenshots' tests --glob '*.js'
```

Expected: no executable-code matches.

- [ ] **Step 6: Version-control checkpoint**

Review the five gallery writers. Do not commit unless explicitly requested.

---

### Task 4: Interactive capture and profiling defaults

**Files:**
- Modify: `tools/apex-capture.mjs`
- Modify: `tools/survey-track.mjs`
- Modify: `tools/aerial-survey.mjs`
- Modify: `tools/motion-capture.mjs`
- Modify: `tools/ab-lighting.mjs`
- Modify: `.claude/skills/playwright-probe/shot.mjs`
- Modify: `.claude/skills/perf-profile/SKILL.md`

**Interfaces:**
- Existing CLI output arguments remain unchanged.
- Default output paths become purpose-specific children of `scratch/captures/`
  or `scratch/profiles/`.

- [ ] **Step 1: Change capture defaults without changing overrides**

Apply this exact mapping:

```text
tools/apex-capture.mjs cameras  -> scratch/captures/apex-capture/cameras
tools/apex-capture.mjs tracks   -> scratch/captures/apex-capture/tracks
tools/apex-capture.mjs identity -> scratch/captures/apex-capture/identity
tools/apex-capture.mjs lap-tour -> scratch/captures/apex-capture/lap-tour
tools/apex-capture.mjs modes    -> scratch/captures/apex-capture/modes
tools/survey-track.mjs          -> scratch/captures/survey-track/<id>
tools/aerial-survey.mjs         -> scratch/captures/aerial-survey/<track>
tools/motion-capture.mjs        -> scratch/captures/motion-capture/<track>
tools/ab-lighting.mjs           -> scratch/captures/ab-lighting
playwright-probe/shot.mjs       -> scratch/captures/playwright-probe/<generated-name>.png
perf-profile recipe             -> scratch/profiles/gameloop.cpuprofile
```

Representative implementations:

```js
const OUT = `${ROOT}/scratch/captures/survey-track/${id}`;
const OUT = path.join(ROOT, "scratch", "captures", "aerial-survey", TRACK);
const vdir = outArg || `${ROOT}/scratch/captures/motion-capture/${track}`;
const outDir = outIx >= 0
  ? rest.splice(outIx, 2)[1]
  : `${ROOT}/scratch/captures/ab-lighting`;
const out = resolve(
  outArg ||
  `scratch/captures/playwright-probe/${trackId}-${Math.round(frac * 100)}-${cam}.png`
);
```

For `apex-capture.mjs`, change only fallback defaults; leave every supplied
`outdir` path authoritative. Update its usage text and log examples in the same
edit.

- [ ] **Step 2: Keep directory creation and failure behavior explicit**

Confirm every default path reaches an existing `mkdirSync(..., { recursive:
true })` before its first write. Do not add catches that redirect failures.

- [ ] **Step 3: Run cheap command-level validation**

Run:

```sh
node --check tools/apex-capture.mjs
node --check tools/survey-track.mjs
node --check tools/aerial-survey.mjs
node --check tools/motion-capture.mjs
node --check tools/ab-lighting.mjs
node --check .claude/skills/playwright-probe/shot.mjs
node tools/ab-lighting.mjs list
```

Expected: all syntax checks succeed; the lighting catalog prints without
creating output.

- [ ] **Step 4: Verify legacy capture defaults are gone**

Run:

```sh
rg -n 'scratch/(cameras|tracks|identity|lap-tour|modes|survey-|aerial-|motion-|ab/)|scratch/gameloop\.cpuprofile' \
  tools .claude/skills --glob '*.{mjs,md}'
```

Expected: no obsolete default-path matches after documentation is completed in
Task 6.

- [ ] **Step 5: Version-control checkpoint**

Review capture defaults and retained CLI overrides. Do not commit unless explicitly requested.

---

### Task 5: Render defaults and safe legacy-output migration

**Files:**
- Modify: `tools/render-car.mjs`
- Modify: `tools/audit-parts.mjs`
- Modify: `tools/audit-aero.mjs`
- Create: `tools/migrate-output-layout.mjs`

**Interfaces:**
- `render-car.mjs --out=DIR` remains supported.
- Produces new defaults under `scratch/renders/{cars,parts,aero}/`.
- `migrate-output-layout.mjs` is dry-run by default and moves only with `--apply`.

- [ ] **Step 1: Move render defaults**

Use repository-root-relative destinations:

```js
// render-car.mjs
const OUT = resolve(HERE, arg("out", `../scratch/renders/cars/${TEAM}`));

// audit-parts.mjs
const dir = resolve(HERE, `../scratch/renders/parts/${cat}`);

// audit-aero.mjs
const dir = resolve(HERE, "../scratch/renders/aero");
```

Update comments and console messages to print those same destinations.

- [ ] **Step 2: Add a dry-run-first migration utility**

Create `tools/migrate-output-layout.mjs`:

```js
#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const APPLY = process.argv.includes("--apply");
const PORT = process.env.APEX_PORT || "3456";

if (!/^\d+$/.test(PORT)) {
  throw new Error(`invalid APEX_PORT: ${PORT}`);
}

const legacyTests = [
  "ui-screenshots",
  "track-trace",
  "f1-track-accuracy",
  "f1-circuit-directions",
  "monaco-cam",
  "scenery-shots",
  "trackmap-shots",
  "hooks-demo",
  "monaco-scenery",
  "all-tracks-buildings",
  "monaco-tour",
];

const moves = legacyTests.map((name) => [
  resolve(ROOT, "tests", name),
  resolve(ROOT, "artifacts", `galleries-${Number(PORT)}`, "legacy", name),
]);
moves.push([
  resolve(ROOT, "tests", "galleries", "ui-screenshots"),
  resolve(ROOT, "artifacts", `galleries-${Number(PORT)}`, "legacy", "gallery-ui-screenshots"),
]);
moves.push([
  resolve(ROOT, "tools", "render-out"),
  resolve(ROOT, "scratch", "renders", "legacy-render-out"),
]);

function availableDestination(wanted) {
  if (!existsSync(wanted)) return wanted;
  let n = 1;
  while (existsSync(`${wanted}.legacy-${n}`)) n++;
  return `${wanted}.legacy-${n}`;
}

function movePreserving(source, wanted) {
  if (!existsSync(source)) return;
  const destination = availableDestination(wanted);
  console.log(`${APPLY ? "move" : "would move"} ${source} -> ${destination}`);
  if (!APPLY) return;
  mkdirSync(dirname(destination), { recursive: true });
  try {
    renameSync(source, destination);
  } catch (error) {
    if (error?.code !== "EXDEV") throw error;
    cpSync(source, destination, { recursive: true, errorOnExist: true });
    rmSync(source, { recursive: true });
  }
}

for (const [source, destination] of moves) {
  movePreserving(source, destination);
}

if (!APPLY) {
  console.log("dry run only; rerun with --apply to move the listed directories");
}
```

- [ ] **Step 3: Validate migration behavior before moving data**

Run:

```sh
node --check tools/migrate-output-layout.mjs
node tools/migrate-output-layout.mjs
```

Expected: syntax succeeds and the dry run lists only existing legacy
directories; no filesystem paths move.

- [ ] **Step 4: Apply the migration**

Run:

```sh
node tools/migrate-output-layout.mjs --apply
```

Expected: existing ignored output moves under
`artifacts/galleries-3456/legacy/` or `scratch/renders/legacy-render-out/`.
Existing destinations are preserved with `.legacy-N` suffixes.

- [ ] **Step 5: Verify the old generated directories are absent**

Run:

```sh
node tools/migrate-output-layout.mjs
```

Expected: no `would move` lines remain.

- [ ] **Step 6: Version-control checkpoint**

Review the render defaults and migration utility. Do not commit unless explicitly requested.

---

### Task 6: Synchronize policy, skills, ignore rules, and cache version

**Files:**
- Modify: `.gitignore`
- Modify: `CLAUDE.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/DEBUG-HOOKS.md`
- Modify: `docs/LIGHTING-KNOBS.md`
- Modify: `tools/README.md`
- Modify: `.claude/skills/README.md`
- Modify: `.claude/skills/playwright-probe/SKILL.md`
- Modify: `.claude/skills/survey-track/SKILL.md`
- Modify: `.claude/skills/motion-capture/SKILL.md`
- Modify: `.claude/skills/debug-cameras/SKILL.md`
- Modify: `.claude/skills/debug-tracks/SKILL.md`
- Modify: `.claude/skills/lighting-tuner/SKILL.md`
- Modify: `.claude/skills/car-viewer/SKILL.md`
- Modify: `.claude/skills/bake-lighting/SKILL.md`
- Modify: `.claude/skills/perf-profile/SKILL.md`
- Modify: `index.html`
- Modify: `version.json`

**Interfaces:**
- Documentation publishes one directory contract matching executable defaults.
- `.gitignore` ignores `scratch/`, `artifacts/`, and underscore-prefixed
  transient tools without hiding legitimate shot/render tools.

- [ ] **Step 1: Simplify `.gitignore` after migration**

Keep:

```gitignore
# Regenerable output
scratch/
artifacts/

# Transient agent/debug scripts must be underscore-prefixed.
tools/_*.mjs
```

Remove the legacy `tests/*` gallery entries, `tools/render-out/`,
`tools/*probe*.mjs`, and `tools/*shot*.mjs`. Keep unrelated Node, Claude,
worktree, and other ignore rules unchanged.

- [ ] **Step 2: Update the central documentation**

Merge the latest `CLAUDE.md` and document:

```text
artifacts/test-results-<port>/  test failures, traces, attachments, JUnit
artifacts/report-<port>/        HTML report
artifacts/logs/                 shard and batch logs
artifacts/galleries-<port>/     test-emitted screenshots/reports
artifacts/tmp/                  one-off batch probes
scratch/captures/               interactive tool captures
scratch/renders/                car/parts/aero review sheets
scratch/profiles/               CPU/GPU profiles
```

State explicitly that `assets/`, committed generated sources, and
`tests/*-snapshots/` remain tracked outside these roots. Mention that the
current consolidated visual suite has no tracked replacement baselines and
that Linux/SwiftShader regeneration is a separate required operation before
`test:visual` can be a reliable regression gate.

Update `docs/TESTING.md` so:

```sh
npm test -- tests/ui-audit.spec.js
# output: artifacts/galleries-<allocated-port>/ui-audit/
```

Add the parallel-port report/gallery layout and clarify that excluded
`tests/{inspect,blank-scan,galleries}/` suites are run by explicit path.

Update `tools/README.md` with the new capture/render defaults, replace stale
tool descriptions with current filenames, and add the never-`/tmp` rule.

- [ ] **Step 3: Update project-local skill recipes**

Use these exact canonical examples:

```text
scratch/captures/playwright-probe/
scratch/captures/survey-track/<id>/
scratch/captures/motion-capture/<track>/
scratch/captures/apex-capture/<purpose>/
scratch/captures/ab-lighting/
scratch/renders/cars/<team>/
scratch/renders/parts/<category>/
scratch/renders/aero/
scratch/profiles/gameloop.cpuprofile
artifacts/tmp/presets.txt
```

In `bake-lighting/SKILL.md`, replace `$SCRATCH` with:

```sh
mkdir -p artifacts/tmp
cat > artifacts/tmp/presets.txt <<'BLOB'
# pasted tuner export
BLOB
node .claude/skills/bake-lighting/bake.mjs artifacts/tmp/presets.txt
```

In `playwright-probe/SKILL.md`, direct test screenshots to
`artifacts/galleries-<port>/<suite>/`, not `tests/ui-screenshots/`.
Add a one-line pointer to the `CLAUDE.md` output contract in
`.claude/skills/README.md`.

- [ ] **Step 4: Fix remaining root-level and stale examples**

Change the `docs/DEBUG-HOOKS.md` screenshot example from `t1.png` to
`artifacts/tmp/t1.png`. Update `docs/LIGHTING-KNOBS.md` to
`scratch/captures/ab-lighting/`. Correct stale gallery commands and comments
found by:

```sh
rg -n 'tests/(ui-screenshots|track-trace|f1-track-accuracy|all-tracks-buildings)|tools/render-out|\$SCRATCH|path: "t1\.png"' \
  CLAUDE.md docs tools .claude/skills tests --glob '*.{md,js,mjs}'
```

Expected after corrections: matches occur only in the historical design,
implementation plan, and migration utility where legacy paths are intentional.

- [ ] **Step 5: Bump the cache build once**

Change every asset query in `index.html` from `?v=547` to `?v=548` and set:

```json
{ "build": 548 }
```

If the latest files no longer contain build `547`, calculate one greater than
the latest shared value and use that one value in both files.

- [ ] **Step 6: Verify policy and cache consistency**

Run:

```sh
node -e 'const fs=require("fs"); const v=require("./version.json").build; const html=fs.readFileSync("index.html","utf8"); const q=[...html.matchAll(/\?v=(\d+)/g)].map(m=>+m[1]); if(!q.length||q.some(n=>n!==v)) process.exit(1); console.log(`build ${v}: ${q.length} asset URLs aligned`)'
git check-ignore -v artifacts/galleries-3456/ui-audit/a.png scratch/renders/cars/mclaren/hero.png
if git check-ignore -q tests/tracks-visual.spec.js-snapshots/example.png; then
  echo "snapshot baseline is incorrectly ignored"
  exit 1
fi
if git check-ignore -q tools/carshot.mjs; then
  echo "legitimate tool is incorrectly ignored"
  exit 1
fi
```

Expected: cache values align; generated roots are ignored; snapshot baselines
and legitimate tools are not ignored.

- [ ] **Step 7: Version-control checkpoint**

Review documentation against executable defaults and inspect the merged
`CLAUDE.md` diff carefully. Do not commit unless explicitly requested.

---

### Task 7: Integration verification

**Files:**
- Verify all modified files.

**Interfaces:**
- Consumes all prior tasks.
- Produces an evidence-backed clean handoff with no generated-path leaks.

- [ ] **Step 1: Check syntax**

Run:

```sh
node --check tests/output-paths.js
node --check tests/output-paths.spec.js
node --check tests/inspect/_capture.js
node --check tests/f1-track-accuracy.spec.js
node --check tests/galleries/track-lap-audit.spec.js
node --check tests/galleries/track-trace.spec.js
node --check tests/galleries/all-tracks-buildings.spec.js
node --check tools/migrate-output-layout.mjs
node --check tools/render-car.mjs
node --check tools/audit-parts.mjs
node --check tools/audit-aero.mjs
```

Expected: every command exits zero.

- [ ] **Step 2: Run fast regression gates**

Run independently:

```sh
npm run test:audit
npm run test:smoke
npm test -- tests/output-paths.spec.js
```

Expected: all checks pass.

- [ ] **Step 3: Verify a test gallery**

Run:

```sh
TRACK=monza FRAMES=2 npm test -- tests/galleries/track-trace.spec.js
```

Expected: PASS with two PNG files under the allocated
`artifacts/galleries-<port>/track-trace/monza/`.

- [ ] **Step 4: Verify an interactive render default**

Start the existing static server only if port 3456 is free, then run:

```sh
node tools/render-car.mjs --team=mclaren --views=hero
```

Expected: the command succeeds and writes its PNG/contact sheet under
`scratch/renders/cars/mclaren/`.

- [ ] **Step 5: Audit executable output literals**

Run:

```sh
rg -n 'tests/(ui-screenshots|track-trace|f1-track-accuracy|all-tracks-buildings)|tools/render-out|/tmp/' \
  tests tools .claude/skills --glob '*.{js,mjs}'
```

Expected: only the migration utility's declared legacy source paths match.

- [ ] **Step 6: Confirm legacy directories and root leaks are absent**

Run:

```sh
for p in tests/ui-screenshots tests/track-trace tests/f1-track-accuracy \
  tests/all-tracks-buildings tests/galleries/ui-screenshots tools/render-out \
  test-results playwright-report; do
  test ! -e "$p" || { echo "legacy output remains: $p"; exit 1; }
done
```

Expected: exit zero with no output.

- [ ] **Step 7: Read IDE diagnostics**

Check diagnostics for all edited JavaScript and tool files. Fix only issues
introduced by this change, then rerun the focused checks that cover those
files.

- [ ] **Step 8: Review the final diff and status**

Confirm:

- unrelated `CLAUDE.md` content remains;
- existing generated data is under `artifacts/` or `scratch/`;
- no visual baselines were generated or deleted;
- `index.html` and `version.json` use one build number;
- no accidental root-level files or new dependencies exist.

- [ ] **Step 9: Final version-control checkpoint**

Present the diff and verification results. Do not commit or push unless the
user explicitly requests it.
