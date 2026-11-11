// @doc Deploy-only minify of the staged js/ (terser, names kept, unlinked .map), css/*.css and index.html (#5050).
// @skill check-changes
/**
 * minify.mjs — shrink the STAGED copy of js/**\/*.js, css/*.css and index.html,
 * never the source (the shell pass is at the end of this file, #5050).
 *
 * Runs inside stageSite() after the copy and before any stamp, so bump-cache's
 * ?v= content hashes and SRI digests cover the minified bytes (issue #3110
 * finding 1; docs/notes/STAGE-MINIFY-2026-10-19.md has the measurements).
 *
 * The options are chosen for what this codebase reads back out of itself:
 *   - compress: false. No constant folding, no dead-code drop, no `a["b"]` → `a.b`:
 *     only whitespace, comments and local names change.
 *   - mangle locals only (toplevel: false). Every file is a classic-script IIFE
 *     assigning one global, and top-level `const`/`function` names are shared
 *     across scripts (tools/manifest.cjs HARD_EDGES), so the top level stays.
 *   - keep_fnames + keep_classnames: Log tags, stack frames and any `fn.name`
 *     read stay readable.
 *   - keep_quoted_props + quote_style 3: String(fn) scans of scenery closures
 *     (js/core/lazy-bundles.js sceneryModels, js/track/build-client.js,
 *     js/track/build-worker.js → Assets.modelIds) find model ids as QUOTED
 *     literals; a `{ "id": … }` key must keep its quotes or the circuit loses
 *     its baked model. tests/unit/stage-minify.test.mjs pins every closure.
 *   - comments "some" (terser's default): @license / @preserve / /*! survive.
 * Options reference: https://terser.org/docs/api-reference/ and
 * https://github.com/terser/terser#format-options (terser pinned in package.json).
 *
 * Each minified file gets `<file>.map` next to it with NO sourceMappingURL
 * comment: the player never fetches it, a developer de-minifying a stack trace
 * from the live site points a tool at it (sources name the repo path).
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// terser is loaded on first use, not at import: desktop.yml's pack job and
// mobile/scripts/sync-web.mjs can run stage.mjs WITHOUT a root `npm ci`, and a
// static import would fail the whole stage there. What a missing terser does is
// `unminifiedPolicy`: a RELEASE build throws; a pull-request or local build
// ships source bytes and logs that choice (minifyStaged returns { skipped }).
// ci.yml staged-boot asserts the Pages stage really minified.
let _terser = null;
async function terser() {
  if (!_terser) _terser = await import("terser");
  return _terser;
}

/** Can this checkout minify (is terser resolvable)? */
export async function canMinify() {
  try { await terser(); return true; } catch (_) { return false; }
}

const PR_EVENTS = new Set(["pull_request", "pull_request_target", "merge_group"]);

/**
 * What a stage does when terser is missing. A release build is
 * APEX_RELEASE_BUILD=1, a tag ref, or any GitHub Actions event that is not a
 * pull request (push, workflow_dispatch, schedule, release): it must ship the
 * minified bytes the web deploy ships, so it fails. A pull-request run or a
 * local dev stage may ship source bytes; the returned reason is logged.
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ allow: boolean, reason: string }}
 */
export function unminifiedPolicy(env = process.env) {
  if (env.APEX_RELEASE_BUILD === "1" || env.APEX_RELEASE_BUILD === "true") {
    return { allow: false, reason: "APEX_RELEASE_BUILD is set" };
  }
  if (env.GITHUB_REF_TYPE === "tag" || String(env.GITHUB_REF || "").startsWith("refs/tags/")) {
    return { allow: false, reason: `tag build (${env.GITHUB_REF || env.GITHUB_REF_NAME || "tag"})` };
  }
  if (env.GITHUB_ACTIONS === "true") {
    const ev = env.GITHUB_EVENT_NAME || "unknown";
    if (PR_EVENTS.has(ev)) return { allow: true, reason: `GitHub Actions ${ev} build` };
    return { allow: false, reason: `GitHub Actions ${ev} build is a release build` };
  }
  return { allow: true, reason: "local build (not GitHub Actions, APEX_RELEASE_BUILD unset)" };
}

/** terser options: one frozen object so the test and the stage cannot drift. */
export const MINIFY_OPTIONS = Object.freeze({
  compress: false,
  mangle: { toplevel: false },
  toplevel: false,
  module: false,
  keep_fnames: true,
  keep_classnames: true,
  format: { comments: "some", keep_quoted_props: true, quote_style: 3 },
});

