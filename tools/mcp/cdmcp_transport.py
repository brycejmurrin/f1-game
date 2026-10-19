# @doc Shared JSON-RPC stdio transport for the DevTools CLI and measurement adapters.
"""Newline JSON-RPC transport shared by the DevTools CLI and measure adapters.

Adapters own initialization, page selection and tools/call error policy. This
leaf owns only subprocess IO, request correlation and explicit close policies.
Subprocess contracts: https://docs.python.org/3/library/subprocess.html#popen-objects
"""
from __future__ import annotations

import json
import subprocess
import threading
import time


class StdioRpcClient:
    def __init__(
        self,
        argv: list[str],
        *,
        roots: list[dict],
        timeout: float,
        shutdown: str,
        unknown_request_error: bool,
        strict_server_requests: bool,
    ) -> None:
        if shutdown not in ("eof", "kill"):
            raise ValueError(f"unsupported shutdown policy: {shutdown}")
        self._id = 0
        self._pending: dict[int, dict] = {}
        self._lock = threading.Lock()
        self._roots = roots
        self._timeout = timeout
        self._shutdown = shutdown
        self._unknown_request_error = unknown_request_error
        self._strict_server_requests = strict_server_requests
        # Inherit the caller's environment and keep wrapper argv unchanged.
        self.proc = subprocess.Popen(
            argv,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        assert self.proc.stdin and self.proc.stdout
        threading.Thread(target=self._reader, daemon=True).start()

    def _send(self, payload: dict) -> None:
        assert self.proc.stdin
        # Server replies, notifications and requests share one write boundary.
        with self._lock:
            self.proc.stdin.write(json.dumps(payload) + "\n")
            self.proc.stdin.flush()

    def _reply(self, rid: int, result: dict) -> None:
        self._send({"jsonrpc": "2.0", "id": rid, "result": result})

    def _handle_server_request(self, msg: dict) -> None:
        if msg["method"] == "roots/list":
            self._reply(msg["id"], {"roots": self._roots})
        elif self._unknown_request_error:
            self._send({
                "jsonrpc": "2.0", "id": msg["id"],
                "error": {"code": -32601, "message": f"unsupported: {msg['method']}"},
            })
        else:
            self._reply(msg["id"], {})

    def _reader(self) -> None:
        assert self.proc.stdout
        for raw in self.proc.stdout:
            line = raw.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            if ("method" in msg and "id" in msg
                    and (not self._strict_server_requests or ("result" not in msg and "error" not in msg))):
                self._handle_server_request(msg)
                continue
            mid = msg.get("id")
            if mid is not None:
                with self._lock:
                    if mid in self._pending:
                        self._pending[mid]["result"] = msg

    def _request(self, method: str, params: dict | None = None) -> dict:
        with self._lock:
            self._id += 1
            rid = self._id
            self._pending[rid] = {}
        self._send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params or {}})
        deadline = time.time() + self._timeout
        while time.time() < deadline:
            with self._lock:
                if "result" in self._pending[rid]:
                    msg = self._pending.pop(rid)["result"]
                    if "error" in msg:
                        raise RuntimeError(json.dumps(msg["error"]))
                    return msg.get("result", msg)
            time.sleep(0.05)
        raise TimeoutError(method)

    def _notify(self, method: str, params: dict | None = None) -> None:
        self._send({"jsonrpc": "2.0", "method": method, "params": params or {}})

    def close(self) -> None:
        if self._shutdown == "eof":
            if self.proc.stdin:
                self.proc.stdin.close()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        else:
            # Never block the measure terminal line on a hung navigate.
            try:
                self.proc.kill()
            except Exception:
                pass
            try:
                self.proc.wait(timeout=3)
            except Exception:
                pass
