// Checks that every inline <script> in the top-level pages is allowed by that page's
// meta Content-Security-Policy hash list, and with --write rewrites the list to match.
//   node tools/csp-hashes.mjs          exit 1 and list each page whose hashes are stale
//   node tools/csp-hashes.mjs --write  recompute the hashes in place
// Run it after editing any inline script (including the import map): a stale hash makes
// the browser skip that script silently (AUDIT.md finding 1).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");
const CSP = /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/;
let stale = 0;

for (const page of readdirSync(root).filter((f) => f.endsWith(".html")).sort()) {
  const file = join(root, page);
  const html = readFileSync(file, "utf8");
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter((m) => !/\ssrc\s*=/.test(m[1]) && !/type="application\/(ld\+)?json"/.test(m[1]));
  const want = scripts.map((m) => "'sha256-" + createHash("sha256").update(m[2], "utf8").digest("base64") + "'");
  const meta = CSP.exec(html);
  if (!meta) {
    if (want.length) console.log(page + ": no CSP meta (" + want.length + " inline script(s) unrestricted)");
    continue;
  }
  const policy = meta[2];
  const dir = /(^|;\s*)script-src\s+([^;]*)/.exec(policy);
  if (!dir) { if (want.length) { stale++; console.log(page + ": no script-src directive"); } continue; }
  const sources = dir[2].trim().split(/\s+/);
  const have = sources.filter((s) => /^'sha(256|384|512)-/.test(s));
  const missing = want.filter((h) => !have.includes(h));
  const unused = have.filter((h) => !want.includes(h));
  if (!missing.length && !unused.length) { console.log(page + ": ok (" + want.length + " inline)"); continue; }
  stale++;
  console.log(page + ": " + missing.length + " missing, " + unused.length + " unused hash(es)");
  if (write) {
    const rest = sources.filter((s) => !/^'sha(256|384|512)-/.test(s));
    const at = Math.max(1, rest.indexOf("'self'") + 1);
    const next = [...rest.slice(0, at), ...want, ...rest.slice(at)].join(" ");
    const out = html.replace(CSP, (all, a, p, b) => a + p.replace(dir[2].trim(), next) + b);
    writeFileSync(file, out);
    console.log("  rewritten");
  }
}
if (stale && !write) process.exit(1);