/** Staged paths (POSIX, relative to the site root) the minifier must not touch. */
export function minifyExcluded(rel) {
  return !rel.startsWith("js/") || !rel.endsWith(".js")
    || rel.split("/").includes("vendor");   // a vendored island ships as its authors built it
}

/** Every staged js file to minify, sorted (POSIX paths relative to `siteRoot`). */
export function minifyTargets(siteRoot) {
  const out = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile()) {
        const rel = path.relative(siteRoot, abs).split(path.sep).join("/");
        if (!minifyExcluded(rel)) out.push(rel);
      }
    }
  };
  if (fs.existsSync(path.join(siteRoot, "js"))) walk(path.join(siteRoot, "js"));
  return out.sort();
}

/**
 * Minify one source text. Returns { code, map }.
 * @param {string} src
 * @param {string} rel staged path, e.g. "js/core/log.js"
 */
export async function minifySource(src, rel) {
  const { minify } = await terser();
  const r = await minify({ [rel]: src }, {
    ...MINIFY_OPTIONS,
    format: { ...MINIFY_OPTIONS.format },
    sourceMap: { filename: path.posix.basename(rel) },   // no `url`: the shipped file never links its map
  });
  if (typeof r.code !== "string") throw new Error(`minify: terser returned no code for ${rel}`);
  return { code: r.code, map: typeof r.map === "string" ? r.map : JSON.stringify(r.map) };
}

/** Conservative CPU/memory envelope; explicit requests cannot exceed the pool cap.
 * The memory allowance includes more than the worker's 256 MiB old-generation cap.
 */
export function minifyJobCount(requested = 2, {
  parallelism = os.availableParallelism(),
  memory = typeof process.availableMemory === "function" ? process.availableMemory() : os.freemem(),
} = {}) {
  const wanted = Number.isFinite(requested) ? Math.floor(requested) : 2;
  return Math.max(1, Math.min(2, wanted, parallelism, Math.floor(memory / (512 * 1024 * 1024))));
}

/**
 * Minify staged files, joining all transforms before publishing any code/maps.
 * Temporary results bound memory to one source/output per worker and are removed
 * after success or failure. The serial path uses the same publication barrier.
 * @param {string} siteRoot
 * @param {{ jobs?: number, env?: Record<string, string | undefined> }} [opts] env: for unminifiedPolicy (default process.env)
 * @returns {Promise<{ files: number, before: number, after: number } | { skipped: string }>}
 */
