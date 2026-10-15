// @doc A `fetch` honouring HTTPS_PROXY (curl-backed when Node would bypass the agent proxy) for GitHub API callers in tools/.
// proxy-fetch.mjs — a `fetch` that honours HTTPS_PROXY (#2188, 2026-10-15).
//
// Node's built-in fetch ignores HTTPS_PROXY unless the process started with
// NODE_USE_ENV_PROXY=1 (Node >= 22.21; /root/.ccr/README.md). In a cloud
// container the GitHub token is valid only through the agent proxy, so a bare
// fetch to api.github.com got `401 Bad credentials` (flake-tally) or a silent
// rate-limited 403 (verify-change's live-CI advisory never fired). curl reads
// HTTPS_PROXY and the proxy's CA bundle itself, as the shared `api()` in
// ready-full-cap.mjs already relies on.
//
// proxyFetch(url, init) answers with the subset of Response the callers use
// (status, ok, arrayBuffer, text, json). Headers travel in a curl config on
// stdin (`-K -`), never in argv, so a token is not visible in `ps`. `-L`
// follows redirects (an artifact zip lands on blob storage); curl drops the
// Authorization header when a redirect changes host, as fetch does.
// TLS verification is never disabled.
import { spawn } from "node:child_process";

/** True when the process's fetch would bypass a configured proxy. */
export function fetchBypassesProxy(env = process.env) {
  const proxy = env.HTTPS_PROXY || env.https_proxy;
  return Boolean(proxy) && env.NODE_USE_ENV_PROXY !== "1";
}

const q = (v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]/g, " ")}"`;

/** The curl argv + stdin config for one request. Pure. */
export function curlRequest(url, { method = "GET", headers = {}, timeoutMs = 90_000 } = {}) {
  const config = Object.entries(headers).map(([k, v]) => `header = ${q(`${k}: ${v}`)}`).join("\n") + "\n";
  const args = ["-sS", "-L", "--max-time", String(Math.max(1, Math.ceil(timeoutMs / 1000))),
    "-X", method, "-K", "-", "-o", "-", "-w", "%{stderr}\n__APEX_HTTP_CODE__%{http_code}", "--", url];
  return { args, config };
}

/** Status out of curl's stderr tail; null when curl wrote none. Pure. */
export function parseCurlStatus(stderr) {
  const m = /__APEX_HTTP_CODE__(\d{3})\s*$/.exec(String(stderr || ""));
  return m ? Number(m[1]) : null;
}

const response = (status, body) => ({
  status, ok: status >= 200 && status <= 299,
  arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  text: async () => body.toString("utf8"),
  json: async () => JSON.parse(body.toString("utf8")),
});

/**
 * curl-backed fetch. `spawnImpl` is injectable for tests.
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string,string>, signal?: AbortSignal, timeoutMs?: number }} [init]
 */
export function curlFetch(url, init = {}, spawnImpl = spawn) {
  const { args, config } = curlRequest(url, init);
  return new Promise((resolve, reject) => {
    const child = spawnImpl("curl", args, { stdio: ["pipe", "pipe", "pipe"] });
    const out = [], err = [];
    const onAbort = () => { child.kill("SIGKILL"); reject(init.signal.reason || new Error("aborted")); };
    if (init.signal) { if (init.signal.aborted) return onAbort(); init.signal.addEventListener("abort", onAbort, { once: true }); }
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => err.push(d));
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      init.signal?.removeEventListener?.("abort", onAbort);
      const stderr = Buffer.concat(err).toString("utf8");
      const status = parseCurlStatus(stderr);
      if (code !== 0 || !status) return reject(new Error(`curl: ${stderr.replace(/__APEX_HTTP_CODE__\d*\s*$/, "").trim() || `exit ${code}`}`));
      resolve(response(status, Buffer.concat(out)));
    });
    child.stdin.end(config);
  });
}

/** The fetch to use: curl when Node's own fetch would bypass the proxy. */
export function pickFetch(env = process.env) {
  return fetchBypassesProxy(env) ? (url, init) => curlFetch(url, init) : (...a) => globalThis.fetch(...a);
}

/** Drop-in fetch for GitHub API callers in tools/. */
export const proxyFetch = (url, init) => pickFetch()(url, init);
