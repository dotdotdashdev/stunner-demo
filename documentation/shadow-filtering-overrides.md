# Shadow Filtering and Overrides API

Agent target: resolve kernel taps and per-light shadow override settings.

## Source of truth

- `src/stunner/renderer/shadows/ShadowFiltering.ts`
- Functions:
  - `getShadowKernel(filter)`
  - `resolvePerLightShadowSettings(lights, resolvedShadowSettings, overrides)`

## Supported filters

- `hard`
- `pcf-3x3`
- `pcf-5x5`

## Behavior notes

- `pcf-5x5` uses distance-weighted normalization.
- Override entries can replace filter/resolution/bias/enable flag per light.
