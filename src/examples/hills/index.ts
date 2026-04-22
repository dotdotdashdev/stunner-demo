// Hills example: 100k GPU-driven instanced grass blades over a heightmapped
// terrain, with a compute-driven wind simulation feeding per-instance tilt.
//
// The simulation runs as two `webGpuStages` in the engine's `pre-scene` slot:
//
//   1. wind-update     — refreshes a small NxN wind-vector grid (a "wind
//                        texture", stored as a storage buffer for trivial
//                        bilinear sampling) using procedural flow noise.
//                        See https://medium.com/@juniormarch48/how-i-built-a-
//                        wind-map-with-webgl-d74769282484 for the mental model.
//   2. grass-update    — for every blade, samples the wind grid bilinearly at
//                        its world-space (x, z), composes an instance matrix
//                        T(base) * RotY(windYaw) * RotX(tilt) * RotY(facing)
//                        * S(scale), and writes per-instance colour tint.
//
// The renderer consumes `matrixBuffer` + `customBuffer` directly as instanced
// vertex attributes via `drawSource: { mode: 'gpuExternal', ... }` — same
// pattern used by the flocking and crowdCompute examples. Per-blade
// position/scale/facing/tint are CPU-baked once into a static storage buffer
// using `terrain.sampleHeight(x, z)` to plant each base on the surface.
//
// WebGL2 is not supported (the example requires compute); CanvasStage forces
// WebGPU when `exampleSelection === 'hills'`.

import type {
  RendererEngineOptions,
  RendererFrameHookContext,
  RendererInvalidationEvent,
} from '@stunner/core/renderer/RendererEngine';
import type { RenderScene, SceneInstancedMesh } from '@stunner/core/renderer/mesh/SceneTypes';
import { createDefaultMaterial } from '@stunner/core/renderer/mesh/MaterialTypes';
import { createSkySphere, SkyBillboard } from '@stunner/core/sky';
import {
  createTerrain,
  type TerrainResult,
} from '@stunner/core/terrain';
import { Ocean, createDefaultWaterMaterial } from '@stunner/core/water';
import { createGrassBladeGeometry } from './GrassBlade';

export const HILLS_GRASS_COUNT_MIN = 10_000;
export const HILLS_GRASS_COUNT_MAX = 2_000_000;
export const HILLS_MOON_AZIMUTH_MIN = -180;
export const HILLS_MOON_AZIMUTH_MAX = 180;
export const HILLS_MOON_ELEVATION_MIN = -90;
export const HILLS_MOON_ELEVATION_MAX = 90;
export const HILLS_MOON_DISTANCE_MIN = 5;
// Stay just inside the sky sphere so the billboard composites in front of it.
export const HILLS_MOON_DISTANCE_MAX = 49;
export const HILLS_MOON_SCALE_MIN = 0.1;
export const HILLS_MOON_SCALE_MAX = 20;
export const HILLS_OCEAN_HEIGHT_MIN = -2.5;
export const HILLS_OCEAN_HEIGHT_MAX = 2.5;
export const HILLS_OCEAN_AMPLITUDE_MIN = 0;
export const HILLS_OCEAN_AMPLITUDE_MAX = 1000;
export const HILLS_OCEAN_WIND_SPEED_MIN = 0;
export const HILLS_OCEAN_WIND_SPEED_MAX = 25;
export const HILLS_OCEAN_WIND_DIR_MIN = -180;
export const HILLS_OCEAN_WIND_DIR_MAX = 180;

export type HillsExampleOptions = {
  grassCount: number;
  moonAzimuthDegrees: number;
  moonElevationDegrees: number;
  moonDistance: number;
  moonScale: number;
  oceanHeight: number;
  oceanAmplitude: number;
  oceanWindSpeed: number;
  oceanWindDirectionDegrees: number;
};

