---
name: small-steps-for-api-analysis
description: When analyzing GitHub Actions/API data, work in small incremental queries, not one big bulk-fetch script
metadata:
  type: feedback
---
User rejected a large bulk re-fetch script (all runs+jobs over a week in 3-hour windows) during a CI analysis and said "Try smaller ways".

**Why:** big opaque fetch jobs are slow, hard to follow, and hammer the API; the user prefers visible, incremental progress.
**How to apply:** analyze data already in hand first; then fetch narrowly (one job log, per-day totals via `per_page=1` + `total_count`) and show findings between steps.
