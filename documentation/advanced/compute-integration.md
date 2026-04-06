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

## Draw Source Model (Future Advanced Path)

Add opt-in draw modes:
- cpuPacked: existing CPU packed instance path.
- gpuExternal: engine reads advanced draw bindings from registry/config.

gpuExternal should allow:
- multiple vertex buffers,
- optional storage-buffer fetch shaders,
- explicit instance count provider,
- clear layout contracts.

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
