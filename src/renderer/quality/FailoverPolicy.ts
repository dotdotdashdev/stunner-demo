import {
  createRendererConfig,
  type QualityPreset,
  type RendererConfig,
} from '../config/RendererConfig';
type DeviceClass = 'desktop' | 'laptop' | 'mobile';
export type FailoverInput = {
  currentPreset: QualityPreset;
  avgFrameTimeMs: number;
  shadowOverflowCount: number;
  clusterOverflowCount: number;
  deviceClass: DeviceClass;
};
export type FailoverDecision = {
  nextPreset: QualityPreset;
  reason: string;
  appliedConfig: RendererConfig;
};
const ORDERED_PRESETS: QualityPreset[] = ['low', 'medium', 'high', 'ultra'];
const clampPreset = (preset: QualityPreset): QualityPreset => {
  if (preset === 'custom') {
    return 'high';
  }
  return preset;
};
const presetIndex = (preset: QualityPreset): number => {
  return ORDERED_PRESETS.indexOf(clampPreset(preset));
};
const resolveFrameBudget = (deviceClass: DeviceClass): number => {
  if (deviceClass === 'mobile') {
    return 20;
  }
  if (deviceClass === 'laptop') {
    return 18;
  }
  return 16.7;
};
export const evaluateFailover = (input: FailoverInput): FailoverDecision => {
  const frameBudget = resolveFrameBudget(input.deviceClass);
  const currentIndex = presetIndex(input.currentPreset);
  const hasOverflow = input.shadowOverflowCount > 0 || input.clusterOverflowCount > 0;
  const overBudget = input.avgFrameTimeMs > frameBudget * 1.1;
  if ((hasOverflow || overBudget) && currentIndex > 0) {
    const nextPreset = ORDERED_PRESETS[currentIndex - 1];
    const reason = hasOverflow
      ? 'Resource overflow detected; reducing quality preset.'
      : 'Frame time above budget; reducing quality preset.';
    return {
      nextPreset,
      reason,
      appliedConfig: createRendererConfig(nextPreset),
    };
  }
  if (
    !hasOverflow &&
    input.avgFrameTimeMs < frameBudget * 0.72 &&
    currentIndex < ORDERED_PRESETS.length - 1
  ) {
    const nextPreset = ORDERED_PRESETS[currentIndex + 1];
    return {
      nextPreset,
      reason: 'Performance headroom available; raising quality preset.',
      appliedConfig: createRendererConfig(nextPreset),
    };
  }
  const stablePreset = clampPreset(input.currentPreset);
  return {
    nextPreset: stablePreset,
    reason: 'Quality preset remains stable.',
    appliedConfig: createRendererConfig(stablePreset),
  };
};
