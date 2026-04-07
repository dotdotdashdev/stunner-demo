# Light Buffer Packing API

Agent target: pack light arrays for renderer-side GPU-style buffer consumption.

## Source of truth

- `src/stunner/renderer/lights/LightTypes.ts`
- `src/stunner/renderer/lights/LightBuffers.ts`
- Function: `packLights(lights)`

## Output

- `data`: packed `Float32Array`
- `count`: number of lights packed
- `strideFloats`: per-light stride (`16`)

## Supported light kinds

- `point`
- `spot`
- `directional`
- `area`

## Behavior notes

- Direction vectors are normalized before packing.
- Invalid zero-length directions fall back to `[0, -1, 0]`.
