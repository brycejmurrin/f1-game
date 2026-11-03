VERDICT: FIX — the "boot evidence" citation points at a file that has none, and recipes.md still invites deployed-URL probing; otherwise sound and linked.
METRICS: SKILL.md 105 lines / 6,861 B (~1.7k tok); 12 references, 1,020 lines total / 59,270 B; description 246 chars.
PATHS: OK — all tools, docs, gpu-census.yml, playwright-probe recipes anchor "Galleries and image budget" (recipes.md:121) exist. Every reference is linked from SKILL.md (none orphaned). traps.md is a 13-line index over 3 slices (extra hop).
COMMANDS: OK for probe-mcp.py subcommands (status, list-tools, chrome-start/stop, call all appear in source). Not run (browser): chrome-start, mcp-cli probe.
WALKTHROUGH: Task "poke __apex on the live canvas". Description routes correctly (collisions are pre-named: js-debugger, deploy-research, playwright-probe, agent-view). Entry block (SKILL.md:25-37) mixes no-browser and browser commands in one fenced block; the agent must read comments to know which launch Chromium. Client choice (:17-21) is clear. Hard rule 1 (:68-70) relies on prose: attached chrome_* tools are undetected by test-bg, so only the agent's care protects against a concurrent Playwright run.

STRUCTURE:
- Under 500 lines; description fine. Largest refs: traps-camera 183, chrome 183, traps-scene 148, traps-chrome 134 — chrome.md and traps-chrome.md both cover Playwright-vs-Chrome differences (overlap, not measured further).
- Date-like/anchor tokens in 8 reference files (30 hits: traps-chrome 11, traps-scene 7, traps-camera 5) — candidates for stale-date review (UNREAD in detail).
- SKILL.md:77 image-budget pointer is a good one-home link.
- SKILL.md:100 and :102-105 repeat the naming and the one-line summary (low value, ~6 lines).
- SKILL.md:57-59 (.mcp.json / .cursor/mcp.json lockstep) is config trivia that belongs in docs/AGENT-SURFACE.md.
- Profile route duplication with playwright-probe: only one real overlap — chrome.md:96 says "overlaps playwright-probe's references/perf-profile.md, but live", and perf-profile.md:27 points back to mcp-probe. Mutual pointers, acceptable; not duplicated text. (pass3 S8 mostly REFUTED.)

ENFORCEMENT: Hard rule 1 is half-enforced (test-bg and chrome-start refuse each other; mcp-browser-guard covers subagents). Attached-tool case is prose only — hook candidate (probably infeasible; keep prose). Rule 3 "never getCurrentTexture() on software adapters" is prose only.

GAPS (ranked):
1. NEW/CONFIRMED (docs-claims-rules F6): AGENTS.md:94 and .claude/rules/render-wgx.md:36 cite `.claude/skills/mcp-probe/references/recipes.md` for "boot evidence"; recipes.md (25 lines) has no boot-evidence content. The content is docs/ARCHITECTURE.md:2038 "### Boot evidence — a unit test of a backend is not evidence that it runs" (confirmed). Fix: drop the recipes.md cite in both places (AGENTS.md is outside this unit; render-wgx.md:36 is a rule file) or add a one-line "boot evidence → ARCHITECTURE.md §Boot evidence" row to recipes.md.
2. STILL OPEN (pass3 S12): references/recipes.md:5 ("local or deployed URL"), :9 ("probe was local or deployed"), :23-25 ("real deployment or a local mirror") invite deployed probing, contradicting SKILL.md:63 and web-egress.md:1-5 (github.io unreachable from a container browser; route to deploy-research; curl works, web-egress.md:6-7). Fix: make recipes.md local-only and point to deploy-research. The "Verification: ... local or deployed" boilerplate is also on chrome.md:5, renderer.md:5, offline.md:9, device-report.md:5, research.md:5; for those only research.md legitimately covers deployed.
3. NEW: SKILL.md:25-37 split the entry fence into no-browser and browser blocks (cheap, avoids accidental Chromium launch under a Playwright run).
4. NEW (low): collapse traps.md into SKILL.md:86-90 links and delete it (13 lines, 4 inbound links to update).

OUT OF SCOPE: AGENTS.md:94 — cites recipes.md for boot evidence (wrong target; see GAP1). .claude/rules/render-wgx.md:36 — same. .claude/skills/renderer-debug/SKILL.md:12 cites ARCHITECTURE.md §Boot evidence correctly.
