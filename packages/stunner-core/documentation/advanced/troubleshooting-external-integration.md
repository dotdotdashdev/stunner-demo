# Troubleshooting: External Integration

Agent target: quickly isolate issues in hooks, stage injection, and `gpuExternal` instancing.

## Fast checks

1. Confirm build success and clean type errors.
2. Disable custom stages and verify baseline frame output.
3. Re-enable one stage at a time.

## Common failure classes

- Resource contract mismatch (`reads/writes` names or kinds).
- Pipeline/bind group layout incompatibility.
- Invalid external instance buffer layout (shader location, stride, offset).
- Incorrect `instanceCount` or missing `worldBounds`.

## Practical debugging sequence

1. Log stage timing and resource names written each frame.
2. Validate compute outputs with known fixed values.
3. Reintroduce dynamic simulation values after structural validation.
