# Post-Processing Graph Integration

Agent target: understand the CPU-side post graph wiring used by the non-WebGPU fallback path.

## Source of truth

- `src/stunner/renderer/post/PostProcessingGraph.ts`
- `src/stunner/renderer/RendererEngine.ts`

## What this graph does

- Evaluates post modules in deterministic order using renderer config and frame inputs.
- Produces pass timing data for metrics.
- Stores pass outputs in frame resources.

## Scope notes

- This is not the WebGPU render-pass implementation.
- WebGPU production path is implemented in `WebGpuPostGraph.ts`.
