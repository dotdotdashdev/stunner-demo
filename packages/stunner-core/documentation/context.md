# Engine Context For Coding Agents

This document is the canonical entry point for agents. Use it to choose the right topic document.

## Documentation Policy

- Source of truth is the set of separate topic documents in `packages/stunner-core/documentation/` and `packages/stunner-core/documentation/advanced/`.
- Do not depend on a concatenated full-context document.
- Load only the documents needed for the current task.

## Primary Runtime Entry Points

- App shell: `src/App.tsx`
- Renderer host (demo-owned): `src/demo/CanvasStage.tsx`
- Engine core: `src/stunner/renderer/RendererEngine.ts`
- WebGPU pipeline: `src/stunner/renderer/post/WebGpuPostGraph.ts`

## Read-By-Task Index

Use this routing table before editing code:

- Renderer setup and config:
	- `packages/stunner-core/documentation/renderer-configuration.md`
	- `packages/stunner-core/documentation/runtime-controls-and-debug-views.md`
	- `packages/stunner-core/documentation/quality-matrix.md`
	- `packages/stunner-core/documentation/failover-policy.md`
- Frame pipeline and post stack:
	- `packages/stunner-core/documentation/webgpu-production-frame-pipeline.md`
	- `packages/stunner-core/documentation/render-graph.md`
	- `packages/stunner-core/documentation/render-graph-post-processing-pipeline.md`
	- `packages/stunner-core/documentation/material-transparency-refraction.md`
- Post effects:
	- `packages/stunner-core/documentation/ambient-occlusion.md`
	- `packages/stunner-core/documentation/bloom.md`
	- `packages/stunner-core/documentation/depth-of-field.md`
	- `packages/stunner-core/documentation/color-grading-tone-mapping.md`
	- `packages/stunner-core/documentation/fog.md`
	- `packages/stunner-core/documentation/screen-space-reflections.md`
- Lighting and clustering:
	- `packages/stunner-core/documentation/light-buffers.md`
	- `packages/stunner-core/documentation/cluster-grid.md`
	- `packages/stunner-core/documentation/cluster-assignment.md`
	- `packages/stunner-core/documentation/clustered-lighting-integration.md`
- Shadows:
	- `packages/stunner-core/documentation/shadow-configuration.md`
	- `packages/stunner-core/documentation/directional-shadow-cascades.md`
	- `packages/stunner-core/documentation/spot-point-shadow-mapping.md`
	- `packages/stunner-core/documentation/shadow-filtering-overrides.md`
- glTF assets, animation, and rigging:
	- `packages/stunner-core/documentation/gltf-animation-and-rigging.md`
- Camera/input:
	- `packages/stunner-core/documentation/camera-and-controllers.md`
- Advanced external compute integration:
	- `packages/stunner-core/documentation/advanced/frame-hooks.md`
	- `packages/stunner-core/documentation/advanced/pass-injection.md`
	- `packages/stunner-core/documentation/advanced/compute-integration.md`
	- `packages/stunner-core/documentation/advanced/draw-sources.md`
	- `packages/stunner-core/documentation/advanced/agent-external-particles-workflow.md`
	- `packages/stunner-core/documentation/advanced/troubleshooting-external-integration.md`

## Agent Operating Rules

- Verify behavior against source code before changing implementation or docs.
- Preserve additive extension patterns and default-path stability.
- Prefer typed config and explicit APIs over ad hoc runtime state.
- Update only the topic docs affected by a change.
