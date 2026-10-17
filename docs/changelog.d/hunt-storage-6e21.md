Fixed: Career and season recovery records retain their failed-write baseline, so an older mirror cannot replace a newer primary save after an abrupt close. Existing recovery and cross-tab conflict protection remain active.
Fixed: Lap-record imports report refused storage writes and stay open. Retrying after storage recovers saves the cached records without duplicating them.
