---
name: phone-browser
description: "Use when the user is on a phone and wants the game in Chromium through the Grok connector, or the connector link stopped working. Not for chrome-devtools, Playwright tests, or desktop."
---

# Phone browser

The user has a phone and no computer. Do not tell them to install anything or run a command.

## Already connected

Search connected tools for `browser_open`. If it is there, call it. Landscape is how the game is raced. Portrait is the tall screen. `browser_eval` and `browser_shot` need an open page. Do not start a second browser beside it.

## If the call fails, or no connector is connected

From the game repo:

```bash
node tools/mcp/browser-http-up.mjs
```

A line that starts `phone-browser reuse` means the address they already pasted still works. Say nothing about a new address.

A line that starts `phone-browser new` means the public host changed. Give them that one URL and tell them to open grok.com/connectors, edit the custom connector, and paste it. That is the only step they do.

The script throws, takes long, or a URL needs checking (`browser_status`, `orientation`): `references/failures.md`.

## Do not

- Add this server to `.mcp.json`. Keep the checkout's configured catalog; phone-browser stays a separate bridge.
- Run it while Playwright tests or the Chrome DevTools server are up. One browser.
- Hand them a localhost address. The phone cannot open it.
