# Quality Matrix

Phase 5.1 adds an explicit quality matrix utility for preset budgeting and feature capability summaries.

## API

Use `buildQualityMatrix` from `src/renderer/quality/QualityMatrix.ts`:

```ts
import { buildQualityMatrix } from '../renderer/quality/QualityMatrix'

const matrix = buildQualityMatrix()
```

## Summary Fields

- `preset`
- `maxTotalLights`
- `clusterCountHint`
- `shadowsEnabled`
- `postEffectsEnabled` flags

## Notes

- `clusterCountHint` uses a 1920x1080 reference envelope for comparison.
- The matrix is intended for runtime quality UI, diagnostics, and fallover decisions.
