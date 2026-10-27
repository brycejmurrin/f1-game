# Unit group 14 — complete semantic map

Read-only mapping of every file in group 14 of `unit-batches.json` (19 files, 3,993 lines). All file bodies read; ranges below are one-based inclusive and SHA-256 covers exact current bytes. No tests, browser runs, source edits or commits were performed for this map. Test ranges include the complete registration call; assertion spans identify assertion calls, including nested callbacks. Shared helper assertions and generated-case expansion are described separately. Each row’s name is the specific asserted behavioral contract; its final column identifies the evidence and its limits, together with the per-file fixture paragraph. Fictional filesystem/module labels are described by role rather than promoted to real paths.

Navigation: repository AGENTS and `.claude/skills/code-nav/SKILL.md` read. Attached apex-lsp confirmed Director exports (decideCut 47, wantOn 73, create 86), Input.steer 1813–1816, DevFlags.get 97–102, Native.shareBase 71–75, ApexApi.create 5 and DockLayout internal members (clampXY 27, normalize 34, apply 86, create 110). DirtyAir member lookup was refused by LSP; symbol search located its expando at consts.js:295, followed by bounded source read 280–340. Source reads also checked staging destination/copy guards, deterministic trace hash/flatten/divergence implementation, diagnostic path/plan/report bounds and desktop permission callbacks. LSP is navigation evidence, not execution.

## tests/unit/desktop-native.test.mjs

