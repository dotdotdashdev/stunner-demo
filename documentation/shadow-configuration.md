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
- Runtime per-type shadow techniques and controls:
  - `directionalTechnique`: `approximate | shadow-map`
  - `pointTechnique`: `approximate | shadow-map`
  - `spotTechnique`: `approximate | shadow-map`
  - `areaTechnique`: `approximate | shadow-map`
  - Shared directional map tuning:
    - `shadowMapBias`
    - `shadowMapSoftness`
    - `shadowMapStrength`
  - Point light tuning:
    - `pointShadowStrength`
    - `pointShadowSoftness`
  - Spot light tuning:
    - `spotShadowStrength`
    - `spotShadowSoftness`
  - Area light tuning:
    - `areaShadowStrength`
    - `areaShadowSoftness`

## Notes

- This is a settings-resolution layer.
- Actual shadow execution is in `src/stunner/renderer/post/WebGpuPostGraph.ts`.
- `approximate` uses analytic caster-sphere occlusion (blob-like shadows).
- `shadow-map` remains the preset default for all light types.
