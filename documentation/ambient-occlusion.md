# Ambient Occlusion Framework

Phase 4.1 adds the ambient occlusion framework API and quality-aware evaluation utility.

## API

Use `evaluateAmbientOcclusion` from `src/rendering/post/AmbientOcclusion.ts`:

```ts
import { evaluateAmbientOcclusion } from '../rendering/post/AmbientOcclusion'

const ao = evaluateAmbientOcclusion(rendererConfig.ambientOcclusion, {
  depth: 6.5,
  normalAlignment: 0.7,
  localContrast: 0.8,
})
```

## Output

- `occlusion`: scalar multiplier in [0, 1]
- `sampleCount`: effective sample budget after quality scaling
- `radius`: active AO sampling radius

## Notes

- This framework is a policy/evaluation layer for upcoming SSAO/GTAO render passes.
- Final AO implementation will consume real depth/normal buffers and temporal filters.
