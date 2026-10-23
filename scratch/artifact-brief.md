# Brief: publish the Apex live-UI findings report as a public Claude artifact

## File to use
`/workspace/apex-status/live-ui-report/live-ui-findings-2026-10-22.single.html` (on Grok Bot's box; Bryce copies it to the Claude Code machine).
- Size 1,043,940 bytes (~1.04 MB). Limit is 16 MiB rendered; one report says a public share of ~13–14 MB failed, so 1 MB leaves plenty of room.
- sha256 `71f9f988ade9b6fa46696c46cd8773878622bc0193c541791f604120b66aa672`. Check it with `sha256sum` before use.
- Fully self-contained: 31 images as `data:image/webp;base64` (q80), charts as inline `<svg>`, CSS and a tiny click-to-zoom script inline. No external URLs, no relative links (only in-page `#anchors`), no `data:image/svg+xml`. Valid UTF-8.
- Snapshot of commit 9f9db7fc4 / build 20566 of https://brycejmurrin.github.io/f1-game/?apex, 10 issues + 11 OK checks.
- Do **not** use `index.html` from the multi-file folder or the release tarball; they use relative `shots/` and `crops/` paths.

## Publish steps (in Bryce's own Claude Code session)
1. Ask Claude Code to make an artifact from that exact file **unchanged** (no "cleanup", no re-encoding, no extracting images to files). Source must be `.html`/`.htm`/`.md`.
2. Open the artifact and check images render, then use **Share** in the page header → public link. On Team/Enterprise plans an Owner must have enabled public sharing first.
3. Open the public link in a private window to confirm it loads.
Docs: https://code.claude.com/docs/en/artifacts and https://support.claude.com/en/articles/9547008-share-artifacts

## Pitfalls
- **External images are blocked by the artifact CSP.** Any `<img src="https://…">` or CSS `url(https://…)` shows broken. Keep everything as data URIs.
- **Relative links don't resolve.** `src="shots/x.png"`, `href="crops/…"` break. Only `#anchor` links work.
- **`data:image/svg+xml` in CSS silently blocks public sharing** (anthropics/claude-code#81410): the Share toggle fails without a clear error. Don't add SVG data URIs to CSS (icons, backgrounds, custom bullets). Inline `<svg>` elements are fine.
- **Size:** keep well under 16 MiB; don't swap WebP back to PNG (~7 MB).
- **Encoding:** must be valid UTF-8 with no U+FFFD replacement characters; don't round-trip through a tool that mangles `—`, `·`, `×`.
- If Claude edits the file, re-run these greps: `rg -c 'data:image/svg\+xml'` → 0; `rg -o '(src|href)="[^#d][^"]*"'` → none.

## Rebuild if needed
`node /workspace/apex-status/live-ui-report/build-single.mjs` (post-processes the multi-file report), then `node verify-single.mjs` (offline Playwright, 1280×900 and 390×844).
