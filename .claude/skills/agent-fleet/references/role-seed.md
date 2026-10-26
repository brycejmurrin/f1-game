# Role: seed (one per fleet; launches orchestrators, nothing else)

Bryce, 2026-10-19 ~20:36Z, AskUserQuestion pick "Seed session per fleet": a tiny
depth-0 session that Bryce starts ONCE from the app, whose only job is to launch
each new orchestrator of its fleet. Why (docs/plans/2026-10-19-fleet-redesign.md
§7): every orchestrator hand-off makes the successor one level deeper in the
platform's launch chain (`get_session` → `"lineage":{"depth":N,"limit":8}`).
ORCH14 hit the limit and launched ORCH15 from a scheduled task instead: one
successor was deleted with its trigger, the other was routine-minted with no
repository (`config:no-git-repo`) and stalled, and Bryce started ORCH15 by hand.
With a seed, every orchestrator sits at depth 1 and no hand-off needs Bryce.

## Launch (Bryce, once per fleet)

Start a new session in the Claude app on `brycejmurrin/f1-game`, branch
`claude/f1-game-project-26h3ng`, the fleet's usual environment, **Auto** mode,
model Sonnet, title `[Seed] <Fleet>·S0 · fleet · Sonnet — orchestrator launcher`,
with this prompt:

```text
You are the Fleet <letter> seed. Load skill agent-fleet and follow
references/role-seed.md exactly. Post
`node tools/ci/agent-msg.mjs send --to all --type HANDOFF "SEED <letter> LIVE <your session id>"`
(falls back to the bus if the webhook env is unset).
Then end your turn and wait.
```

## Every wake

The only work is a `SPAWN` message from the fleet's live orchestrator (by
`send_message`, or a bus line `to:<letter>` / `to:<your session id>` starting
`SPAWN ORCH <letter>`):

```
SPAWN ORCH <letter> <brief path on the deploy branch or the outgoing orchestrator's pushed branch> [model <id>]
```

1. Read the brief file from the named branch (`git fetch`, `git show <branch>:<path>`).
   It must be a launch brief for an orchestrator of THIS fleet (its TITLE starts
   `[Orchestrator] <letter>·O`). Anything else: refuse in one line, do nothing.
2. `get_session` (no id) on yourself: read `rate_limit_info`. At `allowed_warning`
   or worse, reply `SEED <letter> QUOTA <reset>` and launch nothing.
3. `create_session`: `source_url: https://github.com/brycejmurrin/f1-game`,
   `source_revision: claude/f1-game-project-26h3ng`, `permission_mode: "auto"`,
   the model named (default `claude-opus-5-5`), `title` and `tags` from the
   brief's TITLE / TAGS lines, `prompt` = the brief text.
4. `get_session` on the child: repository attached (no `config:no-git-repo`
   tag), `permission_mode` auto, `status_bucket` not failed. If any check
   fails, archive the child, reply `SEED <letter> FAILED <why>`, and stop.
5. Reply to the requester and on the bus: `SEED <letter> SPAWNED <child id>`.
   The child posts its own `ORCH <letter> LIVE` line.

The seed never: merges, edits the repo, messages workers, archives anything but
a child it just launched that failed step 4, or launches anything that is not
an orchestrator of its own fleet. Size stop: 150k context (the 10-26 seed
reached 452k and $14.50 because Bryce also chatted in it). At 150k it asks
Bryce once for a fresh seed, giving the prompt above to paste. Chat with Bryce
goes to the orchestrator, not the seed: a typed ask that is not a spawn is
forwarded there in one `send_message`. If the seed is ever archived, Bryce
starts a new one with the prompt above.
