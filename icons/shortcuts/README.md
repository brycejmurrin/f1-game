Appearance icon sets A–F (#1612): each set ships only what the in-game
Appearance picker loads — `favicon-32.png` and `apple-touch-180.png`.

The install / CLASSIC default is the red-and-white bar mark at
`icons/icon-180.png` (also `icon-192.png` / `icon-512.png`); it is not one of
these sets. A–F are alternate checkered-flag marks the picker swaps onto the
in-page favicon and apple-touch icon. The home-screen icon is fixed at install
time and does not necessarily update with the picker.

| Set | Look |
| --- | --- |
| A | Dark plate, black/white checkered flag, red frame |
| B | Red plate, red/white checkered flag, black frame |
| C | Light plate, black/white checkered flag, red frame |
| D | Dark plate, red disc with red/white checkered flag |
| E | Navy plate, cyan/navy checkered flag, yellow frame |
| F | Yellow plate, yellow/navy checkered flag, red frame |

Manifest shortcuts (Quick race / Daily / Next GP / Controller / Garage) share
the root `icons/shortcut-96.png`. Per-door and maskable candidates that lived
under these sets were never referenced by the manifest, the shell, or the
picker, and were pruned.
