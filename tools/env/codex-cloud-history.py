#!/usr/bin/env python3
# @doc Export archived or selected Codex Cloud transcripts and native subagents through read-only history APIs.
"""Read persisted Codex Cloud history into private checkpoints and a redacted share tree."""
import argparse
import asyncio
import collections
import json
import logging
import os
from pathlib import Path
import re
import selectors
import ssl
import subprocess
import time
from urllib.parse import quote, quote_plus


ENDPOINT = "wss://codex-cloud-backend.chatgpt.com/"
READ_METHODS = {"initialize", "thread/list", "thread/read", "thread/items/list"}
MAX_PAGES = 10000
ROTATE_BYTES = 48 * 1024 * 1024
MARKER = "[REDACTED CREDENTIAL]"
DROP = object()
REASONING_KEYS = {"reasoning", "reasoningcontent", "reasoningsummary", "encryptedreasoning",
                  "encryptedcontent", "chainofthought"}
SECRET_KEYS = {"authorization", "cookie", "setcookie", "password", "passwd", "token",
               "clientsecret", "apikey", "credential", "credentials", "authcredentials",
               "sourcerepositorycredential", "privatekey", "secret", "bearer"}
JWT = re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b")
ASSIGNMENT = re.compile(
    r"(?i)\b(?:access[_-]?token|refresh[_-]?token|auth[_-]?token|api[_-]?key|"
    r"client[_-]?secret|password)\b[\"']?\s*[:=]\s*[\"']?([^\s\"',;}]+)")
BEARER = re.compile(r"(?i)\bBearer\s+([A-Za-z0-9._~+/-]{8,}=*)")
KNOWN_KEYS = re.compile(
    r"(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|"
    r"github_pat_[A-Za-z0-9_]{20,}|AIza[A-Za-z0-9_-]{20,}|ya29\.[A-Za-z0-9._-]{15,}|"
    r"xox[baprs]-[A-Za-z0-9-]{12,})\b")
PRIVATE_KEY = re.compile(r"-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----.*?-----END \1-----", re.DOTALL)
HEADER_LINE = re.compile(r"(?im)^\s*(?:authorization|proxy-authorization|cookie|set-cookie)\s*:\s*([^\r\n]+)")
SECRET_HEADERS = {"authorization", "proxyauthorization", "cookie", "setcookie", "xapikey"}


class ExportError(Exception):
    """Only fixed, non-sensitive reasons belong in this exception."""


def normalized(key):
    return re.sub(r"[^a-z0-9]", "", str(key).lower())


def strip_reasoning(value):
    if isinstance(value, dict):
        wrapped = value.get("item")
        if (value.get("type") in {"reasoning", "reasoningSummary"}
                or isinstance(wrapped, dict) and wrapped.get("type") in {"reasoning", "reasoningSummary"}):
            return DROP
        return {key: clean for key, child in value.items()
                if normalized(key) not in REASONING_KEYS
                and (clean := strip_reasoning(child)) is not DROP}
    if isinstance(value, list):
        return [clean for child in value if (clean := strip_reasoning(child)) is not DROP]
    return value


