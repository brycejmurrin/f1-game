// @doc Arg parser for tools/transcripts/cli.mjs — rejects unknown flags.
import { CliArgError, makeFlags } from "../../lib/cli-args.mjs";

export { CliArgError };

const KNOWN = [
  "--query", "-q",
  "--role",
  "--type",
  "--tool",
  "--json",
  "--context",
  "--out",
  "--help", "-h",
];

const ROLES = new Set(["user", "assistant", "tool"]);
const TYPES = new Set(["text", "thinking", "tool_use", "tool_result"]);

/**
 * @param {string[]} argv process.argv.slice(2)
 * @returns {{ help?: boolean, cmd?: string, paths: string[], query?: string,
 *   role?: string, type?: string, tool?: string, json?: boolean,
 *   context?: number, out?: string, error?: string }}
 */
export function parseArgs(argv) {
  if (!argv.length || argv[0] === "-h" || argv[0] === "--help" || argv[0] === "help") {
    return { help: true, paths: [] };
  }
  const cmd = argv[0];
  if (!["search", "export", "digest"].includes(cmd)) {
    return { error: `unknown command ${cmd}`, paths: [] };
  }
  const rest = argv.slice(1);
  if (rest.includes("-h") || rest.includes("--help")) {
    return { help: true, cmd, paths: [] };
  }
  let flags;
  try {
    flags = makeFlags(rest, KNOWN);
  } catch (e) {
    if (e instanceof CliArgError) return { error: e.message, paths: [], cmd };
    throw e;
  }
  const paths = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--json" || a === "-h" || a === "--help") continue;
    if (a.startsWith("--") || a === "-q") {
      const eq = a.indexOf("=");
      if (eq >= 0) continue;
      // value flags consume next token unless next is another flag
      if (a === "--json") continue;
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith("-")) i++;
      continue;
    }
    paths.push(a);
  }
  const role = flags.has("--role") ? flags.flag("--role") : undefined;
  const type = flags.has("--type") ? flags.flag("--type") : undefined;
  const tool = flags.has("--tool") ? flags.flag("--tool") : undefined;
  const query = flags.has("--query")
    ? flags.flag("--query")
    : flags.has("-q") ? flags.flag("-q") : undefined;
  const contextRaw = flags.has("--context") ? flags.flag("--context") : undefined;
  const out = flags.has("--out") ? flags.flag("--out") : undefined;

  if (role !== undefined && !ROLES.has(role)) {
    return { error: `--role must be user|assistant|tool (got ${role})`, paths, cmd };
  }
  if (type !== undefined && !TYPES.has(type)) {
    return { error: `--type must be text|thinking|tool_use|tool_result (got ${type})`, paths, cmd };
  }
  if (contextRaw !== undefined) {
    const n = Number(contextRaw);
    if (!Number.isInteger(n) || n < 0) {
      return { error: `--context needs a non-negative integer (got ${contextRaw})`, paths, cmd };
    }
  }
  if (cmd === "search" && (query === undefined || query === "")) {
    return { error: "search requires --query <str>", paths, cmd };
  }
  if (!paths.length) {
    return { error: `${cmd} requires at least one path`, paths, cmd };
  }
  return {
    cmd,
    paths,
    query,
    role,
    type,
    tool,
    json: flags.has("--json"),
    context: contextRaw !== undefined ? Number(contextRaw) : 0,
    out,
  };
}

export const USAGE = `Usage: node tools/transcripts/cli.mjs <command> [options] <paths...>

Stream Grok Bot ReadTranscript JSONL dumps (line-by-line; no SQLite / no UI).

Commands:
  search  <paths...> --query <str> [--role user|assistant|tool]
          [--type text|thinking|tool_use|tool_result] [--tool <name>]
          [--json] [--context N]
  export  <paths...> [--role ...] [--type ...] [--tool ...] [--out file|-]
  digest  <paths...>

Global:
  -h, --help     show this help

Exit: 0 ok, 1 unreadable path / I/O, 2 bad args.
Bad JSON lines are skipped; a stderr count is printed at the end.
`;
