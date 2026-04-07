# Failover Policy API

Agent target: use this policy to move quality preset up or down based on frame budget and overflow signals.

## Source of truth

- `src/stunner/renderer/quality/FailoverPolicy.ts`
- Function: `evaluateFailover(input)`

## Inputs

- `currentPreset`
- `avgFrameTimeMs`
- `shadowOverflowCount`
- `clusterOverflowCount`
- `deviceClass`: `desktop | laptop | mobile`

## Output

- `nextPreset`
- `reason`
- `appliedConfig` (from `createRendererConfig(nextPreset)`)

## Behavior notes

- `custom` is clamped to `high` for policy progression.
- Preset order is `low -> medium -> high -> ultra`.
- Overflow or sustained over-budget frame time can reduce preset.
- Sustained headroom can raise preset.
