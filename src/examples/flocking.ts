import type {
  RendererEngineOptions,
  RendererFrameHookContext,
} from '@stunner/core/renderer/RendererEngine';
import {
  mat4Translation,
  type SceneInstancedMesh,
  type RenderScene,
} from '@stunner/core/renderer/mesh/SceneTypes';
import { createCircle, createCylinder } from '@stunner/core/renderer/mesh/MeshFactory';
import { createDefaultMaterial } from '@stunner/core/renderer/mesh/MaterialTypes';

export const FLOCKING_PARTICLE_COUNT_MIN = 10;
export const FLOCKING_PARTICLE_COUNT_MAX = 100_000;
const DEFAULT_PARTICLE_COUNT = 10_000;
const WORKGROUP_SIZE = 128;
const SIM_BOUNDS = 9.5;
const MIN_SPEED = 1.0;
const MAX_SPEED = 6.5;
const INITIAL_PARTICLE_SCALE = 0.14;
const PARTICLE_SIZE_MULTIPLIER = 2.0;
const CONE_RADIUS_SCALE = 0.34;
const CONE_GEOMETRY_BOTTOM_RADIUS = 0.34;
const CONE_GEOMETRY_HEIGHT = 1.2;
const MURMURATION_PULSE_SPEED = 0.34;
const MURMURATION_SPATIAL_SCALE = 0.62;
const MURMURATION_INDEX_PHASE_SCALE = 0.0018;
const MURMURATION_COHESION_MIN = 0.8;
const MURMURATION_COHESION_MAX = 1.34;
const MURMURATION_ALIGNMENT_MIN = 0.84;
const MURMURATION_ALIGNMENT_MAX = 1.3;
const MURMURATION_SEPARATION_MIN = 0.82;
const MURMURATION_SEPARATION_MAX = 1.2;

export type FlockingExampleOptions = {
  cohesionWeight: number;
  alignmentWeight: number;
  separationWeight: number;
  centerWeight: number;
  flowWeight: number;
  neighborSamples: number;
  minSpeed: number;
  maxSpeed: number;
  bounds: number;
  particleCount: number;
  shadowMapBiasOverride: number;
  shadowMapSoftnessOverride: number;
  particleScaleMin: number;
  particleScaleMax: number;
};

const DEFAULT_FLOCKING_OPTIONS: FlockingExampleOptions = {
  cohesionWeight: 0.62,
  alignmentWeight: 0.95,
  separationWeight: 0.42,
  centerWeight: 0.88,
  flowWeight: 0.06,
  neighborSamples: 9,
  minSpeed: 1.6,
  maxSpeed: 4.2,
  bounds: SIM_BOUNDS,
  particleCount: DEFAULT_PARTICLE_COUNT,
  shadowMapBiasOverride: 0.0026,
  shadowMapSoftnessOverride: 0.45,
  particleScaleMin: 0.11,
  particleScaleMax: 0.21,
};

type FlockingExampleController = {
  engineOptions: RendererEngineOptions;
  setOptions: (options: FlockingExampleOptions) => void;
  dispose: () => void;
};

type GpuFlockingState = {
  device: GPUDevice;
  computePipeline: GPUComputePipeline;
  bindGroups: [GPUBindGroup, GPUBindGroup];
  uniformBuffer: GPUBuffer;
  stateBuffers: [GPUBuffer, GPUBuffer];
  colorBuffer: GPUBuffer;
  matrixBuffer: GPUBuffer;
  customBuffer: GPUBuffer;
  pingIndex: 0 | 1;
  scene: RenderScene;
  options: FlockingExampleOptions;
};

