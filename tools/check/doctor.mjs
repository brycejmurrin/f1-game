#!/usr/bin/env node
// @doc Read-only YAML/refs/mirrors/browser/deps doctor; --json and optional --catalog FILE. No browser or network.
// @skill check-changes
// YAML API: https://eemeli.org/yaml/#parsing-documents
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parseDocument } from "yaml";
import { resolveChromium, executableFile, browserCacheResolution } from "../lib/chromium-path.mjs";
import { analyzeSessionCatalog, reconcilePluginState } from "../lib/session-contracts.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const MAX_BYTES = 2 * 1024 * 1024;
const safeName = (s) => typeof s === "string" && /^[\w.:/@ -]{1,200}$/.test(s) ? s : "(unnamed)";
function read(file) {
  if (fs.statSync(file).size > MAX_BYTES) throw new Error("file exceeds 2 MiB inspection limit");
  return fs.readFileSync(file, "utf8");
}
function filesBelow(dir, extension, limit = 2000) {
  const files = [];
  function visit(base) {
    for (const entry of fs.readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(base, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && (!extension || extension.test(entry.name))) files.push(file);
      if (files.length > limit) throw new Error("inspection file limit exceeded");
    }
  }
  if (fs.existsSync(dir)) visit(dir);
  return files;
}
function inside(root, file) {
  const rel = path.relative(root, file);
  return rel === "" || (rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel));
}
function resourceState(resource, root) {
  if (!resource || typeof resource !== "object") return "unverified";
  if (resource.available === false || resource.resource_available === false || resource.exists === false
      || resource.resource_failed === true || resource.ok === false || resource.isError === true
      || ["missing", "failed", "unavailable"].includes(resource.status)) return "missing";
  const locator = resource.path ?? resource.uri;
  if (typeof locator !== "string" || !locator) return "unverified";
  let file;
  if (/^file:/i.test(locator)) {
    try { file = fileURLToPath(locator); } catch { return "unverified"; }
  } else if (/^[a-z][\w+.-]*:/i.test(locator)) return "remote";
  else file = path.resolve(root, locator);
  return fs.existsSync(file) ? "local-present" : "missing";
}

