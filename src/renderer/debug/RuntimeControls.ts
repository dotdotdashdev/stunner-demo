import {
  createRendererConfig,
  type QualityPreset,
  type RendererConfig,
} from '../config/RendererConfig'

export type DebugView = 'off' | 'clusters' | 'lights' | 'shadows'

export type RuntimeFeatureToggles = {
  shadows: boolean
  ambientOcclusion: boolean
  bloom: boolean
  depthOfField: boolean
  colorGrading: boolean
}

export const QUALITY_PRESETS: QualityPreset[] = [
  'low',
  'medium',
  'high',
  'ultra',
  'custom',
]

export const DEBUG_VIEWS: DebugView[] = [
  'off',
  'clusters',
  'lights',
  'shadows',
]

export function createDefaultRuntimeToggles(): RuntimeFeatureToggles {
  return {
    shadows: true,
    ambientOcclusion: true,
    bloom: true,
    depthOfField: true,
    colorGrading: true,
  }
}

export function buildRuntimeRendererConfig(
  preset: QualityPreset,
  debugView: DebugView,
  toggles: RuntimeFeatureToggles,
): RendererConfig {
  return createRendererConfig(preset, {
    clustered: {
      debugView,
    },
    shadows: {
      enabled: toggles.shadows,
    },
    ambientOcclusion: {
      enabled: toggles.ambientOcclusion,
    },
    bloom: {
      enabled: toggles.bloom,
    },
    depthOfField: {
      enabled: toggles.depthOfField,
    },
    colorGrading: {
      enabled: toggles.colorGrading,
    },
  })
}
