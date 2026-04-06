# Advanced Integration: Frame Hooks

This document describes the implemented Phase 1 frame-hook system for advanced users who need per-frame simulation/compute synchronization while keeping the default engine render path stable.

## Intent

Frame hooks provide a low-risk extension mechanism with minimal coupling to internal render stages.

Use frame hooks when:
- You need per-frame synchronization with engine time/config.
- You need to update external simulation state before render.
- You want instrumentation or lightweight custom GPU work.

Do not use frame hooks when:
- You need deterministic pass ordering relative to specific built-in passes.
- You need to publish resources for downstream render stages.
- You need custom render pass composition.

For those needs, use pass injection and resource registry features.

## Design Principles

- Fully optional and additive.
- No behavior changes when hooks are not provided.
- Stable callback context contract.
- Strict ownership boundaries for command submission and disposal.

## Implemented API Shape (Phase 1)

- beforeFrame(context): runs before the frame draw path begins.
- afterFrame(context): runs after frame timing collection.
- onError(phase, error, context): optional hook error callback.

Context fields:
- device
- frameIndex
- timeSeconds
- deltaTimeMs
- config
- backend

After-frame context additionally includes:
- passTimings
- frameTimeMs

Initial phase does not expose mutable internal render resources.

Implementation location:
- src/stunner/renderer/RendererEngine.ts

## Stability Rules

1. Hook errors are surfaced with explicit diagnostics.
2. Hook failures must not corrupt default frame execution state.
3. Hook duration can be tracked independently for profiling.
4. Engine still controls final command submission ownership.
5. Hooks are optional; omitting them preserves existing behavior.

## Performance Notes

- Keep hooks short and deterministic.
- Avoid per-frame resource reallocation in hooks.
- Prefer persistent buffers and batched writes.
- Minimize additional queue submissions unless strictly needed.

## Agent Implementation Checklist

1. Confirm hooks are configured through RendererEngine options only when needed.
2. Keep hook code synchronous and bounded in duration.
3. Route errors through onError for structured diagnostics.
4. Verify existing examples and metrics output remain stable.
5. Use this feature for timing and simulation sync, not pass graph orchestration.

## Example (Conceptual)

Use this pattern to integrate custom simulation updates while preserving engine ownership of rendering:

```ts
const engine = new RendererEngine(canvas, config, camera, {
	frameHooks: {
		beforeFrame: ({ timeSeconds, deltaTimeMs, backend, device }) => {
			if (backend === 'webgpu' && device) {
				// Update simulation state or enqueue lightweight compute work.
			}
		},
		afterFrame: ({ frameIndex, frameTimeMs, passTimings }) => {
			// Collect telemetry or adapt quality controls.
		},
		onError: (phase, error) => {
			console.warn('Frame hook error', phase, error);
		},
	},
});
```
