# Render Graph API

Agent target: register named passes and execute them in insertion order with frame resources.

## Source of truth

- `src/stunner/renderer/graph/RenderGraph.ts`
- `src/stunner/renderer/graph/RenderGraphTypes.ts`

## Core methods

- `addPass(pass)`
- `removePass(name)`
- `clear()`
- `listPasses()`
- `listResources()`
- `execute(config, frame)`
- `executeSync(config, frame)`

## Important behavior

- Duplicate pass names throw.
- `executeSync` throws if any pass returns a Promise.
- Resource storage is per-frame via `FrameResourceStore`.
