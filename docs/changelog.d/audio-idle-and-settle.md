Fixed: after a race, the rival, crowd and ERS sound layers are unplugged in the menus instead of looping silently (battery); `?lab=noAudioIdle` turns that off for one release.
Fixed: four engine-sound parameters that were re-sent to the audio thread on every frame now settle (sub-octave pitch, the silent harvest filter at full throttle, rival voices, tyre/surface levels once per frame instead of per physics substep).
Fixed: on iPhone a finger's first tap after an audio interruption no longer builds a throw-away audio context; the same tap's release recovers sound as before.
