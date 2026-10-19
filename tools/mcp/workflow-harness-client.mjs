#!/usr/bin/env node
// @doc CLI client for bounded workflow-harness calls with file-based probe arguments.
import fs from "node:fs";
import { pathToFileURL } from "node:url";

function usage() { return "Usage: node tools/mcp/workflow-harness-client.mjs --endpoint FILE --id ID --tool TOOL (--args-file FILE | --args JSON) [--quiet] [--timeout-ms N]\nUse --args-file for probe JavaScript to avoid shell quoting errors.\n"; }
function parse(argv) { const o = {}, allowed=new Set(["endpoint","id","tool","args-file","args","timeout-ms"]); for (let i=0;i<argv.length;i++) { const a=argv[i]; if (a === "--help") { o.help=true; continue; } if (a === "--quiet") { o.quiet=true; continue; } if (!a.startsWith("--")) throw Error(`unexpected argument: ${a}`); const key=a.slice(2); if(!allowed.has(key)) throw Error(`unknown option: ${a}`); const value=argv[++i]; if (value === undefined || value.startsWith("--")) throw Error(`missing value for ${a}`); o[key] = value; } return o; }
export async function runClient(argv = process.argv.slice(2), io = process) {
  let o; try { o=parse(argv); if (o.help) { io.stdout.write(usage()); return 0; } if (!o.endpoint || !o.id || !o.tool || (!!o["args-file"] === !!o.args)) throw Error(usage().trim());
    const endpoint=JSON.parse(fs.readFileSync(o.endpoint,"utf8")), args=JSON.parse(o["args-file"] ? fs.readFileSync(o["args-file"],"utf8") : o.args);
    const timeout=+(o["timeout-ms"] || endpoint.clientTimeoutMs || 120_000); if (!Number.isFinite(timeout) || timeout < 100) throw Error("--timeout-ms must be at least 100");
    const response=await fetch(`http://${endpoint.host}:${endpoint.port}/call`,{method:"POST",headers:{"content-type":"application/json","x-workflow-token":endpoint.token},body:JSON.stringify({id:o.id,tool:o.tool,args}),signal:AbortSignal.timeout(timeout)});
    const row=await response.json(); if (!o.quiet || row.error) io.stdout.write(JSON.stringify(row)+"\n"); return response.ok && !row.error ? 0 : 1;
  } catch(e) { io.stderr.write(`${e.message}\n`); return 2; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runClient().then(c=>{process.exitCode=c;});
