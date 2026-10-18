# Pre-commit `test:guards` timeout — measurement (#2647)

**When:** 2026-10-18T04:45Z on a Cloud agent box (`/proc/loadavg` 1.33 / 0.91 / 0.36).  
**Tool:** `node tools/ci/measure-guard-commit.mjs --json` (two samples each).

## Results

| Path | Median wall | Under 160 s cap? |
|------|-------------|------------------|
| `npm run test:guards` (direct) | **79.4 s** | yes |
| `ratchets.mjs --auto-raise` + `test:guards` (hook sequence) | **94.7 s** | yes |

Inner cap in `.claude/hooks/bash-guard.sh`: **160 s** (300 s when load1 ≥ 3). PreToolUse hook timeout in `.claude/settings.json`: **360 s**.

## Root cause of the reported overrun (idle direct 63 s vs hooked >160 s)

Not loadavg on this box and not the staged-tree rule alone. **Measured mechanism (2026-10-17, landed #2685):** Claude Code registered `bash-guard.sh` under many PreToolUse `if:` filters, so one `git commit` could start **multiple hook copies at once**. Each copy ran the full ratchet + `test:guards` ladder and shared `artifacts/pre-commit-guards.log`, so wall time stacked and one copy hit the 160 s inner cap while a sibling finished ~200 s later.

**Fix already in tree (no further change this PR):**

- `flock` on `artifacts/pre-commit-guards.lock` (wait up to `GUARD_T + 60` s).
- Reuse a green verdict for the same staged tree (`git write-tree` → `artifacts/pre-commit-guards.ok`, 10 min TTL).
- Load-aware cap 300 s when `/proc/loadavg` load1 ≥ 3 (H5).

## Verdict

On an idle box today, commit-through-hook stays inside the budget. The historical timeout matches **fan-out**, not a slow `test:guards` by itself. Re-run: `node tools/ci/measure-guard-commit.mjs`.

Fixes #2647 (measurement; fix was #2685).
