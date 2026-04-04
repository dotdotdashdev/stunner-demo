export type Vec3 = [number, number, number];
export type BaseLight = {
  id: number;
  color: Vec3;
  intensity: number;
  castsShadows: boolean;
  shadowIndex: number;
};
export type PointLight = BaseLight & {
  type: 'point';
  position: Vec3;
  range: number;
};
export type SpotLight = BaseLight & {
  type: 'spot';
  position: Vec3;
  direction: Vec3;
  range: number;
  innerConeCos: number;
  outerConeCos: number;
};
export type DirectionalLight = BaseLight & {
  type: 'directional';
  direction: Vec3;
};
export type AreaLightShape = 'rect' | 'disc';
export type AreaLight = BaseLight & {
  type: 'area';
  position: Vec3;
  direction: Vec3;
  right: Vec3;
  up: Vec3;
  size: [number, number];
  shape: AreaLightShape;
  range: number;
};
export type RenderLight = PointLight | SpotLight | DirectionalLight | AreaLight;
