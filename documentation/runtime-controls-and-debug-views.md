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
- Runtime HUD (`src/stunner/hud/RendererHud.tsx`) exposes shadow controls including:
  - technique switch (`approximate` / `shadow-map`)
  - directional shadow-map tuning (`bias`, `softness`, `strength`)
