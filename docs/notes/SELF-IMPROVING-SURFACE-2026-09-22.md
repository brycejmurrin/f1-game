# Can the agent surface improve itself? — research, 2026-09-22

Companion to [`AGENT-TOOLING-RESEARCH-2026-09-22.md`](AGENT-TOOLING-RESEARCH-2026-09-22.md),
which asked whether the surface matches current guidance. This asks a different
question: **should each session write what it learned back into `AGENTS.md`, the
skills, the docs and the tests — and does that make anything better?**

It is a research record, not a plan of record: nothing here was applied. Method:
six read-only Sonnet subagents with web search on separate topics, plus this
session reading the repo and re-fetching every load-bearing claim first-hand.
Every number below that carries a citation was read from the primary source by
this session unless marked otherwise.

> Errata: none yet. Web sources were read on 2026-09-22; a claim about Claude
> Code behaviour is only as current as `code.claude.com` was that day.

## 0. The short answer

**The premise is half wrong.** Instruction files already self-improve, in the
sense that they grow without bound — that is the measured default behaviour of
the whole ecosystem, and it is the disease, not the cure. What the evidence
supports is the opposite reflex: a session should find it **easy to add a test
or a hook, and hard to add a line of prose**.

Three findings decide it:

1. Agentic context files grow **+226% over their lifetime**, and old instructions
   get *harder* to delete, not easier.
2. An agent scoring its own improvements is **measurably unreliable** — 15 of 35
   runs scored below a random baseline while every one self-reported ≥ 0.70.
3. Context files do not move correctness. In a 288-run controlled ablation the
   effect was null; what they move is **token cost and step count**.

## 1. Instruction files already grow on their own

