# Depth of Field and Bokeh Framework

Phase 4.3 adds a DoF and bokeh evaluation utility layer.

## API

Use `evaluateDepthOfField` from `src/renderer/post/DepthOfField.ts`:

```ts
import { evaluateDepthOfField } from '../renderer/post/DepthOfField';

const dof = evaluateDepthOfField(rendererConfig.depthOfField, {
  depth: 12,
  highlight: 0.9,
});
```

## Output

- `coc`: circle-of-confusion value.
- `blurRadius`: radius after anamorphic scaling.
- `bokehWeight`: highlight-driven bokeh emphasis.
- `bladeCount`: aperture blade count.

## Notes

- This framework computes DoF policy/evaluation values only.
- Upcoming implementation stages will apply these values in separable blur and bokeh composite passes.
