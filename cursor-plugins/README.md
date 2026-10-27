# Cursor plugins

Team-only Cursor plugins for Apex 26 agents. These are **not** game runtime
code. They package skills, rules, and commands for Cursor cloud agents.

## `apex-f1-game`

Local Cursor plugin (v0.1.0) with seven team skills, the `apex-lanes` rule, and
the `apex-pr-status` / `apex-insights` commands. Source of truth:

`cursor-plugins/apex-f1-game/` (manifest: `.cursor-plugin/plugin.json`)

### Install locally

Copy or symlink the folder into Cursor's local plugin directory, then reload
the window:

```sh
# copy (reliable)
cp -R cursor-plugins/apex-f1-game ~/.cursor/plugins/local/apex-f1-game

# or symlink (works when Cursor accepts an in-folder link)
ln -sfn "$(pwd)/cursor-plugins/apex-f1-game" ~/.cursor/plugins/local/apex-f1-game
```

Then **Developer: Reload Window**. Confirm the skills, `apex-lanes` rule, and
both commands under **Customize**.

A symlink that points at this repo is convenient while iterating. Cursor may
skip a symlink whose target is outside `~/.cursor/plugins/local/` — if the
plugin does not appear after reload, use the copy.

Marketplace publish is optional later. Until then, teammates install from this
tree.

Plugin skills must stay aligned with repo `AGENTS.md` and `docs/WORKERS.md`
(the one home for claim, draft PR, hand-off and landing). Do not fork process
rules here: point to those files.

See [Cursor plugin docs](https://cursor.com/docs/plugins) for the local
discovery path and marketplace flow.