def refuse_tracked_output(path):
    """Inside a git checkout, private transcripts may only land on an ignored path (scratch/, artifacts/)."""
    probe = path.resolve()
    while not probe.exists():
        probe = probe.parent
    cwd = probe if probe.is_dir() else probe.parent
    inside = subprocess.run(["git", "rev-parse", "--is-inside-work-tree"], cwd=cwd,
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    if inside.returncode != 0 or inside.stdout.strip() != "true":
        return
    ignored = subprocess.run(["git", "check-ignore", "-q", "--no-index", str(path.resolve() / "_private")], cwd=cwd,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if ignored.returncode != 0:
        raise ExportError("output_not_gitignored")


def private_dir(path):
    if path.is_symlink():
        raise ExportError("symlink_output_refused")
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.chmod(0o700)


def write_json(path, value):
    """Never persist reasoning, even in the unredacted private checkpoint tree."""
    private_dir(path.parent)
    temporary = path.with_name(path.name + ".new")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as output:
        os.fchmod(output.fileno(), 0o600)
        json.dump(strip_reasoning(value), output, indent=2, ensure_ascii=False)
        output.write("\n")
    os.replace(temporary, path)


def read_json(path):
    if path.is_symlink():
        raise ExportError("symlink_input_refused")
    return json.loads(path.read_text(encoding="utf-8"))


def thread_id(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value):
        raise ExportError("invalid_thread_identity")
    return value


def failure(error):
    """Transport exception strings may contain the bearer subprotocol. Do not format them."""
    result = {"errorClass": type(error).__name__}
    if isinstance(error, ExportError):
        result["reason"] = error.args[0]
    status = getattr(getattr(error, "response", None), "status_code", None)
    if isinstance(status, int):
        result["httpStatus"] = status
    return result


class AuthIPC:
    """Use official Codex authentication IPC; never open the credential store."""

    def __init__(self, command):
        self.process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE)
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.process.stdout, selectors.EVENT_READ, "stdout")
        self.selector.register(self.process.stderr, selectors.EVENT_READ, "stderr")
        self.buffer = b""
        self.sequence = 0

    def send(self, message):
        self.process.stdin.write(json.dumps(message).encode() + b"\n")
        self.process.stdin.flush()

    def request(self, method, params):
        if method not in {"initialize", "getAuthStatus"}:
            raise ExportError("auth_method_outside_allowlist")
        self.sequence += 1
        self.send({"id": self.sequence, "method": method, "params": params})
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            while b"\n" in self.buffer:
                line, self.buffer = self.buffer.split(b"\n", 1)
                if not line.strip():
                    continue
                message = json.loads(line)
                if message.get("id") != self.sequence:
                    continue
                if "error" in message:
                    raise ExportError("official_auth_ipc_rejected")
                return message["result"]
            for key, _ in self.selector.select(max(0, deadline - time.monotonic())):
                chunk = os.read(key.fileobj.fileno(), 65536)
                if not chunk:
                    if key.data == "stdout":
                        raise ExportError("official_auth_ipc_closed")
                    self.selector.unregister(key.fileobj)
                elif key.data == "stdout":
                    self.buffer += chunk
                    if len(self.buffer) > 4 * 1024 * 1024:
                        raise ExportError("official_auth_reply_too_large")
                # Drain stderr without logging credentials or diagnostics.
        raise ExportError("official_auth_ipc_timeout")

    def close(self):
        try:
            if self.process.poll() is None:
                self.process.terminate()
                try:
                    self.process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                    self.process.wait()
        finally:
            self.selector.close()
            for stream in (self.process.stdin, self.process.stdout, self.process.stderr):
                stream.close()


def get_auth_token(command):
    client = AuthIPC(command)
    try:
        client.request("initialize", {"clientInfo": {"name": "apex_history_export", "version": "1.0.0"}})
        client.send({"method": "initialized", "params": {}})
        auth = client.request("getAuthStatus", {"includeToken": True, "refreshToken": True})
        token = auth.get("authToken")
        if not isinstance(token, str) or not token or token.startswith("sk-"):
            raise ExportError("chatgpt_sign_in_required")
        return token
    finally:
        client.close()


