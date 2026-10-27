# Unit group 11 — complete source map

Read-only mapping dated 2026-10-27. Scope is exactly group 11 in unit-batches.json: 19 files, 4,753 lines. All test contents were read in bounded, complete ranges; an initially oversized combined display was re-read in smaller ranges. No tests or browsers were run, and no runtime/test source was changed. This is a source-backed contract inventory, not a passing-test verdict.

## Read and hash ledger

SHA-256 is of the full file bytes. Ranges are inclusive; line counts use physical lines (including the final newline convention of the batch). All rows below have complete 1–N coverage, including helpers, comments and setup outside registered test bodies.

| File | Full read ranges | SHA-256 |
|---|---|---|
| `tests/unit/cross-tool-guards.test.mjs` | 1–120; 121–194; 195–235 | `9293bc3383976a2c2333a5068563c40249a62f81dd68b4f89b4a468c9b44add1` |
| `tests/unit/crowd-audio.test.mjs` | 1–116; 117–210; 211–297 | `77173da4cfd56236cc1b696bdfee0149236b3d982af62623e239b99260693334` |
| `tests/unit/crowd-ctx-rebuild.test.mjs` | 1–172 | `aefdc0bf8b75e19a0b2a1d31422ecdfc332b734b101f75a919a71cd24fc03229` |
| `tests/unit/css-comments.test.mjs` | 1–128 | `4651979bcb0d12261572a579151e10fc484bb536bb2ec8faff1cc32f11ca106c` |
| `tests/unit/css-critical-path.test.mjs` | 1–135 | `d90baf57f6b2fb8777ae6ad1eee623cb2a75cb6cb06f2ab479156d34fea5dd4f` |
| `tests/unit/css-faces.test.mjs` | 1–142 | `67a55412b3ec9a5d51773ac0ba212d0e516d61a79a1a88f2cadf6092fd84b869` |
| `tests/unit/css-has-scope.test.mjs` | 1–176 | `ae1fe8000c2c28df4d0043cda1134f70791658443b845f518440e2269f449a1b` |
| `tests/unit/css-layers.test.mjs` | 1–200; 201–386 | `45d6869ab810dd20832023f399d25e6be54eea9517878c5ed22c18527db9e54a` |
| `tests/unit/css-media-disjoint.test.mjs` | 1–105 | `92ea90c9e012c3fcdb29c6a49acf747ef82645a539bf26da07e37471e76467f1` |
| `tests/unit/css-play.test.mjs` | 1–147 | `ba3fc7d9b2552a86b8ba61d5979efa0d9e8c9c214f1a0b65dd4df2776ca10774` |
| `tests/unit/css-prefers-cascade.test.mjs` | 1–173 | `7e32c301663d046591dac5a4c113c8a88468eb69ccd8ee2596e142bf86933976` |
| `tests/unit/css-token-adoption.test.mjs` | 1–129 | `ee6ddec21f400f02576fd16f512b5d8ecf98165095fb2b719fbd0e2513ffbe8b` |
| `tests/unit/css-tokens.test.mjs` | 1–133 | `06d969990febd5ea3badfb88b7ae03da8eaeffec67f9a47ae8864bdbc608edb4` |
| `tests/unit/ctx-lost-menu-restore.test.mjs` | 1–113 | `18f71501e1eadefdb749a7a7006ddbf1616c9536c0e8b611217cf663e38f7b23` |
| `tests/unit/ctx-lost-notice.test.mjs` | 1–128 | `40e08bc2f13116eb2e9031b7930a7004cd7f24e9d3218d500246e44b6700b8cc` |
| `tests/unit/cursor-agents.test.mjs` | 1–350; 351–700; 701–1093 | `5ea708380df1199825282d221788a261252f8497bd9b6c5e2be7b3f2ceff1c25` |
| `tests/unit/curvature-channels.test.mjs` | 1–122 | `af628574ec1ac8e24dcd8dc40c4476d2eb51a9fc311064782dbf8ea311a694ed` |
| `tests/unit/custom-tracks.test.mjs` | 1–350; 351–698 | `91c646b858964f18210abd949b78897125666b7cdadb65033efb9f46549a207d` |
| `tests/unit/cvd-palette.test.mjs` | 1–241 | `7f58872d2bea3e7ab379d836737233ba4720b7d0c5b58099f5f4d30c8066efa6` |

## Cases and production contracts

Each numbered entry is one source registration site, with its complete test-body span. Each entry gives the semantic contract in the source title and the exact assertion predicates/expected values (message arguments omitted), so a name cannot conceal a weaker assertion. Predicates in loops apply to each fixture item. Helper assertions reached indirectly (for example committedGate, bootCrowd or bad()) also remain visible through the fixture spans described for each file. Dynamic CSS registrations are templates, not a fabricated fixed runtime test count. The file-level Targets paragraph supplies the production owner and implementation spans for every case beneath it; the asserted function/API expressions distinguish its individual entry points. All production paths in the Targets paragraphs exist; fixture-only pseudo paths inside assertion code are quoted data.

### tests/unit/cross-tool-guards.test.mjs

Fixture: adapterFixture copies the real adapter and a controlled delegate into artifacts; committedGate commits copied gate files and hashes them. Real disposable Git repos exercise branch ancestry and linked-worktree commits; git-fixture-env scrubs inherited repository selectors.

Targets: .codex/hooks/mcp-guard.sh:1, .cursor/hooks/mcp-guard.sh:1, .codex/hooks/shell-guard.sh:1, .cursor/hooks/shell-guard.sh:1, .githooks/pre-push:1, .githooks/pre-commit:1; wiring .codex/hooks.json, .cursor/hooks.json, package.json.

Limit: proves adapter translation and local Git hook behavior with synthesized payloads/receipts, not that each installed host actually invokes the hook or that a live GitHub mutation is refused. Gate implementation correctness is outside this file.

1. **L38–50: MCP adapters deny delegated failures and malformed decisions**

   Assertions: `L45 equal(permission, "deny")`; `L48 equal(r.status, 0)`.

2. **L52–65: Codex shell decisions normalize ask and delegated failures to deny**

   Assertions: `L54 equal(cfg.hooks.PreToolUse[0].hooks[0].command, "bash .codex/hooks/shell-guard.sh")`; `L58 equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, "deny")`; `L62 equal(r.status, 0)`; `L63 equal(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, "advice")`.

3. **L67–79: each host's hook config points at an executable guard that exists**

   Assertions: `L69 equal(cursor.version, 1)`; `L70 match(cursor.hooks.beforeShellExecution[0].command, /\.cursor\/hooks\/shell-guard\.sh/)`; `L72 match(codex.hooks.PreToolUse[0].hooks[0].command, /\.codex\/hooks\/shell-guard\.sh/)`; `L74 match(pkg.scripts.prepare \|\| "", /git config core\.hooksPath \.githooks/)`; `L75 match(cursor.hooks.beforeMCPExecution[0].command, /\.cursor\/hooks\/mcp-guard\.sh/)`; `L76 equal(cursor.hooks.beforeMCPExecution[0].failClosed, true)`; `L78 ok(fs.statSync(path.join(ROOT, f)).mode & 0o111)`.

4. **L84–89: the adapter blocks what bash-guard blocks, from Cursor's and Codex's payload shapes**

   Assertions: `L85 equal(guard({ command: "pkill -f chrome", cwd: ROOT }).status, 2)`; `L86 equal(guard({ tool_name: "Bash", tool_input: { command: "git push --force origin x" } }).status, 2)`; `L87 equal(guard({ command: "git push origin claude/f1-game-project-26h3ng", cwd: ROOT }).status, 2)`; `L88 equal(guard({ command: "ls -la", cwd: ROOT }).status, 0)`.

5. **L108–128: Cursor's MCP door: a run cancel is denied (exit 2), a merge needs the gate receipt, a read passes**

   Assertions: `L118 deepEqual(mcp("actions_run_trigger", { method, run_id: 1 }), { status: 2, permission: "deny" })`; `L119 equal(mcp("actions_run_trigger", { method: "cancel_workflow_run", run_id: 1 }, { APEX_RUN_CANCEL_OK: "1" }).permission, "allow")`; `L120 equal(mcp("merge_pull_request", { pullNumber: 1, merge_method: "squash" }).permission, "deny")`; `L122 deepEqual(mcp("merge_pull_request", { pullNumber: 1, merge_method: "merge", expectedHeadSha: head }), { status: 2, permission: "deny" })`; `L125 deepEqual(mcp("merge_pull_request", { pullNumber: 1, merge_method: "merge", expectedHeadSha: head }), { status: 0, permission: "allow" })`; `L126 deepEqual(mcp("pull_request_read", { method: "get", pullNumber: 1 }), { status: 0, permission: "allow" })`.

6. **L133–160: Codex's MCP door: the GitHub guard runs, an ask becomes a deny, a gated merge passes**

   Assertions: `L139 equal(r.status, 0)`; `L145 ok(g)`; `L147 ok(re.test(n))`; `L148 ok(!re.test(n))`; `L150 equal(mcp("mcp__github__merge_pull_request", { pullNumber: 1, merge_method: "squash" }), "deny")`; `L151 equal(mcp("mcp__github__merge_pull_request", { pullNumber: 1, merge_method: "merge", expectedHeadSha: head }), "deny")`; `L152 equal(mcp("mcp__github__enable_pr_auto_merge", { pullNumber: 1 }), "deny")`; `L153 equal(mcp("mcp__github__actions_run_trigger", { method: "rerun_failed_jobs", run_id: 1 }), "deny")`; `L154 equal(mcp("mcp__github__actions_run_trigger", { method: "cancel_workflow_run", run_id: 1 }), "deny")`; `L157 equal(mcp("mcp__github__merge_pull_request", { pullNumber: 1, merge_method: "merge", expectedHeadSha: head }), null)`; `L158 equal(mcp("mcp__github__update_pull_request", { pullNumber: 1, body: "x" }), null)`.

7. **L162–186: pre-push refuses the deploy branch, deletes and rewrites; passes a fast-forward and a new branch**

   Assertions: `L171 equal(push(ˋrefs/heads/x ${b} refs/heads/cursor/t-1 ${a}ˋ).status, 0)`; `L172 equal(push(ˋrefs/heads/x ${b} refs/heads/cursor/t-1 ${ZERO}ˋ).status, 0)`; `L173 equal(push(ˋrefs/heads/x ${c} refs/heads/cursor/t-1 ${b}ˋ).status, 1)`; `L174 equal(push(ˋ(delete) ${ZERO} refs/heads/cursor/t-1 ${b}ˋ).status, 1)`; `L175 equal(push(ˋrefs/heads/x ${b} refs/heads/claude/f1-game-project-26h3ng ${a}ˋ).status, 1)`; `L176 equal(push(ˋrefs/heads/x ${b} refs/heads/cursor/t-1 ${"f".repeat(40)}ˋ).status, 1)`; `L179 equal(push(ˋrefs/heads/x ${c} refs/heads/bot/spec-timings ${b}ˋ, CI).status, 0)`; `L180 equal(push(ˋrefs/heads/x ${c} refs/heads/bot/spec-timings ${b}ˋ).status, 1)`; `L181 equal(push(ˋrefs/heads/x ${c} refs/heads/cursor/t-1 ${b}ˋ, CI).status, 1)`; `L182 equal(push(ˋrefs/heads/x ${c} refs/heads/bot/spec-timings-x ${b}ˋ, CI).status, 1)`; `L183 equal(push(ˋ(delete) ${ZERO} refs/heads/bot/spec-timings ${b}ˋ, CI).status, 1)`; `L184 equal(push(ˋrefs/heads/x ${b} refs/heads/claude/f1-game-project-26h3ng ${a}ˋ, CI).status, 1)`.

8. **L188–193: pre-commit stands aside for Claude Code (its PreToolUse hook already ran the gate) and on APEX_SKIP_GUARDS=1**

   Assertions: `L191 equal(r.status, 0)`.

9. **L195–235: a real worktree commit isolates guard fixtures while preserving its branch and staged index**

   Assertions: `L227 equal(commit.status, 0)`; `L228 equal(git(linked, "branch", "--show-current"), "guarded")`; `L229 notEqual(git(linked, "rev-parse", "HEAD"), before)`; `L230 equal(git(linked, "status", "--porcelain"), "")`; `L231 equal(git(base, "config", "core.bare"), "false")`; `L232 equal(git(linked, "show", "HEAD:" + file), "// changed " + file)`.


### tests/unit/crowd-audio.test.mjs

Fixture: countingContext/param (22–60), boot (62–115) runs real signal.js and crowd.js in a VM with stub GameAudio, results visibility and tracked node creation.

Targets: js/audio/crowd.js:97–199 detach/attach/silence, :211–219 liveOk, :278–358 cheer/swell/update, :364–422 bind/wrappers; js/audio/signal.js:78–239 host publication.

Limit: bed is a recorded automation target, not measured sound. Thirty update calls prove zero mocked node creation; they do not measure all JS allocation. No actual Web Audio timing, mobile pool, grandstand placement, or acoustic output is exercised.

1. **L117–133: bed is audible during a live race near the pit straight**

   Assertions: `L121 ok(bed > 0.01)`; `L122 equal(CrowdAudio.liveOk(), true)`; `L132 ok(near > mid)`.

2. **L135–174: silent on countdown, pause, results, and SFX off**

   Assertions: `L138 ok(b.CrowdAudio.inspect().bed > 0)`; `L143 equal(b.CrowdAudio.inspect().bed, 0)`; `L149 equal(b.CrowdAudio.inspect().bed, 0)`; `L155 equal(b.CrowdAudio.inspect().bed, 0)`; `L161 equal(b.CrowdAudio.inspect().bed, 0)`; `L167 equal(b.CrowdAudio.inspect().bed, 0)`; `L173 equal(b.CrowdAudio.inspect().bed, 0)`.

3. **L176–197: P3 overtake and chequered-flag swells are capped**

   Assertions: `L183 ok(afterPass.swell > 0)`; `L184 ok(afterPass.bed <= 0.11 + 1e-6)`; `L192 ok(afterFlag.swell > 0 \|\| afterFlag.bed > 0.01)`; `L193 ok(afterFlag.bed <= 0.11 + 1e-6)`; `L196 ok(CrowdAudio.inspect().bed <= 0.11 + 1e-6)`.

4. **L199–208: attach builds a fixed graph; update allocates no nodes**

   Assertions: `L201 ok(CrowdAudio._cheerPool() >= 2)`; `L207 equal(created(), 0)`.

5. **L210–221: GameAudioSignal.lastHost is published for the crowd leaf**

   Assertions: `L220 equal(GameAudioSignal.lastHost(), host)`.

6. **L223–236: setGridIdle and stopEngine silence the bed**

   Assertions: `L226 ok(CrowdAudio.inspect().bed > 0)`; `L228 equal(CrowdAudio.inspect().bed, 0)`; `L235 equal(CrowdAudio.inspect().bed, 0)`.

