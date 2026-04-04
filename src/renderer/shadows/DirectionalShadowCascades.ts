export type CascadeSplitMode = 'uniform' | 'logarithmic' | 'practical';
export type DirectionalCascadeConfig = {
  cascadeCount: 1 | 2 | 3 | 4;
  nearPlane: number;
  farPlane: number;
  splitMode: CascadeSplitMode;
  practicalLambda?: number;
};
export type DirectionalCascade = {
  index: number;
  near: number;
  far: number;
  centerDepth: number;
  radius: number;
};
const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};
const computeSplitDepth = (
  mode: CascadeSplitMode,
  nearPlane: number,
  farPlane: number,
  partition: number,
  practicalLambda: number,
): number => {
  if (mode === 'uniform') {
    return nearPlane + (farPlane - nearPlane) * partition;
  }
  if (mode === 'logarithmic') {
    return nearPlane * (farPlane / nearPlane) ** partition;
  }
  const uniform = nearPlane + (farPlane - nearPlane) * partition;
  const logarithmic = nearPlane * (farPlane / nearPlane) ** partition;
  return logarithmic * practicalLambda + uniform * (1 - practicalLambda);
};
export const buildDirectionalCascades = (
  config: DirectionalCascadeConfig,
): DirectionalCascade[] => {
  const nearPlane = Math.max(0.0001, config.nearPlane);
  const farPlane = Math.max(nearPlane + 0.0001, config.farPlane);
  const lambda = clamp(config.practicalLambda ?? 0.7, 0, 1);
  const splitDepths: number[] = [nearPlane];
  for (let cascade = 1; cascade < config.cascadeCount; cascade += 1) {
    const partition = cascade / config.cascadeCount;
    splitDepths.push(computeSplitDepth(config.splitMode, nearPlane, farPlane, partition, lambda));
  }
  splitDepths.push(farPlane);
  const cascades: DirectionalCascade[] = [];
  for (let index = 0; index < config.cascadeCount; index += 1) {
    const cascadeNear = splitDepths[index];
    const cascadeFar = splitDepths[index + 1];
    const depthSpan = cascadeFar - cascadeNear;
    cascades.push({
      index,
      near: cascadeNear,
      far: cascadeFar,
      centerDepth: cascadeNear + depthSpan * 0.5,
      radius: depthSpan * 0.5,
    });
  }
  return cascades;
};
