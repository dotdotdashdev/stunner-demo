# Advanced Integration: External Compute and Multi-Buffer Data Flow

This document describes how advanced users should integrate bespoke GPU simulation/compute workflows with the renderer.

## Core Position

Do not force users into a single concatenated buffer model.

Advanced simulation often has multiple logical datasets:
- transforms,
- velocities,
- per-instance material selectors,
- custom attributes,
- lifecycle/state flags.

The engine should support multi-buffer workflows directly.

## Recommended Architecture

Use three additive layers:

1. frame hooks:
- synchronize external simulation with frame timing.

2. pass injection:
- run custom compute stages at deterministic points.

3. shared resource registry:
- publish and consume named GPU resources across stages.

## Resource Registry Requirements

Support named resources for:
- GPU buffers,
- GPU textures/views,
- samplers,
- metadata (counts, stride, schema/version).

Support validation for:
- usage compatibility,
- existence checks,
- expected shape/stride constraints.

Phase 3 implementation status:
- Named per-frame stage resource registry is active.
- Stage read/write contracts are validated at runtime.
- Built-in render resource storage is isolated from stage metadata storage.

Practical result:
- External stages can exchange data by name with explicit contracts.
- Missing or mismatched resources are surfaced early with clear errors/warnings.

## Draw Source Model (Implemented in Phase 4)

Implemented opt-in draw modes:
- cpuPacked: existing CPU packed instance path.
- gpuExternal: engine reads advanced draw bindings from registry/config.

gpuExternal supports:
- multiple vertex buffers,
- explicit instance count provider,
- explicit per-buffer vertex layouts,
- optional world bounds for culling.

Current limitation:
- The default gpuExternal path assumes instance attributes are provided through vertex buffer layouts compatible with the instanced scene shader contract.
- Storage-buffer-fetch-based instance decoding can be layered later as a follow-up enhancement.

## Why Not Single External Buffer

Single buffer is sometimes useful, but it can be limiting:
- weak separation of concerns,
- difficult schema evolution,
- packing/unpacking overhead,
- harder debugging.

Multi-buffer support keeps simulation architecture cleaner and scales better.

## Performance Guidance

- Use persistent GPU buffers; avoid per-frame recreation.
- Keep shader-side fetch patterns coherent and cache-friendly.
- Minimize CPU readbacks.
- Prefer fixed-size ring/arena allocation for transient outputs.
- Track per-stage CPU/GPU timing where possible.

## Stability Guidance

- Keep default path as first-class and unchanged.
- Make advanced path explicit and opt-in.
- Provide graceful fallback with actionable diagnostics.
- Version resource schemas when evolving advanced contracts.

## Agent Workflow Checklist

1. Implement frame hooks first.
2. Add stage injection with strict ordering.
3. Add resource registry with validation.
4. Add gpuExternal draw-source mode only after registry is stable.
5. Validate with a minimal particle compute prototype.

## Implementation Notes for Agents

- Keep gpuExternal fully opt-in; do not change existing cpuPacked callers.
- Prefer persistent GPU buffers created once and updated by compute stages.
- Provide world bounds in gpuExternal mode when frustum culling should remain active.
- If gpuExternal definitions are invalid, renderer fallback behavior should remain predictable.

## Reference Demo

- Compute flocking demo implementation:
	- src/demo/flockingDemo.ts
	- src/stunner/renderer/CanvasStage.tsx
	- src/App.tsx

This demo uses:
- pre-scene compute stage execution,
- gpuExternal multi-buffer instance bindings,
- black-background sky override,
- velocity-linked emissive intensity.
