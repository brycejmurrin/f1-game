# @doc Test health: canonical F1 environment and plugin support.
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('health', '/workspace/f1-game/tools/environment/check-chat-mcp-health.py')
health = importlib.util.module_from_spec(spec)
spec.loader.exec_module(health)

class HealthTests(unittest.TestCase):
    def test_discovery_without_exe_or_fd_and_duplicate_detection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for pid, parent, command in [(12, 10, '/bin/tunnel'), (13, 11, '/bin/other'), (14, 10, '/bin/tunnel')]:
                process = root / str(pid)
                process.mkdir()
                (process / 'cmdline').write_bytes(command.encode() + b'\0run\0')
                (process / 'stat').write_text(f'{pid} (name with spaces) S {parent} 0 0')
            self.assertEqual(sorted(health.tunnel_children(root, '/bin/tunnel')), [(12, 10), (14, 10)])
            (root / '14/stat').write_text('14 (tunnel) Z 10 0 0')
            self.assertEqual(health.tunnel_children(root, '/bin/tunnel'), [(12, 10)])

if __name__ == '__main__':
    unittest.main()
