# Fog API

Agent target: use this utility for fog factor and fog color blending calculations.

## Source of truth

- `src/stunner/renderer/post/Fog.ts`
- Function: `evaluateFog(config, color, distance, height)`

## Contract

Input:
- `config`: `FogConfig`
- `color`: input RGB
- `distance`: camera distance
- `height`: sample height

Output:
- `amount`: fog amount in `[0, 1]`
- `color`: fog color copy from config
- `blendedColor`: fog-applied output

## Behavior notes

- If `config.enabled` is `false`, `amount = 0` and `blendedColor` equals input color.
- Fog amount combines distance range, exponential density, and optional height falloff.
