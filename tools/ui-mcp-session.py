#!/usr/bin/env python3
"""Multi-step UI survey via chrome-devtools MCP (one browser session).

Opens settings → garage → career at 115% / phone landscape and reports
UiLayers.top() + tap/clip probes for each.
"""
from __future__ import annotations

import json
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WRAPPER = ROOT / "tools" / "chrome-devtools-mcp.sh"
TIMEOUT = 180
OUT = ROOT / "scratch" / "ui-mcp-session.json"


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
        assert self.proc.stdin and self.proc.stdout
        threading.Thread(target=self._reader, daemon=True).start()

    def _reader(self) -> None:
        assert self.proc.stdout
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

    def _request(self, method: str, params: dict | None = None) -> dict:
        self._id += 1
        rid = self._id
        self._pending[rid] = {}
        assert self.proc.stdin
        self.proc.stdin.write(
            json.dumps({"jsonrpc": "2.0", "id": rid, "method": method, "params": params or {}})
            + "\n"
        )
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

    def _notify(self, method: str, params: dict | None = None) -> None:
        assert self.proc.stdin
        self.proc.stdin.write(
            json.dumps({"jsonrpc": "2.0", "method": method, "params": params or {}}) + "\n"
        )
        self.proc.stdin.flush()

    def start(self) -> None:
        self._request(
            "initialize",
            {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "ui-session", "version": "1"},
            },
        )
        self._notify("notifications/initialized")

    def call(self, name: str, arguments: dict) -> dict:
        return self._request("tools/call", {"name": name, "arguments": arguments})

    def text(self, result: dict) -> str:
        parts = []
        for c in result.get("content") or []:
            if c.get("type") == "text":
                parts.append(c.get("text", ""))
        return "\n".join(parts)

    def eval_json(self, fn: str):
        r = self.call("evaluate_script", {"function": fn})
        t = self.text(r)
        # Result looks like: Script ran...\n```json\n{...}\n```
        if "```json" in t:
            body = t.split("```json", 1)[1].split("```", 1)[0].strip()
            return json.loads(body)
        if "```" in t:
            body = t.split("```", 1)[1].split("```", 1)[0].strip()
            try:
                return json.loads(body)
            except json.JSONDecodeError:
                return {"raw": t}
        return {"raw": t}

    def close(self) -> None:
        try:
            self.call("navigate_page", {"url": "about:blank"})
        except Exception:
            pass
        if self.proc.stdin:
            self.proc.stdin.close()
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.proc.kill()


BOOT = """async () => {
  for (let i = 0; i < 80 && !window.__apex; i++)
    await new Promise(r => setTimeout(r, 200));
  if (!window.__apex) return { ok: false, error: 'no __apex' };
  window.__apex.headless(true);
  const g = document.getElementById('game');
  if (g) g.style.visibility = 'hidden';
  window.__apex.uiScale(115);
  await new Promise(r => setTimeout(r, 500));
  return {
    ok: true,
    build: document.querySelector('script[src*="game.js"]')?.src.match(/v=(\\d+)/)?.[1],
    tap: getComputedStyle(document.body).getPropertyValue('--tap').trim(),
    uiScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
    viewport: innerWidth + 'x' + innerHeight,
    coarse: matchMedia('(pointer: coarse)').matches
  };
}"""

PROBE = """(rootSel) => {
  const root = document.querySelector(rootSel);
  if (!root || root.hidden) return { error: 'missing/hidden', rootSel };
  const floor = parseFloat(getComputedStyle(document.body).getPropertyValue('--tap')) || 44;
  const chip = parseFloat(getComputedStyle(document.body).getPropertyValue('--chip-h')) || floor;
  const under = [];
  for (const el of root.querySelectorAll('button,a,[role="button"],input,select')) {
    const cs = getComputedStyle(el);
    if (el.hidden || cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const z = el.currentCSSZoom || 1;
    const h = r.height / z, w = r.width / z;
    if (h < chip - 1.5)
      under.push({
        id: el.id || String(el.className).split(' ')[0],
        h: Math.round(h), w: Math.round(w),
        text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40)
      });
  }
  const clipped = [];
  for (const box of root.querySelectorAll('.sheet, .pane')) {
    const cs = getComputedStyle(box);
    if (cs.display === 'none') continue;
    const br = box.getBoundingClientRect();
    const scY = /(auto|scroll)/.test(cs.overflowY);
    const scX = /(auto|scroll)/.test(cs.overflowX);
    for (const el of box.querySelectorAll('button, section, .pm-col, .cr-slot, [id]')) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const oB = r.bottom - br.bottom, oT = br.top - r.top;
      const oR = r.right - br.right, oL = br.left - r.left;
      let px = 0;
      if (!scY) px = Math.max(px, oB, oT);
      if (!scX) px = Math.max(px, oR, oL);
      if (px > 8)
        clipped.push({
          el: el.id ? '#' + el.id : String(el.className).split(' ')[0],
          box: box.id ? '#' + box.id : String(box.className).split(' ')[0],
          px: Math.round(px),
          text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 36)
        });
    }
  }
  // de-dupe clipped by el
  const seen = new Set();
  const clippedU = [];
  for (const c of clipped) {
    if (seen.has(c.el)) continue;
    seen.add(c.el);
    clippedU.push(c);
  }
  const sheet = root.querySelector('.sheet') || root;
  return {
    top: window.UiLayers?.top()?.id || null,
    rootSel,
    shape: sheet.dataset?.shape || null,
    pair: sheet.dataset?.pair || null,
    density: sheet.dataset?.density || null,
    tapFloor: floor,
    chip,
    underTap: under.slice(0, 15),
    clipped: clippedU.slice(0, 15),
    underCount: under.length,
    clipCount: clippedU.length
  };
}"""

