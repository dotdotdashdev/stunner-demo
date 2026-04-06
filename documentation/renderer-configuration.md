# Renderer Configuration API

Agent target: configure renderer behavior through typed presets and overrides.

## Source of truth

- `src/stunner/renderer/config/RendererConfig.ts`
- Primary function: `createRendererConfig(preset, overrides?)`

## Presets

- `low`
- `medium`
- `high`
- `ultra`
- `custom` (used for user-defined state)

## Major config groups

- `clustered`
- `lights`
- `shadows`
- `ambientOcclusion`
- `bloom`
- `depthOfField`
- `colorGrading`
- `motionBlur`
- `screenSpaceReflections`
- `fog`
- `visibility`

## Agent guidance

- Always start from a preset, then apply targeted overrides.
- Keep override payload minimal to reduce accidental config drift.
