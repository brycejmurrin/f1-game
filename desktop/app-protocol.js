"use strict";
/**
 * Privileged app:// protocol handler for the desktop shell.
 *
 * Why not net.fetch(file:)? Electron issue #38749 — Range requests via
 * net.fetch return 200 without Content-Range, so large audio/video seeks can
 * break. This module serves real files from the staged site root with:
 *   - path-traversal rejection
 *   - MIME map covering game assets (js/mjs/wasm/ktx2/glb/mp3/…)
 *   - Accept-Ranges + 206 partial content (incl. suffix ranges) and 416
 *
 * Research: Electron 44.4.5 probe (2026-09-29), docs/api/protocol.md.
 * Origin must use a fixed host (we use app://apex/) so localStorage stays stable.
 */
const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");

// Lazy-require electron so unit tests can load MIME / Range / path helpers
// under plain Node without the Electron binary.
function electronProtocol() {
  return require("electron").protocol;
}

const SCHEME = "app";
const HOST = "apex";

const MIME = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".wasm": "application/wasm",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ktx2": "image/ktx2",
  ".glb": "model/gltf-binary",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
});

/** Register before app ready (once). */
function registerScheme() {
  electronProtocol().registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        // allowServiceWorkers: SW can register under app:// but cache.addAll
        // fails ("Request scheme 'app' is unsupported"). The game skips SW
        // when __APEX_NATIVE__.desktop — leave the privilege off to match.
        allowServiceWorkers: false,
        codeCache: true,
      },
    },
  ]);
}

/**
 * Resolve a request pathname to an absolute file under root, or null if unsafe/missing.
 * @param {string} root
 * @param {string} pathname
 * @returns {string|null}
 */
function resolveSafePath(root, pathname) {
  let rootReal;
  try {
    rootReal = fs.realpathSync(root);
  } catch {
    return null;
  }
  let rel = decodeURIComponent(pathname || "/");
  if (rel === "/" || rel === "") rel = "/index.html";
  const cleaned = rel.replace(/^\/+/, "");
  const target = path.resolve(rootReal, cleaned);
  const rootPrefix = rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep;
  if (target !== rootReal && !target.startsWith(rootPrefix)) return null;
  try {
    if (!fs.existsSync(target)) return target;
    const real = fs.realpathSync(target);
    if (real !== rootReal && !real.startsWith(rootPrefix)) return null;
    return real;
  } catch {
    return null;
  }
}

/**
 * Parse a Range header into inclusive byte bounds, or null if absent/invalid-shape.
 * @param {string|null} rangeHeader
 * @param {number} size
 * @returns {{ start: number, end: number } | { unsatisfiable: true } | null}
 */
function parseByteRange(rangeHeader, size) {
  if (!rangeHeader) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!m || (!m[1] && !m[2])) return null;
  let start;
  let end;
  if (m[1] === "") {
    // suffix: bytes=-N
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  }
  if (start > end || start >= size || size === 0) return { unsatisfiable: true };
  return { start, end };
}

function mimeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

/**
 * Install protocol.handle for app://apex/ serving files from root.
 * @param {string} root absolute staged-site directory
 */
function handleScheme(root) {
  electronProtocol().handle(SCHEME, async (req) => {
    try {
      const url = new URL(req.url);
      if (url.hostname !== HOST) {
        return new Response("Bad host", { status: 400, headers: { "content-type": "text/plain" } });
      }
      const target = resolveSafePath(root, url.pathname);
      if (!target) {
        return new Response("Forbidden", { status: 403, headers: { "content-type": "text/plain" } });
      }
      let st;
      try {
        st = await fs.promises.stat(target);
        if (!st.isFile()) throw new Error("not a file");
      } catch {
        return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      }
      const type = mimeFor(target);
      const range = parseByteRange(req.headers.get("range"), st.size);
      if (range && range.unsatisfiable) {
        return new Response(null, {
          status: 416,
          headers: { "content-range": `bytes */${st.size}`, "accept-ranges": "bytes" },
        });
      }
      if (range && !range.unsatisfiable) {
        const { start, end } = range;
        return new Response(Readable.toWeb(fs.createReadStream(target, { start, end })), {
          status: 206,
          headers: {
            "content-type": type,
            "content-length": String(end - start + 1),
            "content-range": `bytes ${start}-${end}/${st.size}`,
            "accept-ranges": "bytes",
          },
        });
      }
      return new Response(Readable.toWeb(fs.createReadStream(target)), {
        status: 200,
        headers: {
          "content-type": type,
          "content-length": String(st.size),
          "accept-ranges": "bytes",
        },
      });
    } catch (err) {
      return new Response(String(err && err.message ? err.message : err), {
        status: 500,
        headers: { "content-type": "text/plain" },
      });
    }
  });
}

module.exports = {
  SCHEME,
  HOST,
  MIME,
  registerScheme,
  handleScheme,
  resolveSafePath,
  parseByteRange,
  mimeFor,
};
