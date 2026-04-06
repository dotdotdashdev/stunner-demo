# Agent Workflow: External Compute Particles

This document provides a practical coding-agent workflow for wiring external compute simulation into the renderer.

## Objective

Run bespoke particle simulation in GPU compute, then render particles through the engine using gpuExternal instanced draw source mode.

## Stability-First Sequence

1. Start from default renderer path with no advanced options.
2. Add frame hooks only for timing/telemetry sync.
3. Add stage injection for deterministic compute scheduling.
4. Add resource contracts for stage reads/writes.
5. Switch one instanced mesh to gpuExternal.
6. Validate output and timings before scaling instance counts.

## Minimal Integration Shape

- Use beforeFrame to update simulation constants (time, delta, camera-driven knobs).
- Run compute stage in pre-scene injection point.
- Publish readiness flags and counts through stage resource store.
- Bind compute output buffers through SceneInstancedMesh.drawSource.gpuExternal.

## Example Shape (Conceptual)

```ts
const engine = new RendererEngine(canvas, config, camera, {
  webGpuStages: [
    {
      name: 'particle-sim',
      injectionPoint: 'pre-scene',
      reads: [
        { name: 'frame-time-seconds', kind: 'number' },
      ],
      writes: [
        { name: 'particle-count', kind: 'number' },
      ],
      execute: ({ encoder, resources }) => {
        // Encode compute pass and dispatch workgroups.
        // Publish latest particle count for diagnostics.
        resources.set('particle-count', 8192);
      },
    },
  ],
  webGpuStageFailurePolicy: 'skip-stage',
  webGpuStageCpuBudgetMs: 2.0,
  webGpuWarnOnExternalLayoutMismatch: true,
});

const particleMesh: SceneInstancedMesh = {
  geometry: quadGeometry,
  material: particleMaterial,
  instanceTransforms: [],
  drawSource: {
    mode: 'gpuExternal',
    instanceCount: particleCount,
    instanceBuffers: [
      {
        buffer: particleTransformBuffer,
        layout: {
          arrayStride: 64,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 4, offset: 0, format: 'float32x4' },
            { shaderLocation: 5, offset: 16, format: 'float32x4' },
            { shaderLocation: 6, offset: 32, format: 'float32x4' },
            { shaderLocation: 7, offset: 48, format: 'float32x4' },
          ],
        },
      },
      {
        buffer: particleCustomBuffer,
        layout: {
          arrayStride: 36,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 8, offset: 0, format: 'float32x4' },
            { shaderLocation: 9, offset: 16, format: 'float32x4' },
            { shaderLocation: 10, offset: 32, format: 'float32' },
          ],
        },
      },
    ],
    worldBounds: {
      center: [0, 8, 0],
      radius: 80,
    },
  },
};
```

## Validation Checklist

1. Render remains stable with stages disabled.
2. Stage runs deterministically at expected injection point.
3. No resource contract warnings for reads/writes.
4. No gpuExternal layout warnings for shader locations.
5. Frame timings remain within target budget.

## Scaling Guidance

- Raise instance counts gradually.
- Keep GPU buffers persistent.
- Avoid per-frame buffer re-creation.
- Track stage timing and total frame cost together.
