# glTF Animation And Rigging

Agent target: load animated/rigged glTF assets, drive playback, and support runtime control hooks.

## Source of truth

- `src/stunner/renderer/mesh/AnimatedGltfLoader.ts`
- `src/example/modelsAndMaterials.ts`
- `src/demo/CanvasStage.tsx`
- `src/stunner/renderer/post/WebGpuPostGraph.ts`

## What is supported

- Animated glTF loading with CPU skinning runtime (`AnimatedGltfLoader`).
- Runtime clip playback control:
  - clip selection
  - looping
  - playback speed
  - per-node pose overrides for manual rig control
- Mixed scenes containing static + animated glTF meshes.

## Current runtime integration

- `modelsAndMaterials` loads:
  - Cesium Man (animated, rigged)
  - Boombox (static)
- The example updates Cesium animation every frame via `beforeFrame`.
- The example also applies continuous opposite-direction yaw rotation for Cesium and Boombox.

## HUD controls

- Example-specific HUD in `App.tsx` exposes:
  - animation speed
  - shared model rotation speed
- `CanvasStage` routes those options to `modelsAndMaterials` and applies live updates.

## GPU update requirement

- Animated CPU-skinned vertices and per-frame transform changes must be pushed to GPU each frame.
- `WebGpuPostGraph` now synchronizes mutable scene mesh state every render frame (`syncGpuSceneState`).

## Asset notes

- Draco-compressed glTF is currently not decoded at runtime in this path.
- Loaders explicitly reject Draco assets and emit guidance.
