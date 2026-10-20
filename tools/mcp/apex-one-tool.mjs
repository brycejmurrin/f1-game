// @doc Opt-in one-tool apex-tools surface: `apex {op, args}` instead of 41 apex_* tools (APEX_MCP_ONE_TOOL=1).
// @skill agent-config
/* apex-one-tool — a PROTOTYPE, off by default (docs/notes/MCP-SINGLE-TOOL-REDESIGN-2026-10-20.md).
 *
 * tools/list publishes ONE tool, `apex`, whose input is {op, args}: `op` is an
 * apex_* name without its prefix, `args` that tool's argument object. Calls route
 * to the same dispatch() as the apex_* tools, so per-op validation, the browser
 * lock and every refusal are unchanged; only the published schema moves into
 * `op:"help"` (apex_help) and the paired skill text in the note.
 *
 * NOT SAFE TO ENABLE BY DEFAULT YET: the subagent browser guard
 * (.claude/hooks/mcp-browser-guard.sh and settings.json's matcher) keys on the
 * TOOL NAME, so `mcp__apex-tools__apex` with op:"shot" passes it. It must read
 * tool_input.op first; isBrowserOp() below is the list it would need.
 */

export const ONE_TOOL = "apex";
const PREFIX = "apex_";

/** True when the one-tool surface is switched on for this process. */
export function oneToolEnabled(env = process.env, argv = process.argv) {
  return env.APEX_MCP_ONE_TOOL === "1" || argv.includes("--one-tool");
}

const opOf = (name) => name.slice(PREFIX.length);
// Kind "tree" but they can boot Chromium (a diagnostics probe, a browser job), so
// mcp-browser-guard.sh refuses them in a subagent too; keep this set equal to it.
const GUARDED_TREE = new Set(["apex_diagnostics", "apex_job_start"]);
const guarded = (t, kindOf) => kindOf(t) === "browser" || GUARDED_TREE.has(t.name);

/**
 * The single published tool. `catalog` entries need {name, kind}; the op enum and
 * the tree/browser split are derived from it, so they cannot drift from dispatch().
 */
export function oneToolListing(catalog, kindOf = (t) => t.kind) {
  const ops = catalog.map((t) => opOf(t.name));
  const browser = catalog.filter((t) => guarded(t, kindOf)).map((t) => opOf(t.name));
  const tree = ops.filter((o) => !browser.includes(o));
  return {
    name: ONE_TOOL,
    title: "Apex 26 · project tools",
    description:
      "Apex 26 repo tools (wraps tools/ CLIs with safe flags) in one call: {op, args}. " +
      "args is that op's argument object, validated server-side; op:\"help\" args:{tool:\"<op>\"} returns one op's full schema. " +
      `Tree ops (no lock): ${tree.join(", ")}. ` +
      `Browser-capable ops (op:"status" first; never inside a subagent): ${browser.join(", ")}.`,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["op"],
      properties: {
        op: { type: "string", enum: ops, description: "apex_* tool name without the apex_ prefix." },
        args: { type: "object", description: "Arguments for op; op:\"help\" {tool:op} shows the schema." },
      },
    },
    annotations: { title: "Apex 26 · project tools", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  };
}

/**
 * Map a one-tool call to the apex_* dispatch it stands for. Returns {name, args}
 * or {error, message} for a malformed call. A full apex_* op name is accepted too,
 * and apex_help's `tool` takes either form.
 */
export function routeOneTool(input, catalog) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "bad_args", message: "apex takes {op, args}" };
  // outputLevel never arrives here: tools/mcp/output-level-mcp.mjs strips it before forwarding.
  const extra = Object.keys(input).filter((k) => k !== "op" && k !== "args");
  if (extra.length) return { error: "bad_args", message: `apex takes {op, args}; unexpected ${extra.join(", ")} (put op arguments inside args)` };
  const { op } = input;
  if (typeof op !== "string" || !op) return { error: "bad_args", message: "op must be a non-empty string" };
  const name = op.startsWith(PREFIX) ? op : PREFIX + op;
  if (!catalog.some((t) => t.name === name)) {
    return { error: "unknown_op", message: `unknown op ${op}; one of: ${catalog.map((t) => opOf(t.name)).join(", ")}` };
  }
  const args = input.args ?? {};
  if (!args || typeof args !== "object" || Array.isArray(args)) return { error: "bad_args", message: "args must be an object" };
  const routed = { ...args };
  if (name === "apex_help" && typeof routed.tool === "string" && !routed.tool.startsWith(PREFIX)) routed.tool = PREFIX + routed.tool;
  return { name, args: routed };
}

/** The ops a subagent browser guard must refuse once it reads tool_input.op. */
export function isBrowserOp(input, catalog, kindOf = (t) => t.kind) {
  const r = routeOneTool(input, catalog);
  return !r.error && guarded(catalog.find((t) => t.name === r.name), kindOf);
}
