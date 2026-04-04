import type { AmbientOcclusionConfig } from '../config/RendererConfig';
export type AmbientOcclusionInput = {
  depth: number;
  normalAlignment: number;
  localContrast: number;
};
export type AmbientOcclusionResult = {
  occlusion: number;
  sampleCount: number;
  radius: number;
};
const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};
const qualityScale = (quality: AmbientOcclusionConfig['quality']): number => {
  if (quality === 'high') {
    return 1;
  }
  if (quality === 'medium') {
    return 0.7;
  }
  return 0.45;
};
export const evaluateAmbientOcclusion = (
  config: AmbientOcclusionConfig,
  input: AmbientOcclusionInput,
): AmbientOcclusionResult => {
  if (!config.enabled) {
    return {
      occlusion: 1,
      sampleCount: 0,
      radius: config.radius,
    };
  }
  const sampleScale = qualityScale(config.quality);
  const effectiveSamples = Math.max(1, Math.floor(config.sampleCount * sampleScale));
  const depthFactor = clamp(1 - input.depth / Math.max(0.0001, config.radius * 24), 0, 1);
  const normalFactor = clamp(input.normalAlignment, 0, 1);
  const contrastFactor = clamp(input.localContrast, 0, 1);
  const occlusion = clamp(
    1 - depthFactor * (1 - normalFactor * 0.6) * contrastFactor * config.intensity,
    0,
    1,
  );
  return {
    occlusion,
    sampleCount: effectiveSamples,
    radius: config.radius,
  };
};
