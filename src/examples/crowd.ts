import type {
  RendererEngineOptions,
  RendererFrameHookContext,
} from '@stunner/core/renderer/RendererEngine';
import {
  loadAnimatedGltfSceneFromUrl,
  type AnimatedGltfLoadResult,
} from '@stunner/core/renderer/mesh/AnimatedGltfLoader';
import { createDefaultMaterial } from '@stunner/core/renderer/mesh/MaterialTypes';
import { createCircle } from '@stunner/core/renderer/mesh/MeshFactory';
import {
  mat4Identity,
  type Mat4,
  type RenderScene,
  type SceneInstancedMesh,
  type SceneMeshInstance,
} from '@stunner/core/renderer/mesh/SceneTypes';
import type { MeshGeometry } from '@stunner/core/renderer/mesh/MeshTypes';

const CESIUM_MAN_MODEL_URL = '/models/cesium-man/CesiumMan.gltf';
const WORKGROUP_SIZE = 64;
const FLOOR_SIZE = 20;
const FLOOR_HALF_SIZE = FLOOR_SIZE * 0.5;
const GROUND_RADIUS = FLOOR_SIZE * 0.75;
const BASE_MODEL_SCALE = 0.85;
const SCALE_VARIATION_MIN = 0.95;
const SCALE_VARIATION_MAX = 1.05;
const BODY_SPEED_MIN = 0.6;
const BODY_SPEED_MAX = 1.2;
const SPEED_BUCKET_COUNT = 4;
const MODEL_CLEARANCE_Y = 0.02;
const DEFAULT_DIRECTIONAL_LIGHT_AZIMUTH_DEG = 21.8;
const DEFAULT_DIRECTIONAL_LIGHT_ELEVATION_DEG = 59.1;
const DEFAULT_DIRECTIONAL_LIGHT_INTENSITY = 3.6;
const DEFAULT_DIRECTIONAL_LIGHT_SOURCE_SIZE = 0.1;
const MATRIX_STRIDE_BYTES = 64;
const CUSTOM_STRIDE_BYTES = 48;

export const CROWD_BODY_COUNT_MIN = 2;
export const CROWD_BODY_COUNT_MAX = 500;
export const CROWD_COLLISION_RADIUS_MIN = 0.2;
export const CROWD_COLLISION_RADIUS_MAX = 2.5;

export type CrowdExampleOptions = {
  bodyCount: number;
  collisionRadius: number;
  turnRate: number;
  directionalLightAzimuthDeg: number;
  directionalLightElevationDeg: number;
  directionalLightIntensity: number;
  directionalLightSourceSize: number;
  celShadingEnabled: boolean;
  celBandCount: number;
  celEdgeStrength: number;
  celOutlineDarkness: number;
};

export const DEFAULT_CROWD_OPTIONS: CrowdExampleOptions = {
  bodyCount: 250,
  collisionRadius: 0.4,
  turnRate: 3.0,
  directionalLightAzimuthDeg: DEFAULT_DIRECTIONAL_LIGHT_AZIMUTH_DEG,
  directionalLightElevationDeg: DEFAULT_DIRECTIONAL_LIGHT_ELEVATION_DEG,
  directionalLightIntensity: DEFAULT_DIRECTIONAL_LIGHT_INTENSITY,
  directionalLightSourceSize: DEFAULT_DIRECTIONAL_LIGHT_SOURCE_SIZE,
  celShadingEnabled: false,
  celBandCount: 4,
  celEdgeStrength: 1.0,
  celOutlineDarkness: 0.92,
};

const directionFromAnglesDeg = (
  azimuthDeg: number,
  elevationDeg: number,
): [number, number, number] => {
  const azimuthRadians = (azimuthDeg * Math.PI) / 180;
  const elevationRadians = (elevationDeg * Math.PI) / 180;
  const horizontal = Math.cos(elevationRadians);
  return [
    Math.cos(azimuthRadians) * horizontal,
    Math.sin(elevationRadians),
    Math.sin(azimuthRadians) * horizontal,
  ];
};

type CrowdExampleController = {
  engineOptions: RendererEngineOptions;
  setOptions: (options: CrowdExampleOptions) => void;
  dispose: () => void;
};

type CrowdState = {
  device: GPUDevice;
  computePipeline: GPUComputePipeline;
  bindGroups: [GPUBindGroup, GPUBindGroup];
  uniformBuffer: GPUBuffer;
  stateBuffers: [GPUBuffer, GPUBuffer];
  matrixBuffer: GPUBuffer;
  customBuffer: GPUBuffer;
  pingIndex: 0 | 1;
  scene: RenderScene;
  options: CrowdExampleOptions;
};

type StageTextureHandle = {
  texture: GPUTexture;
  view: GPUTextureView;
  format: GPUTextureFormat;
};

type CrowdCelShadingState = {
  pipeline: GPURenderPipeline;
  sampler: GPUSampler;
  uniformBuffer: GPUBuffer;
  outputTexture: GPUTexture | null;
  outputView: GPUTextureView | null;
  outputWidth: number;
  outputHeight: number;
  outputFormat: GPUTextureFormat;
};

type CrowdBucket = {
  source: AnimatedGltfLoadResult;
  speedMin: number;
  speedMax: number;
  playbackSpeed: number;
  startIndex: number;
  count: number;
  instancedMeshes: SceneInstancedMesh[];
};

type LoadedCrowdAsset = {
  buckets: CrowdBucket[];
  instancedMeshes: SceneInstancedMesh[];
  textureLibrary: Record<string, string>;
  modelBaseY: number;
};

