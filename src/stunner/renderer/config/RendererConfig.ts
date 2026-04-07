export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra' | 'custom';
export type ClusterDebugView = 'off' | 'clusters' | 'lights' | 'shadows' | 'emissive';
export type ShadowFilter = 'hard' | 'pcf-3x3' | 'pcf-5x5';
export type ShadowTechnique = 'approximate' | 'shadow-map';
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
  directionalTechnique: ShadowTechnique;
  pointTechnique: ShadowTechnique;
  spotTechnique: ShadowTechnique;
  areaTechnique: ShadowTechnique;
  atlasSize: 1024 | 2048 | 4096 | 8192;
  filter: ShadowFilter;
  cascadeCount: 1 | 2 | 3 | 4;
  directionalResolution: 512 | 1024 | 2048 | 4096;
  spotResolution: 256 | 512 | 1024 | 2048;
  pointResolution: 256 | 512 | 1024 | 2048;
  keyLightAzimuthDeg: number;
  keyLightElevationDeg: number;
  shadowMapBias: number;
  shadowMapSoftness: number;
  shadowMapStrength: number;
  pointShadowStrength: number;
  pointShadowSoftness: number;
  spotShadowStrength: number;
  spotShadowSoftness: number;
  areaShadowStrength: number;
  areaShadowSoftness: number;
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
export type EmissiveEffectsConfig = {
  enabled: boolean;
  trailLength: number;
  blur: number;
  boost: number;
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
export type LightShaftsConfig = {
  enabled: boolean;
  intensity: number;
  decay: number;
  sampleCount: number;
  threshold: number;
};
export type ScreenSpaceReflectionsConfig = {
  enabled: boolean;
  experimentalEnabled: boolean;
  stage: 0 | 1 | 2;
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
export type EnvironmentConfig = {
  horizonBlendStart: number;
  horizonBlendEnd: number;
  horizonFogInfluence: number;
  groundLift: number;
  skyColorAboveHorizon: [number, number, number];
  skyColorBelowHorizon: [number, number, number];
  horizonFogColor: [number, number, number];
};
export type LightingTuningConfig = {
  fillLightStrength: number;
  ambientStrength: number;
  environmentSpecularStrength: number;
  shadowMinVisibility: number;
};
export type VisibilityConfig = {
  frustumCullingEnabled: boolean;
  frustumCullingPadding: number;
};
export type RendererConfig = {
  preset: QualityPreset;
  clustered: ClusteredConfig;
  lights: LightBudgetConfig;
  shadows: ShadowConfig;
  ambientOcclusion: AmbientOcclusionConfig;
  bloom: BloomConfig;
  emissiveEffects: EmissiveEffectsConfig;
  depthOfField: DepthOfFieldConfig;
  colorGrading: ColorGradingConfig;
  motionBlur: MotionBlurConfig;
  lightShafts: LightShaftsConfig;
  screenSpaceReflections: ScreenSpaceReflectionsConfig;
  fog: FogConfig;
  environment: EnvironmentConfig;
  lightingTuning: LightingTuningConfig;
  visibility: VisibilityConfig;
};
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
const SHADOW_TUNING_DEFAULTS: Pick<
  ShadowConfig,
  | 'shadowMapBias'
  | 'shadowMapSoftness'
  | 'shadowMapStrength'
  | 'pointShadowStrength'
  | 'pointShadowSoftness'
  | 'spotShadowStrength'
  | 'spotShadowSoftness'
  | 'areaShadowStrength'
  | 'areaShadowSoftness'
> = {
  shadowMapBias: 0.0015,
  shadowMapSoftness: 1.5,
  shadowMapStrength: 0.85,
  pointShadowStrength: 1.0,
  pointShadowSoftness: 0.7,
  spotShadowStrength: 1.0,
  spotShadowSoftness: 0.7,
  areaShadowStrength: 1.0,
  areaShadowSoftness: 0.7,
};

const ARTISTIC_BASE_CONFIG: Pick<
  RendererConfig,
  | 'bloom'
  | 'emissiveEffects'
  | 'depthOfField'
  | 'colorGrading'
  | 'motionBlur'
  | 'lightShafts'
  | 'screenSpaceReflections'
  | 'fog'
  | 'environment'
> = {
  bloom: {
    enabled: true,
    threshold: 2.2,
    knee: 0.5,
    intensity: 0.28,
    mipCount: 6,
  },
  emissiveEffects: {
    enabled: false,
    trailLength: 0.82,
    blur: 1.2,
    boost: 1,
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
    exposure: 0.83,
    contrast: 1.03,
    saturation: 1.4,
    temperature: 1.25,
    tint: 0,
  },
  motionBlur: {
    enabled: true,
    intensity: 0.42,
    shutterAngle: 150,
    sampleCount: 10,
  },
  lightShafts: {
    enabled: false,
    intensity: 0.82,
    decay: 1.15,
    sampleCount: 48,
    threshold: 1.0,
  },
  screenSpaceReflections: {
    enabled: true,
    experimentalEnabled: false,
    stage: 0,
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
    heightFalloff: 0.531,
  },
  environment: {
    horizonBlendStart: -0.14,
    horizonBlendEnd: 0.09,
    horizonFogInfluence: 0.18,
    groundLift: 0.012,
    skyColorAboveHorizon: [0.12, 0.18, 0.28],
    skyColorBelowHorizon: [0.03, 0.05, 0.09],
    horizonFogColor: [0.08, 0.12, 0.14],
  },
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
      directionalTechnique: 'shadow-map',
      pointTechnique: 'shadow-map',
      spotTechnique: 'shadow-map',
      areaTechnique: 'shadow-map',
      atlasSize: 1024,
      filter: 'hard',
      cascadeCount: 2,
      directionalResolution: 1024,
      spotResolution: 512,
      pointResolution: 256,
      keyLightAzimuthDeg: 150,
      keyLightElevationDeg: 55,
      ...SHADOW_TUNING_DEFAULTS,
    },
    ambientOcclusion: {
      enabled: false,
      quality: 'low',
      sampleCount: 8,
      radius: 0.6,
      intensity: 0.5,
    },
    bloom: { ...ARTISTIC_BASE_CONFIG.bloom },
    emissiveEffects: { ...ARTISTIC_BASE_CONFIG.emissiveEffects },
    depthOfField: { ...ARTISTIC_BASE_CONFIG.depthOfField },
    colorGrading: { ...ARTISTIC_BASE_CONFIG.colorGrading },
    motionBlur: { ...ARTISTIC_BASE_CONFIG.motionBlur },
    lightShafts: { ...ARTISTIC_BASE_CONFIG.lightShafts },
    screenSpaceReflections: { ...ARTISTIC_BASE_CONFIG.screenSpaceReflections },
    fog: { ...ARTISTIC_BASE_CONFIG.fog },
    environment: { ...ARTISTIC_BASE_CONFIG.environment },
    lightingTuning: {
      fillLightStrength: 1,
      ambientStrength: 1,
      environmentSpecularStrength: 1,
      shadowMinVisibility: 0.2,
    },
    visibility: {
      frustumCullingEnabled: false,
      frustumCullingPadding: 1.12,
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
      directionalTechnique: 'shadow-map',
      pointTechnique: 'shadow-map',
      spotTechnique: 'shadow-map',
      areaTechnique: 'shadow-map',
      atlasSize: 2048,
      filter: 'pcf-3x3',
      cascadeCount: 3,
      directionalResolution: 2048,
      spotResolution: 1024,
      pointResolution: 512,
      keyLightAzimuthDeg: 150,
      keyLightElevationDeg: 55,
      ...SHADOW_TUNING_DEFAULTS,
    },
    ambientOcclusion: {
      enabled: true,
      quality: 'medium',
      sampleCount: 12,
      radius: 0.8,
      intensity: 0.7,
    },
    bloom: { ...ARTISTIC_BASE_CONFIG.bloom },
    emissiveEffects: { ...ARTISTIC_BASE_CONFIG.emissiveEffects },
    depthOfField: { ...ARTISTIC_BASE_CONFIG.depthOfField },
    colorGrading: { ...ARTISTIC_BASE_CONFIG.colorGrading },
    motionBlur: { ...ARTISTIC_BASE_CONFIG.motionBlur },
    lightShafts: { ...ARTISTIC_BASE_CONFIG.lightShafts },
    screenSpaceReflections: { ...ARTISTIC_BASE_CONFIG.screenSpaceReflections },
    fog: { ...ARTISTIC_BASE_CONFIG.fog },
    environment: { ...ARTISTIC_BASE_CONFIG.environment },
    lightingTuning: {
      fillLightStrength: 1,
      ambientStrength: 1,
      environmentSpecularStrength: 1,
      shadowMinVisibility: 0.2,
    },
    visibility: {
      frustumCullingEnabled: false,
      frustumCullingPadding: 1.12,
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
      directionalTechnique: 'shadow-map',
      pointTechnique: 'shadow-map',
      spotTechnique: 'shadow-map',
      areaTechnique: 'shadow-map',
      atlasSize: 4096,
      filter: 'pcf-5x5',
      cascadeCount: 4,
      directionalResolution: 4096,
      spotResolution: 2048,
      pointResolution: 1024,
      keyLightAzimuthDeg: 150,
      keyLightElevationDeg: 55,
      ...SHADOW_TUNING_DEFAULTS,
    },
    ambientOcclusion: {
      enabled: true,
      quality: 'high',
      sampleCount: 16,
      radius: 1,
      intensity: 0.85,
    },
    bloom: { ...ARTISTIC_BASE_CONFIG.bloom },
    emissiveEffects: { ...ARTISTIC_BASE_CONFIG.emissiveEffects },
    depthOfField: { ...ARTISTIC_BASE_CONFIG.depthOfField },
    colorGrading: { ...ARTISTIC_BASE_CONFIG.colorGrading },
    motionBlur: { ...ARTISTIC_BASE_CONFIG.motionBlur },
    lightShafts: { ...ARTISTIC_BASE_CONFIG.lightShafts },
    screenSpaceReflections: { ...ARTISTIC_BASE_CONFIG.screenSpaceReflections },
    fog: { ...ARTISTIC_BASE_CONFIG.fog },
    environment: { ...ARTISTIC_BASE_CONFIG.environment },
    lightingTuning: {
      fillLightStrength: 1,
      ambientStrength: 1,
      environmentSpecularStrength: 1,
      shadowMinVisibility: 0.2,
    },
    visibility: {
      frustumCullingEnabled: false,
      frustumCullingPadding: 1.12,
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
      directionalTechnique: 'shadow-map',
      pointTechnique: 'shadow-map',
      spotTechnique: 'shadow-map',
      areaTechnique: 'shadow-map',
      atlasSize: 8192,
      filter: 'pcf-5x5',
      cascadeCount: 4,
      directionalResolution: 4096,
      spotResolution: 2048,
      pointResolution: 2048,
      keyLightAzimuthDeg: 150,
      keyLightElevationDeg: 55,
      ...SHADOW_TUNING_DEFAULTS,
    },
    ambientOcclusion: {
      enabled: true,
      quality: 'high',
      sampleCount: 24,
      radius: 1.2,
      intensity: 1,
    },
    bloom: { ...ARTISTIC_BASE_CONFIG.bloom },
    emissiveEffects: { ...ARTISTIC_BASE_CONFIG.emissiveEffects },
    depthOfField: { ...ARTISTIC_BASE_CONFIG.depthOfField },
    colorGrading: { ...ARTISTIC_BASE_CONFIG.colorGrading },
    motionBlur: { ...ARTISTIC_BASE_CONFIG.motionBlur },
    lightShafts: { ...ARTISTIC_BASE_CONFIG.lightShafts },
    screenSpaceReflections: { ...ARTISTIC_BASE_CONFIG.screenSpaceReflections },
    fog: { ...ARTISTIC_BASE_CONFIG.fog },
    environment: { ...ARTISTIC_BASE_CONFIG.environment },
    lightingTuning: {
      fillLightStrength: 1,
      ambientStrength: 1,
      environmentSpecularStrength: 1,
      shadowMinVisibility: 0.2,
    },
    visibility: {
      frustumCullingEnabled: false,
      frustumCullingPadding: 1.12,
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
