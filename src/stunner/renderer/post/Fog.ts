import type { FogConfig } from '../config/RendererConfig';
import type { Vec3 } from '../lights/LightTypes';

export type FogResult = {
  amount: number;
  color: Vec3;
  blendedColor: Vec3;
};

const clamp01 = (value: number): number => {
  return Math.min(1, Math.max(0, value));
};

export const evaluateFog = (config: FogConfig, color: Vec3, distance: number, height: number): FogResult => {
  if (!config.enabled) {
    return {
      amount: 0,
      color: [...config.color] as Vec3,
      blendedColor: color,
    };
  }

  const depthRange = Math.max(0.001, config.endDistance - config.startDistance);
  const distanceFactor = clamp01((distance - config.startDistance) / depthRange);
  const densityFactor = 1 - Math.exp(-Math.max(0, distance) * Math.max(0, config.density));
  const heightFactor = config.heightFalloff > 0 ? Math.exp(-Math.max(0, height) * config.heightFalloff) : 1;

  const fogAmount = clamp01(distanceFactor * densityFactor * heightFactor);
  const fogColor: Vec3 = [config.color[0], config.color[1], config.color[2]];

  return {
    amount: fogAmount,
    color: fogColor,
    blendedColor: [
      color[0] * (1 - fogAmount) + fogColor[0] * fogAmount,
      color[1] * (1 - fogAmount) + fogColor[1] * fogAmount,
      color[2] * (1 - fogAmount) + fogColor[2] * fogAmount,
    ],
  };
};