const BLACK_SKY_SHADER = /* wgsl */ `
struct FrameUniforms {
  time: f32, width: f32, height: f32, _pad0: f32,
  cameraPosition: vec3f, _pad1: f32,
  cameraForward: vec3f, _pad2: f32,
  cameraRight: vec3f, _pad3: f32,
  cameraUp: vec3f, _pad4: f32,
  cameraFovY: f32, cameraNear: f32, cameraFar: f32, shadowsEnabled: f32,
  fogEnabled: f32, fogDensity: f32, fogStartDistance: f32, fogEndDistance: f32,
  fogColor: vec3f, fogHeightFalloff: f32,
  keyLightDir: vec3f, _pad5: f32,
  shadowReceiverHeight: f32, shadowReceiverBand: f32, _pad6: f32, _pad7: f32,
}
@group(0) @binding(0) var<uniform> frame: FrameUniforms;

struct SkyOut {
  @location(0) hdr: vec4f,
  @location(1) normal: vec4f,
  @location(2) material: vec4f,
  @location(3) emissive: vec4f,
}

struct VsOut {
  @builtin(position) position: vec4f,
}

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> VsOut {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -3.0),
    vec2f(3.0, 1.0),
    vec2f(-1.0, 1.0),
  );
  var out: VsOut;
  out.position = vec4f(positions[vertexIndex], 0.9999, 1.0);
  return out;
}

@fragment
fn fsMain(_input: VsOut) -> SkyOut {
  let keepUniformAlive = frame.time * 0.0;
  var out: SkyOut;
  out.hdr = vec4f(0.33 + keepUniformAlive, 0.56, 0.88, 1.0);
  out.normal = vec4f(0.5, 0.5, 1.0, 1.0);
  out.material = vec4f(0.0, 1.0, 0.0, 1.0);
  out.emissive = vec4f(0.0, 0.0, 0.0, 1.0);
  return out;
}
`;

