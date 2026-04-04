# Renderer Metrics

The renderer now includes a frame metrics store for lightweight performance tracking.

## What Is Captured

- `frameIndex`: incrementing frame number.
- `frameTimeMs`: CPU-side frame duration for the current render loop.
- `passTimings`: per-pass CPU timings (currently includes `clear` pass sample).

## Engine API

```ts
const latest = engine.getLatestFrameMetrics();

if (latest) {
  console.log(latest.frameIndex, latest.frameTimeMs);
}
```

## Metrics Store API

`RendererMetricsStore` supports:

- `addFrame(metrics)`
- `latest()`
- `averageFrameTime(lastN)`
- `snapshot()`

## Notes

- Current metrics are CPU-side measurements.
- GPU timestamp query integration is planned in a later phase.
- Render graph pass timings are exposed through `RenderGraph.execute()` return values for future engine integration.
