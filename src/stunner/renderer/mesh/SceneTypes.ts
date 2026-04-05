import type { PbrMaterial } from './MaterialTypes';
import type { MeshGeometry } from './MeshTypes';
import type { RenderLight } from '../lights/LightTypes';

export type Mat4 = Float32Array;

export type SceneMeshInstance = {
  geometry: MeshGeometry;
  material: PbrMaterial;
  /**
   * Column-major 4×4 world transform matrix.
   * When absent, identity is assumed.
   */
  transform?: Mat4;
};

export type SceneInstancedMesh = {
  geometry: MeshGeometry;
  material: PbrMaterial;
  /**
   * Column-major 4x4 world transforms, one per instance.
   */
  instanceTransforms: Mat4[];
  /**
   * Optional per-instance custom attributes.
   *
   * Each array must either be omitted or match `instanceTransforms.length`.
   * The renderer maps these to dedicated instanced vertex attributes so shader
   * code can consume generic extra instance data.
   */
  instanceCustomData?: {
    custom0?: [number, number, number, number][];
    custom1?: [number, number, number, number][];
  };
};

export type RenderScene = {
  meshes: SceneMeshInstance[];
  instancedMeshes?: SceneInstancedMesh[];
  lights: RenderLight[];
};

// ── Matrix helpers ─────────────────────────────────────────────────────────────

export const mat4Identity = (): Mat4 => {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  return m;
};

export const mat4Translation = (x: number, y: number, z: number): Mat4 => {
  const m = mat4Identity();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
};

export const mat4Scale = (sx: number, sy: number, sz: number): Mat4 => {
  const m = mat4Identity();
  m[0] = sx; m[5] = sy; m[10] = sz;
  return m;
};

export const mat4RotationY = (radians: number): Mat4 => {
  const m = mat4Identity();
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  m[0] = c; m[2] = s;
  m[8] = -s; m[10] = c;
  return m;
};

export const mat4RotationX = (radians: number): Mat4 => {
  const m = mat4Identity();
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  m[5] = c; m[6] = -s;
  m[9] = s; m[10] = c;
  return m;
};

export const mat4RotationZ = (radians: number): Mat4 => {
  const m = mat4Identity();
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  m[0] = c; m[1] = -s;
  m[4] = s; m[5] = c;
  return m;
};

export const mat4Multiply = (a: Mat4, b: Mat4): Mat4 => {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  return out;
};
