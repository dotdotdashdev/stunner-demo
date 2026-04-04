# Spot and Point Shadow Mapping Framework

Phase 3.3 adds planning utilities for spot and point light shadow mapping.

## API

Use `buildSpotPointShadowAtlasPlan` from `src/renderer/shadows/SpotPointShadowMapping.ts`:

```ts
import { buildSpotPointShadowAtlasPlan } from '../renderer/shadows/SpotPointShadowMapping';

const plan = buildSpotPointShadowAtlasPlan(lights, {
  atlasSize: 4096,
  spotResolution: 1024,
  pointResolution: 512,
});
```

## Behavior

- Spot lights that cast shadows request one map.
- Point lights that cast shadows request six cubemap faces.
- Requests are packed into a square atlas with row-based packing.
- Overflow requests are reported for graceful degradation logic.

## Outputs

- `slots`: packed shadow map placements (`x`, `y`, `size`, `request`).
- `overflowRequests`: requests that did not fit.
- `atlasSize`: normalized power-of-two atlas dimension.

## Notes

- This is the framework layer for upcoming actual shadow pass rendering and GPU resource allocation.
- Directional cascades are handled separately by the CSM framework.
