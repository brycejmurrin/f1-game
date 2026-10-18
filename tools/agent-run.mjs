#!/usr/bin/env node
// @doc Runs commands with selectable output levels and saved stdout/stderr; --read retrieves without rerunning.
// @skill check-changes
// Node spawn shell:false and stdio file descriptors: https://nodejs.org/api/child_process.html (checked 2026-10-18).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnAgentProcess } from './lib/agent-process.mjs';
import { pipeline } from 'node:stream/promises';
import { validateOutputLevel, saveOutputArtifact, summarizeOutput, readOutputArtifact } from './lib/agent-output.mjs';

const HELP = `Usage: node tools/agent-run.mjs [--output-level compact|diagnostic|full] [--timeout-ms N] -- executable [args...]
       node tools/agent-run.mjs --read artifacts/agent-output/FILE [--offset N] [--limit N] [--output-level LEVEL]
Defaults to compact. Retains separate stdout/stderr artifacts and original exit status.
Full replays stdout/stderr separately. No timeout unless explicitly requested.
Cancellation forwards signals to the owned process tree; ignored signals escalate to SIGKILL.
Timeout retains the child exit/signal in its record; a timed-out clean exit returns 124.
--read returns a bounded byte page (default 16384, maximum 262144); use nextOffset for more.
Command argv after -- is passed literally to spawn without a shell.`;
function parse(argv) {
  const separator = argv.indexOf('--');
  const options = separator < 0 ? argv : argv.slice(0, separator);
  if (options.includes('--help') || options.includes('-h') || options[0] === 'help') return { help: true };
  const result = { level: 'compact', offset: 0, limit: 16384, command: separator < 0 ? [] : argv.slice(separator + 1) };
  const names = { '--output-level': 'level', '--read': 'read', '--offset': 'offset', '--limit': 'limit', '--timeout-ms': 'timeout' };
  for (let i = 0; i < options.length; i++) {
    const [name, ...rest] = options[i].split('=');
    if (!Object.hasOwn(names, name)) throw new Error(`unknown option ${name}`);
    const value = rest.length ? rest.join('=') : options[++i];
    if (value === undefined || value === '') throw new Error(`${name} needs a value`);
    result[names[name]] = ['--offset', '--limit', '--timeout-ms'].includes(name) ? Number(value) : value;
  }
  result.level = validateOutputLevel(result.level);
  for (const key of ['offset', 'limit', 'timeout']) {
    if (result[key] !== undefined && (!Number.isSafeInteger(result[key]) || result[key] < (key === 'offset' ? 0 : 1))) throw new Error(`${key} must be a ${key === 'offset' ? 'nonnegative' : 'positive'} integer`);
  }
  if (result.read && result.command.length) throw new Error('--read cannot also execute a command');
  if (!result.read && !result.command.length) throw new Error('expected -- executable [args...]; use --help');
  if (!result.read && (result.offset !== 0 || result.limit !== 16384)) throw new Error('--offset and --limit require --read');
  return result;
}
async function streamSummary(root, artifact, level) {
  const max = level === 'diagnostic' ? 16000 : 3500;
  const first = readOutputArtifact({ root, artifact, level, limit: Math.min(max, 262144) });
  let text = first.text;
  if (first.omittedBytes) {
    const tailSize = Math.floor(max * 0.35);
    const tail = readOutputArtifact({ root, artifact, level, offset: Math.max(0, first.totalBytes - tailSize), limit: tailSize });
    text = first.text.slice(0, Math.floor(max * 0.65)) + `\n[omitted middle; ${first.totalBytes} total bytes]\n` + tail.text;
  }
  const result = { bytes: first.totalBytes, excerpt: text, artifact };
  if (first.totalBytes > max) result.omittedBytes = first.totalBytes - max;
  // Small structured tool results deserve semantic status/count/error fields.
  if (first.totalBytes <= 1048576 && first.totalBytes > 0) {
    try {
      result.data = summarizeOutput(JSON.parse(fs.readFileSync(path.resolve(root, artifact.path), 'utf8')), { level });
      delete result.excerpt;
    }
    catch { /* An ordinary log is represented by its excerpt. */ }
  }
  if (level === 'diagnostic' && result.data === undefined) {
    const failures = [], previous = [];
    let active, following = 0;
    function lineContext(raw) {
      const line = raw.slice(0, 1500);
      const match = /error|fail|exception|caused by|\bat .+?:\d/i.test(line);
      if (match && !active && failures.length < 3) {
        active = [...previous, line]; failures.push(active); following = 4;
      } else if (active) {
        active.push(line);
        if (--following <= 0 || active.length >= 9) active = null;
      }
      previous.push(line); if (previous.length > 2) previous.shift();
    }
    let carry = '';
    for await (const chunk of fs.createReadStream(path.resolve(root, artifact.path), { encoding: 'utf8', highWaterMark: 16384 })) {
      const lines = (carry + chunk).split('\n'); carry = lines.pop().slice(-4000);
      for (const line of lines) lineContext(line);
    }
    if (carry) lineContext(carry);
    if (failures.length) result.diagnostics = failures;
  }
  return result;
}
async function main() {
  const options = parse(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }
  const root = process.cwd();
  if (options.read) { console.log(JSON.stringify(readOutputArtifact({ root, artifact: options.read, level: options.level, offset: options.offset, limit: options.limit }))); return; }
  // Establish retention before running the command: no command may execute if
  // its full output cannot be retained. Never persist command args or environment.
  const stdout = saveOutputArtifact('', { root, tool: 'command', kind: 'stdout' });
  const stderr = saveOutputArtifact('', { root, tool: 'command', kind: 'stderr' });
  const flags = fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW;
  const outFd = fs.openSync(path.resolve(root, stdout.path), flags);
  const errFd = fs.openSync(path.resolve(root, stderr.path), flags);
  let outcome;
  try {
    const run = spawnAgentProcess(options.command[0], options.command.slice(1), { cwd: root, stdio: ['inherit', outFd, errFd], timeoutMs: options.timeout, forwardSignals: true });
    outcome = await run.done;
  } finally {
    fs.closeSync(outFd); fs.closeSync(errFd);
  }
  const spawnError = outcome.error;
  const timedOut = outcome.timedOut;
  stdout.bytes = fs.statSync(path.resolve(root, stdout.path)).size;
  stderr.bytes = fs.statSync(path.resolve(root, stderr.path)).size;
  const record = { status: spawnError ? 'spawn-error' : timedOut ? 'timed-out' : outcome.signal ? 'signaled' : 'exited', ...outcome, timedOut, ...(spawnError ? { error: spawnError } : {}), stdout, stderr };
  let retained;
  try { retained = saveOutputArtifact(record, { root, tool: 'command', kind: 'json' }); }
  catch (error) { record.presentationError = error.message; }
  try {
    if (options.level === 'full') {
      await pipeline(fs.createReadStream(path.resolve(root, stdout.path)), process.stdout, { end: false });
      await pipeline(fs.createReadStream(path.resolve(root, stderr.path)), process.stderr, { end: false });
      if (spawnError) console.error(JSON.stringify(record));
      if (record.presentationError) console.error(`Presentation error: ${record.presentationError}`);
    } else {
      const summary = { outputLevel: options.level, ...record, stdout: await streamSummary(root, stdout, options.level), stderr: await streamSummary(root, stderr, options.level), ...(retained ? { artifact: retained } : {}) };
      console.log(JSON.stringify(summary));
    }
  } catch (error) {
    console.error(JSON.stringify({ presentationError: error.message, original: record, artifact: retained }));
  }
  const finalSignal = outcome.cancelSignal || outcome.signal;
  if (finalSignal && !spawnError) {
    // Match the original signal as well as reporting it in the retained record.
    process.kill(process.pid, finalSignal);
    process.exitCode = 128 + (os.constants.signals[finalSignal] || 0);
  } else process.exitCode = spawnError ? 127 : outcome.cleanupError ? 1 : timedOut && outcome.exitCode === 0 ? 124 : outcome.exitCode;
}
main().catch((error) => { console.error(`agent-run: ${error.message}`); process.exitCode = 1; });
