# Localisation (i18n) — plan (2026-10-04)

Date: 2026-10-04
Status: **PLAN** — docs-only; implement as ten draft PRs against `claude/f1-game-project-26h3ng`, one slice each, in the
order below. Do not merge; the merge worker takes green ready PRs one at a time (AGENTS.md §Concurrent PRs).
Scope: a no-build-step translation layer (`I18n` global, lazily fetched locale JSON, English fallback), the language picker,
pseudo-locale layout testing, a contribution lint, and an incremental screen-by-screen migration. NOT a translation of the
whole game in one PR, and NOT voice re-recording beyond an optional late slice.

A path written `js/<new>/…`, `tools/<new>/…` or `tests/<new>…` is a PROPOSED file: drop the `<new>/` segment when creating it
(the core file lands in js/core/, the lint in tools/check/). `locales/…`
is a new top-level data directory. Every other backticked path exists on disk (verified 2026-10-04).

## Related (do not duplicate)

| Doc | Role vs this plan |
|---|---|
| [`2026-09-30-player-a11y.md`](2026-09-30-player-a11y.md) | Accessibility slices (grip steer, comfort). Same house rules; a language picker lives next to its comfort/settings rows, not inside it. |
| [RACE-RADIO-REDESIGN-2026-09.md](../research/RACE-RADIO-REDESIGN-2026-09.md) | Why radio lines are `{slot}` templates and how the voice pack splices clips. The translation unit for radio is already there. |
| [VOICE-LAG-IPHONE-2026-10-01.md](../notes/VOICE-LAG-IPHONE-2026-10-01.md) | Speech-synthesis latency evidence; constrains the SpeechSynthesis fallback below. |
| [UI-MAP.md](../UI-MAP.md) | Screen inventory used to order the migration. |
| `.claude/skills/ui-menu-a11y`, `.claude/skills/survey-ui-matrix`, `.claude/skills/pwa-cache-service-worker` | Layout, matrix survey and precache rules this plan must obey. |

## Goal

1. A player can pick a language (or accept the detected one) and see menus, HUD labels, Garage, Career, Data Hub chrome and
   radio/announcer captions in it; every missing key falls back to English, never to a blank or a raw key.
2. English players pay nothing: no extra request, no flash, no behaviour change, offline boot unchanged.
3. Adding a language is a JSON-only community PR that a lint can fully validate without a browser.
4. Migration is incremental: each slice converts one screen family, and a guard stops NEW hard-coded strings in files already converted.
5. `js/game.js` does not grow (ratchet `js/game.js`: 8982 lines / 4816 codeLines / gMembers 285 / topLets 149, slack 0).

## Non-goals

RTL layout (deferred, Design §RTL); translating proper names, brand and legal text; localising lap times, gaps, telemetry and tyre codes; re-recording
Kokoro packs beyond one optional late slice; shipping machine translations without a reviewer (unreviewed locales are labelled BETA).

## Current state (MEASURED 2026-10-04, tip of this checkout)

Method: grep/wc over the tree; counts are lines or sites, not words, unless stated. Heuristic upper/lower bounds where noted.

