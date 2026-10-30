---
name: phone-browser
description: "Use when someone with only a phone wants to play the working tree in Chromium through the Grok connector, or its tunnel link won't open. Not for: the deployed site → deploy-research; an 844x390 UI review → survey-ui-matrix; VS FRIEND → multiplayer-debug."
---

# Phone browser

The user has a phone and no computer, and talks to you through Grok's custom connector. Do not tell them to install
anything or run a command. This is NOT Bryce's route for "look at it on my phone": the page is this checkout's working
tree on software GL in an emulated 852×393 phone (the repo's phone profile is 844×390), never the live build — for what
is live use agent `deploy-research`; for UI at phone size use survey-ui-matrix / ui-menu-a11y.

## First, which route

- They want to PLAY: give them the live URL (AGENTS.md §Git branch & deploy) to open in the phone's own browser. Done.
- They want Claude to MEASURE OR DRIVE THE LIVE GAME ON THEIR OWN PHONE: the GitHub-issue bridge
  (`docs/notes/PHONE-BRIDGE-2026-10-30.md`), not this skill.
- They want to SEE this working tree driven for them: this skill, and it needs a Grok custom connector.
- Up front: in a proxied Claude cloud container the tunnel CANNOT start (the download's Node `fetch` ignores the
  proxy, and cloudflared needs direct egress to Cloudflare's edge — `references/failures.md`). There, offer the live
  URL instead of trying.

## Already connected

Search connected tools (ToolSearch) for `browser_open`. If it is there, call it. Do not start a second browser beside it.

`browser_open` (`tools/mcp/browser-http.mjs`) takes ONE optional argument,
`orientation`: `"landscape"` (default, 852×393 — Grok bridge size) or
`"portrait"` (393×852). That is the connector viewport only; AGENTS.md and
survey-ui-matrix use **844×390** landscape for play/UI review — do not treat
852×393 as the same. There is no URL argument: it serves THIS checkout's
working tree on a local static server and opens the game there (WebGL2, iPhone
user agent, touch). It returns `{url, title, apex, width, height, coarse}`.
Changing orientation rebuilds the page. `browser_eval({expression})` and
`browser_shot` need an open page; `browser_status` reports `{browser,
orientation, game, href}`.

## If the call fails, or no connector is connected

From the game repo:

```bash
node tools/mcp/browser-http-up.mjs
```

A line that starts `phone-browser reuse` means the address they already pasted still works. Say nothing about a new address.

A line that starts `phone-browser new` means the public host changed. Give them that one URL and tell them to open
their Grok connector settings (Settings → Connectors), edit the custom connector, and paste it. That is the only step
they do.

The script throws, takes long, or a URL needs checking (`browser_status`, `orientation`): `references/failures.md`.

## The tunnel URL is a credential

The `…/mcp?token=…` URL lets whoever holds it run `browser_eval` (arbitrary `page.evaluate`) in a page that can reach
this container's 127.0.0.1 services (apex-tools :3713 among them). The token rides in the query string, so it lands in
tunnel and proxy logs. Give it to the user only; never paste it into a PR body, commit, doc, issue comment or a shared
transcript. To rotate it: `node tools/mcp/browser-http-up.mjs --stop` (stops the recorded server and tunnel and forgets
the token — the running server keeps its old token, and the old tunnel URL keeps answering, until both are stopped),
then re-run it and give them the `new` URL. Deleting `state.json` alone rotates nothing.

## When done

`node tools/mcp/browser-http-up.mjs --stop`. The server otherwise keeps headless Chromium alive, detached, and the
next Playwright or test-bg run breaks one browser at a time (AGENTS.md rules 5 and 7).

## Do not

- Add this server to `.mcp.json`. Keep the checkout's configured catalog; phone-browser stays a separate bridge.
- Run it beside another browser (Playwright, chrome-devtools, playwright-official `browser_*`, `apex_*` browser
  tools) — one browser at a time — or from a subagent (AGENTS.md rule 10; hooks: `.claude/rules/claude-config.md`).
- Hand them a localhost address. The phone cannot open it.