const FLOCKING_COMPUTE_SHADER = /* wgsl */ `
struct ParticleState {
  position: vec4f,
  velocity: vec4f,
}

struct InstanceCustom {
  custom0: vec4f,
  custom1: vec4f,
  materialData: vec4f,
}

struct SimulationUniforms {
  dt: f32,
  time: f32,
  bounds: f32,
  count: f32,
  maxSpeed: f32,
  minSpeed: f32,
  cohesionWeight: f32,
  alignmentWeight: f32,
  separationWeight: f32,
  centerWeight: f32,
  flowWeight: f32,
  neighborSamples: f32,
  particleScaleMin: f32,
  particleScaleMax: f32,
  _pad0: f32,
  _pad1: f32,
}

@group(0) @binding(0) var<storage, read> stateIn: array<ParticleState>;
@group(0) @binding(1) var<storage, read_write> stateOut: array<ParticleState>;
@group(0) @binding(2) var<storage, read> colorBuffer: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> matrixBuffer: array<mat4x4f>;
@group(0) @binding(4) var<storage, read_write> customBuffer: array<InstanceCustom>;
@group(0) @binding(5) var<uniform> sim: SimulationUniforms;

fn hashU32(inputValue: u32) -> u32 {
  var value = inputValue;
  value = value * 1664525u + 1013904223u;
  value = value ^ (value >> 16u);
  value = value * 2246822519u;
  value = value ^ (value >> 13u);
  return value;
}

fn randomNeighbor(index: u32, salt: u32, count: u32) -> u32 {
  return hashU32(index + salt + u32(sim.time * 1000.0)) % max(1u, count);
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn csMain(@builtin(global_invocation_id) globalId: vec3u) {
  let index = globalId.x;
  let count = u32(max(1.0, sim.count));
  if (index >= count) {
    return;
  }

  let current = stateIn[index];
  var position = current.position.xyz;
  var velocity = current.velocity.xyz;

  var cohesionCenter = vec3f(0.0, 0.0, 0.0);
  var alignmentDirection = vec3f(0.0, 0.0, 0.0);
  var separation = vec3f(0.0, 0.0, 0.0);
  var sampleCount = 0.0;

  let sampleLimit = max(1u, u32(sim.neighborSamples));
  for (var sampleIndex = 0u; sampleIndex < sampleLimit; sampleIndex = sampleIndex + 1u) {
    let neighborIndex = randomNeighbor(index, sampleIndex * 747796405u + 2891336453u, count);
    if (neighborIndex == index) {
      continue;
    }
    let neighbor = stateIn[neighborIndex];
    let toNeighbor = neighbor.position.xyz - position;
    let distance = length(toNeighbor);
    if (distance <= 0.0001) {
      continue;
    }
    let direction = toNeighbor / distance;
    cohesionCenter = cohesionCenter + neighbor.position.xyz;
    alignmentDirection = alignmentDirection + normalize(neighbor.velocity.xyz + vec3f(0.0001, 0.0, 0.0));
    separation = separation - direction / max(0.08, distance * distance);
    sampleCount = sampleCount + 1.0;
  }

  if (sampleCount > 0.0) {
    cohesionCenter = cohesionCenter / sampleCount;
    alignmentDirection = normalize(alignmentDirection / sampleCount);
  } else {
    cohesionCenter = position;
    alignmentDirection = normalize(velocity + vec3f(0.001, 0.0, 0.0));
  }

  // Subtle pulse field to emulate murmuration-like split/merge waves.
  let spatialWave = sin(
    sim.time * ${MURMURATION_PULSE_SPEED.toFixed(2)} +
    dot(position, vec3f(0.21, 0.14, 0.18)) * ${MURMURATION_SPATIAL_SCALE.toFixed(2)} +
    f32(index) * ${MURMURATION_INDEX_PHASE_SCALE.toFixed(4)}
  );
  let pulse = 0.5 + 0.5 * spatialWave;
  let cohesionPulse = mix(${MURMURATION_COHESION_MIN.toFixed(2)}, ${MURMURATION_COHESION_MAX.toFixed(2)}, pulse);
  let alignmentPulse = mix(${MURMURATION_ALIGNMENT_MIN.toFixed(2)}, ${MURMURATION_ALIGNMENT_MAX.toFixed(2)}, pulse);
  let separationPulse = mix(${MURMURATION_SEPARATION_MAX.toFixed(2)}, ${MURMURATION_SEPARATION_MIN.toFixed(2)}, pulse);

  let cohesionForce = (cohesionCenter - position) * sim.cohesionWeight * cohesionPulse;
  let alignmentForce =
    (alignmentDirection - normalize(velocity + vec3f(0.001, 0.0, 0.0))) *
    sim.alignmentWeight *
    alignmentPulse;
  let separationForce = separation * sim.separationWeight * separationPulse;
  let centerDistance = length(position);
  let centerT = clamp(centerDistance / max(0.001, sim.bounds), 0.0, 1.0);
  let centerEnvelope = mix(0.35, 2.2, centerT * centerT);
  let centerForce = (-position / max(0.001, sim.bounds)) * sim.centerWeight * centerEnvelope;
  let flow = vec3f(
    sin(sim.time * 0.9 + f32(index) * 0.013),
    sin(sim.time * 0.7 + f32(index) * 0.021),
    cos(sim.time * 0.8 + f32(index) * 0.017),
  ) * sim.flowWeight;

  let acceleration = cohesionForce + alignmentForce + separationForce + centerForce + flow;
  velocity = velocity + acceleration * sim.dt;

  let speed = length(velocity);
  let clampedSpeed = clamp(speed, sim.minSpeed, sim.maxSpeed);
  if (speed > 0.0001) {
    velocity = normalize(velocity) * clampedSpeed;
  } else {
    velocity = vec3f(clampedSpeed, 0.0, 0.0);
  }

  position = position + velocity * sim.dt;

  if (position.x < -sim.bounds || position.x > sim.bounds) {
    velocity.x = -velocity.x;
    position.x = clamp(position.x, -sim.bounds, sim.bounds);
  }
  if (position.y < -sim.bounds || position.y > sim.bounds) {
    velocity.y = -velocity.y;
    position.y = clamp(position.y, -sim.bounds, sim.bounds);
  }
  if (position.z < -sim.bounds || position.z > sim.bounds) {
    velocity.z = -velocity.z;
    position.z = clamp(position.z, -sim.bounds, sim.bounds);
  }

  stateOut[index].position = vec4f(position, 1.0);
  stateOut[index].velocity = vec4f(velocity, 0.0);

  let speedLerp = clamp((clampedSpeed - sim.minSpeed) / max(0.001, sim.maxSpeed - sim.minSpeed), 0.0, 1.0);
  let pastelColor = colorBuffer[index].rgb;
  let direction = normalize(velocity + vec3f(0.0001, 0.0, 0.0));
  let helperAxis = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(direction.y) > 0.98);
  let right = normalize(cross(helperAxis, direction));
  let forward = normalize(cross(direction, right));

  let particleScale =
    (sim.particleScaleMin + speedLerp * (sim.particleScaleMax - sim.particleScaleMin)) *
    ${PARTICLE_SIZE_MULTIPLIER.toFixed(1)};
  let coneRadius = particleScale * ${CONE_RADIUS_SCALE.toFixed(2)};
  let coneLength = coneRadius * ${(4 * CONE_GEOMETRY_BOTTOM_RADIUS / CONE_GEOMETRY_HEIGHT).toFixed(8)};
  matrixBuffer[index] = mat4x4f(
    vec4f(right * coneRadius, 0.0),
    vec4f(direction * coneLength, 0.0),
    vec4f(forward * coneRadius, 0.0),
    vec4f(position, 1.0),
  );

  customBuffer[index].custom0 = vec4f(pastelColor, 1.0);
  customBuffer[index].custom1 = vec4f(0.0, 0.0, 0.0, 1.0);
  customBuffer[index].materialData = vec4f(0.0, 0.0, 0.0, 0.0);
}
`;

