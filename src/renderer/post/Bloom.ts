import type { BloomConfig } from '../config/RendererConfig'

export type BloomInput = {
  color: [number, number, number]
  viewportWidth: number
  viewportHeight: number
}

export type BloomMipLevel = {
  width: number
  height: number
}

export type BloomResult = {
  extractWeight: number
  mipLevels: BloomMipLevel[]
  intensity: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function luminance(color: [number, number, number]): number {
  return color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722
}

export function buildBloomMipChain(
  width: number,
  height: number,
  mipCount: number,
): BloomMipLevel[] {
  const levels: BloomMipLevel[] = []
  let currentWidth = Math.max(1, width)
  let currentHeight = Math.max(1, height)

  for (let level = 0; level < mipCount; level += 1) {
    currentWidth = Math.max(1, Math.floor(currentWidth / 2))
    currentHeight = Math.max(1, Math.floor(currentHeight / 2))
    levels.push({ width: currentWidth, height: currentHeight })

    if (currentWidth === 1 && currentHeight === 1) {
      break
    }
  }

  return levels
}

export function evaluateBloom(config: BloomConfig, input: BloomInput): BloomResult {
  if (!config.enabled) {
    return {
      extractWeight: 0,
      mipLevels: [],
      intensity: 0,
    }
  }

  const brightness = luminance(input.color)
  const softKneeStart = config.threshold - config.knee
  const softResponse = clamp(
    (brightness - softKneeStart) / Math.max(0.0001, config.knee),
    0,
    1,
  )
  const hardResponse = brightness > config.threshold ? 1 : 0

  return {
    extractWeight: clamp(Math.max(softResponse * 0.8, hardResponse), 0, 1),
    mipLevels: buildBloomMipChain(
      input.viewportWidth,
      input.viewportHeight,
      config.mipCount,
    ),
    intensity: config.intensity,
  }
}
