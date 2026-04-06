# Troubleshooting: External Compute Integration

This document helps coding agents diagnose common integration failures for frame hooks, pass injection, resource contracts, and gpuExternal draw sources.

## Fast Triage

1. Confirm build passes first.
2. Disable custom stages and verify baseline rendering.
3. Re-enable one stage at a time.
4. Re-enable gpuExternal on one mesh only.

## Common Issues

### Stage fails intermittently

Symptoms:
- Stage warning logs appear.
- Visual output flickers or updates inconsistently.

Checks:
- Ensure stage failure policy is set intentionally.
- Ensure stage resources expected in reads are present.
- Ensure stage does not throw in normal frames.

Actions:
- Start with skip-stage policy while debugging.
- Add precise read/write contracts.
- Add defensive guards around stage internals.

### Resource contract mismatch

Symptoms:
- Contract type mismatch warnings/errors.

Checks:
- Confirm resource names are spelled exactly.
- Confirm kind matches actual value type.
- Confirm required resources are published before read.

Actions:
- Align stage ordering so producers run before consumers.
- Use optional contracts only when truly optional.

### gpuExternal layout warnings

Symptoms:
- Warning about missing expected shader locations.

Checks:
- Default instanced shader expects locations 4-10 for instance attributes.
- Confirm all required instance attribute locations are provided.
- Confirm stepMode is instance for all external instance buffers.

Actions:
- Add missing shader locations.
- Remove duplicate shader locations.
- Keep buffer layout aligned with active instanced shader.

### Mesh disappears with gpuExternal

Symptoms:
- Instanced mesh not visible.

Checks:
- instanceCount is > 0.
- worldBounds is provided when frustum culling is enabled.
- Material/texture setup remains valid.

Actions:
- Temporarily disable culling to confirm bounds issue.
- Provide conservative worldBounds radius.

### Frame spikes after custom stages

Symptoms:
- Sudden frame-time increases.

Checks:
- Stage CPU budget warnings in logs.
- Per-stage timing entries in renderer metrics.

Actions:
- Split heavy work across frames.
- Move expensive CPU work into GPU compute.
- Reduce synchronization overhead and allocations.

## Regression Checklist

1. Build succeeds.
2. Baseline example visuals unchanged with advanced features disabled.
3. Stage timings present and bounded.
4. No persistent error/warning flood in console.
5. Dispose/restart path works without stale resources.
