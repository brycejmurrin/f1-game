Improved: On slow phones the performance governor's degrade ladder now reaches its later rungs instead of stopping after the first step, so a sustained low frame rate sheds more load (PERF-FINDINGS §2u).
Improved: With thermal-drift detection opted in, a heating phone now caps its presented frame rate at 45 fps before the governor trades resolution or features — and never overrides a render rate the player chose explicitly.
Fixed: On WebGPU phones (Safari 26) the 3D renderer no longer builds the PCSS shadow-blocker target that the classic renderer withholds from every phone, saving memory on jetsam-limited devices.
New: An iPhone performance audit note (governor ladder §2u, TLX phone costs, BrowserStack profiling limits) records the findings behind these changes.
