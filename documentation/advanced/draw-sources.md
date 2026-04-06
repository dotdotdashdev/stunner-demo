# Advanced Integration: Instanced Draw Sources

This document explains how coding agents should use instanced draw sources in the renderer.

## Intent

Instanced draw sources allow advanced users to choose between:
- cpuPacked: default CPU-packed per-instance upload path.
- gpuExternal: externally managed GPU instance-buffer path.

The default API remains stable and unchanged when drawSource is omitted.

## API Summary

SceneInstancedMesh supports an optional drawSource field.

### cpuPacked mode

- mode: cpuPacked
- Uses:
  - instanceTransforms
  - instanceCustomData
  - instanceMaterialIndices
- Renderer repacks instance data and uploads it each frame.

### gpuExternal mode

- mode: gpuExternal
- Uses:
  - instanceCount
  - instanceBuffers: array of { buffer, layout, offset? }
  - optional worldBounds for culling
- Renderer binds provided instance buffers directly.

## Multi-Buffer Behavior

gpuExternal supports multiple instance buffers by design.

Each buffer entry provides:
- GPUBuffer
- GPUVertexBufferLayout
- optional bind offset

Buffers are bound in declared order after the base mesh vertex buffer.

## Culling Behavior

- cpuPacked: world bounds are computed from instanceTransforms.
- gpuExternal:
  - if worldBounds is provided, frustum culling can stay enabled;
  - if omitted, culling for that instanced mesh is disabled.

## Stability Rules

1. Keep cpuPacked as default path.
2. Treat gpuExternal as explicit opt-in.
3. Validate gpuExternal buffer definitions before relying on them.
4. Fall back to cpuPacked when gpuExternal inputs are invalid.

## Performance Guidance

- For large simulation counts, prefer gpuExternal to avoid per-frame CPU repacking.
- Keep external buffers persistent across frames.
- Update buffers via compute passes/stages, not CPU readback loops.

## Agent Checklist

1. Start with cpuPacked for baseline correctness.
2. Add frame hooks/stages for simulation update ordering.
3. Switch targeted meshes to gpuExternal.
4. Provide explicit worldBounds when culling matters.
5. Verify pass timings and visual output before expanding usage.
