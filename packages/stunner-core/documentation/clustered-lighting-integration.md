# Clustered Lighting Evaluator Integration

Agent target: understand what the current clustered evaluator is used for in-frame.

## Source of truth

- `src/stunner/renderer/shading/ClusteredLightingEvaluator.ts`
- `src/stunner/renderer/RendererEngine.ts`

## Current role

- The evaluator computes a heuristic RGB lighting result plus cluster assignment metadata.
- Engine uses this result as a frame color influence path (not full physically based shading).

## Debug modes

Driven by `clustered.debugView`:
- `off`
- `clusters`
- `lights`
- `shadows`

## Agent guidance

- Treat evaluator output as renderer control signal / visualization aid.
- Do not assume this module is a full material-light BRDF pipeline.