CLOSE_ALL = """() => {
  const ids = ['select','carsetup','career','career-offers','career-history','career-guide',
    'teampicker','vsfriend','race-settings','quali','standings','results','customize',
    'howtoplay','advanced','pmsettings','pausemenu','datahub','track-detail','audioset',
    'spotifypanel','lighting','camtune','photo-controls'];
  for (const id of ids) {
    const e = document.getElementById(id);
    if (!e) continue;
    if (e.tagName === 'DIALOG' && e.open) try { e.close(); } catch (_) {}
    e.hidden = true;
  }
  const ov = document.getElementById('overlay');
  if (ov) { ov.hidden = false; ov.style.removeProperty('display'); }
  document.body.classList.remove('in-race');
  return UiLayers?.top()?.id || 'overlay';
}"""

SCREENS = [
    ("settings", "mb-settings", "#pmsettings"),
    ("garage", "mb-garage", "#carsetup"),
    ("career", "mb-career", "#career"),
]


def main() -> None:
    c = McpClient()
    report: dict = {"screens": {}, "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    try:
        c.start()
        print("→ emulate phone landscape")
        print(c.text(c.call("emulate", {"viewport": "852x393x3,mobile,touch,landscape"})))

        print("→ navigate")
        print(c.text(c.call("navigate_page", {"url": "http://127.0.0.1:3456/?v=1116"})))

        print("→ boot harness")
        harness = c.eval_json(BOOT)
        report["harness"] = harness
        print(json.dumps(harness, indent=2))
        if not harness.get("ok"):
            print("FAIL: boot", file=sys.stderr)
            sys.exit(1)

        for name, btn, root in SCREENS:
            print(f"\n=== {name} ===")
            c.eval_json(CLOSE_ALL)
            time.sleep(0.2)
            opened = c.eval_json(
                f"""async () => {{
  document.getElementById('{btn}')?.click();
  await new Promise(r => setTimeout(r, 400));
  for (const a of document.getAnimations()) {{ try {{ a.finish(); }} catch {{}} }}
  await new Promise(r => setTimeout(r, 100));
  return {{ clicked: '{btn}', top: UiLayers?.top()?.id || null, rootHidden: document.querySelector('{root}')?.hidden }};
}}"""
            )
            print("open:", json.dumps(opened))
            probe = c.eval_json(
                f"(() => {{ const probe = {PROBE}; return probe('{root}'); }})"
            )
            report["screens"][name] = {"open": opened, "probe": probe}
            print(
                f"top={probe.get('top')} underTap={probe.get('underCount')} "
                f"clipped={probe.get('clipCount')} shape={probe.get('shape')} "
                f"pair={probe.get('pair')} density={probe.get('density')}"
            )
            if probe.get("underTap"):
                print("  under tap floor:")
                for u in probe["underTap"][:8]:
                    print(f"    {u['id']:20} h={u['h']:3}  {u['text']}")
            if probe.get("clipped"):
                print("  clipped (>8px):")
                for cl in probe["clipped"][:8]:
                    print(f"    {cl['el']:24} +{cl['px']}px  {cl['text']}")

            snap = c.text(c.call("take_snapshot", {}))
            # keep short
            lines = [ln for ln in snap.splitlines() if ln.strip()][:18]
            report["screens"][name]["snapshot_head"] = lines
            print("  snapshot:")
            for ln in lines:
                print("   ", ln[:100])

        # Escape back from career
        print("\n→ Escape from career")
        esc = c.eval_json(
            """async () => {
  const before = UiLayers?.top()?.id;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 80));
  return { before, after: UiLayers?.top()?.id };
}"""
        )
        report["escape"] = esc
        print(json.dumps(esc))

        cons = c.text(c.call("list_console_messages", {"types": ["error", "warn"]}))
        report["console"] = cons
        print("\n→ console:", cons[:500] if cons else "(empty)")

    finally:
        c.close()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2))
    print(f"\nWrote {OUT}")


if __name__ == "__main__":
    main()
