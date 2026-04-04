# Shadow Filtering and Per-Light Overrides

Phase 3.4 adds configurable shadow filtering kernels and per-light shadow override resolution.

## API

Use from `src/renderer/shadows/ShadowFiltering.ts`:

```ts
import {
  getShadowKernel,
  resolvePerLightShadowSettings,
} from '../renderer/shadows/ShadowFiltering';

const kernel = getShadowKernel('pcf-5x5');
const perLight = resolvePerLightShadowSettings(lights, resolvedShadowSettings, [
  { lightId: 7, filter: 'hard', mapResolution: 512, enabled: true },
]);
```

## Supported Filters

- `hard`
- `pcf-3x3`
- `pcf-5x5`

`getShadowKernel` returns normalized taps suitable for shader-side sampling loops.

## Per-Light Override Controls

Each override can control:

- `enabled`
- `filter`
- `mapResolution`
- `depthBias`
- `normalBias`

## Notes

- This framework resolves shadow runtime settings but does not yet dispatch real shadow rendering passes.
- The next phase can consume these settings inside directional/spot/point shadow pass execution.