| Surface | Measured | Note |
|---|---|---|
| JS tree | 422 files, 226 276 lines under `js/` | |
| `index.html` | 3704 lines, `<html lang="en">` hard-coded, 0 `data-i18n` | owns ALL static DOM (AGENTS.md) |
| `index.html` text | ~1013 single-line text nodes with 3+ letters (~6900 words, a lower bound: multi-line text is missed); 385 `<button>`; 307 `<option>` | |
| `index.html` attributes | 317 `aria-label`, 35 `title`, 10 `placeholder`; 7 `aria-live` regions | attributes need `data-i18n-attr`, not just text |
| JS text sinks | 626 `textContent =` and 21 `innerHTML =` across `js/`; 153 `setAttribute("aria-label"/"title"/"placeholder")` | by directory below |
| `js/ui` | 221 `textContent`/`innerHTML` writes in 14 528 lines | biggest surface (HUD, settings, results, quali) |
| `js/game.js` | 14 writes, 8982 lines | ratchet slack 0 |
| Garage parts | `js/car/parts.js`: 313 `label:` entries in `CATALOG` (category + option names, e.g. "ENGINE") | upper-case technical nouns |
| Radio / engineer | `js/race/radio-lines.js`: 68 pools, ~245 template strings with `{slot}` holes (`"P{pos}. NICE MOVE"`), all UPPER-CASE | already translation-shaped |
| Engineer / spotter | `js/race/engineer.js` 44 and `js/race/spotter.js` 19 long literals | mix of templates and concatenation |
| Announcer | `js/audio/announcer.js`: 208 literals ≥ 12 chars in 861 lines | commentary + loading-card lines |
| Other prose modules | `js/race/driving-coach.js` 746 lines, `js/race/race-insights.js` 543, `js/race/race-facts.js` 365, `js/data/circuit-lore.js` 276, `js/data/legends.js` 489 | long-form English; circuit-lore/legends are lore, translate last |
| Concatenation | 427 `"text" + expr` sites and 197 template literals with `${}` in `js/race js/audio js/ui js/career js/data js/garage` | the hard part: word order and plurals cannot be fixed by swapping words |
| Hand-rolled plurals | 8 sites of the form `n === 1 ? "" : "s"` (`js/race/driving-coach.js` 3, `js/audio/panel.js` 3, `js/audio/announcer.js` 2, `js/ui/results-sheet.js`, `js/editor/designer.js`, `js/editor/fixes.js`) | English-only rule; Slavic/Arabic need more forms |
| Locale-aware formatting | 26 `toLocale*` calls (17 in `js/career/career-ui.js` for money, 4 in `js/data/schedule.js`/`js/data/live.js`/`js/data/hub.js` for dates), `Intl.` used 0 times, all with `undefined` locale (= browser, not game, language) | |
| Lap/gap formatters | 30 `fmt*`/`format*` definitions; 18 `fmtLap` references; canonical one is `Dom.fmtLap` in `js/ui/dom.js`; duplicates in `js/editor/designer.js`, `js/race/real-replay.js`, `js/input/phone-pad.js`, `js/game.js` (`fmtTime`) | stays "." decimal and untranslated |
| Case mapping | 113 `toUpperCase()` calls, 24 `text-transform: uppercase` rules | Turkish dotted/dotless i and German ß break naive upper-casing; use `toLocaleUpperCase(lang)` for translated text |
| Layout risk | 79 `nowrap`, 43 `text-overflow` rules in `css/`; physical `margin/padding-left/right/left:/right:` 248 vs logical `inline-start/end` 38 | German/Finnish run 30-40 % longer; the UI is UPPER-CASE, tight and truncating |
| Speech | `js/audio/radio-voice.js` already filters `speechSynthesis.getVoices()` by `document.documentElement.lang` (line ~312); `js/audio/announcer.js` and `js/race/spotter.js` call `speechSynthesis` | setting `<html lang>` correctly already steers voice choice |
| Recorded voice | `assets/voice/*.bin|json`: 6 Kokoro-82M packs, 26 MB total (george 4.1 MB, bella 6.6 MB, fable 6.3 MB, michael 3.9 MB, emma 2.5 MB, heart 2.8 MB); clips keyed by lower-cased English text (`VoicePack.lineKey`) | a non-English line has no clip key, so `RadioVoice` already falls back to speech synthesis for it |
| Kokoro languages (verified, https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) | American English 20 voices, British English 8, Japanese 5, Mandarin 8, Spanish 3, French 1 (B-), Hindi 4, Italian 2 (C), Brazilian Portuguese 3. **No German, no Dutch.** Non-English grades are lower ("weak G2P and/or lack of training data") | |

Seams to reuse: `js/core/store.js` (`apex26.*` keys), `js/ui/setting-row.js` (the language control), `js/ui/settings-export.js`,
`js/data/settings-defaults.js`, `js/core/lazy-bundles.js` (lazy precedent),
`tools/check/html-sink-lint.mjs` + `tests/data/html-sink-allowlist.json` (the audit-plus-allowlist pattern the string guard copies).

