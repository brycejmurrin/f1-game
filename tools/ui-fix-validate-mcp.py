#!/usr/bin/env python3
"""Post-fix MCP validation: tap heights, clip/scroll, screenshots via evaluate+playwright fallback."""
from __future__ import annotations

import json
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WRAPPER = ROOT / "tools" / "chrome-devtools-mcp.sh"
OUT = ROOT / "scratch" / "ui-fix-validate.json"
SHOT = ROOT / "artifacts" / "tmp" / "ui-shots-fixed"
TIMEOUT = 180

MEASURE = """async () => {
  const hOf = (sel) => {
    const el = document.querySelector(sel);
    if (!el || el.hidden || getComputedStyle(el).display === 'none') return null;
    const r = el.getBoundingClientRect();
    const z = el.currentCSSZoom || 1;
    return Math.round((r.height / z) * 10) / 10;
  };
  const floor = parseFloat(getComputedStyle(document.body).getPropertyValue('--tap')) || 44;
  const chip = parseFloat(getComputedStyle(document.body).getPropertyValue('--chip-h')) || floor;
  const sheet = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return {
      shape: el.dataset.shape || null,
      pair: el.dataset.pair || null,
      density: el.dataset.density || null,
    };
  };
  const scrollable = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return {
      clientH: Math.round(el.clientHeight),
      scrollH: Math.round(el.scrollHeight),
      canScroll: el.scrollHeight > el.clientHeight + 2,
      overflowY: getComputedStyle(el).overflowY,
    };
  };
  const open = async (btn) => {
    const ids = ['select','carsetup','career','pmsettings','howtoplay','advanced','datahub','vsfriend'];
    for (const id of ids) {
      const e = document.getElementById(id);
      if (!e) continue;
      if (e.tagName === 'DIALOG' && e.open) try { e.close(); } catch {}
      e.hidden = true;
    }
    const ov = document.getElementById('overlay');
    if (ov) { ov.hidden = false; }
    document.getElementById(btn)?.click();
    await new Promise(r => setTimeout(r, 450));
    for (const a of document.getAnimations()) { try { a.finish(); } catch {} }
    await new Promise(r => setTimeout(r, 100));
  };

  const out = { floor, chip, top: null, settings: {}, garage: {}, career: {} };

  await open('mb-settings');
  out.settings = {
    top: UiLayers?.top()?.id,
    sheet: sheet('#pmsettings-inner'),
    taps: {
      advanced: hOf('#pm-advanced'),
      audio: hOf('#pm-audio'),
      howto: hOf('#pm-howto'),
      hidehud: hOf('#pm-hidehud'),
    },
    bodyScroll: scrollable('#pmsettings-inner > .sheet-body'),
    resVisible: (() => {
      const el = document.getElementById('pm-res');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const body = document.querySelector('#pmsettings-inner > .sheet-body');
      const br = body.getBoundingClientRect();
      return r.bottom <= br.bottom + 1 && r.top >= br.top - 1;
    })(),
  };

  await open('mb-garage');
  out.garage = {
    top: UiLayers?.top()?.id,
    sheet: sheet('#cs-inner'),
    unlimited: hOf('#cs-unlimited'),
  };

  await open('mb-career');
  out.career = {
    top: UiLayers?.top()?.id,
    sheet: sheet('#cr-inner'),
    guideDriver: hOf('#cr-guide-driver'),
    bodyScroll: scrollable('#cr-body'),
    leftScroll: scrollable('#cr-left'),
    guideInView: (() => {
      const el = document.getElementById('cr-guide-driver');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const box = document.getElementById('cr-inner').getBoundingClientRect();
      return r.bottom <= box.bottom + 2;
    })(),
  };

  out.pass = {
    settingsTaps: [out.settings.taps.advanced, out.settings.taps.audio, out.settings.taps.howto]
      .every(h => h != null && h >= floor - 1),
    garageUnlimited: out.garage.unlimited != null && out.garage.unlimited >= chip - 1,
    settingsScrollOrRes: out.settings.bodyScroll?.canScroll || out.settings.resVisible,
    careerGuide: out.career.guideInView || out.career.bodyScroll?.canScroll || out.career.leftScroll?.canScroll,
  };
  return out;
}"""


class McpClient:
    def __init__(self) -> None:
        self._id = 0
        self._pending: dict[int, dict] = {}
        self.proc = subprocess.Popen(
            [str(WRAPPER), "run"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
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
        self._request("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "fix-val", "version": "1"}})
        self._notify("notifications/initialized")

    def call(self, name: str, arguments: dict) -> dict:
        return self._request("tools/call", {"name": name, "arguments": arguments})

    def text(self, result: dict) -> str:
        return "\n".join(c.get("text", "") for c in (result.get("content") or []) if c.get("type") == "text")

    def eval_json(self, fn: str):
        t = self.text(self.call("evaluate_script", {"function": fn}))
        if "```json" in t:
            return json.loads(t.split("```json", 1)[1].split("```", 1)[0].strip())
        raise RuntimeError(t[:500])

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
    try:
        c.start()
        c.call("emulate", {"viewport": "852x393x3,mobile,touch,landscape"})
        c.call("navigate_page", {"url": f"http://127.0.0.1:3456/?v={build}"})
        boot = c.eval_json("""async () => {
          for (let i=0;i<80 && !window.__apex;i++) await new Promise(r=>setTimeout(r,200));
          __apex.headless(true);
          const g=document.getElementById('game'); if(g) g.style.visibility='hidden';
          __apex.uiScale(115);
          await new Promise(r=>setTimeout(r,500));
          return { build: document.querySelector('script[src*="game.js"]')?.src.match(/v=(\\d+)/)?.[1],
            tap: getComputedStyle(document.body).getPropertyValue('--tap').trim(),
            uiScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim() };
        }""")
        print("boot", json.dumps(boot))
        result = c.eval_json(MEASURE)
        print(json.dumps(result, indent=2))
        OUT.write_text(json.dumps({"boot": boot, "result": result}, indent=2))
        print("PASS gates:", result.get("pass"))
        ok = all(result.get("pass", {}).values())
        print("OVERALL", "PASS" if ok else "PARTIAL")
        sys.exit(0 if ok else 1)
    finally:
        c.close()


if __name__ == "__main__":
    main()
