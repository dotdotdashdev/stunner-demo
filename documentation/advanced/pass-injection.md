# Advanced Integration: Pass Injection

This document outlines an opt-in stage injection system for advanced users who need custom GPU passes integrated with deterministic ordering.

## Intent

Pass injection allows custom compute/render stages to run at defined extension points in the WebGPU pipeline without replacing the full engine backend.

## Why This Exists

Current behavior uses fixed internal pass order. That is stable, but limits advanced orchestration.

Pass injection should provide flexibility while preserving:
- deterministic ordering,
- stable defaults,
- timing visibility,
- clear ownership boundaries.

## Proposed Extension Points

- pre-scene: before scene-prepass.
- pre-post: after scene-prepass and before post stack.
- pre-composite: immediately before final composite.

Optional later points can be added only if required by concrete use cases.

## Stage Contract (Conceptual)

Each stage should receive:
- command encoder handle (or controlled callback wrapper),
- frame context (time, index, config),
- shared resource registry access,
- diagnostics channel.

Each stage should return:
- optional pass timing metadata,
- optional named outputs registered into registry.

## Ordering Model

1. Built-in passes define baseline order.
2. User stages are sorted by extension point then registration order.
3. Stage execution must be deterministic per frame.

## Failure Model

- A stage failure should produce explicit diagnostics.
- Default path should remain operable if advanced mode is disabled.
- In advanced mode, failure policy should be configurable:
  - fail-fast,
  - skip-stage-and-continue.

## Stability Checklist

1. Built-in-only configuration matches current output.
2. Stage insertion does not alter unrelated pass outputs.
3. Timing metrics include injected stages consistently.
4. Command submission ownership remains centralized.

## Agent Implementation Checklist

1. Introduce additive stage registration API.
2. Build stage dispatcher around current internal pass flow.
3. Preserve all existing pass names and timings.
4. Add clear diagnostics and failure policy.
5. Validate deterministic order under repeated runs.