const CROWD_COMPUTE_SHADER = /* wgsl */ `
const MODEL_YAW_OFFSET: f32 = -1.5707963267948966;

struct BodyState {
  positionAndSpeed: vec4f,
  motion: vec4f,
}

struct InstanceCustom {
  custom0: vec4f,
  custom1: vec4f,
  materialData: vec4f,
}

struct CrowdUniforms {
  dt: f32,
  time: f32,
  count: f32,
  halfExtent: f32,
  collisionRadius: f32,
  turnRate: f32,
  bodyY: f32,
  modelScale: f32,
  pushStrength: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
  _pad4: f32,
  _pad5: f32,
  _pad6: f32,
}

@group(0) @binding(0) var<storage, read> stateIn: array<BodyState>;
@group(0) @binding(1) var<storage, read_write> stateOut: array<BodyState>;
@group(0) @binding(2) var<storage, read_write> matrixBuffer: array<mat4x4f>;
@group(0) @binding(3) var<storage, read_write> customBuffer: array<InstanceCustom>;
@group(0) @binding(4) var<uniform> sim: CrowdUniforms;

fn rotateToward(current: f32, goalYaw: f32, maxStep: f32) -> f32 {
  let delta = atan2(sin(goalYaw - current), cos(goalYaw - current));
  let step = clamp(delta, -maxStep, maxStep);
  return current + step;
}

fn safeNormalize2(v: vec2f, fallback: vec2f) -> vec2f {
  let lenSq = dot(v, v);
  if (lenSq < 1e-8) {
    return fallback;
  }
  return v * inverseSqrt(lenSq);
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn csMain(@builtin(global_invocation_id) globalId: vec3u) {
  let index = globalId.x;
  let count = u32(max(1.0, sim.count));
  if (index >= count) {
    return;
  }

  let current = stateIn[index];
  var position = current.positionAndSpeed.xyz;
  let baseSpeed = current.positionAndSpeed.w;
  var yaw = current.motion.x;
  var targetYaw = current.motion.y;
  var animationTime = current.motion.z;
  let bodyScale = current.motion.w;

  let forward = vec2f(sin(yaw), cos(yaw));
  var openDirection = forward;
  var push = vec2f(0.0, 0.0);

  let interactionRadius = max(0.001, sim.collisionRadius * 2.0);
  let boundary = sim.halfExtent - sim.collisionRadius;

  for (var neighborIndex = 0u; neighborIndex < count; neighborIndex = neighborIndex + 1u) {
    if (neighborIndex == index) {
      continue;
    }
    let neighbor = stateIn[neighborIndex];
    let delta = neighbor.positionAndSpeed.xz - position.xz;
    let distance = length(delta);
    if (distance <= 0.0001 || distance >= interactionRadius) {
      continue;
    }

    let away = -delta / distance;
    let overlap = (interactionRadius - distance) / interactionRadius;
    let speedAdvantage = max(0.0, baseSpeed - neighbor.positionAndSpeed.w);
    let pushWeight = overlap * (1.0 + speedAdvantage * 1.25);
    push = push + away * pushWeight;
    openDirection = openDirection + away * overlap;
  }

  if (position.x > boundary) {
    openDirection = openDirection + vec2f(-1.0, 0.0) * ((position.x - boundary) / max(0.01, sim.collisionRadius));
  }
  if (position.x < -boundary) {
    openDirection = openDirection + vec2f(1.0, 0.0) * ((-boundary - position.x) / max(0.01, sim.collisionRadius));
  }
  if (position.z > boundary) {
    openDirection = openDirection + vec2f(0.0, -1.0) * ((position.z - boundary) / max(0.01, sim.collisionRadius));
  }
  if (position.z < -boundary) {
    openDirection = openDirection + vec2f(0.0, 1.0) * ((-boundary - position.z) / max(0.01, sim.collisionRadius));
  }

  let desiredDirection = safeNormalize2(openDirection + push * 0.55, forward);
  targetYaw = atan2(desiredDirection.x, desiredDirection.y);
  yaw = rotateToward(yaw, targetYaw, max(0.01, sim.turnRate) * sim.dt);

  let facing = vec2f(sin(yaw), cos(yaw));
  let displacementDirection = safeNormalize2(facing + push * sim.pushStrength, facing);
  let speedBoost = clamp(length(push) * 0.3, 0.0, 0.8);
  let movementSpeed = baseSpeed * (1.0 + speedBoost);
  position.x = position.x + displacementDirection.x * movementSpeed * sim.dt;
  position.z = position.z + displacementDirection.y * movementSpeed * sim.dt;

  if (abs(position.x) > sim.halfExtent || abs(position.z) > sim.halfExtent) {
    position.x = clamp(position.x, -sim.halfExtent, sim.halfExtent);
    position.z = clamp(position.z, -sim.halfExtent, sim.halfExtent);
    let toCenter = safeNormalize2(-position.xz, facing);
    targetYaw = atan2(toCenter.x, toCenter.y);
    yaw = rotateToward(yaw, targetYaw, max(0.01, sim.turnRate) * sim.dt * 1.45);
  }

  animationTime = animationTime + movementSpeed * sim.dt;

  stateOut[index].positionAndSpeed = vec4f(position, baseSpeed);
  stateOut[index].motion = vec4f(yaw, targetYaw, animationTime, bodyScale);

  let dir = displacementDirection;
  let modelYaw = atan2(dir.y, dir.x);
  let renderYaw = modelYaw + MODEL_YAW_OFFSET;
  let c = cos(renderYaw) * bodyScale;
  let s = sin(renderYaw) * bodyScale;
  let scaleDrop = max(0.0, sim.modelScale - bodyScale);
  let scaledFloorContactOffset = scaleDrop * sim.bodyY;
  let floorSinkOffset = 0.03;
  matrixBuffer[index] = mat4x4f(
    vec4f(c, 0.0, s, 0.0),
    vec4f(0.0, bodyScale, 0.0, 0.0),
    vec4f(-s, 0.0, c, 0.0),
    vec4f(position.x, sim.bodyY * bodyScale - scaledFloorContactOffset - floorSinkOffset, position.z, 1.0),
  );

  let speedLerp = clamp((baseSpeed - 0.6) / 0.6, 0.0, 1.0);
  customBuffer[index].custom0 = vec4f(1.0, 1.0, 1.0, 1.0);
  customBuffer[index].custom1 = vec4f(speedLerp, movementSpeed, animationTime, 1.0);
  customBuffer[index].materialData = vec4f(0.0, 0.0, 0.0, 0.0);
}
`;