## Design

### The `I18n` global (`js/<new>/i18n.js`, IIFE, loads right after `js/core/store.js`)
- `I18n.t(key, vars, englishDefault)`: look up `key` in the active catalogue, then English, then the inline default, then the key.
  `vars` fills `{name}` holes. The **English default lives at the call site** (gettext style): English needs no fetch, works
  synchronously at module eval, offline, and with no flash; `locales/en.json` is GENERATED from the call sites and
  `data-i18n` nodes by `tools/<new>/gen-locales.mjs` (a generated file: add it to the edit-hook list; `npm run gen` covers drift).
  A lint checks that the call-site default equals the `locales/en.json` entry.
- Plurals: ICU-lite message syntax only for what we need, `{n, plural, one {# lap} other {# laps}}`, resolved with
  `Intl.PluralRules(lang)`; no `select`, no nesting. Keys with plurals are the ONLY multi-form strings; lint verifies each locale
  provides the CLDR categories for that language (`Intl.PluralRules(lang).resolvedOptions().pluralCategories`).
- Placeholders are `{name}`, the syntax `js/race/radio-lines.js` already uses, so radio pools migrate verbatim. Lint fails when a
  translation's placeholder set differs from English's.
- Lists of interchangeable variants (radio pools) are JSON arrays under one key; the deck shuffler in `js/race/radio-lines.js`
  keeps working on the array it is handed (deck state keyed by pool name, not by language, so a language switch resets nothing).
- `I18n.n(x, opts)`, `I18n.date(d, opts)`, `I18n.rel(v, unit)`, `I18n.list(arr)`, `I18n.country(code)`, `I18n.compare(a,b)` wrap
  `Intl.NumberFormat`, `DateTimeFormat`, `RelativeTimeFormat`, `ListFormat`, `DisplayNames`, `Collator`, cached per language.
  The 26 `toLocale*` sites move to these (money, schedule dates, hub timestamps) in the slice that migrates their screen.
- `I18n.lang()`, `I18n.set(lang)` (persists `apex26.lang`, sets `<html lang>`, loads the catalogue, fires `I18n.onChange(fn)`),
  `I18n.ready()` (promise). `I18n.dir()` returns `"ltr"` until RTL is built.
- No ES modules, no dependency: one IIFE exposing one frozen global, a `tools/manifest.cjs` entry, then `node tools/gen/gen-shell.mjs`.
  Callers invoke `I18n.t` at USE time, never destructure at eval, so no HARD_EDGES pair is needed.

### Static DOM
`index.html` keeps its English text in place (still the readable source, still correct with JS off). A node opts in with
`data-i18n="screen.key"` (text) or `data-i18n-attr="aria-label:screen.key;title:screen.key2"` (attributes). A tiny applier
(`js/<new>/dom-apply.js`) walks `[data-i18n]` once on load when the language is not English and again on `I18n.onChange`,
touching `textContent` only (never `innerHTML`, so it adds no html-sink-lint site). Nodes keep their ids and classes: this adds
attributes only, so `shellNodes` (2135, slack 25) and `cssClasses` (641, slack 5) are unaffected. `index.html` is edited by hand
for attributes; the `@gen-shell` blocks are not touched.

### Language detection, picker, persistence
- Order: saved `apex26.lang` (via `js/core/store.js`) > `navigator.languages` matched against the shipped list in
  `locales/manifest.json` (exact tag, then base language, e.g. `pt-PT` to `pt-BR` only if the owner agrees) > `en`.
- Picker: a `SettingRow` (`js/ui/setting-row.js`) in the SETTINGS general tab (`js/ui/settings-tabs.js`), options labelled in their
  own language (autonyms: "Español", "Deutsch", "日本語") so a lost player can find it; plus a first-run offer only when
  detection finds a non-English match (a single dismissible line, never a blocking modal). Add the key to `js/ui/settings-export.js`
  SPEC; deliberately NOT in `js/data/settings-defaults.js` (detection, not a default, decides it).
