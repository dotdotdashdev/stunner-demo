# Ambient Occlusion API

Agent target: use this module as a CPU-side utility for AO parameter evaluation.

## Source of truth

- `src/stunner/renderer/post/AmbientOcclusion.ts`
- Function: `evaluateAmbientOcclusion(config, input)`

## Contract

Input:
- `config`: `AmbientOcclusionConfig`
- `input.depth`: scene depth sample
- `input.normalAlignment`: normal alignment scalar
- `input.localContrast`: local contrast scalar

Output:
- `occlusion`: scalar in `[0, 1]` (`1` means no occlusion)
- `sampleCount`: quality-adjusted integer sample count
- `radius`: active AO radius from config

## Behavior notes

- If `config.enabled` is `false`, output is `occlusion = 1`, `sampleCount = 0`.
- Quality mode scales effective sample count (`low` < `medium` < `high`).