const CROWD_FULLSCREEN_TRIANGLE_VS_WGSL = /* wgsl */ `
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vsMain(@builtin(vertex_index) vertexIndex: u32) -> VsOut {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -3.0),
    vec2f(3.0, 1.0),
    vec2f(-1.0, 1.0),
  );

  var outputVertex: VsOut;
  outputVertex.position = vec4f(positions[vertexIndex], 0.0, 1.0);
  outputVertex.uv = positions[vertexIndex] * 0.5 + vec2f(0.5, 0.5);
  return outputVertex;
}
`;

const CROWD_CEL_FRAGMENT_WGSL = /* wgsl */ `
@group(0) @binding(0) var linearSampler: sampler;
@group(0) @binding(1) var sourceColorTexture: texture_2d<f32>;
@group(0) @binding(2) var sourceNormalTexture: texture_2d<f32>;
@group(0) @binding(3) var sourceMaterialTexture: texture_2d<f32>;
@group(0) @binding(4) var<uniform> celParams: vec4f;

fn luminance(color: vec3f) -> f32 {
  return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}

@fragment
fn fsMain(inFragment: VsOut) -> @location(0) vec4f {
  let uv = vec2f(inFragment.uv.x, 1.0 - inFragment.uv.y);
  let dimensions = vec2f(textureDimensions(sourceColorTexture));
  let texelSize = vec2f(1.0 / dimensions.x, 1.0 / dimensions.y);

  let color = textureSample(sourceColorTexture, linearSampler, uv).xyz;
  let normalCenter = normalize(textureSample(sourceNormalTexture, linearSampler, uv).xyz * 2.0 - vec3f(1.0));
  let normalRight = normalize(textureSample(sourceNormalTexture, linearSampler, uv + vec2f(texelSize.x, 0.0)).xyz * 2.0 - vec3f(1.0));
  let normalUp = normalize(textureSample(sourceNormalTexture, linearSampler, uv + vec2f(0.0, texelSize.y)).xyz * 2.0 - vec3f(1.0));

  let depthCenter = textureSample(sourceMaterialTexture, linearSampler, uv).y;
  let depthRight = textureSample(sourceMaterialTexture, linearSampler, uv + vec2f(texelSize.x, 0.0)).y;
  let depthUp = textureSample(sourceMaterialTexture, linearSampler, uv + vec2f(0.0, texelSize.y)).y;

  let toneBands = max(2.0, celParams.x);
  let edgeScale = max(0.0, celParams.y);
  let outlineDarkness = clamp(celParams.z, 0.0, 1.0);
  let luma = clamp(luminance(color), 0.0, 1.0);
  let quantized = floor(luma * toneBands) / max(1.0, toneBands - 1.0);
  let celLit = color * (0.45 + quantized * 0.75);

  let normalEdge = length(normalCenter - normalRight) + length(normalCenter - normalUp);
  let depthEdge = abs(depthCenter - depthRight) + abs(depthCenter - depthUp);
  let edgeStrength = clamp(
    (smoothstep(0.07, 0.24, normalEdge) + smoothstep(0.0015, 0.008, depthEdge)) * edgeScale,
    0.0,
    1.0,
  );

  let outlineColor = vec3f(1.0 - outlineDarkness);
  let outlined = mix(celLit, outlineColor, edgeStrength);
  return vec4f(max(vec3f(0.0), outlined), 1.0);
}
`;

const createCrowdCelShadingState = (
  device: GPUDevice,
  outputFormat: GPUTextureFormat,
): CrowdCelShadingState => {
  const shaderModule = device.createShaderModule({
    code: `${CROWD_FULLSCREEN_TRIANGLE_VS_WGSL}\n${CROWD_CEL_FRAGMENT_WGSL}`,
  });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vsMain',
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fsMain',
      targets: [{ format: outputFormat }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  return {
    pipeline,
    sampler: device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    }),
    uniformBuffer: device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
    outputTexture: null,
    outputView: null,
    outputWidth: 0,
    outputHeight: 0,
    outputFormat,
  };
};

const ensureCrowdCelOutput = (
  state: CrowdCelShadingState,
  device: GPUDevice,
  width: number,
  height: number,
): StageTextureHandle => {
  const targetWidth = Math.max(1, Math.floor(width));
  const targetHeight = Math.max(1, Math.floor(height));
  const needsResize =
    !state.outputTexture ||
    state.outputWidth !== targetWidth ||
    state.outputHeight !== targetHeight;

  if (needsResize) {
    state.outputTexture?.destroy();
    state.outputTexture = device.createTexture({
      size: { width: targetWidth, height: targetHeight, depthOrArrayLayers: 1 },
      format: state.outputFormat,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });
    state.outputView = state.outputTexture.createView();
    state.outputWidth = targetWidth;
    state.outputHeight = targetHeight;
  }

  if (!state.outputTexture || !state.outputView) {
    throw new Error('Crowd cel-shading output texture failed to initialize.');
  }

  return {
    texture: state.outputTexture,
    view: state.outputView,
    format: state.outputFormat,
  };
};

