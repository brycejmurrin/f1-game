VERDICT: FIX — the card's browser-guard claim (lines 36-39) is wrong both ways: browserstack is NOT guarded, browser-use IS guarded.
METRICS: 151 lines / ~8.9 KB (approx 2.2k tokens) / description 296 chars / 0 references files
PATHS: OK for docs/agent-output/README.md, docs/VERIFICATION.md, .claude/skills/README.md, tools/ci/{who-is-on-it,tooling-fast,pick-tests}.mjs, tools/track/verify-track.cjs. UNVERIFIED: `mcp__Three_js_3D_Viewer` (worker.md:5,34) is in no repo file (.mcp.json, settings.json, AGENT-SURFACE.md); it is a host connector, so a missing one is a silent no-op.
COMMANDS: OK (no flags beyond `--changed --jobs=3`, `-u origin`; same ones AGENTS.md loop uses). Not run (side-effect rules).
FRONTMATTER: name, description, model, tools, maxTurns, isolation are all real Claude Code fields (web-claude-code.md:14). No readonly/is_background/skillOverrides/deniedMcpServers here, so nothing is silently ignored. `omitClaudeMd` is absent (right: worker needs AGENTS.md). Optional: `disallowedTools` is unused, fine.

WALKTHROUGH (edit -> node-verify -> commit -> SendMessage):
1. Orient: `git log`, `who-is-on-it.mjs` run fine as plain commands.
2. Edit: protect-files.py:392-400 refuses worktree edits to index.html, manifest.cjs, version.json, sw.js, roster.js, gen-shell.mjs, package.json, package-lock.json, playwright.config.js. Card line 57-60 lists only manifest.cjs, groups.json, index.html "message main before touching"; the hook REFUSES (not just asks) package.json, sw.js, version.json, roster.js, and does NOT list groups.json. Mismatch. Also AGENTS.md rule 2 (js/css/index.html live-run ban) applies if the parent has a browser run in flight.
3. node-verify: `node --test` works without node_modules (card line 68-73). bash-guard.sh:518-523 auto-symlinks node_modules on commit, so the card's manual `ln -s` is only needed for npm/npx. `tooling-fast --changed` is >2 min: card says background+Monitor; fine.
4. Commit: card line 131-133 says two commands; correct (AGENTS.md rule 12). bash-guard.sh:505 runs `test:guards` in the worktree root, up to 160 s guard budget; no refusal in a subagent for a plain commit. A chained `git add && git commit` would be refused/misread; the card says one command per Bash call (line 74-76). OK.
5. SendMessage `to: "main"`: allowed, no hook. Final report shape (lines 138-147) is plain text; subagent-contract.py is wired to the SubagentHandback matcher (settings.json:284) only, and the card never mentions SubagentHandback. If the harness gives workers that tool, the card does not say to hand back through it, so the WORKER shape may never be checked or delivered.
Refused steps: protect-files (above); push of the deploy branch (permissions.deny); `git push` before ~10 min waits is allowed; `gh pr ready`/merge guarded by merge_policy.

MCP-BROWSER-GUARD (card 36-39 vs settings.json:262):
- Matcher = playwright-official, chrome-devtools, js-debugger, apex-tools apex_(eval|shot|shot_survey|agent|garage|hud_shot|hud_survey|hud_mock|track|ui_fit|ui_shot|ui_inspect|diagnostics|profile|job_start|debug_chrome), plugin_browser-use.*. The script (mcp-browser-guard.sh:45-48) re-checks the same set.
- (a) STALE: line 38-39 "The browser-use plugin server is left off: the guard does not match it." The guard matches it since 2026-10-26 (sh:26-30, settings.json:262 `plugin_browser-use.*`). The server also is not in the tools: list, so it is unreachable anyway; sentence is just wrong.
- (b) FALSE: line 36-37 lists `mcp__browserstack` as refused. Neither the matcher nor the script's BROWSER regex contains browserstack; settings.json:10,31 allow it. A worker can call browserstack tools unguarded (they run on a remote cloud browser, not local Chromium, so the box-saturation risk of rule 10 is lower, but the text claims a refusal that does not happen).
- (c) "the browser apex_* tools" (line 37) is vague; the guard has an exact list; apex_debug_chrome status/stop/list stay open (sh:47). Point at the script instead of paraphrasing.
- Also D4/D5 (web-claude-code.md): guard keys on agent_id OR agent_type; fine for workers.

STRUCTURE: 151 lines OK. Lines 14-18 ("Output and capability policy") are dense jargon ("capability receipt", "automatic recorder", "local claim instead of remote claims-board mutations"): none of these terms exists in docs/agent-output/README.md (grep empty), so the paragraph references concepts it does not define. Line 41-50 duplicates harness tool-filter facts (dated 2026-10-15 doc read). Line 151 prohibitions line is a pointer; fine. Description: third person, what+when, names siblings (verify-agent, track-surveyor); AGENTS.md route "scoped change handed to a subagent you message mid-task" matches.

ENFORCEMENT: browser ban = hook (mcp-browser-guard + bash-guard); card can shrink lines 36-39 to a pointer to the hook and drop the claimed tool list. Rule "never merge / force-push / cancel runs" is hook-enforced (merge_policy, bash-guard) so line 136-137 could be one clause. "OWNED/FORBIDDEN paths" are prose only; no hook enforces a worker's OWNED globs (candidate, low value).

GAPS (ranked, each PR-sized):
1. .claude/agents/worker.md:36-39 — rewrite the browser bullet: remove "browser-use ... guard does not match it" (now matched, settings.json:262) and either drop browserstack from "refused" or add `browserstack__.*` to the matcher + script regex (hook change needs Bryce's yes per claude-config.md). Card-only fix is the safe first PR.
2. .claude/agents/worker.md:57-60 — shared-contract list disagrees with protect-files.py:395-398 (hook hard-refuses package.json, package-lock.json, sw.js, version.json, roster.js, gen-shell.mjs, playwright.config.js in a worktree; groups.json is not in the hook). Say "refused by protect-files in a worktree: <list>; message main to relay the change".
3. .claude/agents/worker.md:138-147 — name how the final report is delivered (SubagentHandback, validated by subagent-contract.py) or state it is plain text; currently silent.
4. .claude/agents/worker.md:14-18 — define or delete "capability receipt / local claim / automatic recorder"; none is in docs/agent-output/README.md.
5. .claude/agents/worker.md:5,34 — `mcp__Three_js_3D_Viewer` is not a repo-configured server; confirm or drop.
6. .claude/agents/worker.md:68-73 — note bash-guard.sh:518 auto-links node_modules on commit (manual `ln -s` only for npm/npx).

OUT OF SCOPE:
- .claude/hooks/mcp-browser-guard.sh:11,21 — stale hooks-doc quotes (pass 4 D5).
- AGENTS.md rule 10 "Worktrees start at the session SHA" vs docs "current local HEAD" (pass 4 D8); worker.md:65-67 repeats "the commit the brief names (or the session SHA)".
- settings.json:10,31 browserstack allowed wholesale; not in the guard (see above).