class HostedClient:
    def __init__(self, auth_command):
        self.auth_command = auth_command
        self.ws = None
        self.sequence = 0
        self.received_bytes = 0
        self.server = {}
        self.secret_values = set()

    async def connect(self):
        from websockets.asyncio.client import connect

        class NoRedirect(connect):
            def process_redirect(self, exc):
                return exc  # Never carry the bearer subprotocol to a redirected host.

        token = await asyncio.to_thread(get_auth_token, self.auth_command)
        self.secret_values.add(token)
        logger = logging.getLogger("apex.history.export.websocket")
        logger.disabled = True
        self.ws = await NoRedirect(
            ENDPOINT, subprotocols=["codex-app-server", "codex-client.browser", "openai-bearer." + token],
            origin="https://chatgpt.com", proxy=True, ssl=ssl.create_default_context(),
            open_timeout=30, close_timeout=3, max_size=64 * 1024 * 1024, logger=logger)
        token = None
        self.received_bytes = 0
        self.server = await self._call("initialize", {
            "clientInfo": {"name": "apex_history_export", "title": "Apex History Export", "version": "1.0.0"},
            "capabilities": {"experimentalApi": True}})
        await self.ws.send(json.dumps({"method": "initialized", "params": {}}))

    async def close(self):
        if self.ws is not None:
            await self.ws.close()
            self.ws = None

    async def _call(self, method, params):
        if method not in READ_METHODS:
            raise ExportError("hosted_method_outside_allowlist")
        self.sequence += 1
        await self.ws.send(json.dumps({"id": self.sequence, "method": method, "params": params}))
        async with asyncio.timeout(60):
            while True:
                raw = await self.ws.recv()
                self.received_bytes += len(raw.encode() if isinstance(raw, str) else raw)
                message = json.loads(raw)
                if "method" in message and "id" in message:
                    # Do not answer approval requests, refresh requests, or any other server request.
                    raise ExportError("server_request_left_unanswered")
                if "error" in message and message.get("id") in (None, self.sequence):
                    raise ExportError("hosted_rpc_rejected")
                if message.get("id") == self.sequence:
                    result = message["result"]
                    if not isinstance(result, dict):
                        raise ExportError("unexpected_rpc_result")
                    return result

    async def call(self, method, params):
        if method not in READ_METHODS - {"initialize"}:
            raise ExportError("hosted_method_outside_allowlist")
        for attempt in range(3):
            try:
                if self.ws is None or self.received_bytes >= ROTATE_BYTES:
                    await self.close()
                    await self.connect()
                return await self._call(method, params)
            except ExportError:
                await self.close()
                raise
            except Exception:
                await self.close()
                if attempt == 2:
                    raise
                await asyncio.sleep(attempt + 1)


def next_page(page, progress):
    if not isinstance(page.get("data"), list) or "nextCursor" not in page:
        raise ExportError("invalid_page_envelope")
    cursor = page["nextCursor"]
    seen = progress.setdefault("seenCursors", [])
    if cursor is not None:
        if not isinstance(cursor, str) or not cursor or cursor in seen:
            raise ExportError("invalid_or_repeated_cursor")
        seen.append(cursor)
    progress["pages"] = progress.get("pages", 0) + 1
    progress["nextCursor"] = cursor
    progress["done"] = cursor is None


def item_of(entry):
    return entry.get("item", entry) if isinstance(entry, dict) else {}


def references(entry, parent):
    item = item_of(entry)
    kind = item.get("type")
    common = {"parentThreadId": parent, "itemId": item.get("id")}
    if kind == "subAgentActivity" and item.get("agentThreadId"):
        yield {**common, "childThreadId": thread_id(item["agentThreadId"]),
               "referenceKind": "subAgentActivity.agentThreadId", "requiresAncestry": True}
    elif kind == "collabAgentToolCall":
        values = [(v, "receiverThreadIds") for v in item.get("receiverThreadIds", []) or []]
        states = item.get("agentsStates") or {}
        if isinstance(states, dict):
            values.extend((v, "agentsStates") for v in states)
        for value, field in values:
            yield {**common, "childThreadId": thread_id(value),
                   "referenceKind": "collabAgentToolCall." + field, "requiresAncestry": True}


def reference_key(edge):
    return tuple(edge.get(field) for field in
                 ("parentThreadId", "itemId", "childThreadId", "referenceKind"))


def metadata_parent(metadata):
    if metadata.get("parentThreadId"):
        return thread_id(metadata["parentThreadId"])
    source = metadata.get("source")
    if isinstance(source, dict) and isinstance(source.get("subAgent"), dict):
        spawn = source["subAgent"].get("thread_spawn", {})
        if isinstance(spawn, dict) and spawn.get("parent_thread_id"):
            return thread_id(spawn["parent_thread_id"])
    return None


