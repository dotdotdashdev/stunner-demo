import type { MotionBlurConfig } from '../config/RendererConfig';
import type { Vec3 } from '../lights/LightTypes';

export type MotionBlurInput = {
  color: Vec3;
  depth: number;
  highlight: number;
  cameraDelta: Vec3;
};

export type MotionBlurResult = {
  blurAmount: number;
  direction: [number, number];
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

export const evaluateMotionBlur = (
  config: MotionBlurConfig,
  input: MotionBlurInput,
): MotionBlurResult => {
  if (!config.enabled) {
    return {
      blurAmount: 0,
      direction: [0, 0],
    };
  }

  const cameraSpeed = Math.hypot(input.cameraDelta[0], input.cameraDelta[1], input.cameraDelta[2]);
  const shutterScale = clamp(config.shutterAngle / 360, 0, 2);
  const depthScale = clamp(0.35 + input.depth * 0.08, 0.2, 1.2);
  const highlightBoost = clamp(1 + input.highlight * 0.35, 1, 1.35);

  const blurAmount = clamp(
    cameraSpeed * config.intensity * shutterScale * depthScale * highlightBoost,
    0,
    1,
  );

  const planarLength = Math.hypot(input.cameraDelta[0], input.cameraDelta[2]);
  if (planarLength < 0.00001) {
    return {
      blurAmount,
      direction: [0, 0],
    };
  }

  return {
    blurAmount,
    direction: [input.cameraDelta[0] / planarLength, input.cameraDelta[2] / planarLength],
  };
};
