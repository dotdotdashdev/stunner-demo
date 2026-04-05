# Color Grading and Tone Mapping Framework

Phase 4.4 adds color grading and tonemapping utilities.

## API

Use `applyColorGrading` from `src/stunner/renderer/post/ColorGrading.ts`:

```ts
import { applyColorGrading } from '../stunner/renderer/post/ColorGrading';

const outputColor = applyColorGrading([1.4, 1.2, 1.1], rendererConfig.colorGrading);
```

## Supported Tonemappers

- `aces`
- `filmic`
- `reinhard`

## Color Controls

- exposure
- contrast
- saturation
- temperature
- tint

## Notes

- This framework is CPU-side reference logic for grading policy and visual tuning.
- Upcoming integration can move this logic into a full-screen post-processing shader pass with LUT support.