const sanitizeCrowdOptions = (candidate: CrowdExampleOptions): CrowdExampleOptions => {
  return {
    bodyCount: Math.max(
      CROWD_BODY_COUNT_MIN,
      Math.min(CROWD_BODY_COUNT_MAX, Math.round(candidate.bodyCount)),
    ),
    collisionRadius: Math.max(
      CROWD_COLLISION_RADIUS_MIN,
      Math.min(CROWD_COLLISION_RADIUS_MAX, candidate.collisionRadius),
    ),
    turnRate: Math.max(0.2, Math.min(8.0, candidate.turnRate)),
    directionalLightAzimuthDeg: Math.max(-180, Math.min(180, candidate.directionalLightAzimuthDeg)),
    directionalLightElevationDeg: Math.max(-89, Math.min(89, candidate.directionalLightElevationDeg)),
    directionalLightIntensity: Math.max(0, Math.min(20, candidate.directionalLightIntensity)),
    directionalLightSourceSize: Math.max(0, Math.min(1, candidate.directionalLightSourceSize)),
    celShadingEnabled: Boolean(candidate.celShadingEnabled),
    celBandCount: Math.max(2, Math.min(8, Math.round(candidate.celBandCount))),
    celEdgeStrength: Math.max(0, Math.min(2, candidate.celEdgeStrength)),
    celOutlineDarkness: Math.max(0, Math.min(1, candidate.celOutlineDarkness)),
  };
};

const applyDirectionalLight = (
  scene: RenderScene,
  runtimeOptions: CrowdExampleOptions,
): void => {
  const direction = directionFromAnglesDeg(
    runtimeOptions.directionalLightAzimuthDeg,
    runtimeOptions.directionalLightElevationDeg,
  );
  scene.keyLightDirection = direction;
  scene.directionalLightingIntensity = runtimeOptions.directionalLightIntensity;
  scene.keyLightSourceSize = runtimeOptions.directionalLightSourceSize;
  const directionalLight = scene.lights.find((light) => light.type === 'directional');
  if (directionalLight && directionalLight.type === 'directional') {
    directionalLight.direction = [-direction[0], -direction[1], -direction[2]];
    directionalLight.intensity = runtimeOptions.directionalLightIntensity;
  }
};

const randomRange = (min: number, max: number): number => {
  return min + (max - min) * Math.random();
};

const transformPoint = (matrix: Mat4, x: number, y: number, z: number): [number, number, number] => {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
};

const transformVector = (matrix: Mat4, x: number, y: number, z: number): [number, number, number] => {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z,
    matrix[1] * x + matrix[5] * y + matrix[9] * z,
    matrix[2] * x + matrix[6] * y + matrix[10] * z,
  ];
};

const normalize3 = (x: number, y: number, z: number): [number, number, number] => {
  const length = Math.hypot(x, y, z);
  if (length <= 0.000001) {
    return [0, 1, 0];
  }
  return [x / length, y / length, z / length];
};

const isIdentityMatrix = (matrix: Mat4): boolean => {
  return (
    matrix[0] === 1 && matrix[1] === 0 && matrix[2] === 0 && matrix[3] === 0 &&
    matrix[4] === 0 && matrix[5] === 1 && matrix[6] === 0 && matrix[7] === 0 &&
    matrix[8] === 0 && matrix[9] === 0 && matrix[10] === 1 && matrix[11] === 0 &&
    matrix[12] === 0 && matrix[13] === 0 && matrix[14] === 0 && matrix[15] === 1
  );
};

const setIdentityMatrixInPlace = (matrix: Mat4): void => {
  matrix[0] = 1; matrix[1] = 0; matrix[2] = 0; matrix[3] = 0;
  matrix[4] = 0; matrix[5] = 1; matrix[6] = 0; matrix[7] = 0;
  matrix[8] = 0; matrix[9] = 0; matrix[10] = 1; matrix[11] = 0;
  matrix[12] = 0; matrix[13] = 0; matrix[14] = 0; matrix[15] = 1;
};

const bakeMeshTransformIntoGeometry = (mesh: SceneMeshInstance): void => {
  const transform = mesh.transform;
  if (!transform || isIdentityMatrix(transform)) {
    return;
  }

  const vertices = mesh.geometry.vertices;
  const vertexCount = mesh.geometry.vertexCount;
  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    const base = vertexIndex * 12;
    const position = transformPoint(transform, vertices[base + 0], vertices[base + 1], vertices[base + 2]);
    const normal = transformVector(transform, vertices[base + 3], vertices[base + 4], vertices[base + 5]);
    const tangent = transformVector(transform, vertices[base + 8], vertices[base + 9], vertices[base + 10]);
    const normalizedNormal = normalize3(normal[0], normal[1], normal[2]);
    const normalizedTangent = normalize3(tangent[0], tangent[1], tangent[2]);

    vertices[base + 0] = position[0];
    vertices[base + 1] = position[1];
    vertices[base + 2] = position[2];
    vertices[base + 3] = normalizedNormal[0];
    vertices[base + 4] = normalizedNormal[1];
    vertices[base + 5] = normalizedNormal[2];
    vertices[base + 8] = normalizedTangent[0];
    vertices[base + 9] = normalizedTangent[1];
    vertices[base + 10] = normalizedTangent[2];
  }

  mesh.geometry.version = (mesh.geometry.version ?? 0) + 1;
  setIdentityMatrixInPlace(transform);
};

const bakeSourceTransformsIntoGeometry = (source: AnimatedGltfLoadResult): void => {
  for (const mesh of source.meshes) {
    bakeMeshTransformIntoGeometry(mesh);
  }
};

