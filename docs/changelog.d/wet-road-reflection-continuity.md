Fixed: wet-road scene reflections fade during measured performance cuts and recovery instead of switching abruptly; crash safety and explicit off controls still stop them immediately. Reflection distance masks now use defined, ordered smoothstep bounds across renderers.
Improved: road reflections skip out-of-range normal reconstruction, and WebGPU avoids unused car-tag and duplicate depth reads without reducing reflection coverage.
Improved: LOW reflection rays reach farther within the same eight-step march and one refinement, retaining the existing receiver distance limit.
