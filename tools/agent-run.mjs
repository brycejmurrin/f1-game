#!/usr/bin/env node
// @doc Runs commands with selectable output levels and saved stdout/stderr; --read retrieves without rerunning.
// @skill check-changes
// Node spawn shell:false and stdio file descriptors: https://nodejs.org/api/child_process.html (checked 2026-10-18).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnAgentProcess } from './lib/agent-process.mjs';
import { pipeline } from 'node:stream/promises';
import { validateOutputLevel, saveOutputArtifact, summarizeOutput, readOutputArtifact, readOutputCollection } from './lib/agent-output.mjs';

const HELP = `Usage: node tools/agent-run.mjs [--output-level compact|diagnostic|full] [--timeout-ms N] -- executable [args...]
       node tools/agent-run.mjs --read artifacts/agent-output/FILE [--offset N] [--limit N] [--output-level LEVEL]
       node tools/agent-run.mjs --progress -- executable [args...]
       node tools/agent-run.mjs --status artifacts/agent-output/FILE [--since CURSOR]
       node tools/agent-run.mjs --read artifacts/agent-output/FILE --pointer /rows [--offset N] [--limit N]
Defaults to compact. Retains separate stdout/stderr artifacts and original exit status.
Full replays stdout/stderr separately. No timeout unless explicitly requested.
Cancellation forwards signals to the owned process tree; ignored signals escalate to SIGKILL.
Timeout retains the child exit/signal in its record; a timed-out clean exit returns 124.
--read returns a bounded byte page (default 16384, maximum 262144); use nextOffset for more.
--pointer selects exact JSON collection rows (default limit 20, maximum 100); no action repeats.
--progress emits one running receipt to stderr before launch; stdout keeps its final native/JSON contract.
--status reads that receipt's status artifact, current stream sizes and a change cursor; --since suppresses unchanged detail.
Command argv after -- is passed literally to spawn without a shell.`;
function parse(argv) {
  const separator = argv.indexOf('--');
  const options = separator < 0 ? argv : argv.slice(0, separator);
  if (options.includes('--help') || options.includes('-h') || options[0] === 'help') return { help: true };
  const result = { level: 'compact', offset: 0, limit: 16384, command: separator < 0 ? [] : argv.slice(separator + 1) };
  const names = { '--output-level': 'level', '--read': 'read', '--offset': 'offset', '--limit': 'limit', '--timeout-ms': 'timeout', '--status': 'status', '--since': 'since', '--pointer': 'pointer' };
  for (let i = 0; i < options.length; i++) {
    if (options[i] === '--progress') { result.progress = true; continue; }
    const [name, ...rest] = options[i].split('=');
    if (!Object.hasOwn(names, name)) throw new Error(`unknown option ${name}`);
    const value = rest.length ? rest.join('=') : options[++i];
    if (value === undefined || (value === '' && name !== '--pointer')) throw new Error(`${name} needs a value`);
    result[names[name]] = ['--offset', '--limit', '--timeout-ms'].includes(name) ? Number(value) : value;
  }
  result.level = validateOutputLevel(result.level);
  for (const key of ['offset', 'limit', 'timeout']) {
    if (result[key] !== undefined && (!Number.isSafeInteger(result[key]) || result[key] < (key === 'offset' ? 0 : 1))) throw new Error(`${key} must be a ${key === 'offset' ? 'nonnegative' : 'positive'} integer`);
  }
  if ((result.read || result.status) && result.command.length) throw new Error('--read/--status cannot also execute a command');
  if (result.read && result.status) throw new Error('--read and --status are exclusive');
  if (!result.read && !result.status && !result.command.length) throw new Error('expected -- executable [args...]; use --help');
  if (!result.read && (result.offset !== 0 || result.limit !== 16384 || result.pointer !== undefined)) throw new Error('--offset, --limit and --pointer require --read');
  if (result.since && !result.status) throw new Error('--since requires --status');
  if ((result.read || result.status) && (result.timeout || result.progress)) throw new Error('--progress and --timeout-ms require execution');
  if (result.pointer !== undefined && !options.some(option => option === '--limit' || option.startsWith('--limit='))) result.limit = 20;
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
  if (first.totalBytes <= 8388608 && first.totalBytes > 0) {
    try {
      const original = fs.readFileSync(path.resolve(root, artifact.path), 'utf8');
      let data, mixed = false;
      try { data = JSON.parse(original); }
      catch {
        // Capture/performance producers often log phases before a final JSON
        // report. Summarize that report rather than clipping its middle.
        const start = [...original.matchAll(/^[{[]/gm)].at(-1)?.index;
        if (start === undefined) throw new Error('ordinary text');
        data = JSON.parse(original.slice(start)); mixed = true;
      }
      // The original stream can contain non-JSON phase lines. Give collection
      // pointers an actual JSON source without replacing the complete log.
      const reportArtifact = mixed ? saveOutputArtifact(data, { root, tool: 'command-report' }) : undefined;
      result.data = summarizeOutput(data, { level });
      if (!mixed) delete result.excerpt;
      else { result.reportScope = 'final JSON report; complete phase log retained in artifact'; result.reportArtifact = reportArtifact; }
    }
    catch { /* An ordinary log is represented by its excerpt. */ }
  }
  if (result.data === undefined || result.reportScope) {
    const failures = [], previous = [];
    const counts = {}, receipts = [];
    let active, following = 0;
    function lineContext(raw) {
      const line = raw.slice(0, 1500);
      const count = /^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)\s*$/.exec(line);
      if (count) counts[count[1]] = (counts[count[1]] ?? 0) + Number(count[2]);
      const browserCount = /^\s*(\d+) (passed|failed|skipped|interrupted|flaky)\b/.exec(line);
      if (browserCount) counts[browserCount[2]] = (counts[browserCount[2]] ?? 0) + Number(browserCount[1]);
      if (/^= (run |bg exit|ci |gate |deploy )|(?:report|manifest|trace|artifact|screenshot|capture).{0,30}(?:saved|written|path|:)/i.test(line)) {
        receipts.push(line); if (receipts.length > 8) receipts.shift();
      }
      const match = /error|fail|exception|caused by|\bat .+?:\d|^not ok\b/i.test(line) && !/^# fail 0\s*$|\b0 (?:failed|failures|errors)\b|\b(?:failed|failures|errors)\s*[:=]\s*0\b/i.test(line);
      if (match && !active && failures.length < (level === 'diagnostic' ? 3 : 1)) {
        active = level === 'diagnostic' ? [...previous, line] : [line]; failures.push(active); following = level === 'diagnostic' ? 4 : 2;
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
    if (Object.keys(counts).length) result.testCounts = { ...counts, scope: 'reported stream summaries; repeated nested suites may overlap', verdictSource: 'command exit/status, never counts alone' };
    if (receipts.length) result.receipts = receipts;
  }
  return result;
}
async function main() {
  const options = parse(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }
  const root = process.cwd();
  if (options.read) { console.log(JSON.stringify(options.pointer !== undefined ? readOutputCollection({ root, artifact: options.read, pointer: options.pointer, offset: options.offset, limit: options.limit }) : readOutputArtifact({ root, artifact: options.read, level: options.level, offset: options.offset, limit: options.limit }))); return; }
  if (options.status) {
    const page = readOutputArtifact({ root, artifact: options.status, limit: 65536 });
    if (page.nextOffset !== null) throw new Error('status record exceeds 65536 bytes');
    const record = JSON.parse(page.text);
    if (record.kind !== 'command-status' || !record.stdout?.path || !record.stderr?.path) throw new Error('expected a command status artifact');
    const stdout = readOutputArtifact({ root, artifact: record.stdout, limit: 1 }).totalBytes;
    const stderr = readOutputArtifact({ root, artifact: record.stderr, limit: 1 }).totalBytes;
    const cursor = createHash('sha256').update(JSON.stringify([record.status, record.exitCode, record.signal, stdout, stderr])).digest('hex').slice(0, 24);
    console.log(JSON.stringify(options.since === cursor ? { unchanged: true, cursor, status: record.status } : { ...record, cursor, elapsedMs: (record.completedAt ?? Date.now()) - record.startedAt, streamBytes: { stdout, stderr }, observedAt: Date.now(), ...(record.status === 'running' ? { note: 'Last recorded state; only a final status establishes completion.' } : {}) }));
    return;
  }
  // Establish retention before running the command: no command may execute if
  // its full output cannot be retained. Never persist command args or environment.
  const stdout = saveOutputArtifact('', { root, tool: 'command', kind: 'stdout' });
  const stderr = saveOutputArtifact('', { root, tool: 'command', kind: 'stderr' });
  const startedAt = Date.now();
  const statusArtifact = options.progress ? saveOutputArtifact({ kind: 'command-status', status: 'running', startedAt, stdout, stderr }, { root, tool: 'command-status' }) : undefined;
  if (statusArtifact) process.stderr.write(`${JSON.stringify({ status: 'running', stdout, stderr, artifact: statusArtifact, read: 'node tools/agent-run.mjs --status <artifact.path>' })}\n`);
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
  if (statusArtifact) {
    try {
      const updated = saveOutputArtifact({ kind: 'command-status', startedAt, completedAt: Date.now(), ...record }, { root, tool: 'command-status' });
      // Same-directory rename publishes a complete record to concurrent readers.
      // The private artifact writer validates directories; rename never follows
      // a destination file symlink.
      fs.renameSync(path.resolve(root, updated.path), path.resolve(root, statusArtifact.path));
    } catch (error) { record.presentationError = `Could not update status: ${error.message}`; }
  }
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