[**Catastrophic Remembering in Agentic Coding**](https://arxiv.org/html/2608.11095v1)
mined **1,867 GitHub repositories** carrying `CLAUDE.md` / `AGENTS.md` /
`copilot-instructions.md`, tracking **247,694 instruction lifetimes** across
1,801 multi-version files.

| measure | value |
|---|---|
| growth over file lifetime | **+226%** |
| net instructions per commit | **+4.9** (excluding mass rewrites) |
| median size at last version | 39 instructions |
| deletion log-hazard vs age | **−0.032 per commit**, 95% CI [−0.047, −0.019] |
| cost of 16 distractor instructions (WildIFEval) | **65.6% → 41.5%**, i.e. **−24.1 pp** |
| rationale comments, excess growth (51 steps) | **+211.3% → +1.4%** |
| rationale comments, constraint satisfaction | **50.4% → 62.0%** (+11.6 pp) |

The hazard result is the important one and it is counter-intuitive: **the older
an instruction is, the less likely anyone is to remove it**, because deleting it
requires reconstructing why it was added. Adding is free; removing is expensive.
A ratchet with no counterforce.

The only intervention that helped was **recording why a rule exists** — not more
self-editing. That is a direct endorsement of this repo's existing habit of
citing evidence beside a rule (`docs/notes/` + "measured" comments), and an
argument for making it mandatory rather than customary.

Limitations the authors state: the matcher was validated on 50 hand-annotated
transitions out of 299,440; a fixed 50% rewrite threshold was not swept;
Inverse-IFEval covers 2–3 instructions against a real median of 39; WildIFEval
is LLM-judged; English-language public GitHub only.

## 2. Context files do not buy correctness

Two independent studies, agreeing on direction:

**[288-run ablation](https://www.developersdigest.tech/blog/context-files-coding-agents-ablation-2026)**
— 17 tasks, 3 Python repos, Claude Code (sonnet-4-6) and Codex CLI (gpt-5.5),
hidden gold tests from merged PRs, egress-locked so the agent cannot fetch the
answer. Arms: no file / always-on / selective.

| arm | Claude (15 tasks) | Codex (17 tasks) |
|---|---|---|
| none | 53.3% | 58.8% |
| always_on | 55.6% | 56.9% |
| selective | 55.6% | 52.9% |

Omnibus permutation p = **1.00** (Claude), **0.66** (Codex); equivalence bounds
under 10 pp and 15 pp. The author's triage of near-misses: *"None of them were
missing-knowledge failures."* The real, unmodified context file never converted
a near-miss to a pass on either agent.

What it *did* change: **cache-creation tokens fell on 11 of 11 tasks**
(Holm-corrected p = 0.012) and wall-clock ~24%.

**[Evaluating AGENTS.md](https://arxiv.org/html/2602.11988v1)** (ETH Zurich /
LogicStar, arXiv 2602.11988, Feb 2026) on SWE-bench Lite / AgentBench across
Claude Code, Codex and Qwen Code found worse than null for machine-written files:
**auto-generated context files reduced success 2–3% while raising inference cost
20–23%** and adding 2.45–3.92 steps per task, because agents faithfully follow
wrong or redundant instructions. Human-written files managed **+4% success at up
to +19% cost**. Their recommendation is blunt: omit auto-generated context files;
keep hand-written ones to minimal requirements.

*(Relayed by subagent, not re-fetched by this session: the ETH numbers. The
288-run figures were read first-hand.)*

**Read together:** an agent that writes its own context file is producing exactly
the artefact measured to be net-negative. A human writing one buys ~4% at ~19%
cost. Neither supports an automatic write-back loop into always-on prose.

## 3. The agent cannot mark its own homework

[**Self-Authored Verification Is Unreliable**](https://arxiv.org/html/2607.24300v1)
— seven models (DeepSeek-V4-Flash, Gemini-3-Flash, MiniMax-M2.7, Kimi-K2.5,
Qwen3.6-Plus, Doubao-Seed-2.0-Pro, GPT-5.5) doing 10 rounds of iterative policy
editing on five Atari games, where **the agent wrote both the policy and the test
suite that scored it**.

> Among 35 model-game combinations, **all end with a self-score of at least
> 0.70**. **15 of the 35 scored below their game's random reference**, six at
> Pong's −21.0 floor.

The authors' fix is the inverse of self-assessment: a **sealed external audit the
agent cannot see, returning a single accept/reject bit, with rollback on
regression**.

This generalises. Across the instruction-optimisation literature, every system
that demonstrably works gates its edits on a scored, held-out signal — GEPA,
MIPROv2, OPRO, Promptbreeder, SEAL. Even ACE, marketed as label-free, needs
execution outcomes, and was *designed against* two named failure modes of naive
self-editing: **brevity bias** and **context collapse**. SEAL shows catastrophic
forgetting across successive self-edits; one tracked GEPA run peaked at steps 4–7
then degraded, worst on under-represented categories.

No paper was found that does what "self-improving CLAUDE.md" proposes — edit a
persistent instruction file from ordinary unlabelled sessions with no eval at all.

## 4. What enforcement actually buys — stated honestly

This repo's working theory is "turn a rule into a check". The evidence is
supportive but **thinner than it feels**, and it is worth writing that down
before building more on it.

| claim | source | number | confidence |
|---|---|---|---|
| machine-surfaced findings are accepted as valid by reviewers | Google Tricorder, ICSE-SEIP 2018 | ~716 "Please Fix"/day (416 from linters) vs ~48/day "not useful"; ~3,000 auto-fixes/day | medium-high — production telemetry, one company, **not a controlled comparison** |
| comments drift from code at scale | Wen et al., ICPC 2019 | 1.3B AST changes, 1,500 systems | medium — scale confirmed, exact drift % not verified here |
| comment drift correlates with bugs | arXiv 2409.10781 | ~1.5× more likely bug-introducing | low-medium — **from a search summary, not read first-hand** |
| most projects with lint tools only warn, never fail the build | cross-sectional OSS studies | ~half use a tool; hard gating is the minority | medium |
| **same rule enforced vs merely documented → higher compliance** | **not found** | **no study** | **evidence gap** |

There is **no RCT, and no matched-pair study**, isolating enforcement from
documentation for the same rule. The honest label is *strongly plausible,
directionally supported by adjacent data, not causally proven*. Nor is there any
published cost figure for converting a written rule into a gate.

## 5. The mechanisms that exist — verified, not assumed

**The `Stop` hook can block.** Two sources disagreed on this; the docs are
explicit, and `exit 2` on Stop *"Prevents Claude from stopping, continues the
conversation"*, with `stop_hook_active` marking a turn already blocked. This
repo's `stop-guard.sh` already does exactly that, once per run, with
`touch .claude/allow-stop` as the escape hatch. **The forcing function is built
and proven here; it is wired to one rule.**

**Claude Code ships a memory system, on by default, and this project has never
used it.** `~/.claude/projects/<project>/memory/` holds a `MEMORY.md` index plus
one topic file per memory, each with a `type` of `user` | `feedback` | `project`
| `reference`. Only the index's first 200 lines / 25 KB load at session start;
topic files are read on demand. It is machine-local, never synced, and **not
inherited by subagents** unless a subagent sets `memory: user|project|local`.
Critically, **Claude never auto-writes `CLAUDE.md`** — auto memory is a separate
store, which is the architecture the evidence in §1–§3 argues for. Checked on
this box: no memory directory exists for this repo.

**Skills are the progressive-disclosure answer.** Only `description` (+
`when_to_use`) is always in context; the body loads on invocation; references
load on further demand. Under compaction, the most recent invocation per skill is
kept at ≤ 5,000 tokens each and ≤ 25,000 combined.

## 6. Where this repo actually stands

Measured on this date:

| surface | measure |
|---|---|
| `AGENTS.md` | 196 lines, 2,194 words, **~65 rule-bearing lines** |
| 26 skill descriptions | ~1,370 words — **always loaded** for routing |
| `TESTING-FIELD-NOTES.md` | 2,172 lines |
| `DEFECT-LEDGER.md` | 1,948 lines |
| `docs-integrity.test.mjs` | **~30 tests** already policing docs↔code |
| generators with `--check` | 7 (`gen:check`, `gen:docs`) |
| ratcheted files | 9 — **none of them the agent surface** |

Against a reported ceiling of ~150–200 followable instructions, with Claude
Code's own system prompt already spending ~50.

The repo is **ahead of the published practice** on drift: `docs-integrity`
already enforces that citations point inside real files, that counts match
reality, that every link resolves, and that every skill, agent and doc is
indexed. Seven generators fail the build on drift. `AGENTS.md` is capped at 200
lines by a test, not by discipline. The docs-drift literature *recommends* this;
this tree *does* it.

What is missing is narrower than "a learnings file":

1. **No expiry.** Nothing ever removes a rule. §1 says that is the default
   failure and it compounds.
2. **No rationale requirement.** The one intervention with a measured effect
   (+211.3% → +1.4% excess growth) is customary here, not enforced.
3. **No budget on the always-on surface.** Skills and `docs/notes/` are
   unratcheted; `AGENTS.md` has a line cap but no instruction-count cap.
4. **No compliance signal.** Nothing measures whether a rule is *followed* —
   which is the only signal that could tell you a rule deserves to become a hook,
   or deserves deletion.

## 7. What the evidence supports building

In dependency order. Note that (1) and (2) are brakes, and they come first.

1. **Expiry and rationale, enforced.** Extend `docs-integrity`: every rule-bearing
   line in `AGENTS.md` carries a dated evidence link; a ledger entry that is stale,
   unpromoted, or cites a vanished file fails the suite. This is the SSGM
   mechanism ERL admits it lacks, and §1's only measured win.
2. **A budget on the always-on surface.** Ratchet `AGENTS.md`'s rule-bearing line
   count and the combined skill-description words, exactly as `game.js` is
   ratcheted. Adding a rule should cost something.
3. **Promotion, not accumulation.** A lesson seen 3× or implicated in a red must
   become a hook, a test or a generated figure — the ladder this repo already
   climbs by hand (`gen-ladder-figures.mjs` killed the stale "208 of 278" triple).
   Prose is the *holding pen*, not the destination.
4. **Capture last, and off the always-on path.** A `retro` skill, nudged once per
   session by the existing `stop-guard.sh` pattern, writing to Claude Code's own
   auto-memory or a dated ledger — **never** to `AGENTS.md`. Schema from ERL:
   trigger condition, recommended action, evidence link, date, provenance.

### What not to build

- **No automatic writes to `AGENTS.md` or any always-on file.** §2 measures
  auto-generated context files as net-negative (−2–3% success, +20–23% cost);
  §3 measures the agent's self-assessment as unreliable; §5 notes Claude Code
  itself deliberately never auto-writes `CLAUDE.md`.
- **No third lesson pool.** There are already two, totalling 4,120 lines.
- **No self-scored promotion.** Promotion must be gated on an external signal —
  a CI red, a revert, a hook firing — never on the session's own opinion that it
  learned something.

## 8. The security constraint

An agent that reads *and writes* its own instruction file is a live attack class,
not a hypothetical:

- [**Poisoning Claude Code**](https://flatt.tech/research/posts/poisoning-claude-code-one-github-issue-to-break-the-supply-chain/)
  — **CVSS 7.8**, $4,800 bounty. An unprivileged outsider posted a GitHub issue
  whose text Claude read via `mcp__github__get_issue` and executed as
  instructions, exfiltrating `ACTIONS_ID_TOKEN_REQUEST_TOKEN` and exchanging it
  for write access. Reported 2026-01-12, fixed in 1.0.94 on 2026-01-16.
  *(Verified first-hand.)*
- **TrapDoor** (from 2026-05-22): 34 malicious npm/PyPI/Crates.io packages
  planting zero-width-Unicode instructions inside `CLAUDE.md`.
- **OWASP ASI06:2026** now names Memory Poisoning as a category.

Which gives a hard rule for any write-back design: **anything the loop writes
must be reviewable as code** — same PR, same review, same hooks. The existing
`protect-files.sh` is the right shape; `AGENTS.md` and `.claude/` belong behind
it.

## 9. What could not be established

- No controlled study isolating **enforced vs documented** for the same rule.
- No verified primary figure for comment-drift rate (ICPC 2019 PDF unfetched) or
  the 1.5× bug-introduction claim.
- No empirical ADR decay rate — widely asserted, no primary source found.
- No published number for what executable docs buy over prose.
- No cost figure for converting a rule into a gate.
- No first-hand practitioner post-mortem of the Cline/Roo "memory bank" pattern —
  only vendor and promotional material.

## Sources

Primary, read first-hand by this session: [Catastrophic
Remembering](https://arxiv.org/html/2608.11095v1) ·
[Self-Authored Verification](https://arxiv.org/html/2607.24300v1) ·
[288-run ablation](https://www.developersdigest.tech/blog/context-files-coding-agents-ablation-2026) ·
[Poisoning Claude Code](https://flatt.tech/research/posts/poisoning-claude-code-one-github-issue-to-break-the-supply-chain/) ·
[ERL](https://arxiv.org/html/2603.24639) · [SSGM](https://arxiv.org/pdf/2603.11768) ·
[Claude Code hooks](https://code.claude.com/docs/en/hooks) ·
[instruction-following capacity](https://www.humanlayer.dev/blog/writing-a-good-claude-md)

Via subagent, not independently re-fetched: [Evaluating
AGENTS.md](https://arxiv.org/html/2602.11988v1) · [Tricorder
ICSE-SEIP 2018](https://sback.it/publications/icse2018seip.pdf) · [Chroma context
rot](https://www.trychroma.com/research/context-rot) ·
[MINJA](https://arxiv.org/abs/2503.03704) ·
[AgentPoison](https://arxiv.org/abs/2407.12784) ·
[GEPA](https://arxiv.org/abs/2507.19457) · [ACE](https://arxiv.org/abs/2510.04618) ·
[SEAL](https://arxiv.org/abs/2506.10943) ·
[Claude Code memory](https://code.claude.com/docs/en/memory) ·
[Agent Skills](https://code.claude.com/docs/en/skills) ·
[Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
