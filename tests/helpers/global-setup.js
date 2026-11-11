// @ts-check
/** Playwright preflight: require the Apex shell within one 10-second budget. */
import http from 'http';
import { ensureBuilt, builtLine } from '../../tools/gen/ensure-built.mjs';

/**
 * @param {import('@playwright/test').FullConfig} config
 * @param {Parameters<typeof waitForServer>[1]} [options]
 */
async function globalSetup(config, options) {
  // The served generated files are gitignored (docs/notes/DEPLOY-TIME-GEN-2026-10-28.md): build what is missing
  // or stale before the first page loads, whatever started the run (run-playwright, test-bg, CI, npx playwright).
  const built = builtLine(ensureBuilt());
  if (built) console.log(`✓ ${built}`);
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:3456';
  await waitForServer(baseURL, options);
  console.log(`✓ dev server ready at ${baseURL}`);
}

/** One deadline covers requests, response bodies and retry pauses.
 * @param {string} baseURL
 * @param {{ timeoutMs?: number, attempts?: number, request?: typeof ping, delay?: typeof wait, now?: () => number }} [options]
 */
export async function waitForServer(baseURL, options = {}) {
  const { timeoutMs = 10000, attempts = 5, request = ping, delay = wait, now = Date.now } = options;
  const deadline = now() + timeoutMs;
  let lastError = null, tried = 0;
  const delays = [200, 400, 800, 1600];
  while (tried < attempts && now() < deadline) {
    tried++;
    try {
      await request(baseURL, Math.min(5000, deadline - now()));
      return;
    } catch (err) {
      lastError = err;
      const remaining = deadline - now();
      if (tried < attempts && remaining > 0) await delay(Math.min(delays[tried - 1] ?? 1600, remaining));
    }
  }
  throw new Error(
    `Dev server did not serve the Apex shell at ${baseURL} after ${tried} attempts (budget ${timeoutMs} ms).\n` +
    `Use the npm test scripts so a server and free port are managed automatically.\n` +
    `Underlying error: ${lastError?.message ?? lastError}`
  );
}

/** Require a successful response containing the shell's build marker.
 * A real timer bounds the whole request, unlike a socket inactivity timeout.
 * @param {string} baseURL
 * @param {number} timeoutMs
 */
export function ping(baseURL, timeoutMs) {
  return new Promise((resolve, reject) => {
    let req, settled = false, body = '';
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve();
      req?.destroy();
    };
    const timer = setTimeout(() => finish(new Error(`Timed out after ${timeoutMs} ms`)), timeoutMs);
    try {
      req = http.get(baseURL, res => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          finish(new Error(`HTTP ${res.statusCode} from dev server`));
          return;
        }
        res.on('data', chunk => {
          body += chunk.toString().slice(0, 65536 - body.length);
          if (/<meta\b[^>]*\bname\s*=\s*["']apex-build["']/i.test(body)) finish();
          else if (body.length >= 65536) finish(new Error('Dev server response is not the Apex shell'));
        });
        res.on('end', () => finish(new Error('Dev server response is not the Apex shell')));
        res.on('error', finish);
        res.on('aborted', () => finish(new Error('Dev server response aborted before the Apex shell')));
      });
      req.on('error', finish);
    } catch (error) { finish(error); }
  });
}

/** @param {number} ms */
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export default globalSetup;
