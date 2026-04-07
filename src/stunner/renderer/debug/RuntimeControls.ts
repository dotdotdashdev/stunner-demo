import {
  createRendererConfig,
  type QualityPreset,
  type RendererConfig,
} from '../config/RendererConfig';
export type DebugView = 'off' | 'clusters' | 'lights' | 'shadows' | 'emissive';
export type RuntimeFeatureToggles = {
  shadows: boolean;
  ambientOcclusion: boolean;
  bloom: boolean;
  depthOfField: boolean;
  colorGrading: boolean;
  motionBlur: boolean;
  screenSpaceReflections: boolean;
  fog: boolean;
  frustumCulling: boolean;
};
export const QUALITY_PRESETS: QualityPreset[] = ['low', 'medium', 'high', 'ultra', 'custom'];
export const DEBUG_VIEWS: DebugView[] = ['off', 'clusters', 'lights', 'shadows', 'emissive'];
export const createDefaultRuntimeToggles = (): RuntimeFeatureToggles => {
  return {
    shadows: true,
    ambientOcclusion: true,
    bloom: true,
    depthOfField: true,
    colorGrading: true,
    motionBlur: true,
    screenSpaceReflections: true,
    fog: true,
    frustumCulling: false,
  };
};
export const buildRuntimeRendererConfig = (
  preset: QualityPreset,
  debugView: DebugView,
  toggles: RuntimeFeatureToggles,
  keyLightAzimuthDeg = 150,
  keyLightElevationDeg = 55,
): RendererConfig => {
  return createRendererConfig(preset, {
    clustered: {
      debugView,
    },
    shadows: {
      enabled: toggles.shadows,
      keyLightAzimuthDeg,
      keyLightElevationDeg,
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
    motionBlur: {
      enabled: toggles.motionBlur,
    },
    screenSpaceReflections: {
      enabled: toggles.screenSpaceReflections,
      experimentalEnabled: toggles.screenSpaceReflections,
      stage: toggles.screenSpaceReflections ? 2 : 0,
    },
    fog: {
      enabled: toggles.fog,
    },
    visibility: {
      frustumCullingEnabled: toggles.frustumCulling,
    },
  });
};