7. **L238–254: silence() cuts a sounding cheer's envelope, then aims it at 0 (also after an earlier silence)**

   Assertions: `L244 equal(CrowdAudio.fireCheer(0.05, 1), true)`; `L246 ok(cheer)`; `L250 equal(cheer.holds, holds + 1)`; `L251 equal(cheer.heldAt, ctx.currentTime)`; `L252 equal(cheer.targets.length, before + 1)`; `L253 equal(cheer.targets[cheer.targets.length - 1], 0)`.

8. **L256–297: crowd reattaches after an AudioContext rebuild (startEngineGraph bypass)**

   Assertions: `L282 equal(CrowdAudio.attach(), true)`; `L283 equal(CrowdAudio.inspect().attached, true)`; `L285 ok(oldSrc)`; `L294 equal(CrowdAudio.inspect().attached, true)`; `L295 ok(oldDisc > 0)`; `L296 ok(b.created() > 0)`.


### tests/unit/crowd-ctx-rebuild.test.mjs

Fixture: labeled fakeContext with per-node context/disconnect counters (22–66); bootCrowd mutable host (68–112), real crowd/signal in VM; engine.js read as text.

Targets: js/audio/crowd.js:97–181 detach/ensureAttached/attach, :332–358 update; js/audio/engine.js:899–929 rebuild detach/rebind and :1529–1530 graph attach.

Limit: the two runtime cases exercise real crowd code on fake contexts; the third is ordered substring matching in engine source, not execution of engine rebuild or a real closed AudioContext.

1. **L114–133: update() reattaches the bed onto a new AudioContext after a closed-ctx rebuild**

   Assertions: `L117 ok(bedA)`; `L118 equal(bedA.context, a.ctx)`; `L119 equal(CrowdAudio.inspect().ctx, a.ctx)`; `L127 equal(info.attached, true)`; `L128 equal(info.ctx, b.ctx)`; `L129 ok(info.bedGain)`; `L130 equal(info.bedGain.context, b.ctx)`; `L131 notEqual(info.bedGain, bedA)`; `L132 ok((bedA.disc \|\| 0) > 0)`.

2. **L135–153: ensureAttached / update refuse a bedGain whose context is already closed**

   Assertions: `L138 ok(bedA)`; `L144 equal(CrowdAudio.inspect().attached, false)`; `L145 equal(CrowdAudio.inspect().bedGain, null)`; `L151 equal(CrowdAudio.inspect().ctx, b.ctx)`; `L152 equal(CrowdAudio.inspect().bedGain.context, b.ctx)`.

