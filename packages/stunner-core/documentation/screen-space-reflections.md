# Screen Space Reflections (SSR)

Agent target: configure and reason about current SSR behavior in WebGPU.

## Source of truth

- Config schema: `src/stunner/renderer/config/RendererConfig.ts`
- Runtime implementation: `src/stunner/renderer/post/WebGpuPostGraph.ts`

## Activation conditions

SSR commands run only when all are true:
- `screenSpaceReflections.enabled = true`
- `screenSpaceReflections.experimentalEnabled = true`
- `screenSpaceReflections.stage >= 1`

## Stage semantics

- `stage = 0`: SSR disabled path
- `stage = 1`: SSR render pass path enabled
- `stage = 2`: SSR pass + history/copy integration path

## Tunable fields

- `quality`
- `maxSteps`
- `maxDistance`
- `thickness`
- `stride`
- `resolve`
- `roughnessCutoff`

## Scope note

- SSR is explicitly gated as experimental by design.
