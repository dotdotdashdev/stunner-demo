# Renderer Configuration

The renderer exposes a typed configuration object intended to drive clustered shading, shadow quality, and post-processing toggles.

## Usage

```ts
import { createRendererConfig, type RendererConfig } from '../renderer/config/RendererConfig';

const config: RendererConfig = createRendererConfig('high', {
  clustered: {
    maxLightsPerCluster: 192,
  },
  shadows: {
    enabled: true,
    filter: 'pcf-5x5',
  },
});
```

Pass this config to `CanvasStage`:

```tsx
<CanvasStage rendererConfig={config} />
```

## Presets

Supported presets:

- `low`
- `medium`
- `high`
- `ultra`
- `custom`

`custom` starts from `high` baseline and applies your explicit overrides.

## Config Sections

- `clustered`: tile sizing, z-slices, cluster light list bounds.
- `lights`: hard caps for point, spot, directional, and area lights.
- `shadows`: atlas size, filtering, cascades, and per-light shadow map sizes.
- `ambientOcclusion`: quality/sample/radius/intensity.
- `bloom`: threshold, knee, mip chain count, intensity.
- `depthOfField`: focus controls, bokeh shape controls.
- `colorGrading`: tonemapper and grading controls.

## Notes

- This file defines configuration and defaults only. It does not yet implement clustered assignment or post-processing passes.
- Runtime config mutation should be done through engine-level update APIs to keep canvas lifecycle stable.
