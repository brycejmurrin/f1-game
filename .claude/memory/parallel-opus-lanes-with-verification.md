---
name: parallel-opus-lanes-with-verification
description: User wants big review/fix campaigns run as many parallel Opus subagents, every finding independently verified before planning, MCP tools used alongside, and a written plan before fixes
metadata:
  type: feedback
---

For whole-project work (review, bug hunt, fix campaign) the user asked for: many Opus subagents in parallel (one per
subsystem), deep web research alongside, independent verifier agents re-deriving every P1/P2 before anything is planned,
MCP tools (apex-tools audits, GitHub, TinyFish, browser probes) used actively, a written plan with parallel lanes, and
then "fix all" executed as one worktree + one agent per lane with draft PRs (2026-10-04 session).

**Why:** the user values breadth and verified evidence over speed; refuted findings (3 of 193) and downgrades (≈40)
showed the verification pass pays for itself; browser probes settled items static review could not (pack premultiply).

**How to apply:** on a request like "review the project / find bugs / fix all": spawn one Opus reviewer per subsystem
with read-only rules, then one verifier per report, then write PLAN.md with lanes grouped by shared files and test group,
then run lanes in /home/user/f1-game-wt/<lane> worktrees with the LANE-PREAMBLE rules (no browser runs in subagents;
draft PRs; parent runs browser proofs). Keep the user informed in short status lines while agents run.