const transformGeometry = (geometry: MeshGeometry, transform: Mat4): MeshGeometry => {
  const vertices = new Float32Array(geometry.vertices);
  const indices = new Uint32Array(geometry.indices);
  for (let vertexIndex = 0; vertexIndex < geometry.vertexCount; vertexIndex += 1) {
    const base = vertexIndex * 12;
    const position = transformPoint(
      transform,
      vertices[base + 0],
      vertices[base + 1],
      vertices[base + 2],
    );
    vertices[base + 0] = position[0];
    vertices[base + 1] = position[1];
    vertices[base + 2] = position[2];

    const normal = transformVector(
      transform,
      vertices[base + 3],
      vertices[base + 4],
      vertices[base + 5],
    );
    const tangent = transformVector(
      transform,
      vertices[base + 8],
      vertices[base + 9],
      vertices[base + 10],
    );
    const normalizedNormal = normalize3(normal[0], normal[1], normal[2]);
    const normalizedTangent = normalize3(tangent[0], tangent[1], tangent[2]);
    vertices[base + 3] = normalizedNormal[0];
    vertices[base + 4] = normalizedNormal[1];
    vertices[base + 5] = normalizedNormal[2];
    vertices[base + 8] = normalizedTangent[0];
    vertices[base + 9] = normalizedTangent[1];
    vertices[base + 10] = normalizedTangent[2];
  }

  return {
    vertices,
    indices,
    vertexCount: geometry.vertexCount,
    indexCount: geometry.indexCount,
    version: geometry.version,
  };
};

const namespaceTextureLibrary = (
  modelNamespace: string,
  meshes: SceneMeshInstance[],
  textureLibrary: Record<string, string>,
): Record<string, string> => {
  const namespacedLibrary: Record<string, string> = {};
  const remap = new Map<string, string>();
  for (const [textureId, textureUrl] of Object.entries(textureLibrary)) {
    const namespaced = `${modelNamespace}-${textureId}`;
    namespacedLibrary[namespaced] = textureUrl;
    remap.set(textureId, namespaced);
  }

  for (const mesh of meshes) {
    const textureIds = mesh.material.textureIds;
    if (!textureIds) {
      continue;
    }
    if (textureIds.baseColor && remap.has(textureIds.baseColor)) {
      textureIds.baseColor = remap.get(textureIds.baseColor);
    }
    if (textureIds.normal && remap.has(textureIds.normal)) {
      textureIds.normal = remap.get(textureIds.normal);
    }
    if (textureIds.orm && remap.has(textureIds.orm)) {
      textureIds.orm = remap.get(textureIds.orm);
    }
    if (textureIds.ao && remap.has(textureIds.ao)) {
      textureIds.ao = remap.get(textureIds.ao);
    }
    if (textureIds.rm && remap.has(textureIds.rm)) {
      textureIds.rm = remap.get(textureIds.rm);
    }
    if (textureIds.roughness && remap.has(textureIds.roughness)) {
      textureIds.roughness = remap.get(textureIds.roughness);
    }
    if (textureIds.metallic && remap.has(textureIds.metallic)) {
      textureIds.metallic = remap.get(textureIds.metallic);
    }
    if (textureIds.anisotropy && remap.has(textureIds.anisotropy)) {
      textureIds.anisotropy = remap.get(textureIds.anisotropy);
    }
    if (textureIds.emissive && remap.has(textureIds.emissive)) {
      textureIds.emissive = remap.get(textureIds.emissive);
    }
  }

  return namespacedLibrary;
};

