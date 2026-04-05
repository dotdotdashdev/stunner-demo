export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra' | 'custom';
export type ClusterDebugView = 'off' | 'clusters' | 'lights' | 'shadows';
export type ShadowFilter = 'hard' | 'pcf-3x3' | 'pcf-5x5';
export type Tonemapper = 'aces' | 'filmic' | 'reinhard';
export type ClusteredConfig = {
  enabled: boolean;
  debugView: ClusterDebugView;
  tileSizeX: number;
  tileSizeY: number;
  zSlices: number;
  maxLightsPerCluster: number;
};
export type LightBudgetConfig = {
  maxPointLights: number;
  maxSpotLights: number;
  maxDirectionalLights: number;
  maxAreaLights: number;
};
export type ShadowConfig = {
  enabled: boolean;
  atlasSize: 1024 | 2048 | 4096 | 8192;
  filter: ShadowFilter;
  cascadeCount: 1 | 2 | 3 | 4;
  directionalResolution: 512 | 1024 | 2048 | 4096;
  spotResolution: 256 | 512 | 1024 | 2048;
  pointResolution: 256 | 512 | 1024 | 2048;
  keyLightAzimuthDeg: number;
  keyLightElevationDeg: number;
};
export type AmbientOcclusionConfig = {
  enabled: boolean;
  quality: 'low' | 'medium' | 'high';
  sampleCount: number;
  radius: number;
  intensity: number;
};
export type BloomConfig = {
  enabled: boolean;
  threshold: number;
  knee: number;
  intensity: number;
  mipCount: number;
};
export type DepthOfFieldConfig = {
  enabled: boolean;
  focusDistance: number;
  focusRange: number;
  aperture: number;
  maxCoC: number;
};
export type ColorGradingConfig = {
  enabled: boolean;
  tonemapper: Tonemapper;
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
  tint: number;
};
export type MotionBlurConfig = {
  enabled: boolean;
  intensity: number;
  shutterAngle: number;
  sampleCount: number;
};
export type ScreenSpaceReflectionsConfig = {
  enabled: boolean;
  quality: 'low' | 'medium' | 'high';
  maxSteps: number;
  maxDistance: number;
  thickness: number;
  stride: number;
  resolve: number;
  roughnessCutoff: number;
};
export type FogConfig = {
  enabled: boolean;
  color: [number, number, number];
  startDistance: number;
  endDistance: number;
  density: number;
  heightFalloff: number;
};
export type RendererConfig = {
  preset: QualityPreset;
  clustered: ClusteredConfig;
  lights: LightBudgetConfig;
  shadows: ShadowConfig;
  ambientOcclusion: AmbientOcclusionConfig;
  bloom: BloomConfig;
  depthOfField: DepthOfFieldConfig;
  colorGrading: ColorGradingConfig;
  motionBlur: MotionBlurConfig;
  screenSpaceReflections: ScreenSpaceReflectionsConfig;
  fog: FogConfig;
};
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
const PRESET_CONFIGS: Record<Exclude<QualityPreset, 'custom'>, RendererConfig> = {
  low: {
    preset: 'low',
    clustered: {
      enabled: true,
      debugView: 'off',
      tileSizeX: 32,
      tileSizeY: 32,
      zSlices: 16,
      maxLightsPerCluster: 64,
    },
    lights: {
      maxPointLights: 128,
      maxSpotLights: 64,
      maxDirectionalLights: 2,
      maxAreaLights: 8,
    },
    shadows: {
      enabled: true,
      atlasSize: 1024,
      filter: 'hard',
      cascadeCount: 2,
      directionalResolution: 1024,
      spotResolution: 512,
      pointResolution: 256,
      keyLightAzimuthDeg: 150,
      keyLightElevationDeg: 55,
    },
    ambientOcclusion: {
      enabled: false,
      quality: 'low',
      sampleCount: 8,
      radius: 0.6,
      intensity: 0.5,
    },
    bloom: {
      enabled: true,
      threshold: 1.0,
      knee: 0.4,
      intensity: 0.6,
      mipCount: 4,
    },
    depthOfField: {
      enabled: false,
      focusDistance: 7,
      focusRange: 3,
      aperture: 1.8,
      maxCoC: 8,
    },
    colorGrading: {
      enabled: true,
      tonemapper: 'filmic',
      exposure: 0,
      contrast: 1,
      saturation: 1,
      temperature: 0,
      tint: 0,
    },
    motionBlur: {
      enabled: false,
      intensity: 0.3,
      shutterAngle: 90,
      sampleCount: 6,
    },
    screenSpaceReflections: {
      enabled: false,
      quality: 'low',
      maxSteps: 8,
      maxDistance: 0.2,
      thickness: 0.03,
      stride: 1.2,
      resolve: 0.45,
      roughnessCutoff: 0.45,
    },
    fog: {
      enabled: false,
      color: [0.1, 0.14, 0.16],
      startDistance: 10,
      endDistance: 38,
      density: 0.045,
      heightFalloff: 0.12,
    },
  },
  medium: {
    preset: 'medium',
    clustered: {
      enabled: true,
      debugView: 'off',
      tileSizeX: 32,
      tileSizeY: 32,
      zSlices: 24,
      maxLightsPerCluster: 96,
    },
    lights: {
      maxPointLights: 256,
      maxSpotLights: 128,
      maxDirectionalLights: 3,
      maxAreaLights: 16,
    },
    shadows: {
      enabled: true,
      atlasSize: 2048,
      filter: 'pcf-3x3',
      cascadeCount: 3,
      directionalResolution: 2048,
      spotResolution: 1024,
      pointResolution: 512,
      keyLightAzimuthDeg: 150,
      keyLightElevationDeg: 55,
    },
    ambientOcclusion: {
      enabled: true,
      quality: 'medium',
      sampleCount: 12,
      radius: 0.8,
      intensity: 0.7,
    },
    bloom: {
      enabled: true,
      threshold: 0.95,
      knee: 0.45,
      intensity: 0.75,
      mipCount: 5,
    },
    depthOfField: {
      enabled: true,
      focusDistance: 8,
      focusRange: 3.5,
      aperture: 2,
      maxCoC: 10,
    },
    colorGrading: {
      enabled: true,
      tonemapper: 'aces',
      exposure: 0,
      contrast: 1,
      saturation: 1,
      temperature: 0,
      tint: 0,
    },
    motionBlur: {
      enabled: true,
      intensity: 0.35,
      shutterAngle: 120,
      sampleCount: 8,
    },
    screenSpaceReflections: {
      enabled: true,
      quality: 'medium',
      maxSteps: 10,
      maxDistance: 0.24,
      thickness: 0.028,
      stride: 1.3,
      resolve: 0.5,
      roughnessCutoff: 0.5,
    },
    fog: {
      enabled: true,
      color: [0.09, 0.13, 0.15],
      startDistance: 9,
      endDistance: 34,
      density: 0.05,
      heightFalloff: 0.12,
    },
  },
  high: {
    preset: 'high',
    clustered: {
      enabled: true,
      debugView: 'off',
      tileSizeX: 16,
      tileSizeY: 16,
      zSlices: 32,
      maxLightsPerCluster: 160,
    },
    lights: {
      maxPointLights: 512,
      maxSpotLights: 256,
      maxDirectionalLights: 4,
      maxAreaLights: 32,
    },
    shadows: {
      enabled: true,
      atlasSize: 4096,
      filter: 'pcf-5x5',
      cascadeCount: 4,
      directionalResolution: 4096,
      spotResolution: 2048,
      pointResolution: 1024,
      keyLightAzimuthDeg: 150,
      keyLightElevationDeg: 55,
    },
    ambientOcclusion: {
      enabled: true,
      quality: 'high',
      sampleCount: 16,
      radius: 1,
      intensity: 0.85,
    },
    bloom: {
      enabled: true,
      threshold: 0.9,
      knee: 0.5,
      intensity: 0.9,
      mipCount: 6,
    },
    depthOfField: {
      enabled: true,
      focusDistance: 9,
      focusRange: 4,
      aperture: 2.2,
      maxCoC: 12,
    },
    colorGrading: {
      enabled: true,
      tonemapper: 'aces',
      exposure: 0,
      contrast: 1.03,
      saturation: 1.05,
      temperature: 0,
      tint: 0,
    },
    motionBlur: {
      enabled: true,
      intensity: 0.42,
      shutterAngle: 150,
      sampleCount: 10,
    },
    screenSpaceReflections: {
      enabled: true,
      quality: 'high',
      maxSteps: 14,
      maxDistance: 0.3,
      thickness: 0.026,
      stride: 1.4,
      resolve: 0.56,
      roughnessCutoff: 0.58,
    },
    fog: {
      enabled: true,
      color: [0.08, 0.12, 0.14],
      startDistance: 8,
      endDistance: 30,
      density: 0.06,
      heightFalloff: 0.14,
    },
  },
  ultra: {
    preset: 'ultra',
    clustered: {
      enabled: true,
      debugView: 'off',
      tileSizeX: 16,
      tileSizeY: 16,
      zSlices: 40,
      maxLightsPerCluster: 256,
    },
    lights: {
      maxPointLights: 1024,
      maxSpotLights: 512,
      maxDirectionalLights: 4,
      maxAreaLights: 64,
    },
    shadows: {
      enabled: true,
      atlasSize: 8192,
      filter: 'pcf-5x5',
      cascadeCount: 4,
      directionalResolution: 4096,
      spotResolution: 2048,
      pointResolution: 2048,
      keyLightAzimuthDeg: 150,
      keyLightElevationDeg: 55,
    },
    ambientOcclusion: {
      enabled: true,
      quality: 'high',
      sampleCount: 24,
      radius: 1.2,
      intensity: 1,
    },
    bloom: {
      enabled: true,
      threshold: 0.85,
      knee: 0.55,
      intensity: 1,
      mipCount: 7,
    },
    depthOfField: {
      enabled: true,
      focusDistance: 10,
      focusRange: 4.2,
      aperture: 2.4,
      maxCoC: 14,
    },
    colorGrading: {
      enabled: true,
      tonemapper: 'aces',
      exposure: 0,
      contrast: 1.05,
      saturation: 1.08,
      temperature: 0,
      tint: 0,
    },
    motionBlur: {
      enabled: true,
      intensity: 0.5,
      shutterAngle: 180,
      sampleCount: 12,
    },
    screenSpaceReflections: {
      enabled: true,
      quality: 'high',
      maxSteps: 18,
      maxDistance: 0.34,
      thickness: 0.024,
      stride: 1.5,
      resolve: 0.62,
      roughnessCutoff: 0.64,
    },
    fog: {
      enabled: true,
      color: [0.07, 0.11, 0.13],
      startDistance: 7,
      endDistance: 26,
      density: 0.07,
      heightFalloff: 0.16,
    },
  },
};
const deepMerge = <T>(base: T, patch: DeepPartial<T>): T => {
  if (Array.isArray(base)) {
    return (patch as T) ?? base;
  }
  if (typeof base !== 'object' || base === null) {
    return (patch as T) ?? base;
  }
  const output: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }
    const baseValue = output[key];
    if (
      typeof baseValue === 'object' &&
      baseValue !== null &&
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      output[key] = deepMerge(baseValue, value);
      continue;
    }
    output[key] = value;
  }
  return output as T;
};
export const createRendererConfig = (
  preset: QualityPreset,
  overrides: DeepPartial<RendererConfig> = {},
): RendererConfig => {
  const basePreset = preset === 'custom' ? PRESET_CONFIGS.high : PRESET_CONFIGS[preset];
  const merged = deepMerge(basePreset, overrides);
  return {
    ...merged,
    preset,
  };
};
