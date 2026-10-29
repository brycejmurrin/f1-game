Fixed: Quitting a race and starting another kept the previous circuit's merged chunk draws in the renderer, so the next track loaded with those objects still resident.
Fixed: RaceWakeLock now removes its WakeLockSentinel release listener when the race ends, so repeated races do not accumulate listeners.
Fixed: TLX track teardown now batches chunked frees, skips warm/dropLater deferral for that window, and flushes only the old circuit's geos (not global flushDropLater), so llvmpipe quit→menu→race drops prior merge draws without zeroing the next circuit's ribbons.
