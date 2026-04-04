# Directional Shadow Cascades

Phase 3.2 adds a directional shadow cascade framework with configurable split modes.

## API

Use `buildDirectionalCascades` from `src/rendering/shadows/DirectionalShadowCascades.ts`:

```ts
import { buildDirectionalCascades } from '../rendering/shadows/DirectionalShadowCascades'

const cascades = buildDirectionalCascades({
  cascadeCount: 4,
  nearPlane: 0.1,
  farPlane: 250,
  splitMode: 'practical',
  practicalLambda: 0.7,
})
```

## Split Modes

- `uniform`: linear partitioning of the frustum depth.
- `logarithmic`: denser splits near the camera.
- `practical`: blended log/uniform split (`practicalLambda`).

## Output

Each cascade includes:

- `near`
- `far`
- `centerDepth`
- `radius`

## Notes

- This is the directional CSM planning layer for upcoming shadow render passes.
- Light-view matrix fitting and stabilization are the next extension points.
