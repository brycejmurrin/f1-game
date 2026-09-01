/**
 * @doc Classifies process-table lines for Playwright occupancy (`playwright test` / `@playwright/mcp`) — the MCP lock's oracle.
 * @skill check-changes
 * Classify process-table lines for Playwright occupancy.
 *
 * Matches a live `playwright test` suite, a host `@playwright/mcp` server, or
 * Chromium launched with a playwright-mcp user-data-dir. Does NOT match
 * Cursor's exec-daemon `--mcp-config {"playwright":...}` JSON (that line is
 * not a live Playwright process).
 */
export function emptyPlaywright() {
  return { live: false, suite: false, hostMcp: false, hostBrowser: false, pids: [] };
}

export function classifyPlaywrightLine(line) {
  const text = String(line || "");
  if (/--mcp-config/.test(text)) return null;
  const m = text.trim().match(/^(\d+)\s/);
  const pid = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(pid)) return null;
  if (/(?:^|[\s/])playwright\s+test(?:\s|$)/.test(text)) {
    return { kind: "suite", pid };
  }
  // Chromium with a playwright-mcp profile is the host *browser*, not the
  // MCP server. Check before the generic playwright-mcp token.
  if (/chrom(?:e|ium)/i.test(text) && /[./]playwright-mcp/.test(text)) {
    return { kind: "hostBrowser", pid };
  }
  if (/@playwright\/mcp/.test(text) || /\bplaywright-mcp\b/.test(text)) {
    return { kind: "hostMcp", pid };
  }
  return null;
}

export function scanPlaywrightLines(stdout) {
  const out = emptyPlaywright();
  const pids = [];
  for (const line of String(stdout || "").split("\n")) {
    const hit = classifyPlaywrightLine(line);
    if (!hit) continue;
    pids.push(hit.pid);
    if (hit.kind === "suite") out.suite = true;
    if (hit.kind === "hostMcp") out.hostMcp = true;
    if (hit.kind === "hostBrowser") out.hostBrowser = true;
  }
  out.pids = pids;
  out.live = pids.length > 0;
  return out;
}