export async function minifyStaged(siteRoot, opts = {}) {
  if (!(await canMinify())) {
    const policy = unminifiedPolicy(opts.env || process.env);
    if (!policy.allow) {
      throw new Error(`stage: terser is not installed (run npm ci at the repo root); a release build must minify js/ (${policy.reason})`);
    }
    const skipped = `terser is not installed here (run npm ci at the repo root); js/ staged unminified — allowed: ${policy.reason}; a release build fails here`;
    process.stderr.write(`::warning::stage: ${skipped}\n`);
    return { skipped };
  }
  const targets = minifyTargets(siteRoot);
  if (!targets.length) return { files: 0, before: 0, after: 0 };
  const jobs = Math.min(minifyJobCount(opts.jobs), targets.length);
  const resultRoot = fs.mkdtempSync(path.join(siteRoot, ".minify-"));
  try {
    let results;
    if (jobs > 1) {
      const { minifyInWorkers } = await import("./minify-worker.mjs");
      results = await minifyInWorkers({ siteRoot, targets, resultRoot, jobs });
    } else {
      results = [];
      for (const [index, rel] of targets.entries()) {
        const src = fs.readFileSync(path.join(siteRoot, rel), "utf8");
        let out;
        try { out = await minifySource(src, rel); }
        catch (error) { throw new Error(`minify: ${rel}: ${error.message}`); }
        fs.writeFileSync(path.join(resultRoot, `${index}.js`), out.code);
        fs.writeFileSync(path.join(resultRoot, `${index}.map`), out.map);
        results.push({ before: Buffer.byteLength(src), after: Buffer.byteLength(out.code) });
      }
    }
    // stageSite awaits this barrier before content-hash/SRI stamping.
    for (const [index, rel] of targets.entries()) {
      fs.copyFileSync(path.join(resultRoot, `${index}.js`), path.join(siteRoot, rel));
      fs.copyFileSync(path.join(resultRoot, `${index}.map`), path.join(siteRoot, rel + ".map"));
    }
    return { files: targets.length, before: results.reduce((n, r) => n + r.before, 0),
      after: results.reduce((n, r) => n + r.after, 0) };
  } finally {
    fs.rmSync(resultRoot, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// THE SHELL: css/*.css and index.html (#5050). The repo sources keep their
// comments (the design rationale lives in them); the staged copy drops them.
// Same barrier as js/: stageSiteMinified runs this before any stamp, so the
// ?v= hashes, the SRI digests and sw.js's integrity check all see these bytes.

const CSS_WS = /[ \t\n\r\f]/;
// A character that can sit inside an ident or number token: removing a comment
// between two of these must leave a space or the two would fuse into one token
// (`1px/**/solid`, `1/**/%`, `1/**/.5`). `.a/**/.b` and `a/**/#b` need none:
// they tokenize the same glued (a space there would make a descendant).
const CSS_WORD = /[\w\-\\\u0080-￿]/;
const fuses = (last, next) => (CSS_WORD.test(last) && (CSS_WORD.test(next) || next === "%"))
  || (/[0-9]/.test(last) && next === ".");
// Whitespace beside these never separates two tokens, so it can go. Not `,`:
// inside var() and custom properties the value is a token stream that the
// CSSOM serialises as written, so `a, b` stays `a, b`.
const CSS_PUNCT = new Set(["{", "}", ";"]);

/**
 * Minify one stylesheet without parsing it: comments go (a `/*!` one stays),
 * every whitespace run becomes one space, and the space beside `{ } ;` goes.
 * Strings and unquoted url() bodies are copied byte for byte. Nothing else is
 * rewritten (no `:` spacing, no colour or zero shortening), so the rule list
 * and every declaration value parse exactly as the source's. tests/unit/
 * stage-minify.test.mjs checks the `{` count and the comment-free result.
 * @param {string} src
 * @param {string} [rel] for the error message
 */
export function minifyCss(src, rel = "css") {
  let out = "";
  let space = false;   // whitespace was skipped since the last emitted char
  let seam = false;    // a comment was removed since the last emitted char
  const emit = (t) => {
    const last = out[out.length - 1];
    if (out.length && (space || seam)) {
      const glue = space
        ? !(CSS_PUNCT.has(last) || CSS_PUNCT.has(t[0])) || (last === ":" && t[0] === ";")
        : fuses(last, t[0]);
      if (glue) out += " ";
    }
    space = seam = false;
    out += t;
  };
  const n = src.length;
  for (let i = 0; i < n;) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end < 0) throw new Error(`minifyCss: ${rel}: unterminated comment at ${i}`);
      if (src[i + 2] === "!") emit(src.slice(i, end + 2)); else seam = true;
      i = end + 2;
    } else if (CSS_WS.test(c)) {
      space = true; i++;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      emit(src.slice(i, j + 1)); i = j + 1;
    } else if ((c === "u" || c === "U") && /^url\(/i.test(src.slice(i, i + 4)) && !CSS_WORD.test(src[i - 1] || " ")) {
      let j = i + 4;
      while (j < n && CSS_WS.test(src[j])) j++;
      if (src[j] === '"' || src[j] === "'") { emit(src.slice(i, i + 4)); i += 4; continue; }
      const close = src.indexOf(")", j);
      if (close < 0) throw new Error(`minifyCss: ${rel}: unterminated url( at ${i}`);
      emit(src.slice(i, close + 1)); i = close + 1;
    } else if (c === "}" && out.endsWith(";") && !/: ?;$/.test(out)) {   // `--x: ;` keeps its `;`
      out = out.slice(0, -1); space = seam = false; emit("}"); i++;
    } else {
      emit(c); i++;
    }
  }
  return out + "\n";
}

/** Every staged css/*.css (POSIX paths relative to `siteRoot`), sorted. */
export function cssTargets(siteRoot) {
  const dir = path.join(siteRoot, "css");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const walk = (abs) => {
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      const p = path.join(abs, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && ent.name.endsWith(".css")) out.push(path.relative(siteRoot, p).split(path.sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

const RAW_TEXT = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "noscript"]);

/**
 * Minify the shell page: HTML comments outside raw text go (a comment alone on
 * its line takes the line with it); each CLASSIC inline <script> body (no src,
 * no type: not the importmap or a JSON block) goes through terser with the
 * js/ options; then the CSP meta is regenerated for the new bodies with
 * gen-shell's own cspFor, so every inline script stays allowed. Markup,
 * attributes, whitespace and every tag sw.js / bump-cache read are untouched.
 * `minifyScript` null (no terser here) keeps the script bodies and the CSP.
 * @param {string} html
 * @param {{ minifyScript?: ((body: string) => Promise<string>) | null }} [opts]
 * @returns {Promise<string>}
 */
export async function minifyShellHtml(html, opts = {}) {
  const minifyScript = opts.minifyScript || null;
  const tokens = /<!--[\s\S]*?(?:-->|--!>|$)|<![^>]*>|<\?[^>]*>|<\/?([a-z][a-z0-9:-]*)(?=[\t\n\f\r />])((?:[^"'<>]|"[^"]*"|'[^']*')*)>/gi;
  const parts = [];
  let at = 0;
  for (let m; (m = tokens.exec(html));) {
    if (m[0].startsWith("<!--")) {
      let a = m.index, b = tokens.lastIndex;
      const lineStart = html.lastIndexOf("\n", a - 1) + 1;
      const eol = html.indexOf("\n", b);
      const lineEnd = eol < 0 ? html.length : eol + 1;
      if (/^[ \t]*$/.test(html.slice(lineStart, a)) && /^[ \t]*\r?\n?$/.test(html.slice(b, lineEnd)) && lineStart >= at) {
        a = lineStart; b = lineEnd; tokens.lastIndex = b;
      }
      parts.push(html.slice(at, a));
      at = b;
      continue;
    }
    if (!m[1] || m[0].startsWith("</")) continue;
    const name = m[1].toLowerCase();
    if (name === "plaintext") break;
    if (!RAW_TEXT.has(name)) continue;
    const start = tokens.lastIndex;
    const end = new RegExp(`</${name}(?=[\\t\\n\\f\\r />])[^>]*>`, "gi");
    end.lastIndex = start;
    const close = end.exec(html);
    const stop = close ? close.index : html.length;
    tokens.lastIndex = close ? end.lastIndex : html.length;
    if (name !== "script" || !minifyScript) continue;
    const attrs = [...m[2].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g)].map((x) => x[1].toLowerCase());
    if (attrs.includes("src") || attrs.includes("type")) continue;
    parts.push(html.slice(at, start), await minifyScript(html.slice(start, stop)));
    at = stop;
  }
  parts.push(html.slice(at));
  let out = parts.join("");
  if (minifyScript) {
    const { cspFor } = await import("../gen/gen-shell.mjs");
    const meta = /<meta http-equiv="Content-Security-Policy" content="[^"]*">/;
    if (!meta.test(out)) throw new Error("minifyShellHtml: the shell has no Content-Security-Policy meta to regenerate");
    out = out.replace(meta, () => `<meta http-equiv="Content-Security-Policy" content="${cspFor(out)}">`);
  }
  return out;
}

/**
 * Minify the staged css/*.css and index.html in place (the js/ pass is
 * minifyStaged). CSS needs no dependency; the inline scripts need terser and
 * follow the same unminifiedPolicy as js/ when it is missing.
 * @param {string} siteRoot
 * @returns {Promise<{ css: { files: number, before: number, after: number }, html: { before: number, after: number, scripts: boolean } }>}
 */
export async function minifyStagedShell(siteRoot) {
  const css = { files: 0, before: 0, after: 0 };
  const writes = [];
  for (const rel of cssTargets(siteRoot)) {
    const src = fs.readFileSync(path.join(siteRoot, rel), "utf8");
    const min = minifyCss(src, rel);
    writes.push([rel, min]);
    css.files++; css.before += Buffer.byteLength(src); css.after += Buffer.byteLength(min);
  }
  const indexPath = path.join(siteRoot, "index.html");
  let html = null;
  if (fs.existsSync(indexPath)) {
    const src = fs.readFileSync(indexPath, "utf8");
    const scripts = await canMinify();
    const minifyScript = scripts ? async (body) => {
      const { minify } = await terser();
      const r = await minify(body, { ...MINIFY_OPTIONS, format: { ...MINIFY_OPTIONS.format } });
      if (typeof r.code !== "string") throw new Error("minify: terser returned no code for an inline index.html script");
      return r.code;
    } : null;
    const min = await minifyShellHtml(src, { minifyScript });
    writes.push(["index.html", min]);
    html = { before: Buffer.byteLength(src), after: Buffer.byteLength(min), scripts };
  }
  // Publish only after every transform succeeded (the js/ pass's barrier).
  for (const [rel, text] of writes) fs.writeFileSync(path.join(siteRoot, rel), text);
  return { css, html };
}
