# @doc Test environment: canonical F1 environment and plugin support.
"""Regression checks for activation, failure handling and installation locking."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]

class EnvironmentTests(unittest.TestCase):
    def run_bash(self, text, env=None):
        return subprocess.run(['bash', '-c', text], env=env, capture_output=True, text=True, timeout=10)

    def test_activation_is_idempotent_and_preserves_browser_override(self):
        env = dict(os.environ, PLAYWRIGHT_BROWSERS_PATH='/tmp/custom-browser-cache')
        result = self.run_bash('source /workspace/f1-game/tools/environment/activate.sh; first="$PATH"; source /workspace/f1-game/tools/environment/activate.sh; [[ "$PATH" == "$first" && "$PLAYWRIGHT_BROWSERS_PATH" == /tmp/custom-browser-cache ]]', env)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_start_fails_before_service_launch_and_does_not_install(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            log = folder/'calls'
            for name, body in [('node', 'exit 0'), ('npm', 'exit 1')]:
                stub = folder/name
                stub.write_text('#!/bin/bash\nprintf "%s\\n" "$0 $*" >> "$F1_TEST_CALLS"\n'+body+'\n')
                stub.chmod(0o755)
            env = dict(os.environ, PATH=f'{folder}:/usr/bin:/bin', F1_TEST_CALLS=str(log))
            result = self.run_bash('bash /workspace/f1-game/tools/environment/boot-chat-mcp.sh', env)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('dependency tree is missing or invalid', result.stderr)
            calls = log.read_text()
            self.assertIn('ls --depth=0 --include=dev --offline', calls)
            self.assertNotIn('npm ci', calls)
            self.assertNotIn('chat-mcp-service.mjs', calls)

    def test_preflight_requires_canonical_sources(self):
        text = (ROOT / 'environment/preflight.sh').read_text()
        self.assertIn('tools/mcp/doctor-catalog.mjs', text)
        self.assertNotIn('F1_GATEWAY_RUNTIME_DIR', text)
        self.assertNotIn('npm ci', text)

    def test_resume_propagates_startup_success_and_failure(self):
        for code in (0, 17):
            with self.subTest(code=code), tempfile.TemporaryDirectory() as directory:
                folder = Path(directory)
                (folder / 'boot-chat-mcp.sh').write_text(f'exit {code}\n')
                script = (ROOT / 'environment/resume.sh').read_text().replace(
                    'root=/workspace/f1-game/tools/environment', f'root={directory}')
                result = self.run_bash(script)
                self.assertEqual(result.returncode, code)
                self.assertEqual('PASS:' in result.stdout, code == 0)

    def test_unknown_command_rejected(self):
        result = self.run_bash('bash /workspace/f1-game/tools/environment/bin/f1-env invalid')
        self.assertEqual(result.returncode, 2)
        self.assertIn('Unknown command', result.stderr)

    def test_binding_follows_install_lock(self):
        script = (ROOT / 'install-environment.sh').read_text()
        self.assertLess(script.index('flock -n 9'), script.index('bash "$root/bind-canonical.sh"'))

    def test_concurrent_install_rejected_before_mutation(self):
        result = self.run_bash('exec 8>/workspace/f1-toolchain/environment/install.lock; flock -n 8; bash /workspace/f1-game/tools/environment/install-environment.sh')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('another environment installation holds the lock', result.stderr)

if __name__ == '__main__':
    unittest.main()
