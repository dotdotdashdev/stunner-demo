# Shadow Configuration Resolution API

Agent target: resolve global shadow config into per-light defaults.

## Source of truth

- `src/stunner/renderer/shadows/ShadowConfiguration.ts`
- Function: `resolveShadowSettings(config)`

## Output

- Quality `tier`: `low | medium | high | ultra`
- `atlasSize`
- Per-light defaults for:
  - `directional` (includes `cascadeCount`)
  - `spot`
  - `point`
  - `area`
- Runtime shadow technique and controls:
  - `technique`: `approximate | shadow-map`
  - `shadowMapBias`
  - `shadowMapSoftness`
  - `shadowMapStrength`

## Notes

- This is a settings-resolution layer.
- Actual shadow execution is in `src/stunner/renderer/post/WebGpuPostGraph.ts`.
- `approximate` uses analytic caster-sphere occlusion (blob-like shadows).
- `shadow-map` renders directional depth and samples it in scene shading.