const randomRange = (min: number, max: number): number => {
  return min + (max - min) * Math.random();
};

const hslToRgb = (hue: number, saturation: number, lightness: number): [number, number, number] => {
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const scaledHue = hue * 6;
  const x = c * (1 - Math.abs((scaledHue % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (scaledHue >= 0 && scaledHue < 1) {
    r = c;
    g = x;
  } else if (scaledHue < 2) {
    r = x;
    g = c;
  } else if (scaledHue < 3) {
    g = c;
    b = x;
  } else if (scaledHue < 4) {
    g = x;
    b = c;
  } else if (scaledHue < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const m = lightness - c * 0.5;
  return [r + m, g + m, b + m];
};

const createFlockingInitialState = (particleCapacity: number, bounds: number): {
  stateData: Float32Array;
  colorData: Float32Array;
} => {
  const stateData = new Float32Array(particleCapacity * 8);
  const colorData = new Float32Array(particleCapacity * 4);

  for (let index = 0; index < particleCapacity; index += 1) {
    const base = index * 8;
    stateData[base + 0] = randomRange(-bounds * 0.72, bounds * 0.72);
    stateData[base + 1] = randomRange(-bounds * 0.65, bounds * 0.65);
    stateData[base + 2] = randomRange(-bounds * 0.72, bounds * 0.72);
    stateData[base + 3] = 1.0;

    const theta = randomRange(0, Math.PI * 2);
    const phi = Math.acos(randomRange(-1, 1));
    const speed = randomRange(MIN_SPEED, MAX_SPEED);
    stateData[base + 4] = Math.sin(phi) * Math.cos(theta) * speed;
    stateData[base + 5] = Math.sin(phi) * Math.sin(theta) * speed;
    stateData[base + 6] = Math.cos(phi) * speed;
    stateData[base + 7] = 0.0;

    const pastelHue = Math.random();
    const pastelSaturation = randomRange(0.42, 0.64);
    const pastelLightness = randomRange(0.72, 0.84);
    const [red, green, blue] = hslToRgb(pastelHue, pastelSaturation, pastelLightness);
    const colorBase = index * 4;
    colorData[colorBase + 0] = red;
    colorData[colorBase + 1] = green;
    colorData[colorBase + 2] = blue;
    colorData[colorBase + 3] = 1.0;
  }

  return {
    stateData,
    colorData,
  };
};

const buildInitialInstanceBuffers = (
  stateData: Float32Array,
  colorData: Float32Array,
  particleCapacity: number,
): {
  matrixData: Float32Array;
  customData: Float32Array;
} => {
  const matrixData = new Float32Array(particleCapacity * 16);
  const customData = new Float32Array(particleCapacity * 12);
  for (let index = 0; index < particleCapacity; index += 1) {
    const stateBase = index * 8;
    const matrixBase = index * 16;
    const customBase = index * 12;
    const colorBase = index * 4;

    const x = stateData[stateBase + 0];
    const y = stateData[stateBase + 1];
    const z = stateData[stateBase + 2];

    const vx = stateData[stateBase + 4];
    const vy = stateData[stateBase + 5];
    const vz = stateData[stateBase + 6];
    const velocityLength = Math.hypot(vx, vy, vz);
    const dirX = velocityLength > 0.0001 ? vx / velocityLength : 1;
    const dirY = velocityLength > 0.0001 ? vy / velocityLength : 0;
    const dirZ = velocityLength > 0.0001 ? vz / velocityLength : 0;
    const axisX = Math.abs(dirY) > 0.98 ? 1 : 0;
    const axisY = Math.abs(dirY) > 0.98 ? 0 : 1;
    const axisZ = 0;
    const rightXUnnormalized = axisY * dirZ - axisZ * dirY;
    const rightYUnnormalized = axisZ * dirX - axisX * dirZ;
    const rightZUnnormalized = axisX * dirY - axisY * dirX;
    const rightLength = Math.hypot(rightXUnnormalized, rightYUnnormalized, rightZUnnormalized) || 1;
    const rightX = rightXUnnormalized / rightLength;
    const rightY = rightYUnnormalized / rightLength;
    const rightZ = rightZUnnormalized / rightLength;
    const forwardXUnnormalized = dirY * rightZ - dirZ * rightY;
    const forwardYUnnormalized = dirZ * rightX - dirX * rightZ;
    const forwardZUnnormalized = dirX * rightY - dirY * rightX;
    const forwardLength =
      Math.hypot(forwardXUnnormalized, forwardYUnnormalized, forwardZUnnormalized) || 1;
    const forwardX = forwardXUnnormalized / forwardLength;
    const forwardY = forwardYUnnormalized / forwardLength;
    const forwardZ = forwardZUnnormalized / forwardLength;

    const particleScale = INITIAL_PARTICLE_SCALE * PARTICLE_SIZE_MULTIPLIER;
    const coneRadius = particleScale * CONE_RADIUS_SCALE;
    const coneLength = coneRadius * ((4 * CONE_GEOMETRY_BOTTOM_RADIUS) / CONE_GEOMETRY_HEIGHT);
    matrixData[matrixBase + 0] = rightX * coneRadius;
    matrixData[matrixBase + 1] = rightY * coneRadius;
    matrixData[matrixBase + 2] = rightZ * coneRadius;
    matrixData[matrixBase + 4] = dirX * coneLength;
    matrixData[matrixBase + 5] = dirY * coneLength;
    matrixData[matrixBase + 6] = dirZ * coneLength;
    matrixData[matrixBase + 8] = forwardX * coneRadius;
    matrixData[matrixBase + 9] = forwardY * coneRadius;
    matrixData[matrixBase + 10] = forwardZ * coneRadius;
    matrixData[matrixBase + 12] = x;
    matrixData[matrixBase + 13] = y;
    matrixData[matrixBase + 14] = z;
    matrixData[matrixBase + 15] = 1;

    const red = colorData[colorBase + 0];
    const green = colorData[colorBase + 1];
    const blue = colorData[colorBase + 2];
    customData[customBase + 0] = red;
    customData[customBase + 1] = green;
    customData[customBase + 2] = blue;
    customData[customBase + 3] = 1;
    customData[customBase + 4] = 0;
    customData[customBase + 5] = 0;
    customData[customBase + 6] = 0;
    customData[customBase + 7] = 1;
    customData[customBase + 8] = 0;
    customData[customBase + 9] = 0;
    customData[customBase + 10] = 0;
    customData[customBase + 11] = 0;
  }
  return {
    matrixData,
    customData,
  };
};

const createStorageBuffer = (
  device: GPUDevice,
  sizeInBytes: number,
  usage: GPUBufferUsageFlags,
): GPUBuffer => {
  return device.createBuffer({
    size: sizeInBytes,
    usage,
  });
};

const sanitizeFlockingOptions = (candidate: FlockingExampleOptions): FlockingExampleOptions => {
  const minSpeed = Math.max(0.05, candidate.minSpeed);
  const maxSpeed = Math.max(minSpeed + 0.05, candidate.maxSpeed);
  const particleScaleMin = Math.max(0.01, candidate.particleScaleMin);
  const particleScaleMax = Math.max(particleScaleMin + 0.005, candidate.particleScaleMax);
  const particleCount = Math.max(
    FLOCKING_PARTICLE_COUNT_MIN,
    Math.min(FLOCKING_PARTICLE_COUNT_MAX, Math.round(candidate.particleCount)),
  );
  const shadowMapBiasOverride = Math.max(0, Math.min(0.02, candidate.shadowMapBiasOverride));
  const shadowMapSoftnessOverride = Math.max(0, Math.min(4, candidate.shadowMapSoftnessOverride));
  return {
    cohesionWeight: Math.max(0, candidate.cohesionWeight),
    alignmentWeight: Math.max(0, candidate.alignmentWeight),
    separationWeight: Math.max(0, candidate.separationWeight),
    centerWeight: Math.max(0, candidate.centerWeight),
    flowWeight: Math.max(0, candidate.flowWeight),
    neighborSamples: Math.max(1, Math.min(16, Math.round(candidate.neighborSamples))),
    minSpeed,
    maxSpeed,
    bounds: Math.max(1, candidate.bounds),
    particleCount,
    shadowMapBiasOverride,
    shadowMapSoftnessOverride,
    particleScaleMin,
    particleScaleMax,
  };
};

export const startFlockingExample = (
  applyScene: (scene: RenderScene) => void,
  initialOptions?: Partial<FlockingExampleOptions>,
): FlockingExampleController => {
  let disposed = false;
  let flockingState: GpuFlockingState | null = null;
  let options = sanitizeFlockingOptions({
    ...DEFAULT_FLOCKING_OPTIONS,
    ...initialOptions,
  });

  const destroyState = (state: GpuFlockingState): void => {
    state.uniformBuffer.destroy();
    state.stateBuffers[0].destroy();
    state.stateBuffers[1].destroy();
    state.colorBuffer.destroy();
    state.matrixBuffer.destroy();
    state.customBuffer.destroy();
  };

  const createGpuState = (
    device: GPUDevice,
    runtimeOptions: FlockingExampleOptions,
  ): GpuFlockingState => {
    const particleCapacity = runtimeOptions.particleCount;
    const { stateData, colorData } = createFlockingInitialState(
      particleCapacity,
      runtimeOptions.bounds,
    );
    const { matrixData, customData } = buildInitialInstanceBuffers(
      stateData,
      colorData,
      particleCapacity,
    );

    const stateBufferSize = stateData.byteLength;
    const colorBufferSize = colorData.byteLength;
    const matrixBufferSize = particleCapacity * 16 * 4;
    const customBufferSize = particleCapacity * 12 * 4;
    const uniformBufferSize = 16 * 4;

    const stateBufferA = createStorageBuffer(
      device,
      stateBufferSize,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    );
    const stateBufferB = createStorageBuffer(
      device,
      stateBufferSize,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    );
    const colorBuffer = createStorageBuffer(
      device,
      colorBufferSize,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    );
    const matrixBuffer = createStorageBuffer(
      device,
      matrixBufferSize,
      GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    );
    const customBuffer = createStorageBuffer(
      device,
      customBufferSize,
      GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    );
    const uniformBuffer = createStorageBuffer(
      device,
      uniformBufferSize,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    );

    device.queue.writeBuffer(
      stateBufferA,
      0,
      stateData.buffer,
      stateData.byteOffset,
      stateData.byteLength,
    );
    device.queue.writeBuffer(
      stateBufferB,
      0,
      stateData.buffer,
      stateData.byteOffset,
      stateData.byteLength,
    );
    device.queue.writeBuffer(
      colorBuffer,
      0,
      colorData.buffer,
      colorData.byteOffset,
      colorData.byteLength,
    );
    device.queue.writeBuffer(
      matrixBuffer,
      0,
      matrixData.buffer,
      matrixData.byteOffset,
      matrixData.byteLength,
    );
    device.queue.writeBuffer(
      customBuffer,
      0,
      customData.buffer,
      customData.byteOffset,
      customData.byteLength,
    );

    const shaderModule = device.createShaderModule({ code: FLOCKING_COMPUTE_SHADER });
    const computeBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'read-only-storage' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'read-only-storage' },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' },
        },
        {
          binding: 4,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' },
        },
        {
          binding: 5,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' },
        },
      ],
    });
    const computePipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [computeBindGroupLayout],
    });
    const computePipeline = device.createComputePipeline({
      layout: computePipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'csMain',
      },
    });

    const bindGroupA = device.createBindGroup({
      layout: computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: stateBufferA } },
        { binding: 1, resource: { buffer: stateBufferB } },
        { binding: 2, resource: { buffer: colorBuffer } },
        { binding: 3, resource: { buffer: matrixBuffer } },
        { binding: 4, resource: { buffer: customBuffer } },
        { binding: 5, resource: { buffer: uniformBuffer } },
      ],
    });
    const bindGroupB = device.createBindGroup({
      layout: computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: stateBufferB } },
        { binding: 1, resource: { buffer: stateBufferA } },
        { binding: 2, resource: { buffer: colorBuffer } },
        { binding: 3, resource: { buffer: matrixBuffer } },
        { binding: 4, resource: { buffer: customBuffer } },
        { binding: 5, resource: { buffer: uniformBuffer } },
      ],
    });

    const particleMaterial = createDefaultMaterial({
      name: 'flocking-particles',
      baseColor: [1, 1, 1, 1],
      metallic: 0.08,
      roughness: 0.52,
      emissive: [0, 0, 0],
      emissiveIntensity: 0,
      castsShadows: true,
      receivesShadows: true,
      twoSided: false,
    });

    const groundMaterial = createDefaultMaterial({
      name: 'flocking-ground',
      baseColor: [0.2, 0.22, 0.26, 1],
      roughness: 0.92,
      metallic: 0.02,
      castsShadows: false,
      receivesShadows: true,
    });

    const particleMesh: SceneInstancedMesh = {
      geometry: createCylinder({
        topRadius: 0,
        bottomRadius: CONE_GEOMETRY_BOTTOM_RADIUS,
        height: CONE_GEOMETRY_HEIGHT,
        radialSegments: 10,
        heightSegments: 1,
      }),
      material: particleMaterial,
      instanceTransforms: [],
      drawSource: {
        mode: 'gpuExternal',
        instanceCount: runtimeOptions.particleCount,
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
        worldBounds: {
          center: [0, 0, 0],
          radius: runtimeOptions.bounds * 1.75,
        },
      },
    };

    const scene: RenderScene = {
      meshes: [
        {
          geometry: createCircle({ radius: 90, radialSegments: 160, ringSegments: 64 }),
          material: groundMaterial,
          transform: mat4Translation(0, -runtimeOptions.bounds, 0),
        },
      ],
      instancedMeshes: [particleMesh],
      shadowMapBiasOverride: runtimeOptions.shadowMapBiasOverride,
      shadowMapSoftnessOverride: runtimeOptions.shadowMapSoftnessOverride,
      lights: [],
    };

    return {
      device,
      computePipeline,
      bindGroups: [bindGroupA, bindGroupB],
      uniformBuffer,
      stateBuffers: [stateBufferA, stateBufferB],
      colorBuffer,
      matrixBuffer,
      customBuffer,
      pingIndex: 0,
      scene,
      options: runtimeOptions,
    };
  };

  const initialize = (hookContext: RendererFrameHookContext): void => {
    if (flockingState || disposed) {
      return;
    }
    if (hookContext.backend !== 'webgpu' || !hookContext.device) {
      return;
    }

    flockingState = createGpuState(hookContext.device, options);
    applyScene(flockingState.scene);
  };

  const stepSimulation = (
    encoder: GPUCommandEncoder,
    deltaTimeMs: number,
    timeSeconds: number,
  ): void => {
    if (!flockingState || disposed) {
      return;
    }

    const clampedDeltaSeconds = Math.min(0.033, Math.max(0.001, deltaTimeMs / 1000));
    const runtimeOptions = flockingState.options;
    const uniformData = new Float32Array([
      clampedDeltaSeconds,
      timeSeconds,
      runtimeOptions.bounds,
      runtimeOptions.particleCount,
      runtimeOptions.maxSpeed,
      runtimeOptions.minSpeed,
      runtimeOptions.cohesionWeight,
      runtimeOptions.alignmentWeight,
      runtimeOptions.separationWeight,
      runtimeOptions.centerWeight,
      runtimeOptions.flowWeight,
      runtimeOptions.neighborSamples,
      runtimeOptions.particleScaleMin,
      runtimeOptions.particleScaleMax,
      0,
      0,
    ]);
    flockingState.device.queue.writeBuffer(flockingState.uniformBuffer, 0, uniformData);

    const computePass = encoder.beginComputePass();
    computePass.setPipeline(flockingState.computePipeline);
    computePass.setBindGroup(0, flockingState.bindGroups[flockingState.pingIndex]);
    const workgroupCount = Math.ceil(runtimeOptions.particleCount / WORKGROUP_SIZE);
    computePass.dispatchWorkgroups(workgroupCount);
    computePass.end();

    flockingState.pingIndex = flockingState.pingIndex === 0 ? 1 : 0;
  };

  const engineOptions: RendererEngineOptions = {
    webGpuShaderOverrides: {
      sky: BLACK_SKY_SHADER,
    },
    frameHooks: {
      beforeFrame: (hookContext) => {
        initialize(hookContext);
      },
      onError: (_phase, error) => {
        console.warn('Flocking example frame hook error.', error);
      },
    },
    webGpuStages: [
      {
        name: 'flocking-simulation',
        injectionPoint: 'pre-scene',
        reads: [
          { name: 'frame-time-seconds', kind: 'number' },
          { name: 'frame-delta-ms', kind: 'number' },
        ],
        execute: (stageContext) => {
          stepSimulation(stageContext.encoder, stageContext.deltaTimeMs, stageContext.timeSeconds);
        },
      },
    ],
    webGpuStageFailurePolicy: 'skip-stage',
    webGpuStageCpuBudgetMs: 2.5,
    webGpuWarnOnExternalLayoutMismatch: true,
  };

  return {
    engineOptions,
    setOptions: (nextOptions: FlockingExampleOptions) => {
      const nextSanitized = sanitizeFlockingOptions(nextOptions);
      const particleCountChanged = nextSanitized.particleCount !== options.particleCount;
      options = nextSanitized;
      if (flockingState) {
        if (particleCountChanged) {
          const previousState = flockingState;
          const device = previousState.device;
          flockingState = createGpuState(device, options);
          applyScene(flockingState.scene);
          destroyState(previousState);
          return;
        }

        flockingState.options = options;
        const drawSource = flockingState.scene.instancedMeshes?.[0]?.drawSource;
        if (drawSource && drawSource.mode === 'gpuExternal' && drawSource.worldBounds) {
          drawSource.instanceCount = options.particleCount;
          drawSource.worldBounds.radius = options.bounds * 1.75;
        }
        const groundMesh = flockingState.scene.meshes[0];
        if (groundMesh) {
          groundMesh.transform = mat4Translation(0, -options.bounds, 0);
        }
        flockingState.scene.shadowMapBiasOverride = options.shadowMapBiasOverride;
        flockingState.scene.shadowMapSoftnessOverride = options.shadowMapSoftnessOverride;
        applyScene(flockingState.scene);
      }
    },
    dispose: () => {
      disposed = true;
      if (!flockingState) {
        return;
      }
      destroyState(flockingState);
      flockingState = null;
    },
  };
};