export const DEFAULT_HILLS_OPTIONS: HillsExampleOptions = {
  grassCount: 250_000,
  moonAzimuthDegrees: -72,
  moonElevationDegrees: 21,
  moonDistance: 49,
  moonScale: 5.5,
  // Just above the lowest terrain elevation (terrain spans roughly
  // [-2.5, +2.5] with the default heightScale + bias).
  oceanHeight: 0.5,
  oceanAmplitude: 0.35,
  oceanWindSpeed: 8,
  oceanWindDirectionDegrees: 35,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const sanitizeHillsOptions = (candidate: HillsExampleOptions): HillsExampleOptions => ({
  grassCount: clamp(Math.round(candidate.grassCount), HILLS_GRASS_COUNT_MIN, HILLS_GRASS_COUNT_MAX),
  moonAzimuthDegrees: clamp(candidate.moonAzimuthDegrees, HILLS_MOON_AZIMUTH_MIN, HILLS_MOON_AZIMUTH_MAX),
  moonElevationDegrees: clamp(candidate.moonElevationDegrees, HILLS_MOON_ELEVATION_MIN, HILLS_MOON_ELEVATION_MAX),
  moonDistance: clamp(candidate.moonDistance, HILLS_MOON_DISTANCE_MIN, HILLS_MOON_DISTANCE_MAX),
  moonScale: clamp(candidate.moonScale, HILLS_MOON_SCALE_MIN, HILLS_MOON_SCALE_MAX),
  oceanHeight: clamp(candidate.oceanHeight, HILLS_OCEAN_HEIGHT_MIN, HILLS_OCEAN_HEIGHT_MAX),
  oceanAmplitude: clamp(candidate.oceanAmplitude, HILLS_OCEAN_AMPLITUDE_MIN, HILLS_OCEAN_AMPLITUDE_MAX),
  oceanWindSpeed: clamp(candidate.oceanWindSpeed, HILLS_OCEAN_WIND_SPEED_MIN, HILLS_OCEAN_WIND_SPEED_MAX),
  oceanWindDirectionDegrees: clamp(
    candidate.oceanWindDirectionDegrees,
    HILLS_OCEAN_WIND_DIR_MIN,
    HILLS_OCEAN_WIND_DIR_MAX,
  ),
});

export type HillsExampleController = {
  engineOptions: RendererEngineOptions;
  setOptions: (options: HillsExampleOptions) => void;
  dispose: () => void;
};

const HEIGHTMAP_URL = '/images/heightmap.jpg';
const DIRT_TEXTURE_URL = '/images/dirt.jpg';
const SKY_TEXTURE_URL = '/images/sky-1.png';
const SKY_TEXTURE_ID = 'demo:sky:sky-1';
const MOON_TEXTURE_URL = '/images/moon.jpg';
const MOON_TEXTURE_ID = 'demo:sky:moon';
const SKY_RADIUS = 80;

// Moon billboard initial placement is sourced from `HillsExampleOptions`
// (see `DEFAULT_HILLS_OPTIONS`); the HUD's moon sliders feed the same fields.

// Ocean tile spans the full sky-sphere footprint so the horizon meets water on
// every side. Grid resolution drives both the GPU compute dispatch (one
// invocation per cell) and the rendered triangle count; 256 hits a sweet spot
// of ~0.4m cells at this tile size with a sub-millisecond compute pass.
const OCEAN_TILE_SIZE = SKY_RADIUS * 2;
const OCEAN_GRID_RESOLUTION = 1024;

const TERRAIN_WIDTH = 40;
const TERRAIN_DEPTH = 40;
const TERRAIN_SEGMENTS = 256;
const TERRAIN_HEIGHT_SCALE = 5;
// Tile the dirt roughly once every ~4 metres so the surface reads as ground
// rather than printed.
const DIRT_TILES = TERRAIN_WIDTH / 4;

// Grass scatter / appearance. Per-instance count is now configurable via
// `HillsExampleOptions.grassCount` (the slider in the example HUD); the
// constants below describe per-blade visuals only.
const GRASS_BASE_HEIGHT = 0.45;
const GRASS_BASE_WIDTH = 0.05;
const GRASS_SCALE_MIN = 0.7;
const GRASS_SCALE_MAX = 1.4;
// Inset the scatter area slightly from the terrain edge so blades don't poke
// past the visible footprint.
const GRASS_SCATTER_INSET = 1.5;
// Workgroup size used by both compute passes. 64 is a good cross-vendor
// default for 1D dispatches.
const WORKGROUP_SIZE = 128;

// Wind grid: NxN cells of vec4(dirX, dirZ, strength, _pad). 128² ≈ 64 KB —
// plenty of spatial detail at negligible memory cost.
const WIND_RESOLUTION = 128;
// ±maxTiltRadians around the blade's base when wind strength = 1.
const WIND_MAX_TILT = 0.7;

const buildDirtMaterial = () => {
  const material = createDefaultMaterial({ name: 'hills-dirt' });
  material.baseColor = [1, 1, 1, 1];
  material.metallic = 0;
  material.roughness = 1;
  material.clearCoatFactor = 0;
  material.clearCoatRoughness = 1;
  material.transparent = false;
  material.twoSided = false;
  material.textures.baseColor = DIRT_TEXTURE_URL;
  material.castsShadows = false;
  material.uvScaleOffset = [DIRT_TILES, DIRT_TILES, 0, 0];
  return material;
};

const buildGrassMaterial = () => {
  const material = createDefaultMaterial({ name: 'hills-grass' });
  // Pure white so per-instance custom0 tint is the colour the surface reads.
  material.baseColor = [1, 1, 1, 1];
  material.metallic = 0;
  material.roughness = 1;
  material.clearCoatFactor = 0;
  material.clearCoatRoughness = 1;
  material.transparent = false;
  // Two-sided so blades viewed from behind still light correctly.
  material.twoSided = true;
  material.castsShadows = true;
  material.receivesShadows = true;
  return material;
};

const buildMoonMaterial = () => {
  // Emissive-only quad: skips lighting entirely and reads the moon texture
  // straight into the framebuffer (additive composite handled by SkyBillboard).
  const material = createDefaultMaterial({ name: 'hills-moon' });
  material.baseColor = [0, 0, 0, 1];
  material.metallic = 0;
  material.roughness = 1;
  material.clearCoatFactor = 0;
  material.clearCoatRoughness = 1;
  material.castsShadows = false;
  material.receivesShadows = false;
  material.emissive = [1, 0.9, 0.6];
  material.emissiveIntensity = 1;
  material.textureIds = { ...(material.textureIds ?? {}), emissive: MOON_TEXTURE_ID };
  return material;
};

// Deterministic hash → [0, 1). Same seed each run keeps the scatter stable.
const randAt = (seed: number, salt: number): number => {
  let h = (seed * 374761393 + salt * 668265263) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h % 1000003) / 1000003;
};

