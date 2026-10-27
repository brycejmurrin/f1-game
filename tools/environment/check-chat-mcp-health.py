#!/usr/bin/env python3
# @doc Check chat mcp health: canonical F1 environment and plugin support.
"""Verify the lifecycle owner's single tunnel child and its live readiness."""
import json
import os
import subprocess
import time
from pathlib import Path

def tunnel_children(proc_root, binary):
    children = []
    for entry in proc_root.iterdir():
        if not entry.name.isdigit():
            continue
        try:
            command = (entry / 'cmdline').read_bytes().split(b'\0', 1)[0].decode()
            if command != binary:
                continue
            stat = (entry / 'stat').read_text().rsplit(') ', 1)[1].split()
            if stat[0] != 'Z':
                children.append((int(entry.name), int(stat[1])))
        except (OSError, ValueError):
            continue
    return children

def main():
    record = Path('/workspace/f1-game/artifacts/run/chat-mcp/service.json')
    binary = str(Path(os.environ['APEX_TUNNEL_CLIENT_BIN']).resolve())
    deadline = time.monotonic() + 90
    last_error = 'Tunnel listener not discovered'
    while time.monotonic() < deadline:
        try:
            owner = json.loads(record.read_text())
            stat = (Path('/proc') / str(owner['pid']) / 'stat').read_text().rsplit(') ', 1)[1].split()
            if stat[19] != owner['identity'] or stat[0] == 'Z':
                raise RuntimeError('Supervisor identity is stale')
            children = tunnel_children(Path('/proc'), binary)
            if len(children) > 1:
                raise SystemExit('FAIL: multiple tunnel runtimes; inspect lifecycle owners before recovery')
            if len(children) != 1 or children[0][1] != owner['pid']:
                raise RuntimeError('Waiting for the supervised tunnel child')
            pid = children[0][0]
            # Native URL discovery avoids ptrace-gated /proc fd/exe and ss ownership.
            locator = record.parent / 'health.url'
            from urllib.parse import urlsplit
            address = urlsplit(locator.read_text().strip())
            if address.scheme != 'http' or address.hostname != '127.0.0.1' or not address.port:
                raise RuntimeError('Health locator must be a loopback HTTP URL')
            result = subprocess.run([binary, 'health', '--url-file', str(locator), '--pid', str(pid),
                                     '--require-control-plane-poll', '--json'],
                                    capture_output=True, text=True, timeout=5)
            if result.returncode == 0:
                report = json.loads(result.stdout)
                if report.get('result') == 'ok':
                    print(json.dumps({'ok': True, 'tunnelRuntimes': 1, 'pid': pid,
                                      'readyz': report['readyz']['status'],
                                      'controlPlanePoll': report['control_plane_poll']['ok']}))
                    break
            last_error = 'Tunnel health or control-plane polling is not ready'
        except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError) as error:
            last_error = str(error)
        time.sleep(0.5)
    else:
        raise SystemExit('FAIL: MCP readiness deadline exceeded: ' + last_error)

if __name__ == '__main__':
    main()