- Switching language re-applies live (no reload): `I18n.onChange` re-runs the DOM applier and screens re-render their text on open.
  In-flight race HUD labels update on the next frame they are written; captions already on screen finish in the old language.

### Locale files and the service worker
- `locales/manifest.json` (tiny): `{ "<lang>": { "name": "Español", "dir": "ltr", "status": "beta|reviewed", "hash": "<sha8>", "keys": N } }`.
- `locales/<lang>.json`: flat `"key": "string"` plus `"key": ["variant", …]` for pools; one file per language, lazily
  `fetch()`ed on first use. Expected size 40-120 KB raw per language at full coverage (single-digit tens of KB gzipped).
- Cache correctness. `sw.js` is cache-first for every non-navigation request and names its cache by build, so an unversioned
  `locales/es.json` is correct within a build but the browser HTTP cache may serve a stale one at the first request of a new
  build. The fetch therefore appends `?v=<hash>` from `locales/manifest.json`, and the deploy's staging (`.github/workflows/pages.yml`
  already content-hashes shell tags) hashes the manifest itself. Slice 1 verifies the exact pages.yml hook; if staging cannot
  hash a JSON file the fallback is `?v=<build>` from `version.json` (already read by the shell guard).
- Precache: add `locales/manifest.json` and ONLY the saved/detected language's file to the `optional` Set in `sw.js`
  (inside the `@gen-shell:sw-optional` block, so the source is `tools/manifest.cjs` / `tools/gen/gen-shell.mjs`, not a hand edit).
  A player who picks a language later fetches it once; the fetch handler caches it opportunistically (documented path:
  "everything else is cached opportunistically the first time it's fetched"). English is inline, so there is nothing to precache for it.
  Offline + never-fetched language falls back to English silently. `tools/check/offline-precache-check.cjs` gains a case for this.
- Do not precache all languages: that spends install bytes for a feature most players never open (see load-download plan).

### Motorsport formatting rules (not localised)
Lap times `1:23.456`, gaps `+0.412`/`-0.087`, sector/tyre codes, positions `P3`, speed/gear/ERS numbers and every `toFixed` in telemetry keep
"." and the existing `Dom.fmtLap` shape in every language. Localised: prose numbers (money, percentages in sentences), calendar dates and
clock times in the schedule/Data Hub, weekday/month names, relative times ("2 days ago"), list joins, country names. Decimal comma for
prose numbers is gated on the owner's answer to Open question 3.

### Longer strings, case and the pseudo-locale
- A pseudo-locale `en-XA` is computed in `js/<new>/pseudo.js` from the English default at runtime (no file): accented vowels, ~40 %
  padding with `~`, bracketed `[…]`, placeholders preserved. It is selectable only with `?lang=en-XA` or `I18n.set("en-XA")`
  (never in the picker), and it is the locale `tools/ui/layout-audit.mjs` runs with (`--lang=en-XA`, a flag added in Slice 3) so the
  survey-ui-matrix cells measure clipping/truncation/tap targets on expanded strings. A second pass runs `de` once real German exists.
- CSS: do not fix truncation by shrinking fonts (ratchet `subFloorFontSize` 10, slack 0). Remedies in order: allow wrap where the
  row has height, `min-width: 0` + ellipsis with a `title`/`aria-label` carrying the full string, shorter translated label (translators
  get a per-key `max` hint in `locales/en.json`, enforced by lint as a WARNING over 150 % of English length).
- UPPER-CASE is presentation: translated strings are stored in normal case and upper-cased with `toLocaleUpperCase(lang)` only where the
  English design is upper-case (the 24 `text-transform: uppercase` rules already do this in CSS via `lang`). Radio pools stay upper-case in en
  only because the TTS reads them; other locales store natural case.

### RTL (deferred)
Out of scope now. Preparation costs nothing: new CSS in slices uses logical properties (`inline-start/end`) instead of the 248 physical
ones, `I18n.dir()` exists and `<html dir>` is set from the manifest. Real RTL needs the HUD gauges, steering/dock mirroring and the
canvas overlays audited (a separate plan after a second wave); no RTL language ships before then.

