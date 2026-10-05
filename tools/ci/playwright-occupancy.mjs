/**
 * @doc Classifies process-table lines for Playwright occupancy — the MCP lock oracle; an idle server is not busy.
 * @skill check-changes
 * Classify process-table lines for Playwright occupancy.
 *
 * Matches a live `playwright test` suite, a host `@playwright/mcp` server, or
 * Chromium launched with a playwright-mcp user-data-dir. Does NOT match
 * Cursor's exec-daemon `--mcp-config {"playwright":...}` JSON (that line is
 * not a live Playwright process).
 */
export function emptyPlaywright() {
  return { live: false, busy: false, suite: false, hostMcp: false, hostBrowser: false, pids: [] };
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
  // MCP server. Check before the generic playwright-mcp token. The EXECUTABLE
  // must be Chromium: the idle server itself is `node …/.bin/playwright-mcp
  // --executable-path …/chrome-linux/chrome --output-dir …/playwright-mcp`,
  // which carries both tokens as arguments, and read as a live browser it
  // refused every apex_* browser tool for the whole session (2026-10-05).
  const exe = (text.trim().split(/\s+/)[1] || "").split("/").pop();
  if (/^(?:chrome|chromium|chromium-browser|chrome-headless-shell|headless_shell)$/i.test(exe) &&
      /[./]playwright-mcp/.test(text)) {
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
  // BUSY is what a browser tool has to wait for: a running suite, or a host
  // MCP that has actually launched its Chromium. The @playwright/mcp SERVER
  // alone is a stdio process waiting for its first browser_* call — 0 % CPU,
  // no GPU, no canvas — and on a Cloud box it is attached for the whole
  // session, so treating it as occupancy refused every apex_* browser tool,
  // always (measured 2026-09-10: apex_garage open → playwright_live with the
  // server idle). It stays reported (`hostMcp`) and is not a refusal.
  out.busy = out.suite || out.hostBrowser;
  return out;
}
