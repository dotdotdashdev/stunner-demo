# Bloom Framework

Phase 4.2 adds bloom extraction and mip-chain planning utilities.

## API

Use `evaluateBloom` from `src/renderer/post/Bloom.ts`:

```ts
import { evaluateBloom } from '../renderer/post/Bloom'

const bloom = evaluateBloom(rendererConfig.bloom, {
  color: [1.3, 1.1, 0.9],
  viewportWidth: 1920,
  viewportHeight: 1080,
})
```

## Output

- `extractWeight`: bright-pass extraction scalar.
- `mipLevels`: downsample chain plan for bloom pyramid.
- `intensity`: configured bloom intensity.

## Notes

- This framework handles policy and planning only.
- Upcoming bloom pass implementation will bind real textures and perform downsample/upsample filtering.
