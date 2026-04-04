import type { RenderLight, Vec3 } from './LightTypes';
const STRIDE_FLOATS = 16;
const LIGHT_TYPE_POINT = 0;
const LIGHT_TYPE_SPOT = 1;
const LIGHT_TYPE_DIRECTIONAL = 2;
const LIGHT_TYPE_AREA = 3;
type PackedLightBuffers = {
  data: Float32Array;
  count: number;
  strideFloats: number;
};
const writeVec3 = (target: Float32Array, offset: number, value: Vec3): void => {
  target[offset] = value[0];
  target[offset + 1] = value[1];
  target[offset + 2] = value[2];
};
const normalizeOrDefault = (direction: Vec3): Vec3 => {
  const length = Math.hypot(direction[0], direction[1], direction[2]);
  if (length === 0) {
    return [0, -1, 0];
  }
  return [direction[0] / length, direction[1] / length, direction[2] / length];
};
export const packLights = (lights: RenderLight[]): PackedLightBuffers => {
  const data = new Float32Array(lights.length * STRIDE_FLOATS);
  for (let index = 0; index < lights.length; index += 1) {
    const light = lights[index];
    const base = index * STRIDE_FLOATS;
    if (light.type === 'point') {
      writeVec3(data, base + 0, light.position);
      data[base + 3] = light.range;
      writeVec3(data, base + 4, light.color);
      data[base + 7] = light.intensity;
      data[base + 8] = LIGHT_TYPE_POINT;
      data[base + 9] = light.castsShadows ? 1 : 0;
      data[base + 10] = light.shadowIndex;
      data[base + 11] = light.id;
      continue;
    }
    if (light.type === 'spot') {
      writeVec3(data, base + 0, light.position);
      data[base + 3] = light.range;
      writeVec3(data, base + 4, light.color);
      data[base + 7] = light.intensity;
      writeVec3(data, base + 8, normalizeOrDefault(light.direction));
      data[base + 11] = LIGHT_TYPE_SPOT;
      data[base + 12] = light.innerConeCos;
      data[base + 13] = light.outerConeCos;
      data[base + 14] = light.castsShadows ? 1 : 0;
      data[base + 15] = light.shadowIndex;
      continue;
    }
    if (light.type === 'directional') {
      writeVec3(data, base + 0, normalizeOrDefault(light.direction));
      data[base + 3] = 0;
      writeVec3(data, base + 4, light.color);
      data[base + 7] = light.intensity;
      data[base + 8] = LIGHT_TYPE_DIRECTIONAL;
      data[base + 9] = light.castsShadows ? 1 : 0;
      data[base + 10] = light.shadowIndex;
      data[base + 11] = light.id;
      continue;
    }
    writeVec3(data, base + 0, light.position);
    data[base + 3] = light.range;
    writeVec3(data, base + 4, light.color);
    data[base + 7] = light.intensity;
    writeVec3(data, base + 8, normalizeOrDefault(light.direction));
    data[base + 11] = LIGHT_TYPE_AREA;
    data[base + 12] = light.size[0];
    data[base + 13] = light.size[1];
    data[base + 14] = light.shape === 'disc' ? 1 : 0;
    data[base + 15] = light.castsShadows ? 1 : 0;
  }
  return {
    data,
    count: lights.length,
    strideFloats: STRIDE_FLOATS,
  };
};
