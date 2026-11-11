---
name: phone-browser
description: "Use when someone with only a phone wants to play the working tree in Chromium through the Grok connector, or its tunnel link won't open. Not for: the deployed site → deploy-research; an 844x390 UI review → survey-ui-matrix; VS FRIEND → multiplayer-debug."
---

# Phone browser

The user has a phone and no computer. Grok, on their phone, is the MCP client: its custom connector calls this
checkout's `tools/mcp/browser-http.mjs` through a tunnel. You never call those tools; you keep the server and tunnel up
and hand over the URL. Do not tell them to install anything or run a command. This is NOT Bryce's route for "look at it
on my phone": the page is this checkout's working tree on software GL in an emulated phone whose viewport is NOT the
repo's 844×390 phone profile (sizes: `PHONE` in that file), never the live build — for what
is live use agent `deploy-research`; for UI at phone size use survey-ui-matrix / ui-menu-a11y.

## First, which route

- They want to PLAY: give them the live URL (README.md, first line) to open in the phone's own browser. Done.
- They want Claude to MEASURE OR DRIVE THE LIVE GAME ON THEIR OWN PHONE: the GitHub-issue bridge
  — skill `phone-bridge`, not this skill.
- They want to SEE this working tree driven for them: this skill, and it needs a Grok custom connector.
- Up front: in a proxied Claude cloud container the tunnel CANNOT start (the download's Node `fetch` ignores the
  proxy, and cloudflared needs direct egress to Cloudflare's edge — `references/failures.md`). There, offer the live
  URL instead of trying.

## Already connected

The connector's tools (`browser_open`, `browser_eval`, `browser_shot`, `browser_status`; schemas: `TOOLS` in
`tools/mcp/browser-http.mjs`) are Grok's, not in your tool list, and never added to it. If the user says it works,
there is nothing to do: Grok calls `browser_open` (optional `orientation`, no URL argument: it serves THIS working
tree). To check the address still answers, run the script below; `reuse` means it does.

## Start it, or it stopped answering

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
transcript. No hook scans for it: keeping it out of shared text is on you.
To rotate it: `node tools/mcp/browser-http-up.mjs --stop` (stops the recorded server and tunnel and forgets
the token — the running server keeps its old token, and the old tunnel URL keeps answering, until both are stopped),
then re-run it and give them the `new` URL. Deleting `state.json` alone rotates nothing.

## When done

`node tools/mcp/browser-http-up.mjs --stop`. The server otherwise keeps headless Chromium alive, detached, and the
next browser tool breaks one browser at a time (AGENTS.md rule 5).

## Do not

- Add this server to `.mcp.json`. Keep the checkout's configured catalog; phone-browser stays a separate bridge.
- Run it beside another browser (Playwright, chrome-devtools, playwright-official `browser_*`, `apex_*` browser
  tools) — one browser at a time — or from a subagent (AGENTS.md rules 5 and 10). No hook catches this server's
  Chromium: `bash-guard.sh` and `mcp-browser-guard.sh` do not match `browser-http-up.mjs`, so the rule is yours to keep.
- Hand them a localhost address. The phone cannot open it.
