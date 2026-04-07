# Engine Context For Coding Agents

This document is the canonical entry point for agents. Use it to choose the right topic document.

## Documentation Policy

- Source of truth is the set of separate topic documents in `documentation/` and `documentation/advanced/`.
- Do not depend on a concatenated full-context document.
- Load only the documents needed for the current task.

## Primary Runtime Entry Points

- App shell: `src/App.tsx`
- Renderer host: `src/stunner/renderer/CanvasStage.tsx`
- Engine core: `src/stunner/renderer/RendererEngine.ts`
- WebGPU pipeline: `src/stunner/renderer/post/WebGpuPostGraph.ts`

## Read-By-Task Index

Use this routing table before editing code:

- Renderer setup and config:
	- `documentation/renderer-configuration.md`
	- `documentation/runtime-controls-and-debug-views.md`
	- `documentation/quality-matrix.md`
	- `documentation/failover-policy.md`
- Frame pipeline and post stack:
	- `documentation/webgpu-production-frame-pipeline.md`
	- `documentation/render-graph.md`
	- `documentation/render-graph-post-processing-pipeline.md`
	- `documentation/material-transparency-refraction.md`
- Post effects:
	- `documentation/ambient-occlusion.md`
	- `documentation/bloom.md`
	- `documentation/depth-of-field.md`
	- `documentation/color-grading-tone-mapping.md`
	- `documentation/fog.md`
	- `documentation/screen-space-reflections.md`
- Lighting and clustering:
	- `documentation/light-buffers.md`
	- `documentation/cluster-grid.md`
	- `documentation/cluster-assignment.md`
	- `documentation/clustered-lighting-integration.md`
- Shadows:
	- `documentation/shadow-configuration.md`
	- `documentation/directional-shadow-cascades.md`
	- `documentation/spot-point-shadow-mapping.md`
	- `documentation/shadow-filtering-overrides.md`
- glTF assets, animation, and rigging:
	- `documentation/gltf-animation-and-rigging.md`
- Camera/input:
	- `documentation/camera-and-controllers.md`
- Advanced external compute integration:
	- `documentation/advanced/frame-hooks.md`
	- `documentation/advanced/pass-injection.md`
	- `documentation/advanced/compute-integration.md`
	- `documentation/advanced/draw-sources.md`
	- `documentation/advanced/agent-external-particles-workflow.md`
	- `documentation/advanced/troubleshooting-external-integration.md`

## Agent Operating Rules

- Verify behavior against source code before changing implementation or docs.
- Preserve additive extension patterns and default-path stability.
- Prefer typed config and explicit APIs over ad hoc runtime state.
- Update only the topic docs affected by a change.
