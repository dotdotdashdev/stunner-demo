# Renderer Metrics API

Agent target: read lightweight CPU frame metrics and pass timings.

## Source of truth

- `src/stunner/renderer/metrics/RendererMetrics.ts`
- `src/stunner/renderer/RendererEngine.ts` (`getLatestFrameMetrics()`)

## Captured data

- `frameIndex`
- `frameIntervalMs`
- `frameTimeMs`
- `passTimings[]` with `{ passName, cpuTimeMs }`

## Store API

- `addFrame(metrics)`
- `latest()`
- `averageFrameTime(lastN?)`
- `snapshot()`

## Scope note

- Metrics are CPU-side timing only.