// Static per-blade record packed for the GPU:
//   [0..3]  vec4: x, y, z, scale
//   [4..7]  vec4: facingYaw, tintR, tintG, tintB
const STATIC_FLOATS_PER_BLADE = 8;

const buildBladeStaticData = (terrain: TerrainResult, grassCount: number): Float32Array => {
  const out = new Float32Array(grassCount * STATIC_FLOATS_PER_BLADE);
  const halfW = terrain.width * 0.5 - GRASS_SCATTER_INSET;
  const halfD = terrain.depth * 0.5 - GRASS_SCATTER_INSET;
  for (let i = 0; i < grassCount; i += 1) {
    const x = (randAt(i, 17) * 2 - 1) * halfW;
    const z = (randAt(i, 31) * 2 - 1) * halfD;
    const y = terrain.sampleHeight(x, z);
    const scale = GRASS_SCALE_MIN + randAt(i, 47) * (GRASS_SCALE_MAX - GRASS_SCALE_MIN);
    const facing = randAt(i, 67) * Math.PI * 2;
    // Shade-of-green palette around mid-grass.
    const r = 0.18 + randAt(i, 91) * 0.18;
    const g = 0.42 + randAt(i, 113) * 0.28;
    const b = 0.10 + randAt(i, 137) * 0.18;
    const base = i * STATIC_FLOATS_PER_BLADE;
    out[base + 0] = x;
    out[base + 1] = y;
    out[base + 2] = z;
    out[base + 3] = scale;
    out[base + 4] = facing;
    out[base + 5] = r;
    out[base + 6] = g;
    out[base + 7] = b;
  }
  return out;
};

// ── Compute shaders ────────────────────────────────────────────────────────

