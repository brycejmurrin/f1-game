---
name: webapp-testing
description: Toolkit for interacting with and testing local web applications using Playwright (Python scripts). Use when verifying frontend functionality, debugging UI behavior, capturing browser screenshots, or viewing browser logs of a local web app. For Apex 26 itself prefer the repo-native playwright-probe.
license: Complete terms in LICENSE.txt
---

# Web Application Testing

Write native Python Playwright scripts. Bundled helpers are black boxes —
run `--help` first; do not ingest `scripts/` source unless a customized
solution is actually necessary.

**Apex 26:** use **playwright-probe**, not this skill.

```sh
python scripts/with_server.py --help
```

## Don'ts

- Do not inspect a dynamic page before `wait_for_load_state('networkidle')`.
- Do not launch headed Chromium; scripts use `headless=True`.
- Do not leave the browser open — always `browser.close()`.

## Load on demand

- Decision tree, `with_server.py` examples, recon pattern, pitfalls → [references/workflow.md](references/workflow.md).
