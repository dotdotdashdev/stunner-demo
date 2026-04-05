# Fog

Fog is now part of the renderer configuration and is applied in both rendering paths:

- WebGPU scene pass in `src/stunner/renderer/post/WebGpuPostGraph.ts`
- WebGL2 fallback post graph in `src/stunner/renderer/post/PostProcessingGraph.ts`

## Config Fields

```ts
type FogConfig = {
  enabled: boolean;
  color: [number, number, number];
  startDistance: number;
  endDistance: number;
  density: number;
  heightFalloff: number;
};
```

## Usage

```ts
import { createRendererConfig } from '../src/stunner/renderer/config/RendererConfig';

const config = createRendererConfig('high', {
  fog: {
    enabled: true,
    color: [0.08, 0.12, 0.14],
    startDistance: 8,
    endDistance: 30,
    density: 0.06,
    heightFalloff: 0.14,
  },
});
```

## Runtime Toggle

The HUD includes a fog toggle button through runtime feature toggles in `src/App.tsx`.

## Tuning Guidance

- Lower `startDistance` to bring fog closer to the camera.
- Lower `endDistance` to saturate the fog sooner.
- Increase `density` for thicker fog buildup over distance.
- Increase `heightFalloff` to keep upper parts of the scene clearer while preserving low-altitude haze.
- Use cool fog colors for night scenes and warm colors for sunset scenes.