/** Pure inspections only: no child process, network, npm install or browser. */
export function diagnose({ root = ROOT, catalog, env = process.env } = {}) {
  root = path.resolve(root);
  const checks = [];
  const add = (id, status, message, details) => checks.push({ id, status, message, ...(details ? { details } : {}) });
  add("runtime.node", Number(process.versions.node.split(".")[0]) >= 20 ? "pass" : "fail", "Node 20+ is required");
  if (!fs.existsSync(path.join(root, "package.json"))) {
    add("tree.root", "fail", "Root has no package.json");
  } else {
    try {
      const pkg = JSON.parse(read(path.join(root, "package.json")));
      const require = createRequire(path.join(root, "package.json"));
      const missing = [];
      for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).sort()) {
        try { require.resolve(name); } catch { missing.push(safeName(name)); }
      }
      add("runtime.dependencies", missing.length ? "fail" : "pass", missing.length ? "Declared dependencies are missing; run npm install" : "Declared dependencies resolve", { missing });
    } catch { add("tree.package", "fail", "Cannot read a valid package.json"); }
  }

  const skillsDir = path.join(root, ".claude/skills");
  const mirrorDir = path.join(root, ".agents/skills");
  const names = new Set();
  try {
    if (!fs.existsSync(skillsDir)) add("skills.root", "fail", "Missing .claude/skills directory");
    else for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = entry.name;
      names.add(name);
      const dir = path.join(skillsDir, name);
      const file = path.join(dir, "SKILL.md");
      try {
        const text = read(file);
        const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
        if (!match) throw new Error("Missing YAML frontmatter");
        const doc = parseDocument(match[1], { uniqueKeys: true });
        if (doc.errors.length) {
          add(`skills.${name}.yaml`, "fail", "Invalid skill YAML frontmatter", { codes: doc.errors.map((e) => e.code) });
        } else {
          const fm = doc.toJS({ maxAliasCount: 20 });
          const valid = fm && !Array.isArray(fm) && fm.name === name && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fm.name)
            && typeof fm.description === "string" && fm.description.trim().length > 0 && fm.description.length <= 1024;
          add(`skills.${name}.yaml`, valid ? "pass" : "fail", valid ? "Valid YAML name/description" : "Skill name/description fails schema or folder match");
        }
      } catch { add(`skills.${name}.yaml`, "fail", "Skill frontmatter is missing, unreadable or exceeds bounds"); }

      for (const resource of filesBelow(dir, /\.md$/)) {
        const text = read(resource);
        const broken = [];
        // Markdown destinations, including images and optional link titles.
        for (const match of text.matchAll(/\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^)]*)?\s*\)/g)) {
          let target = match[1].replace(/^<|>$/g, "");
          if (/^(?:[a-z][\w+.-]*:|#|\/\/)/i.test(target)) continue;
          try { target = decodeURIComponent(target.split(/[?#]/)[0]); } catch { broken.push("Malformed local destination"); continue; }
          if (!target) continue;
          const resolved = path.resolve(path.dirname(resource), target);
          if (!inside(root, resolved) || !fs.existsSync(resolved)) broken.push(safeName(target));
        }
        add(`skills.${name}.refs.${path.relative(dir, resource).replaceAll(path.sep, "/")}`, broken.length ? "fail" : "pass", broken.length ? "Missing or outside-root local references" : "Local Markdown references exist", { missing: broken });
      }
      try {
        const mirror = path.join(mirrorDir, name);
        const stat = fs.lstatSync(mirror);
        if (stat.isSymbolicLink()) {
          const valid = fs.readlinkSync(mirror) === `../../.claude/skills/${name}` && fs.realpathSync(mirror) === fs.realpathSync(dir);
          add(`skills.${name}.mirror`, valid ? "pass" : "fail", valid ? "Canonical mirror link resolves" : "Mirror link has a wrong target");
        } else if (stat.isDirectory()) {
          const sourceFiles = filesBelow(dir);
          const mirrorFiles = filesBelow(mirror);
          const valid = sourceFiles.length === mirrorFiles.length && sourceFiles.every((f) => {
            const other = path.join(mirror, path.relative(dir, f));
            return fs.existsSync(other) && read(f) === read(other);
          });
          add(`skills.${name}.mirror`, valid ? "pass" : "fail", valid ? "Copy mirror matches canonical resources" : "Copy mirror contents differ");
        } else add(`skills.${name}.mirror`, "fail", "Mirror is neither a symlink nor a directory");
      } catch { add(`skills.${name}.mirror`, "fail", "Missing or broken mirror link"); }
    }
    if (fs.existsSync(mirrorDir)) {
      const stale = fs.readdirSync(mirrorDir).filter((name) => !names.has(name));
      add("skills.mirror.stale", stale.length ? "fail" : "pass", stale.length ? "Mirror contains retired entries" : "No retired mirror entries", { entries: stale.map(safeName) });
    }
  } catch { add("skills.inspection", "fail", "Skill resource inspection failed or exceeded bounds"); }

  const browser = resolveChromium({ env });
  add("runtime.browser", browser && executableFile(browser.path) ? "pass" : "warn", browser && executableFile(browser.path) ? "Chromium executable exists; live boot remains unverified" : "No usable Chromium found; run tools/env/install-browsers.sh", { source: browser?.source ? safeName(browser.source) : "absent", liveVerified: false });
  const cache = browserCacheResolution({ env });
  add("runtime.browser-cache", cache.configuredWritable ? "pass" : "warn",
    cache.configuredWritable ? "Configured browser cache is writable" : cache.selected
      ? "Configured browser cache is not writable; bootstrap will use the selected fallback"
      : "No writable browser cache; set PLAYWRIGHT_BROWSERS_PATH", cache);
  for (const command of ["python3", "tmux"]) {
    const present = (env.PATH || "").split(path.delimiter).filter(Boolean).some((dir) => executableFile(path.join(dir, command)));
    add(`runtime.${command}`, present ? "pass" : "warn", present ? `${command} is available` : `${command} is missing${command === "tmux" ? "; required by chrome-start/chrome-stop" : "; required by hooks and Python tools"}`);
  }
  try {
    const tools = filesBelow(path.join(root, "tools"), /\.(?:mjs|cjs|js|py|sh)$/).map((file) => {
      const header = read(file).split("\n").slice(0, 50).join("\n");
      return { path: path.relative(root, file).replaceAll(path.sep, "/"), documented: /@doc\s+\S/.test(header), skill: header.match(/@skill\s+([\w-]+)/)?.[1] || null };
    });
    add("tools.local-catalog", "pass", "Local tool inventory inspected without execution", { count: tools.length, tools });
  } catch { add("tools.local-catalog", "fail", "Tool inventory failed or exceeded bounds"); }

  if (catalog !== undefined) {
    try {
      const input = typeof catalog === "string" ? JSON.parse(read(path.resolve(catalog))) : catalog;
      const analysis = analyzeSessionCatalog(input);
      add("session.catalog", analysis.ok ? "pass" : "fail", "Supplied host catalog inspected; availability is not execution proof", analysis);
      for (const warning of analysis.warnings) add(`session.${warning.code}`, "warn", warning.fix, { count: warning.count });
      for (const [i, skill] of (input.skills || []).entries()) {
        if (!skill || typeof skill !== "object") continue;
        const resources = skill.resources || [];
        const states = [resourceState(skill, root), ...resources.map((r) => resourceState(r, root))];
        const missing = states.includes("missing"), remote = states.includes("remote");
        const unverified = remote || states.includes("unverified");
        add(`session.skill.${i}.resources`, missing || unverified ? "warn" : "pass", missing
          ? "Local resources are missing or supplied metadata reports unavailable resources"
          : remote ? "Remote skill resource locators remain unverified; no filesystem lookup or remote request was made"
          : unverified ? "Skill resource location was not supplied; availability remains unverified"
          : "Supplied local skill resources exist; execution remains unverified", {
          name: safeName(skill.name), verified: false, state: missing ? "missing" : unverified ? "unverified" : "local-present",
          remoteResources: states.filter((s) => s === "remote").length,
        });
      }
      for (const [i, connector] of (input.connectors || []).entries()) {
        const state = reconcilePluginState(connector.dependenciesResult ?? { source_plugin_id: connector.id, source_plugin_installed: connector.installed, source_plugin_user_enabled: connector.enabled }, connector.permissionsResults || []);
        add(`session.connector.${i}`, state.ready ? "pass" : "warn", state.ready ? "Connector metadata reports installed and enabled; live service unverified" : "Connector readiness is absent or contradictory", { state: state.state, enabled: state.enabled, ready: state.ready });
      }
    } catch { add("session.catalog", "fail", "Catalog must be readable bounded JSON: a tool array or {tools,skills,connectors}"); }
  } else add("session.catalog", "warn", "Host tool catalog was not supplied; use --catalog to inspect hosted capabilities");
  const summary = { pass: 0, warn: 0, fail: 0 };
  for (const check of checks) summary[check.status]++;
  return { ok: summary.fail === 0, mode: "tree", checks, summary };
}

export function doctorMain(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs({ args: argv, allowPositionals: false, options: {
      json: { type: "boolean" }, tree: { type: "boolean" }, root: { type: "string" }, catalog: { type: "string" }, help: { type: "boolean", short: "h" },
    } }).values;
  } catch (e) { console.error(e.message); return 2; }
  if (args.help) {
    console.log("Usage: node tools/check/doctor.mjs [--tree] [--json] [--root DIR] [--catalog FILE]\nRead-only: no browser, network, child processes, writes or installs.\nCatalog: tool array, or {tools:[{name,description}],skills:[{name,path,available,resources:[{path,exists}]}],connectors:[{id,installed,enabled,dependenciesResult,permissionsResults}]}.\nSecrets and credential values are never included in results.\nExit 0: no failures (warnings may remain); 1: failed checks; 2: invalid CLI.");
    return 0;
  }
  const result = diagnose({ root: args.root || ROOT, catalog: args.catalog });
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    for (const check of result.checks) if (check.status !== "pass") console.log(`${check.status.toUpperCase()} ${check.id}: ${check.message}`);
    console.log(`doctor: ${result.summary.pass} pass, ${result.summary.warn} warning, ${result.summary.fail} fail (tree only; live services unverified)`);
  }
  return result.ok ? 0 : 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = doctorMain();