- Read range: 1–351; SHA-256: `0acfc2950fb2cb56da935bc5ca358ee896215af67dee03de1424f718660cbdd2`.
- Production targets: `desktop/main.js`, `desktop/preload.js`, `desktop/lib/permissions.cjs`, `desktop/app-protocol.js`, `js/audio/spotify.js`, `js/core/native.js`, `js/ui/platform-session.js`.
- Fixture/harness: Source guards plus mocked Electron registration, permission callbacks, Spotify VM, four-platform sharing VM and extracted smoke timers. `tests/fixtures/ghost-monza-short.json` recording and real `tests/helpers/seed-store.mjs` GameStore seed; network rejects. Source regex checks establish wiring, not Electron execution. Smoke harness evaluates only the SMOKE slice. Cross-device loops cover web, desktop, Android and iOS; setup/livery/daily payloads and relay/null-QR teardown.
- Limits: Mixed source/VM contract; no installed Electron or OS permission proof.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| index.html skips service-worker registration when __APEX_NATIVE__.desktop | 22–29 | 23, 24, 25, 26, 28 | file targets above | Checks index.html skips service-worker registration when __APEX_NATIVE__.desktop. Mixed source/VM contract; no installed Electron or OS permission proof. |
| menu-baseline waits for the controlling worker, never blocks registration | 31–40 | 36, 37, 38, 39 | file targets above | Checks menu-baseline waits for the controlling worker, never blocks registration. Mixed source/VM contract; no installed Electron or OS permission proof. |
| desktop preload exposes a frozen __APEX_NATIVE__ with desktop:true | 42–45 | 43, 44 | file targets above | Checks desktop preload exposes a frozen __APEX_NATIVE__ with desktop:true. Mixed source/VM contract; no installed Electron or OS permission proof. |
| desktop main uses privileged app:// via app-protocol (Range handler) | 47–66 | 48, 49, 50, 52, 53, 55, 56, 57, 58, 60, 61, 62, 63, 64, 65 | file targets above | Checks desktop main uses privileged app:// via app-protocol (Range handler). Mixed source/VM contract; no installed Electron or OS permission proof. |
| desktop permission allow-list: exactly the six the game uses, our origin only, camera not mic | 73–105 | 76–77, 78, 83, 84, 85, 87, 88, 89, 90, 92, 94, 96, 97, 100, 101, 102, 103, 104 | requestHandler, checkHandler | Checks desktop permission allow-list: exactly the six the game uses, our origin only, camera not mic. Mixed source/VM contract; no installed Electron or OS permission proof. |
| desktop permission module ships with the app (lib/** in the builder files) | 107–110 | 109 | file targets above | Checks desktop permission module ships with the app (lib/** in the builder files). Mixed source/VM contract; no installed Electron or OS permission proof. |
| app-protocol registers app:// privileged with allowServiceWorkers false (cache.addAll fails on app:) | 112–134 | 127, 128, 130, 131, 132, 133 | file targets above | Checks app-protocol registers app:// privileged with allowServiceWorkers false (cache.addAll fails on app:). Mixed source/VM contract; no installed Electron or OS permission proof. |
| desktop release fuses: the test pack turns the inspect fuse on, the release config keeps it off | 136–142 | 139, 140, 141 | file targets above | Checks desktop release fuses: the test pack turns the inspect fuse on, the release config keeps it off. Mixed source/VM contract; no installed Electron or OS permission proof. |
| desktop workflow is PR pack-smoke + tag/dispatch release (not ship-branch push) | 144–159 | 146, 147, 148, 149–150, 151–152, 153, 154, 155, 156, 157, 158 | file targets above | Checks desktop workflow is PR pack-smoke + tag/dispatch release (not ship-branch push). Mixed source/VM contract; no installed Electron or OS permission proof. |
| desktop workflow's pull_request paths are packaging-only (not the staged game tree) | 161–177 | 166–170, 176 | file targets above | Checks desktop workflow's pull_request paths are packaging-only (not the staged game tree). Mixed source/VM contract; no installed Electron or OS permission proof. |
| Spotify available() is false under __APEX_NATIVE__.desktop even with a client id | 221–227 | 223, 225, 226 | file targets above | Checks Spotify available() is false under __APEX_NATIVE__.desktop even with a client id. Mixed source/VM contract; no installed Electron or OS permission proof. |
| Spotify copy under native names the redirect-URI limitation | 229–235 | 233, 234 | file targets above | Checks Spotify copy under native names the redirect-URI limitation. Mixed source/VM contract; no installed Electron or OS permission proof. |
| cross-device links use public HTTPS in wrappers and preserve web deployment paths | 237–302 | 254, 255, 256, 258, 259, 266, 267, 294, 297, 298, 300 | canonicalOrigin | Checks cross-device links use public HTTPS in wrappers and preserve web deployment paths. Mixed source/VM contract; no installed Electron or OS permission proof. |
| desktop smoke deadline fires even if navigation never completes | 320–327 | 323, 325, 326 | file targets above | Checks desktop smoke deadline fires even if navigation never completes. Mixed source/VM contract; no installed Electron or OS permission proof. |
| desktop smoke has an independent deadline while page execution never settles | 329–339 | 335, 338 | file targets above | Checks desktop smoke has an independent deadline while page execution never settles. Mixed source/VM contract; no installed Electron or OS permission proof. |
| desktop smoke ignores a successful result delivered after the deadline | 341–351 | 349, 350 | file targets above | Checks desktop smoke ignores a successful result delivered after the deadline. Mixed source/VM contract; no installed Electron or OS permission proof. |

## tests/unit/desktop-notices.test.mjs

- Read range: 1–52; SHA-256: `06c3287c27a511742ed2d10922fc77208f4f24feb05d55782184530dd34e21bb`.
- Production targets: `desktop/scripts/notices.mjs`, `.gitignore`, `desktop/build/entitlements.mac.plist`.
- Fixture/harness: Repository licence inputs and generated notices text; existence/size and exact font licence inclusion. Temporary directory is created and removed but does not model packaging.
- Limits: File/text policy; no legal completeness or installer proof.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| every notices source path exists in the repo | 15–22 | 16, 19, 20 | file targets above | Checks every notices source path exists in the repo. File/text policy; no legal completeness or installer proof. |
| buildNoticesText concatenates every source and names the UNLICENSED caveat | 24–30 | 26, 28 | file targets above | Checks buildNoticesText concatenates every source and names the UNLICENSED caveat. File/text policy; no legal completeness or installer proof. |
| gitignore ignores generated THIRD-PARTY-NOTICES.txt not the entitlements | 32–42 | 34, 35, 38 | file targets above | Checks gitignore ignores generated THIRD-PARTY-NOTICES.txt not the entitlements. File/text policy; no legal completeness or installer proof. |
| consolidated notices include each bundled font's actual OFL text | 45–52 | 49, 50 | file targets above | Checks consolidated notices include each bundled font's actual OFL text. File/text policy; no legal completeness or installer proof. |

## tests/unit/desktop-pack-dry-run.test.mjs

- Read range: 1–37; SHA-256: `ff94984734009cf91ea46a54a39d7bebc88d8f4ea7695421816b0bbeb870e58b`.
- Production targets: `tools/desktop/pack-dry-run.mjs`.
- Fixture/harness: Real working-tree dry-run and child Node CLI; compares desktop package bytes and existence of generated outputs. Uses the dry-run build sentinel.
- Limits: Input validation and mutation checks; no installer build.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| pack dry-run: every packaging input resolves on the working tree | 15–20 | 17, 18, 19 | file targets above | Checks pack dry-run: every packaging input resolves on the working tree. Input validation and mutation checks; no installer build. |
| pack dry-run leaves the repo untouched (no dist-site, notices or package.json write) | 22–29 | 27, 28 | file targets above | Checks pack dry-run leaves the repo untouched (no dist-site, notices or package.json write). Input validation and mutation checks; no installer build. |
| pack dry-run CLI: --dry-run exits 0 with the = line; no flag exits 2 | 31–37 | 34, 35, 36 | file targets above | Checks pack dry-run CLI: --dry-run exits 0 with the = line; no flag exits 2. Input validation and mutation checks; no installer build. |

## tests/unit/desktop-stage.test.mjs

- Read range: 1–138; SHA-256: `5e98d63e1361e354af8a566c7843091735694a11ddbe28bc99ffc0ea5ba52de4`.
- Production targets: `tools/desktop/stage.mjs`, `tools/desktop/stage-files.mjs`, `desktop/lib/site.cjs`.
- Fixture/harness: Real allow-listed site copied into disposable stage; content stamping uses explicit build. Synthetic HEAD stamps, environment override, symlink-parent destination, and missing-input fixtures establish preservation before replacement.
- Limits: Filesystem/stamping behavior; no Electron boot or full minification claim.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| desktopVersionFromBuild maps version.json build → <apexVersion>.<build> | 23–28 | 24, 25, 26, 27 | file targets above | Checks desktopVersionFromBuild maps version.json build → <apexVersion>.<build>. Filesystem/stamping behavior; no Electron boot or full minification claim. |
| stageSite copies every allow-listed root file and directory | 30–52 | 35, 38, 41, 42, 43, 44, 48 | file targets above | Checks stageSite copies every allow-listed root file and directory. Filesystem/stamping behavior; no Electron boot or full minification claim. |
| stampStaged rewrites ?v=dev tags to content hashes | 54–73 | 59, 62, 64, 65, 67, 68–69 | file targets above | Checks stampStaged rewrites ?v=dev tags to content hashes. Filesystem/stamping behavior; no Electron boot or full minification claim. |
| default desktop stages must match HEAD while explicit overrides stay intentional | 76–100 | 89, 92, 94 | file targets above | Checks default desktop stages must match HEAD while explicit overrides stay intentional. Filesystem/stamping behavior; no Electron boot or full minification claim. |
| stage destination guards resolve symlink parents before replacing source trees | 103–122 | 116, 117, 118, 120 | file targets above | Checks stage destination guards resolve symlink parents before replacing source trees. Filesystem/stamping behavior; no Electron boot or full minification claim. |
| missing stage inputs leave a previous stage intact | 124–138 | 134, 135, 136 | file targets above | Checks missing stage inputs leave a previous stage intact. Filesystem/stamping behavior; no Electron boot or full minification claim. |

## tests/unit/desktop-unpacked-bin.test.mjs

- Read range: 1–96; SHA-256: `a301d6ff57db9f84d5007150aa793677d3104e23d053437916cff2ebaa966a6a`.
- Production targets: `desktop/scripts/unpacked-bin.mjs`, `.github/workflows/desktop.yml`, `docs/notes/DESKTOP-TEST-PLAN.md`.
- Fixture/harness: Disposable Linux and Windows-shaped output trees, package metadata and placeholder binaries. Workflow and manual plan assertions read text.
- Limits: Path resolution/text guards; binaries are never launched.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| findUnpackedBinary resolves linux-unpacked/<name> when present | 16–32 | 27, 28 | file targets above | Checks findUnpackedBinary resolves linux-unpacked/<name> when present. Path resolution/text guards; binaries are never launched. |
| findUnpackedBinary throws a helpful error when pack was not run | 34–48 | 41–44 | file targets above | Checks findUnpackedBinary throws a helpful error when pack was not run. Path resolution/text guards; binaries are never launched. |
| findUnpackedBinary resolves win-unpacked productName.exe (builder default) | 50–68 | 63, 64 | file targets above | Checks findUnpackedBinary resolves win-unpacked productName.exe (builder default). Path resolution/text guards; binaries are never launched. |
| desktop workflow runs pack-smoke on pull_request and keeps ship-branch push out | 70–88 | 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 86, 87 | file targets above | Checks desktop workflow runs pack-smoke on pull_request and keeps ship-branch push out. Path resolution/text guards; binaries are never launched. |
| DESKTOP-TEST-PLAN.md carries the manual per-OS checklist | 90–96 | 92, 93, 94, 95 | file targets above | Checks DESKTOP-TEST-PLAN.md carries the manual per-OS checklist. Path resolution/text guards; binaries are never launched. |

## tests/unit/desktop-version.test.mjs

- Read range: 1–81; SHA-256: `3ae552defdbce81c70cc849c09f52b44ed2350601f6f2c89dd1008b04e8d30d8`.
- Production targets: `desktop/lib/version.cjs`, `desktop/scripts/set-version.mjs`, `tools/desktop/stage.mjs`, `desktop/package.json`.
- Fixture/harness: Pure version mappings plus real npm preparation prefixes in a disposable desktop tree. Stage fixture writes a fresh HEAD-stamped build; eight entry points stop before Electron/build execution.
- Limits: Version/preparation ordering only; no release artifact.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| appVersionFrom maps {apexVersion, build} → MAJOR.MINOR.BUILD | 18–24 | 19, 20, 21, 22, 23 | file targets above | Checks appVersionFrom maps {apexVersion, build} → MAJOR.MINOR.BUILD. Version/preparation ordering only; no release artifact. |
| set-version versionFromInputs is the same pure mapping | 26–28 | 27 | file targets above | Checks set-version versionFromInputs is the same pure mapping. Version/preparation ordering only; no release artifact. |
| desktopVersionFromBuild uses desktop/package.json apexVersion by default | 30–33 | 31, 32 | file targets above | Checks desktopVersionFromBuild uses desktop/package.json apexVersion by default. Version/preparation ordering only; no release artifact. |
| desktop entry points replace an older stage before deriving the app version | 35–81 | 74, 76 | file targets above | Checks desktop entry points replace an older stage before deriving the app version. Version/preparation ordering only; no release artifact. |

## tests/unit/destructure-usage.test.mjs

- Read range: 1–29; SHA-256: `58597c9cdd085063aae268abf3fb37bdfaed9abee1b806413557dc9a860247c1`.
- Production targets: `tools/check/destructure-usage.mjs`, `tools/manifest.cjs`.
- Fixture/harness: Synthetic provider/use modules cover missing exports, defaults, parameter shadows, expandos, spread/assign uncertainty; final scan reads actual roster. Fixture module paths are labels rather than checkout files.
- Limits: Conservative static scan skips unreadable exports; not runtime resolution.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| a file destructuring a name the provider does not export fails, naming file, line and name | 10–13 | 12 | file targets above | Checks a file destructuring a name the provider does not export fails, naming file, line and name. Conservative static scan skips unreadable exports; not runtime resolution. |
| exported names, defaults, local shadows, expandos and unreadable exports all pass | 15–23 | 16, 17, 18, 19, 21, 22 | file targets above | Checks exported names, defaults, local shadows, expandos and unreadable exports all pass. Conservative static scan skips unreadable exports; not runtime resolution. |
| the current tree passes, and the check really looked at destructures | 25–29 | 27, 28 | file targets above | Checks current tree passes, and the check really looked at destructures. Conservative static scan skips unreadable exports; not runtime resolution. |

## tests/unit/determinism-bisect.test.mjs

- Read range: 1–97; SHA-256: `47f94f77a5c84124017978a0d3f8f6e813a17d642e38e4ad951a05f5b767c4c7`.
- Production targets: `tools/check/determinism-bisect.mjs`, `tools/lib/game-vm.cjs`, `js/agent/apex.js`.
- Fixture/harness: Synthetic state rows plus real Monza game VM; shared traced game, separate non-opt-in game and one planted random speed perturbation before step eleven. Cleanup closes games.
- Limits: Hash/field localization for sampled state; not universal deterministic execution.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| findFirstDivergence is null on identical synthetic traces | 27–37 | 35, 36 | file targets above | Checks findFirstDivergence is null on identical synthetic traces. Hash/field localization for sampled state; not universal deterministic execution. |
| findFirstDivergence names the step and field on a planted diff | 39–54 | 50, 51, 52, 53 | file targets above | Checks findFirstDivergence names the step and field on a planted diff. Hash/field localization for sampled state; not universal deterministic execution. |
| stepTrace is empty when opt-in is off (zero cost default) | 56–67 | 63 | file targets above | Checks stepTrace is empty when opt-in is off (zero cost default). Hash/field localization for sampled state; not universal deterministic execution. |
| one Math.random() inject is localised to its step and player.speed | 69–97 | 83, 87, 88, 89, 91, 92, 93–96 | file targets above | Checks one Math.random() inject is localised to its step and player.speed. Hash/field localization for sampled state; not universal deterministic execution. |

## tests/unit/determinism-replay-vm.test.mjs

- Read range: 1–146; SHA-256: `309015e4e07daf34b2b2746b44ba552486c67573d4bc6f39c6238bca16cda483`.
- Production targets: `tools/lib/game-vm.cjs`, `js/agent/apex.js`, `js/game.js`.
- Fixture/harness: One raced Monza VM; exact serialized player/AI state at checkpoints, stable car IDs and running position. Four-second replay repeated three times; twenty-second scenario enables reliability/weather arc/incident. Seeds 42 and 7 distinguish episodes.
- Limits: VM motion/running-order replay; no finishing-order or rendering claim.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| one seed replays byte-identically, every car's motion and running order included | 69–79 | 71, 72, 74, 77, 78 | file targets above | Checks one seed replays byte-identically, every car's motion and running order included. VM motion/running-order replay; no finishing-order or rendering claim. |
| digest detects AI-only motion, retirement and running-order perturbations | 81–93 | 86, 87, 89, 90–91 | file targets above | Checks digest detects AI-only motion, retirement and running-order perturbations. VM motion/running-order replay; no finishing-order or rendering claim. |
| checkpoint reads an AI-only simulation perturbation while the player stays identical | 95–107 | 97, 103, 104, 106 | file targets above | Checks checkpoint reads an AI-only simulation perturbation while the player stays identical. VM motion/running-order replay; no finishing-order or rendering claim. |
| a different seed really does deal a different field | 109–112 | 111 | file targets above | Checks a different seed really does deal a different field. VM motion/running-order replay; no finishing-order or rendering claim. |
| a 20 s race with a weather arc, reliability and an incident replays byte-identically | 137–146 | 139, 141, 143–144, 145 | file targets above | Checks a 20 s race with a weather arc, reliability and an incident replays byte-identically. VM motion/running-order replay; no finishing-order or rendering claim. |

## tests/unit/dev-flags.test.mjs

- Read range: 1–113; SHA-256: `4650ad8e791d1c1ad281f8e52dfd5c132bf438481352655463a460c5c4cb92c4`.
- Production targets: `js/core/dev-flags.js`, `tools/gen/gen-flags-table.mjs`.
- Fixture/harness: Isolated flags VM with query/hash, prefixed local storage and optional GameStore raw adapter. Registry-wide hash exclusion and actual generator --check child process.
- Limits: Flag resolution/text generation; not rendered feature activation.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| upscale: legacy =1 query and storage only (no hash) | 34–42 | 36, 37, 38, 39, 40, 41 | get | Checks upscale: legacy =1 query and storage only (no hash). Flag resolution/text generation; not rendered feature activation. |
| metrics: full bool query, storage 1/0 only | 44–50 | 45, 46, 47, 48, 49 | file targets above | Checks metrics: full bool query, storage 1/0 only. Flag resolution/text generation; not rendered feature activation. |
| legacy =1 flags: the URL only turns ON — ?x=0 never overrides a stored "1" (old reader was query\|\|storage) | 52–58 | 53, 54, 55, 56, 57 | file targets above | Checks legacy =1 flags: the URL only turns ON — ?x=0 never overrides a stored "1" (old reader was query||storage). Flag resolution/text generation; not rendered feature activation. |
| metrics: yes/no is not a flag value; the param name is case-insensitive like the old /i reader | 60–64 | 61, 62, 63 | file targets above | Checks metrics: yes/no is not a flag value; the param name is case-insensitive like the old /i reader. Flag resolution/text generation; not rendered feature activation. |
| metrics storage goes through GameStore.store.raw when the store is up | 66–71 | 69, 70 | get | Checks metrics storage goes through GameStore.store.raw when the store is up. Flag resolution/text generation; not rendered feature activation. |
| viz: string from query then storage | 73–77 | 74, 75, 76 | file targets above | Checks viz: string from query then storage. Flag resolution/text generation; not rendered feature activation. |
| the URL hash is never a flag channel, for bool or string flags (#3299) | 79–90 | 83, 85, 87, 88, 89 | names, get | Checks URL hash is never a flag channel, for bool or string flags (#3299). Flag resolution/text generation; not rendered feature activation. |
| flags() lists every registry key | 92–97 | 94, 95, 96 | file targets above | Checks flags() lists every registry key. Flag resolution/text generation; not rendered feature activation. |
| swFlyby: URL-only legacy =1 forces loading flyby bench path on software GL | 99–104 | 100, 101, 102, 103 | file targets above | Checks swFlyby: URL-only legacy =1 forces loading flyby bench path on software GL. Flag resolution/text generation; not rendered feature activation. |
| gen-flags-table --check stays in sync | 106–113 | 112 | file targets above | Checks gen-flags-table --check stays in sync. Flag resolution/text generation; not rendered feature activation. |

## tests/unit/dev-tools-vm.test.mjs

- Read range: 1–427; SHA-256: `bc78618798e844b9321fff959e57d63392eef90eb534182810c97e1cc6d14a1b`.
- Production targets: `js/agent/apex.js`, `tools/lib/game-vm.cjs`.
- Fixture/harness: Two shared Monza boots: raced and cold catalogue state; mutating cold race/TT calls receive disposable games. Parks/steps/jumps exercise JSON dev API; closeTo uses strict half-unit decimal tolerance.
- Limits: JSON VM API and numerical state; DOM results/classification/HUD rendering excluded.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| returns array with at least 20 circuits | 38–44 | 41, 42 | tracks | Reported JSON state/value contract under raced or cold VM. |
| each entry has id, name, and sequential index | 46–55 | 50, 51, 52 | tracks | Reported JSON state/value contract under raced or cold VM. |
| bahrain is in the list | 57–59 | 58 | tracks | Reported JSON state/value contract under raced or cold VM. |
| returns at least 10 teams with engine field | 61–70 | 64, 66, 67 | teams | Reported JSON state/value contract under raced or cold VM. |
| Mercedes team has engine 'Mercedes' | 72–78 | 75, 76 | teams | Reported JSON state/value contract under raced or cold VM. |
| loads a track by id and returns metadata | 80–86 | 83, 84 | race | Reported JSON state/value contract under raced or cold VM. |
| returns false for unknown track id | 88–90 | 89 | race | Reported JSON state/value contract under raced or cold VM. |
| race() with wet sets weather | 92–98 | 95, 96 | race, weather | Reported JSON state/value contract under raced or cold VM. |
| transitions state to results | 100–105 | 103, 104 | finishRace, info | Reported JSON state/value contract under raced or cold VM. |
| returns false when no race is loaded | 107–109 | 108 | finishRace | Reported JSON state/value contract under raced or cold VM. |
| track is null before race loads | 111–113 | 112 | info | Reported JSON state/value contract under raced or cold VM. |
| returns track id and total after race starts | 115–121 | 118, 119, 120 | info | Reported JSON state/value contract under raced or cold VM. |
| state changes after finishRace() | 123–127 | 126 | finishRace, info | Reported JSON state/value contract under raced or cold VM. |
| timeTrial and seasonMode are false in normal race | 129–134 | 132, 133 | info | Reported JSON state/value contract under raced or cold VM. |
| tt() sets timeTrial:true | 136–143 | 140, 141 | tt, info | Reported JSON state/value contract under raced or cold VM. |
| returns current mode and available modes list | 145–152 | 148, 149, 150, 151 | camera | Reported JSON state/value contract under raced or cold VM. |
| can switch to cockpit mode | 154–157 | 156 | camera | Reported JSON state/value contract under raced or cold VM. |
| can switch back to chase mode | 159–163 | 162 | camera | Reported JSON state/value contract under raced or cold VM. |
| returns false for unknown mode | 165–168 | 167 | camera | Reported JSON state/value contract under raced or cold VM. |
| returns eye, tgt arrays and fov number | 170–178 | 173, 174, 175, 176, 177 | camState | Reported JSON state/value contract under raced or cold VM. |
| returns camMode, frozen, weather, state | 180–188 | 183, 184, 185, 186, 187 | viewState | Reported JSON state/value contract under raced or cold VM. |
| frozen is true after park() | 190–193 | 192 | viewState | Reported JSON state/value contract under raced or cold VM. |
| dbgCamActive is true after view({}) | 195–199 | 198 | view, viewState | Reported JSON state/value contract under raced or cold VM. |
| dbgCamActive is false after view('chase') | 201–206 | 205 | view, viewState | Reported JSON state/value contract under raced or cold VM. |
| returns current frozen state when called with no args | 208–211 | 210 | freeze | Reported JSON state/value contract under raced or cold VM. |
| freeze(false) unfreezes; freeze(true) refreezes | 213–220 | 215, 217, 219 | freeze | Reported JSON state/value contract under raced or cold VM. |
| returns true when HUD is visible during a race | 222–226 | 225 | go, hud | Reported JSON state/value contract under raced or cold VM. |
| hud(false) reports hidden | 228–232 | 231 | go, hud | Reported JSON state/value contract under raced or cold VM. |
| hud(true) reports visible again | 234–239 | 238 | go, hud | Reported JSON state/value contract under raced or cold VM. |
| returns current weather string with no arg | 241–244 | 243 | weather | Reported JSON state/value contract under raced or cold VM. |
| setting 'wet' returns 'wet' | 246–250 | 248, 249 | weather | Reported JSON state/value contract under raced or cold VM. |
| toggling back to dry works | 252–256 | 255 | weather | Reported JSON state/value contract under raced or cold VM. |
| returns x, angle, k, hw, speed, s after park() | 258–263 | 261, 262 | probe | Reported JSON state/value contract under raced or cold VM. |
| player is near centreline after park(0.1, 0) | 265–268 | 267 | probe | Reported JSON state/value contract under raced or cold VM. |
| returns required fields including lap and wrongWay | 270–276 | 273, 274, 275 | physState | Reported JSON state/value contract under raced or cold VM. |
| exposes combined-slip traction circle fields | 278–284 | 281, 282, 283 | physState | Reported JSON state/value contract under raced or cold VM. |
| slipFactor drops when braking hard | 286–295 | 292, 293 | jump, setInput, step, physState, clearInput | Reported JSON state/value contract under raced or cold VM. |
| returns player car data when called with no index | 297–305 | 300, 301, 302, 303, 304 | carAt | Reported JSON state/value contract under raced or cold VM. |
| carAt(0) returns first car in cars list | 307–312 | 310, 311 | carAt | Reported JSON state/value contract under raced or cold VM. |
| carAt(999) returns null for out-of-range index | 314–317 | 316 | carAt | Reported JSON state/value contract under raced or cold VM. |
| finished field is false during a live race | 319–322 | 321 | carAt | Reported JSON state/value contract under raced or cold VM. |
| returns array with at least 2 entries | 324–329 | 327, 328 | cars | Reported JSON state/value contract under raced or cold VM. |
| exactly one car has p: true (the player) | 331–334 | 333 | cars | Reported JSON state/value contract under raced or cold VM. |
| returns array of fractions for Monza | 336–342 | 339, 340, 341 | corners | Reported JSON state/value contract under raced or cold VM. |
| returns world coords and tangent for fraction 0.5 | 344–348 | 347 | nodeAt | Reported JSON state/value contract under raced or cold VM. |
| returns barrier stats without NaN for Monza | 350–357 | 353, 354, 355, 356 | wallStats | Reported JSON state/value contract under raced or cold VM. |
| repositions player car and returns physState | 359–367 | 364, 365, 366 | go, jump, resetPlayer | Reported JSON state/value contract under raced or cold VM. |
| returns empty object after clearing | 369–373 | 372 | meshToggle, clearMeshes | Reported JSON state/value contract under raced or cold VM. |
| teleports player to the given lap fraction | 375–383 | 381, 382 | go, jump, physState, info | Reported JSON state/value contract under raced or cold VM. |
| 180° aim sets the car pointing backwards | 385–393 | 392 | go, jump, physState, aim | Reported JSON state/value contract under raced or cold VM. |
| single distance returns one reading | 395–400 | 398, 399 | scan | Reported JSON state/value contract under raced or cold VM. |
| array of distances returns one reading per entry | 402–407 | 405, 406 | scan | Reported JSON state/value contract under raced or cold VM. |
| setPhysics changes a param visible in tuning() | 409–416 | 414, 415 | tuning, setPhysics | Reported JSON state/value contract under raced or cold VM. |
| setInput and clearInput work together | 418–427 | 425, 426 | go, setInput, step, clearInput, physState | Reported JSON state/value contract under raced or cold VM. |

## tests/unit/devicefarm-syslog.test.mjs

- Read range: 1–224; SHA-256: `72bdc99af61174855efa7efd282bfd4641445c604fd0eee2eb0aa2087753a70a`.
- Production targets: `tools/perf/devicefarm-syslog.mjs`, `tools/perf/devicefarm-method.mjs`, `tools/perf/devicefarm-iphone.mjs`, `tools/shot/loading-probe.mjs`, `js/race/session-entry.js`, `js/perf/race-entry-profile.js`.
- Fixture/harness: Trimmed interleaved real-device log fixture separates process IDs, limits, memory kills, SIGKILL and buffer failures. Fake clock/exec drive extracted entry scripts; final failure path executes actual SessionEntry/Profile and apex settled helper. Two generated failed-race cases and two poll-error timeout cases.
- Limits: Parser/harness readiness logic only; no AWS session, Safari or GPU measurements.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| a dump split across lines is assembled by pid and ends at resident_size_mb | 48–54 | 50, 52–53 | file targets above | Checks a dump split across lines is assembled by pid and ends at resident_size_mb. Parser/harness readiness logic only; no AWS session, Safari or GPU measurements. |
| device local time becomes UTC (default PDT, UTC-7) | 56–60 | 58, 59 | file targets above | Checks device local time becomes UTC (default PDT, UTC-7). Parser/harness readiness logic only; no AWS session, Safari or GPU measurements. |
| limits carry hard/soft and the Safari app limit is kept apart | 62–67 | 64, 65, 66 | file targets above | Checks limits carry hard/soft and the Safari app limit is kept apart. Parser/harness readiness logic only; no AWS session, Safari or GPU measurements. |
| peak is taken over game-page processes only and is read against the WebContent limit | 69–75 | 71, 72, 73, 74 | file targets above | Checks peak is taken over game-page processes only and is read against the WebContent limit. Parser/harness readiness logic only; no AWS session, Safari or GPU measurements. |
| only a named memory kill counts as one; idle demotion, priority updates and a Safari SIGKILL do not | 77–83 | 79, 80, 81, 82 | file targets above | Checks only a named memory kill counts as one; idle demotion, priority updates and a Safari SIGKILL do not. Parser/harness readiness logic only; no AWS session, Safari or GPU measurements. |
| buffer failures are collected and the table prints the peak line | 85–89 | 87, 88 | file targets above | Checks buffer failures are collected and the table prints the peak line. Parser/harness readiness logic only; no AWS session, Safari or GPU measurements. |
| a stream with no dumps still summarises | 91–95 | 93, 94 | file targets above | Checks a stream with no dumps still summarises. Parser/harness readiness logic only; no AWS session, Safari or GPU measurements. |
| appendUnit counts the sessions a unit had before this one | 100–106 | 102, 103, 104, 105 | file targets above | Checks appendUnit counts the sessions a unit had before this one. Parser/harness readiness logic only; no AWS session, Safari or GPU measurements. |
| tierMoved only flags a changed autoTier between two reads | 108–113 | 109, 110, 111, 112 | file targets above | Checks tierMoved only flags a changed autoTier between two reads. Parser/harness readiness logic only; no AWS session, Safari or GPU measurements. |
| Device Farm rejects a failed closed entry (2 cases: error-bearing / ok:false) | 139–142 | 141 | file targets above | Checks Device Farm rejects a failed closed entry (2 cases: error-bearing / ok:false). Parser/harness readiness logic only; no AWS session, Safari or GPU measurements. |
| Device Farm waits for a new closed profile and visible readiness together | 145–155 | 153, 154 | file targets above | Checks Device Farm waits for a new closed profile and visible readiness together. Parser/harness readiness logic only; no AWS session, Safari or GPU measurements. |
| Device Farm times out with an error instead of emitting a timing row (2 cases: poll errors false / true) | 158–165 | 163, 164 | file targets above | Checks Device Farm times out with an error instead of emitting a timing row (2 cases: poll errors false / true). Parser/harness readiness logic only; no AWS session, Safari or GPU measurements. |
| Device Farm ENTRY uses the shared presented-frame, cover and loss readiness contract | 168–186 | 183–184 | file targets above | Checks Device Farm ENTRY uses the shared presented-frame, cover and loss readiness contract. Parser/harness readiness logic only; no AWS session, Safari or GPU measurements. |
| Device Farm rejects actual SessionEntry/Profile failure after the profile closes | 188–209 | 206, 207, 208 | snapshot, runSession, stageTable | Checks Device Farm rejects actual SessionEntry/Profile failure after the profile closes. Parser/harness readiness logic only; no AWS session, Safari or GPU measurements. |
| Device Farm menu kickoff records a timeout as failure when no race starts | 211–224 | 222, 223 | file targets above | Checks Device Farm menu kickoff records a timeout as failure when no race starts. Parser/harness readiness logic only; no AWS session, Safari or GPU measurements. |

## tests/unit/diagnostics-tools.test.mjs

- Read range: 1–374; SHA-256: `d8d5f4cd4b5c870e61b7039899c51ed5eb97407de51b2c68a8737c7cc36a6167`.
- Production targets: `tools/perf/diagnostics.mjs`, `tools/mcp/diagnostics-tools.mjs`, `tools/perf/runtime-memory.mjs`, `tools/gfx/mem-census.mjs`, `tools/lib/mem-census.mjs`, `tools/lib/process-tree.mjs`.
- Fixture/harness: Disposable artifact roots, escaping/dangling symlinks, saved JSON/manifests and timestamps. Mock CDP includes hangs/errors/zero counters; synthetic census visits and WeakRefs model identity/liveness. Cleanup test spawns disposable Node parent/child; reservation test races two child owners.
- Limits: Planning/query/collector contracts; no browser, hardware residency or leak conclusion.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| plans pin local CLIs, bounded cycles, modes and real shader-link evidence | 19–36 | 21, 22, 23, 25, 27, 28, 30, 32, 34, 35 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |
| paths reject traversal, symlink roots, existing child redirects and dangling symlinks | 37–47 | 38, 39, 41, 43, 46 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |
| report queries bound input/output and refuse to infer leak or A/B comparability | 48–62 | 53, 54, 55, 56, 58, 61 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |
| CDP optional counters remain unavailable, never fabricated zero; no intrusive calls | 63–75 | 71, 72, 73, 74 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |
| CDP commands have bounded waits; unsupported performance enable blocks metric read | 76–83 | 78, 81, 82 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |
| facade routes real runs through shared jobs and keeps capability/query reads offline | 84–92 | 87, 88, 89, 90, 91 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |
| shared process cleanup reaps a disposable Node parent and child | 93–106 | 102, 104 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |
| exclusive output reservation admits one concurrent owner and prevents evidence reuse | 108–129 | 123, 124, 126, 127 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |
| heap reports distinguish scene receipts, legacy samples and bounded presentation failures | 140–152 | 142, 144, 145, 146, 149, 150, 151 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |
| heap census rejects malformed CLI inputs before acquiring a browser | 153–163 | 159, 160, 161, 162 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |
| heap census budgets use raw bytes and preserve measured zero counts | 164–174 | 167, 168, 169, 170, 171, 172, 173 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |
| page errors, backend fallback and wrong or absent live world cannot pass | 175–186 | 177, 183, 184 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |
| missing heap, hooks, renderer counters, visits and aborted runs are incomplete | 187–202 | 195, 196, 198, 199, 201 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |
| diagnostic queries retain correctness, completeness, actual backend and memory scope | 203–213 | 208, 209, 210, 211, 212 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |
| collector deduplicates identity without merging distinct worlds or decoded buffers | 214–243 | 233, 234, 235, 236, 241, 242 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |
| collector reports absent init, heap and renderer data as unavailable | 244–249 | 247, 248 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |
| native GLX identity uses its observed API without assuming a missing label is TLX | 250–258 | 253, 255, 257 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |
| empty and malformed CDP domains are unavailable while valid zero fields remain available | 262–275 | 265, 266, 267, 268, 271, 272, 273, 274 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |
| standalone query keeps missing and legacy producer provenance unverified | 290–303 | 292, 293, 295, 296, 297, 300, 301, 302 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |
| old successful summaries cannot mask failed, stopped, incomplete or mismatched producers | 305–319 | 311, 312, 313, 316, 318 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |
| query freshness checks result time against producer start with filesystem precision tolerance | 321–331 | 327, 329, 330 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |
| query bounds and path-guards optional manifests and keeps comparison evidence independent | 333–350 | 337, 339, 341, 344, 348, 349 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |
| legacy heap failure verdicts remain failed without a producer manifest | 352–360 | 357, 358 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |
| a report rewritten after producer completion cannot reuse its manifest pass | 362–374 | 366, 367, 371, 372 | file targets above | Positive/negative fixture controls for the named diagnostic contract. |

## tests/unit/digital-steer.test.mjs

- Read range: 1–550; SHA-256: `5c6f33202f9288a89f044f25ea64ef66c16da8fa5f67b418a0816383044283ad`.
- Production targets: `js/input/input.js`, `js/input/bindings.js`, `js/input/tilt-roll.js`, `js/input/hold-buttons.js`, `js/game.js`.
- Fixture/harness: Real input modules in VM with hand-stepped clock, fake DOM listeners, standard/nonstandard pads and trigger values. Covers ramp timing, input ownership, tilt recovery, captures, multi-binding teardown and counted Set/Object.keys/Math.pow activity.
- Limits: Sampled input semantics and operation counts; no physical device/display latency proof.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| counter-steering unwinds as fast as letting go, at every speed and trim | 114–124 | 119–121 | file targets above | Named input transition or counted hot-path invariant in simulated events. |
| the assist still slows how fast lock BUILDS — only the unwind was wrong | 126–141 | 138–139, 140 | reset, setAdaptiveButtons, setSpeedStd, steer | Named input transition or counted hot-path invariant in simulated events. |
| a single frame can hold both halves of a direction change | 143–169 | 163–164, 167–168 | reset, setAdaptiveButtons, setSpeedStd, steer | Named input transition or counted hot-path invariant in simulated events. |
| a calibrated drift offset still reaches full lock on BOTH sides | 189–201 | 195, 197, 199 | setPadDeadzone, setPadSaturation, setPadRest, poll, steer, debugState | Named input transition or counted hot-path invariant in simulated events. |
| trigger travel is a rescaled dead zone: no 12 % step, no 15 % brake floor | 203–226 | 206, 207, 209, 210–211, 213, 215, 219, 220, 224, 225 | poll, throttle, throttleLevel, brakeLevel | Named input transition or counted hot-path invariant in simulated events. |
| free-look reads the right stick only on a standard pad, never a mapped wheel axis | 228–238 | 231, 234, 237 | poll, lookStick, setPadAxisMap | Named input transition or counted hot-path invariant in simulated events. |
| ramps advance per PHYSICS step: two substeps in one frame are two steps | 241–252 | 248, 249, 251 | reset, setAdaptiveButtons, setSpeedStd, steer | Named input transition or counted hot-path invariant in simulated events. |
| last key wins: RIGHT pressed while LEFT is still held steers right | 254–267 | 260, 263, 266 | reset, setAdaptiveButtons, setSpeedStd, steer | Named input transition or counted hot-path invariant in simulated events. |
| last on-screen arrow wins: RIGHT pressed while LEFT is still held steers right | 330–347 | 339, 342–343, 346 | reset, setSteerMode, setAdaptiveButtons, setSpeedStd, steer | Named input transition or counted hot-path invariant in simulated events. |
| last d-pad wins: RIGHT pressed while LEFT is still held steers right | 349–371 | 363, 366–367, 370 | reset, setAdaptiveButtons, setSpeedStd, setSteerMode, poll, steer | Named input transition or counted hot-path invariant in simulated events. |
| coalesced pointer samples move the finger only when they ARE the finger | 373–386 | 381, 383, 385 | setSteerMode, setDragSmoothing, debugState | Named input transition or counted hot-path invariant in simulated events. |
| re-entering TILT zeroes on a fresh reading, not the lean the player left tilt with | 388–408 | 393, 405, 406 | setSteerMode, requestGyro, calibrate, debugState, steer | Named input transition or counted hot-path invariant in simulated events. |
| one non-finite orientation reading does not poison the TILT filter for the session | 410–422 | 419, 420 | setSteerMode, requestGyro, calibrate, steer | Named input transition or counted hot-path invariant in simulated events. |
| alternate held bindings release independently, including after focus changes | 424–441 | 438, 439 | setKeyBinding, lookingBack, debugState | Named input transition or counted hot-path invariant in simulated events. |
| held-code state is cleared by reset, modifier teardown and rebind | 443–449 | 447 | reset, setKeyBinding, throttle | Named input transition or counted hot-path invariant in simulated events. |
| d-pad advances once per physics step, independent of display polling | 451–467 | 464, 465, 466 | setAdaptiveButtons, setSteerExpo, reset, poll, steer | Named input transition or counted hot-path invariant in simulated events. |
| a captured d-pad cannot regain steering during a physics substep | 469–477 | 473, 475 | poll, steer | Named input transition or counted hot-path invariant in simulated events. |
| a resting pad poll allocates no Set or Object.keys and skips the d-pad exponent | 493–511 | 501, 502, 503, 506, 510 | setSteerMode, poll, steer | Named input transition or counted hot-path invariant in simulated events. |
| idle keyboard steer skips the exponent and a held arrow still builds lock | 513–527 | 520, 521, 526 | setSteerMode, reset, steer | Named input transition or counted hot-path invariant in simulated events. |
| dropping a pad still forgets its use record when the live set is reused | 529–550 | 542, 545, 549 | setSteerMode, poll, steer | Named input transition or counted hot-path invariant in simulated events. |

## tests/unit/dijon-clips-coplanar.test.mjs

- Read range: 1–64; SHA-256: `37c997a38b560e75867d72e84a205be38f09515796417451b3e98e69411df8c7`.
- Production targets: `tools/track/audit-circuit.cjs`, `js/circuits/dijon.js`, `tools/track/clip-baseline.json`, `tests/data/scenery-audit-baseline.json`.
- Fixture/harness: Actual audit subprocess builds Dijon VM and reads live clip/ground baselines. Both baseline and measurement must remain below original saturating caps; actual measurement also stays within ratcheted baseline.
- Limits: Measured geometry audit; no pixel appearance or real GPU result.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| dijon clip severe and flatCoplanar stay strictly below saturating caps (#3348) | 46–64 | 47, 48–51, 53, 56–59, 60–63 | file targets above | Checks dijon clip severe and flatCoplanar stay strictly below saturating caps (#3348). Measured geometry audit; no pixel appearance or real GPU result. |

## tests/unit/director.test.mjs

- Read range: 1–611; SHA-256: `322829396eacebc8f65468a1ed9c70ec464b6fc34e53131d7cf31a23abab72e7`.
- Production targets: `js/camera/director.js`, `js/race/broadcast.js`, `js/camera/vantage.js`, `js/camera/feel.js`, `js/camera/offsets.js`, `js/game.js`.
- Fixture/harness: Pure policy and real director VM with stub field/façade. Real camera stack uses straight sampled track with mutable curvature and bank lift; extracted game render-pose/cull/framing snippets preserve interpolation and authority. Captured foreign/replay/photo ownership, paused state and scan counters cover lifecycle.
- Limits: Policy/numerical framing/source wiring; no rendered broadcast aesthetic or GPU proof.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| decideCut holds under SHOT_MIN_S and cuts by SHOT_MAX_S onto a battle | 33–62 | 42–43, 45, 46, 47, 48, 49, 53–56, 60, 61 | decideCut | Named camera policy/pose ownership invariant in VM or extracted production snippet. |
| wantOn is solo-only and requires tv mode or finished/retired auto-spectate | 64–71 | 66, 67, 68, 69, 70 | wantOn | Named camera policy/pose ownership invariant in VM or extracted production snippet. |
| create().tick writes dbgCam from camVantage and never mutates car speed | 73–122 | 111, 112, 113, 114, 116, 117, 121 | create, tick, status | Named camera policy/pose ownership invariant in VM or extracted production snippet. |
| the live director's battle pick is the same at OVERALL SPEED 0.469 as at pace 1 (4-F6) | 124–154 | 151, 152–153 | create, tick, status | Named camera policy/pose ownership invariant in VM or extracted production snippet. |
| CAM_MODES keeps tv at its shipped index — save-format index contract | 156–163 | 159, 161, 162 | file targets above | Named camera policy/pose ownership invariant in VM or extracted production snippet. |
| WATCH or scrub ownership prevents live TV cuts and retired-seat auto-spectate | 180–200 | 188, 189, 190, 196, 199 | tick, status | Named camera policy/pose ownership invariant in VM or extracted production snippet. |
| Pause holds the director's shot and clock without forcing a retired-seat camera | 202–218 | 210, 211, 212, 216, 217 | tick, status | Named camera policy/pose ownership invariant in VM or extracted production snippet. |
| Photo and foreign debug cameras keep ownership through TV ticks, reset and exit | 220–240 | 227, 230, 231, 235, 239 | tick, status, reset | Named camera policy/pose ownership invariant in VM or extracted production snippet. |
| post-finish shots frame signed bank lift at the final interpolated pose, including unbanked and raw fallback poses | 281–329 | 297, 298, 299, 300, 301, 302, 304, 315, 316–317, 324, 328 | tick, status | Named camera policy/pose ownership invariant in VM or extracted production snippet. |
| a side-of-the-bend flip mid-shot pans the TV eye: a few % of the flip a frame, never a teleport | 331–357 | 335, 337, 347, 353, 354, 356 | tick, status | Named camera policy/pose ownership invariant in VM or extracted production snippet. |
| the director ticks after the physics step, on the pose the car is drawn at | 359–369 | 364, 365, 366, 368 | file targets above | Named camera policy/pose ownership invariant in VM or extracted production snippet. |
| AI TV pose follows the interpolated drawn tangent/yaw, including scaled slope vectors and yaw wrap | 386–411 | 400, 401, 402, 404, 406, 409–410 | file targets above | Named camera policy/pose ownership invariant in VM or extracted production snippet. |
| player, remote human, network AI and dynamic incident poses preserve wrap-safe world heading | 413–423 | 420 | file targets above | Named camera policy/pose ownership invariant in VM or extracted production snippet. |
| actual AI TV CHASE follows +X motion instead of the unchanged grid heading | 425–444 | 437, 439, 440, 442–443 | status, tick | Named camera policy/pose ownership invariant in VM or extracted production snippet. |
| create().tick skips the running-car scan while holding a fresh shot (SHOT_MIN_S dwell) | 448–476 | 468, 471, 472, 475 | create, tick | Named camera policy/pose ownership invariant in VM or extracted production snippet. |
| post-finish coverage opens on the car, rotates external shots, and respects a manual camera | 478–498 | 485, 486, 487, 489, 491, 493, 495, 497 | tick, status, reset | Named camera policy/pose ownership invariant in VM or extracted production snippet. |
| manual TV handoff snaps to the player's camera once, including paused and post-finish handoffs | 500–521 | 506, 509, 514 | tick, reset | Named camera policy/pose ownership invariant in VM or extracted production snippet. |
| WATCH cuts and held frames use subject framing and clear it when normal driving resumes | 523–550 | 527, 545, 547, 548 | file targets above | Named camera policy/pose ownership invariant in VM or extracted production snippet. |
| automatic chase, side, helicopter and cinematic framing keeps a laterally displaced car near the centre | 552–562 | 560 | file targets above | Named camera policy/pose ownership invariant in VM or extracted production snippet. |
| subject framing preserves tuner pitch/yaw and the viewer's look-back | 564–589 | 571, 582 | file targets above | Named camera policy/pose ownership invariant in VM or extracted production snippet. |
| the render loop keeps a remote TV/results subject even beyond the player's driving fog | 591–611 | 595, 605, 609 | file targets above | Named camera policy/pose ownership invariant in VM or extracted production snippet. |

## tests/unit/dirty-air.test.mjs

- Read range: 1–81; SHA-256: `b0bc4a7bb366b22dca5e96a8f4a323deb0e6bbdf83b4000f2503114048ec203d`.
- Production targets: `js/physics/consts.js:295-340`.
- Fixture/harness: Real DirtyAir model in isolated constants VM; fixed tow geometry and downforce sample classic linear versus CFD exponential/Gaussian wakes and speed-dependent aero-share multiplier.
- Limits: Pure model formulas/relative bounds; no physical CFD validation or live race integration.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| levels: classic is the default; off/classic/cfd are all valid | 29–36 | 30, 31, 32, 33, 34, 35 | isLevel | Checks levels: classic is the default; off/classic/cfd are all valid. Pure model formulas/relative bounds; no physical CFD validation or live race integration. |
| CLASSIC wake matches the linear fade (TOW_RANGE/FADE/HALF_W) | 38–46 | 40, 41, 42, 43, 44, 45 | wakeOf | Checks CLASSIC wake matches the linear fade (TOW_RANGE/FADE/HALF_W). Pure model formulas/relative bounds; no physical CFD validation or live race integration. |
| CFD wake is exponential in gap and Gaussian in lateral offset | 48–55 | 51, 52, 53, 54 | wakeOf | Checks CFD wake is exponential in gap and Gaussian in lateral offset. Pure model formulas/relative bounds; no physical CFD validation or live race integration. |
| mul: OFF is identity; classic/cfd scale by LOSS; fades at crawl speed | 57–69 | 58, 59, 63, 65, 66, 68 | mul | Checks mul: OFF is identity; classic/cfd scale by LOSS; fades at crawl speed. Pure model formulas/relative bounds; no physical CFD validation or live race integration. |
| CFD close spacing approaches the SAE ~67 % aero-share loss | 71–81 | 78, 79, 80 | wakeOf, mul | Checks CFD close spacing approaches the SAE ~67 % aero-share loss. Pure model formulas/relative bounds; no physical CFD validation or live race integration. |

## tests/unit/dispatch.test.mjs

- Read range: 1–215; SHA-256: `40fbb95f53a5367314a90662df0f4e2c723b5caab6c43b3b60229b4c9c58f098`.
- Production targets: `tools/ci/dispatch.mjs`.
- Fixture/harness: Pure fixture GitHub issues/PRs/sessions at fixed UTC time; quota/caps/priority/claims/staleness/holds/deploy-red/archive/pause plans. applyPlan uses recording fake API; printed session operations are parsed as JSON. Fictional issue/session/branch/config identifiers are fixtures.
- Limits: Exact plan/prompt/text/client-call contracts; no network or actual worker launch/archive.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| rule 1: a ready, unclaimed issue launches one claude worker with a launch comment on the issue | 29–40 | 31, 33, 34, 35, 36–37, 38–39 | file targets above | Exact produced plan/text for the named fixture rule. |
| rule 1: priority first, then the newest updated; the per-run cap and the live-worker cap bound it | 42–53 | 45, 47, 48, 51, 52 | file targets above | Exact produced plan/text for the named fixture rule. |
| rule 1: a quota that is not `allowed` launches nothing and says why; claimed/blocked/needs-decision issues are skipped | 55–63 | 58, 59, 62 | file targets above | Exact produced plan/text for the named fixture rule. |
| rule 1: a launch comment younger than launchClaimHours is a live claim (no double launch); an older one is not | 65–72 | 67, 69, 70, 71 | file targets above | Exact produced plan/text for the named fixture rule. |
| rule 1: lane:cursor launches a CURSOR body only when hosts.cursor.enabled | 74–83 | 77, 80, 81–82 | file targets above | Exact produced plan/text for the named fixture rule. |
| rule 2: a PR silent 2 h gets needs-owner and ONE CONTINUE takeover carrying the handoff block | 85–100 | 88, 89, 91, 92–95, 96, 97, 99 | file targets above | Exact produced plan/text for the named fixture rule. |
| rule 2: lane:codex waits 6 h; hold or needs-decision blocks the takeover; a takeover launched < 2 h ago is not repeated | 102–115 | 104, 105, 108, 112, 113, 114 | file targets above | Exact produced plan/text for the named fixture rule. |
| rule 3: deploy red labels the Board and launches one fixer, unless a PR carries deploy:red or one was launched < 2 h ago; green removes the label | 117–130 | 119, 120, 121, 122, 124, 127, 129 | file targets above | Exact produced plan/text for the named fixture rule. |
| rule 4: archive only a claimed session whose every PR and issue is done > archiveAfterMinutes; never unclaimed, running or open | 132–153 | 148, 149–151, 152 | file targets above | Exact produced plan/text for the named fixture rule. |
| pause: the config file or a dispatch:pause label on the Dispatch issue launches nothing; merge-pause is reported | 155–165 | 158, 160, 162, 163, 164 | file targets above | Exact produced plan/text for the named fixture rule. |
| board: the markdown carries the marker, one row per open PR (owner from the handoff block), launches, caps | 167–176 | 170–174, 175 | file targets above | Exact produced plan/text for the named fixture rule. |
| prompts: every launch prompt is at most 25 lines and ends with the four common lines (WORKERS.md, lane, base, cost cap, land) | 178–188 | 184, 185, 187 | file targets above | Exact produced plan/text for the named fixture rule. |
| apply: labels, launch comments and the Board edit go through the client; the session-side lines are printed in the documented shapes | 190–207 | 200, 201, 203, 204, 205, 206 | file targets above | Exact produced plan/text for the named fixture rule. |
| extractSessions reads an MCP page with its envelope; loadConfig merges the file over the defaults | 209–215 | 211, 213, 214 | file targets above | Exact produced plan/text for the named fixture rule. |

## tests/unit/dock-layout.test.mjs

- Read range: 1–307; SHA-256: `608d4b0da8b80ded0086bada438d0630f0a1ee7351a61c353899c3d6bf29c9db`.
- Production targets: `js/ui/dock-layout.js`, `js/ui/css-zoom.js`.
- Fixture/harness: 400×800 VM window, memory store and style-only docks; real CssZoom for apply. create harness records listeners/MutationObserver and modal states; synthetic pointer dispatch models capture-before-throttle latch. Subscription case explicitly uses a stand-in rather than create.
- Limits: VM transforms/ownership; unsafe-inset case only checks MAX bounds, not real notch geometry or browser modal inertness.

| Name | testRange | assertionSpans | Target | Meaning / limits |
|---|---|---|---|---|
| clampXY keeps a dock between its safe-area home and MAX (a negative share would park it off screen) | 52–63 | 54, 55, 57, 58, 61, 62 | clampXY | Named fraction/transform or edit-lifecycle contract in stub DOM. |
| normalize fills every scheme and clamps junk | 65–71 | 67, 68, 69, 70 | normalize | Named fraction/transform or edit-lifecycle contract in stub DOM. |
| load/save round-trip keeps schemes independent | 73–85 | 80, 81, 82, 83, 84 | normalize, save, load, isIdentity | Named fraction/transform or edit-lifecycle contract in stub DOM. |
| apply writes translate for a non-zero offset and clears at identity | 87–98 | 92, 93, 97 | normalize, apply | Named fraction/transform or edit-lifecycle contract in stub DOM. |
| apply divides the translate by the dock's own CSS zoom | 103–113 | 111, 112 | normalize, apply | Named fraction/transform or edit-lifecycle contract in stub DOM. |
| switching scheme applies that scheme's offsets only | 115–124 | 121, 123 | normalize, apply | Named fraction/transform or edit-lifecycle contract in stub DOM. |
| a primary control centre inside the unsafe inset is rejected by clamp | 126–133 | 131, 132 | clampXY | Named fraction/transform or edit-lifecycle contract in stub DOM. |
| store.subscribe on steerMode reloads that scheme's offsets | 135–159 | 155, 158 | normalize, apply | Named fraction/transform or edit-lifecycle contract in stub DOM. |
| a rotation repaints the dock offsets in the new viewport's pixels | 190–198 | 193, 195, 197 | file targets above | Named fraction/transform or edit-lifecycle contract in stub DOM. |
| setEditing(true) hides SETTINGS and PAUSED so the docks are reachable, and false restores | 200–212 | 204, 205, 206, 207, 209, 210, 211 | setEditing | Named fraction/transform or edit-lifecycle contract in stub DOM. |
| only what REPOSITION hid comes back (settings opened from the menu, no pause card) | 214–221 | 219, 220 | setEditing | Named fraction/transform or edit-lifecycle contract in stub DOM. |
| a pointerdown on #dock-right starts a drag while editing, and the move shifts it | 223–240 | 232, 236, 239 | setEditing, bag | Named fraction/transform or edit-lifecycle contract in stub DOM. |
| a REPOSITION drag that starts on GAS never reaches the button: the throttle LATCH stays put (hunt3 7-F4) | 242–267 | 260, 264, 265 | setEditing | Named fraction/transform or edit-lifecycle contract in stub DOM. |
| an external open of SETTINGS or PAUSED ends REPOSITION without stacking dialogs | 269–279 | 273, 276, 277, 278 | setEditing, editing | Named fraction/transform or edit-lifecycle contract in stub DOM. |
| Escape ends REPOSITION and does not reach Input's pause toggle | 281–291 | 286, 288, 289, 290 | setEditing, editing | Named fraction/transform or edit-lifecycle contract in stub DOM. |
| apply divides the translate by the dock's effective CSS zoom | 293–307 | 304, 305, 306 | normalize, apply | Named fraction/transform or edit-lifecycle contract in stub DOM. |

## Shared assertions and completeness

Additional assertion spans outside registration bodies: determinism-replay-vm 45 and 47 (checkpoint AI presence and finite telemetry); dev-tools-vm 16 (closeTo numeric helper, invoked at 282–283 and 414–415); digital-steer 105 and 110 (full-lock/reached-centre preconditions); dock-layout 34 (IIFE export existence).

Important title-versus-evidence limits: the desktop preload test title says frozen, but its assertions only match exposure and desktop:true; they do not assert Object.freeze. The desktopVersionFromBuild default title passes explicit apexVersion arguments, so those two assertions do not establish the omitted-argument default. DockLayout’s steerMode subscription test builds its own subscription filter and does not execute create’s subscription wiring.

The bisect injection callback asserts a live player before perturbing speed; its assertion is included in the enclosing test span. Replay checkpoint helper asserts AI presence and finite prog/x/speed/position for every episode; digital-steer msToCentre asserts full-lock and reached-centre preconditions; dock-layout has a top-level global/clampXY existence assertion. `tests/helpers/fn-source.mjs` extracts through a matching-indentation closing brace and throws for missing/ambiguous boundaries; `tests/helpers/game-source.mjs` derives a manifest-backed union of game and instantiated modules and requires exactly one declaring file for symbol extraction. These helpers support Director and Device Farm snippets. `tests/helpers/abs-src.mjs` supplies absolute VM filenames, not simulated behavior. Director helpers intentionally throw on illegal road sampling and assert bank sampling/tuner coordinates inside injected callbacks. These are additional checks to the direct table assertions. Device Farm loop registrations expand to four concrete cases from two rows. All other test registrations have literal names.

Coverage: 230 registration sites across 19/19 files; 232 concrete named cases after the two Device Farm two-way expansions. No test outcomes are claimed.