class Exporter:
    def __init__(self, client, output, archived=False, threads=(), resume=False):
        self.client, self.output = client, output
        self.private = output / "_private"
        private_dir(output)
        private_dir(self.private)
        state_path = self.private / "state.json"
        scope = {"archived": archived, "threads": sorted(set(map(thread_id, threads)))}
        if state_path.exists():
            if not resume:
                raise ExportError("existing_export_requires_resume")
            self.state = read_json(state_path)
            if self.state.get("scope") != scope or self.state.get("version") != 1:
                raise ExportError("resume_scope_mismatch")
        else:
            self.state = {"version": 1, "scope": scope, "startedAtUnix": time.time(),
                          "roots": scope["threads"][:], "listing": {}, "threads": {}, "edges": []}
        self.metadata = {}

    def checkpoint(self):
        write_json(self.private / "state.json", self.state)

    async def read_metadata(self, identity):
        if identity not in self.metadata:
            result = await self.client.call("thread/read", {"threadId": identity, "includeTurns": False})
            if result.get("thread", {}).get("id") != identity:
                raise ExportError("returned_thread_identity_mismatch")
            self.metadata[identity] = result
        return self.metadata[identity]

    async def list_roots(self):
        progress = self.state["listing"]
        while not progress.get("done"):
            if progress.get("pages", 0) >= MAX_PAGES:
                raise ExportError("listing_page_bound_exceeded")
            params = {"archived": True, "limit": 50, "sortKey": "updated_at", "sortDirection": "desc"}
            if progress.get("nextCursor") is not None:
                params["cursor"] = progress["nextCursor"]
            page = await self.client.call("thread/list", params)
            for row in page.get("data", []):
                identity = thread_id(row.get("id"))
                if identity not in self.state["roots"]:
                    self.state["roots"].append(identity)
            write_json(self.private / "listing" / f"page-{progress.get('pages', 0):06d}.json",
                       {"request": params, "response": page})
            next_page(page, progress)
            self.checkpoint()

    async def authorized_collab(self, identity):
        """A recorded reference is not proof its target is a descendant."""
        seen = set()
        authorized = set(self.state["roots"]) | {
            edge["childThreadId"] for edge in self.state["edges"] if edge.get("status") == "accepted"}
        for _ in range(64):
            if identity in authorized:
                return True
            if identity in seen:
                return False
            seen.add(identity)
            meta = (await self.read_metadata(identity))["thread"]
            identity = metadata_parent(meta)
            if identity is None:
                return False
        return False

    async def export_thread(self, identity):
        progress = self.state["threads"].setdefault(identity, {})
        target = self.private / "threads" / identity
        private_dir(target)
        if progress.get("done") and progress.get("finishedAtUnix"):
            return
        initial = await self.read_metadata(identity)
        if not (target / "metadata.json").exists():
            write_json(target / "metadata.json", initial)
        progress.pop("failure", None)
        while not progress.get("done"):
            if progress.get("pages", 0) >= MAX_PAGES:
                raise ExportError("item_page_bound_exceeded")
            params = {"threadId": identity, "limit": 100, "sortDirection": "asc"}
            if progress.get("nextCursor") is not None:
                params["cursor"] = progress["nextCursor"]
            page = await self.client.call("thread/items/list", params)
            if not isinstance(page.get("data"), list):
                raise ExportError("invalid_page_envelope")
            edges = [edge for entry in page["data"] for edge in references(entry, identity)]
            known_edges = {reference_key(edge) for edge in self.state["edges"]}
            for edge in edges:
                if reference_key(edge) not in known_edges:
                    self.state["edges"].append(edge)
                    known_edges.add(reference_key(edge))
            write_json(target / "pages" / f"page-{progress.get('pages', 0):06d}.json",
                       {"request": params, "response": page})
            next_page(page, progress)
            self.checkpoint()
        final = await self.client.call("thread/read", {"threadId": identity, "includeTurns": False})
        if final.get("thread", {}).get("id") != identity:
            raise ExportError("returned_thread_identity_mismatch")
        write_json(target / "metadata-final.json", final)
        progress["finishedAtUnix"] = time.time()
        self.checkpoint()

    async def run(self):
        self.checkpoint()
        if self.state["scope"]["archived"]:
            await self.list_roots()
        queue = collections.deque(self.state["roots"])
        attempted = set()
        while queue:
            identity = queue.popleft()
            if identity in attempted:
                continue
            attempted.add(identity)
            try:
                await self.export_thread(identity)
            except Exception as error:
                self.state["threads"].setdefault(identity, {})["failure"] = failure(error)
                self.checkpoint()
            edges = sorted((e for e in self.state["edges"] if e["parentThreadId"] == identity),
                           key=lambda edge: edge["requiresAncestry"])
            for edge in edges:
                child = edge["childThreadId"]
                try:
                    allowed = not edge["requiresAncestry"] or await self.authorized_collab(child)
                    edge["status"] = "accepted" if allowed else "ancestry_unverified"
                    edge.pop("failure", None)
                    if allowed:
                        queue.append(child)
                except Exception as error:
                    edge["status"] = "failed"
                    edge["failure"] = failure(error)
                self.checkpoint()
        self.state["finishedAtUnix"] = time.time()
        self.checkpoint()
        return self.state