// Wind update: every cell's vector evolves with two slow, low-frequency
// flow-noise components plus a global gust scalar. Output layout matches the
// "wind map texture" idea — rgba per cell — so a future pass could blit it
// into a real GPUTexture without changing the math.
const WIND_COMPUTE_SHADER = /* wgsl */ `
struct WindUniforms {
  time: f32,
  resolution: f32,
  fieldHalfWidth: f32,
  fieldHalfDepth: f32,
  baseStrength: f32,
  gustSpeed: f32,
  baseDirX: f32,
  baseDirZ: f32,
};

@group(0) @binding(0) var<storage, read_write> windField: array<vec4f>;
@group(0) @binding(1) var<uniform> wind: WindUniforms;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn csMain(@builtin(global_invocation_id) gid: vec3u) {
  let res = u32(wind.resolution);
  let total = res * res;
  let i = gid.x;
  if (i >= total) { return; }
  let cellX = i % res;
  let cellZ = i / res;

  // Cell-centre world position so the field tracks the same coordinate
  // system as the terrain (centred at origin).
  let u = (f32(cellX) / f32(res - 1u)) * 2.0 - 1.0;
  let v = (f32(cellZ) / f32(res - 1u)) * 2.0 - 1.0;
  let wx = u * wind.fieldHalfWidth;
  let wz = v * wind.fieldHalfDepth;

  // Two travelling sinusoid bands give a moving "wind map". The bands sweep
  // across the field along the prevailing wind direction, so gusts visibly
  // propagate the way they would in the linked wind-map article.
  let phase = (wx * wind.baseDirX + wz * wind.baseDirZ) * 0.04 - wind.time * wind.gustSpeed;
  let swirl = sin(phase * 6.2831853) * 0.35
            + sin(phase * 12.5663706 + wz * 0.05) * 0.18;
  let cs = cos(swirl);
  let sn = sin(swirl);
  let dx = wind.baseDirX * cs - wind.baseDirZ * sn;
  let dz = wind.baseDirX * sn + wind.baseDirZ * cs;

  // Strength: base * (1 + travelling gust) * cell-local low-frequency noise.
  let gust = 0.5 + 0.5 * sin(phase * 6.2831853 + wx * 0.07);
  let local = 0.6 + 0.4 * sin(wx * 0.21 + wz * 0.17);
  let strength = wind.baseStrength * (0.5 + 0.5 * gust) * local;

  windField[i] = vec4f(dx, dz, strength, 0.0);
}
`;

// Grass update: per blade, bilinearly sample the wind grid at the blade's
// world XZ then build the instance transform straight into matrixBuffer in
// column-major form. tint goes verbatim into customBuffer.custom0; custom1
// and materialData are zeroed for layout compatibility.
const GRASS_COMPUTE_SHADER = /* wgsl */ `
struct BladeStatic {
  position: vec4f,    // xyz = base position, w = scale
  facingTint: vec4f,  // x = facing yaw, yzw = tint rgb
};

struct InstanceCustom {
  custom0: vec4f,
  custom1: vec4f,
  materialData: vec4f,
};

struct GrassUniforms {
  count: f32,
  windResolution: f32,
  fieldHalfWidth: f32,
  fieldHalfDepth: f32,
  maxTilt: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

@group(0) @binding(0) var<storage, read> bladeStatic: array<BladeStatic>;
@group(0) @binding(1) var<storage, read> windField: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> matrixBuffer: array<mat4x4f>;
@group(0) @binding(3) var<storage, read_write> customBuffer: array<InstanceCustom>;
@group(0) @binding(4) var<uniform> sim: GrassUniforms;

fn sampleWind(x: f32, z: f32) -> vec3f {
  let res = i32(sim.windResolution);
  let cellsX = f32(res - 1);
  let fx = clamp((x + sim.fieldHalfWidth) / (2.0 * sim.fieldHalfWidth), 0.0, 1.0) * cellsX;
  let fz = clamp((z + sim.fieldHalfDepth) / (2.0 * sim.fieldHalfDepth), 0.0, 1.0) * cellsX;
  let i0 = clamp(i32(floor(fx)), 0, res - 1);
  let j0 = clamp(i32(floor(fz)), 0, res - 1);
  let i1 = min(i0 + 1, res - 1);
  let j1 = min(j0 + 1, res - 1);
  let tx = fx - f32(i0);
  let tz = fz - f32(j0);
  let v00 = windField[j0 * res + i0];
  let v10 = windField[j0 * res + i1];
  let v01 = windField[j1 * res + i0];
  let v11 = windField[j1 * res + i1];
  let v0 = mix(v00, v10, tx);
  let v1 = mix(v01, v11, tx);
  return mix(v0, v1, tz).xyz;
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn csMain(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  let count = u32(sim.count);
  if (i >= count) { return; }

  let s = bladeStatic[i];
  let pos = s.position.xyz;
  let scale = s.position.w;
  let yaw = s.facingTint.x;
  let tint = s.facingTint.yzw;

  let wind = sampleWind(pos.x, pos.z);
  let tilt = atan(wind.z) * sim.maxTilt;
  let windYaw = atan2(wind.x, wind.y);

  let cs1 = cos(yaw);
  let sn1 = sin(yaw);
  let cs2 = cos(tilt);
  let sn2 = sin(tilt);
  let cs3 = cos(windYaw);
  let sn3 = sin(windYaw);

  // Column-major matrices to match the engine's convention. Rows in JS code
  // would be (col0.x, col1.x, col2.x, col3.x); here each vec4f *is* a column.
  let S = mat4x4f(
    vec4f(scale, 0.0, 0.0, 0.0),
    vec4f(0.0, scale, 0.0, 0.0),
    vec4f(0.0, 0.0, scale, 0.0),
    vec4f(0.0, 0.0, 0.0, 1.0),
  );
  // RotY (about up). Matches mat4RotationY in SceneTypes:
  //   m[0]=c, m[2]=s, m[8]=-s, m[10]=c.
  let RY1 = mat4x4f(
    vec4f(cs1, 0.0, sn1, 0.0),
    vec4f(0.0, 1.0, 0.0, 0.0),
    vec4f(-sn1, 0.0, cs1, 0.0),
    vec4f(0.0, 0.0, 0.0, 1.0),
  );
  // RotX. Matches mat4RotationX: m[5]=c, m[6]=-s, m[9]=s, m[10]=c.
  let RX = mat4x4f(
    vec4f(1.0, 0.0, 0.0, 0.0),
    vec4f(0.0, cs2, -sn2, 0.0),
    vec4f(0.0, sn2, cs2, 0.0),
    vec4f(0.0, 0.0, 0.0, 1.0),
  );
  let RY2 = mat4x4f(
    vec4f(cs3, 0.0, sn3, 0.0),
    vec4f(0.0, 1.0, 0.0, 0.0),
    vec4f(-sn3, 0.0, cs3, 0.0),
    vec4f(0.0, 0.0, 0.0, 1.0),
  );
  let T = mat4x4f(
    vec4f(1.0, 0.0, 0.0, 0.0),
    vec4f(0.0, 1.0, 0.0, 0.0),
    vec4f(0.0, 0.0, 1.0, 0.0),
    vec4f(pos.x, pos.y, pos.z, 1.0),
  );

  matrixBuffer[i] = T * RY2 * RX * RY1 * S;

  customBuffer[i].custom0 = vec4f(tint, 1.0);
  customBuffer[i].custom1 = vec4f(0.0);
  customBuffer[i].materialData = vec4f(0.0);
}
`;