const loadCrowdAsset = async (): Promise<LoadedCrowdAsset> => {
  const bucketSpan = (BODY_SPEED_MAX - BODY_SPEED_MIN) / SPEED_BUCKET_COUNT;
  const sourcePromises: Array<Promise<AnimatedGltfLoadResult>> = [];
  const speedRanges: Array<{ min: number; max: number; playbackSpeed: number }> = [];
  for (let bucketIndex = 0; bucketIndex < SPEED_BUCKET_COUNT; bucketIndex += 1) {
    const speedMin = BODY_SPEED_MIN + bucketIndex * bucketSpan;
    const speedMax = BODY_SPEED_MIN + (bucketIndex + 1) * bucketSpan;
    const speedCenter = (speedMin + speedMax) * 0.5;
    const playbackSpeed = (0.8 + (speedCenter - 1) * 1.2) * 2.0;
    speedRanges.push({
      min: speedMin,
      max: speedMax,
      playbackSpeed,
    });
    sourcePromises.push(
      loadAnimatedGltfSceneFromUrl(CESIUM_MAN_MODEL_URL, {
        playbackSpeed,
        loop: true,
      }),
    );
  }
  const sources = await Promise.all(sourcePromises);
  const referenceSource = sources[0];

  const preparedReferenceMeshes = referenceSource.meshes.map((mesh) => {
    const worldTransform = mesh.transform ?? mat4Identity();
    return {
      ...mesh,
      geometry: transformGeometry(mesh.geometry, worldTransform),
      transform: mat4Identity(),
    };
  });

  let minY = Number.POSITIVE_INFINITY;
  for (const mesh of preparedReferenceMeshes) {
    for (let vertexIndex = 0; vertexIndex < mesh.geometry.vertexCount; vertexIndex += 1) {
      const y = mesh.geometry.vertices[vertexIndex * 12 + 1];
      minY = Math.min(minY, y);
    }
  }
  const bodyBaseY = Number.isFinite(minY) ? -minY + MODEL_CLEARANCE_Y : MODEL_CLEARANCE_Y;

  const textureLibrary: Record<string, string> = {};
  const buckets: CrowdBucket[] = [];
  const instancedMeshes: SceneInstancedMesh[] = [];
  for (let bucketIndex = 0; bucketIndex < SPEED_BUCKET_COUNT; bucketIndex += 1) {
    const source = sources[bucketIndex];
    const speedRange = speedRanges[bucketIndex];
    bakeSourceTransformsIntoGeometry(source);
    const namespaced = namespaceTextureLibrary(
      `crowd-cesium-man-bucket-${bucketIndex}`,
      source.meshes,
      source.textureLibrary,
    );
    Object.assign(textureLibrary, namespaced);

    const bucketMeshes: SceneInstancedMesh[] = source.meshes.map((mesh) => ({
      geometry: mesh.geometry,
      material: mesh.material,
      instanceTransforms: [],
      drawSource: {
        mode: 'gpuExternal',
        instanceCount: 0,
        instanceBuffers: [],
        worldBounds: {
          center: [0, bodyBaseY * 0.5, 0],
          radius: FLOOR_HALF_SIZE * 1.8,
        },
      },
    }));

    buckets.push({
      source,
      speedMin: speedRange.min,
      speedMax: speedRange.max,
      playbackSpeed: speedRange.playbackSpeed,
      startIndex: 0,
      count: 0,
      instancedMeshes: bucketMeshes,
    });
    instancedMeshes.push(...bucketMeshes);
  }

  return {
    buckets,
    instancedMeshes,
    textureLibrary,
    modelBaseY: bodyBaseY,
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

const createInitialCrowdState = (
  bodyCount: number,
  buckets: CrowdBucket[],
): {
  stateData: Float32Array;
  bucketStarts: number[];
  bucketCounts: number[];
} => {
  const stateData = new Float32Array(bodyCount * 8);
  const columns = Math.ceil(Math.sqrt(bodyCount));
  const rows = Math.ceil(bodyCount / columns);
  const spacingX = FLOOR_SIZE / columns;
  const spacingZ = FLOOR_SIZE / rows;

  const bucketCount = Math.max(1, buckets.length);
  const bucketCounts = new Array<number>(bucketCount).fill(Math.floor(bodyCount / bucketCount));
  for (let index = 0; index < bodyCount % bucketCount; index += 1) {
    bucketCounts[index] += 1;
  }
  const bucketStarts = new Array<number>(bucketCount).fill(0);
  let startCursor = 0;
  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    bucketStarts[bucketIndex] = startCursor;
    buckets[bucketIndex].startIndex = startCursor;
    buckets[bucketIndex].count = bucketCounts[bucketIndex];
    startCursor += bucketCounts[bucketIndex];
  }

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const speedMin = buckets[bucketIndex].speedMin;
    const speedMax = buckets[bucketIndex].speedMax;
    const start = bucketStarts[bucketIndex];
    const count = bucketCounts[bucketIndex];
    for (let localIndex = 0; localIndex < count; localIndex += 1) {
      const index = start + localIndex;
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = -FLOOR_HALF_SIZE + spacingX * 0.5 + column * spacingX;
      const z = -FLOOR_HALF_SIZE + spacingZ * 0.5 + row * spacingZ;
      const yaw = randomRange(0, Math.PI * 2);
      const speed = randomRange(speedMin, speedMax);
      const bodyScale = BASE_MODEL_SCALE * randomRange(SCALE_VARIATION_MIN, SCALE_VARIATION_MAX);
      const base = index * 8;

      stateData[base + 0] = x;
      stateData[base + 1] = 0;
      stateData[base + 2] = z;
      stateData[base + 3] = speed;
      stateData[base + 4] = yaw;
      stateData[base + 5] = yaw;
      stateData[base + 6] = randomRange(0, Math.PI * 2);
      stateData[base + 7] = bodyScale;
    }
  }

  return {
    stateData,
    bucketStarts,
    bucketCounts,
  };
};

