Fixed: on a dark circuit the lamp-lit shaders no longer compile on the first race frames when the menu warm was still busy (#4958).
Fixed: long sessions on THREE WEBGPU keep warmed pipelines across many circuits instead of rebuilding them at race entry once a pin cap filled (#4971).
Fixed: SHADOW DARKNESS at 0 with SUN GOD-RAYS off (or at night) stops rebuilding the sun shadow map every 20 m (#4972).
Fixed: the rear-view mirror no longer redraws every frame while paused under the CAMERA tuner or SETTINGS, and its quality step holds 1.5 s at any frame rate (#4959).