### Voice
- English Kokoro packs stay English. For another language the CAPTION is translated and spoken in this order: (1) a locale voice via
  `speechSynthesis` filtered by `<html lang>` (already how `js/audio/radio-voice.js` picks voices, local voices first for the radio
  because of the latency evidence in `docs/notes/VOICE-LAG-IPHONE-2026-10-01.md`); (2) if no local voice for that language exists, the
  radio line is shown as a caption only (never spoken in English over a translated caption, which reads as a bug). The player may
  pick "English voices, translated captions" in the language row; that keeps the English pack path and splices nothing new.
- `js/audio/voice-pack.js` keys clips by lower-cased English text, so a translated line cannot collide with a clip: no change needed
  for correctness, only the explicit "spoken language" setting (Slice 9).
- Kokoro per-language packs (Slice 10, OPTIONAL, owner decision): feasible for es, pt-BR, it, fr, ja (voices exist; verified above) but
  not de or nl (no voice). Cost: each voice pack is 2.5-6.6 MB for English phrases alone, so ~one extra voice per language per channel
  at 3-6 MB, lazy and never precached. Quality is the blocker: Italian is graded C and French has a single voice. Recommend
  SpeechSynthesis first and re-evaluate after player feedback.

### What must NOT be translated
Driver, team, circuit, sponsor and engine-supplier names (`js/data/teams.js`, `js/circuits/*.js`, the Jolpica/OpenF1 payloads in `js/data/`),
series/brand strings, the `#disclaimer` and licence/credits text (legal, copy review only), tyre compound letters and colours, flag names
(FIA flag vocabulary stays: translated captions may add a gloss), URLs, save/export format keys and `__apex` hook names, log messages (`Log`),
and test-only strings. Country names come from `Intl.DisplayNames`, not from `locales/…`.

### Contribution workflow
1. Copy `locales/en.json` to `locales/<lang>.json`, translate values only, add a row to `locales/manifest.json` (`status: "beta"`).
2. `node tools/<new>/i18n-lint.mjs` (browser-free, runs in `test:tooling-fast`) FAILS on: unknown keys, changed placeholder sets, missing
   plural categories, invalid ICU-lite braces, empty strings, a pool with a different slot set per variant, mojibake/control chars, and
   a translation identical to English for keys not marked `keep`. It WARNS on missing keys (coverage %, per language, printed) and
   over-length. A language below 60 % coverage is not selectable in the picker (still loadable by `?lang=`).
3. Reviewers: a native-speaker review flips `beta` to `reviewed`. PR template gets a locale checklist (`.github/pull_request_template.md`).
4. Keys are never renamed silently: a rename ships a `"_renamed": { "old": "new" }` map so contributor branches rebase cleanly.

## Migration strategy (incremental, no big bang)

Priority order (high-traffic and short-string first, long prose last): (1) title/menu and SETTINGS, (2) pause + race setup, (3) HUD labels and
`aria-label`s, (4) results/quali sheets, (5) Garage tabs and parts, (6) Career/Season, (7) Data Hub chrome, (8) radio + engineer + spotter + announcer
captions, (9) How to Play/onboarding prose, (10) coach/insights/lore/legends, (11) dev panels (`js/camera` tuners, `js/editor`, `js/agent`): never
translated, listed in an `exclude` block.

Guard test: `tests/unit/<new>-i18n-guard.test.mjs` runs `tools/<new>/i18n-lint.mjs --guard` over the files listed in
`tests/data/<new>-i18n-migrated.json` (`{ "files": [...], "html": ["#screen-id", ...] }`). In a migrated JS file it fails on a new string literal of 3+
letters reaching `textContent`, `setAttribute("aria-label"|"title"|"placeholder")`, `Dom.el` text, or a template literal assigned to a sink, unless it is an
`I18n.t` argument or an audited allowlist row (key `<file>::<snippet>`, with a reason, stale rows fail: same shape as
`tests/data/html-sink-allowlist.json`). In a migrated `index.html` section it fails on a text node or aria-label without `data-i18n`. Concatenation is
the first thing the guard bans: a sentence becomes one key with `{vars}`. A slice that migrates a file appends it to the list in the same PR, so the
ratchet only tightens.

