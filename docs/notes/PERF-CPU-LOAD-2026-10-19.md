# CPU, simulation and load performance outside the renderer (2026-10-19)

Fleet B lane H2. Scope: main-thread CPU per frame outside `js/render/**` and
`js/lighting/**` (simulation, physics, AI, track queries, HUD/DOM, audio), GC
and allocation churn, and boot/load time. Shipped renderer assumed: TLX on
three.js WebGPU (`tlxForceGL=0`); the renderer lane is H1.

## Baseline

_Measuring — filled in at the first verified checkpoint._

## Ranked findings

_Pending._

## Sources

_Pending._
