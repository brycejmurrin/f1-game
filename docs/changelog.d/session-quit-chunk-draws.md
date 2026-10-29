Fixed: Quitting a race and starting another kept the previous circuit's merged chunk draws in the renderer, so the next track loaded with those objects still resident.
Fixed: RaceWakeLock now removes its WakeLockSentinel release listener when the race ends, so repeated races do not accumulate listeners.
