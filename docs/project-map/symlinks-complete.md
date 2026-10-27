# Tracked symlink map — complete metadata

All38 tracked symbolic links were inspected with lstat/readlink and resolved targets. Each is valid:36 directory aliases for canonical agent skills, plus two nested instruction aliases. `symlinks-metadata.json` records every raw target, resolved repository-relative location, target kind, link byte count and SHA-256 of the link text. These are link entities; target source reading is credited in its canonical scope, not invented as a new duplicate read.

The36 .agents/skills entries target matching .claude/skills directories with the relative prefix ../../.claude/skills/. This lets Codex discover the canonical skill bodies without a fork. All target directories and their SKILL.md files exist. Producer tools/env/mirror-skills.sh is already mapped in the tooling scope and was reread in full for this account: it validates the source/destination roster and exact symlink shape in --check, repairs links by default, and supports an explicitly noncommitted copy fallback. The current read did not run its repair mode. docs/AGENT-SURFACE.md and .claude/skills/agent-config/SKILL.md explain ownership; tests/unit/agent-surface.test.mjs pins the relationship.

The js/track and js/circuits AGENTS.md links each resolve to sibling CLAUDE.md. These are nested instruction entry points to the same per-directory body, not independent canonical instructions. Their content was read in the corresponding runtime domain mapping. The original coverage inventory followed regular-file aliases but omitted directory aliases; this report closes that inventory gap. Later coverage updates retain link identity separately from target content. No broken link, cycle, outside-repository target or duplicate canonical skill body was found.

## Link inventory

| Link | Raw target | Resolved kind |
|---|---|---|
| .agents/skills/agent-config | ../../.claude/skills/agent-config | directory |
| .agents/skills/agent-view | ../../.claude/skills/agent-view | directory |
| .agents/skills/ai-racecraft | ../../.claude/skills/ai-racecraft | directory |
| .agents/skills/asset-pack | ../../.claude/skills/asset-pack | directory |
| .agents/skills/audio-debug | ../../.claude/skills/audio-debug | directory |
| .agents/skills/career-mode | ../../.claude/skills/career-mode | directory |
| .agents/skills/check | ../../.claude/skills/check | directory |
| .agents/skills/check-changes | ../../.claude/skills/check-changes | directory |
| .agents/skills/code-nav | ../../.claude/skills/code-nav | directory |
| .agents/skills/css-play | ../../.claude/skills/css-play | directory |
| .agents/skills/data-hub | ../../.claude/skills/data-hub | directory |
| .agents/skills/f1-animation-cameras | ../../.claude/skills/f1-animation-cameras | directory |
| .agents/skills/game-feel | ../../.claude/skills/game-feel | directory |
| .agents/skills/garage-parts-livery | ../../.claude/skills/garage-parts-livery | directory |
| .agents/skills/handoff | ../../.claude/skills/handoff | directory |
| .agents/skills/input-controls | ../../.claude/skills/input-controls | directory |
| .agents/skills/js-debugger | ../../.claude/skills/js-debugger | directory |
| .agents/skills/lighting-tuner | ../../.claude/skills/lighting-tuner | directory |
| .agents/skills/mcp-probe | ../../.claude/skills/mcp-probe | directory |
| .agents/skills/multiplayer-debug | ../../.claude/skills/multiplayer-debug | directory |
| .agents/skills/new-track | ../../.claude/skills/new-track | directory |
| .agents/skills/phone-browser | ../../.claude/skills/phone-browser | directory |
| .agents/skills/playwright-probe | ../../.claude/skills/playwright-probe | directory |
| .agents/skills/pwa-cache-service-worker | ../../.claude/skills/pwa-cache-service-worker | directory |
| .agents/skills/race-incidents-control | ../../.claude/skills/race-incidents-control | directory |
| .agents/skills/race-weekend | ../../.claude/skills/race-weekend | directory |
| .agents/skills/renderer-debug | ../../.claude/skills/renderer-debug | directory |
| .agents/skills/scenery-dress | ../../.claude/skills/scenery-dress | directory |
| .agents/skills/season-mode | ../../.claude/skills/season-mode | directory |
| .agents/skills/ship | ../../.claude/skills/ship | directory |
| .agents/skills/slim-bloat | ../../.claude/skills/slim-bloat | directory |
| .agents/skills/steward | ../../.claude/skills/steward | directory |
| .agents/skills/survey-track | ../../.claude/skills/survey-track | directory |
| .agents/skills/survey-ui-matrix | ../../.claude/skills/survey-ui-matrix | directory |
| .agents/skills/tune-physics | ../../.claude/skills/tune-physics | directory |
| .agents/skills/ui-menu-a11y | ../../.claude/skills/ui-menu-a11y | directory |
| js/circuits/AGENTS.md | CLAUDE.md | file |
| js/track/AGENTS.md | CLAUDE.md | file |
