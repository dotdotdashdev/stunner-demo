import type { ShadowConfig, ShadowFilter } from '../config/RendererConfig'

export type ShadowQualityTier = 'low' | 'medium' | 'high' | 'ultra'

export type PerLightShadowSettings = {
  mapResolution: number
  filter: ShadowFilter
  depthBias: number
  normalBias: number
}

export type ResolvedShadowSettings = {
  tier: ShadowQualityTier
  atlasSize: number
  directional: PerLightShadowSettings & {
    cascadeCount: number
  }
  spot: PerLightShadowSettings
  point: PerLightShadowSettings
  area: PerLightShadowSettings
}

function determineTier(config: ShadowConfig): ShadowQualityTier {
  if (config.atlasSize >= 8192 || config.directionalResolution >= 4096) {
    return 'ultra'
  }

  if (config.atlasSize >= 4096 || config.directionalResolution >= 2048) {
    return 'high'
  }

  if (config.atlasSize >= 2048) {
    return 'medium'
  }

  return 'low'
}

function baseBiasForTier(tier: ShadowQualityTier): {
  depthBias: number
  normalBias: number
} {
  if (tier === 'ultra') {
    return { depthBias: 0.0004, normalBias: 0.001 }
  }

  if (tier === 'high') {
    return { depthBias: 0.0007, normalBias: 0.0015 }
  }

  if (tier === 'medium') {
    return { depthBias: 0.0012, normalBias: 0.0025 }
  }

  return { depthBias: 0.0018, normalBias: 0.0035 }
}

export function resolveShadowSettings(config: ShadowConfig): ResolvedShadowSettings {
  const tier = determineTier(config)
  const bias = baseBiasForTier(tier)

  return {
    tier,
    atlasSize: config.atlasSize,
    directional: {
      mapResolution: config.directionalResolution,
      cascadeCount: config.cascadeCount,
      filter: config.filter,
      depthBias: bias.depthBias,
      normalBias: bias.normalBias,
    },
    spot: {
      mapResolution: config.spotResolution,
      filter: config.filter,
      depthBias: bias.depthBias * 1.2,
      normalBias: bias.normalBias * 1.2,
    },
    point: {
      mapResolution: config.pointResolution,
      filter: config.filter,
      depthBias: bias.depthBias * 1.4,
      normalBias: bias.normalBias * 1.4,
    },
    area: {
      mapResolution: Math.max(256, Math.floor(config.spotResolution / 2)),
      filter: config.filter,
      depthBias: bias.depthBias * 1.5,
      normalBias: bias.normalBias * 1.5,
    },
  }
}
