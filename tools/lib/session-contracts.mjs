// @doc Normalize hosted tool envelopes and diagnose session capability prerequisites without calling remote services.
// @skill check-changes
/** Hosted connector implementation is upstream. These adapters keep local
 * consumers honest about response data, readiness and file transport.
 * MCP result contract: https://modelcontextprotocol.io/specification/2025-11-25/server/tools */

const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
export const ORCHESTRATION_TOOLS = Object.freeze([
  "functions.exec", "functions.wait", "functions.request_user_input", "functions.request_user_input_async",
  "collaboration.spawn_agent", "collaboration.followup_task", "collaboration.interrupt_agent",
  "collaboration.list_agents", "collaboration.send_message", "collaboration.wait_agent",
]);

/** Prefer structured payloads over reassuring outer text; preserve errors at
 * every nesting level. Bounded traversal also accepts legacy JSON text. */
export function normalizeToolResult(value, { maxDepth = 8 } = {}) {
  if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 32) throw new TypeError("maxDepth must be 1..32");
  let current = value, error = false, depth = 0;
  const seen = new Set();
  while (depth < maxDepth) {
    if (typeof current === "string") {
      try { current = JSON.parse(current); depth++; continue; } catch { break; }
    }
    if (!record(current) || seen.has(current)) break;
    seen.add(current);
    error ||= current.isError === true || current.ok === false;
    if (current.structuredContent != null) { current = current.structuredContent; depth++; continue; }
    if (Array.isArray(current.content)) {
      const texts = current.content.filter((b) => b?.type === "text" && typeof b.text === "string");
      const payloads = texts.flatMap((b) => { try { return [JSON.parse(b.text)]; } catch { return []; } });
      // Never arbitrarily select between different valid payloads.
      if (payloads.length === 1) { current = payloads[0]; depth++; continue; }
      if (texts.length === 1 && payloads.length === 0) current = texts[0].text;
    }
    break;
  }
  error ||= record(current) && (current.ok === false || current.isError === true);
  const truncated = depth === maxDepth;
  return { ok: !error && !truncated, data: current, depth, truncated };
}

/** Conflicting installation observations are not authorization or readiness. */
export function reconcilePluginState(dependenciesResult, permissionsResults = []) {
  if (!Array.isArray(permissionsResults)) throw new TypeError("permissionsResults must be an array");
  const dependency = normalizeToolResult(dependenciesResult);
  const d = record(dependency.data) ? dependency.data : {};
  const id = typeof d.source_plugin_id === "string" ? d.source_plugin_id : null;
  const aliases = new Set([id, d.source_plugin_name].filter((v) => typeof v === "string").map((v) => v.toLowerCase()));
  const observations = [];
  if (dependency.ok && typeof d.source_plugin_installed === "boolean") observations.push({ source: "dependencies", installed: d.source_plugin_installed });
  for (const result of permissionsResults) {
    const p = normalizeToolResult(result);
    if (!p.ok || !record(p.data) || !aliases.has(String(p.data.app_id).toLowerCase())) continue;
    if (p.data.status === "not_installed") observations.push({ source: "permissions", installed: false });
    else if (p.data.status === "installed" || p.data.installed === true) observations.push({ source: "permissions", installed: true });
  }
  const states = new Set(observations.map((v) => v.installed));
  const conflict = states.size > 1;
  return { id, state: conflict ? "conflict" : states.size ? [...states][0] ? "installed" : "not_installed" : "unknown",
    installed: states.size === 1 ? [...states][0] : null,
    enabled: dependency.ok && typeof d.source_plugin_user_enabled === "boolean" ? d.source_plugin_user_enabled : null,
    ready: !conflict && states.size === 1 && states.has(true) && d.source_plugin_user_enabled === true,
    observations, fix: conflict ? "Recheck both services using the canonical plugin ID; do not infer permission from installed metadata." : null };
}

/** Produce file-reference transport args for the connected Drive fetch tool;
 * no credentials, fetches, or caller instruction routing are involved. */
export function driveFileReferenceArgs(args) {
  if (!record(args) || typeof args.url !== "string" || !args.url) throw new TypeError("Drive fetch requires a URL");
  const url = new URL(args.url);
  if (url.protocol !== "https:" || !["drive.google.com", "docs.google.com"].includes(url.hostname)) throw new TypeError("Expected an HTTPS Google Drive/Docs/Sheets/Slides URL");
  if (args.include_base64 === true) throw new TypeError("Inline base64 conflicts with file-reference transport");
  return { ...args, download_raw_file: true, include_base64: false };
}

/** Explicit document routing inputs prevent stale blanket import policies.
 * Existing native templates keep native topology. Net-new Slides use the
 * Presentations workflow; this is routing metadata, not a document write. */
