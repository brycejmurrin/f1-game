// @doc Make structured GitHub requests with diagnostics, rate-limit cooldowns and token-safe arguments.
import { spawnSync } from "node:child_process";
import { REPO } from "../github-api.mjs";

const millis = (value) => typeof value === "number" ? value : Date.parse(value);
function parseResponse(output) {
  let rest = String(output || "").replace(/^\uFEFF/, ""), status = 0, headers = {};
  // gh --include emits HTTP headers even on a nonzero HTTP-error exit.
  while (/^HTTP\/\S+\s+\d{3}/.test(rest)) {
    const boundary = /\r?\n\r?\n/.exec(rest);
    if (!boundary) break;
    const lines = rest.slice(0, boundary.index).split(/\r?\n/);
    status = Number(lines.shift().match(/^HTTP\/\S+\s+(\d{3})/)[1]);
    headers = {};
    for (const line of lines) {
      const colon = line.indexOf(":");
      if (colon > 0) headers[line.slice(0, colon).toLowerCase()] = line.slice(colon + 1).trim();
    }
    rest = rest.slice(boundary.index + boundary[0].length);
  }
  let json = null, badJson = false;
  if (rest.trim()) { try { json = JSON.parse(rest); } catch { badJson = true; } }
  return { status, headers, json, text: rest, badJson };
}
const numeric = (value) => value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;

