#!/usr/bin/env python3
# @doc Test stdio lifecycle: canonical F1 environment and plugin support.
import json, os, subprocess, tempfile, time, urllib.request, urllib.error, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent

class Lifecycle(unittest.TestCase):
    def exercise(self, enabled):
        with tempfile.TemporaryDirectory() as d:
            locator = Path(d) / 'proxy.json'
            env = os.environ.copy()
            env['MCP_STDIO_SEND_INITIALIZED_NOTIFICATION'] = str(enabled).lower()
            cmd = [env['APEX_TUNNEL_CLIENT_BIN'], 'dev', 'proxy', '--url-file', str(locator), '--mcp-command', f'command=node {ROOT / "fixtures/lifecycle-echo.mjs"},channel=main']
            proc = subprocess.Popen(cmd, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                for _ in range(200):
                    if locator.exists(): break
                    if proc.poll() is not None: self.fail('isolated proxy exited before readiness')
                    time.sleep(.1)
                self.assertTrue(locator.exists(), 'isolated proxy did not become ready')
                url = json.loads(locator.read_text())['mcp_url']
                def call(method, ident=None, params=None):
                    data = {'jsonrpc':'2.0','method':method}
                    if ident is not None: data['id'] = ident
                    if params is not None: data['params'] = params
                    req = urllib.request.Request(url, json.dumps(data).encode(), {'Content-Type':'application/json','Accept':'application/json, text/event-stream'})
                    try:
                        with urllib.request.urlopen(req, timeout=15) as response: return response.status, response.read().decode()
                    except urllib.error.HTTPError as e: return e.code, e.read().decode()
                status, body = call('tools/list', 1)
                self.assertTrue(status >= 400 or 'error' in body, (status, body))
                status, body = call('initialize', 2, {'protocolVersion':'2025-03-26','capabilities':{},'clientInfo':{'name':'test','version':'1'}})
                self.assertEqual(status, 200, body)
                status, body = call('tools/list', 3)
                if enabled:
                    self.assertEqual(status, 200, body)
                    self.assertNotIn('"error"', body)
                    status, body = call('notifications/initialized')
                    self.assertIn(status, (200, 202, 204), body)
                    status, body = call('tools/list', 4)
                    self.assertEqual(status, 200, body)
                    self.assertNotIn('"error"', body)
                else:
                    self.assertTrue(status >= 400 or 'error' in body, (status, body))
            finally:
                proc.terminate()
                try: proc.wait(timeout=5)
                except subprocess.TimeoutExpired: proc.kill(); proc.wait()
    def test_without_shim(self): self.exercise(False)
    def test_with_shim(self): self.exercise(True)

if __name__ == '__main__': unittest.main()
