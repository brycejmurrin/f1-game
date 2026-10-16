Fixed: Daily challenge backups now restore complete retained histories with full car and tune contexts above 256 KiB. Import retains the 5 MiB file limit, schema bounds and junk limits; oversized day/class histories are refused before download or restore instead of being truncated.
Fixed: Backup imports enforce the file limit in UTF-8 bytes for both parsed objects and text.
