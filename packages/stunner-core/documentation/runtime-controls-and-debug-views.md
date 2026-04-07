# Runtime Controls API

Agent target: build runtime renderer config variants from preset + debug mode + toggles.

## Source of truth

- `src/stunner/renderer/debug/RuntimeControls.ts`
- Functions/constants:
  - `QUALITY_PRESETS`
  - `DEBUG_VIEWS`
  - `createDefaultRuntimeToggles()`
  - `buildRuntimeRendererConfig(preset, debugView, toggles, keyLightAzimuthDeg?, keyLightElevationDeg?)`

## Debug view values

- `off`
- `clusters`
- `lights`
- `shadows`

## Agent guidance

- Use this module to keep runtime toggle behavior consistent with config schema.
- Runtime HUD (`packages/stunner-react/src/hud/RendererHud.tsx`) exposes nested shadow controls by light type:
  - Shared
    - filter, atlas size, directional map bias
  - Directional
    - technique, cascade count, resolution, softness, strength
  - Point
    - technique, resolution, softness, strength
  - Spot
    - technique, resolution, softness, strength
  - Area
    - technique, softness, strength
- Settings JSON import/export remains supported for all shadow fields.
- Legacy JSON with `panelSettings.shadows.technique` is mapped to all per-type techniques during import.
- Example HUD (`src/App.tsx`) exposes pointLights-specific controls including:
  - point light count
  - point light speed
  - toggle to enable/disable shadow casting for all dynamic point lights
