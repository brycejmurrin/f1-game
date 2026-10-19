#!/usr/bin/env node
/**
 * @doc Generates the agent output catalog from tools, npm scripts and configured MCP routes; --check detects drift.
 * @skill agent-config
 * Static inventory only: never imports or executes candidate commands or discovers remote schemas.
 *
 * On-disk catalog stays compact: policy preserve text lives only in policies.json,
 * agentCommand is reconstructed from runner+interpreter+path, and empty optional
 * fields are omitted. `collect()` returns that compact shape; helpers expand it.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, argGate, emit, isMain } from "./gen-lib.mjs";
import { walkTools } from "./gen-tools-readme.mjs";

export const TARGET = "docs/agent-output/catalog.json";
export const LEVELS = ["compact", "diagnostic", "full"];
export const RUNNER = ["node", "tools/agent-run.mjs", "--"];
const OUTPUT_FLAGS = /(?<![\w-])--(?:quiet|verbose|concise|summary|json|full|detail|out|limit|offset|failures-only|stream|format|output-level)(?![\w-])/g;
const interpreter = { ".mjs": "node", ".cjs": "node", ".js": "node", ".py": "python3", ".sh": "bash" };
const POLICIES = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/agent-output/policies.json"), "utf8"));

/** Resolve a tool policy row; `@name` preserve strings look up policies.contracts. */
export function resolveToolPolicy(policies, toolPath) {
  const raw = policies?.tools?.[toolPath];
  if (!raw) return null;
  let preserve = raw.preserve;
  if (typeof preserve === "string" && preserve.startsWith("@")) {
    const key = preserve.slice(1);
    const contract = policies.contracts?.[key];
    if (contract === undefined) throw new Error(`docs/agent-output/policies.json: missing contracts.${key} for ${toolPath}`);
    preserve = contract;
  }
  return { action: raw.action, presentation: raw.presentation, preserve };
}

/** Evidence for a possible entrypoint, not a guarantee of safe/default execution. */
export function classify(file, source, npmNames = []) {
  const ext = path.extname(file);
  if (ext === ".json") return { classification: "data", evidence: [] };
  if (![".mjs", ".cjs", ".js", ".py", ".sh"].includes(ext)) return { classification: "asset", evidence: [] };
  const evidence = [];
  if (/require\.main\s*===\s*module|\bisMain\s*\(\s*import\.meta\.url\s*\)|import\.meta\.url\s*===|pathToFileURL\(process\.argv\[1\]\)/.test(source)) evidence.push("main-guard");
  if (npmNames.length) evidence.push("npm-script-reference");
  if (!file.startsWith("lib/") && /process\.argv|sys\.argv|argparse\.|ArgumentParser/.test(source)) evidence.push("argv-or-parser");
  if (/^#!/.test(source) && [".sh", ".py"].includes(ext)) evidence.push("shell-or-python-shebang");
  if (evidence.length) return { classification: "entrypoint-candidate", evidence };
  return { classification: file.startsWith("lib/") ? "library" : "ambiguous", evidence: [] };
}

/** Expand the compact catalog row into the argv the terminal wrapper would run. */
export function agentCommandFor(row, runner = RUNNER) {
  if (row.classification === "entrypoint-candidate" && row.interpreter) {
    return [...runner, row.interpreter, row.path];
  }
  return undefined;
}

export function npmAgentCommand(name, runner = RUNNER) {
  return [...runner, "npm", "run", name];
}

export function collect({ files = walkTools(), read = file => fs.readFileSync(path.join(ROOT, file), "utf8"),
  scripts, servers, policies = POLICIES } = {}) {
  scripts ??= JSON.parse(read("package.json")).scripts;
  servers ??= JSON.parse(read(".mcp.json")).mcpServers;
  const npmScripts = Object.keys(scripts).sort().map(name => ({ name, command: scripts[name] }));
  const tools = [...files].sort().map(file => {
    const fullPath = `tools/${file}`, source = read(fullPath);
    const npm = npmScripts.filter(row => row.command.includes(fullPath)).map(row => row.name);
    const kind = classify(file, source, npm);
    const policy = resolveToolPolicy(policies, fullPath);
    if (policy?.action === "protocol-only" && kind.classification === "entrypoint-candidate") {
      kind.classification = "protocol-entrypoint";
    }
    const flags = [...new Set(source.match(OUTPUT_FLAGS) ?? [])].sort();
    const row = { path: fullPath, classification: kind.classification };
    if (policy) row.outputPolicy = policy.action;
    if (kind.classification === "entrypoint-candidate") {
      row.interpreter = interpreter[path.extname(file)];
    }
    if (flags.length) row.nativeOutputFlagMentions = flags;
    if (npm.length) row.npmScripts = npm;
    return row;
  });
  const mcpRoutes = Object.keys(servers).sort().map(name => {
    const server = servers[name], args = server.args ?? [];
    const row = {
      name,
      type: server.type ?? "stdio",
      command: server.command,
      args,
      gatewayConfigured: args.some(arg => /^tools\/mcp\/output-level-mcp\.(?:sh|mjs)$/.test(arg)),
    };
    if (server.timeout !== undefined) row.timeout = server.timeout;
    return row;
  });
  const classifications = {};
  for (const row of tools) classifications[row.classification] = (classifications[row.classification] ?? 0) + 1;
  return {
    generatedBy: "tools/gen/gen-output-surface.mjs",
    version: 2,
    runner: RUNNER,
    output: {
      levels: LEVELS,
      defaultLevel: "compact",
      cli: {
        runner: "tools/agent-run.mjs",
        option: "--output-level",
        invocation: "node tools/agent-run.mjs [--output-level compact|diagnostic|full] -- executable [native args...]",
        retrieval: "node tools/agent-run.mjs --read <artifact.path> [--offset N] [--limit N]",
      },
      mcp: {
        gateway: "tools/mcp/output-level-mcp.mjs",
        parameter: "outputLevel",
        retrievalTool: "output_read",
        scope: "all tools/list pages via gateway",
        collisionPolicy: "Gateway prefixes colliding outputLevel parameters and output_read names with underscores; inspect tools/list.",
      },
      coverage: "Wrapper presentation, not native verbosity flags. Reconstruct candidate argv as catalog.runner + interpreter + path (or npm run <name>). Protocol entrypoints keep exact native stdout and are never recommended through the terminal wrapper. Libraries, ambiguous modules and assets are not asserted to be executable commands. Preservation contracts live in docs/agent-output/policies.json (including @contract refs).",
      limitations: "Static evidence only; flag mentions may be comments or subcommand-specific. No candidate executes during generation. Host-owned tools and unconfigured MCP servers are outside this catalog.",
    },
    counts: { files: tools.length, classifications, npmScripts: npmScripts.length, configuredMcpServers: mcpRoutes.length },
    tools,
    npmScripts,
    mcpRoutes,
  };
}

export function render(options) { return JSON.stringify(collect(options), null, 2) + "\n"; }

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2), gated = argGate(argv);
  if (gated !== null) process.exitCode = gated;
  else {
    try {
      const content = render();
      if (!argv.includes("--check")) fs.mkdirSync(path.dirname(path.join(ROOT, TARGET)), { recursive: true });
      process.exitCode = emit(TARGET, content, argv);
    } catch (error) {
      process.stderr.write(String(error.message || error) + "\n");
      process.exitCode = 2;
    }
  }
}