`js/game.js`: its 14 sink writes migrate in place (`el.textContent = I18n.t("k", v, "English")` replaces a literal on the same line, so line and
codeLines counts do not grow; the commit hook absorbs ≤ 40 lines but this plan targets 0). `I18n` is a global like `Log`, NOT a new `G` member, so
`gMembers` (285) is untouched. Any slice that would grow `js/game.js` extracts first (`.claude/skills/slim-bloat/references/carves.md`). Ratchets
are never raised by this workstream.

## Slices (each one PR)

Verification column follows the AGENTS.md table. Browser groups are named, not run locally by default: use `node tools/ci/remote-group.mjs ui` on
the pushed branch (rule: whole group = remote shards), and name anything not run in the PR body.
### Slice 1 — Foundation: `I18n`, locale loader, picker, SW seeding (M)
- Files: `js/<new>/i18n.js`, `js/<new>/dom-apply.js`, `locales/manifest.json`, `locales/en.json` (generated), `tools/<new>/gen-locales.mjs`,
  `tools/manifest.cjs`, `index.html` (`data-i18n` on the SETTINGS language row only; run `node tools/gen/gen-shell.mjs`), `js/ui/settings-tabs.js`,
  `js/ui/settings-export.js`, `sw.js` via the gen block, `tools/check/offline-precache-check.cjs`.
- Tests: `tests/unit/<new>-i18n.test.mjs` (VM-executed: lookup chain, placeholders, plural categories for en/ru/ar, missing-key fallback, pseudo
  determinism, detection order); update `tools/check/offline-precache-check.cjs`; add to `tests/groups.json` then `npm run gen`.
- Verify: `npm run test:tooling-fast`; `node tools/gen/gen-shell.mjs --check`; `node tools/ci/pick-tests.mjs` then the `ui` group remotely.
  Boot-evidence: load the page with `?lang=en-XA` and confirm one expanded label (mcp-probe), plus a Network panel check that English makes no locale request.
- Ratchets: `shellNodes` +0 (attribute on an existing row; one new `SettingRow` host node ≤ 3), `js/game.js` 0, `zeroRefModules` stays 0.
### Slice 2 — Contribution lint and guard (S–M)
- Files: `tools/<new>/i18n-lint.mjs`, `tests/unit/<new>-i18n-guard.test.mjs`, `tests/data/<new>-i18n-migrated.json`, `.github/pull_request_template.md`,
  docs: a contributor section in `docs/TESTING.md` §5 row (new test file = groups.json group + TESTING row).
- Tests: the guard test plus fixture locales (valid, missing key, bad placeholder, wrong plural set).
- Verify: `npm run test:tooling-fast` only (tools/tests/docs). Ratchets: none.
### Slice 3 — Pseudo-locale in the layout matrix (S)
- Files: `js/<new>/pseudo.js`, `tools/ui/layout-audit.mjs` (`--lang`), `.claude/skills/survey-ui-matrix` (one paragraph; skills edits are prose-only).
- Verify: `node tools/ui/layout-audit.mjs --list` (browser-free) and one `--screen=settings --lang=en-XA` cell run in the background by the parent
  (not a subagent). Output: a defect table per screen (clipped, truncated, tap target < floor) that becomes the fix list for Slices 4-7.
- Ratchets: none.
### Slice 4 — Title, SETTINGS, pause, race setup (M)
- Files: `index.html` (attributes only on those sections), `js/ui/title-menu.js`, `js/ui/settings-tabs.js`, `js/ui/pause-opts.js`, `js/ui/setting-row.js`,
  `js/ui/modal.js`, `css/menus.css` (wrap/ellipsis fixes found in Slice 3), `locales/en.json`, migrated list.
