# Advanced API: External Compute Integration

Agent target: integrate bespoke compute simulation with renderer-owned presentation.

## Core pattern

1. Register frame hooks for timing/state sync.
2. Register one or more WebGPU stages for compute dispatch.
3. Expose compute outputs through `SceneInstancedMesh.drawSource` in `gpuExternal` mode.

## Source of truth

- `src/stunner/renderer/RendererEngine.ts`
- `src/stunner/renderer/post/WebGpuPostGraph.ts`
- `src/stunner/renderer/mesh/SceneTypes.ts`
- Example implementation: `src/example/flocking.ts`

## Required checks

- Buffer layouts match shader locations.
- `instanceCount` reflects produced compute output size.
- `worldBounds` is provided for stable culling behavior.

## Agent guidance

- Keep compute ownership external; renderer should consume, not own, simulation semantics.
