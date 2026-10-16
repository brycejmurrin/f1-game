Fixed: Daily challenge backups now restore complete retained histories with full car and tune contexts above 256 KiB. Import retains the 5 MiB file limit, schema bounds and junk limits; oversized day/class histories are refused before download or restore instead of being truncated.
Fixed: Backup imports enforce the file limit in UTF-8 bytes for both parsed objects and text.
Fixed: Legacy career files preserve opaque newer-version saves on export and refuse mixed imports containing them before writing any slot or selection pointer, while retaining migration and revision safeguards.
