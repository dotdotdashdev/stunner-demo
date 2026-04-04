import type { ColorGradingConfig, Tonemapper } from '../config/RendererConfig';
export type RgbColor = [number, number, number];
const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};
const applyContrast = (value: number, contrast: number): number => {
  return (value - 0.5) * contrast + 0.5;
};
const reinhard = (value: number): number => {
  return value / (1 + value);
};
const filmic = (value: number): number => {
  const x = Math.max(0, value - 0.004);
  return (x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06);
};
const acesApprox = (value: number): number => {
  const a = 2.51;
  const b = 0.03;
  const c = 2.43;
  const d = 0.59;
  const e = 0.14;
  return clamp((value * (a * value + b)) / (value * (c * value + d) + e), 0, 1);
};
const tonemap = (value: number, operator: Tonemapper): number => {
  if (operator === 'reinhard') {
    return reinhard(value);
  }
  if (operator === 'filmic') {
    return filmic(value);
  }
  return acesApprox(value);
};
export const applyColorGrading = (color: RgbColor, config: ColorGradingConfig): RgbColor => {
  if (!config.enabled) {
    return color;
  }
  const exposureScale = 2 ** config.exposure;
  let r = color[0] * exposureScale;
  let g = color[1] * exposureScale;
  let b = color[2] * exposureScale;
  const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
  r = luma + (r - luma) * config.saturation;
  g = luma + (g - luma) * config.saturation;
  b = luma + (b - luma) * config.saturation;
  r = applyContrast(r, config.contrast);
  g = applyContrast(g, config.contrast);
  b = applyContrast(b, config.contrast);
  r += config.temperature * 0.02 + config.tint * 0.01;
  g -= config.tint * 0.01;
  b -= config.temperature * 0.02;
  return [
    clamp(tonemap(Math.max(0, r), config.tonemapper), 0, 1),
    clamp(tonemap(Math.max(0, g), config.tonemapper), 0, 1),
    clamp(tonemap(Math.max(0, b), config.tonemapper), 0, 1),
  ];
};
