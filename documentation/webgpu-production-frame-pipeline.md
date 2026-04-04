# WebGPU Production Frame Pipeline

The WebGPU backend now uses real GPU textures and full-screen render passes to produce the final frame.

## Runtime Class

- `src/renderer/post/WebGpuPostGraph.ts`

## Frame Textures

Allocated and reused on resize:

- `scene-hdr` (`rgba16float`)
- `scene-normal` (`rgba16float`)
- `scene-material` (`rgba16float`)
- `scene-depth` (`depth24plus`)
- `ao` (`r8unorm`)
- `bloom` (`rgba16float`)
- `dof` (`rgba16float`)

## Pass Order

1. `scene-prepass`
2. `ambient-occlusion`
3. `bloom`
4. `depth-of-field`
5. `color-grading` (composite to canvas)

## Scene Rendering

`scene-prepass` renders a procedural scene (ray-marched sphere + ground) into HDR/normal/material/depth outputs.
This provides real per-pixel depth/normal/highlight data for downstream post effects.
Fog is also applied in this pass using camera distance plus configurable height falloff.

## Post Processing

- AO pass samples material depth + normal textures.
- Bloom pass performs bright-pass extraction and blur from HDR scene color.
- DoF pass computes circle of confusion from linear depth and applies blur.
- Composite pass applies AO, bloom, DoF, exposure/contrast/saturation/temp/tint, and ACES tonemap.

## Engine Integration

`RendererEngine` now:

- uses `WebGpuPostGraph` for WebGPU backend
- keeps CPU graph fallback for WebGL2 backend
- records per-pass CPU timings into renderer metrics

## Notes

This path removes placeholder scalar inputs in the primary backend and is suitable as the baseline for adding real scene geometry and material pipelines next.
