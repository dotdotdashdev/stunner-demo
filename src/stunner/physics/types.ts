export type Vec3 = [number, number, number];

export type Aabb = {
  min: Vec3;
  max: Vec3;
};

export type PhysicsLiquidSettings = {
  enabled: boolean;
  fluidLevel: number;
  density: number;
  viscosity: number;
  linearDrag: number;
  angularDrag: number;
  flowVelocity: Vec3;
  surfaceThickness: number;
  turbulence: number;
};

export type PhysicsWorldSettings = {
  gravity: Vec3;
  airDrag: number;
  substeps: number;
  solverIterations: number;
  positionIterations: number;
  liquid: PhysicsLiquidSettings;
};

export const createDefaultPhysicsWorldSettings = (): PhysicsWorldSettings => {
  return {
    gravity: [0, -9.81, 0],
    airDrag: 0.02,
    substeps: 2,
    solverIterations: 8,
    positionIterations: 3,
    liquid: {
      enabled: false,
      fluidLevel: 0,
      density: 1000,
      viscosity: 0.45,
      linearDrag: 3.2,
      angularDrag: 1.2,
      flowVelocity: [0, 0, 0],
      surfaceThickness: 0.35,
      turbulence: 0.08,
    },
  };
};

export const vec3Add = (a: Vec3, b: Vec3): Vec3 => {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
};

export const vec3Sub = (a: Vec3, b: Vec3): Vec3 => {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
};

export const vec3Scale = (value: Vec3, scalar: number): Vec3 => {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
};

export const vec3Dot = (a: Vec3, b: Vec3): number => {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
};

export const vec3Length = (value: Vec3): number => {
  return Math.hypot(value[0], value[1], value[2]);
};

export const vec3Normalize = (value: Vec3): Vec3 => {
  const length = vec3Length(value);
  if (length <= 1e-6) {
    return [0, 1, 0];
  }
  return [value[0] / length, value[1] / length, value[2] / length];
};

export const vec3ClampMagnitude = (value: Vec3, maxMagnitude: number): Vec3 => {
  const length = vec3Length(value);
  if (length <= maxMagnitude || length <= 1e-6) {
    return value;
  }
  const scale = maxMagnitude / length;
  return vec3Scale(value, scale);
};

export const vec3Lerp = (a: Vec3, b: Vec3, t: number): Vec3 => {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
};

export const clamp01 = (value: number): number => {
  return Math.max(0, Math.min(1, value));
};

export const mergeAabb = (a: Aabb, b: Aabb): Aabb => {
  return {
    min: [
      Math.min(a.min[0], b.min[0]),
      Math.min(a.min[1], b.min[1]),
      Math.min(a.min[2], b.min[2]),
    ],
    max: [
      Math.max(a.max[0], b.max[0]),
      Math.max(a.max[1], b.max[1]),
      Math.max(a.max[2], b.max[2]),
    ],
  };
};

export const aabbOverlaps = (a: Aabb, b: Aabb): boolean => {
  return (
    a.min[0] <= b.max[0] &&
    a.max[0] >= b.min[0] &&
    a.min[1] <= b.max[1] &&
    a.max[1] >= b.min[1] &&
    a.min[2] <= b.max[2] &&
    a.max[2] >= b.min[2]
  );
};
