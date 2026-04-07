# Bloom API

Agent target: use this module for CPU-side bloom extraction weight and mip-chain planning.

## Source of truth

- `src/stunner/renderer/post/Bloom.ts`
- Functions:
  - `evaluateBloom(config, input)`
  - `buildBloomMipChain(width, height, mipCount)`

## Contract

Input:
- `config`: `BloomConfig`
- `input.color`: HDR RGB sample
- `input.viewportWidth`, `input.viewportHeight`
- `input.highlight` (optional)

Output:
- `extractWeight`: bright-pass scalar in `[0, 1]`
- `mipLevels`: list of `{ width, height }`
- `intensity`: bloom intensity from config

## Behavior notes

- If `config.enabled` is `false`, output disables bloom (`extractWeight = 0`, empty mips, `intensity = 0`).
- Mip sizes are clamped to minimum `1x1`.
