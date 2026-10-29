Fixed: Quitting a race and starting another kept the previous circuit's merged chunk draws in the renderer, so the next track loaded with those objects still resident.
Fixed: RaceWakeLock now removes its WakeLockSentinel release listener when the race ends, so repeated races do not accumulate listeners.
Fixed: TLX freeChunkedMesh now flushes deferred geometry wrappers immediately so a fast track switch on llvmpipe cannot leave the previous circuit in renderer._objects.