- Tests: guard on the migrated files; `tests/unit/menu-a11y-audit.test.mjs` unchanged and green.
- Verify: `node tools/ci/pick-tests.mjs` (names the groups), `ui` group remotely, survey-ui-matrix cells for those screens under `en-XA`.
- Ratchets: `js/game.js` 0; `cssClasses` ≤ +2 only if a wrap helper class is unavoidable (prefer attributes).
### Slice 5 — HUD labels, results/quali sheets, number/date formatting (M)
- Files: `index.html` HUD (`aria-label` x ~60 in the HUD region), `js/ui/hud.js`, `js/ui/hud-readouts.js`, `js/ui/results-sheet.js`, `js/ui/quali-sheet.js`,
  `js/ui/dom.js` (no change to `fmtLap`; documented as not localised), the four formatting duplicates left as they are, `js/game.js` (call sites only).
- Tests: VM test pinning `Dom.fmtLap` and gap formatting identical across locales (the "not localised" contract); guard.
- Verify: `node tools/track/verify-track.cjs` not needed; `tests/specs/physics-characterization.spec.js` is NOT touched (no physics). Run the `ui` group remotely; HUD boot evidence on TLX and GLX with mcp-probe.
- Ratchets: `js/game.js` must stay 8982/4816 (assert in the PR body with `node tools/check/ratchets.mjs`).
### Slice 6 — Garage and parts (M)
- Files: `js/car/parts.js` (`CATALOG` labels become keys, names resolved at render through `I18n.t`, ids untouched so saves and `ersProfile` do not change),
  `js/garage/setup-sheet.js`, `js/garage/setup-tune.js`, `index.html` Garage tabs, `locales/en.json`.
- Tests: `.claude/skills/garage-parts-livery` specs picked by `pick-tests`; a unit test that every `CATALOG` id keeps its English label.
- Verify: nearest garage spec alone (`npm test -- tests/specs/<file>.spec.js`), then `ui` group remotely. Ratchets: `js/car/car3d.js` untouched.
### Slice 7 — Career, Season, Data Hub chrome (L)
- Files: `js/career/career-ui.js` (1563 lines, 17 `toLocaleString()` money sites to `I18n.n`), `js/career/season-ui.js`, `js/career/badges.js`, `js/data/hub.js`,
  `js/data/schedule.js` (dates via `I18n.date`, still UTC-pinned where it is today), `js/data/live.js`, `js/data/standings.js`.
- Tests: `career-mode` and `data-hub` skill specs via `pick-tests`; add a unit test that API-sourced names pass through untranslated.
- Verify: those specs alone; one remote group. Ratchets: none. Highest concatenation density, so plurals ICU-lite keys land here.
### Slice 8 — Radio, engineer, spotter, announcer captions (L)
- Files: `js/race/radio-lines.js` (pools move to `locales/en.json` under `radio.*` keys, accessor unchanged), `js/race/engineer.js`, `js/race/spotter.js`,
  `js/audio/announcer.js`, `js/race/race-radio.js`, `js/race/driving-coach.js` (coach later), `tests/unit/race-radio.test.mjs` (must speak every template per locale to prove the
  card-fit rule, using a length budget per language since TTS is slower in some languages).
- Verify: `node --test tests/unit/race-radio.test.mjs`; deterministic replay unchanged (deck uses its own seeded stream, language must not enter the seed: add an assertion).
- Ratchets: `js/audio/announcer.js` size must not grow (extract data to locale if it does). Decide per-locale `too-long` budget with the owner.
### Slice 9 — Spoken-language setting and SpeechSynthesis fallback (M)
- Files: `js/audio/radio-voice.js` (voice filter reads the spoken language, not just `<html lang>`), `js/audio/announcer.js`, `js/race/spotter.js`, `js/ui/pause-opts.js` row.
- Verify: unit tests with a stubbed `speechSynthesis`; boot evidence in Chromium (software, no voices: assert the caption-only path); a real-device check on iOS is NOT
  available here and is named not-run.
### Slice 10 — First locales + OPTIONAL Kokoro packs (L per wave)
- Wave A (see Languages): `locales/es.json`, `locales/pt-BR.json`, `locales/it.json`, `locales/de.json`; machine-seeded then reviewed (`beta` until a native reviewer signs off).
  Wave B: `fr`, `ja`, `nl`. One PR per language so review and revert stay independent.
