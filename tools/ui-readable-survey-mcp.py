#!/usr/bin/env python3
"""Survey screens × viewports × UI scales for readability defects via chrome-devtools MCP."""
from __future__ import annotations
import json, subprocess, threading, time, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WRAPPER = ROOT / "tools" / "chrome-devtools-mcp.sh"
OUT = ROOT / "scratch" / "ui-readable-survey.json"
TIMEOUT = 180

VIEWPORTS = [
  ("phone-land", "852x393x3,mobile,touch,landscape"),
  ("phone-port", "393x852x3,mobile,touch"),
  ("tablet", "1024x768x2,mobile,touch"),
  ("desktop", "1280x800x1"),
]
SCALES = [90, 100, 115, 130, 150]
SCREENS = [
  ("title", "overlay", None),
  ("settings", "pmsettings", "mb-settings"),
  ("garage", "carsetup", "mb-garage"),
  ("career", "career", "mb-career"),
  ("select", "select", "mb-race"),
  ("howto", "howtoplay", "mb-help"),
]

MEASURE = r"""async (args) => {
  const { scale, openBtn, rootId } = args;
  __apex.uiScale(scale);
  await new Promise(r => setTimeout(r, 350));
  const ids = ['select','carsetup','career','pmsettings','howtoplay','advanced','datahub','vsfriend','pausemenu','audioset','lighting','camtune'];
  for (const id of ids) {
    const e = document.getElementById(id);
    if (!e) continue;
    if (e.tagName === 'DIALOG' && e.open) try { e.close(); } catch {}
    e.hidden = true;
  }
  const ov = document.getElementById('overlay');
  if (ov) ov.hidden = false;
  if (openBtn) {
    document.getElementById(openBtn)?.click();
    await new Promise(r => setTimeout(r, 450));
    for (const a of document.getAnimations()) try { a.finish(); } catch {}
    await new Promise(r => setTimeout(r, 80));
  }
  const root = rootId === 'overlay' ? document.getElementById('overlay') : document.getElementById(rootId);
  if (!root || root.hidden) return { error: 'missing ' + rootId };

  const fsFloor = 11; // own units — below this body copy is hard to read at arm's length
  const tap = parseFloat(getComputedStyle(document.body).getPropertyValue('--tap')) || 44;
  const chip = parseFloat(getComputedStyle(document.body).getPropertyValue('--chip-h')) || tap;
  const smallText = [];
  const truncated = [];
  const underTap = [];
  const clippedNoScroll = [];

  const vis = (el) => {
    const c = getComputedStyle(el);
    return c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0.05;
  };
  const zOf = (el) => el.currentCSSZoom || 1;

  for (const el of root.querySelectorAll('button, a, label, p, h1, h2, h3, h4, span, .sel-label, .cr-note, .pm-group-h, .tune-label, .menu-btn, .title-btn')) {
    if (!vis(el)) continue;
    const t = (el.innerText || el.textContent || '').trim();
    if (!t || t.length < 2) continue;
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    const z = zOf(el);
    const ownFs = fs / z;
    if (ownFs > 0 && ownFs < fsFloor && !el.closest('.cr-meter-lbl, .hud, #hud')) {
      smallText.push({ el: el.id ? '#'+el.id : el.tagName, fs: Math.round(ownFs*10)/10, text: t.slice(0,36) });
    }
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 8 && cs.whiteSpace !== 'normal') {
      truncated.push({ el: el.id ? '#'+el.id : el.className?.toString?.().slice(0,24), text: t.slice(0,28), need: el.scrollWidth, got: el.clientWidth });
    }
  }

  for (const el of root.querySelectorAll('button:not([disabled]), a[href], input:not([type=hidden]):not([disabled]), [role=button]')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const z = zOf(el);
    const h = r.height / z, w = r.width / z;
    if (h < chip - 1.5 || Math.min(w,h) < 24)
      underTap.push({ el: el.id ? '#'+el.id : (el.className||'').toString().slice(0,30), h: Math.round(h), w: Math.round(w) });
  }

  for (const box of root.querySelectorAll('.sheet, .pane, .sheet-body')) {
    if (!vis(box)) continue;
    const br = box.getBoundingClientRect();
    const cs = getComputedStyle(box);
    const canY = /(auto|scroll)/.test(cs.overflowY) && box.scrollHeight > box.clientHeight + 2;
    if (canY) continue;
    for (const el of box.querySelectorAll('button, .cr-slot, .cs-opt, .sel-card, h2, h3')) {
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 8) continue;
      const oB = r.bottom - br.bottom;
      if (oB > 8) clippedNoScroll.push({ el: el.id ? '#'+el.id : (el.className||'').toString().slice(0,24), px: Math.round(oB), box: box.id || box.className });
    }
  }

  // dedupe smallText by text
  const seen = new Set();
  const small = [];
  for (const s of smallText) {
    const k = s.text;
    if (seen.has(k)) continue;
    seen.add(k);
    small.push(s);
    if (small.length >= 12) break;
  }

  return {
    top: window.UiLayers?.top?.()?.id || null,
    density: document.querySelector('.sheet:not([hidden])')?.dataset?.density || null,
    tap, chip,
    counts: {
      smallText: small.length,
      truncated: truncated.length,
      underTap: underTap.length,
      clippedNoScroll: clippedNoScroll.length,
    },
    samples: {
      smallText: small.slice(0, 6),
      truncated: truncated.slice(0, 6),
      underTap: underTap.slice(0, 8),
      clippedNoScroll: clippedNoScroll.slice(0, 6),
    }
  };
}"""


