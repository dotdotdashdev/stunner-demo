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

## Agent guidance

- Default to `cpuPacked` unless compute-driven or zero-copy workflows require `gpuExternal`.
- In `gpuExternal`, validate shader locations and buffer stride/offset alignment.