// ── GPU state ──────────────────────────────────────────────────────────────

const WIND_BASE_DIR_X = 1.0;
const WIND_BASE_DIR_Z = 0.3;
const WIND_BASE_DIR_LEN = Math.hypot(WIND_BASE_DIR_X, WIND_BASE_DIR_Z);
const WIND_BASE_DIR_NX = WIND_BASE_DIR_X / WIND_BASE_DIR_LEN;
const WIND_BASE_DIR_NZ = WIND_BASE_DIR_Z / WIND_BASE_DIR_LEN;
const WIND_BASE_STRENGTH = 1.0;
const WIND_GUST_SPEED = 0.45;

type GpuHillsState = {
  device: GPUDevice;
  windPipeline: GPUComputePipeline;
  windBindGroup: GPUBindGroup;
  windUniformBuffer: GPUBuffer;
  windBuffer: GPUBuffer;
  grassPipeline: GPUComputePipeline;
  grassBindGroup: GPUBindGroup;
  grassUniformBuffer: GPUBuffer;
  bladeStaticBuffer: GPUBuffer;
  matrixBuffer: GPUBuffer;
  customBuffer: GPUBuffer;
  scene: RenderScene;
  grassCount: number;
  moon: SkyBillboard;
};

const createBuffer = (device: GPUDevice, size: number, usage: GPUBufferUsageFlags): GPUBuffer =>
  device.createBuffer({ size, usage });

