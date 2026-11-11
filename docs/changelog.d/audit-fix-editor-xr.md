Fixed: in the track designer, an edit that leaves the loop unbuildable no longer drops the selected point, so FIX, DELETE POINT and TEST HERE keep their target
Fixed: in the track designer, SPAN WIDTH now reads and clears a whole-lap width zone instead of showing the base width and refusing to reset it
Fixed: in the track designer, Tab now moves focus off the map and the elevation strip instead of cycling points forever ([ and ] still pick points)
Fixed: with VR RENDERER set to WEBGPU, ENTER VR no longer fails on a headset that grants WebGPU; the session runs on WebGL2
Fixed: on an Android phone, ENTER VR no longer sits over the touch controls: it shows only once VR MODE is ON, hides during a race, and never reloads the page mid-race