class McpClient:
    def __init__(self) -> None:
        self._id = 0
        self._pending: dict[int, dict] = {}
        self.proc = subprocess.Popen(
            [str(WRAPPER), "run"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, bufsize=1,
        )
        threading.Thread(target=self._reader, daemon=True).start()

    def _reader(self) -> None:
        for line in self.proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            mid = msg.get("id")
            if mid is not None and mid in self._pending:
                self._pending[mid]["result"] = msg

    def _request(self, method: str, params=None) -> dict:
        self._id += 1
        rid = self._id
        self._pending[rid] = {}
        self.proc.stdin.write(json.dumps({"jsonrpc": "2.0", "id": rid, "method": method, "params": params or {}}) + "\n")
        self.proc.stdin.flush()
        deadline = time.time() + TIMEOUT
        while time.time() < deadline:
            if "result" in self._pending[rid]:
                msg = self._pending.pop(rid)["result"]
                if "error" in msg:
                    raise RuntimeError(json.dumps(msg["error"]))
                return msg.get("result", msg)
            time.sleep(0.05)
        raise TimeoutError(method)

    def _notify(self, method: str, params=None) -> None:
        self.proc.stdin.write(json.dumps({"jsonrpc": "2.0", "method": method, "params": params or {}}) + "\n")
        self.proc.stdin.flush()

    def start(self) -> None:
        self._request("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "readable", "version": "1"}})
        self._notify("notifications/initialized")

    def call(self, name: str, arguments: dict) -> dict:
        return self._request("tools/call", {"name": name, "arguments": arguments})

    def text(self, result: dict) -> str:
        return "\n".join(c.get("text", "") for c in (result.get("content") or []) if c.get("type") == "text")

    def eval_json(self, fn: str, args=None):
        payload = {"function": fn}
        if args is not None:
            payload["args"] = [args]
        t = self.text(self.call("evaluate_script", payload))
        if "```json" in t:
            return json.loads(t.split("```json", 1)[1].split("```", 1)[0].strip())
        raise RuntimeError(t[:800])

    def close(self) -> None:
        try:
            self.call("navigate_page", {"url": "about:blank"})
        except Exception:
            pass
        self.proc.stdin.close()
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.proc.kill()


def main() -> None:
    build = json.loads((ROOT / "version.json").read_text())["build"]
    c = McpClient()
    cells = []
    try:
        c.start()
        for vp_name, vp in VIEWPORTS:
            c.call("emulate", {"viewport": vp})
            c.call("navigate_page", {"url": f"http://127.0.0.1:3456/?v={build}"})
            c.eval_json("""async () => {
              for (let i=0;i<80 && !window.__apex;i++) await new Promise(r=>setTimeout(r,200));
              __apex.headless(true);
              const g=document.getElementById('game'); if (g) g.style.visibility='hidden';
              return { ok: !!window.__apex, build: document.querySelector('script[src*="game.js"]')?.src.match(/v=(\\d+)/)?.[1] };
            }""")
            for scale in SCALES:
                for screen, root, btn in SCREENS:
                    # wrap measure with args via closure injection
                    fn = f"""async () => {{
                      const args = {json.dumps({"scale": scale, "openBtn": btn, "rootId": root})};
                      const __fn = {MEASURE};
                      return await __fn(args);
                    }}"""
                    try:
                        result = c.eval_json(fn)
                    except Exception as e:
                        result = {"error": str(e)[:200]}
                    cell = {"vp": vp_name, "scale": scale, "screen": screen, "result": result}
                    cells.append(cell)
                    counts = (result or {}).get("counts") or {}
                    bad = sum(counts.get(k, 0) for k in ("smallText", "truncated", "underTap", "clippedNoScroll"))
                    if bad or result.get("error"):
                        print(f"{vp_name}@{scale} {screen}: {counts or result.get('error')}")
        # rank worst cells
        def score(cell):
            c = (cell.get("result") or {}).get("counts") or {}
            return c.get("underTap", 0) * 3 + c.get("clippedNoScroll", 0) * 2 + c.get("truncated", 0) * 2 + c.get("smallText", 0)
        worst = sorted(cells, key=score, reverse=True)[:20]
        summary = {
            "build": build,
            "cells": len(cells),
            "worst": [{"vp": w["vp"], "scale": w["scale"], "screen": w["screen"], "counts": (w["result"] or {}).get("counts"), "samples": (w["result"] or {}).get("samples")} for w in worst if score(w) > 0],
            "all": cells,
        }
        OUT.write_text(json.dumps(summary, indent=2))
        print("Wrote", OUT)
        print("Worst:")
        for w in summary["worst"][:12]:
            print(" ", w["vp"], w["scale"], w["screen"], w["counts"])
    finally:
        c.close()


if __name__ == "__main__":
    main()
