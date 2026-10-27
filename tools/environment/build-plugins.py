#!/usr/bin/env python3
# @doc Build plugins: canonical F1 environment and plugin support.
"""Build the two private F1 plugin exports from retained workspace sources."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent
APP_ID = "asdk_app_6ade996f81448191a51fc4e7a33152a8"
PACKAGES = (
    ("f1-cloud-mcp", "dev-6ade996f81448191a51fc4e7a33152a8", "dev-6ade996f81448191a51fc4e7a33152a8"),
    ("f1-dev-tools", "f1-dev-tools", "f1-cloud-mcp"),
)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate(root, identity, app_alias):
    require(root.is_dir() and not root.is_symlink(), f"Missing retained plugin source: {root}")
    files = {}
    for entry in sorted(root.rglob("*")):
        require(not entry.is_symlink(), f"Source symlink cannot be packaged: {entry}")
        if entry.is_file():
            files[entry.relative_to(root).as_posix()] = entry.read_bytes()
    for name, content in files.items():
        if name.endswith(".json"):
            json.loads(content)
    manifest = json.loads(files[".codex-plugin/plugin.json"])
    require("mcpServers" not in manifest and not {".mcp.json", "mcp.json"}.intersection(files),
            "Hosted account packages must not auto-launch local stdio servers")
    require(manifest.get("skills") == "./skills" and any(
        name.startswith("skills/") and name.endswith("/SKILL.md") for name in files),
        "Hosted account package must include its declared skills")
    require(manifest["name"] == identity, f"Plugin identity changed: {root.name}")
    version = manifest["version"]
    require(isinstance(version, str) and re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?", version), "Invalid plugin version")

    def reference(value):
        target = (root / value).resolve(strict=True)
        require(target.is_relative_to(root.resolve()), "Manifest path escapes the package")
        return target

    require(reference(manifest["apps"]) == (root / ".app.json").resolve(), "Unexpected app-binding path")
    binding = json.loads(files[".app.json"])
    require(binding == {"apps": {app_alias: {"id": APP_ID}}}, f"Existing app binding changed: {root.name}")
    if "plugin.json" in files:
        legacy = json.loads(files["plugin.json"])
        require((legacy["name"], legacy["version"]) == (identity, version), "Plugin manifests disagree")
    for key in ("skills", "mcpServers"):
        if key in manifest:
            reference(manifest[key])
    if "mcpServers" in manifest:
        config = json.loads(reference(manifest["mcpServers"]).read_text())
        require(set(config["mcpServers"]) == {"apex-tools", "apex-lsp", "js-debugger"}, "Unexpected MCP server catalog")
        for server in config["mcpServers"].values():
            for argument in server.get("args", []):
                if argument.startswith("${PLUGIN_ROOT}/"):
                    require(reference(argument.removeprefix("${PLUGIN_ROOT}/")).is_file(), "Missing bridge executable")
    return version, files


def write_archive(destination, files):
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, content in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, content, compresslevel=9)
    verify_archive(destination, files)


def verify_archive(destination, files):
    with zipfile.ZipFile(destination) as archive:
        require(archive.testzip() is None, f"Corrupt ZIP: {destination.name}")
        require(archive.namelist() == sorted(files), "Archive member list differs from source")
        require(all(archive.read(name) == content for name, content in files.items()), "Archive contents differ from source")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sources", type=Path, default=ROOT / "plugin-sources")
    parser.add_argument("--out", type=Path, default=Path("/workspace/f1-toolchain/plugin-dist"))
    parser.add_argument("--check", action="store_true", help="Check existing ZIPs against retained sources without rebuilding")
    args = parser.parse_args(argv)
    require(not args.out.resolve().is_relative_to(args.sources.resolve()), "Build output must be outside plugin sources")
    packages = []
    for name, identity, alias in PACKAGES:
        source = args.sources / name
        version, files = validate(source, identity, alias)
        packages.append((source, identity, alias, files, f"{name}-{version}.zip"))
    if args.check:
        for _, _, _, files, filename in packages:
            verify_archive(args.out / filename, files)
        print("PASS: both plugin archives match their retained sources and existing app bindings.")
        return

    # Test retained sources; building needs no uploaded ZIPs, network, or host MCPs.
    for source, identity, alias, files, _ in packages:
        tests = sorted(source.glob("tests/*.test.mjs"))
        if tests:
            subprocess.run(["node", "--test", *[str(test.relative_to(source)) for test in tests]],
                           cwd=source, check=True, timeout=45)
        require(validate(source, identity, alias)[1] == files, "Plugin source changed while tests ran; build again")

    args.out.mkdir(parents=True, exist_ok=True)
    receipts = []
    with tempfile.TemporaryDirectory(prefix=".build-", dir=args.out) as staging:
        stage = Path(staging)
        for source, _, _, files, filename in packages:
            target = stage / filename
            write_archive(target, files)
            receipts.append({"file": filename, "sha256": hashlib.sha256(target.read_bytes()).hexdigest(), "members": len(files)})
        (stage / "SHA256SUMS").write_text("".join(f"{item['sha256']}  {item['file']}\n" for item in receipts))
        (stage / "build-receipt.json").write_text(json.dumps({"packages": receipts, "appBinding": "preserved", "published": False}, indent=2) + "\n")
        for target in sorted(stage.iterdir()):
            os.replace(target, args.out / target.name)
    print(json.dumps({"status": "built", "output": str(args.out.resolve()), "packages": receipts}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.SubprocessError, zipfile.BadZipFile) as error:
        raise SystemExit(f"FAIL: {error}")
