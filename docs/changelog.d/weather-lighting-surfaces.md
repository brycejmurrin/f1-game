Fixed: Wet-road reflections respect porous grass, foliage, sand, rock and snow, with reflection metadata retained on Medium graphics.
Fixed: Native WebGPU preserves authored world material IDs, including fractional foliage and flags, so wet shading distinguishes terrain from pavement.
Fixed: Explicitly concrete inner terrain stays paved, and background ground carries the circuit's material instead of turning grass or sand into puddled pavement.
Fixed: Night skies no longer apply solar sunset bands or solar scattering to a low moon key.
Improved: Cloudy dawn and dusk use phase-dependent sky, cloud and fog lighting while retaining moonlight, lightning and city glow.
Improved: Dawn drizzle has a restrained shared grade and fine precipitation by default, while explicit player particle overrides remain respected.
