import {
  createRendererConfig,
  type QualityPreset,
  type RendererConfig,
} from '../config/RendererConfig'

export type QualitySummary = {
  preset: QualityPreset
  maxTotalLights: number
  clusterCountHint: number
  shadowsEnabled: boolean
  postEffectsEnabled: {
    ambientOcclusion: boolean
    bloom: boolean
    depthOfField: boolean
    colorGrading: boolean
  }
}

const PRESETS: QualityPreset[] = ['low', 'medium', 'high', 'ultra', 'custom']

function estimateClusterCount(config: RendererConfig): number {
  const referenceWidth = 1920
  const referenceHeight = 1080
  const clustersX = Math.ceil(referenceWidth / config.clustered.tileSizeX)
  const clustersY = Math.ceil(referenceHeight / config.clustered.tileSizeY)
  return clustersX * clustersY * config.clustered.zSlices
}

export function getQualitySummary(preset: QualityPreset): QualitySummary {
  const config = createRendererConfig(preset)
  const maxTotalLights =
    config.lights.maxPointLights +
    config.lights.maxSpotLights +
    config.lights.maxDirectionalLights +
    config.lights.maxAreaLights

  return {
    preset,
    maxTotalLights,
    clusterCountHint: estimateClusterCount(config),
    shadowsEnabled: config.shadows.enabled,
    postEffectsEnabled: {
      ambientOcclusion: config.ambientOcclusion.enabled,
      bloom: config.bloom.enabled,
      depthOfField: config.depthOfField.enabled,
      colorGrading: config.colorGrading.enabled,
    },
  }
}

export function buildQualityMatrix(): QualitySummary[] {
  return PRESETS.map((preset) => getQualitySummary(preset))
}
