Fixed: a debris safety car now stays out at least 45 s instead of pulling in ~6 s after the debris settles (#5893).
Fixed: a car stopped on the racing line is retired 60 s after it stops, counting the caution it raised, not 60 s after that caution ends (#5892).
Fixed: RECOVER CAR puts the car back at the recovery speed instead of keeping its speed, so spamming it is no longer faster than driving (#5876).
Fixed: an AI car rear-ending the player can no longer push it past the designed punt cap by stacking the collision passes (#5894).
Fixed: a spun or sliding player hit by an AI car no longer gets an uncapped shove (up to +17.8 m/s in one frame); the same punt cap applies whatever the car's angle (clean-room fix 34).
Fixed: a shove against the pit wall can no longer teleport a car into the pit lane (clean-room fix 35).
Fixed: AI cars now see a car stopped mid-corner in time, pick one side to pass it and hold it, and no longer get pinned onto it while side by side — a parked player at Monaco was hit 82 times in 90 s, now 0 (clean-room fixes 39-41).