const buildInitialInstanceData = (bodyCount: number, bodyBaseY: number): {
  matrixData: Float32Array;
  customData: Float32Array;
} => {
  const matrixData = new Float32Array(bodyCount * 16);
  const customData = new Float32Array(bodyCount * 12);
  for (let index = 0; index < bodyCount; index += 1) {
    const matrixBase = index * 16;
    matrixData[matrixBase + 0] = BASE_MODEL_SCALE;
    matrixData[matrixBase + 5] = BASE_MODEL_SCALE;
    matrixData[matrixBase + 10] = BASE_MODEL_SCALE;
    matrixData[matrixBase + 13] = bodyBaseY * BASE_MODEL_SCALE;
    matrixData[matrixBase + 15] = 1;

    const customBase = index * 12;
    customData[customBase + 0] = 1;
    customData[customBase + 1] = 1;
    customData[customBase + 2] = 1;
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

export const startCrowdExample = (
  applyScene: (scene: RenderScene) => void,
  initialOptions?: Partial<CrowdExampleOptions>,
): CrowdExampleController => {
  let disposed = false;
  let options = sanitizeCrowdOptions({
    ...DEFAULT_CROWD_OPTIONS,
    ...initialOptions,
  });
  let crowdState: CrowdState | null = null;
  let crowdCelShadingState: CrowdCelShadingState | null = null;
  let crowdAsset: LoadedCrowdAsset | null = null;
  let crowdAssetError: unknown = null;

  const crowdAssetPromise = loadCrowdAsset()
    .then((asset) => {
      crowdAsset = asset;
    })
    .catch((error: unknown) => {
      crowdAssetError = error;
    });

  const destroyState = (state: CrowdState): void => {
    state.uniformBuffer.destroy();
    state.stateBuffers[0].destroy();
    state.stateBuffers[1].destroy();
    state.matrixBuffer.destroy();
    state.customBuffer.destroy();
  };

  const destroyCelShadingState = (): void => {
    if (!crowdCelShadingState) {
      return;
    }
    crowdCelShadingState.uniformBuffer.destroy();
    crowdCelShadingState.outputTexture?.destroy();
    crowdCelShadingState.outputTexture = null;
    crowdCelShadingState.outputView = null;
    crowdCelShadingState = null;
  };

  const createGpuState = (
    device: GPUDevice,
    loadedAsset: LoadedCrowdAsset,
    runtimeOptions: CrowdExampleOptions,
  ): CrowdState => {
    const { stateData, bucketStarts, bucketCounts } = createInitialCrowdState(
      runtimeOptions.bodyCount,
      loadedAsset.buckets,
    );
    const { matrixData, customData } = buildInitialInstanceData(
      runtimeOptions.bodyCount,
      loadedAsset.modelBaseY,
    );

    const stateBufferSize = stateData.byteLength;
    const matrixBufferSize = runtimeOptions.bodyCount * 16 * 4;
    const customBufferSize = runtimeOptions.bodyCount * 12 * 4;
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

    const shaderModule = device.createShaderModule({ code: CROWD_COMPUTE_SHADER });
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
          buffer: { type: 'storage' },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' },
        },
        {
          binding: 4,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' },
        },
      ],
    });
    const computePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [computeBindGroupLayout] }),
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
        { binding: 2, resource: { buffer: matrixBuffer } },
        { binding: 3, resource: { buffer: customBuffer } },
        { binding: 4, resource: { buffer: uniformBuffer } },
      ],
    });
    const bindGroupB = device.createBindGroup({
      layout: computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: stateBufferB } },
        { binding: 1, resource: { buffer: stateBufferA } },
        { binding: 2, resource: { buffer: matrixBuffer } },
        { binding: 3, resource: { buffer: customBuffer } },
        { binding: 4, resource: { buffer: uniformBuffer } },
      ],
    });

    for (let bucketIndex = 0; bucketIndex < loadedAsset.buckets.length; bucketIndex += 1) {
      const bucket = loadedAsset.buckets[bucketIndex];
      const startIndex = bucketStarts[bucketIndex];
      const count = bucketCounts[bucketIndex];
      const instanceBuffers = [
        {
          buffer: matrixBuffer,
          offset: startIndex * MATRIX_STRIDE_BYTES,
          layout: {
            arrayStride: MATRIX_STRIDE_BYTES,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 4, offset: 0, format: 'float32x4' },
              { shaderLocation: 5, offset: 16, format: 'float32x4' },
              { shaderLocation: 6, offset: 32, format: 'float32x4' },
              { shaderLocation: 7, offset: 48, format: 'float32x4' },
            ],
          } as GPUVertexBufferLayout,
        },
        {
          buffer: customBuffer,
          offset: startIndex * CUSTOM_STRIDE_BYTES,
          layout: {
            arrayStride: CUSTOM_STRIDE_BYTES,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 8, offset: 0, format: 'float32x4' },
              { shaderLocation: 9, offset: 16, format: 'float32x4' },
              { shaderLocation: 10, offset: 32, format: 'float32' },
            ],
          } as GPUVertexBufferLayout,
        },
      ];

      for (const mesh of bucket.instancedMeshes) {
        if (!mesh.drawSource || mesh.drawSource.mode !== 'gpuExternal') {
          continue;
        }
        mesh.drawSource.instanceCount = count;
        mesh.drawSource.instanceBuffers = instanceBuffers;
        if (mesh.drawSource.worldBounds) {
          mesh.drawSource.worldBounds.center = [0, loadedAsset.modelBaseY * 0.5, 0];
          mesh.drawSource.worldBounds.radius = FLOOR_HALF_SIZE * 1.8;
        }
      }
    }

    const floorMaterial = createDefaultMaterial({
      name: 'crowd-floor',
      baseColor: [0.085882, 0.18451, 0.106471, 1],
      roughness: 0.96,
      metallic: 0.04,
      castsShadows: false,
      receivesShadows: true,
    });

    const directionalLightDirection = directionFromAnglesDeg(
      runtimeOptions.directionalLightAzimuthDeg,
      runtimeOptions.directionalLightElevationDeg,
    );

    const scene: RenderScene = {
      meshes: [
        {
          geometry: createCircle({ radius: GROUND_RADIUS, radialSegments: 80, ringSegments: 10 }),
          material: floorMaterial,
          transform: mat4Identity(),
        },
      ],
      instancedMeshes: loadedAsset.instancedMeshes,
      textureLibrary: loadedAsset.textureLibrary,
      directionalLightingEnabled: true,
      directionalLightingIntensity: runtimeOptions.directionalLightIntensity,
      keyLightDirection: directionalLightDirection,
      keyLightSourceSize: runtimeOptions.directionalLightSourceSize,
      lights: [
        {
          id: 1,
          type: 'directional',
          direction: [
            -directionalLightDirection[0],
            -directionalLightDirection[1],
            -directionalLightDirection[2],
          ],
          color: [1.0, 0.97, 0.94],
          intensity: runtimeOptions.directionalLightIntensity,
          castsShadows: true,
          shadowIndex: 0,
        },
      ],
    };

    return {
      device,
      computePipeline,
      bindGroups: [bindGroupA, bindGroupB],
      uniformBuffer,
      stateBuffers: [stateBufferA, stateBufferB],
      matrixBuffer,
      customBuffer,
      pingIndex: 0,
      scene,
      options: runtimeOptions,
    };
  };

  const initialize = (hookContext: RendererFrameHookContext): void => {
    if (crowdState || disposed) {
      return;
    }
    if (hookContext.backend !== 'webgpu' || !hookContext.device) {
      return;
    }
    if (!crowdAsset) {
      return;
    }

    crowdState = createGpuState(hookContext.device, crowdAsset, options);
    applyScene(crowdState.scene);
  };

  const stepSimulation = (
    encoder: GPUCommandEncoder,
    deltaTimeMs: number,
    timeSeconds: number,
  ): void => {
    if (!crowdState || disposed || !crowdAsset) {
      return;
    }

    const clampedDeltaSeconds = Math.min(0.033, Math.max(0.001, deltaTimeMs / 1000));
    const runtimeOptions = crowdState.options;
    const uniformData = new Float32Array([
      clampedDeltaSeconds,
      timeSeconds,
      runtimeOptions.bodyCount,
      FLOOR_HALF_SIZE,
      runtimeOptions.collisionRadius,
      runtimeOptions.turnRate,
      crowdAsset.modelBaseY,
      BASE_MODEL_SCALE,
      0.45,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ]);
    crowdState.device.queue.writeBuffer(crowdState.uniformBuffer, 0, uniformData);

    const computePass = encoder.beginComputePass();
    computePass.setPipeline(crowdState.computePipeline);
    computePass.setBindGroup(0, crowdState.bindGroups[crowdState.pingIndex]);
    computePass.dispatchWorkgroups(Math.ceil(runtimeOptions.bodyCount / WORKGROUP_SIZE));
    computePass.end();

    crowdState.pingIndex = crowdState.pingIndex === 0 ? 1 : 0;

    for (const bucket of crowdAsset.buckets) {
      bucket.source.controller.setPlaybackSpeed(bucket.playbackSpeed);
      bucket.source.controller.update(clampedDeltaSeconds);
      bakeSourceTransformsIntoGeometry(bucket.source);
    }
  };

  const engineOptions: RendererEngineOptions = {
    frameHooks: {
      beforeFrame: (hookContext) => {
        initialize(hookContext);
        if (crowdAssetError) {
          console.warn('Crowd example failed to load Cesium Man.', crowdAssetError);
          crowdAssetError = null;
        }
      },
      onError: (_phase, error) => {
        console.warn('Crowd example frame hook error.', error);
      },
    },
    webGpuStages: [
      {
        name: 'crowd-simulation',
        injectionPoint: 'pre-scene',
        reads: [
          { name: 'frame-time-seconds', kind: 'number' },
          { name: 'frame-delta-ms', kind: 'number' },
        ],
        execute: (stageContext) => {
          stepSimulation(stageContext.encoder, stageContext.deltaTimeMs, stageContext.timeSeconds);
        },
      },
      {
        name: 'crowd-cel-shading',
        injectionPoint: 'pre-composite',
        reads: [
          { name: 'motion-blur', kind: 'texture-handle' },
          { name: 'dof', kind: 'texture-handle' },
          { name: 'scene-normal', kind: 'texture-handle' },
          { name: 'scene-material', kind: 'texture-handle' },
        ],
        writes: [
          { name: 'dof', kind: 'texture-handle' },
          { name: 'motion-blur', kind: 'texture-handle' },
        ],
        execute: (stageContext) => {
          if (!options.celShadingEnabled || stageContext.width <= 0 || stageContext.height <= 0) {
            return;
          }
          const sourceColor = stageContext.resources.get<StageTextureHandle>('motion-blur');
          const sourceDof = stageContext.resources.get<StageTextureHandle>('dof');
          const sourceNormal = stageContext.resources.get<StageTextureHandle>('scene-normal');
          const sourceMaterial = stageContext.resources.get<StageTextureHandle>('scene-material');
          if (!sourceColor || !sourceDof || !sourceNormal || !sourceMaterial) {
            return;
          }
          if (!crowdCelShadingState) {
            crowdCelShadingState = createCrowdCelShadingState(stageContext.device, sourceColor.format);
          }

          const celOutput = ensureCrowdCelOutput(
            crowdCelShadingState,
            stageContext.device,
            stageContext.width,
            stageContext.height,
          );
          const bindGroup = stageContext.device.createBindGroup({
            layout: crowdCelShadingState.pipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: crowdCelShadingState.sampler },
              { binding: 1, resource: sourceColor.view },
              { binding: 2, resource: sourceNormal.view },
              { binding: 3, resource: sourceMaterial.view },
              { binding: 4, resource: { buffer: crowdCelShadingState.uniformBuffer } },
            ],
          });
          const celUniformData = new Float32Array([
            options.celBandCount,
            options.celEdgeStrength,
            options.celOutlineDarkness,
            0,
          ]);
          stageContext.device.queue.writeBuffer(crowdCelShadingState.uniformBuffer, 0, celUniformData);
          const pass = stageContext.encoder.beginRenderPass({
            colorAttachments: [
              {
                view: celOutput.view,
                loadOp: 'clear',
                storeOp: 'store',
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
              },
            ],
          });
          pass.setPipeline(crowdCelShadingState.pipeline);
          pass.setBindGroup(0, bindGroup);
          pass.draw(3);
          pass.end();

          stageContext.encoder.copyTextureToTexture(
            { texture: celOutput.texture },
            { texture: sourceColor.texture },
            {
              width: stageContext.width,
              height: stageContext.height,
              depthOrArrayLayers: 1,
            },
          );
          stageContext.encoder.copyTextureToTexture(
            { texture: celOutput.texture },
            { texture: sourceDof.texture },
            {
              width: stageContext.width,
              height: stageContext.height,
              depthOrArrayLayers: 1,
            },
          );

          // Keep resource aliases aligned for downstream custom stages.
          stageContext.resources.set('dof', celOutput);
          stageContext.resources.set('motion-blur', celOutput);
        },
      },
    ],
    webGpuStageFailurePolicy: 'skip-stage',
    webGpuStageCpuBudgetMs: 33.0,
    webGpuWarnOnExternalLayoutMismatch: true,
  };

  return {
    engineOptions,
    setOptions: (nextOptions: CrowdExampleOptions) => {
      options = sanitizeCrowdOptions(nextOptions);
      if (!crowdState || !crowdAsset) {
        return;
      }

      const bodyCountChanged = options.bodyCount !== crowdState.options.bodyCount;
      if (bodyCountChanged) {
        const previousState = crowdState;
        crowdState = createGpuState(previousState.device, crowdAsset, options);
        applyScene(crowdState.scene);
        destroyState(previousState);
        return;
      }

      crowdState.options = options;
      applyDirectionalLight(crowdState.scene, options);
      applyScene(crowdState.scene);
    },
    dispose: () => {
      disposed = true;
      void crowdAssetPromise.finally(() => {
        if (!crowdAsset) {
          return;
        }
        for (const bucket of crowdAsset.buckets) {
          bucket.source.dispose();
        }
      });
      if (!crowdState) {
        destroyCelShadingState();
        return;
      }
      destroyState(crowdState);
      crowdState = null;
      destroyCelShadingState();
    },
  };
};
