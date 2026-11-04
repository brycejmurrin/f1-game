// @doc MCP 2026-07-28 helpers shared by the stdio servers: server/discover, per-request _meta, resultType, cache hints.
/**
 * Dual-stack support. A request that carries `_meta["io.modelcontextprotocol/protocolVersion"]` is a
 * 2026-07-28 request: it is served statelessly and its result gets `resultType` (plus `ttlMs`/`cacheScope`
 * on list/read results). A request without it is served exactly as before (2025-06-18 and older, `initialize`
 * handshake), byte for byte. Spec: https://modelcontextprotocol.io/specification/2026-07-28/basic/lifecycle
 */
export const MODERN = "2026-07-28";
export const META_VERSION = "io.modelcontextprotocol/protocolVersion";
export const META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";
const CACHEABLE = new Set(["tools/list", "resources/list", "resources/templates/list", "resources/read", "server/discover"]);
const TTL_MS = 3600000;

/** The protocol version a request declares in its `_meta`, or undefined for a legacy request. */
export function requestedVersion(msg) {
  const v = msg && msg.params && msg.params._meta && msg.params._meta[META_VERSION];
  return typeof v === "string" ? v : undefined;
}

/** UnsupportedProtocolVersionError (code -32022) for a modern request naming a version we do not speak, else null. */
export function versionError(msg, supported) {
  const requested = requestedVersion(msg);
  if (requested === undefined || supported.includes(requested)) return null;
  return { jsonrpc: "2.0", id: Object.hasOwn(msg, "id") ? msg.id : null,
    error: { code: -32022, message: "Unsupported protocol version", data: { supported, requested } } };
}

/** The server/discover reply. `info` is {name, version}; `capabilities` and `instructions` match initialize. */
export function discoverResult(id, supported, { capabilities, info, instructions }) {
  return { jsonrpc: "2.0", id, result: {
    resultType: "complete", supportedVersions: supported, capabilities,
    _meta: { [META_SERVER_INFO]: info },
    ...(instructions ? { instructions } : {}),
    ttlMs: TTL_MS, cacheScope: "private" } };
}

/** Decorate a successful response for a modern request; legacy requests and errors pass through untouched. */
export function modernize(msg, response) {
  if (!response || !response.result || requestedVersion(msg) !== MODERN) return response;
  const out = { ...response.result };
  if (out.resultType === undefined) out.resultType = "complete";
  if (CACHEABLE.has(msg.method)) { out.ttlMs ??= TTL_MS; out.cacheScope ??= "private"; }
  return { ...response, result: out };
}
