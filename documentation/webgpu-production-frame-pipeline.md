# WebGPU Frame Pipeline

Agent target: understand the active WebGPU render and post stack implementation.

## Source of truth

- `src/stunner/renderer/post/WebGpuPostGraph.ts`

## High-level flow

1. Scene prepass writes scene targets (color/normal/material/depth).
2. Optional external stages execute at configured injection points.
3. Post stack runs AO, bloom, DoF, motion blur, SSR stages (config-gated).
4. Composite pass writes final color to canvas view.

## Extensibility points

- Stage injection: `pre-scene`, `pre-post`, `pre-composite`
- Stage failure policy: `skip-stage` or `fail-fast`
- Stage resource contracts: optional read/write validation

## Agent guidance

- Treat this file as canonical for pass ordering and resource naming.