3. **L155–172: rebuildCtx / startEngineGraph in engine.js call CrowdAudio detach+attach (#3289)**

   Assertions: `L158 match(ENGINE, /CrowdAudio\.detach/)`; `L159 match(ENGINE, /CrowdAudio\.attach/)`; `L164 ok(rebuildIdx > 0 && detachIdx > rebuildIdx && detachIdx < createIdx)`; `L166 ok(attachIdx > createIdx)`; `L170 ok(graphAttach > graphIdx && graphAttach < stopIdx)`.


### tests/unit/css-comments.test.mjs

Fixture: all immediate css/*.css; local tokenizer-like stripComments (47–61) and prelude walker (64–77).

Targets: css/ directory; production selectors/declarations are the data under audit.

Limit: a 230-character prelude ceiling, orphaned closer scan and brace equality are heuristics, not a CSS parser. Quotes/escaped braces and valid long selector lists can confuse the scans; balanced runaway comments can survive these checks (css-faces owns the font manifestation).

1. **L81–96: no stylesheet has a prelude long enough to be prose**

   Assertions: `L92 deepEqual(bad, [])`.

2. **L98–116: no orphaned comment-closer survives stripping**

   Assertions: `L113 deepEqual(bad, [])`.

3. **L118–128: braces balance once comments are stripped**

   Assertions: `L127 deepEqual(bad, [])`.


### tests/unit/css-critical-path.test.mjs

Fixture: real tools/manifest.cjs, shell index.html, six TITLE_CRITICAL sheets and four SETTINGS_FOUC sheets (24–31).

Targets: tools/manifest.cjs:486–522 CSS/loading sets; index.html link blocks; css/tokens.css:24–48 fonts, css/fonts-hud.css:8–56 deferred faces; css/responsive.css:150 rotate guard; css/overlays.css:103 race show rule.

Limit: exact lists, regex shell attributes and filesystem byte totals prove source contracts. They do not measure network scheduling, font loads, LCP, FOUC, dialog box recovery, or actual rotation behavior. Byte ceilings are strictly <233300 for both blocking/preload; settings payload must exceed 70000.

1. **L36–42: CSS_PRELOAD is the title-critical set, not settings/dialogs**

   Assertions: `L37 deepEqual(MANIFEST.CSS_PRELOAD, TITLE_CRITICAL)`; `L39 equal(MANIFEST.CSS_PRELOAD.includes(f), false)`; `L40 ok(MANIFEST.CSS_DEFERRED.includes(f))`.

2. **L44–60: the shell preload and stylesheet blocks match the manifest**

   Assertions: `L47 deepEqual(preload, MANIFEST.CSS_PRELOAD)`; `L51 deepEqual(hrefs, MANIFEST.CSS)`; `L57 equal(print, deferred.has(file))`.

3. **L62–68: title font preloads and the density stamp stay in the shell**

   Assertions: `L63 match(html, /titillium-web-latin-600-normal\.woff2" as="font"/)`; `L64 match(html, /titillium-web-latin-700-italic\.woff2" as="font"/)`; `L65 match(html, /saira-apex26-800-italic\.woff2" as="font"/)`; `L66 match(html, /data-density/)`; `L67 doesNotMatch(html, /barlow-condensed[^"]+" as="font"/)`.

4. **L70–84: Barlow and unused Titillium faces live in deferred fonts-hud.css**

   Assertions: `L73 doesNotMatch(tokens, /font-family:\s*"Barlow Condensed"/)`; `L74 doesNotMatch(tokens, /titillium-web-latin-400-normal/)`; `L75 doesNotMatch(tokens, /titillium-web-latin-700-normal/)`; `L76 match(tokens, /titillium-web-latin-600-normal/)`; `L77 match(tokens, /titillium-web-latin-700-italic/)`; `L78 match(tokens, /saira-apex26-800-italic/)`; `L79 match(hud, /Barlow Condensed/)`; `L80 match(hud, /titillium-web-latin-400-normal/)`; `L81 match(hud, /titillium-web-latin-700-normal/)`; `L82 ok(MANIFEST.CSS_DEFERRED.includes("css/fonts-hud.css"))`; `L83 equal(MANIFEST.CSS_PRELOAD.includes("css/fonts-hud.css"), false)`.

5. **L86–96: blocking sheets restate the dialog.screen closed-box guard**

   Assertions: `L89 match(blocking, /dialog\.screen:not\(\[open\]\)\s*\{\s*display:\s*none/)`; `L91 match(blocking, /dialog\.screen\[open\]\s*\{\s*display:\s*grid/)`; `L93 match(blocking, /dialog\.screen\s*\{[^}]*width:\s*100%/)`; `L95 match(blocking, /dialog\.screen\s*\{[^}]*height:\s*100%/)`.

6. **L98–106: blocking sheets hide #rotate-device until overlays.css arrives**

   Assertions: `L101 match(blocking, /#rotate-device\s*\{\s*display:\s*none\s*;?\s*\}/)`; `L104 match(overlays, /body\.in-race:not\(\.rotate-ok\) #rotate-device \{ display: flex; \}/)`.

7. **L108–135: blocking and preload byte census stay under the post-cut ceilings**

   Assertions: `L110 deepEqual(blocked, TITLE_CRITICAL)`; `L131 ok(blocking < 233300)`; `L132 ok(preload < 233300)`; `L134 ok(settingsBytes > 70000)`.


### tests/unit/css-faces.test.mjs

Fixture: all immediate css sheets and assets/fonts/*.woff2; stripComments preserves line offsets (51–68); synthetic historical-shaped runaway comment (122–131).

Targets: css/tokens.css and css/fonts-hud.css live font rules; assets/fonts directory.

Limit: matches literal @font-face blocks/asset URLs, not CSSOM or font decoding. Historical fixture validates the checker’s reduced shape; it does not check out or run that historical commit.

1. **L72–83: every CSS comment is terminated**

   Assertions: `L76 equal(unterminated, -1)`.

2. **L85–103: every shipped woff2 is named by a LIVE @font-face**

   Assertions: `L88 ok(onDisk.length > 0)`; `L96 deepEqual([...named].sort(), onDisk)`; `L100 equal(faces.length, onDisk.length)`.

3. **L105–116: no font reference survives ONLY inside a comment**

   Assertions: `L112 deepEqual(buried, [])`.

4. **L118–142: the guard fires on ebde6cd's shape, not just on healthy input**

   Assertions: `L134 equal(unterminated, -1)`; `L137 equal((out.match(/@font-face\s*\{[^}]*\}/g) \|\| []).length, 0)`; `L140 deepEqual(out.match(/assets\/fonts\/[A-Za-z0-9._-]+\.woff2/g), null)`.


### tests/unit/css-has-scope.test.mjs

Fixture: static shellElements depth walk (21–40), body/HUD child maps, comment-stripped immediate css sheets; recursive nonvendor js text scan.

Targets: index.html parent structure, css/ body/html :has selectors; js/data/telemetry.js runtime dialog attachment.

Limit: six source contracts, not measured selector performance or browser selector matching. Tag parsing and JS construction regexes support current idioms, not arbitrary generated DOM. Specificity check exempts named pmsettings/flyby/lighting/camtune intermediary IDs.

1. **L73–76: the shell walk is not vacuous**

   Assertions: `L74 ok(BODY_KIDS.has(id))`; `L75 ok(!BODY_KIDS.has("hud-limits"))`.

2. **L103–123: every scoped :has(> …) chain is the shell's real parent chain, step by step**

   Assertions: `L121 ok(n >= 40)`; `L122 deepEqual(bad, [])`.

3. **L125–133: an added chain step cannot raise specificity: every step between body and the target is :where()**

   Assertions: `L132 deepEqual(bad, [])`.

4. **L135–146: scoped :has(> .screen…) holds: every .screen is a <body> child and none is built in JS**

   Assertions: `L137 ok(screens.length >= 10)`; `L138 deepEqual(screens.filter((e) => e.parent !== "body").map((e) => e.id \|\| e.tag), [])`; `L145 deepEqual(js, [])`.

5. **L148–155: a <body> or #hud child is never searched for unscoped (write :has(> #id…) / :has(> :where(#hud) > #id…))**

   Assertions: `L154 deepEqual(bad, [])`.

6. **L161–176: scoped :has(> dialog…) holds: every shell <dialog> is a <body> child; the runtime one hangs off #datahub**

   Assertions: `L163 ok(dialogs.length >= 15)`; `L164 deepEqual(dialogs.filter((e) => e.parent !== "body").map((e) => e.id \|\| e.tag), [])`; `L171 deepEqual(built, ["js/data/telemetry.js"])`; `L172 match(read("js/data/telemetry.js"), /const host = document\.getElementById\("datahub"\) \\|\\| document\.body;\s*host\.appendChild\(overlay\);/)`; `L175 deepEqual(bad, [])`.


### tests/unit/css-layers.test.mjs

Fixture: all immediate css sheets; CSS_SOURCES reexport from tests/helpers/css-source.mjs → tools/lib/css-source.mjs:7–17; real manifest; index.html dialog/hidden roots and js dialog-construction scans.

Targets: css/tokens.css:13 layer order; all CSS layer wrappers; tools/manifest.cjs:486–522 order/defer policy; tools/lib/css-source.mjs:7–17 families; css/loading.css and menu screen z-index rules.

Limit: one dynamic test is registered per qualifying wrapped sheet, plus six fixed tests. Brace/subject/display regexes approximate the cascade, exempt components-family/tokens from dialog restatement checks and derive runtime roots only from el(dialog,class). Hidden guard requires a matching selector’s existence, not verification that its declaration is display:none or that every qualifier/media combination remains hidden. Loading compares five named id-addressed menus only.

1. **L37–51: split stylesheet families retain contiguous cascade order and loading mode**

   Assertions: `L42 ok(start >= 0)`; `L43 deepEqual(manifest.CSS.slice(start, start + family.length), family)`; `L47 equal(deferred.has(file), loadingMode)`.

2. **L83–125: ${file}: every rule is inside its @layer**

   Assertions: `L96 strictEqual(depth, 0)`; `L101 ok(closedAt !== null)`; `L120 deepStrictEqual(bare, [])`.

3. **L128–143: every stylesheet except tokens.css opens with its @layer wrapper**

   Assertions: `L139 deepStrictEqual(unwrapped, [])`.

4. **L145–153: the cascade order is declared exactly once, in tokens.css**

   Assertions: `L150 deepStrictEqual(decls, ["tokens.css"])`.

5. **L170–308: a dialog styled from a winning position restates its closed state**

   Assertions: `L183 ok(staticRoots.length >= 10)`; `L205 strictEqual(bareCreate, null)`; `L215 ok(staticRoots.some((r) => r.family === fam))`; `L219 ok(jsFiles.some((p) => fs.readFileSync(p, "utf8").includes(ˋ"${cls}"ˋ)))`; `L297 deepStrictEqual(offenders, [])`.

6. **L328–358: an element that ships the hidden attribute is not un-hidden by a display rule**

   Assertions: `L334 ok(hiddenIds.size > 10)`; `L355 deepEqual(offenders, [])`.

7. **L368–386: #loading stacks above every id-addressed menu screen**

   Assertions: `L381 ok(Number.isFinite(z.loading))`; `L383 deepEqual(under, [])`.


### tests/unit/css-media-disjoint.test.mjs

Fixture: comment stripping, brace-matched media blocks (42–58), top-level selector lists (61–78); real track-detail/responsive CSS.

Targets: css/track-detail.css row branches; css/responsive.css large menu branches.

Limit: finds blocks through specific literal selectors/declarations and requires >=2 each; this is no viewport matrix, flex-layout measurement or general logical proof of disjoint media queries.

1. **L80–90: every row-layout branch in track-detail.css requires landscape**

   Assertions: `L84 ok(rowBranches.length >= 2)`; `L87 match(b.condition, /orientation:\s*landscape/)`.

2. **L92–105: both large-screen menu blocks in responsive.css guard every selector on density**

   Assertions: `L96 ok(menuBlocks.length >= 2)`; `L101 ok(sel.startsWith(GUARD))`.


### tests/unit/css-play.test.mjs

Fixture: imports actual tools/ui/css-play.mjs exports; real menu-screens catalog; subprocess help/list only; reads tool and shell adapter source.

Targets: tools/ui/css-play.mjs:46–156 catalog/path/parser, :157 help, :199 DOM function, :336 run workflow; tools/mcp/playwright-mcp.sh help/play/dom dispatch; tools/ui/menu-screens.mjs catalog.

Limit: collectDomInfo is inspected via toString, not run in a browser. Harness import, canvas hiding and ?play hot-swap are textual contracts. No server, stylesheet replacement, screenshot, computed box or live browser behavior is verified.

1. **L31–47: parseCssPlayArgs: screen, css hot-swap, sel, no-shot, json**

   Assertions: `L39 equal(a.mode, "play")`; `L40 equal(a.screen, "settings")`; `L41 equal(a.css, "css/menus.css")`; `L42 equal(a.sel, ".sheet")`; `L43 equal(a.shot, false)`; `L44 equal(a.json, true)`; `L45 equal(a.viewport.width, 852)`; `L46 equal(a.viewport.height, 393)`.

2. **L49–54: parseCssPlayArgs: positional screen and --list / --help**

   Assertions: `L50 equal(parseCssPlayArgs(["garage"]).screen, "garage")`; `L51 equal(parseCssPlayArgs(["--list"]).mode, "list")`; `L52 equal(parseCssPlayArgs(["--help"]).mode, "help")`; `L53 equal(parseCssPlayArgs(["--desktop"]).viewport.width, 1280)`.

3. **L56–63: resolveScreen aliases map onto the catalog**

   Assertions: `L57 equal(resolveScreen("pmsettings"), "settings")`; `L58 equal(resolveScreen("carsetup"), "garage")`; `L59 equal(resolveScreen("overlay"), "title")`; `L60 equal(resolveScreen("help"), "howtoplay")`; `L61 equal(resolveScreen("pausemenu"), "pause")`; `L62 throws(() => resolveScreen("not-a-screen"), /unknown screen/)`.

4. **L65–70: assertCssRel stays inside css/ and exists on disk**

   Assertions: `L66 equal(assertCssRel("css/menus.css"), "css/menus.css")`; `L67 throws(() => assertCssRel("../etc/passwd"), /css\/\*\.css\|escapes/)`; `L68 throws(() => assertCssRel("js/game.js"), /css\/\*\.css/)`; `L69 throws(() => assertCssRel("css/../index.html"), /escapes\|css\/\*\.css/)`.

5. **L72–80: every css-play screen id is a menu-screens screen**

   Assertions: `L76 ok(ids.length >= 6)`; `L78 deepEqual(missing, [])`.

6. **L82–88: listScreens names a root and a click path**

   Assertions: `L85 ok(settings)`; `L86 equal(settings.root, "#pmsettings")`; `L87 ok(settings.clicks.includes("#mb-settings"))`.

7. **L90–99: collectDomInfo is a page-serialisable function (no Node closes)**

   Assertions: `L92 match(src, /getBoundingClientRect/)`; `L93 match(src, /getComputedStyle/)`; `L94 match(src, /--tap/)`; `L95 match(src, /UiLayers/)`; `L96 match(src, /topEl\.id/)`; `L97 match(src, /currentCSSZoom/)`; `L98 doesNotMatch(src, /\bROOT\b\|\b__dirname\b\|\bprocess\./)`.

8. **L101–113: css-play --help answers without a browser and names the loop**

   Assertions: `L105 equal(r.status, 0)`; `L107 match(text, /--screen/)`; `L108 match(text, /--css/)`; `L109 match(text, /hot-swap\|hot swap/i)`; `L110 match(text, /--no-shot/)`; `L111 match(text, /artifacts\/css-play/)`; `L112 doesNotMatch(text, /bump-cache --apply/)`.

9. **L115–125: css-play --list prints screen ids without Chromium**

   Assertions: `L119 equal(r.status, 0)`; `L120 match(r.stdout, /title/)`; `L121 match(r.stdout, /settings/)`; `L122 match(r.stdout, /#pmsettings/)`; `L123 match(r.stdout, /pause/)`; `L124 match(r.stdout, /#pausemenu/)`.

10. **L127–134: the tool uses harness.mjs and never bumps cache**

   Assertions: `L129 match(src, /from ["']\.{1,2}\/(?:lib\/)?harness\.mjs["']/)`; `L130 doesNotMatch(src, /bump-cache\.mjs/)`; `L131 doesNotMatch(src, /spawn\(\s*["']python3["']/)`; `L132 match(src, /visibility["']:\s*["']hidden["']\|#game[\s\S]{0,80}hidden/)`; `L133 match(src, /\?play=/)`.

11. **L136–147: playwright-mcp.sh grows play + dom commands that call css-play**

   Assertions: `L140 equal(help.status, 0)`; `L141 match(help.stdout, /\bdom\b/)`; `L142 match(help.stdout, /\bplay\b/)`; `L143 match(help.stdout, /css-play\.mjs/)`; `L145 match(src, /css-play\.mjs/)`; `L146 match(src, /cmd_dom\|dom\)/)`.


### tests/unit/css-prefers-cascade.test.mjs

Fixture: local parseCss/splitTop/declaration database (25–119), three synthetic ordering inputs and manifest-ordered real CSS; layers parsed from tokens.css.

Targets: tools/manifest.cjs:486 CSS order; css/tokens.css:13 layer order and :208/:991/:1040 theme color-scheme; CSS preference/device rules; solid-surface rules in components/data/dialogs.

Limit: same normalized selector + property only; unconditional differing-value later/higher-layer overriders only. Custom properties and important remedies are skipped; no specificity comparison, shorthand expansion or browser matching. KNOWN_DEAD pins hud.css .sec-row.sec-flash animation and rejects stale exemptions.

1. **L121–128: detector: a later unconditional rule on the same selector kills a prefers-* declaration**

   Assertions: `L124 equal(deadPrefersDeclarations(css("@layer base { @media (prefers-contrast: more) { .x { color: red; } } .x { color: blue; } }"), layers).length, 1)`; `L125 equal(deadPrefersDeclarations(css("@layer base { .x { color: blue; } @media (prefers-contrast: more) { .x { color: red; } } }"), layers).length, 0)`; `L127 equal(deadPrefersDeclarations(two, layers).length, 1)`.

2. **L145–152: every prefers-*/pointer/hover/orientation @media declaration in css/ survives the cascade**

   Assertions: `L149 deepEqual(unexpected, [])`; `L151 deepEqual(stale, [])`.

3. **L154–163: the solid-surface remedies exist for sheet, hub card and dim scrim**

   Assertions: `L159 equal(find("components.css", ".sheet").length, 1)`; `L160 equal(find("data.css", ".dh-card").length, 1)`; `L161 equal(find("dialogs.css", ".screen.dim").length, 1)`; `L162 equal(find("dialogs.css", "#pausemenu.screen.dim").length, 1)`.

4. **L165–173: the root color scheme follows the selected Appearance theme**

   Assertions: `L167 match(css, /:root\s*\{[^}]*\bcolor-scheme\s*:\s*dark\s*;/s)`; `L169 match(css, /:root\[data-ui-theme="light"\]\s*\{[^}]*\bcolor-scheme\s*:\s*light\s*;/s)`; `L171 match(css, /:root\[data-ui-theme="system"\]\s*\{\s*color-scheme\s*:\s*dark\s+light\s*;/s)`.


### tests/unit/css-token-adoption.test.mjs

Fixture: real ratchet load() tree plus tree-counts exports; four-scenario synthetic title/menus/new-screen input.

Targets: tools/check/tree-counts.mjs:129–158 sheets/floor and :241–258 zeroSpacingSheets; tools/lib/css-source.mjs:7–17 logical families; tools/check/ratchets.mjs load; tests/data/ratchets.json and fragments.

Limit: asserts metric existence and slack=0, not the numerical counts (ratchets.test owns those). Floor only sanity-bounded 10–30. Current KNOWN_ZERO is empty. Screen-family aggregation permits one split file to consume spacing tokens for the family; unknown sheets retain independent checks.

1. **L77–86: the four token-adoption counts are ratcheted at exact equality**

   Assertions: `L81 ok(e)`; `L82 equal(e.slack, 0)`.

2. **L91–94: the --fs-micro floor still resolves from css/tokens.css**

   Assertions: `L93 ok(floor >= 10 && floor <= 30)`.

3. **L99–117: the zero-spacing-token sheet list only shrinks**

   Assertions: `L110 deepEqual(added, [])`; `L115 deepEqual(fixed, [])`.

4. **L119–129: density adoption follows a split screen while new sheets retain their own gate**

   Assertions: `L123 deepEqual(zeroSpacingSheets([title, menus]), [])`; `L125 deepEqual(zeroSpacingSheets([title, menus, newScreen]), ["new-screen.css"])`; `L127 deepEqual(zeroSpacingSheets([title, { ...menus, src: "#menu-buttons { gap: 10px; }" }]), ["menus.css"])`.


### tests/unit/css-tokens.test.mjs

Fixture: comment-stripped definitions in tokens.css, raw recursive css/js+shell consumer haystack; pane-pair shell scan; readCssSource logical menus union.

Targets: css/tokens.css definitions; css/overlays.css:1250 pair default; js/ui/sheet-shape.js pair classifier contract; css/menus.css season stacked overflow rules.

Limit: token consumers are textual var()/setProperty matches in raw source, including comments; they do not establish live consumption. Pane-pair matching is an id/declaration regex, not actual sizing/scroll reachability. More than 30 tokens and >=3 pairs prevent obvious vacuity.

1. **L58–75: every token defined in css/tokens.css is read somewhere**

   Assertions: `L62 ok(defined.size > 30)`; `L72 deepEqual(unused, [])`.

2. **L92–120: every .pane-pair sheet declares the --pair-at that switches it on**

   Assertions: `L98 ok(pairs.length >= 3)`; `L101 deepEqual(missing, [])`; `L107 match(css, /\.pane-pair\s*\{[^}]*--pair-compact\s*:\s*off/)`; `L110 match(shape, /--pair-compact/)`; `L112 match(shape, /mode === "wide"/)`; `L117 match(css, /#ss-inner\s*\{[^}]*--pair-compact\s*:\s*wide/)`; `L118 doesNotMatch(css, /\[data-density="compact"\]\s*\{[^}]*--pair-at\s*:\s*2000px/)`.

3. **L122–133: stacked season setup has one reachable vertical scroll owner**

   Assertions: `L125 ok(body)`; `L126 match(body[1], /overflow-y\s*:\s*auto\b/)`; `L130 ok(panes)`; `L131 match(panes[1], /overflow\s*:\s*visible\b/)`.


### tests/unit/ctx-lost-menu-restore.test.mjs

Fixture: gameSource union and symbolSource extraction, fake DOM Node tree and real title-menu VM; extracted raceTrackStepped with sequenced build results and lost/stale functions.

Targets: js/game.js:2006–2013 raceTrackStepped, :2471 startRaceBody, :4312–4333 recovery; js/ui/title-menu.js:59–95 repair; js/ui/select-screen.js:227–251 restoration and :1534 return wiring.

Limit: repair is executable on a minimal DOM; recovery/wiring are text checks, not dialog/inert/canvas integration. Retry VM only runs the extracted helper with stub loaders, not actual track construction/session ownership.

1. **L14–22: quitToMenuAfterCtxLost runs menu + preview recovery before the notice**

   Assertions: `L17 ok(fn.includes("restoreMenuAfterGraphicsReset()"))`; `L18 ok(fn.includes("resetSetupCam()"))`; `L19 ok(fn.includes("spMeshBust()"))`; `L20 ok(fn.includes("showCtxLostNotice()"))`; `L21 ok(fn.indexOf("restoreMenuAfterGraphicsReset()") < fn.indexOf("showCtxLostNotice()"))`.

2. **L24–56: TitleMenu.repairDestinations remounts orphaned play doors**

   Assertions: `L47 equal(vm.runInContext("TitleMenu.repairDestinations(document)", ctx), true)`; `L50 ok(btn)`; `L53 ok((primary && primary.contains(btn)) \|\| (explore && explore.contains(btn)))`; `L54 equal(btn.hidden, false)`.

3. **L58–64: Menus.create returns restoreMenuAfterGraphicsReset for game.js wiring**

   Assertions: `L60 ok(src.includes("restoreMenuAfterGraphicsReset"))`; `L61 ok(src.includes("TitleMenu.repairDestinations"))`; `L62 ok(src.includes("TopModal.syncMenuIsolation"))`; `L63 ok(src.includes("restoreMenuAfterGraphicsReset,"))`.

4. **L80–85: startRaceBody builds through raceTrackStepped, not a bare ctx-lost branch**

   Assertions: `L83 ok(body.includes("await raceTrackStepped(trackIdx, stale)"))`; `L84 ok(!/loadTrackStepped\([^)]*\)\)\s*&&\s*!stale\(\)\)\s*\{\s*quitToMenuAfterCtxLost/.test(body))`.

5. **L87–93: raceTrackStepped: a superseded build with the context intact retries, no graphics-reset quit**

   Assertions: `L89 equal(await h.run(), true)`; `L90 equal(h.calls.builds, 2)`; `L91 equal(h.calls.ctxQuits, 0)`; `L92 equal(h.calls.liveAtCall, true)`.

6. **L95–100: raceTrackStepped: a real context loss still takes the ctx-lost quit**

   Assertions: `L97 equal(await h.run(), false)`; `L98 equal(h.calls.ctxQuits, 1)`; `L99 equal(h.calls.builds, 1)`.

7. **L102–106: raceTrackStepped: a stale session returns false without any quit**

   Assertions: `L104 equal(await h.run(), false)`; `L105 equal(h.calls.ctxQuits, 0)`.

8. **L108–113: raceTrackStepped: superseded twice fails the start (onFail), not a graphics reset**

   Assertions: `L110 rejects(h.run(), /superseded twice/)`; `L111 equal(h.calls.ctxQuits, 0)`; `L112 equal(h.calls.builds, 2)`.


### tests/unit/ctx-lost-notice.test.mjs

Fixture: tests/helpers/glx-mock.mjs bootGlx context event/timer harness; tlxLossVm (35–50) plus fnSource-extracted TLX callbacks and real GfxEscalation; menu/game source pins.

Targets: js/render/glx/glx.js:717/:743 notice writes; js/render/three/tlx.js:1043 device loss, :1151 restore; js/perf/gfx-escalation.js:36 budget reset; js/ui/select-screen.js:149–224 consume/retry; js/game.js:2906/:3403/:4534 reset sites.

Limit: mocked events and extracted callbacks establish notice-before-reload ordering and budget branches, not real graphics loss, driver recovery or navigation. Source reset proximity checks do not run race lights/endRace.

1. **L16–23: GLX arms apex26.ctxLostNotice before an automatic reload**

   Assertions: `L20 equal(h.sandbox.sessionStorage.getItem("apex26.ctxLostReloads"), "1")`; `L22 equal(h.sandbox.sessionStorage.getItem("apex26.ctxLostNotice"), "1")`.

2. **L26–33: GLX: webglcontextrestored winning the race against the timer still arms the notice**

   Assertions: `L32 equal(h.sandbox.sessionStorage.getItem("apex26.ctxLostNotice"), "1")`.

3. **L52–66: TLX: device-loss reloads (first, second, third) and refuseTab all arm the notice first**

   Assertions: `L60 deepEqual(out.reloads, ["1"])`; `L65 deepEqual(out.reloads, ["1"])`.

4. **L69–87: past the reload budget: no reload, no notice (TLX loss, TLX refuseTab, GLX restore)**

   Assertions: `L76 deepEqual(out.reloads, [])`; `L77 equal(store["apex26.ctxLostNotice"], undefined)`; `L80 deepEqual(ro.reloads, [])`; `L81 equal(rs["apex26.ctxLostNotice"], undefined)`; `L86 equal(h.sandbox.sessionStorage.getItem("apex26.ctxLostNotice"), null)`.

5. **L89–102: TLX: a webglcontextrestored reload after a counted loss arms the notice; a bare one does not**

   Assertions: `L92 ok(i > 0)`; `L100 deepEqual(out.reloads, [counted ? "1" : null])`.

6. **L104–113: select-screen consumes apex26.ctxLostNotice and wires RETRY to startRace**

   Assertions: `L106 ok(menus.includes('sessionStorage.getItem(CTX_LOST_NOTICE_KEY) === "1"'))`; `L107 ok(menus.includes("sessionStorage.removeItem(CTX_LOST_NOTICE_KEY)"))`; `L108 ok(menus.includes("if (G.startRace) G.startRace()"))`; `L110 ok(game.includes("function quitToMenuAfterCtxLost()"))`; `L111 ok(game.includes("stashCtxLostNotice()"))`; `L112 ok(game.includes("Graphics reset — retrying with lighter settings"))`.

7. **L115–121: lights-out and goRolling clear apex26.ctxLostReloads**

   Assertions: `L118 ok(lights > 0)`; `L119 ok(game.slice(lights, lights + 220).includes('GfxEscalation.resetReloadBudget()'))`; `L120 ok(game.includes('goRolling: () => { if (state !== "count") return false; GfxEscalation.resetReloadBudget()'))`.

8. **L123–128: endRace still clears apex26.ctxLostReloads (radio-voice pin)**

   Assertions: `L126 ok(i >= 0)`; `L127 ok(game.slice(i, i + 400).includes('GfxEscalation.resetReloadBudget()'))`.


### tests/unit/cursor-agents.test.mjs

Fixture: synthetic SSE, queued fetch/Response stub (123–133), disposable allow/cache/artifact directories, fake clock (310–320), explicit fake credentials, FIX multi-event transcript (812–829). Imports actual CLI/transcript implementations.

Targets: tools/ci/cursor-agents.mjs:57–95 retry/API, :98–213 digest, :215–278 transcript cache, :290–319 allowlist, :342–535 validation/body, :557–652 writes, :654–837 reads/wait/handback/artifacts/usage; tools/lib/cursor-transcript.mjs:16–303 parsing/masking/rendering. Per-case API names below distinguish these surfaces.

Limit: no network or real agent is used. Requests are recorded by the fetch stub; tests do not establish server API compatibility, billing semantics or that named hosts are reachable. Redaction covers synthetic patterns and is best effort, as production source explicitly says. API paths and pseudo file names inside SSE/arguments are fixture data, not navigation destinations.

1. **L70–75: parseSse keeps typed rows and skips a partial one**

   Assertions: `L73 equal(rows.length, 1)`; `L74 equal(rows[0].event, "status")`.

2. **L77–101: digestRun counts edit echo, repeat reads, discovery dups and terminal classes**

   Assertions: `L93 equal(m.editEchoChars, 220)`; `L94 equal(m.repeatReads, 1)`; `L95 equal(m.mcpDiscovery, 2)`; `L96 equal(m.mcpDiscoveryDup, 1)`; `L97 equal(m.terminal["sync-pr"].calls, 1)`; `L98 equal(m.terminal["(args missing)"].calls, 1)`; `L99 equal(m.noArgs, 1)`; `L100 ok(m.thinkChars > 0)`.

3. **L103–111: mergeDigests sums runs and formatDigest prints typed lines**

   Assertions: `L106 equal(t.runs, 2)`; `L107 equal(t.calls.grep_search, 2)`; `L109 match(lines[0], /^DIGEST runs=2 calls=2 /)`; `L110 ok(lines.some((l) => l.startsWith("EDIT_ECHO ")))`.

4. **L138–148: buildLaunchBody defaults to no PR, no live-branch push, a minted bc- id and a capped name**

   Assertions: `L140 equal(b.model.id, DEFAULT_MODEL)`; `L141 ok((/^bc-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/).test(b.agentId))`; `L142 equal(b.autoCreatePR, false)`; `L143 equal(b.workOnCurrentBranch, false)`; `L144 deepEqual(b.env, { type: "cloud" })`; `L145 equal(b.name.length, 100)`; `L146 equal(b.mode, undefined)`; `L147 equal(b.repos[0].startingRef, undefined)`.

5. **L150–162: buildLaunchBody maps ref, pr, flags and rejects bad input**

   Assertions: `L151 equal(buildLaunchBody({ prompt: "p", ref: "main" }).repos[0].startingRef, "main")`; `L153 equal(pr.repos[0].prUrl, "https://github.com/o/r/pull/1")`; `L154 equal(pr.repos[0].startingRef, undefined)`; `L155 equal(pr.autoCreatePR, true)`; `L156 equal(pr.workOnCurrentBranch, true)`; `L157 equal(pr.mode, "plan")`; `L158 throws(() => buildLaunchBody({ prompt: "p", ref: "main", prUrl: "u" }), /exclusive/)`; `L159 throws(() => buildLaunchBody({ prompt: " " }), /empty/)`; `L160 throws(() => buildLaunchBody({ prompt: "x".repeat(100001) }), /over/)`; `L161 throws(() => buildLaunchBody({ prompt: "p", mode: "yolo" }), /agent or plan/)`.

6. **L164–172: assertAllowed refuses malformed and unrecorded ids, accepts recorded ones**

   Assertions: `L166 throws(() => assertAllowed("../etc/passwd", file), Refused)`; `L167 throws(() => assertAllowed(undefined, file), /no id/)`; `L168 throws(() => assertAllowed(ID, file), /not launched by this tool/)`; `L171 deepEqual(Object.keys(readAllow(file)), [ID])`.

7. **L174–191: launchAgent posts the documented body, records the id and never prints the key**

   Assertions: `L180 deepEqual(calls.map((c) => c.method), ["GET", "POST"])`; `L181 ok(/\/v1\/agents$/.test(calls[1].url))`; `L182 equal(calls[1].headers.Authorization, ˋBearer ${KEY}ˋ)`; `L183 equal(calls[1].body.prompt.text, "do it")`; `L184 equal(calls[1].body.agentId, ID)`; `L185 ok((new RegExp(ˋ^LAUNCH ${ID} run=run-1 model=composer-2.5 repo=f1-game pr=off$ˋ)).test(lines[0]))`; `L186 ok(!lines.join("\n").includes(KEY))`; `L187 ok(readAllow(file)[ID])`.

8. **L193–202: launchAgent un-records the id when the API refuses (billing gate)**

   Assertions: `L197 rejects(launchAgent({ prompt: "p", agentId: ID }, { file }), /usage_limit_exceeded/)`; `L198 deepEqual(readAllow(file), {})`.

9. **L204–216: launchAgent: a 5xx retry that finds the same agentId already created is a success, not a duplicate**

   Assertions: `L209 deepEqual(calls.map((c) => c.method), ["GET", "POST", "POST", "GET"])`; `L210 equal(calls[1].body.agentId, calls[2].body.agentId)`; `L211 ok((/run=run-7 .*already created/).test(lines[0]))`; `L212 ok(readAllow(file)[ID])`.

10. **L218–230: launchAgent --dry-run sends nothing and records nothing**

   Assertions: `L223 equal(calls.length, 0)`; `L224 ok((new RegExp(ˋ^DRYRUN ${ID} promptChars=1 ˋ)).test(lines[0]))`; `L225 ok(!lines[0].includes('"text"'))`; `L226 deepEqual(readAllow(file), {})`.

11. **L232–245: followUp on an id this tool did not launch sends no request at all**

   Assertions: `L237 rejects(followUp(OTHER, "hi", undefined, { file }), Refused)`; `L238 rejects(cancelRun(OTHER, "r", { file }), Refused)`; `L239 rejects(archiveAgent(OTHER, { file }), Refused)`; `L240 rejects(deleteAgent(OTHER, { file }), Refused)`; `L241 equal(calls.length, 0)`.

12. **L247–262: followUp: 201 is FOLLOWUP, 409 agent_busy is BUSY, and a 5xx is not retried (could duplicate a run)**

   Assertions: `L252 deepEqual(await followUp(ID, "more", "plan", { file }), [ˋFOLLOWUP ${ID} run=run-2 HTTP 201ˋ])`; `L253 deepEqual(calls[0].body, { prompt: { text: "more" }, mode: "plan" })`; `L255 ok((new RegExp(ˋ^BUSY ${ID} ˋ)).test((await followUp(ID, "again", undefined, { file }))[0]))`; `L257 rejects(followUp(ID, "x", undefined, { file }), /HTTP 500/)`; `L258 equal(calls.length, 1)`.

13. **L264–274: a 429 on a write is retried (the request was not processed)**

   Assertions: `L269 ok((/^FOLLOWUP /).test((await followUp(ID, "x", undefined, { file }))[0]))`; `L270 equal(calls.length, 2)`.

14. **L276–290: cancelRun uses latestRunId by default and maps 409 run_not_cancellable**

   Assertions: `L281 deepEqual(await cancelRun(ID, undefined, { file }), [ˋCANCELLED ${ID} run=run-9ˋ])`; `L282 ok(/\/runs\/run-9\/cancel$/.test(calls[1].url))`; `L284 ok((/^NOT_CANCELLABLE /).test((await cancelRun(ID, "run-9", { file }))[0]))`; `L286 rejects(cancelRun(ID, undefined, { file }), /no run to cancel/)`.

15. **L292–305: archive keeps the allow-list entry; delete forgets it**

   Assertions: `L297 deepEqual(await archiveAgent(ID, { file }), [ˋARCHIVED ${ID}ˋ])`; `L298 ok(readAllow(file)[ID])`; `L299 deepEqual(await deleteAgent(ID, { file }), [ˋDELETED ${ID}ˋ])`; `L300 deepEqual(readAllow(file), {})`; `L301 deepEqual(calls.map((c) => c.method), ["POST", "DELETE"])`.

16. **L323–340: dump skips a 410 stream_expired, counts it, and keeps going**

   Assertions: `L332 equal(calls.length, 3)`; `L333 ok(/ written=1 skipped=0 expired=1 live=0 slow=0$/.test(line))`; `L334 equal(fs.readdirSync(dir).length, 1)`; `L336 rejects(dumpRuns([ID], dir, { gapMs: 0 }), /HTTP 403/)`.

17. **L342–360: retryAfterMs reads seconds and HTTP dates, falls back on garbage, and caps**

   Assertions: `L346 equal(retryAfterMs("7", 0, 0), 7000)`; `L347 equal(retryAfterMs(" 1.5 ", 3, 0), 1500)`; `L348 equal(retryAfterMs(new Date(10_000 + 30_000).toUTCString(), 0, 10_000), 30000)`; `L349 equal(retryAfterMs("garbage", 2, 0), 20000)`; `L350 equal(retryAfterMs(null, 1, 0), 10000)`; `L351 equal(retryAfterMs(new Date(0).toUTCString(), 0, 60_000), 5000)`; `L352 equal(retryAfterMs("3600", 0, 0), 80000)`; `L353 equal(retryAfterMs(null, 9, 0), 80000)`; `L355 equal(retryAfterMs("30", 0, 0), 2000)`.

18. **L362–376: a 429 with Retry-After sleeps that long, not the exponential default**

   Assertions: `L369 equal(calls.length, 3)`; `L370 deepEqual(t.slept, [3000, 10000])`.

19. **L378–403: list pages 150 items across two pages and passes prUrl / includeArchived**

   Assertions: `L383 equal(out.length, 150)`; `L384 equal(calls.length, 2)`; `L387 equal(u0.searchParams.get("limit"), "100")`; `L388 equal(u0.searchParams.get("cursor"), null)`; `L389 equal(u1.searchParams.get("limit"), "50")`; `L390 equal(u1.searchParams.get("cursor"), "cur-1")`; `L394 equal(u.searchParams.get("prUrl"), "https://github.com/o/r/pull/9")`; `L395 equal(u.searchParams.get("includeArchived"), "true")`; `L398 equal(new URL(calls[0].url).searchParams.get("prUrl"), null)`; `L399 equal(new URL(calls[0].url).searchParams.get("includeArchived"), null)`.

20. **L405–427: wait returns at once on IDLE, maps CANCELLED to exit 1, and times out with 124**

   Assertions: `L409 deepEqual(await waitAgent(ID), { code: 0, line: ˋWAIT ${ID} IDLE run=run-1 last=FINISHEDˋ })`; `L410 deepEqual(t.slept, [])`; `L413 equal(w.code, 1)`; `L414 equal(w.line, ˋWAIT ${ID} IDLE run=run-2 last=CANCELLEDˋ)`; `L415 deepEqual(t.slept, [5000])`; `L419 equal(to.code, 124)`; `L420 ok(to.line.startsWith(ˋWAIT ${ID} TIMEOUT ˋ))`; `L421 equal(calls.length, 3)`; `L422 equal(t.slept.reduce((a, b) => a + b, 0), 10000)`.

21. **L429–440: artifact paths: traversal and absolute paths are refused with zero requests**

   Assertions: `L433 rejects(downloadArtifact(ID, bad, tmpDir()), /artifact path/)`; `L435 equal(calls.length, 0)`; `L436 equal(checkArtifactPath("artifacts/a/b.png"), "artifacts/a/b.png")`.

22. **L442–460: artifacts lists typed rows; artifact downloads via the presigned URL with no Authorization header**

   Assertions: `L446 deepEqual(await listArtifacts(ID), [ˋARTIFACT ${ID} artifacts/a.txt 5 2026-10-20T00:00:00Zˋ])`; `L449 equal(calls.length, 2)`; `L450 ok(calls[0].url.endsWith(ˋ/v1/agents/${ID}/artifacts/download?path=artifacts%2Fdir%2Fa.txtˋ))`; `L451 equal(calls[0].headers.Authorization, ˋBearer ${KEY}ˋ)`; `L452 equal(calls[1].url, "https://s3.example/presigned?sig=1")`; `L453 equal(calls[1].headers?.Authorization, undefined)`; `L454 equal(fs.readFileSync(path.join(out, ID.slice(-8), "dir", "a.txt"), "utf8"), "hello")`; `L455 ok(/^SAVED .*a\.txt 5$/.test(lines[0]))`; `L456 ok(!lines[0].includes(KEY))`.

23. **L462–483: usage reads cost from the live shape (top-level and per-run cost), n/a when absent, types 403, throws the rest**

   Assertions: `L467 equal((await agentUsage(ID))[0], ˋUSAGE ${ID} tokens=36170 chargedCents=12 runs=2ˋ)`; `L470 equal((await agentUsage(ID))[0], ˋUSAGE ${ID} tokens=5 chargedCents=7 runs=3ˋ)`; `L473 equal((await agentUsage(ID))[0], ˋUSAGE ${ID} tokens=0 chargedCents=0 runs=0ˋ)`; `L475 equal((await agentUsage(ID))[0], ˋUSAGE ${ID} tokens=9 chargedCents=n/a runs=1ˋ)`; `L477 deepEqual(await agentUsage(ID), [ˋUSAGE ${ID} UNAVAILABLEˋ])`; `L479 rejects(agentUsage(ID), /forbidden/)`.

24. **L487–497: errorHead groups tool failures by tool and masks ids and paths; success is null**

   Assertions: `L488 equal(errorHead("get_mcp_tools", { success: { x: 1 } }), null)`; `L489 equal(errorHead("get_mcp_tools", { error: { message: 'namespace "Github" not found. Available namespaces: cursor' } }), 'get_mcp_tools: namespace "Github" not found. Available namespaces: cursor')`; `L490 equal(errorHead("run_terminal_cmd", { spawnError: { message: "ENOENT" } }), "run_terminal_cmd: spawnError ENOENT")`; `L492 equal(errorHead("mcp", mcp), "mcp: ok:false endpoint is required: pass endpoint")`; `L493 equal(errorHead("mcp", { success: { content: [{ text: { text: JSON.stringify({ ok: true }) } }] } }), null)`; `L495 equal(masked, "read_file: no file <path> run-<uuid>")`; `L496 ok(errorHead("x", { error: { message: "y".repeat(500) } }).length <= 94)`.

25. **L499–516: digest counts failures, merges them across runs and prints ERRORS plus the top ERR lines**

   Assertions: `L504 equal(a.errCalls, 1)`; `L506 ok(lines.includes("ERRORS calls=2 share=0.50 stormRuns=0 worstStreak=1"))`; `L507 ok(lines.includes('ERR x2 get_mcp_tools: namespace "Github" not found'))`; `L508 ok(formatDigest(mergeDigests([digestRun([])])).includes("ERRORS calls=0 share=0.00 stormRuns=0 worstStreak=0"))`; `L511 equal(storm.errStreak, 3)`; `L514 equal(digestRun(parseSse(sse([call("get_mcp_tools", bad), call("get_mcp_tools", bad), call("get_mcp_tools", other), call("get_mcp_tools", bad)]))).errStreak, 2)`; `L515 ok(formatDigest(mergeDigests([storm, a])).some((l) => l.startsWith("ERRORS calls=5 ") && l.endsWith("stormRuns=1 worstStreak=3")))`.

26. **L518–536: dump skips a run past the retention window without a request, and keeps a run just inside it**

   Assertions: `L530 deepEqual(calls.map((c) => c.url.split("/").slice(-2, -1)[0]), [ID, "run-bbbbbbbb", "run-cccccccc"])`; `L531 ok(/ written=2 skipped=0 expired=1 live=0 slow=0$/.test(line))`.

27. **L538–548: dump counts a RUNNING run as live without opening its stream (it would not close until the run ends)**

   Assertions: `L543 deepEqual(calls.map((c) => c.url.split("/").slice(-2, -1)[0]), [ID, "run-bbbbbbbb"])`; `L544 ok(/ written=1 skipped=0 expired=0 live=1 slow=0$/.test(line))`.

28. **L550–571: dump cuts a stream that never closes at the timeout, counts it as slow, writes nothing for it and keeps going**

   Assertions: `L563 ok(/ written=1 skipped=0 expired=0 live=0 slow=1$/.test(line))`; `L564 deepEqual(fs.readdirSync(dir).map((f) => f.split("_")[1]), ["bbbbbbbb.sse"])`; `L565 equal(calls.length, 2)`.

29. **L573–589: launch refuses a twin (same name, not archived) before any write, and --allow-twin or an archived twin passes**

   Assertions: `L578 rejects(launchAgent({ prompt: "list the mcps", name, agentId: ID }, { file }), (e) => e instanceof Refused && e.message.startsWith(ˋTWIN ${OTHER} IDLEˋ))`; `L579 deepEqual(calls.map((c) => c.method), ["GET"])`; `L580 deepEqual(readAllow(file), {})`; `L582 ok((await launchAgent({ prompt: "list the mcps", name, agentId: ID }, { file }))[0].startsWith(ˋLAUNCH ${ID} ˋ))`; `L585 deepEqual(c2.map((c) => c.method), ["POST"])`.

30. **L599–617: parseMcpServers accepts stdio and remote servers and fills allowlisted ${NAME} from the environment**

   Assertions: `L609 deepEqual(out[0], { name: "apex-tools", type: "stdio", command: "node", args: ["tools/mcp/apex-tools-mcp.mjs"], env: { FLEET_AS: ENVV.APEX_FLEET_AS } })`; `L610 deepEqual(out[1], { name: "hook", type: "http", url: "https://hooks.example.net/mcp", headers: { Authorization: ˋBearer ${SECRET}ˋ } })`; `L611 deepEqual(out[2].auth, { CLIENT_ID: "id", CLIENT_SECRET: SECRET, scopes: ["repo"] })`; `L613 deepEqual(out.envRefs, ["APEX_AGENT_WEBHOOK_AUTH", "APEX_FLEET_AS"])`; `L614 ok(!JSON.stringify(out).includes("envRefs"))`; `L615 equal(interpolate("no placeholders", {}), "no placeholders")`; `L616 equal(LAUNCH_ENV_ALLOW.join(","), "APEX_FLEET_AS,APEX_SESSION_ID,APEX_AGENT_WEBHOOK_URL,APEX_AGENT_WEBHOOK_AUTH,CURSOR_API_KEY")`.

31. **L619–633: security audit 4 X1: placeholders resolve only from the allowlist and MCP urls only to allowlisted hosts**

   Assertions: `L620 throws(() => parseMcpServers(list, env), (e) => re.test(e.message) && !leaks(e.message))`; `L630 ok(mcpHostAllowed(h, {}))`; `L631 ok(mcpHostAllowed("hooks.example.net", ENVV))`; `L632 ok(!mcpHostAllowed("hooks.example.net", { APEX_AGENT_WEBHOOK_URL: "not a url" }))`.

32. **L635–652: parseMcpServers rejects every shape the spec forbids, and no message carries a secret**

   Assertions: `L636 throws(() => parseMcpServers(list, ENVV), (e) => re.test(e.message) && !leaks(e.message))`.

33. **L654–668: parseSubagents enforces names, sizes and the built-in collision rule**

   Assertions: `L656 deepEqual(parseSubagents([ok, { ...ok, name: "other", model: { id: "composer-2.5" } }]).map((a) => a.name), ["prober", "other"])`; `L657 throws(() => parseSubagents(list), (e) => re.test(e.message))`.

34. **L670–688: buildEnvVars reads names from the environment and NAME=VALUE lines, and never echoes a value**

   Assertions: `L671 deepEqual(buildEnvVars({ names: ["APEX_AGENT_WEBHOOK_AUTH"] }, ENVV), { APEX_AGENT_WEBHOOK_AUTH: SECRET })`; `L673 deepEqual(buildEnvVars({ fileText: file }, {}), { APEX_FLEET_AS: "1", APEX_SESSION_ID: "two words", APEX_AGENT_WEBHOOK_URL: "x" })`; `L674 throws(() => buildEnvVars(a, env), (e) => re.test(e.message) && !leaks(e.message))`.

35. **L690–702: buildLaunchBody attaches the options, and envVars drops the client agentId (the spec forbids both)**

   Assertions: `L692 equal(plain.agentId, ID)`; `L693 ok(!("mcpServers" in plain) && !("customSubagents" in plain) && !("envVars" in plain))`; `L695 equal(body.agentId, ID)`; `L696 equal(body.mcpServers[0].name, "a")`; `L697 equal(body.customSubagents[0].name, "s")`; `L699 equal(withEnv.agentId, undefined)`; `L700 deepEqual(withEnv.envVars, { A: "1" })`; `L701 ok(!("envVars" in buildLaunchBody({ prompt: "p", envVars: {} })))`.

36. **L704–727: maskBody and the DRYRUN line carry names and counts, never a header, env, auth or variable value**

   Assertions: `L715 ok(!leaks(masked) && !masked.includes("private prompt"))`; `L716 deepEqual(maskBody(body).envVars, ["APEX_SESSION_ID"])`; `L717 deepEqual(maskBody(body).mcpEnvRefs, ["APEX_AGENT_WEBHOOK_AUTH", "APEX_FLEET_AS"])`; `L718 deepEqual(maskBody(body).mcpServers[1], { name: "r", type: "http", headerNames: ["Authorization"], auth: ["CLIENT_ID", "CLIENT_SECRET"] })`; `L722 equal(calls.length, 0)`; `L723 ok(lines[0].startsWith("DRYRUN (server-minted) promptChars=1 ") && !leaks(lines[0]))`.

37. **L729–744: launch with envVars: no client id, no 5xx retry, the id is recorded from the response, counts (not values) are printed**

   Assertions: `L735 deepEqual(calls.map((c) => c.method), ["GET", "POST"])`; `L736 equal(calls[1].body.agentId, undefined)`; `L737 deepEqual(calls[1].body.envVars, { STAGING: SECRET })`; `L739 ok(lines[0].endsWith(" mcp=1 subagents=0 env=1 envNames=STAGING mcpEnvRefs=APEX_FLEET_AS") && !leaks(lines[0]))`; `L740 ok(readAllow(file)[ID])`.

38. **L746–761: launch with envVars resolves an ambiguous 5xx by name instead of retrying, and does not record a launch it cannot find**

   Assertions: `L752 deepEqual(calls.map((c) => c.method), ["GET", "POST", "GET"])`; `L753 ok(lines[0].includes(ˋLAUNCH ${ID} run=run-4ˋ) && lines[0].includes("recovered after an ambiguous failure"))`; `L754 ok(readAllow(file)[ID])`; `L756 rejects(launchAgent({ prompt: "ambiguous", name, envVars: { A: "1" } }, { file: tmpAllow() }), /HTTP 503/)`; `L757 equal(calls.filter((c) => c.method === "POST").length, 1)`.

39. **L763–773: followUp can replace the inline MCP servers for one run**

   Assertions: `L769 deepEqual(calls[0].body, { prompt: { text: "go" }, mcpServers: [{ name: "a", type: "stdio", command: "x" }] })`.

40. **L775–803: launch with envVars resolves a dropped connection (a thrown fetch) by name too**

   Assertions: `L789 deepEqual(seq, ["GET", "POST", "GET"])`; `L790 ok(lines[0].includes(ˋLAUNCH ${ID} run=run-8ˋ) && lines[0].includes("recovered"))`; `L791 ok(readAllow(file)[ID])`; `L799 rejects(launchAgent({ prompt: "dropped", name, envVars: { A: "1" } }, { file: tmpAllow() }), /fetch failed/)`.

41. **L833–854: one call is several events: groupCalls folds them (latest name, richest args, last result) and digest counts calls**

   Assertions: `L835 equal(parseSse(FIX_TEXT).filter((e) => e.event === "tool_call").length, 9)`; `L836 equal(calls.length, 6)`; `L838 equal(t1.name, "task")`; `L839 equal(t1.args.environment, "SUBAGENT_EXECUTION_ENVIRONMENT_CLOUD")`; `L840 equal(calls.find((c) => c.callId === "t2-bbbb").result.error, undefined)`; `L841 deepEqual(foldCallEvent({ name: "a", args: null }, { name: "b", args: { x: 1 }, result: 7, status: "completed" }), { name: "b", args: { x: 1 }, result: 7, status: "completed" })`; `L845 deepEqual(rich.args, { path: "a.js", limit: 5 })`; `L847 deepEqual(rich.args, { path: "b.js", limit: 9 })`; `L850 equal(Object.values(m.calls).reduce((a, b) => a + b, 0), 6)`; `L851 equal(m.errCalls, 2)`; `L852 ok(!Object.keys(m.errHeads).some((h) => h.includes("Invalid arguments")))`; `L853 equal(m.mcpDiscovery, 1)`.

42. **L856–865: parseRun gives rows in stream order with merged chat, call stats and the final result**

   Assertions: `L858 deepEqual(p.rows.map((r) => r.kind), ["status", "chat", "thinking", "tool", "tool", "tool", "tool", "tool", "tool", "result"])`; `L859 equal(p.rows[1].text, "Looking at the files.")`; `L860 equal(p.status, "FINISHED")`; `L861 equal(p.durationMs, 12345)`; `L862 equal(p.run8, RUN1.slice(-8))`; `L863 deepEqual(p.stats, { calls: 6, errors: 2, elidedArgs: 1 })`; `L864 deepEqual(p.rows.filter((r) => r.kind === "tool").map((r) => r.name), ["task", "get_mcp_tools", "read_file", "run_terminal_cmd", "mcp", "run_terminal_cmd"])`.

43. **L867–886: renderLines: modes, tool filter, grep, results, width, and no secret ever printed**

   Assertions: `L870 ok(all[0].startsWith(ˋRUN ${RUN1.slice(-8)} FINISHEDˋ))`; `L871 equal(all.filter((l) => l.startsWith("TOOL ")).length, 6)`; `L872 ok(all.some((l) => l.startsWith('CHAT ') && l.includes("Looking at the files.")))`; `L873 ok(all.some((l) => l.startsWith("RESULT ") && l.includes("FINISHED")))`; `L875 equal(errs.length, 2)`; `L876 ok(errs.every((l) => l.includes(" ERR ") && l.includes(" !! ")))`; `L877 ok(errs.some((l) => l.includes("spawnError ENOENT <path>")))`; `L879 equal(task.length, 1)`; `L880 ok(task[0].includes("probe") && task[0].includes("-> child says hi"))`; `L881 equal(renderLines(p, { only: ["tools"], grep: "read_file" }).length, 1)`; `L882 equal(renderLines(p, { only: ["tools"] }).find((l) => l.includes("mcp ERR")).includes("(elided)"), true)`; `L883 ok(renderLines(p, { only: ["chat"] }).every((l) => /^(CHAT\|RESULT) /.test(l)))`; `L884 ok(renderLines(p, { only: ["tools"], results: true, width: 40 }).every((l) => l.length < 40 * 3 + 80))`; `L885 ok(noSecret(renderLines(p, { results: true }).join("\n")) && noSecret(renderLines(p, { only: ["tools"], results: true, width: 400 }).join("\n")))`.

44. **L888–895: redact and squash mask credentials, ids and workspace paths, and cut with an ellipsis**

   Assertions: `L891 ok(!out.includes(bad))`; `L892 equal(squash("a b\n/workspace/js/x.js run-3d266b1c-15ea-4cd7-a549-b64a34435823", 100), "a b <path> run-<uuid>")`; `L893 equal(squash("x".repeat(50), 10), ˋ${"x".repeat(9)}…ˋ)`; `L894 equal(squash(null), "")`.

45. **L897–909: argsSummary and resultBody read each tool by shape and fall back to the longest string**

   Assertions: `L898 equal(argsSummary("read_file", { toolCallId: "x" }), "(elided)")`; `L899 equal(argsSummary("read_file", null), "(elided)")`; `L900 equal(argsSummary("mcp", { serverIdentifier: "apex-tools", toolName: "apex_help", toolCallId: "x" }), "apex-tools/apex_help")`; `L901 equal(argsSummary("run_terminal_cmd", { command: "ls -la", timeout: 5 }), "ls -la")`; `L902 equal(argsSummary("zzz", { a: 1 }), '{"a":1}')`; `L903 equal(resultBody("edit_file", { success: { path: "a.js", linesAdded: 2, linesRemoved: 1, message: "ok", afterFullFileContent: "y".repeat(900) } }).text, "a.js +2 -1 ok")`; `L904 equal(resultBody("read_file", { success: { path: "a.js", totalLines: 9, readRange: { startLine: 3, endLine: 5 }, content: "z".repeat(900) } }).text, "a.js lines 3-5 of 9")`; `L905 equal(resultBody("run_terminal_cmd", { success: { stdout: "hello" } }).text, "hello")`; `L906 equal(resultBody("web_fetch", { success: { url: "https://x.io", markdown: "m".repeat(12) } }).text, "https://x.io 12 chars")`; `L907 equal(resultBody("whatever", { success: { a: "short", b: { c: "the longest string here" } } }).text, "the longest string here")`; `L908 deepEqual(resultBody("x", undefined), { size: 0, text: "" })`.

46. **L911–922: findCall finds one result by callId prefix or run#seq, masks it, and cuts at max**

   Assertions: `L914 equal(byId.name, "run_terminal_cmd")`; `L915 ok(noSecret(byId.text) && noSecret(byId.args))`; `L917 equal(bySeq.name, "read_file")`; `L918 equal(bySeq.truncated, true)`; `L919 equal(bySeq.text.length, 60)`; `L920 ok(bySeq.chars > 5000)`; `L921 equal(findCall(p, "nope"), null)`.

47. **L924–938: jsonRows are bounded and masked, never the raw result; errorStreak counts identical failures only**

   Assertions: `L927 equal(rows[0].kind, "run")`; `L928 deepEqual([rows[0].calls, rows[0].errors], [6, 2])`; `L930 equal(tools.length, 6)`; `L931 ok(tools.every((r) => !("result" in r) && r.resultHead.length <= 50))`; `L932 equal(tools.find((r) => r.name === "task").ok, true)`; `L933 ok(noSecret(JSON.stringify(rows)))`; `L934 equal(jsonRows(p, { only: ["errors"] }).filter((r) => r.kind === "tool").length, 2)`; `L936 equal(errorStreak([row("a"), row("a"), row("b"), row("a")]), 2)`; `L937 equal(errorStreak([row("a"), row(null), row("a")]), 1)`.

48. **L940–974: loadRuns reads the cache first, skips runs past retention without a request, counts a 410, and caches what it fetches**

   Assertions: `L949 deepEqual([first.parsed.length, first.expired, first.notCached], [1, 1, 0])`; `L950 equal(calls.filter((c) => c.url.includes("/stream")).length, 1)`; `L951 ok(calls[1].url.includes(RUN2))`; `L952 equal(fs.readdirSync(dir).length, 1)`; `L956 deepEqual([second.parsed.length, second.expired, second.notCached], [1, 0, 1])`; `L957 equal(calls.length, 1)`; `L960 equal((await loadRuns(ID, { dir, sel: "last", fetchMissing: false })).parsed[0].runId, RUN2)`; `L962 equal((await loadRuns(ID, { dir, sel: RUN2.slice(-8), fetchMissing: false })).parsed.length, 1)`; `L964 rejects(loadRuns(ID, { dir, sel: "zzzz" }), /no run matches zzzz/)`; `L969 deepEqual([gone.parsed.length, gone.expired], [0, 1])`.

49. **L976–1006: transcript and call: summary, json, validation, and one result in full with a | prefix**

   Assertions: `L984 equal(sum.length, 2)`; `L985 ok(sum[0].startsWith("RUN ") && sum[0].includes("calls=6 err=2"))`; `L986 equal(sum[1], ˋTRANSCRIPT ${ID} runs=1 expired=0 notCached=0ˋ)`; `L989 equal(js.agent, ID)`; `L990 equal(js.rows.filter((r) => r.kind === "tool").length, 2)`; `L991 ok(noSecret(JSON.stringify(js)))`; `L993 rejects(transcript(ID, { only: ["nope"], dir }), /--only takes tools, errors, chat, turns/)`; `L994 rejects(transcript(ID, { grep: "(", dir }), /not a valid regular expression/)`; `L997 ok(call[0].startsWith("CALL ") && call[0].includes("run_terminal_cmd ok"))`; `L998 ok(call.slice(1).every((l) => l.startsWith("\| ")))`; `L999 ok(noSecret(call.join("\n")))`; `L1001 rejects(transcriptCall(ID, "missing", { dir }), /not found in 1 run/)`.

50. **L1008–1023: parseRun merges assistant chunks across streaming updates and starts a new message only at a boundary**

   Assertions: `L1022 deepEqual(rows.filter((r) => r.kind === "chat").map((r) => r.text), ["pong", "after the tool", "after thinking"])`.

51. **L1025–1051: handback waits, caches every retrievable run, and returns a bounded digest with failures and the artifact count**

   Assertions: `L1041 equal(r.code, 0)`; `L1042 equal(r.lines[0], ˋWAIT ${ID} IDLE run=${RUN2} last=FINISHED HANDBACK runs=1 expired=1 notCached=0 calls=1 err=1ˋ)`; `L1043 equal(r.lines.filter((l) => l.startsWith("RUN ")).length, 1)`; `L1044 ok(r.lines.some((l) => l.startsWith("TOOL ") && l.includes("get_mcp_tools ERR") && l.includes('namespace "Github" not found')))`; `L1045 equal(r.lines.at(-1), ˋARTIFACTS 2 (artifacts ${ID})ˋ)`; `L1046 equal(fs.readdirSync(dir).length, 1)`.

52. **L1053–1076: handback: a timeout returns 124 and reads no transcript; failures beyond the cap are counted; artifacts may be unreadable**

   Assertions: `L1060 equal(r.code, 124)`; `L1061 equal(r.lines.length, 1)`; `L1062 ok(r.lines[0].startsWith(ˋWAIT ${ID} TIMEOUTˋ))`; `L1063 ok(!calls.some((c) => c.url.includes("/stream")))`; `L1069 equal(r2.lines.filter((l) => l.startsWith("TOOL ")).length, 5)`; `L1070 ok(r2.lines.includes(ˋ… 2 more failures (transcript ${ID} --only errors)ˋ))`; `L1071 equal(r2.lines.at(-1), "ARTIFACTS unreadable")`.

53. **L1078–1093: handback keeps wait's exit code: a cancelled last run is 1, and the digest still prints**

   Assertions: `L1086 equal(r.code, 1)`; `L1087 ok(r.lines[0].includes("last=CANCELLED HANDBACK runs=1"))`; `L1088 equal(r.lines.at(-1), "ARTIFACTS 0")`.


### tests/unit/curvature-channels.test.mjs

Fixture: recursive real js source scan, local readsCurvature/codeOnly/callSites regexes (30–76), SITES exact count map (52–61), docs table row extraction (77–86).

Targets: docs/PHYSICS.md:1158–1197 channel table; production curvature consumers listed by SITES. Tracks.curvature is a navigation symbol, not a permission/force proof.

Limit: checks file classification membership, exact detected call counts and absence of ghost rows. It does not validate a row’s channel claim or trace dataflow to steering. Bracket/renaming forms are detected as consumers but callSites counts dot calls/bare aliases only; string/comment regex handling is deliberately incomplete.

1. **L88–100: every curvature consumer file appears as a row of the PHYSICS.md channel table**

   Assertions: `L93 ok(consumers.length >= 8)`; `L96 deepEqual(missing, [])`.

2. **L102–111: every curvature call site is on the ledger: a new read in a classified file is a red test**

   Assertions: `L108 deepEqual(found, SITES)`; `L110 equal(found["js/game.js"], 10)`.

3. **L113–122: no table row names a file that no longer reads curvature (no ghosts)**

   Assertions: `L115 ok(rows.length >= 8)`; `L118 ok(fs.existsSync(p))`; `L119 ok(readsCurvature(fs.readFileSync(p, "utf8")))`.


### tests/unit/custom-tracks.test.mjs

Fixture: real verify-track.cjs buildContext TRACK_VM plus hash32/themes/custom-tracks; JSON-copying GameStore with write count/durability flags; quarter-metre ellipse and uneven rectangle designs (28–53). Later cases inject lazy loader/script events, deferred decodes, navigation ownership and ghost stores.

Targets: js/editor/custom-tracks.js:153–274 canonical/sanitize/load/write; :278–321 arc/toRaw; :327–408 registry/select/dropRuns; :409–498 collection import/preflight; :519–632 lazy editor/share/navigation; js/editor/track-themes.js:374–439 look/theme fields; Tracks/TrackDef via real TRACK_VM; js/core/script-loader.js for retry.

Limit: executes the real geometry engine for selected build cases, not WebGL scenery or editor UI. Store/DOM/network are mocked. The <500ms giant-loop assertion is elapsed-time evidence for selected input only. Source-only integration pins for picker/season/network/scenery remain regex checks. 52 shipped/24 season entries and content-id golden are intentionally exact snapshot contracts.

1. **L55–63: an empty store leaves the shipped roster exactly as it was**

   Assertions: `L57 equal(Tracks.LIST.length, 52)`; `L58 equal(Tracks.LIST.filter((t) => t.custom).length, 0)`; `L59 equal(Tracks.SEASON.length, 24)`; `L60 equal(C.list().length, 0)`; `L61 equal(C.sync(), 0)`; `L62 equal(Tracks.LIST.length, 52)`.

2. **L65–86: stored designs are appended after the 52 as ordinary, buildable circuits**

   Assertions: `L67 equal(Tracks.LIST.length, 54)`; `L68 equal(Tracks.LIST.filter((t) => !t.custom).length, 52)`; `L69 equal(Tracks.SEASON.length, 24)`; `L71 ok(a.custom && b.custom)`; `L72 match(a.id, /^custom-[0-9a-f]{8}$/)`; `L73 equal(a.name, "TEST LOOP")`; `L74 equal(a.theme, "green")`; `L74 equal(b.theme, "desert")`; `L75 equal(b.flatTerrain, true)`; `L76 equal(typeof a.scenery, "function")`; `L77 equal(a.startFrac, 0)`; `L77 equal(a.sceneryStartFrac, null)`; `L77 equal(a.sceneryCoordinates, "racing")`; `L80 ok(tr.total > 3500 && tr.total < 4500)`; `L81 ok(tr.line && tr.curv.length === tr.n)`; `L84 equal(C.sync(), 2)`; `L85 equal(Tracks.LIST.length, 54)`.

3. **L88–120: upsert / remove / select round-trip through the store and the roster**

   Assertions: `L91 equal(r.ok, true)`; `L92 match(r.id, /^custom-/)`; `L93 equal(writes.length, 1)`; `L94 equal(data.customTracks.items.length, 1)`; `L95 equal(Tracks.LIST.length, 53)`; `L96 equal(Tracks.LIST[52].id, r.id)`; `L99 equal(r2.id, r.id)`; `L100 equal(data.customTracks.items.length, 1)`; `L101 equal(Tracks.LIST[52].name, "RENAMED")`; `L104 notEqual(r3.id, r.id)`; `L105 equal(Tracks.LIST.length, 54)`; `L107 equal(C.select(r3.id), 53)`; `L108 equal(data.trackId, r3.id)`; `L108 equal(data.track, 53)`; `L109 equal(C.select("custom-nope"), -1)`; `L113 equal(Tracks.LIST.length, 53)`; `L114 equal(Tracks.LIST[52].id, r3.id)`; `L115 equal(data["ttlb." + r.id], undefined)`; `L118 equal(data.customTracks.items.length, C.LIMITS.items)`; `L119 equal(C.upsert(design({ pts: ellipse(36, 999, 450) })).reason, "full")`.

4. **L122–153: stored input is player input: hostile shapes are dropped or repaired, never thrown**

   Assertions: `L135 equal(Tracks.LIST.length, 53)`; `L137 equal(d.theme, "green")`; `L138 equal(d.name, "<IMG SRC=X ONERROR=1>")`; `L140 equal(it.baseHW, 8)`; `L141 equal(it.seed, (-4) >>> 0)`; `L143 deepEqual(plain(it.hwZones), [{ s0: g(0.5), s1: g(0.9), hw: 5, ease: 0.025 }, { s0: g(0.1), s1: g(0.2), hw: 6, ease: 0.2 }])`; `L145 deepEqual(plain(it.bankZones), [{ frac: g(0.3), angleDeg: 30, widthM: 20 }])`; `L146 deepEqual(plain(it.elevations), [{ s: g(0.5), halfM: 20, rise: 1 }])`; `L147 equal(it.bridges, null)`; `L148 deepEqual(plain(it.turns), [g(0.1), g(0.25)])`; `L149 ok(it.lengthM > 3000)`; `L150 equal(C.sanitize(null), null)`; `L151 equal(C.sanitize({ pts: [[0, 0]] }), null)`.

5. **L155–173: fractional hill lengths keep the saved id through registration and reload**

   Assertions: `L160 equal(once.elevations[0].halfM, 22)`; `L161 equal(once.elevations[0].rise, 1)`; `L162 equal(once.bridges[0].rise, -1)`; `L163 deepEqual(plain(C.sanitize(once)), plain(once))`; `L165 equal(saved.ok, true)`; `L166 equal(saved.id, once.id)`; `L167 equal(C.get(saved.id).id, saved.id)`; `L168 equal(Tracks.LIST[C.select(saved.id)].id, saved.id)`; `L170 equal(reloaded.C.get(saved.id).id, saved.id)`; `L171 equal(reloaded.C.upsert(raw).id, saved.id)`; `L172 equal(reloaded.C.list().length, 1)`.

6. **L175–194: hill canonicalization preserves stable legacy geometry and sampled identities**

   Assertions: `L180 equal(stable.id, "custom-d20a0e5d")`; `L181 equal(stable.elevations[0].rise, 1.25)`; `L182 equal(stable.bridges[0].rise, -1.25)`; `L183 equal(C.sanitize(stable).id, stable.id)`; `L191 ok(Number.isInteger(bump.rise * 4))`; `L192 equal(C.sanitize(once).id, once.id)`.

7. **L196–209: the id is the content: lattice, theme, width, seed and zones — not the name**

   Assertions: `L199 equal(a.id, b.id)`; `L200 notEqual(C.sanitize(design({ baseHW: 6 })).id, a.id)`; `L201 notEqual(C.sanitize(design({ seed: 8 })).id, a.id)`; `L202 notEqual(C.sanitize(design({ elevations: [{ s: 0.5, halfM: 100, rise: 3 }] })).id, a.id)`; `L206 equal(C.sanitize(nudged).id, a.id)`; `L207 notEqual(C.sanitize(moved).id, a.id)`; `L208 ok(a.pts.every(([x, z]) => Number.isInteger(x * 4) && Number.isInteger(z * 4)))`.

8. **L211–236: toRaw hands the factory what a circuit file would author**

   Assertions: `L215 equal(raw.id, it.id)`; `L215 equal(raw.custom, true)`; `L216 equal(raw.street, true)`; `L217 deepEqual(plain(raw.pit), { mode: "street" })`; `L218 ok(raw.cityStyle && raw.cityStyle.neon.includes("gold"))`; `L219 equal(raw.path.pts.length, 36)`; `L220 ok(raw.path.len > 3000)`; `L224 equal(raw.hwZones.length, 1)`; `L225 ok(Math.abs(raw.hwZones[0].s0 - 18 / 36) < 1e-4)`; `L226 ok(Math.abs(raw.hwZones[0].s1 - C.arcToIndexFrac(it.pts, it.hwZones[0].s1)) < 1e-12)`; `L227 equal(raw.hwZones[0].hw, 5)`; `L227 equal(raw.hwZones[0].ease, 0.025)`; `L228 equal(raw.turns, null)`; `L229 equal(typeof raw.scenery, "function")`; `L232 ok(["green", "desert", "street_day", "street_night", "modern"].includes(f.theme))`; `L233 ok(f.furniture && f.furniture.tree && Array.isArray(f.standSet) && f.standSet.length === 3)`; `L235 equal(T.get("nope"), T.PRESETS.parkland)`.

9. **L238–248: the picker knows the custom tail (source contract)**

   Assertions: `L240 match(src, /\["custom", "MY CIRCUITS"\]/)`; `L241 match(src, /filter === "season"\) return !\(t\.classic \\|\\| t\.custom\)/)`; `L242 match(src, /filter === "custom"\) return !!t\.custom/)`; `L243 match(src, /trb trb-custom/)`; `L244 match(read("css/race-setup.css"), /\.trb-custom \{/)`; `L245 match(read("js/career/season-ui.js"), /!t\.custom && !used\.has/)`; `L246 match(read("js/net/lobby-settings.js"), /Tracks\.LIST\[d\.track\]\.custom\) return null/)`; `L247 match(read("js/core/lazy-bundles.js"), /!def\.scenery && !sceneryResident/)`.

10. **L250–260: sanitize: bank angle in [1, 30], hwZone width ≥ the 5 m floor, ease always stored and > 0**

   Assertions: `L254 deepEqual(plain(banks.map((z) => z.angleDeg)), [1, 1, 30, 12.25])`; `L256 deepEqual(plain(hz.map((z) => [z.hw, z.ease])), [[5, 0.025], [6, 0.005], [6.5, 0.04]])`; `L259 equal(C.sanitize(design({ hwZones: [{ s0: 0.2, s1: 0.3, hw: 6 }] })).id, C.sanitize(design({ hwZones: [{ s0: 0.2, s1: 0.3, hw: 6, ease: 0.025 }] })).id)`.

11. **L262–276: sanitize keeps a full-lap hw zone as 0→1 (frac must not collapse it to a zero-width notch)**

   Assertions: `L265 ok(full && full.hwZones && full.hwZones.length === 1)`; `L266 deepEqual(plain(full.hwZones[0]), { s0: 0, s1: 1, hw: 5, ease: 0.01 })`; `L268 equal(C.sanitize(design({ hwZones: [{ s0: 0.4, s1: 0.4, hw: 5 }] })).hwZones, null)`; `L272 ok(def)`; `L275 ok(mid < 6 && nearStart < 6)`.

12. **L278–289: sanitize refuses a loop the engine cannot build: coincident / sub-8 m points, a polygon under 1 km**

   Assertions: `L280 equal(Tracks.LIST.length, 53)`; `L281 equal(C.sanitize({ pts: Array.from({ length: 8 }, () => [5, 5]) }), null)`; `L283 equal(C.sanitize(design({ pts: close })), null)`; `L284 equal(C.sanitize(design({ pts: ellipse(36, 120, 80) })), null)`; `L285 ok(C.sanitize(design({ pts: ellipse(36, 200, 120) })))`; `L287 ok(C.sanitize(design({ pts: close }), { loose: true }))`; `L288 ok(C.sanitize(design({ pts: ellipse(36, 120, 80) }), { loose: true }))`.

13. **L291–330: remove() / a replacing upsert re-resolve the selection by id and rewrite both stored keys**

   Assertions: `L299 equal(G.trackIdx, 53)`; `L301 equal(G.trackIdx, 0)`; `L302 equal(data.trackId, Tracks.LIST[0].id)`; `L302 equal(data.track, 0)`; `L304 equal(G.trackIdx, 53)`; `L306 equal(Tracks.LIST[G.trackIdx].id, c)`; `L307 equal(G.trackIdx, 52)`; `L307 equal(data.trackId, c)`; `L307 equal(data.track, 52)`; `L313 equal(s2.data.trackId, y)`; `L313 equal(s2.data.track, 52)`; `L318 equal(r.ok, true)`; `L318 equal(r.replaced, c)`; `L318 notEqual(r.id, c)`; `L319 equal(C.list().length, before)`; `L320 equal(C.get(c), null)`; `L321 equal(data["ttlb." + c], undefined)`; `L322 equal(Tracks.LIST[G.trackIdx].id, r.id)`; `L323 equal(data.trackId, r.id)`; `L326 equal(C.upsert(design({ pts: ellipse(36, 999, 450) })).reason, "full")`; `L328 equal(r2.ok, true)`; `L329 equal(C.list().length, C.LIMITS.items)`.

14. **L332–347: toRaw maps hwZone ARC fractions to INDEX fractions exactly on unequal spacing**

   Assertions: `L338 equal(f(0), 0)`; `L339 ok(Math.abs(f(1000 / 3000) - 3 / 8) < 1e-12)`; `L340 ok(Math.abs(f(0.5) - 5 / 8) < 1e-12)`; `L341 ok(Math.abs(f(550 / 3000) - 2.5 / 8) < 1e-12)`; `L342 ok(Math.abs(f(2750 / 3000) - 7.5 / 8) < 1e-12)`; `L344 ok(it)`; `L346 ok(Math.abs(z.s0 - 3 / 8) < 1e-4 && Math.abs(z.s1 - 5 / 8) < 1e-4)`.

15. **L349–381: TIME OF DAY: AUTO keeps the preset; NIGHT lights a day preset; DAY / DUSK un-light a night one (street presets swap city); TREES FEW thins the roadside**

   Assertions: `L352 deepEqual(plain(withLook(id, undefined)), plain(T.defFields(id, { theme: id, lengthM: 3400 })))`; `L355 equal(pn.night, true)`; `L356 notEqual(pn.furniture.lamp, "none")`; `L357 ok(pn.pal.zenith[2] < 0.2)`; `L358 equal(withLook("savanna", { time: "night" }).pal.zenith[0], T.defFields("desertnight").pal.zenith[0])`; `L361 equal(md.night, false)`; `L361 equal(md.theme, "street_day")`; `L362 ok(md.dressingExclusions === undefined)`; `L363 ok(T.defFields("marina", { theme: "marina", look: { time: "day" }, lengthM: 7000 }).dressingExclusions)`; `L364 equal(withLook("harbour", { time: "night" }).theme, "street_night")`; `L366 equal(dusk.night, false)`; `L367 ok(dusk.pal.sunDir[1] < 0.3)`; `L368 equal(withLook("parkland", { time: "day" }).night, false)`; `L369 deepEqual(plain(withLook("parkland", { time: "day" })), plain(withLook("parkland", undefined)))`; `L371 equal(withLook("parkland", { trees: "few" }).furniture.sparse, true)`; `L375 ok(["green", "desert", "street_day", "street_night", "modern"].includes(f.theme))`; `L376 ok(f.pal && Array.isArray(f.pal.grass) && f.pal.grass.every(Number.isFinite))`; `L379 equal(C.sanitize(design({ look: { time: "auto", trees: "normal", crowd: "normal" } })).look, undefined)`; `L380 notEqual(C.sanitize(design({ look: { crowd: "packed" } })).id, C.sanitize(design()).id)`.

16. **L383–403: remove() and a replacing upsert clear the circuit's pose ghost and input ghost with its board**

   Assertions: `L390 deepEqual(cleared, [])`; `L392 deepEqual(cleared, ["pose:" + a, "input:" + a])`; `L395 equal(r.replaced, b)`; `L396 deepEqual(cleared, ["pose:" + b, "input:" + b])`; `L399 equal(C.remove(r.id).ok, true)`; `L402 equal(C.remove(c).ok, true)`.

17. **L405–420: sanitize refuses a loop thousands of km long before anything walks it (6.2)**

   Assertions: `L411 equal(C.sanitize(design({ pts: star })), null)`; `L412 equal(C.sanitize(design({ pts: star }), { loose: true }), null)`; `L413 ok(performance.now() - t0 < 500)`; `L415 ok(C.sanitize(design({ pts: ellipse(36, 2000, 1400) })))`; `L416 equal(C.sanitize(design({ pts: ellipse(36, 3000, 2000) })), null)`; `L417 ok(C.sanitize(design({ pts: ellipse(36, 3000, 2000) }), { loose: true }))`; `L419 equal(stored.Tracks.LIST.filter((t) => t.custom).length, 1)`.

18. **L422–438: a record's lengthM is kept only when it is near the polygon's; otherwise derived (6.5)**

   Assertions: `L426 ok(poly > 3500 && poly < 4500)`; `L429 equal(C.sanitize(design({ lengthM: built })).lengthM, built)`; `L430 equal(C.sanitize(design({ lengthM: Math.round(poly * 0.75) })).lengthM, Math.round(poly * 0.75))`; `L431 equal(C.sanitize(design({ lengthM: Math.round(poly * 1.24) })).lengthM, Math.round(poly * 1.24))`; `L434 equal(it.lengthM, poly)`; `L435 equal(C.toRaw(it).lengthKm, Math.round(poly / 100) / 10)`; `L437 equal(C.sanitize(design({ lengthM: 1 })).id, honest.id)`.

19. **L440–458: one throwing stored record is skipped, not fatal, at eval and on sync (6.6a)**

   Assertions: `L445 deepEqual(plain(Tracks.LIST.filter((t) => t.custom).map((t) => t.name)), ["FIRST", "THIRD"])`; `L448 equal(T2.LIST.filter((t) => t.custom).length, 2)`; `L453 equal(C2.sync(), 1)`; `L454 deepEqual(plain(T2.LIST.filter((t) => t.custom).map((t) => t.name)), ["TWO"])`; `L456 equal(C2.sync(), 2)`; `L457 equal(data.customTracks.items.length, 2)`.

20. **L460–479: collection backup merges once, keeps local duplicate labels, and preserves selection**

   Assertions: `L465 equal(envelope.format, "apex26.tracks")`; `L465 equal(envelope.v, 1)`; `L469 deepEqual(plain(result), { ok: true, added: 1, skipped: 2, durable: true })`; `L470 equal(writes.length, before + 1)`; `L471 equal(C.get(saved.id).name, "LOCAL")`; `L472 equal(Tracks.LIST[G.trackIdx].id, saved.id)`; `L473 equal(C.list().length, 2)`; `L475 equal(second.added, 0)`; `L475 equal(second.skipped, 2)`; `L476 equal(writes.length, before + 1)`; `L478 equal(C.importCollection({ format: C.COLLECTION_FORMAT, v: 1, items: [design({ seed: 9 })] }).durable, false)`.

21. **L481–495: collection import preflights invalid entries, validator failures and capacity without partial writes**

   Assertions: `L484 equal(C.importCollection({ ...envelope([]), v: 2 }).reason, "format")`; `L485 equal(C.importCollection(envelope([design(), { pts: [] }])).index, 1)`; `L486 equal(C.importCollection(envelope([design()]), () => ({ ok: false })).reason, "invalid")`; `L487 equal(C.importCollection(envelope([design({ pts: ellipse(36, 9000, 9000) })])).reason, "invalid")`; `L488 equal(writes.length, 0)`; `L488 equal(C.list().length, 0)`; `L490 equal(C.importCollection(envelope(full)).added, C.LIMITS.items)`; `L492 equal(C.importCollection(envelope([design({ seed: 90 }), design({ seed: 91 })])).reason, "full")`; `L493 equal(C.importCollection(envelope(full.concat(design({ seed: 99 })))).reason, "full")`; `L494 equal(writes.length, before)`; `L494 equal(C.list().length, C.LIMITS.items)`.

22. **L497–503: collection import refuses distinct geometry with a colliding content hash**

   Assertions: `L501 equal(result.reason, "collision")`; `L501 equal(result.index, 1)`; `L502 equal(writes.length, 0)`; `L502 equal(C.list().length, 0)`.

23. **L505–523: sanitize refuses a loop thousands of km long (13-F1): strict above loopMax, loose above loopMaxLoose**

   Assertions: `L512 ok(C.LIMITS.loopMax > 7000 && C.LIMITS.loopMaxLoose >= C.LIMITS.loopMax)`; `L513 equal(C.sanitize(design({ pts: star(9000) })), null)`; `L514 equal(C.sanitize(design({ pts: star(9000) }), { loose: true }), null)`; `L515 ok(C.sanitize(design()))`; `L520 ok(per(e(k)) > C.LIMITS.loopMax && per(e(k)) < C.LIMITS.loopMaxLoose)`; `L521 equal(C.sanitize(design({ pts: e(k) })), null)`; `L522 ok(C.sanitize(design({ pts: e(k) }), { loose: true }))`.

24. **L529–563: a TRACK DESIGNER retry after a partial load failure injects only the files that failed (3-F1)**

   Assertions: `L555 equal(await api.ensureEditor(), false)`; `L556 ok(attempts[1].includes("js/editor/shape.js") && evaluated.has("js/editor/shape.js"))`; `L558 equal(await api.ensureEditor(), true)`; `L559 ok(attempts[2].includes(FAIL))`; `L560 ok(!attempts[2].includes("js/editor/shape.js"))`; `L561 deepEqual(redeclared, [])`; `L562 equal(evaluated.size, LAZY_EDITOR.length)`.

25. **L565–578: overlapping share-link decodes only open and strip the latest fragment**

   Assertions: `L575 equal(await second, true)`; `L576 equal(await first, false)`; `L577 deepEqual(opened, ["B"])`; `L577 equal(stripped.length, 1)`.

26. **L580–608: share-link decode that finishes mid-race keeps the fragment for a later title return**

   Assertions: `L598 equal(await hold, null)`; `L599 deepEqual(opened, [])`; `L600 equal(stripped.length, 0)`; `L601 equal(b.ctx.location.hash, "#track=SAME")`; `L606 equal(await again, true)`; `L607 deepEqual(opened, ["SAME"])`.

27. **L611–622: yielded collection review cancels with zero writes and records named add/duplicate/errors**

   Assertions: `L616 equal(review.ok, false)`; `L616 equal(review.reason, "invalid")`; `L617 deepEqual(plain(review.records).map((r) => [r.name, r.status]), [["TEST LOOP", "duplicate"], ["NEW", "add"], ["BROKEN", "error"]])`; `L618 equal(progress.length, 3)`; `L618 equal(writes.length, before)`; `L621 equal(canceled.reason, "canceled")`; `L621 equal(writes.length, before)`.

28. **L624–638: collection review owns immutable prepared input and refuses stale or canceled approval**

   Assertions: `L627 equal(plan.ok, true)`; `L627 equal(writes.length, 0)`; `L630 equal(result.ok, true)`; `L630 equal(result.added, 1)`; `L630 equal(C.list()[0].name, "APPROVED")`; `L631 equal(writes.length, 1)`; `L631 equal(C.commitCollectionPreflight(plan).ok, false)`; `L634 equal(C.commitCollectionPreflight(next).reason, "changed")`; `L634 equal(writes.length, before)`; `L637 equal(C.commitCollectionPreflight(canceled).ok, false)`; `L637 equal(writes.length, before)`.

29. **L643–669: an edit under a full quota keeps the old circuit's board and ghosts until a durable write (#2192)**

   Assertions: `L655 equal(r.ok, true)`; `L655 equal(r.durable, false)`; `L656 deepEqual(data["ttlb." + old], [{ t: 80 }])`; `L657 deepEqual(cleared, [])`; `L662 deepEqual(data["ttlb." + other], [{ t: 81 }])`; `L666 equal(data["ttlb." + old], undefined)`; `L667 equal(data["ttlb." + other], undefined)`; `L668 deepEqual(cleared.sort(), ["ghost:" + old, "ghost:" + other, "input:" + old, "input:" + other].sort())`.

30. **L672–698: delayed title designer respects newer navigation, race ownership and repeated taps**

   Assertions: `L695 equal(opened.length, ["none", "repeat"].includes(action) ? 1 : 0)`; `L696 ok([...listeners.values()].every((set) => set.size === 0))`.


### tests/unit/cvd-palette.test.mjs

Fixture: real CvdPalette VM with captured style map, 15 golden off colors, 34 Sharma reference vectors, COVISIBLE pairs; separate AppearanceOpts+palette fake DOM/store VM.

Targets: js/ui/cvd-palette.js:14–47 matrices/tables, :59–97 access/paint/set, :104–175 simulation/Lab/dE; js/ui/appearance-opts.js setCvdMode; css/tokens.css:1076–1095 CVD variables; css/hud.css cue-shape rules.

Limit: color arithmetic covers chosen matrix severity and a specified composite HUD plate, not human perception, every background or screen rendering. simulateLinear actually decodes input sRGB before matrix multiplication (source :104–111); pure-red fixture alone cannot distinguish encoded vs already-linear nonprimary inputs. Shape/read-isolation tests are textual.

1. **L87–97: off palette equals today's token and canvas values**

   Assertions: `L89 equal(P.mode(), "off")`; `L91 equal(P.hex(key), hex)`; `L92 equal(P.css(key), hex)`; `L95 ok(Math.abs(r - 0xae / 255) < 1e-9 && Math.abs(g - 0xea / 255) < 1e-9 && b === 0)`; `L96 equal(style.size, 0)`.

2. **L99–106: CIEDE2000 matches Sharma's published vectors**

   Assertions: `L101 equal(SHARMA.length, 34)`; `L104 ok(Math.abs(got - exp) < 0.0002)`.

3. **L108–119: Machado simulation is the severity-1 matrix on linear RGB**

   Assertions: `L112 ok(Math.abs(lin[0] - 0.367322) < 1e-6)`; `L113 ok(Math.abs(lin[1] - 0.280085) < 1e-6)`; `L114 ok(Math.abs(lin[2] - -0.011820) < 1e-6 \|\| lin[2] === 0)`; `L116 ok(shown[0] > 0 && shown[0] <= 1)`; `L117 equal(P.MACHADO.protan[0][0], 0.152286)`; `L118 equal(P.MACHADO.tritan[2][1], 0.691367)`.

4. **L121–152: co-visible states stay apart under every CVD simulation**

   Assertions: `L134 ok(d >= 10)`; `L146 ok(d >= 6)`.

5. **L154–180: CVD inks clear 4.5:1 on the HUD plate and match tokens.css**

   Assertions: `L165 ok(m)`; `L175 equal(css[name], h)`; `L177 ok(r >= 4.5)`.

6. **L182–227: set persists through AppearanceOpts and paints the tokens**

   Assertions: `L184 match(app, /function setCvdMode\(v\) \{[\s\S]*?store\.set\(K_CVD, cvdMode\);[\s\S]*?CvdPalette\.set\(cvdMode\)/)`; `L216 equal(A.setCvdMode("tritan"), "tritan")`; `L217 equal(stored.cvdMode, "tritan")`; `L218 equal(dataset.cvd, "tritan")`; `L219 equal(P.mode(), "tritan")`; `L220 equal(style.get("--you"), "#ff5c96")`; `L221 equal(style.get("--zone"), "#00e0c0")`; `L223 equal(stored.cvdMode, "off")`; `L224 equal(dataset.cvd, undefined)`; `L225 equal(style.has("--you"), false)`; `L226 equal(rows.size, 0)`.

7. **L229–236: minimap, DRS and ghost cues are shapes and read the palette**

   Assertions: `L231 match(hud, /#minimap\s*\{[^}]*inset 0 0 0 2px var\(--you/)`; `L232 match(hud, /#hud-aero\s*\{[^}]*--aero-hue:\s*var\(--zone\)/)`; `L233 match(hud, /#hud-aero\.ax-armed\s*\{[^}]*repeating-linear-gradient/)`; `L234 match(hud, /#hud-delta\[data-ref="ghost"\] \.hud-label::after\s*\{[^}]*content:\s*"\\25CB"/)`; `L235 match(hud, /#hud-delta\[data-ref="ghost"\] \.hud-label::after\s*\{[^}]*var\(--ghost\)/)`.

8. **L238–241: the palette module does not read the track, physics or the player**

   Assertions: `L240 doesNotMatch(src, /\bTracks\b\|\bcurvature\b\|\bphysics\b\|\bplayer\./)`.


## Coverage boundary and comment audit

Inventory: 181 registration sites, including the CSS per-file template; 940 direct assertion call sites inside callbacks (loop expansion and helper-mediated checks are not multiplied). No skip/only results or execution counts are inferred.

- cross-tool-guards header speaks about cross-host enforcement. Its adapter-file/config and subprocess evidence establishes those local surfaces; actual host hook trust/installation remains outside coverage. The worktree fixture substitutes tiny generated-target/ratchet/npm scripts, so a successful fixture commit is not execution of the real complete guard suite.
- crowd-audio calls the bed “audible”; assertions inspect target gain values on mock params. The event case asserts a swell flag after the P3 pass and a current bed ceiling; update computes its bed target before checkEvents, so that call does not measure the subsequent audible envelope. The cancel-and-hold case does assert ordering on the same fake cheer gain after a previous silence.
- CSS incident dates, old prelude maxima, historical lost faces and reported millisecond wins are explanatory comments. This map verifies the checker logic and present inputs, not those historical/performance claims. MAX_PRELUDE is presently 230, not the older 173/218 maxima in prose.
- css-faces’ negative fixture proves that the reduced runaway-comment shape erases font references despite a later terminator; brace equality by itself does not establish live faces. css-layers checks stronger wrapper membership but still approximates CSS syntax and the cascade.
- css-prefers-cascade explicitly leaves one known dead animation with a documented backstop. This file checks that the exemption is still dead; it does not independently execute or prove that backstop. The constant four-count policy in css-token-adoption deliberately moved numerical enforcement to ratchets.test; this file preserves existence and zero slack.
- css-tokens’ header count of 54 properties/ten other sheets is explanatory historical prose; the actual assertion is >30 defined properties and no textual orphan. Consumers are not comment-stripped, so a source comment can satisfy that half of the scan.
- ctx-loss titles describe menu/reload outcomes, but only TitleMenu repair and extracted helpers/callbacks execute here. Native top-layer layout, graphics recovery, notice announcement and actual Retry navigation require live coverage elsewhere.
- cursor-agents comments distinguish stored result characters from actual token usage and absent cost from zero. Assertions retain those distinctions. No fake credential, SSE a.js pathname, example presigned URL or synthesized run ID is a production integration destination. The request-body builder intentionally trusts separately parsed launch options; parser tests establish the CLI validation surface, not validation of every direct caller’s prebuilt body.
- curvature-channels’ safety intention is broader than the detector: row membership/counts cannot prove semantic force isolation. SITES pins additions in already-classified files; exotic syntax can still escape the count grammar.
- custom-tracks uses the real TRACK_VM geometry implementation. In contrast, picker, season eligibility, lobby refusal, inline-scenery lazy loading and badge styling are source contracts. The quota regression keeps old board/ghost records until a later durable write; a transient in-memory update with durable:false is expressly permitted by its assertions.
- CVD thresholds are numerical: own-type pair dE00 >=10, other types >=6, selected semantic inks contrast >=4.5 on the explicit mixed plate; Sharma tolerance <0.0002 for 34 pairs. They establish those arithmetic constraints rather than all-user accessibility.

## Navigation evidence

Read AGENTS.md and .claude/skills/code-nav/SKILL.md; used the documented shell fallback bash tools/mcp/lsp-mcp.sh outline <symbol> --limit=40. Successful LSP results resolved CrowdAudio → js/audio/crowd.js:16, GameAudioSignal → js/audio/signal.js:4, CustomTracks → js/editor/custom-tracks.js:14, TrackThemes → js/editor/track-themes.js:9, CvdPalette → js/ui/cvd-palette.js:8, TitleMenu → js/ui/title-menu.js:2 and Menus → js/ui/select-screen.js:12. Bounded source reads then established the implementation ranges quoted above. CLI exports and CSS/shell text used direct reads/text search, not fabricated LSP results.

No whole-source read is claimed for every CSS file, every manifest/curvature consumer, the full game.js union or every transitively loaded TRACK_VM module: the tests’ scans/loaders are mapped and their production scope named; targeted source bodies were inspected for the contracts above.

## Targeted source-read hash ledger

These hashes identify full file bytes, while the read column names only the inspected ranges. LSP-only anchors and text-search-only CSS/engine/loss-handler references are identified above and are not promoted to whole-file reads.

| Source | Inspected source ranges | Full-file SHA-256 |
|---|---|---|
| `js/audio/crowd.js` | 81–224; 278–424 (LSP outline resolves remaining exported anchors) | `e1ea96334820ec0f307c5b41f6c1a03080cf4c3892e7af89f10912e030ed9003` |
| `js/editor/custom-tracks.js` | 153–277; 327–535; 547–637 | `060b22134e9f11d71158ef90887683f1a99133c998c7b13b549bcadc45bed9f6` |
| `js/editor/track-themes.js` | 374–456 | `6c42bda0cb9ce57045ae2c1fb6310c2bb855764fdde715922cc35336c3fd68bf` |
| `js/ui/cvd-palette.js` | 1–EOF (bounded source display) | `819f5a3a053b76b25832b372dab63f0cff9bdd365ae20941271bed339afddd36` |
| `js/ui/title-menu.js` | 59–134 | `7925708921ae016559e3a2a8e3fc1e9e2f5fec652686a131caff5db75f7d5ff6` |
| `js/ui/select-screen.js` | 149–250 | `ebefdf18b0a6f804f902f4d3737f02cf3bb7414d21d27efa419b91256b14c1ac` |
| `js/game.js` | 2000–2025; 4307–4342 | `20990458b493b2cdf6633be6df1eae91c6b820068be48522788d09467130334d` |
| `.codex/hooks/mcp-guard.sh` | 1–EOF | `48701bffcda31f96ef34f89b3010a362f2867acc8761a9d77bf384836c788f6f` |
| `.cursor/hooks/mcp-guard.sh` | 1–EOF | `ab8d023002ba63eea0427707f69b3bfd682e20eb38c3169d7ac8a2f733d293c9` |
| `.codex/hooks/shell-guard.sh` | 1–EOF | `2ecbd335e69a1819d55cfecb881e622a0d95d53600b8b2d16e99fcf9b36528ad` |
| `.cursor/hooks/shell-guard.sh` | 1–EOF | `33417298b3836df6f234a86d52f7b63249c60b37659989ac3d49bb8c653f607d` |
| `.githooks/pre-push` | 1–EOF | `716451b052665544864e49b97d4bccca361e325d47940a07051be95305d5185d` |
| `.githooks/pre-commit` | 1–EOF (re-read separately after oversized initial combined display) | `3695299fb48ae60ef00a77ec3da9efb36b2b994d38c05e9f786116d40a773501` |
| `tests/helpers/css-source.mjs` | 1–EOF | `434b8bcb5a8b1b7ff7e3d52b292f8d0a1726db49dbc655b85538bcb005df571a` |
| `tests/helpers/game-source.mjs` | 1–EOF | `2128e7f89b961235d0521d5d516cf57867296e3f1f841abe1c5cc8d9c283b044` |
| `tests/helpers/git-fixture-env.mjs` | 1–EOF | `4c1552f60e11920ca758fd7f913db6604ac90adcbd59437a694576f2e7f9cf82` |
| `tools/ci/cursor-agents.mjs` | 43–97; 215–279; 342–536; 557–837 | `048f4e7e8a9250b91bb607b28a9768149cbcfdfda9453dc278d7f38eb6b828a0` |
| `tools/lib/cursor-transcript.mjs` | 1–110; 125–303 | `28aea2d704979878cd7cfb5b8ce975c608a2fc0bf2eaf8bab234eebd2bcd1b54` |
| `tools/ui/css-play.mjs` | 46–156 | `ad07e88e918184f53f4ac9945c0b66320db1971af88618abc56caaffb61c477e` |
| `tools/manifest.cjs` | 486–529 | `bc6440de131fd98aa6f8eb7df5a6ba09b9796d256b01379869e37389f31abbeb` |
| `tools/lib/css-source.mjs` | 1–EOF | `74cd73af69b01e54a727ccf09d7eb4b27f2611fdbeec02519ff5ab9741b5e25a` |
| `tools/check/tree-counts.mjs` | 129–159; 241–264 | `e7010e3cbfbfafd7838e2e5071991ad9c1cd7973142fff959eeb6fd4b9cae762` |
