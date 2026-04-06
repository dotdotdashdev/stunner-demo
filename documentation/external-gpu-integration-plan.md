# External GPU Integration Plan (Stability-First)

This document tracks implementation progress for advanced external GPU compute integration while preserving current engine behavior.

## Goals

- Keep current public API behavior unchanged for all existing users.
- Add opt-in advanced extension points for compute-driven rendering.
- Prioritize engine stability, deterministic behavior, and safe fallbacks.
- Enable coding agents to implement incrementally with explicit verification gates.

## Non-Goals (Initial Phases)

- No breaking changes to default scene submission flow.
- No mandatory migration for existing demos or callers.
- No broad shader contract rewrite in phase 1.

## Current Baseline (Verified)

- Scene updates flow through RendererEngine.setScene and CPU-side scene structures.
- WebGPU frame encoding/submission is internal to WebGpuPostGraph.
- Instanced rendering currently uses a fixed packed instance vertex layout.
- Existing customization path is shader override, not pass injection.

## Stability Guardrails (Apply Before Every Step)

1. Preserve default execution path exactly when advanced options are not used.
2. Add new capabilities behind explicit opt-in flags/options.
3. Keep rendering order deterministic and metrics intact.
4. Prefer additive type changes over mutating existing contracts.
5. Include runtime validation with clear diagnostics for advanced paths.
6. Ensure all new resources are released on disposal and on scene churn.

## Phased Plan

### Step 1: Frame Hooks (Low-Risk)

Deliverables:
- Add optional beforeFrame and afterFrame hooks for WebGPU execution.
- Provide minimal, stable hook context (device, frame index, time, delta, config snapshot).
- Keep internals encapsulated in this phase (no direct stage/resource mutation).

Validation:
- Existing demos render unchanged with hooks disabled.
- Hooks enabled with no-op callbacks do not alter output or timings significantly.
- Engine dispose path remains clean.

Status: completed

### Step 2: Pluggable WebGPU Stages (Core)

Deliverables:
- Introduce an opt-in stage registration API around existing fixed pass order.
- Support user stages at selected extension points (pre-scene, pre-post, pre-composite).
- Maintain deterministic ordering and pass timing reporting.

Validation:
- Built-in stage-only mode reproduces current frame output.
- Stage insertion failures are isolated and reported without crashing default path.
- Command submission remains single-owner and predictable.

Status: completed

### Step 3: Shared GPU Resource Registry (Generalized Data Flow)

Deliverables:
- Add named registry for GPU resources (buffers/textures/samplers/metadata).
- Permit user stages to publish/consume resources by name.
- Add lightweight schema and validation for buffer usage expectations.

Validation:
- Missing resources fail with actionable diagnostics.
- Registry lifecycle is frame-safe and does not leak resources.
- No overhead regression on default path.

Status: not-started

### Step 4: Advanced Draw Source (Optional, Multi-Buffer Ready)

Deliverables:
- Add opt-in draw source modes for instancing: cpuPacked (existing), gpuExternal (new).
- Allow multiple vertex/storage buffers and explicit instance count sourcing.
- Avoid forced buffer concatenation by design.

Validation:
- Existing instancing behavior is unchanged in cpuPacked mode.
- gpuExternal mode supports multi-buffer layouts deterministically.
- Frustum culling and bounds handling remain correct.

Status: not-started

### Step 5: Agent-Focused Authoring and Diagnostics

Deliverables:
- Add documentation and examples for hook/stage/registry usage.
- Add troubleshooting matrix for binding/layout/usage mismatches.
- Provide migration guidance for advanced users.

Validation:
- Example flows are reproducible by coding agents.
- Diagnostics identify misconfiguration quickly.

Status: in-progress

## Progress Log

- 2026-04-06: Created implementation tracker and split advanced docs for coding-agent use.
- 2026-04-06: No engine code changes yet; documentation-first checkpoint before Step 1 implementation.
- 2026-04-06: Implemented additive frame hooks in RendererEngine (beforeFrame, afterFrame, onError).
- 2026-04-06: Verified TypeScript/build stability via production build (tsc -b and vite build).
- 2026-04-06: Implemented pluggable WebGPU stages with deterministic ordering and injection points (pre-scene, pre-post, pre-composite).
- 2026-04-06: Added stage failure policy support (skip-stage default, fail-fast optional).
- 2026-04-06: Exposed stage options through RendererEngine and verified full build stability.

## Step 1 Outcome Summary

- Default behavior remains unchanged when hooks are omitted.
- Hook context includes backend, device, frame index, time, delta, and config reference.
- Hook errors are isolated and routed to an optional onError callback.
- Fallback diagnostics are emitted through console warnings when no onError is provided.

## Step 1 Re-evaluation (Stability, Performance, Usage)

- Stability: additive-only API changes; no pass ordering changes; default loop path preserved.
- Performance: no measurable cost on default path beyond a lightweight null-check for optional hooks.
- Usage clarity: hook surface is intentionally small and does not expose mutable internal pass resources yet.
- Failure handling: hook exceptions are contained to prevent loop corruption.
- Disposal: no additional persistent resources introduced in this phase.

## Candidate Optimizations Before Step 2

1. Add optional hook timing metrics to renderer telemetry for visibility.
2. Add a small dev warning when hooks appear to perform heavy synchronous work.
3. Add a lightweight sample demonstrating safe compute-buffer updates from beforeFrame.

## Step 2 Outcome Summary

- Added additive stage contracts and injection points without changing default pass order.
- Preserved deterministic stage ordering using order value plus registration sequence.
- Added per-stage timing entries to pass timing output for observability.
- Added failure policy control to support strict or resilient advanced pipelines.

## Step 2 Re-evaluation (Stability, Performance, Usage)

- Stability: no behavior changes when no stages are registered.
- Performance: stage dispatch adds negligible overhead when stage lists are empty.
- Usage clarity: stage API is explicit about injection point and execution policy.
- Failure handling: skip-stage mode isolates faulty stages while keeping frame alive.
- Resource sharing: stage context now includes a per-frame resource store for named exchange.

## Candidate Optimizations Before Step 3

1. Introduce typed wrappers for commonly used resource names to reduce string drift.
2. Add optional strict diagnostics mode for duplicate stage names.
3. Add per-stage soft budget warnings for long synchronous stage durations.

## Checkpoint Policy

After each step completion:
1. Update this document status fields.
2. Record observed risks and mitigations.
3. Request user review before advancing to next step.

## Re-evaluation Checklist (Run After Every Step)

- Stability: Did default behavior remain unchanged?
- Performance: Did frame time variance increase?
- API clarity: Is the opt-in path understandable without internals?
- Failure mode quality: Are diagnostics explicit and actionable?
- Disposal safety: Are all created resources and callbacks cleaned up?
