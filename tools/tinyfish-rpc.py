#!/usr/bin/env python3
"""Unwrap TinyFish MCP JSON-RPC tool results for shell helpers.

Measured 2026-08-17: fetch_content returns
  {result:{content:[{text: "<json string of {results,errors}>"}]}}
and markdown-format version.json wraps the body in a ``` fence. Agents grepping
the raw RPC for `"build": N` miss it; deploy-check must compare live vs local.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


def load_rpc(raw: str) -> dict[str, Any]:
    raw = raw.strip()
    if not raw:
        raise SystemExit("tinyfish-rpc: empty stdin")
    # Allow a trailing newline / accidental SSE "data:" prefix.
    if raw.startswith("data:"):
        raw = raw[5:].strip()
    return json.loads(raw)


def content_texts(rpc: dict[str, Any]) -> list[str]:
    if "error" in rpc:
        err = rpc["error"]
        raise SystemExit(f"tinyfish-rpc: RPC error: {err}")
    content = (rpc.get("result") or {}).get("content") or []
    out: list[str] = []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "text":
            out.append(block.get("text") or "")
    return out


def parse_fetch_payload(text: str) -> dict[str, Any]:
    """Inner JSON from a fetch_content text block (results + errors)."""
    return json.loads(text)


def result_bodies(rpc: dict[str, Any]) -> list[dict[str, Any]]:
    bodies: list[dict[str, Any]] = []
    for text in content_texts(rpc):
        try:
            payload = parse_fetch_payload(text)
        except json.JSONDecodeError:
            bodies.append({"url": None, "text": text, "errors": []})
            continue
        if isinstance(payload, dict) and "results" in payload:
            for row in payload.get("results") or []:
                bodies.append(row)
            # Surface top-level errors alongside.
            for err in payload.get("errors") or []:
                bodies.append({"url": None, "text": "", "error": err})
        else:
            bodies.append({"url": None, "text": text, "errors": []})
    return bodies


_BUILD_RE = re.compile(r'"build"\s*:\s*(\d+)')


def extract_build(text: str) -> int | None:
    if not text:
        return None
    m = _BUILD_RE.search(text)
    return int(m.group(1)) if m else None


def cmd_unwrap(args: argparse.Namespace) -> int:
    rpc = load_rpc(sys.stdin.read())
    bodies = result_bodies(rpc)
    if not bodies:
        # tools/list and similar — print pretty JSON of the result.
        print(json.dumps(rpc.get("result", rpc), indent=2, sort_keys=True))
        return 0
    for i, row in enumerate(bodies):
        if args.json:
            print(json.dumps(row, indent=2, sort_keys=True))
        else:
            url = row.get("url") or row.get("final_url")
            if url and len(bodies) > 1:
                print(f"## {url}")
            text = row.get("text") or ""
            if row.get("error"):
                print(f"ERROR: {row['error']}", file=sys.stderr)
            sys.stdout.write(text)
            if text and not text.endswith("\n"):
                sys.stdout.write("\n")
            if i < len(bodies) - 1:
                print("---")
    return 0


def cmd_deploy_summary(args: argparse.Namespace) -> int:
    rpc = load_rpc(sys.stdin.read())
    bodies = result_bodies(rpc)
    live = None
    for row in bodies:
        live = extract_build(row.get("text") or "")
        if live is not None:
            break
    if live is None:
        print("deploy-check: could not parse live build from TinyFish response", file=sys.stderr)
        print(json.dumps(rpc)[:2000], file=sys.stderr)
        return 2

    local = args.local_build
    if local is None and args.local_file:
        path = Path(args.local_file)
        local = int(json.loads(path.read_text())["build"])

    if local is None:
        print(f"live={live}  (no local version.json)")
        return 0

    if live == local:
        print(f"live={live} local={local} OK")
        return 0
    print(f"live={live} local={local} STALE — Pages has not shipped this tree's build")
    return 1


def cmd_live_build(args: argparse.Namespace) -> int:
    rpc = load_rpc(sys.stdin.read())
    for row in result_bodies(rpc):
        live = extract_build(row.get("text") or "")
        if live is not None:
            print(live)
            return 0
    print("tinyfish-rpc: could not parse live build", file=sys.stderr)
    return 2


def cmd_tool_names(args: argparse.Namespace) -> int:
    rpc = load_rpc(sys.stdin.read())
    tools = (rpc.get("result") or {}).get("tools") or []
    for t in tools:
        name = t.get("name", "")
        if name:
            print(name)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_unwrap = sub.add_parser("unwrap", help="print fetch_content bodies from an RPC response")
    p_unwrap.add_argument("--json", action="store_true", help="emit each result row as JSON")
    p_unwrap.set_defaults(func=cmd_unwrap)

    p_dep = sub.add_parser("deploy-summary", help="compare live version.json build to local")
    p_dep.add_argument("--local-build", type=int, default=None)
    p_dep.add_argument("--local-file", type=str, default=None)
    p_dep.set_defaults(func=cmd_deploy_summary)

    p_live = sub.add_parser("live-build", help="print the live build number from a version.json RPC")
    p_live.set_defaults(func=cmd_live_build)

    p_names = sub.add_parser("tool-names", help="list tool names from tools/list RPC")
    p_names.set_defaults(func=cmd_tool_names)

    args = ap.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
