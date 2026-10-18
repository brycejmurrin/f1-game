# Playwright anti-flake (adapted)

<!-- Source: https://github.com/currents-dev/playwright-best-practices-skill
     Commit: 283d5cbc5d11aac1abda058b16ad22c317d54dc0
     License: MIT -->

Apex CI uses SwiftShader — flakes often measure **load**, not logic (`check-changes` triage).

| Practice | Apex rule |
|---|---|
| Auto-waiting | Prefer `getByRole` / stable hooks; avoid bare `waitForTimeout` |
| `waitForFunction` | `{ polling: 100 }` on rendering pages (`wait-polling-lint`) |
| Isolation | One browser **group** via `test-bg.mjs`; no parallel groups locally |
| Retries | CI retry 1; a local retry that passes = red unless quarantined |
| Sharding | `remote-group.mjs` on pushed branch when whole group needed |

Policy for unrelated shard red: skill **flake-rerun** (#2394).
