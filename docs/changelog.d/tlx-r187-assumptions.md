Fixed: on the default three.js WebGPU renderer the results screen no longer flips back to the title with "Graphics reset — retrying with lighter settings" a few seconds after a race finishes (the fix from #4904 was lost in the November 6 rollback)
Fixed: the three.js renderer's race-start warm-up now really draws at 1x1 instead of full screen, so starting a race does less GPU work on phones
Fixed: when WebGPU cannot start, the three.js renderer now falls back to its own opaque WebGL2 setup (no see-through car paint), and a clean renderer failure falls back to the classic WebGL2 renderer instead of showing "Graphics unavailable"
Fixed: switching circuits frees the old circuit's shared vertex buffers on the three.js renderer instead of leaving them on the GPU