def sensitive_key(key):
    name = normalized(key)
    return name in SECRET_KEYS | SECRET_HEADERS or name.endswith((
        "accesstoken", "refreshtoken", "idtoken", "authtoken", "bearertoken", "clientsecret", "apikey"))


class Redactor:
    """Two passes ensure a credential echoed before its structured occurrence is removed."""

    def __init__(self, known_values=()):
        self.values = set(known_values)
        self.replacements = 0
        self._literal_count = -1
        self._literal_pattern = None

    def collect(self, value, secret=False):
        if isinstance(value, dict):
            header = normalized(value.get("name", value.get("headerName", ""))) in SECRET_HEADERS
            for key, child in value.items():
                self.collect(key)  # Known-format credentials can also be echoed as map keys.
                self.collect(child, secret or sensitive_key(key)
                             or header and normalized(key) in {"value", "headervalue"})
        elif isinstance(value, list):
            if len(value) == 2 and isinstance(value[0], str) and normalized(value[0]) in SECRET_HEADERS:
                self.collect(value[1], True)
            for child in value:
                self.collect(child, secret)
        elif isinstance(value, str):
            if secret and value and value != MARKER:
                self.values.add(value)
            self.values.update(JWT.findall(value))
            self.values.update(ASSIGNMENT.findall(value))
            self.values.update(BEARER.findall(value))
            self.values.update(KNOWN_KEYS.findall(value))
            self.values.update(match.group() for match in PRIVATE_KEY.finditer(value))
            self.values.update(HEADER_LINE.findall(value))
            if value.lstrip().startswith(("{", "[")):
                try:
                    self.collect(json.loads(value))
                except (ValueError, RecursionError):
                    pass

    def redact(self, value):
        if isinstance(value, dict):
            header = normalized(value.get("name", value.get("headerName", ""))) in SECRET_HEADERS
            result, reserved = {}, set(value)
            for ordinal, (key, child) in enumerate(value.items(), 1):
                clean_key = self.redact(key)
                if clean_key != key and (clean_key in result or clean_key in reserved):
                    label, suffix = clean_key, ordinal
                    while clean_key in result or clean_key in reserved:
                        clean_key = f"{label} [key {suffix}]"
                        suffix += 1
                result[clean_key] = (MARKER if (sensitive_key(key) or header
                                    and normalized(key) in {"value", "headervalue"})
                                    and child not in (None, "") else self.redact(child))
            return result
        if isinstance(value, list):
            if len(value) == 2 and isinstance(value[0], str) and normalized(value[0]) in SECRET_HEADERS:
                return [value[0], MARKER]
            return [self.redact(child) for child in value]
        if isinstance(value, str):
            if value == MARKER:
                return value
            if value in self.values:
                self.replacements += 1
                return MARKER
            if value.lstrip().startswith(("{", "[")):
                try:
                    value = json.dumps(self.redact(json.loads(value)), ensure_ascii=False)
                except (ValueError, RecursionError):
                    pass
            if self._literal_count != len(self.values):
                variants = {variant for secret in self.values if len(secret) >= 8 and secret != MARKER
                            for variant in (secret, json.dumps(secret, ensure_ascii=False)[1:-1],
                                            quote(secret, safe=""), quote_plus(secret, safe=""))}
                self._literal_pattern = (re.compile("|".join(map(re.escape, sorted(variants, key=len, reverse=True))))
                                         if variants else None)
                self._literal_count = len(self.values)
            protected = [match.span() for match in re.finditer(re.escape(MARKER), value)]
            spans = []
            for pattern, group in ((self._literal_pattern, 0), (PRIVATE_KEY, 0), (JWT, 0),
                                   (KNOWN_KEYS, 0), (ASSIGNMENT, 1)):
                if pattern is None:
                    continue
                for match in pattern.finditer(value):
                    start, end = match.span(group)
                    if not any(start < right and end > left for left, right in protected):
                        spans.append((start, end))
            # Merge overlapping candidates in the original string and replace once.
            # Short secrets match exact scalars or assignment values, never arbitrary substrings.
            merged = []
            for start, end in sorted(spans):
                if merged and start <= merged[-1][1]:
                    merged[-1] = (merged[-1][0], max(merged[-1][1], end))
                else:
                    merged.append((start, end))
            parts, previous = [], 0
            for start, end in merged:
                parts.extend((value[previous:start], MARKER))
                previous = end
            parts.append(value[previous:])
            self.replacements += len(merged)
            return "".join(parts)
        return value


