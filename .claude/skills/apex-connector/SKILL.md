---
name: apex-connector
description: "Use when Grok's custom connector needs apex_* tools (status, pick tests, shot, eval) or that public address has stopped answering. Not the phone browser connector and not the three stdio servers in .mcp.json."
---

# Apex connector

Grok cannot spawn the stdio `apex-tools` server and cannot open `127.0.0.1`. The connector is a local HTTP server plus a public tunnel.

## Already connected

Search connected tools for `apex_status`. If it is there, call that before any other `apex_*` tool.

## If the call fails, or no connector is connected

From the game repo:

```bash
node tools/mcp/apex-http-up.mjs
```

A line that starts `apex-connector reuse` means the address they already pasted still works. Say nothing about a new address.

A line that starts `apex-connector new` means the public host changed. Give them that one URL and tell them to open grok.com/connectors, edit the custom connector, and paste it. That is the only step they do.

The phone browser is a second connector (`browser_open`, port 3001). This one is port 3714. They do not share a URL.

## Do not

- Add this server to `.mcp.json`. The catalog stays three stdio servers for desktop Cursor.
- Hand them a localhost address. Grok cannot open it.
- Point this URL at the phone-browser card, or the phone-browser URL at this card.
