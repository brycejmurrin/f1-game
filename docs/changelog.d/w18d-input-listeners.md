Fixed: Phone-as-controller no longer stacks duplicate tilt (deviceorientation) listeners when SCAN arms the sensor and CONNECT (or a second arm) runs before the first reading arrives.

Fixed: A second `Input.init` refreshes pause/pad-lost callbacks without stacking keyboard, blur, or gamepad listeners (a toggle GAS key no longer flips twice per press).