def markdown(document):
    lines = ["# Codex Cloud persisted transcript", "", "Reasoning excluded; credentials redacted.", ""]
    for entry in document["items"]:
        item = item_of(entry)
        text = json.dumps(entry, indent=2, ensure_ascii=False)
        fence = "`" * max(3, max((len(m.group()) + 1 for m in re.finditer(r"`+", text)), default=0))
        lines.extend(["## " + str(item.get("type", "unknown")), "", fence + "json", text, fence, ""])
    return "\n".join(lines)


def build_share(output, state, known_secrets=(), include_markdown=False):
    private, share = output / "_private", output / "share"
    private_dir(share)
    redactor = Redactor(known_secrets)
    files = sorted(private.rglob("*.json"))
    for path in files:
        redactor.collect(read_json(path))
    counts = collections.Counter()
    total = 0
    for identity, progress in state["threads"].items():
        source = private / "threads" / thread_id(identity)
        target = share / "threads" / identity
        entries = []
        latest = {}
        duplicate_versions = 0
        for path in sorted((source / "pages").glob("*.json")):
            envelope = redactor.redact(read_json(path))
            write_json(target / "pages" / path.name, envelope)
            for entry in envelope["response"]["data"]:
                item = item_of(entry)
                key = item.get("id")
                if key is None:
                    entries.append(entry)  # Preserve future or unknown identity-less record types.
                elif key in latest:
                    duplicate_versions += 1
                    entries[latest[key]] = entry
                else:
                    latest[key] = len(entries)
                    entries.append(entry)
        for name in ("metadata.json", "metadata-final.json"):
            if (source / name).exists():
                write_json(target / name, redactor.redact(read_json(source / name)))
        document = {"threadId": identity, "paginationComplete": progress.get("done", False),
                    "failure": progress.get("failure"), "duplicateVersionsObserved": duplicate_versions,
                    "items": entries}
        write_json(target / "transcript.json", document)
        if include_markdown or (target / "transcript.md").exists():
            private_dir(target)
            path = target / "transcript.md"
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                os.fchmod(stream.fileno(), 0o600)
                stream.write(markdown(document))
        counts.update(str(item_of(entry).get("type", "unknown")) for entry in entries)
        total += len(entries)
    for path in sorted((private / "listing").glob("*.json")):
        write_json(share / "listing" / path.name, redactor.redact(read_json(path)))
    missing = [e for e in state["edges"] if e.get("status") != "accepted"]
    failed = {k: v["failure"] for k, v in state["threads"].items() if "failure" in v}
    required_threads = set(state["roots"]) | set(state["scope"]["threads"]) | {
        edge["childThreadId"] for edge in state["edges"] if edge.get("status") == "accepted"}
    complete = (required_threads.issubset(state["threads"])
                and all(p.get("done") and "failure" not in p for p in state["threads"].values())
                and not missing and (not state["scope"]["archived"] or state["listing"].get("done", False)))
    manifest = {"version": 1, "scope": state["scope"], "rootThreadIds": state["roots"],
                "threads": state["threads"], "graph": state["edges"], "failedThreads": failed,
                "unresolvedReferences": missing, "captureTraversalComplete": complete,
                "threadCount": len(state["threads"]), "visibleItemCount": total, "itemTypes": dict(counts),
                "credentialCandidates": len(redactor.values), "credentialReplacements": redactor.replacements,
                "startedAtUnix": state["startedAtUnix"], "packagedAtUnix": time.time(),
                "endpoint": ENDPOINT, "taskMutationsRequested": False, "reasoningIncluded": False,
                "limits": ["Only persisted records available at retrieval time; not an atomic snapshot.",
                           "Missing or truncated command/MCP outputs cannot be recovered by this exporter.",
                           "Image and file references do not include their original bytes.",
                           "Upstream retention and access rules apply; pagination completion is not output completeness.",
                           "Credential redaction is conservative and cannot guarantee removal of every secret."]}
    write_json(share / "manifest.json", redactor.redact(manifest))
    return manifest


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument("--archived", action="store_true", help="Export archived roots and their native descendants only")
    scope.add_argument("--thread", action="append", default=[], metavar="ID", help="Explicit root thread; repeat to select more")
    parser.add_argument("--output", required=True, type=Path, metavar="DIR")
    parser.add_argument("--auth-command", default='["codex","app-server","--stdio"]',
                        metavar="JSON_ARGV", help="Official Codex auth IPC command as a JSON array; never a shell string")
    parser.add_argument("--resume", action="store_true", help="Continue this exact export scope from private page checkpoints")
    parser.add_argument("--markdown", action="store_true", help="Also render redacted native records as Markdown")
    args = parser.parse_args(argv)
    try:
        args.auth_command = json.loads(args.auth_command)
    except ValueError:
        parser.error("--auth-command must be a JSON argv array")
    if not isinstance(args.auth_command, list) or not args.auth_command or not all(
            isinstance(word, str) and word and "\x00" not in word for word in args.auth_command):
        parser.error("--auth-command must be a nonempty array of nonempty strings")
    return args


async def main(args):
    refuse_tracked_output(args.output)
    client = HostedClient(args.auth_command)
    exporter = Exporter(client, args.output, args.archived, args.thread, args.resume)
    try:
        await exporter.run()
    finally:
        await client.close()
        manifest = build_share(args.output, exporter.state, client.secret_values, args.markdown)
    print(json.dumps({"output": str(args.output / "share"), "threads": manifest["threadCount"],
                      "visibleItems": manifest["visibleItemCount"],
                      "captureTraversalComplete": manifest["captureTraversalComplete"]}))
    return 0 if manifest["captureTraversalComplete"] else 2


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main(arguments())))
    except (Exception, KeyboardInterrupt) as error:
        print(json.dumps({"failed": True, **failure(error)}))
        raise SystemExit(1)
