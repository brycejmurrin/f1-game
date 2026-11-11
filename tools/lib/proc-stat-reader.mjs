// @doc Bound shared Linux proc-stat descriptors while reading fresh process metadata on every sample.
// One pool per Node process, shared by subprocess owners. No parsed metadata is cached.
// Cost: up to min(2048, soft-RLIMIT/16) retained FDs and page-sized seq_file buffers.
// Unknown limits disable retention; startup budgeting leaves 64 descriptors free.
// A positional read at zero regenerates seq_file output (Linux fs/seq_file.c:188-205).
// https://github.com/torvalds/linux/blob/v6.12/Documentation/filesystems/proc.rst#L130-L136
import fs from 'node:fs';
export function createProcFdPool(io = fs, { proc = '/proc', maximum = 2048, reserve = 64, initialBytes = 8192 } = {}) {
  const entries = new Map();
  let users = 0, limit = 0;
  let sampled;
  let buffer = Buffer.allocUnsafe(initialBytes);
  const close = pid => {
    const fd = entries.get(pid);
    if (fd === undefined) return;
    entries.delete(pid);
    sampled?.delete(pid);
    try { io.closeSync(fd); } catch { /* Already invalid: never reuse it. */ }
  };
  const flush = () => { for (const pid of entries.keys()) close(pid); };
  function budget() {
    try {
      const text = io.readFileSync(`${proc}/self/limits`, 'utf8');
      const value = /^Max open files\s+(\d+|unlimited)\s+/m.exec(text)?.[1];
      if (!value) return 0;
      const soft = value === 'unlimited' ? Infinity : Number(value);
      const open = io.readdirSync(`${proc}/self/fd`).length;
      return Math.max(0, Math.min(2048, maximum, Math.floor(soft / 16), soft - open - reserve));
    } catch { return 0; } // Unknown limits: preserve the uncached reader.
  }
  function open(pid) {
    if (limit && entries.size >= limit) close(entries.keys().next().value);
    let fd;
    try { fd = io.openSync(`${proc}/${pid}/stat`, 'r'); }
    catch (error) {
      if (!['EMFILE', 'ENFILE'].includes(error.code)) throw error;
      flush(); limit = 0; // Release retained FDs before one uncached retry.
      fd = io.openSync(`${proc}/${pid}/stat`, 'r');
    }
    if (limit) { entries.set(pid, fd); sampled?.add(pid); }
    return fd;
  }
  function readFd(fd) {
    let used = 0;
    for (;;) {
      if (used === buffer.length) {
        if (used >= 65536) throw new Error('Unexpectedly large proc stat; use uncached reader');
        const larger = Buffer.allocUnsafe(buffer.length * 2);
        buffer.copy(larger, 0, 0, used); buffer = larger;
      }
      const count = io.readSync(fd, buffer, used, buffer.length - used, used);
      if (!count) {
        if (!used) throw new Error('Empty proc stat; retry current PID path');
        return buffer.toString('utf8', 0, used);
      }
      used += count;
    }
  }
  function read(pid) {
    const path = `${proc}/${pid}/stat`;
    if (!users || !limit) return io.readFileSync(path, 'utf8');
    // Once every retained descriptor has been used in this scan, admitting
    // later PIDs would evict its whole working set on every oversized scan.
    if (sampled && !entries.has(pid) && entries.size >= limit && sampled.size === entries.size) return io.readFileSync(path, 'utf8');
    for (let attempt = 0; attempt < 2; attempt++) {
      let fd = entries.get(pid);
      if (fd !== undefined) { entries.delete(pid); entries.set(pid, fd); sampled?.add(pid); }
      try {
        if (fd === undefined) fd = open(pid);
        return readFd(fd);
      } catch {
        if (entries.get(pid) === fd) close(pid);
        else if (fd !== undefined) { try { io.closeSync(fd); } catch {} }
        fd = undefined;
      } finally {
        // EMFILE may disable caching inside open(). That retry's FD is local.
        if (fd !== undefined && entries.get(pid) !== fd) { try { io.closeSync(fd); } catch {} }
      }
    }
    return io.readFileSync(path, 'utf8');
  }
  return {
    acquire() {
      if (!users++) limit = budget();
      let released = false;
      return () => { if (!released) { released = true; if (!--users) { flush(); limit = 0; sampled = undefined; } } };
    },
    read,
    sweep(pids) { const alive = new Set(pids); for (const pid of entries.keys()) if (!alive.has(pid)) close(pid); sampled = new Set(); },
    stats() { return { users, limit, descriptors: entries.size }; }
  };
}
