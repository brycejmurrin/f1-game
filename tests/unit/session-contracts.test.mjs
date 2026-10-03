import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSessionCatalog, documentCreationRoute, driveFileReferenceArgs, normalizeToolResult, reconcilePluginState } from "../../tools/lib/session-contracts.mjs";

test("nested hosted results use substantive payload and preserve outer errors", () => {
  const payload = { source_plugin_installed: true, source_plugin_id: "canonical" };
  const result = { content: [{ type: "text", text: "Action completed." }], structuredContent: { structuredContent: payload, isError: false } };
  assert.deepEqual(normalizeToolResult(result).data, payload);
  assert.equal(normalizeToolResult({ ...result, isError: true }).ok, false);
  assert.deepEqual(normalizeToolResult({ content: [{ type: "text", text: JSON.stringify(payload) }] }).data, payload);
  assert.equal(normalizeToolResult({ structuredContent: { ok: false, error: "refused" } }).ok, false);
});

test("conflicting canonical plugin observations are unresolved instead of ready", () => {
  const deps = { structuredContent: { source_plugin_id: "canonical", source_plugin_name: "example", source_plugin_installed: true, source_plugin_user_enabled: true } };
  const permissions = { structuredContent: { structuredContent: { app_id: "canonical", status: "not_installed" } } };
  const r = reconcilePluginState(deps, [permissions]);
  assert.equal(r.state, "conflict"); assert.equal(r.installed, null); assert.equal(r.ready, false);
  assert.equal(reconcilePluginState(deps, [{ structuredContent: { app_id: "other", status: "not_installed" } }]).ready, true);
  assert.equal(reconcilePluginState({ isError: true, structuredContent: deps.structuredContent }).state, "unknown");
});

test("file-reference Drive requests explicitly disable inline transport", () => {
  const r = driveFileReferenceArgs({ url: "https://docs.google.com/document/d/example/edit", raw_export_mime_type: "application/pdf" });
  assert.equal(r.include_base64, false); assert.equal(r.download_raw_file, true);
  assert.equal(r.raw_export_mime_type, "application/pdf");
  assert.throws(() => driveFileReferenceArgs({ url: "https://drive.google.com/file/d/x", include_base64: true }), /conflicts/);
  assert.throws(() => driveFileReferenceArgs({ url: "https://docs.google.com.evil.example/file" }), /Expected/);
});

test("Browser Use does not satisfy deterministic browser or cancel prerequisites", () => {
  const r = analyzeSessionCatalog({ tools: [{ name: "mcp__codex_apps__browser_use_automate_browser" }], skills: [{ name: "work-pets:create-pet" }] });
  assert.equal(r.capabilities.deterministicBrowser, false); assert.equal(r.capabilities.browserCancellation, false);
  assert.deepEqual(r.warnings.map((v) => v.code), ["BROWSER_PRIMITIVES_ABSENT", "BROWSER_CANCEL_ABSENT", "PETS_LIBRARY_ABSENT"]);
  assert.ok(r.omittedOrchestration.includes("collaboration.spawn_agent"));
  assert.equal(analyzeSessionCatalog([{ name: "x" }, { name: "x" }]).ok, false);
  assert.equal(analyzeSessionCatalog([null]).ok, false);
});

test("unreadable skill resources and required missing mounts stay explicit", () => {
  const r = analyzeSessionCatalog({ tools: [], skills: [{ name: "example", requiresFilesystem: true }], resources: [{ uri: "skill://example/references/game.md", ok: false }] });
  assert.deepEqual(r.warnings.map((v) => v.code), ["SKILL_RESOURCE_UNREADABLE", "SKILL_HELPER_MOUNT_UNKNOWN"]);
  assert.equal(analyzeSessionCatalog({ tools: [], skills: [{ name: "example" }] }).warnings.length, 0);
});

test("native templates and net-new documents use the current structural routes", () => {
  assert.equal(documentCreationRoute({ kind: "docs", basic: true }).route, "native-create");
  assert.equal(documentCreationRoute({ kind: "docs" }).route, "docx-import");
  assert.equal(documentCreationRoute({ kind: "slides" }).workflow, "presentations");
  assert.deepEqual(documentCreationRoute({ kind: "slides", templateId: "native", basic: true }), { workflow: "google-slides", route: "native-copy", sourceId: "native", preserveTopology: true });
  assert.throws(() => documentCreationRoute({ kind: "sheets" }), /kind/);
  assert.throws(() => documentCreationRoute({ kind: "docs", templateId: {} }), /templateId/);
});

