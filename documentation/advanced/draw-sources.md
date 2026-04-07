# Advanced API: Instanced Draw Sources

Agent target: choose between CPU-packed and external GPU instanced data paths.

## Source of truth

- `src/stunner/renderer/mesh/SceneTypes.ts`
- `src/stunner/renderer/post/WebGpuPostGraph.ts`

## Modes

- `cpuPacked`
  - Uses `instanceTransforms`, `instanceCustomData`, `instanceMaterialIndices`.
- `gpuExternal`
  - Uses externally managed `GPUBuffer` bindings and explicit vertex layouts.

## Optional profiles

- `standard` (default)
  - Existing instanced shading path.
  - Expected instance attributes: shader locations `4..10`.
- `rigged`
  - Optional GPU palette skinning path for instanced rigged meshes.
  - Requires:
    - `drawSource.rig` with:
      - `paletteBuffer`
      - `maxPaletteMatrices`
    - Geometry skinning streams on mesh geometry:
      - `geometry.skinning.jointIndices` (`u16x4` per vertex)
      - `geometry.skinning.jointWeights` (`f32x4` per vertex)
    - Per-instance rig state stream in `instanceBuffers` with shader locations `11` and `12`
      (for example via `createRigInstanceStateLayout`)

When rig resources are missing or invalid, renderer falls back to the `standard` path.

## Agent guidance

- Default to `cpuPacked` unless compute-driven or zero-copy workflows require `gpuExternal`.
- In `gpuExternal`, validate shader locations and buffer stride/offset alignment.
- Prefer enabling `rigged` only when required. It is optional and isolated from default paths.
