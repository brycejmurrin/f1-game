Fixed: Armed VR now plans the TLX WebGL2 (forceGL) renderer instead of GLX, which cannot attach a headset session.
Fixed: A failed WebGPU VR enter latches WebGL2 for the next tap instead of retrying without user activation; a dropped recenter pose stays pending; a capability-probe throw no longer wipes the VR latch; degenerate seated-rig axes and a centered stick overwrite are guarded.