test("literal injected context and absent skill aliases are not treated as ready data", () => {
  const r = analyzeSessionCatalog({ tools: [{ name: "image_gen__imagegen" }], skills: [
    { name: "build-web-apps:frontend-app-builder" }, { name: "shadcn", body: 'Context !`npx shadcn info --json`' },
  ] });
  assert.deepEqual(r.warnings.map((v) => v.code), ["SKILL_CONTEXT_UNEXPANDED", "IMAGEGEN_TOOL_INSTRUCTIONS"]);
});

test('bounded result traversal preserves an error at the boundary and rejects incomplete evidence', () => {
  const boundary = normalizeToolResult({ structuredContent: { isError: true } }, { maxDepth: 1 });
  assert.equal(boundary.ok, false);
  const concealed = normalizeToolResult({ structuredContent: { structuredContent: { ok: false } } }, { maxDepth: 1 });
  assert.equal(concealed.truncated, true);
  assert.equal(concealed.ok, false);
});

test("failed dependency enablement cannot grant readiness from a permissions observation", () => {
  const result = reconcilePluginState({ isError: true, structuredContent: {
    source_plugin_id: "canonical", source_plugin_user_enabled: true,
  } }, [{ app_id: "canonical", status: "installed" }]);
  assert.equal(result.state, "installed");
  assert.equal(result.enabled, null);
  assert.equal(result.ready, false);
});

test("ambiguous JSON content preserves the envelope and every explicit failure", () => {
  const envelope = { content: [
    { type: "text", text: '{"ok":true}' },
    { type: "text", text: '{"structuredContent":{"ok":false,"error":"operation refused"}}' },
  ] };
  const result = normalizeToolResult(envelope);
  assert.equal(result.data, envelope);
  assert.equal(result.ok, false);
  assert.equal(result.truncated, false);
  assert.equal(normalizeToolResult({ ...envelope, structuredContent: { ok: true } }).ok, false);
  const successful = { content: envelope.content.slice(0, 1).concat({ type: "text", text: '{"value":42}' }) };
  assert.equal(normalizeToolResult(successful).data, successful);
  assert.equal(normalizeToolResult(successful).ok, true);
});

test("cyclic and excessively wide envelopes cannot become successful evidence", () => {
  const cycle = {}; cycle.structuredContent = cycle;
  assert.equal(normalizeToolResult(cycle).ok, false);
  const wide = { content: Array.from({ length: 300 }, () => ({ type: "text", text: '{"ok":true}' })) };
  assert.equal(normalizeToolResult(wide).ok, false);
  assert.equal(normalizeToolResult(wide).truncated, true);
  const shared = { ok: true };
  assert.equal(normalizeToolResult({ structuredContent: shared, content: [{ type: "text", text: JSON.stringify(shared) }] }).ok, true);
});

test("required helper roots must be absolute filesystem paths", () => {
  for (const skill_root of ["skill://package/scripts", "https://example.test/helpers", "file:///helpers", "helpers", "", {}, "/helpers\0invalid"]) {
    const result = analyzeSessionCatalog({ tools: [], skills: [{ name: "example", requiresFilesystem: true, skill_root }] });
    assert.ok(result.warnings.some((w) => w.code === "SKILL_HELPER_MOUNT_UNKNOWN"), String(skill_root));
  }
  assert.equal(analyzeSessionCatalog({ tools: [], skills: [{ name: "example", requiresFilesystem: true, skill_root: "/mounted/helpers" }] }).warnings.length, 0);
});

test("resource-level receipts retain missing siblings when another reference recovers", () => {
  const result = analyzeSessionCatalog({ tools: [], skills: [{ name: "example", resources: [
    { uri: "skill://example/recovered.md", ok: true },
    { uri: "skill://example/still-missing.md", ok: false },
  ] }] });
  assert.deepEqual(result.warnings.filter((w) => w.code === "SKILL_RESOURCE_UNREADABLE").map((w) => w.uri), ["skill://example/still-missing.md"]);
});
