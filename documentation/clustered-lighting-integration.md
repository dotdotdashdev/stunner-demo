# Clustered Lighting Integration

Step 2.4 integrates clustered light evaluation directly into the active render loop.

## What Is Integrated

- `RendererEngine` now owns a light set generated from renderer config.
- Each frame runs `evaluateClusteredLighting(...)`.
- The resulting color is used by both WebGPU and WebGL2 clear paths.

## Core Files

- `src/stunner/renderer/shading/ClusteredLightingEvaluator.ts`
- `src/stunner/renderer/lights/LightFactory.ts`
- `src/stunner/renderer/RendererEngine.ts`

## How It Works

1. Build cluster grid from viewport + clustered config.
2. Assign active lights to cluster lists.
3. Select a sample cluster and evaluate its aggregate light energy.
4. Apply basic bloom/exposure influence from renderer config.
5. Output an RGB color used by the current frame pass.

## Notes

- This is an integration milestone for clustered shading flow and data paths.
- It is intentionally geometry-independent for now, matching project scope.
- Next steps can replace clear-color output with material/geometry shading while reusing cluster assignment and light buffers.
