# R2 Opus hunt: js/career, js/data, js/garage, js/share
Known still live: Mercedes setup defaults (setup-tune.js:30 vs garage-defaults.js:71) — fresh install shows TUNED, reset() can't clear it; restore-points v; career-planning constants.
F1 MED js/career/career-backup.js:610 — "before-import" restore point capture not awaited/checked; import overwrites the slot with no undo when IndexedDB fails (restore path refuses in the same case, restore-points.js:162). CODE-TRACED
F2 low dead js/career/restore-points.js:80 — reason "import" allowed, never passed. CODE-TRACED
F3 low perf restore-points.js:111 — every capture re-validates all stored items (~2.8 MB JSON for MY TEAM logos). PLAUSIBLE
F4 low js/share/share-card-data.js:55 — link passes text(): /formula\s*1/ rewrite + 512 cut breaks URLs in the QR. Latent. PLAUSIBLE
Clean: garage-defaults part ids (139/0 missing, measured), brief stake escrow, sponsor windows, rollover, schedule year.
Not covered: career-ui, season-*, custom-team, most of career.js/career-backup, most of js/data and js/garage.
