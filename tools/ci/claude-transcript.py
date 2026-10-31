#!/usr/bin/env python3
"""@doc Download one Claude cloud conversation via the official teleport/export CLI flow.

Uses a dedicated, already trusted checkout configured by APEX_CLAUDE_READ_CWD.
Never approves trust/login prompts, sends a model prompt, or changes the main checkout.
The PTY transcript is private process memory and is never returned as diagnostics.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import pty
import re
import select
import shutil
import struct
import subprocess
import sys
import termios
import time


def terminal_text(data, width=160, height=40):
    """Reconstruct the visible PTY screen; cursor-diff output omits unchanged letters."""
    cells = {}
    row = col = 0
    saved = (0, 0)
    i = 0
    while i < len(data):
        char = data[i]
        if char == "\x1b":
            match = re.match(r"\x1b\[([0-?]*)([ -/]*)([@-~])", data[i:])
            if match:
                raw, _, op = match.groups()
                nums = [int(x) if x.isdigit() else 0 for x in raw.lstrip("?").split(";")]
                n = nums[0] or 1
                if op in "Hf": row, col = max(0, nums[0] - 1), max(0, (nums[1] if len(nums) > 1 else 1) - 1)
                elif op == "A": row = max(0, row - n)
                elif op == "B": row = min(height - 1, row + n)
                elif op == "C": col = min(width - 1, col + n)
                elif op == "D": col = max(0, col - n)
                elif op == "G": col = max(0, n - 1)
                elif op == "d": row = max(0, n - 1)
                elif op == "J":
                    mode = nums[0]
                    cells = {p: c for p, c in cells.items() if not (mode in (2, 3) or (mode == 0 and p >= (row, col)) or (mode == 1 and p <= (row, col)))}
                elif op == "K":
                    mode = nums[0]
                    cells = {p: c for p, c in cells.items() if not (p[0] == row and (mode == 2 or (mode == 0 and p[1] >= col) or (mode == 1 and p[1] <= col)))}
                elif op == "s": saved = (row, col)
                elif op == "u": row, col = saved
                elif op == "h" and raw == "?1049": cells = {}; row = col = 0
                i += len(match.group(0)); continue
            if data[i:i + 2] == "\x1b]":
                match = re.match(r"\x1b\][^\x07]*(?:\x07|\x1b\\)", data[i:])
                if not match: break
                i += len(match.group(0)); continue
            if data[i:i + 2] == "\x1b7": saved = (row, col)
            elif data[i:i + 2] == "\x1b8": row, col = saved
            i += 2; continue
        if char == "\r": col = 0
        elif char == "\n": row += 1
        elif char == "\b": col = max(0, col - 1)
        elif char >= " ":
            if col >= width: col = 0; row += 1
            if row >= height:
                cells = {(r - 1, c): v for (r, c), v in cells.items() if r > 0}; row = height - 1
            cells[(row, col)] = char; col += 1
        if row >= height:
            cells = {(r - 1, c): v for (r, c), v in cells.items() if r > 0}; row = height - 1
        i += 1
    return "\n".join("".join(cells.get((r, c), " ") for c in range(width)).rstrip() for r in range(height))


def git(cwd, *args):
    return subprocess.check_output(["git", "-C", str(cwd), *args], text=True, stderr=subprocess.DEVNULL, timeout=10).strip()


def download(session_id, output, root, timeout=42):
    binary = os.environ.get("APEX_CLAUDE_BIN") or shutil.which("claude")
    reader_value = os.environ.get("APEX_CLAUDE_READ_CWD")
    if not binary or not reader_value:
        return {"ok": False, "error": "reader_setup_required", "message": "Configure APEX_CLAUDE_BIN/PATH and APEX_CLAUDE_READ_CWD on the MCP host; sign in and trust the dedicated clone manually."}
    reader = Path(reader_value).resolve()
    root = Path(root).resolve()
    if reader == root or root in reader.parents or reader in root.parents:
        return {"ok": False, "error": "reader_not_isolated"}
    if Path(git(reader, "rev-parse", "--show-toplevel")).resolve() != reader:
        return {"ok": False, "error": "reader_not_repository_root"}
    def common(cwd):
        return (cwd / git(cwd, "rev-parse", "--git-common-dir")).resolve()
    if common(reader) == common(root):
        return {"ok": False, "error": "reader_not_isolated", "message": "Use a separate clone, not a linked worktree of the main checkout."}
    if not re.search(r"[:/]brycejmurrin/f1-game(?:\.git)?$", git(reader, "remote", "get-url", "origin")):
        return {"ok": False, "error": "reader_wrong_repository"}
    if git(reader, "status", "--porcelain"):
        return {"ok": False, "error": "reader_dirty", "message": "The dedicated reader clone must be clean; no stashing or resetting is automatic."}
    output = Path(output).resolve()
    if not output.is_relative_to(root / "artifacts" / "claude-transcripts") or not re.fullmatch(r"[\w./-]+", str(output)):
        return {"ok": False, "error": "invalid_export_path"}
    if output.exists():
        return {"ok": False, "error": "export_already_exists"}
    lock_path = common(reader) / "apex-claude-reader.lock"
    with lock_path.open("a", encoding="utf8") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {"ok": False, "error": "reader_busy"}
        return drive(binary, session_id, reader, output, timeout)


def drive(binary, session_id, reader, output, timeout):
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 160, 0, 0))
    child = None
    try:
        child = subprocess.Popen([binary, "--safe-mode", "--tools", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--teleport", session_id], cwd=reader, stdin=slave, stdout=slave, stderr=slave, close_fds=True)
        os.close(slave)
        slave = None
        deadline = time.monotonic() + timeout
        transcript = ""
        flat = ""
        phase = "loading"
        typed_at = 0
        enters = 0
        while time.monotonic() < deadline:
            readable, _, _ = select.select([master], [], [], 0.1)
            if readable:
                try:
                    chunk = os.read(master, 65536)
                except OSError:
                    chunk = b""
                if not chunk and child.poll() is not None:
                    break
                transcript += chunk.decode("utf8", errors="replace")
                if len(transcript) > 2 * 1024 * 1024:
                    return {"ok": False, "error": "reader_output_limit"}
            plain = terminal_text(transcript)
            flat = re.sub(r"\s+", "", plain).lower()
            raw_plain = re.sub(r"\x1b\][^\x07]*(?:\x07|\x1b\\)", "", transcript)
            raw_plain = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", raw_plain)
            raw_flat = re.sub(r"\s+", "", raw_plain).lower()
            if "trustthisfolder" in flat or "signintoclaude" in flat or "pastecodehere" in flat:
                return {"ok": False, "error": "reader_setup_required", "message": "Complete the CLI trust/login flow manually in the dedicated reader clone."}
            if phase == "loading" and "sessionresumed" in raw_flat and "❯" in raw_plain[-8000:]:
                # A built-in command only, never a model prompt. Type and Enter separately to
                # avoid bracketed-paste confirmation being mistaken for command completion.
                os.write(master, ("/export " + str(output)).encode())
                typed_at = time.monotonic()
                phase = "typed"
            elif phase == "typed" and time.monotonic() - typed_at > 0.5:
                os.write(master, b"\r")
                enters = 1
                phase = "exporting"
            elif phase == "exporting" and "reviewandpressentertosend" in flat and enters < 2:
                os.write(master, b"\r")
                enters += 1
            elif phase == "exporting" and any(("exportedto:" + str(output).lower()) in screen for screen in (flat, raw_flat)) and output.is_file():
                if output.stat().st_size == 0 or output.stat().st_size > 8 * 1024 * 1024:
                    return {"ok": False, "error": "snapshot_size_invalid"}
                output.chmod(0o600)
                return {"ok": True, "source": "cloud_teleport_export", "bytes": output.stat().st_size, "newCloudMessagesSent": 0}
            if child.poll() is not None:
                break
        return {"ok": False, "error": "reader_incomplete", "phase": phase, "milestones": {name: token in flat for name, token in {"validating": "validatingsession", "logs": "fetchingsessionlogs", "branch": "gettingbranchinfo", "checkout": "checkingoutbranch", "resumed": "sessionresumed", "exported": "exportedto:"}.items()}, "message": "Teleport/export did not finish with a confirmed snapshot before the deadline; no cached success is substituted."}
    finally:
        if child is not None and child.poll() is None:
            try:
                os.write(master, b"\x03\x03")
                child.wait(timeout=1)
            except (OSError, subprocess.TimeoutExpired):
                child.terminate()
                try:
                    child.wait(timeout=1)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()
        os.close(master)
        if slave is not None:
            os.close(slave)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--id", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--root", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"(?:cse_|session_)[A-Za-z0-9_-]{1,128}", args.id):
        result = {"ok": False, "error": "bad_session_id"}
    else:
        try:
            result = download(args.id, args.output, args.root)
        except Exception:
            result = {"ok": False, "error": "reader_failed", "message": "Reader preflight or CLI failed; check dedicated checkout/authentication without exposing credentials."}
    print(json.dumps(result))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