const createGpuState = (
  device: GPUDevice,
  terrain: TerrainResult,
  grassCount: number,
  moonOptions: {
    azimuthDegrees: number;
    elevationDegrees: number;
    distance: number;
    scale: number;
  },
): GpuHillsState => {
  const bladeStaticData = buildBladeStaticData(terrain, grassCount);
  const bladeStaticBuffer = createBuffer(
    device,
    bladeStaticData.byteLength,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  );
  device.queue.writeBuffer(bladeStaticBuffer, 0, bladeStaticData);

  const windBuffer = createBuffer(
    device,
    WIND_RESOLUTION * WIND_RESOLUTION * 4 * 4,
    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  );

  // mat4 stride 64 (locations 4..7); custom stride 48 (locations 8..10) —
  // matches the layout the engine's instanced shader expects.
  const matrixBuffer = createBuffer(
    device,
    grassCount * 64,
    GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  );
  const customBuffer = createBuffer(
    device,
    grassCount * 48,
    GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  );

  // Uniform buffers must be at least 16 bytes, but 32-byte alignment for the
  // grass uniform keeps 8 floats + future fields well-padded.
  const windUniformBuffer = createBuffer(
    device,
    32,
    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  );
  const grassUniformBuffer = createBuffer(
    device,
    32,
    GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  );

  // ── Wind pipeline ───────────────────────────────────────────────────────
  const windModule = device.createShaderModule({ code: WIND_COMPUTE_SHADER });
  const windLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });
  const windPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [windLayout] }),
    compute: { module: windModule, entryPoint: 'csMain' },
  });
  const windBindGroup = device.createBindGroup({
    layout: windLayout,
    entries: [
      { binding: 0, resource: { buffer: windBuffer } },
      { binding: 1, resource: { buffer: windUniformBuffer } },
    ],
  });

  // ── Grass pipeline ──────────────────────────────────────────────────────
  const grassModule = device.createShaderModule({ code: GRASS_COMPUTE_SHADER });
  const grassLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  });
  const grassPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [grassLayout] }),
    compute: { module: grassModule, entryPoint: 'csMain' },
  });
  const grassBindGroup = device.createBindGroup({
    layout: grassLayout,
    entries: [
      { binding: 0, resource: { buffer: bladeStaticBuffer } },
      { binding: 1, resource: { buffer: windBuffer } },
      { binding: 2, resource: { buffer: matrixBuffer } },
      { binding: 3, resource: { buffer: customBuffer } },
      { binding: 4, resource: { buffer: grassUniformBuffer } },
    ],
  });

  const moon = new SkyBillboard({
    material: buildMoonMaterial(),
    blendMode: 'additive',
    azimuthDegrees: moonOptions.azimuthDegrees,
    elevationDegrees: moonOptions.elevationDegrees,
    distance: moonOptions.distance,
    width: moonOptions.scale,
    height: moonOptions.scale,
  });
  const scene = buildScene(terrain, matrixBuffer, customBuffer, grassCount, moon);

  return {
    device,
    windPipeline,
    windBindGroup,
    windUniformBuffer,
    windBuffer,
    grassPipeline,
    grassBindGroup,
    grassUniformBuffer,
    bladeStaticBuffer,
    matrixBuffer,
    customBuffer,
    scene,
    grassCount,
    moon,
  };
};

const destroyState = (state: GpuHillsState): void => {
  state.windUniformBuffer.destroy();
  state.windBuffer.destroy();
  state.grassUniformBuffer.destroy();
  state.bladeStaticBuffer.destroy();
  state.matrixBuffer.destroy();
  state.customBuffer.destroy();
};

const buildScene = (
  terrain: TerrainResult,
  matrixBuffer: GPUBuffer,
  customBuffer: GPUBuffer,
  grassCount: number,
  moon: SkyBillboard,
): RenderScene => {
  const sky = createSkySphere({ textureId: SKY_TEXTURE_ID, radius: SKY_RADIUS });

  const grassMesh: SceneInstancedMesh = {
    geometry: createGrassBladeGeometry({
      height: GRASS_BASE_HEIGHT,
      baseWidth: GRASS_BASE_WIDTH,
      segments: 4,
    }),
    material: buildGrassMaterial(),
    instanceTransforms: [],
    drawSource: {
      mode: 'gpuExternal',
      instanceCount: grassCount,
      instanceBuffers: [
        {
          buffer: matrixBuffer,
          layout: {
            arrayStride: 64,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 4, offset: 0, format: 'float32x4' },
              { shaderLocation: 5, offset: 16, format: 'float32x4' },
              { shaderLocation: 6, offset: 32, format: 'float32x4' },
              { shaderLocation: 7, offset: 48, format: 'float32x4' },
            ],
          },
        },
        {
          buffer: customBuffer,
          layout: {
            arrayStride: 48,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 8, offset: 0, format: 'float32x4' },
              { shaderLocation: 9, offset: 16, format: 'float32x4' },
              { shaderLocation: 10, offset: 32, format: 'float32' },
            ],
          },
        },
      ],
      // Conservative bounds enclosing the entire scatter area + tallest blade.
      worldBounds: {
        center: [0, 0, 0],
        radius: Math.hypot(terrain.width, terrain.depth) * 0.5 + GRASS_BASE_HEIGHT * GRASS_SCALE_MAX,
      },
    },
  };

  return {
    // Ocean draws itself from its own pre-post stage; it is intentionally
    // NOT part of `scene.meshes`.
    meshes: [terrain.mesh, sky, moon.mesh],
    instancedMeshes: [grassMesh],
    textureLibrary: {
      [SKY_TEXTURE_ID]: SKY_TEXTURE_URL,
      [MOON_TEXTURE_ID]: MOON_TEXTURE_URL,
    },
    environmentMap: { textureId: SKY_TEXTURE_ID, intensity: 1 },
    lights: [],
  };
};

