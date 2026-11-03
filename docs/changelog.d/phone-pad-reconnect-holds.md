Fixed: phone-as-controller keeps the same room code when ICE fails before the pad channel opens, so a redial can reconnect.
Fixed: rotating the phone (portrait↔landscape) releases stuck GAS, BRAKE, LOOK and steer holds on the controller pad.
Fixed: a refused pedal-state send retries on the next pump instead of waiting until the desktop marks the pad stale.
