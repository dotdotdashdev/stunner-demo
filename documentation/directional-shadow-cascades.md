# Directional Cascade Builder API

Agent target: generate directional cascade depth partitions.

## Source of truth

- `src/stunner/renderer/shadows/DirectionalShadowCascades.ts`
- Function: `buildDirectionalCascades(config)`

## Split modes

- `uniform`
- `logarithmic`
- `practical` (blended by `practicalLambda`)

## Output per cascade

- `index`
- `near`
- `far`
- `centerDepth`
- `radius`
