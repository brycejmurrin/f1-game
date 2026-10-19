"""Checkout-scoped browser-run inspection; importing this module performs no IO.

The edit guard conservatively includes --list processes. Orientation/Stop advice
opts out of them: a discovery command should not produce a live-run nudge.
Keep that caller policy separate from runner recognition and /proc traversal.
"""
import os


def is_playwright_run(argv, *, advisory=False):
    """Recognize runner argv tokens, never quoted shell command text.

    cli.js intentionally remains broad, matching the existing edit guard.
    The advisory profile excludes shell processes and --list just as the CLI
    did. The guard retains its more conservative baseline acceptance, including
    shell script runners and a bare runner token in a shell -c payload.
    """
    if not argv:
        return False
    basenames = [os.path.basename(arg) for arg in argv]
    if advisory and basenames[0] in ("bash", "sh", "dash", "zsh"):
        # Advice has always ignored shells entirely; source protection retains
        # its conservative acceptance of shell-executed runner scripts.
        return False
    if advisory and any("--list" in arg for arg in argv):
        return False
    return ("run-playwright.mjs" in basenames
            or any(base in ("playwright", "playwright.js", "cli.js")
                   and "test" in argv[i + 1:i + 3]
                   for i, base in enumerate(basenames)))


def playwright_pids(root, *, advisory=False, proc="/proc"):
    """Yield matching PIDs under realpath(root); skip vanished/unreadable entries.

    Failure to enumerate /proc deliberately reaches the caller: the edit guard
    fails open as before, while the advisory CLI retains its error status.
    `proc` also permits deterministic tests without launching a browser.
    """
    root = os.path.realpath(root)
    for pid in os.listdir(proc):
        if not pid.isdigit():
            continue
        try:
            with open(os.path.join(proc, pid, "cmdline"), "rb") as fh:
                argv = [arg.decode("utf8", "replace") for arg in fh.read().split(b"\0") if arg]
            if not is_playwright_run(argv, advisory=advisory):
                continue
            cwd = os.path.realpath(os.readlink(os.path.join(proc, pid, "cwd")))
        except OSError:
            continue
        if cwd == root or cwd.startswith(root + os.sep):
            yield pid
