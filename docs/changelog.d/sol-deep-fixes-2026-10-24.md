Fixed: Rejected career calendar changes remain rejected during save recovery, and calendar resets clear old championship countback.
Fixed: Asset generation retires disabled low-resolution atlases and accepts supported self-contained model buffers.
Fixed: Diagnostic and physics commands validate requested work before launching it, and workflow checks use the configured shell checker.
Improved: Deployment minification uses a bounded worker pool while preserving generated code and source maps.
Fixed: Tyres fitted after the finish no longer change compound-rule compliance, and Daily events use the correct factory car geometry.
Fixed: Multiplayer AI pit and tyre state reaches guests, and reconnect negotiation survives intermediate connection states and one-sided outages.
Fixed: Ghost records remain retryable after storage recovers, and unrelated compact input recordings stay compressed until selected.
Fixed: Track rebuilds prepare large meshes off the main thread when supported, retain cooperative fallback and report worker and replay costs separately.
Fixed: Renderer allocation failures release unpublished buffers, and asymmetric scenery keeps its authored geometry and orientation.
Fixed: Camera holds and voice auditions stop when their owning controls close; LIVE session labels and failed calendar selections stay current.
Fixed: Offline updates preserve the previous installed cache across build-number gaps without repeating essential preload work.
Fixed: Live scenery previews stop clearance work when their output budget is exhausted, without changing the generated preview.
Fixed: Data providers allow two response bodies in flight while honoring start quotas and header-time rate-limit pauses.
