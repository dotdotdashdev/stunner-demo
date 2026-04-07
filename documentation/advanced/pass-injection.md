# Advanced API: WebGPU Stage Injection

Agent target: insert custom WebGPU work into deterministic points of the internal pipeline.

## Source of truth

- `src/stunner/renderer/post/WebGpuPostGraph.ts`
- Types: `WebGpuStage`, `WebGpuStageContext`, `WebGpuStageInjectionPoint`

## Injection points

- `pre-scene`
- `pre-post`
- `pre-composite`

## Stage fields

- `name`
- `injectionPoint`
- `order` (optional)
- `reads` / `writes` resource contracts (optional)
- `execute(context)`

## Failure policy

- `skip-stage`
- `fail-fast`

## Agent guidance

- Prefer `skip-stage` for resilient tool workflows.
- Use explicit `reads/writes` contracts for easier diagnostics.
