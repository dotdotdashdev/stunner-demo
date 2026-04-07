# Color Grading and Tonemapping API

Agent target: apply deterministic CPU-side color grading from renderer config.

## Source of truth

- `src/stunner/renderer/post/ColorGrading.ts`
- Function: `applyColorGrading(color, config)`

## Supported tonemappers

- `aces`
- `filmic`
- `reinhard`

## Behavior notes

- If `config.enabled` is `false`, input color is returned unchanged.
- Processing order is fixed: exposure -> saturation -> contrast -> temperature/tint -> tonemapper.
- Output channels are clamped to `[0, 1]`.
