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

## Notes

- This is a settings-resolution layer.
- It does not render shadow maps by itself.
