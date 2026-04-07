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
  /**
   * Fallback material used when no indexed material table is provided.
   */
  material: PbrMaterial;
  /**
   * Optional material table for indexed per-instance material selection.
   */
  instanceMaterials?: PbrMaterial[];
  /**
   * Column-major 4x4 world transforms, one per instance.
   */
  instanceTransforms: Mat4[];
  /**
   * Optional per-instance material index into `instanceMaterials`.
   *
   * When omitted, index 0 is assumed for all instances.
   */
  instanceMaterialIndices?: number[];
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
  /**
   * Optional external GPU-driven instancing source.
   *
   * When omitted, the renderer uses the default CPU-packed instance upload path.
   * When provided with mode `gpuExternal`, the renderer binds user-provided
   * vertex buffers for per-instance attributes and uses `instanceCount`.
   */
  drawSource?: SceneInstancedDrawSource;
};

export type SceneExternalInstanceBufferBinding = {
  buffer: GPUBuffer;
  layout: GPUVertexBufferLayout;
  /**
   * Optional byte offset to use when binding this buffer.
   */
  offset?: number;
};

export type SceneInstancedRigResources = {
  /**
   * Storage buffer with contiguous mat4 palette data.
   *
   * Layout: one matrix per rig joint, packed as 16 float32 values.
   */
  paletteBuffer: GPUBuffer;
  /**
   * Maximum number of matrices available in `paletteBuffer`.
   * Used for bounds validation and safe clamping in shader paths.
   */
  maxPaletteMatrices: number;
};

export type SceneInstancedDrawSource =
  | {
      mode: 'cpuPacked';
    }
  | {
      mode: 'gpuExternal';
      instanceCount: number;
      instanceBuffers: SceneExternalInstanceBufferBinding[];
      /**
       * Optional profile for instance streams.
       *
       * - `standard`: default instanced material path.
       * - `rigged`: enables optional per-instance rig metadata and GPU palette skinning.
       */
      profile?: 'standard' | 'rigged';
      /**
       * Required when `profile` is `rigged`.
       */
      rig?: SceneInstancedRigResources;
      /**
       * Optional world bounds used by frustum culling.
       *
       * When omitted, culling for this instanced mesh is disabled.
       */
      worldBounds?: {
        center: [number, number, number];
        radius: number;
      };
    };

export type RenderScene = {
  meshes: SceneMeshInstance[];
  instancedMeshes?: SceneInstancedMesh[];
  /**
   * Optional shared texture table used by material texture IDs.
   */
  textureLibrary?: Record<string, string>;
  textureArrayLibrary?: Record<string, string[]>;
  /**
   * Enables the renderer's directional/fill light terms for this scene.
   * Defaults to true when omitted.
   */
  directionalLightingEnabled?: boolean;
  /**
   * Per-scene directional light intensity multiplier.
   * Defaults to 1 when omitted.
   */
  directionalLightingIntensity?: number;
  /**
   * Per-scene directional light vector (from surface toward light source).
   * Defaults to the renderer config key light direction when omitted.
   */
  keyLightDirection?: [number, number, number];
  /**
   * Per-scene key light source size multiplier used for sky sun-disk rendering.
   * 1.0 preserves the renderer default appearance.
   */
  keyLightSourceSize?: number;
  /**
   * Optional per-scene override for directional shadow-map depth bias.
   */
  shadowMapBiasOverride?: number;
  /**
   * Optional per-scene override for directional shadow-map filtering softness.
   */
  shadowMapSoftnessOverride?: number;
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