export function documentCreationRoute({ kind, templateId = null, referenceId = null, basic = false } = {}) {
  if (!["docs", "slides"].includes(kind)) throw new TypeError("kind must be docs or slides");
  for (const [name, value] of Object.entries({ templateId, referenceId })) {
    if (value != null && (typeof value !== "string" || !value.trim())) throw new TypeError(`${name} must be a nonempty native file ID`);
  }
  if (typeof basic !== "boolean") throw new TypeError("basic must be a boolean");
  if (templateId) return { workflow: `google-${kind}`, route: "native-copy", sourceId: templateId, preserveTopology: true };
  if (referenceId) return { workflow: `google-${kind}`, route: "native-reference", sourceId: referenceId, preserveTopology: true };
  if (kind === "slides") return { workflow: "presentations", route: "net-new", preserveTopology: false };
  return { workflow: "google-docs", route: basic ? "native-create" : "docx-import", preserveTopology: false };
}

/** Catalog inspection never treats Browser Use as deterministic Browser APIs
 * and never treats skipped/missing hosted prerequisites as working tools. */
export function analyzeSessionCatalog(input) {
  const tools = Array.isArray(input) ? input : input?.tools;
  const skills = Array.isArray(input?.skills) ? input.skills : [];
  if (!Array.isArray(tools)) throw new TypeError("catalog must be a tool array or {tools,skills}");
  const names = [], seen = new Set(), duplicates = [], invalid = [];
  for (const t of tools) {
    if (!record(t) || typeof t.name !== "string" || !t.name) { invalid.push("A tool entry lacks a name"); continue; }
    if (seen.has(t.name)) duplicates.push(t.name);
    else { seen.add(t.name); names.push(t.name); }
  }
  const skillNames = skills.map((s) => typeof s === "string" ? s : s?.name).filter(Boolean);
  const deterministicBrowser = skillNames.some((s) => /^(?:.*:)?(?:browser|control-browser)$/.test(s))
    && names.some((n) => /(?:node_repl|browser_snapshot|browser_evaluate)/.test(n));
  const browserUse = names.some((n) => n.includes("browser_use_"));
  const cancellation = names.some((n) => /browser_use_.*cancel/.test(n));
  const library = names.some((n) => /(?:^|__)library_/.test(n));
  const warnings = [];
  const resources = Array.isArray(input?.resources) ? input.resources : [];
  for (const resource of resources) {
    if (record(resource) && resource.ok === false && typeof resource.uri === "string") warnings.push({
      code: "SKILL_RESOURCE_UNREADABLE", uri: resource.uri,
      fix: "Retry with the resource's owning skill package; a remaining failure needs provider packaging repair or a repository-owned equivalent.",
    });
  }
  for (const skill of skills) {
    if (record(skill) && skill.requiresFilesystem === true && !skill.skill_root) warnings.push({
      code: "SKILL_HELPER_MOUNT_UNKNOWN", skill: skill.name,
      fix: "Require an explicit mounted helper root or materialize the authorized helper sources; do not invent a filesystem path for a skill URI.",
    });
    if (record(skill) && typeof skill.body === "string" && /!`[^`]*npx\s/.test(skill.body)) warnings.push({
      code: "SKILL_CONTEXT_UNEXPANDED", skill: skill.name,
      fix: "Inspect the repository and run the documented trusted context command explicitly; this literal template is not injected project data.",
    });
  }
  if (skillNames.includes("build-web-apps:frontend-app-builder") && !skillNames.some((s) => /^(?:.*:)?imagegen$/.test(s))
      && names.some((n) => /^image_gen__/.test(n))) warnings.push({
    code: "IMAGEGEN_TOOL_INSTRUCTIONS", fix: "Use the exposed image-generation tool contract; do not invent an absent imagegen skill path.",
  });
  if (browserUse && !deterministicBrowser) warnings.push({ code: "BROWSER_PRIMITIVES_ABSENT", fix: "Use the repository Playwright harness for local DOM, console and frame assertions." });
  if (browserUse && !cancellation) warnings.push({ code: "BROWSER_CANCEL_ABSENT", fix: "Use bounded runs and the provider's run status; the catalog does not expose a cancellation action." });
  if (skillNames.some((s) => /^work-pets:/.test(s)) && !library) warnings.push({ code: "PETS_LIBRARY_ABSENT", fix: "Verify supported Library persistence before creating a pet; local files do not replace the required hosted artifact." });
  const returnShapes = tools.filter((t) => typeof t?.description === "string" && /Promise<(?:unknown|CallToolResult)>/.test(t.description)).map((t) => t.name);
  if (returnShapes.length) warnings.push({ code: "OUTPUT_SCHEMA_UNSPECIFIED", count: returnShapes.length, fix: "Normalize MCP envelopes and validate the operation's payload before reading fields." });
  const knownOrchestration = new Set(names.filter((n) => ORCHESTRATION_TOOLS.includes(n)));
  return { ok: invalid.length === 0 && duplicates.length === 0, tools: names.length, invalid, duplicates,
    capabilities: { deterministicBrowser, browserUse, browserCancellation: cancellation, library },
    omittedOrchestration: ORCHESTRATION_TOOLS.filter((n) => !knownOrchestration.has(n)), warnings,
    upstreamOnly: ["Hosted plugin installation and permission state", "Hosted tool schemas and cancellation endpoints", "Remote skill resource packaging and mounted helper paths"] };
}
