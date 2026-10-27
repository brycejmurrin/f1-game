# @doc Test plugin build: canonical F1 environment and plugin support.
import hashlib
import json
from pathlib import Path
import runpy
import shutil
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "build-plugins.py"
API = runpy.run_path(str(BUILD))


class PluginBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="plugin-build-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.sources = self.root / "sources"
        shutil.copytree(ROOT / "plugin-sources", self.sources)

    def build(self, destination):
        return subprocess.run(
            ["python3", str(BUILD), "--sources", str(self.sources), "--out", str(destination)],
            cwd="/", capture_output=True, text=True, timeout=10)

    def test_rebuilds_without_original_uploads_or_checkout_cwd(self):
        first, second = self.root / "first", self.root / "second"
        for destination in (first, second):
            result = self.build(destination)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for archive in sorted(first.glob("*.zip")):
            self.assertEqual(archive.read_bytes(), (second / archive.name).read_bytes())
            with zipfile.ZipFile(archive) as package:
                self.assertIn(".app.json", package.namelist())
                self.assertIn(".codex-plugin/plugin.json", package.namelist())
                self.assertIsNone(package.testzip())
        receipt = json.loads((first / "build-receipt.json").read_text())
        for item in receipt["packages"]:
            self.assertEqual(item["sha256"], hashlib.sha256((first / item["file"]).read_bytes()).hexdigest())

    def test_changed_app_binding_fails_before_replacing_existing_output(self):
        target = self.root / "dist"
        target.mkdir()
        old = target / "f1-cloud-mcp-1.0.1.zip"
        old.write_bytes(b"previous successful build")
        binding = self.sources / "f1-dev-tools/.app.json"
        binding.write_text('{"apps":{"f1-cloud-mcp":{"id":"wrong-app"}}}')
        result = self.build(target)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Existing app binding changed", result.stderr)
        self.assertEqual(old.read_bytes(), b"previous successful build")
        self.assertFalse(any(target.glob("f1-dev-tools-*.zip")))

    def test_hosted_packages_reject_accidental_local_mcp_autodiscovery(self):
        (self.sources / "f1-dev-tools/.mcp.json").write_text('{"mcpServers":{}}')
        result = self.build(self.root / "dist")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must not auto-launch local stdio", result.stderr)

    def test_mismatched_manifest_versions_fail(self):
        manifest = self.sources / "f1-dev-tools/plugin.json"
        data = json.loads(manifest.read_text())
        data["version"] = "99.0.0"
        manifest.write_text(json.dumps(data))
        result = self.build(self.root / "dist")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Plugin manifests disagree", result.stderr)

    def test_archive_verification_detects_missing_hidden_files(self):
        target = self.root / "truncated.zip"
        with zipfile.ZipFile(target, "w") as archive:
            archive.writestr("README.md", "visible file only")
        with self.assertRaisesRegex(ValueError, "member list differs"):
            API["verify_archive"](target, {".app.json": b"{}", "README.md": b"visible file only"})


if __name__ == "__main__":
    unittest.main()