- Optional: `tools/gen/voicepack.mjs` gains a language flag for es/pt-BR/it/fr/ja (owner decision, Open question 6).
- Verify: lint, then the pseudo/de matrix pass; PR body lists unreviewed strings count.

## Languages (justification and its limits)

Evidence gathered 2026-10-04 (no country-level audience dataset is public in one place; treat ranking as indicative):

- Brazil: https://www.portada-online.com/?p=42748 reports Brazil as the largest F1 TV audience with a 71 million fanbase, and an 18 million single-race
  audience (British GP, TV Globo + SporTV) the highest in any single market since 2020. Portuguese-BR first.
- Historic top markets by absolute viewers (2017): Germany, Brazil, Italy, UK, with Italy and Mexico growing fastest (same source). Italian, German, Spanish (Mexico + Spain) follow.
- The 2025 Global Fan Survey (https://www.formula1.com/en/latest/article/formula-1-and-motorsport-network-unveil-2025-global-fan-survey.4YqMebNy8BLaapyJfjzDXO)
  names Europe as the largest region and the US as fastest-growing; the US is English, so it adds nothing here, and it gives no other country split.
- Kokoro voice availability (https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) is a tie-breaker, not a driver: es, pt-BR, it, fr, ja yes; de and nl no.

Recommended Wave A: Spanish, Portuguese (Brazil), Italian, German. Wave B: French, Japanese, Dutch. Dutch is small but reading English UI is common there; Japanese
has the highest layout/font cost (no spaces, CJK font weight in `assets/fonts` is Latin-only) so it follows a font decision. This is the author's judgement; the
game has no analytics, so the owner's own audience knowledge should override it (Open question 1).

## Risks

1. **Concatenation debt.** 427 concatenations and 197 templates will not translate mechanically; each becomes a whole-sentence key. Mitigation: the guard bans new ones,
   slices go screen by screen, and Slices 7-8 are budgeted L.
2. **Layout breakage on longer, UPPER-CASE strings** across 49 screens x 11 viewports (`tools/ui/layout-audit.mjs --list`). Mitigation: pseudo-locale first (Slice 3),
   fixes land with their screen slice, no font shrinking (`subFloorFontSize` ratchet).
3. **Quality and ownership of translations.** Machine-seeded text in a motorsport register (DRS, undercut, box) can be wrong; no reviewer pipeline exists. Mitigation: `beta` labels,
   native review gate, per-language PRs, glossary file `locales/glossary.json` of terms that stay English (box, DRS, ERS, pit).
4. **Offline/stale locale** after a deploy (HTTP cache vs build-named SW cache). Mitigation: hashed query, SW precache of the active language, opportunistic fetch, English fallback.
5. **Voice mismatch.** Captions in one language over an English voice, or TTS voices missing on a platform. Mitigation: caption-only fallback and explicit spoken-language setting.

## Open questions for the owner

1. Which languages first? The recommendation (es, pt-BR, it, de) rests on thin public data; do you have audience numbers or contributors?
2. Who reviews translations, and is "BETA, machine-seeded" acceptable to ship under the picker?
3. Decimal comma for prose numbers in es/pt/it/de/fr/nl (and thousands separators in career money)? Timing stays ".", this question is only about prose.
4. English defaults at the call site (gettext style, zero-cost English) vs. a fetched `locales/en.json` as the only source (cleaner, but costs a boot fetch and a flash)?
5. Is `pt-PT` mapped to `pt-BR`, and `es-419` vs `es-ES` split or one Spanish?
6. Spend 3-6 MB per language per voice on Kokoro packs (Italian graded C, French one voice) or stay on SpeechSynthesis plus captions?

## Effort summary

Sizes are in the slice headings: code slices 1-9 are roughly M x 6, L x 2, S x 2; the long tail is human translation and review (Slice 10). This is the
biggest plan in `docs/plans/`. Stop after any slice: English stays identical and migrated screens stay guarded.
