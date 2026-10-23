Fixed: bitmap decode no longer leaves an unhandled worker rejection when an error reply cannot post, and a terminated worker is cleared so the next decode can respawn instead of posting at a corpse forever.
Fixed: OpenF1 car_data/location window filters encode `date>=` / `date<=` like the live delta path, so proxies cannot truncate the range and the cache key matches.
