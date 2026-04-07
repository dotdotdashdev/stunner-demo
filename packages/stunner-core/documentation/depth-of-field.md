# Depth of Field API

Agent target: use current DoF utility behavior only. Bokeh-specific controls are not implemented.

## Source of truth

- `src/stunner/renderer/post/DepthOfField.ts`
- Functions:
  - `computeCircleOfConfusion(config, depth)`
  - `evaluateDepthOfField(config, input)`

## Contract

Input:
- `config`: `DepthOfFieldConfig`
- `input.depth`
- `input.highlight` (accepted but not used in current implementation)

Output:
- `coc`: circle-of-confusion value
- `blurRadius`: currently equal to `coc`

## Important accuracy notes

- No bokeh blade model exists.
- No bokeh weighting output exists.
- Do not document or depend on `bokehWeight`, `bladeCount`, or anamorphic blur outputs.
