# Agent Workflow: External Particle Compute

Agent target: implement compute-driven particles with minimal risk to default renderer behavior.

## Minimal stable workflow

1. Start with normal scene rendering and no custom stages.
2. Add frame hooks for timing sync only.
3. Add one `pre-scene` stage for compute dispatch.
4. Switch particle instancing to `gpuExternal` draw source.
5. Validate layout compatibility and frame timings.

## Reference implementation

- `src/example/flocking.ts`
- `src/stunner/renderer/post/WebGpuPostGraph.ts`

## Completion checklist

- Stage execution is deterministic and budgeted.
- No layout mismatch warnings.
- Particle rendering persists across resize and camera movement.