export const startHillsExample = (
  applyScene: (scene: RenderScene) => void,
  initialOptions?: Partial<HillsExampleOptions>,
): HillsExampleController => {
  let disposed = false;
  let terrain: TerrainResult | null = null;
  let state: GpuHillsState | null = null;
  let pendingDevice: GPUDevice | null = null;
  let timeSeconds = 0;
  let options = sanitizeHillsOptions({
    ...DEFAULT_HILLS_OPTIONS,
    ...initialOptions,
  });

  // Ocean is GPU-driven: it owns its own compute (displacement) and render
  // (water shading) stages, which we splice into `webGpuStages` below. The
  // class can be constructed before the GPU device exists; resources are
  // lazily allocated on the first stage execution.
  const ocean = new Ocean({
    size: OCEAN_TILE_SIZE,
    gridResolution: OCEAN_GRID_RESOLUTION,
    height: options.oceanHeight,
    amplitude: options.oceanAmplitude,
    windSpeed: options.oceanWindSpeed,
    windDirectionDegrees: options.oceanWindDirectionDegrees,
    // Default 3 cascades (swell / chop / ripples) at tile repeats
    // [4, 20, 80] over a 160m mesh = 40m / 8m / 2m physical wavelength
    // domains. Coprime-ish ratios so the visible repeat period of the
    // sum is far longer than any single cascade.
    material: createDefaultWaterMaterial(),
  });

  // Kick off the terrain load immediately. State construction waits for both
  // the terrain and a GPU device, whichever lands second.
  void createTerrain({
    width: TERRAIN_WIDTH,
    depth: TERRAIN_DEPTH,
    widthSegments: TERRAIN_SEGMENTS,
    depthSegments: TERRAIN_SEGMENTS,
    heightmapUrl: HEIGHTMAP_URL,
    heightScale: TERRAIN_HEIGHT_SCALE,
    // Override the default `heightBias` (which is `-heightScale * 0.5` and
    // centres the terrain on y=0) so the surface starts at y=0 and rises to
    // y=+heightScale. Lets the ocean default sit at y=0 without poking
    // through the lowest valleys.
    heightBias: 1,
    material: buildDirtMaterial(),
  })
    .then((result) => {
      if (disposed) return;
      terrain = result;
      tryInitialize();
    })
    .catch((error: unknown) => {
      console.warn('hills: terrain build failed.', error);
    });

  const tryInitialize = (): void => {
    if (disposed || state || !terrain || !pendingDevice) return;
    state = createGpuState(pendingDevice, terrain, options.grassCount, {
      azimuthDegrees: options.moonAzimuthDegrees,
      elevationDegrees: options.moonElevationDegrees,
      distance: options.moonDistance,
      scale: options.moonScale,
    });
    applyScene(state.scene);
  };

  const stepSimulation = (encoder: GPUCommandEncoder, deltaSeconds: number): void => {
    if (!state || !terrain || disposed) return;
    timeSeconds += deltaSeconds;

    // Wind uniforms: time + grid metadata + base direction.
    const windUniformData = new Float32Array(8);
    windUniformData[0] = timeSeconds;
    windUniformData[1] = WIND_RESOLUTION;
    windUniformData[2] = terrain.width * 0.5;
    windUniformData[3] = terrain.depth * 0.5;
    windUniformData[4] = WIND_BASE_STRENGTH;
    windUniformData[5] = WIND_GUST_SPEED;
    windUniformData[6] = WIND_BASE_DIR_NX;
    windUniformData[7] = WIND_BASE_DIR_NZ;
    state.device.queue.writeBuffer(state.windUniformBuffer, 0, windUniformData);

    const grassUniformData = new Float32Array(8);
    grassUniformData[0] = state.grassCount;
    grassUniformData[1] = WIND_RESOLUTION;
    grassUniformData[2] = terrain.width * 0.5;
    grassUniformData[3] = terrain.depth * 0.5;
    grassUniformData[4] = WIND_MAX_TILT;
    state.device.queue.writeBuffer(state.grassUniformBuffer, 0, grassUniformData);

    // Wind pass: one workgroup per WORKGROUP_SIZE cells.
    const windCells = WIND_RESOLUTION * WIND_RESOLUTION;
    {
      const pass = encoder.beginComputePass({ label: 'hills-wind' });
      pass.setPipeline(state.windPipeline);
      pass.setBindGroup(0, state.windBindGroup);
      pass.dispatchWorkgroups(Math.ceil(windCells / WORKGROUP_SIZE));
      pass.end();
    }
    // Grass pass: one workgroup per WORKGROUP_SIZE blades.
    {
      const pass = encoder.beginComputePass({ label: 'hills-grass' });
      pass.setPipeline(state.grassPipeline);
      pass.setBindGroup(0, state.grassBindGroup);
      pass.dispatchWorkgroups(Math.ceil(state.grassCount / WORKGROUP_SIZE));
      pass.end();
    }
  };

  const engineOptions: RendererEngineOptions = {
    onRendererInvalidated: (event: RendererInvalidationEvent) => {
      // Mirror the flocking pattern: drop GPU state when the engine signals
      // a scene reinit; it'll be rebuilt on the next beforeFrame.
      if (!event.requiresSceneReinit) return;
      if (state) {
        destroyState(state);
        state = null;
      }
    },
    frameHooks: {
      beforeFrame: (hookContext: RendererFrameHookContext) => {
        if (hookContext.backend !== 'webgpu' || !hookContext.device) return;
        pendingDevice = hookContext.device;
        tryInitialize();
        // Re-orient the moon quad to face the camera. Mutates the mesh's
        // transform in place so the renderer picks it up on this frame's
        // draw without a scene reapply.
        if (state) {
          state.moon.update(hookContext.cameraLocation);
        }
      },
      onError: (_phase, error) => {
        console.warn('Hills example frame hook error.', error);
      },
    },
    webGpuStages: [
      {
        name: 'hills-wind-grass',
        injectionPoint: 'pre-scene',
        reads: [
          { name: 'frame-time-seconds', kind: 'number' },
          { name: 'frame-delta-ms', kind: 'number' },
        ],
        execute: (stageContext) => {
          stepSimulation(stageContext.encoder, stageContext.deltaTimeMs / 1000);
        },
      },
      // Ocean publishes its own compute + render stages: a `pre-scene`
      // displacement pass that fills the wave field, and a `pre-post`
      // pass that copies `scene-hdr` and draws the shaded water surface
      // on top of the assembled scene.
      ...ocean.stages,
    ],
    webGpuStageFailurePolicy: 'skip-stage',
    webGpuStageCpuBudgetMs: 100.0,
    webGpuWarnOnExternalLayoutMismatch: true,
  };

  return {
    engineOptions,
    setOptions: (nextOptions: HillsExampleOptions) => {
      const next = sanitizeHillsOptions(nextOptions);
      const grassCountChanged = next.grassCount !== options.grassCount;
      const moonChanged =
        next.moonAzimuthDegrees !== options.moonAzimuthDegrees ||
        next.moonElevationDegrees !== options.moonElevationDegrees ||
        next.moonDistance !== options.moonDistance ||
        next.moonScale !== options.moonScale;
      const oceanChanged =
        next.oceanHeight !== options.oceanHeight ||
        next.oceanAmplitude !== options.oceanAmplitude ||
        next.oceanWindSpeed !== options.oceanWindSpeed ||
        next.oceanWindDirectionDegrees !== options.oceanWindDirectionDegrees;
      options = next;
      if (oceanChanged) {
        // Ocean placement / spectrum is cheap to mutate — no GPU rebuild.
        ocean.setOptions({
          height: options.oceanHeight,
          amplitude: options.oceanAmplitude,
          windSpeed: options.oceanWindSpeed,
          windDirectionDegrees: options.oceanWindDirectionDegrees,
        });
      }
      if (!state) return;
      if (moonChanged) {
        // Moon placement is cheap: mutate the existing billboard in place
        // and let the next beforeFrame hook re-orient it toward the camera.
        state.moon.setPlacement({
          azimuthDegrees: options.moonAzimuthDegrees,
          elevationDegrees: options.moonElevationDegrees,
          distance: options.moonDistance,
          width: options.moonScale,
          height: options.moonScale,
        });
      }
      if (!grassCountChanged) return;
      // Rebuild the GPU state with the new buffer sizes (matches the
      // particle-count change path in the flocking example).
      const previous = state;
      state = createGpuState(previous.device, terrain!, options.grassCount, {
        azimuthDegrees: options.moonAzimuthDegrees,
        elevationDegrees: options.moonElevationDegrees,
        distance: options.moonDistance,
        scale: options.moonScale,
      });
      applyScene(state.scene);
      destroyState(previous);
    },
    dispose: () => {
      disposed = true;
      ocean.dispose();
      if (state) {
        destroyState(state);
        state = null;
      }
    },
  };
};
