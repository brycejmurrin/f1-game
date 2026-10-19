#!/usr/bin/env python3
"""Local command evidence. Budgets are admission checks, not process-tree quotas."""
import argparse
import datetime
import fcntl
import json
import math
import os
from pathlib import Path
import resource
import signal
import subprocess
import sys
import time
import uuid


class CompactParser(argparse.ArgumentParser):
    def error(self, message):
        self.exit(2, f"{self.prog}: {message[:1000]}\nUse --help for usage.\n")


def main():
    p = CompactParser(description=__doc__)
    p.add_argument('--worktree', required=True)
    p.add_argument('--expected-head')
    p.add_argument('--tag', default='command')
    p.add_argument('--mode', choices=['native', 'compact', 'diagnostic', 'full'])
    p.add_argument('--records', default='artifacts/agent-experiments/records.jsonl')
    p.add_argument('--stdout')
    p.add_argument('--stderr')
    p.add_argument('--heavy', action='store_true')
    p.add_argument('--lock-path')
    p.add_argument('--timeout', type=float, default=120)
    p.add_argument('--limit', type=int, default=8000)
    p.add_argument('--large-output-reason')
    p.add_argument('--command-budget', type=int, default=30)
    p.add_argument('--time-budget', type=float, default=600)
    p.add_argument('--cpu-budget', type=float, default=180)
    p.add_argument('command', nargs=argparse.REMAINDER)
    a = p.parse_args()
    cmd = a.command[1:] if a.command[:1] == ['--'] else a.command
    if not cmd:
        p.error('command required')
    if not 0 <= a.limit <= 30000 or (a.limit > 12000 and not (a.large_output_reason or '').strip()):
        p.error('--limit must be 0..30000; above 12000 requires --large-output-reason')
    if a.command_budget < 1 or any(not math.isfinite(x) or x <= 0 for x in [a.timeout, a.time_budget, a.cpu_budget]):
        p.error('budgets and timeout must be finite and positive')
    if a.heavy and not a.lock_path:
        p.error('--heavy requires user-supplied --lock-path')
    worktree = Path(a.worktree).resolve(strict=True)
    cwd = Path.cwd().resolve()
    if cwd != worktree and worktree not in cwd.parents:
        p.error('actual cwd must be inside --worktree; no command executed')
    try:
        top = Path(subprocess.check_output(['git', '-C', str(worktree), 'rev-parse', '--show-toplevel'], stderr=subprocess.PIPE).decode().strip()).resolve()
        head = subprocess.check_output(['git', '-C', str(cwd), 'rev-parse', 'HEAD'], stderr=subprocess.PIPE).decode().strip()
        cwd_top = Path(subprocess.check_output(['git', '-C', str(cwd), 'rev-parse', '--show-toplevel'], stderr=subprocess.PIPE).decode().strip()).resolve()
        root_head = subprocess.check_output(['git', '-C', str(worktree), 'rev-parse', 'HEAD'], stderr=subprocess.PIPE).decode().strip()
    except subprocess.CalledProcessError:
        p.error('worktree/cwd must be a git checkout')
    if top != worktree or cwd_top != worktree or head != root_head or (a.expected_head and head != a.expected_head):
        p.error('worktree or expected HEAD mismatch; no command executed')

    def private_path(value):
        path = Path(value)
        if '..' in path.parts:
            p.error('artifact traversal refused')
        path = path if path.is_absolute() else worktree / path
        try:
            relative = path.relative_to(worktree / 'artifacts')
        except ValueError:
            p.error('evidence paths must be under worktree artifacts')
        if not relative.parts or len(relative.parts) < 2:
            p.error('use a private subdirectory under artifacts')
        cursor = worktree
        for part in path.relative_to(worktree).parts:
            cursor = cursor / part
            if cursor.is_symlink():
                p.error('artifact symlink refused')
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        # artifacts itself may be shared; evidence directories must be private.
        cursor = path.parent
        while cursor != worktree / 'artifacts':
            os.chmod(cursor, 0o700)
            cursor = cursor.parent
        return path

    ident = uuid.uuid4().hex
    records = private_path(a.records)
    outpath = private_path(a.stdout or str(records.parent / (ident + '.stdout')))
    errpath = private_path(a.stderr or str(records.parent / (ident + '.stderr')))
    if len({records, outpath, errpath}) != 3:
        p.error('records/stdout/stderr paths must differ')
    def private_open(path, flags):
        fd = os.open(path, flags | os.O_NOFOLLOW, 0o600)
        if os.fstat(fd).st_nlink != 1:
            os.close(fd)
            p.error('hardlinked evidence file refused')
        os.fchmod(fd, 0o600)
        return fd
    ledger = os.fdopen(private_open(records, os.O_RDWR | os.O_CREAT), 'r+')
    fcntl.flock(ledger, fcntl.LOCK_EX)
    try:
        old = [json.loads(line) for line in ledger if line.strip()]
        wall_used = sum(row['command_wall_seconds'] for row in old)
        cpu_used = sum(row['reaped_child_cpu_seconds'] for row in old)
    except (ValueError, KeyError, TypeError):
        p.error('invalid evidence ledger; no command executed')
    if len(old) >= a.command_budget or wall_used >= a.time_budget or cpu_used >= a.cpu_budget:
        p.error('between-command budget reached; no command executed')
    # Exclusive evidence creation prevents overwriting earlier captures.
    outfd = private_open(outpath, os.O_WRONLY | os.O_CREAT | os.O_EXCL)
    errfd = private_open(errpath, os.O_WRONLY | os.O_CREAT | os.O_EXCL)
    lock = None
    lock_start = time.monotonic()
    if a.heavy:
        lock = open(a.lock_path, 'a')
        while True:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() - lock_start >= a.timeout:
                    p.error('heavy lock wait exceeded; no command executed')
                time.sleep(.05)
    lock_wait = time.monotonic() - lock_start
    actual = 'native'
    runner = (0 if Path(cmd[0]).name == 'agent-run.mjs' else
              1 if len(cmd) > 1 and Path(cmd[0]).name in ('node', 'nodejs')
              and Path(cmd[1]).name == 'agent-run.mjs' else None)
    if runner is not None:
        actual = 'compact'
        opts = cmd[runner + 1:]
        opts = opts[:opts.index('--')] if '--' in opts else opts
        for i, arg in enumerate(opts):
            if arg == '--output-level' and i + 1 < len(opts):
                actual = opts[i + 1]
            elif arg.startswith('--output-level='):
                actual = arg.split('=', 1)[1]
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    start = time.monotonic()
    cpu0 = resource.getrusage(resource.RUSAGE_CHILDREN)
    child = None
    timed_out = False
    cancelled = None
    error = None
    out, err = b'', b''
    class Cancelled(Exception):
        pass
    def cancel(signum, _frame):
        nonlocal cancelled
        cancelled = signum
        raise Cancelled()
    previous = {s: signal.signal(s, cancel) for s in (signal.SIGINT, signal.SIGTERM)}
    try:
        child = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        try:
            out, err = child.communicate(timeout=a.timeout)
        except (subprocess.TimeoutExpired, Cancelled) as exc:
            timed_out = isinstance(exc, subprocess.TimeoutExpired)
            # Only the process group created above belongs to this recorder.
            for s in previous:
                signal.signal(s, signal.SIG_IGN)
            for sig in (signal.SIGTERM, signal.SIGKILL):
                try:
                    os.killpg(child.pid, sig)
                except ProcessLookupError:
                    pass
                try:
                    out, err = child.communicate(timeout=.3)
                    break
                except subprocess.TimeoutExpired as pending:
                    out, err = pending.output or b'', pending.stderr or b''
            else:
                # Detached descendants may retain pipes; do not wait for them.
                child.stdout.close()
                child.stderr.close()
                child.wait()
    except OSError as exc:
        error = str(exc)
    finally:
        for s, handler in previous.items():
            signal.signal(s, handler)
        if lock:
            lock.close()
    wall = time.monotonic() - start
    cpu1 = resource.getrusage(resource.RUSAGE_CHILDREN)
    cpu = cpu1.ru_utime + cpu1.ru_stime - cpu0.ru_utime - cpu0.ru_stime
    code = child.returncode if child else None
    with os.fdopen(outfd, 'wb') as stream:
        stream.write(out)
    with os.fdopen(errfd, 'wb') as stream:
        stream.write(err)
    full = out + (b'\n[stderr]\n' + err if err else b'')
    shown = full[:a.limit]
    entry = dict(id=ident, tag=a.tag, argv=cmd, cwd=str(cwd), git_head=head,
                 started_at=started, ended_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                 command_wall_seconds=wall, reaped_child_cpu_seconds=cpu, lock_wait_seconds=lock_wait,
                 actual_route_output_level=actual, declared_output_level=a.mode,
                 declared_mode_mismatch=a.mode is not None and actual != a.mode, requested_byte_limit=a.limit,
                 large_output_reason=a.large_output_reason, captured_stdout_bytes=len(out),
                 captured_stderr_bytes=len(err), stdout_path=str(outpath), stderr_path=str(errpath),
                 exit_code=code, signal=-code if code is not None and code < 0 else None,
                 launch_error=error, timed_out=timed_out, cancelled_signal=cancelled,
                 display_truncated=len(full) > len(shown), host_model_visible_bytes=None, billed_tokens=None,
                 budget_overshoot=dict(commands=max(0, len(old)+1-a.command_budget),
                                       wall_seconds=max(0, wall_used+wall-a.time_budget),
                                       cpu_seconds=max(0, cpu_used+cpu-a.cpu_budget)),
                 limitations='Budgets checked between commands; CPU is Python reaped-child usage, not a process-tree quota. Cleanup covers owned process group, not detached descendants.')
    receipt = dict(record_id=ident, records_path=str(records), exit_code=code, timed_out=timed_out,
                   actual_route_output_level=actual, declared_output_level=a.mode,
                   mode_mismatch=a.mode is not None and actual != a.mode, truncated=entry['display_truncated'])
    display = shown + b'\n' + json.dumps(receipt).encode() + b'\n'
    entry['terminal_emitted_bytes'] = len(display)
    ledger.seek(0, 2)
    ledger.write(json.dumps(entry) + '\n')
    ledger.flush()
    ledger.close()
    sys.stdout.buffer.write(display)
    return 128 + cancelled if cancelled else 124 if timed_out else 127 if error else code if code >= 0 else 128-code


if __name__ == '__main__':
    sys.exit(main())
