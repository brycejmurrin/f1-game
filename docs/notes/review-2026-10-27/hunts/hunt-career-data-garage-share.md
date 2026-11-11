# Opus hunt: js/career, js/data, js/garage, js/share (2026-10-27)
F1 MED bug js/garage/setup-tune.js:29 — SetupTune.DEFAULTS.mercedes {arbF:7,arbR:7} vs shipped js/data/garage-defaults.js:71 {arbF:6,arbR:5} → untouched Mercedes isn't identity (cornering ≈0.991, braking ≈1.004), isDefault false, reset goes to 6/5. Fix: make them agree (gen from SetupTune.defaults). Test: every setup.<team> default == SetupTune.defaults(team). CODE-TRACED
F2 low js/garage/setup-presets.js:11 — cleanTune drops presets on any field/range drift; editable() then locks the library. Clamp/fill instead. PLAUSIBLE
F3 low js/career/restore-points.js:61 (+ career-backup.js:312) — requires integer v; slot with missing/string v blocks restore. Use SaveMigrate.careerVersion. CODE-TRACED
F4 low js/career/career-planning.js:66 — hardcoded copies of RESEARCH_MULT/FACILITY_DISCOUNT(_MAX). Read from career.js. CODE-TRACED
Not covered: most career UI, most js/data, garage except setup-*.