/** A synchronous bounded REST adapter. Cooldown is caller-owned ledger data: mutation is NOT persistence. */
export function createApi({ repo = REPO, run = spawnSync, now = Date.now, cooldown = {}, maxRequests = 100,
  quotaReserve = 10, etags = new Map(), env = process.env, timeoutMs = 30_000 } = {}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("Invalid GitHub repository");
  if (!Number.isInteger(maxRequests) || maxRequests < 1 || !Number.isInteger(quotaReserve) || quotaReserve < 0) throw new Error("Invalid API request budget");
  const clock = () => millis(typeof now === "function" ? now() : now);
  const metrics = { requests: 0, deferred: 0, cached: 0, errors: 0, byType: {} };
  const stateBlobs = new Map();
  function learnStateBlob(endpoint, body) {
    const prefix = endpoint.slice(0, endpoint.indexOf("/contents/"));
    stateBlobs.delete(prefix);
    if (body?.encoding === "none" && /^[a-f0-9]{40}$/.test(body.sha || "")) {
      stateBlobs.set(prefix, `${prefix}/git/blobs/${body.sha}`);
      if (stateBlobs.size > 32) stateBlobs.delete(stateBlobs.keys().next().value);
    }
  }
  function failure(type, message, extra = {}) {
    metrics.errors++; metrics.byType[type] = (metrics.byType[type] || 0) + 1;
    return { status: 0, json: null, error: message, errorType: type, retryable: false, ...extra };
  }
  function deferUntil(until, reason) {
    if (until > (Number(cooldown.notBefore) || 0)) { cooldown.notBefore = until; cooldown.reason = reason; }
  }
  function request(path, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    let endpoint = String(path || "");
    if (/^https?:\/\//.test(endpoint)) {
      if (!endpoint.startsWith("https://api.github.com/")) return failure("invalid-request", "Only GitHub API URLs are accepted");
      endpoint = endpoint.slice("https://api.github.com/".length);
    }
    endpoint = endpoint.replace(/^\//, "");
    if (!endpoint.startsWith("repos/")) endpoint = `repos/${repo}/${endpoint}`;
    const time = clock();
    // Explicit Contents writes can attempt to persist a cooldown using reserved quota.
    // No caller can silently bypass a cooldown for discovery or workflow dispatch.
    const stateWrite = options.storeWrite === true && ["PUT", "PATCH", "DELETE"].includes(method) && /^repos\/[^/]+\/[^/]+\/contents\//.test(endpoint);
    const canonicalState = method === "GET" && /^repos\/[^/]+\/[^/]+\/contents\/state\.json\?ref=bot(?:%2[fF]|\/)actions-state$/.test(endpoint);
    const stateRead = options.storeRead === true && method === "GET"
      && (canonicalState || [...stateBlobs.values()].includes(endpoint));
    if (Number(cooldown.notBefore) > time && !((stateWrite || stateRead) && options.bypassCooldown === true)) {
      metrics.deferred++;
      return failure("cooldown", `GitHub API deferred until ${new Date(Number(cooldown.notBefore)).toISOString()}`, { deferred: true, retryable: true, notBefore: cooldown.notBefore });
    }
    const localLimit = maxRequests + (stateWrite || stateRead ? quotaReserve : 0);
    if (metrics.requests >= localLimit && options.bypassBudget !== true) {
      metrics.deferred++;
      return failure("budget", "GitHub API cycle request budget exhausted", { deferred: true, retryable: true });
    }
    const cached = method === "GET" && etags ? etags.get(endpoint) : null;
    const args = ["api", "--include", "--method", method, endpoint, "-H", "Accept: application/vnd.github+json", "-H", "X-GitHub-Api-Version: 2022-11-28", "-H", "Cache-Control: no-cache"];
    if (cached?.etag) args.push("-H", `If-None-Match: ${cached.etag}`);
    let input;
    if (options.body !== undefined) { input = JSON.stringify(options.body); args.push("--input", "-"); }
    metrics.requests++;
    let child;
    try { child = run("gh", args, { encoding: "utf8", env, timeout: timeoutMs, maxBuffer: 128 << 20, ...(input !== undefined ? { input } : {}) }); }
    catch { deferUntil(time + 5000, "transport"); return failure("transport", "GitHub API process failed", { retryable: true }); }
    const response = parseResponse(child.stdout);
    const { headers, status } = response;
    const remaining = numeric(headers["x-ratelimit-remaining"]), reset = numeric(headers["x-ratelimit-reset"]);
    const retryValue = headers["retry-after"];
    const retryAfter = retryValue ? (numeric(retryValue) ?? Math.max(0, (Date.parse(retryValue) - time) / 1000)) : null;
    const metadata = { status, headers, remaining, reset, retryAfter, requestId: headers["x-github-request-id"] || null, json: response.json, text: response.text };
    metrics.lastRemaining = remaining; metrics.lastReset = reset;
    if (remaining !== null && remaining <= quotaReserve && reset !== null && reset * 1000 > time) deferUntil(reset * 1000, "quota-reserve");
    if (status === 304 && cached) {
      if (canonicalState) learnStateBlob(endpoint, cached.json);
      metrics.cached++; return { ...metadata, status: 200, json: cached.json, cached: true };
    }
    if (status >= 200 && status < 300) {
      if (response.badJson) return failure("invalid-json", "GitHub API returned invalid JSON", metadata);
      if (canonicalState) learnStateBlob(endpoint, response.json);
      if (method === "GET" && etags && headers.etag) {
        etags.delete(endpoint); etags.set(endpoint, { etag: headers.etag, json: response.json });
        if (etags.size > 256) etags.delete(etags.keys().next().value);
      }
      return metadata;
    }
    const message = String(response.json?.message || `GitHub API HTTP ${status || "unavailable"}`).slice(0, 1000);
    let type = "http", retryable = false;
    if (!status) { type = "transport"; retryable = true; deferUntil(time + 5000, type); }
    else if ((status === 403 || status === 429) && (remaining === 0 || /API rate limit exceeded/i.test(message))) { type = "primary-rate-limit"; retryable = true; deferUntil(Math.max(time + 60_000, (reset || 0) * 1000, time + (retryAfter || 0) * 1000), type); }
    else if (status === 429 || (status === 403 && (/secondary rate|abuse detection|rate limit/i.test(message) || retryAfter !== null))) { type = "secondary-rate-limit"; retryable = true; deferUntil(time + Math.max(60, retryAfter || 0) * 1000, type); }
    else if (status === 403 || status === 401) type = "permission";
    else if (status >= 500) { type = "transient"; retryable = true; deferUntil(time + Math.max(5, retryAfter || 0) * 1000, type); }
    return failure(type, message, { ...metadata, retryable });
  }
  request.metrics = metrics;
  request.cooldown = cooldown;
  return request;
}
