# Light Buffers (Point, Spot, Directional, Area)

Light data now has a shared packed representation for clustered shading.

## Types

Defined in `src/rendering/lights/LightTypes.ts`:

- `PointLight`
- `SpotLight`
- `DirectionalLight`
- `AreaLight`
- Union: `RenderLight`

## Packing API

Use `packLights` from `src/rendering/lights/LightBuffers.ts`:

```ts
import { packLights } from '../rendering/lights/LightBuffers'

const packed = packLights(lights)

// packed.data -> Float32Array
// packed.count -> light count
// packed.strideFloats -> per-light stride (16 floats)
```

## Layout (16 floats per light)

Layout is intentionally compact and GPU-buffer friendly. Field semantics vary by light type.

- Slot 0-3: primary vector + scalar (position/range or direction)
- Slot 4-7: color + intensity
- Slot 8-15: type-specific payload and flags

## Notes

- This is a staging format for upcoming cluster assignment and shader-side decode logic.
- Area light shadowing is not yet implemented; type support is data-level scaffolding.
