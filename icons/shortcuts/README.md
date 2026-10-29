Appearance icon sets A–F (#1612): each set ships only what the in-game
Appearance picker loads — `favicon-32.png` and `apple-touch-180.png`.

A = dark/white/red (default look), B = red, C = light, D = red disc on dark,
E = cyan on navy, F = yellow. The picker swaps the in-page favicon and
apple-touch icon; the home-screen icon is fixed at install time and does not
necessarily update with the picker.

Manifest shortcuts (Quick race / Daily / Next GP / Controller / Garage) share
the root `icons/shortcut-96.png`. Per-door and maskable candidates that lived
under these sets were never referenced by the manifest, the shell, or the
picker, and were pruned.
