import type { DepthOfFieldConfig } from '../config/RendererConfig';
export type DepthOfFieldInput = {
  depth: number;
  highlight: number;
};
export type DepthOfFieldResult = {
  coc: number;
  blurRadius: number;
};
const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};
const abs = (value: number): number => {
  return value < 0 ? -value : value;
};
export const computeCircleOfConfusion = (config: DepthOfFieldConfig, depth: number): number => {
  const distanceFromFocus = abs(depth - config.focusDistance);
  const normalized = distanceFromFocus / Math.max(0.0001, config.focusRange);
  const coc = normalized * config.aperture;
  return clamp(coc, 0, config.maxCoC);
};
export const evaluateDepthOfField = (
  config: DepthOfFieldConfig,
  input: DepthOfFieldInput,
): DepthOfFieldResult => {
  if (!config.enabled) {
    return {
      coc: 0,
      blurRadius: 0,
    };
  }
  const coc = computeCircleOfConfusion(config, input.depth);
  const blurRadius = coc;
  return {
    coc,
    blurRadius,
  };
};
