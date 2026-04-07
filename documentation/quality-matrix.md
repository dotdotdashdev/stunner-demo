# Quality Matrix API

Agent target: use this for preset capability summaries, not for runtime rendering decisions alone.

## Source of truth

- `src/stunner/renderer/quality/QualityMatrix.ts`
- Functions:
  - `buildQualityMatrix()`
  - `getQualitySummary(preset)`

## Summary fields

- `preset`
- `maxTotalLights`
- `clusterCountHint`
- `shadowsEnabled`
- `postEffectsEnabled` flags

## Behavior notes

- Presets included: `low`, `medium`, `high`, `ultra`, `custom`.
- `clusterCountHint` is a reference estimate at `1920x1080`.
