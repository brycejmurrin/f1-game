#!/usr/bin/env node
// @doc Local static server for the working tree on 127.0.0.1:3456 (replaces `npx serve`): no-store, no fd leak, pinned in-repo.
// @skill check-changes
//
//   node tools/serve.mjs [--port 3456] [--host 127.0.0.1]
//
// The same server the browser harnesses use (tools/lib/harness.mjs
// startStaticServer): builds the gitignored BUILT_PATHS first, serves with
// `Cache-Control: no-store` and the repo's MIME table, and closes every file
// stream with its response. Why not `npx serve`: it is not in package-lock.json
// (each container fetched an unpinned copy), and under a long browser session
// it leaked one open file per 304 and died with EMFILE after ~20k conditional
// requests, which surfaced in the page as "Module failed to load".
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { startStaticServer } from "./lib/harness.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const USAGE = "usage: node tools/serve.mjs [--port 3456] [--host 127.0.0.1]";

export function parseServeArgs(argv) {
  const out = { port: 3456, host: "127.0.0.1", help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") { out.help = true; continue; }
    const m = /^--(port|host)(?:=(.*))?$/.exec(a);
    if (!m) return { error: `unknown argument ${a}` };
    const v = m[2] !== undefined ? m[2] : argv[++i];
    if (v === undefined || v === "") return { error: `--${m[1]} needs a value` };
    if (m[1] === "port") {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 65535) return { error: `--port must be 0-65535, got ${v}` };
      out.port = n;
    } else out.host = v;
  }
  return out;
}

export async function serve({ port = 3456, host = "127.0.0.1", root = ROOT } = {}) {
  return startStaticServer(root, { port, host });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = parseServeArgs(process.argv.slice(2));
  if (a.error) { console.error(`serve: ${a.error}\n${USAGE}`); process.exit(2); }
  if (a.help) { console.log(USAGE); process.exit(0); }
  const srv = await serve(a);
  const keep = setInterval(() => {}, 1 << 30);   // startStaticServer unrefs its server; the CLI must stay up
  console.log(`serve: ${srv.url} (root ${ROOT}; Ctrl-C stops)`);
  const stop = () => { clearInterval(keep); Promise.resolve(srv.close && srv.close()).finally(() => process.exit(0)); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
