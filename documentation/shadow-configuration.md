# Shadow Configuration and Quality Ladder

Phase 3.1 adds a shadow schema utility layer that converts renderer shadow config into concrete per-light shadow settings.

## API

Use `resolveShadowSettings` from `src/renderer/shadows/ShadowConfiguration.ts`:

```ts
import { resolveShadowSettings } from '../renderer/shadows/ShadowConfiguration';

const shadow = resolveShadowSettings(rendererConfig.shadows);

console.log(shadow.tier);
console.log(shadow.directional.cascadeCount);
```

## What It Resolves

- Global quality tier (`low`, `medium`, `high`, `ultra`).
- Per-light shadow map resolution for:
  - directional
  - spot
  - point
  - area
- Filter mode propagation.
- Bias defaults by quality tier (depth bias + normal bias).

## Notes

- This layer is renderer-policy scaffolding for upcoming shadow pass execution.
- Directional/spot/point/area shadow pass implementations are still pending in later milestones.
