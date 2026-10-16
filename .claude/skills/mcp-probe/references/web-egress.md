# Why a container browser cannot read the deployed site (measured)

- 2026-09-15: `chrome-devtools` navigating to ANY external HTTPS URL (even `https://example.com`)
  fails `net::ERR_CERT_AUTHORITY_INVALID`: Chrome here does not trust the agent proxy's CA.
  That error means "wrong tool for this URL", not a flag bug. Route to `deploy-research`.
- 2026-09-18: `curl` DOES reach github.io (HTTP 200, ~0.4 s) because it trusts the proxy CA bundle.
  Use curl for the deployed shell's exact bytes (`<meta name="apex-sha">`, a `?v=` hash).
- The host fetch tool renders to markdown and silently drops every `<meta>` tag, so it answers
  "no meta tags" about a page that has them. It stays right for plain JSON (`version.json`) and prose.
