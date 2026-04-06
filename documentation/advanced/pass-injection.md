# Advanced Integration: Pass Injection

This document describes the implemented Phase 2 stage injection system for advanced users who need custom GPU work integrated with deterministic ordering.

## Intent

Pass injection allows custom compute/render stages to run at defined extension points in the WebGPU pipeline without replacing the full engine backend.

## Why This Exists

Current behavior uses fixed internal pass order. That is stable, but limits advanced orchestration.

Pass injection should provide flexibility while preserving:
- deterministic ordering,
- stable defaults,
- timing visibility,
- clear ownership boundaries.

## Implemented Extension Points

- pre-scene: before scene-prepass.
- pre-post: after scene-prepass and before post stack.
- pre-composite: immediately before final composite.

Optional later points can be added only if required by concrete use cases.

## Stage Contract (Phase 2)

Each stage should receive:
- command encoder handle (or controlled callback wrapper),
- frame context (time, index, config),
- shared resource registry access,
- diagnostics channel.

Current implementation details:
- Stage callback executes synchronously.
- Stage timing is automatically recorded as a renderer pass timing entry.
- Stages can read/write named values in the per-frame resource store.
- Stages can declare read/write resource contracts that are validated at runtime.

Exposed options:
- stages
- stageFailurePolicy (skip-stage default, fail-fast optional)

Injection API entry:
- RendererEngine options -> WebGpuPostGraph options

## Ordering Model

1. Built-in passes define baseline order.
2. User stages are sorted by extension point then registration order.
3. Stage execution must be deterministic per frame.

## Failure Model

- A stage failure should produce explicit diagnostics.
- Default path should remain operable if advanced mode is disabled.
- In advanced mode, failure policy should be configurable:
  - fail-fast,
  - skip-stage-and-continue.

This behavior is implemented in Phase 2.

Contract failures are also routed through this same failure policy behavior.

## Resource Contracts (Phase 3)

Stages may declare:
- reads: resources expected to exist before execute
- writes: resources expected to exist after execute

Contract fields:
- name
- kind (optional): buffer, texture-handle, texture-view, sampler, number, boolean, string, object
- required (optional, default true)

This enables early detection of:
- missing resources,
- type mismatches,
- integration drift between stages.

## Stability Checklist

1. Built-in-only configuration matches current output.
2. Stage insertion does not alter unrelated pass outputs.
3. Timing metrics include injected stages consistently.
4. Command submission ownership remains centralized.

## Agent Implementation Checklist

1. Register stages with explicit injection points and optional order values.
2. Keep stage callbacks short and deterministic.
3. Use skip-stage failure policy during experimentation.
4. Use fail-fast policy for strict validation scenarios.
5. Confirm stage timing entries appear in frame metrics.

## Example (Conceptual)

```ts
const engine = new RendererEngine(canvas, config, camera, {
  webGpuStages: [
    {
      name: 'simulate-particles',
      injectionPoint: 'pre-scene',
      order: 0,
      reads: [
        { name: 'scene-hdr', kind: 'texture-handle' },
      ],
      writes: [
        { name: 'particles-ready', kind: 'boolean' },
      ],
      execute: ({ device, encoder, resources }) => {
        // Encode compute work and publish results in resources.
        resources.set('particles-ready', true);
      },
    },
  ],
  webGpuStageFailurePolicy: 'skip-stage',
});
```
