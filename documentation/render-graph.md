# Render Graph

The render graph is a pass scheduler and resource declaration layer used to organize clustered lighting, shadows, and post-processing.

## Current Scope

- Pass registration (`addPass`, `removePass`, `clear`).
- Resource declarations per pass (`creates`).
- Sequential execution with per-pass enable predicates.
- Per-frame execution context delivery.

## Usage

```ts
import { RenderGraph } from '../rendering/graph/RenderGraph'
import type { RendererConfig } from '../rendering/config/RendererConfig'

const graph = new RenderGraph(device)

graph.addPass({
  name: 'cluster-build',
  enabled: (config: RendererConfig) => config.clustered.enabled,
  creates: [
    { name: 'cluster-light-indices', kind: 'buffer' },
  ],
  execute: ({ frameIndex }) => {
    console.log('run cluster build for frame', frameIndex)
  },
})

await graph.execute(config, {
  frameIndex: 42,
  deltaTimeMs: 16.7,
})
```

## Notes

- The current implementation executes passes in registration order.
- Dependency validation and automatic ordering are planned next.
- Graph resources are currently declarative only; allocation/lifetime management will be implemented later.
