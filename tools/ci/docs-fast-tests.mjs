#!/usr/bin/env node
// docs-fast-tests — the ONE list of unit files a docs-only change runs (#5461).
// @doc The unit files a docs-only change runs: read by the pre-commit hook and tooling-fast's docs-only mode; prints them.
//
// Both docs-only shortcuts (the pre-commit hook's docs-only branch and `tooling-fast --changed`, which is the CI
// guards tier on a prose PR) read this list, so they cannot drift apart again. Before #5461 the hook ran
// docs-integrity alone and tooling-fast ran seven files without knowledge-retention, so a 43 KB note reached the
// deploy tip and turned test:guards red there. A file belongs here when a prose-only edit (a `.md` anywhere, a
// docs/ image) can turn it red: it reads markdown, a skill or agent card, docs/notes or a changelog fragment.
//
//   node tools/ci/docs-fast-tests.mjs   # space-separated paths, for the hook's `node --test`
export const DOCS_FAST_TEST_FILES = Object.freeze([
  "tests/unit/agent-config.test.mjs",        // AGENTS.md / CLAUDE.md / skills / agent cards
  "tests/unit/agent-surface.test.mjs",       // docs/AGENT-SURFACE.md
  "tests/unit/changelog-fragments.test.mjs", // docs/changelog.d/*.md and CHANGELOG.md
  "tests/unit/comment-citations.test.mjs",   // cited doc anchors
  "tests/unit/docs-integrity.test.mjs",      // every path and link in prose
  "tests/unit/generated-docs.test.mjs",      // the hand-written halves of generated docs
  "tests/unit/hooks-documented.test.mjs",    // .claude/rules/claude-config.md
  "tests/unit/knowledge-retention.test.mjs", // docs/notes: 40 KB cap, Kind / Re-measure-by, citations (#5461)
  "tests/unit/rulebook-guards.test.mjs",     // one home per rule across the instruction .md files
  "tests/unit/skill-descriptions.test.mjs",  // SKILL.md descriptions route
  "tests/unit/skill-progressive.test.mjs",   // SKILL.md body budget
]);

import path from "node:path";
import { fileURLToPath } from "node:url";
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.stdout.write(DOCS_FAST_TEST_FILES.join(" ") + "\n");
