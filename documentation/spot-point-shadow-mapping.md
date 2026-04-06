# Spot/Point Shadow Atlas Planning API

Agent target: pack spot and point shadow requests into a 2D atlas plan.

## Source of truth

- `src/stunner/renderer/shadows/SpotPointShadowMapping.ts`
- Function: `buildSpotPointShadowAtlasPlan(lights, options)`

## Behavior

- Spot shadow-casting light -> 1 request.
- Point shadow-casting light -> 6 face requests.
- Requests are sorted by resolution (descending) and packed row-by-row.

## Output

- `atlasSize` (power-of-two normalized)
- `slots` with `(x, y, size, request)`
- `overflowRequests` for requests that did not fit
