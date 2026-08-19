# Webapp-testing workflow

Load from the SKILL.md index. For Apex 26 itself prefer **playwright-probe**.

## Decision tree

```
User task → Is it static HTML?
    ├─ Yes → Read HTML file directly to identify selectors
    │         ├─ Success → Write Playwright script using selectors
    │         └─ Fails/Incomplete → Treat as dynamic (below)
    │
    └─ No (dynamic webapp) → Is the server already running?
        ├─ No → Run: python scripts/with_server.py --help
        │         Then use the helper + write simplified Playwright script
        │
        └─ Yes → Reconnaissance-then-action:
            1. Navigate and wait for networkidle
            2. Take screenshot or inspect DOM
            3. Identify selectors from rendered state
            4. Execute actions with discovered selectors
```

## with_server.py

Always run `--help` first. Do not read the helper source until a customized
solution is actually necessary — the script is large and exists to be called
as a black box.

**Single server:**

```bash
python scripts/with_server.py --server "npm run dev" --port 5173 -- python your_automation.py
```

**Multiple servers (e.g. backend + frontend):**

```bash
python scripts/with_server.py \
  --server "cd backend && python server.py" --port 3000 \
  --server "cd frontend && npm run dev" --port 5173 \
  -- python your_automation.py
```

Automation scripts include only Playwright logic (servers are managed):

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('http://localhost:5173')
    page.wait_for_load_state('networkidle')
    # ... automation ...
    browser.close()
```

## Reconnaissance-then-action

1. Inspect rendered DOM (`page.screenshot`, `page.content()`, locators).
2. Identify selectors from that inspection.
3. Execute actions with those selectors.

Wait for `networkidle` on dynamic apps **before** inspecting. Use
`sync_playwright()`, close the browser, and prefer `text=` / `role=` / CSS / IDs
plus `wait_for_selector` over `wait_for_timeout`.

## Reference files

- `examples/element_discovery.py` — buttons, links, inputs
- `examples/static_html_automation.py` — `file://` local HTML
- `examples/console_logging.py` — console capture
