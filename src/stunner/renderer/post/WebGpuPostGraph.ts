import type { RendererConfig } from '../config/RendererConfig';
import { Camera } from '../../camera/Camera';
import { FrameResourceStore } from '../graph/FrameResourceStore';
import type { RenderPassTimingResult } from '../graph/RenderGraphTypes';
import type { PbrMaterial } from '../mesh/MaterialTypes';
import type {
  RenderScene,
  SceneExternalInstanceBufferBinding,
  SceneInstancedDrawSource,
  SceneInstancedMesh,
  SceneMeshInstance,
} from '../mesh/SceneTypes';
import { mat4Identity } from '../mesh/SceneTypes';
import { VERTEX_STRIDE_BYTES, type MeshGeometry } from '../mesh/MeshTypes';

type TextureHandle = {
  texture: GPUTexture;
  view: GPUTextureView;
  format: GPUTextureFormat;
};

type GpuMesh = {
  vertexBuffer: GPUBuffer;
  vertexBufferSize: number;
  indexBuffer: GPUBuffer;
  indexBufferSize: number;
  indexCount: number;
  geometryVersion: number;
  materialBuffer: GPUBuffer;
  transformBuffer: GPUBuffer;
  meshBindGroup: GPUBindGroup;
  worldTransform: Float32Array;
  boundsCenter: [number, number, number];
  boundsExtents: [number, number, number];
  boundsRadius: number;
  transparent: boolean;
  castsShadows: boolean;
  receivesShadows: boolean;
  shadowBindGroup: GPUBindGroup;
};

type LoadedTexture = {
  texture: GPUTexture;
  view: GPUTextureView;
};

type GpuInstancedMesh = {
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  indexCount: number;
  instanceBuffer: GPUBuffer;
  instanceCapacity: number;
  instanceCount: number;
  drawSourceMode: 'cpuPacked' | 'gpuExternal';
  externalInstanceBuffers: SceneExternalInstanceBufferBinding[];
  externalPipelineSignature?: string;
  materialBuffer: GPUBuffer;
  instancedMaterialTableBuffer: GPUBuffer;
  instancedMaterialCount: number;
  baseColorArrayId?: string;
  baseColorView: GPUTextureView;
  normalView: GPUTextureView;
  ormView: GPUTextureView;
  emissiveView: GPUTextureView;
  meshBindGroup: GPUBindGroup;
  castsShadows: boolean;
  localBoundsCenter: [number, number, number];
  localBoundsRadius: number;
  worldBoundsCenter: [number, number, number];
  worldBoundsRadius: number;
};

export type WebGpuPostGraphShaderId =
  | 'sky'
  | 'scene'
  | 'sceneInstanced'
  | 'ambientOcclusion'
  | 'bloomPrefilter'
  | 'bloomBlurHorizontal'
  | 'bloomBlurVertical'
  | 'depthOfFieldPrefilter'
  | 'depthOfFieldBlurHorizontal'
  | 'depthOfFieldBlurVerticalCombine'
  | 'screenSpaceReflections'
  | 'motionBlur'
  | 'composite';

export type WebGpuPostGraphShaderOverrides = Partial<Record<WebGpuPostGraphShaderId, string>>;

export type WebGpuStageInjectionPoint = 'pre-scene' | 'pre-post' | 'pre-composite';

export type WebGpuStageFailurePolicy = 'fail-fast' | 'skip-stage';

export type WebGpuStageResourceKind =
  | 'buffer'
  | 'texture-handle'
  | 'texture-view'
  | 'sampler'
  | 'number'
  | 'boolean'
  | 'string'
  | 'object';

export type WebGpuStageResourceContract = {
  name: string;
  kind?: WebGpuStageResourceKind;
  required?: boolean;
};

export type WebGpuStageContext = {
  device: GPUDevice;
  encoder: GPUCommandEncoder;
  config: RendererConfig;
  frameIndex: number;
  timeSeconds: number;
  deltaTimeMs: number;
  width: number;
  height: number;
  resources: FrameResourceStore;
};

export type WebGpuStage = {
  name: string;
  injectionPoint: WebGpuStageInjectionPoint;
  order?: number;
  enabled?: (config: RendererConfig) => boolean;
  reads?: WebGpuStageResourceContract[];
  writes?: WebGpuStageResourceContract[];
  execute: (context: WebGpuStageContext) => void;
};

type RegisteredWebGpuStage = WebGpuStage & {
  registrationIndex: number;
};

type WebGpuPostGraphOptions = {
  shaderOverrides?: WebGpuPostGraphShaderOverrides;
  stages?: WebGpuStage[];
  stageFailurePolicy?: WebGpuStageFailurePolicy;
  stageCpuBudgetMs?: number;
  warnOnExternalLayoutMismatch?: boolean;
};

const POST_UNIFORM_FLOAT_COUNT = 44;
const SCENE_UNIFORM_FLOAT_COUNT = 44;
const MAX_SHADOW_CASTERS = 256;
const SHADOW_CASTER_FLOAT_COUNT = MAX_SHADOW_CASTERS * 4;
const MAX_DYNAMIC_POINT_LIGHTS = 256;
const POINT_LIGHT_FLOAT_COUNT = (1 + MAX_DYNAMIC_POINT_LIGHTS * 3) * 4;
const CLUSTER_UNIFORM_FLOAT_COUNT = 8;
const MAX_SAFE_CLUSTER_COUNT = 131072;
const MAX_SHARED_CLUSTER_LIGHTS = MAX_DYNAMIC_POINT_LIGHTS;
const MATERIAL_UNIFORM_FLOAT_COUNT = 20;
const TRANSFORM_UNIFORM_FLOAT_COUNT = 16;
const SHADOW_MAP_UNIFORM_FLOAT_COUNT = 24;
const INSTANCE_TRANSFORM_FLOAT_COUNT = 16;
const INSTANCE_CUSTOM_FLOAT_COUNT = 4;
const INSTANCE_CUSTOM_SLOT_COUNT = 2;
const INSTANCE_MATERIAL_INDEX_FLOAT_COUNT = 1;
const INSTANCE_STRIDE_FLOAT_COUNT =
  INSTANCE_TRANSFORM_FLOAT_COUNT +
  INSTANCE_CUSTOM_FLOAT_COUNT * INSTANCE_CUSTOM_SLOT_COUNT +
  INSTANCE_MATERIAL_INDEX_FLOAT_COUNT;
const INSTANCED_MATERIAL_RECORD_FLOAT_COUNT = 20;

const SCENE_UNIFORMS_WGSL = /* wgsl */ `
struct FrameUniforms {
  time: f32, width: f32, height: f32, _pad0: f32,
  cameraPosition: vec3f, _pad1: f32,
  cameraForward: vec3f, _pad2: f32,
  cameraRight: vec3f, _pad3: f32,
  cameraUp: vec3f, _pad4: f32,
  cameraFovY: f32, cameraNear: f32, cameraFar: f32, shadowsEnabled: f32,
  fogEnabled: f32, fogDensity: f32, fogStartDistance: f32, fogEndDistance: f32,
  fogColor: vec3f, fogHeightFalloff: f32,
  keyLightDir: vec3f, directionalLightingEnabled: f32,
  shadowReceiverHeight: f32, shadowReceiverBand: f32, pointShadowStrength: f32, pointShadowSoftness: f32,
  spotShadowSoftness: f32, areaShadowSoftness: f32, _pad6: f32, _pad7: f32,
}
@group(0) @binding(0) var<uniform> frame: FrameUniforms;
`;

const POST_UNIFORMS_WGSL = /* wgsl */ `
struct FrameUniforms {
  time: f32, width: f32, height: f32, bloomIntensity: f32,
  bloomThreshold: f32, bloomKnee: f32, dofFocusDistance: f32, dofFocusRange: f32,
  dofAperture: f32, dofMaxCoc: f32, _padDof0: f32, exposure: f32,
  contrast: f32, saturation: f32, temperature: f32, tint: f32,
  aoEnabled: f32, _padA: f32, _padB: f32, _padC: f32,
  bloomEnabled: f32, dofEnabled: f32, _padDof1: f32, debugView: f32,
  motionBlurEnabled: f32, motionBlurStrength: f32, motionBlurShutterScale: f32, motionBlurSamples: f32,
  motionDeltaRight: f32, motionDeltaUp: f32, motionDeltaForward: f32, _pad7: f32,
  clusterTileX: f32, clusterTileY: f32, shadowsEnabled: f32, colorGradingEnabled: f32,
  ssrEnabled: f32, ssrMaxSteps: f32, ssrMaxDistance: f32, ssrThickness: f32,
  ssrStride: f32, ssrResolve: f32, ssrRoughnessCutoff: f32, _padSsr0: f32,
}
@group(0) @binding(0) var<uniform> frame: FrameUniforms;
`;

const FULLSCREEN_VS_WGSL = /* wgsl */ `
struct VsOut { @builtin(position) position: vec4f, @location(0) uv: vec2f, }
@vertex fn vsMain(@builtin(vertex_index) vi: u32) -> VsOut {
  var p = array<vec2f, 3>(vec2f(-1, -3), vec2f(3, 1), vec2f(-1, 1));
  var o: VsOut;
  o.position = vec4f(p[vi], 0, 1);
  o.uv = p[vi] * 0.5 + vec2f(0.5);
  return o;
}
`;

const SKY_SHADER = /* wgsl */ `
${SCENE_UNIFORMS_WGSL}
struct SkyOut {
  @location(0) hdr: vec4f,
  @location(1) normal: vec4f,
  @location(2) material: vec4f,
}
struct VsOut { @builtin(position) position: vec4f, @location(0) uv: vec2f, }
@vertex fn vsMain(@builtin(vertex_index) vi: u32) -> VsOut {
  var p = array<vec2f, 3>(vec2f(-1, -3), vec2f(3, 1), vec2f(-1, 1));
  var o: VsOut;
  o.position = vec4f(p[vi], 0.9999, 1);
  o.uv = p[vi] * 0.5 + vec2f(0.5);
  return o;
}
@fragment fn fsMain(in: VsOut) -> SkyOut {
  let ndc = in.uv * 2.0 - vec2f(1.0);
  let aspect = max(1.0, frame.width) / max(1.0, frame.height);
  let tanFov = tan(frame.cameraFovY * 0.5);
  let rayDir = normalize(
    frame.cameraForward +
    frame.cameraRight * (ndc.x * aspect * tanFov) +
    frame.cameraUp * (ndc.y * tanFov)
  );
  let origin = frame.cameraPosition;
  let horizon = clamp(rayDir.y * 0.5 + 0.5, 0.0, 1.0);
  var sky = mix(vec3f(0.03, 0.05, 0.09), vec3f(0.12, 0.18, 0.28), horizon);
  let cp = rayDir.x * 5.5 + rayDir.z * 4.5 + origin.x * 0.22 + origin.z * 0.17 + frame.time * 0.08;
  let cloud = sin(cp) * 0.5 + 0.5;
  sky = sky + vec3f(cloud * 0.025, cloud * 0.018, cloud * 0.012);
  if (frame.fogEnabled > 0.5) {
    sky = mix(sky, frame.fogColor, clamp((1.0 - horizon) * 0.35, 0.0, 1.0));
  }
  var o: SkyOut;
  o.hdr = vec4f(sky, 1);
  o.normal = vec4f(0.5, 0.5, 1, 1);
  o.material = vec4f(0, 1, 0, 1);
  return o;
}
`;

const SCENE_SHADER = /* wgsl */ `
${SCENE_UNIFORMS_WGSL}
struct ShadowCasterUniforms {
  casters: array<vec4f, ${MAX_SHADOW_CASTERS}>,
}
@group(0) @binding(1) var<uniform> shadowCasters: ShadowCasterUniforms;

struct PointLightUniforms {
  data: array<vec4f, ${1 + MAX_DYNAMIC_POINT_LIGHTS * 3}>,
}
@group(0) @binding(2) var<uniform> pointLights: PointLightUniforms;

struct ClusterUniforms {
  params0: vec4f,
  params1: vec4f,
}
@group(0) @binding(3) var<uniform> clusterInfo: ClusterUniforms;

struct ClusterRecordBuffer {
  records: array<vec2u>,
}
@group(0) @binding(4) var<storage, read> clusterRecords: ClusterRecordBuffer;

struct ClusterLightIndexBuffer {
  indices: array<u32>,
}
@group(0) @binding(5) var<storage, read> clusterLightIndices: ClusterLightIndexBuffer;

struct ShadowMapUniforms {
  rightMinX: vec4f,
  upMinY: vec4f,
  forwardNear: vec4f,
  originMaxX: vec4f,
  maxYFarModeStrength: vec4f,
  params: vec4f,
}
@group(0) @binding(6) var<uniform> shadowMap: ShadowMapUniforms;
@group(0) @binding(7) var shadowMapTexture: texture_depth_2d;

struct MaterialUniforms {
  baseColor: vec4f,
  uvScaleOffset: vec4f,
  emissive: vec3f, emissiveIntensity: f32,
  metallic: f32, roughness: f32, twoSided: f32, transparent: f32,
  shadowFlags: vec4f,
}
struct TransformUniforms { model: mat4x4f, }
@group(1) @binding(0) var<uniform> material: MaterialUniforms;
@group(1) @binding(1) var<uniform> transform: TransformUniforms;
@group(1) @binding(2) var baseColorTex: texture_2d<f32>;
@group(1) @binding(3) var baseColorSamp: sampler;
@group(1) @binding(4) var normalTex: texture_2d<f32>;
@group(1) @binding(5) var ormTex: texture_2d<f32>;
@group(1) @binding(6) var emissiveTex: texture_2d<f32>;

struct VsOut {
  @builtin(position) clipPos: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) worldNormal: vec3f,
  @location(2) uv: vec2f,
  @location(3) worldTangent: vec3f,
  @location(4) tangentSign: f32,
}
@vertex fn vsMain(
  @location(0) pos: vec3f, @location(1) norm: vec3f,
  @location(2) uv: vec2f,  @location(3) tangent: vec4f,
) -> VsOut {
  let wp4 = transform.model * vec4f(pos, 1.0);
  let wp = wp4.xyz;
  let m = transform.model;
  let wn = normalize((m * vec4f(norm, 0.0)).xyz);
  let wt = normalize((m * vec4f(tangent.xyz, 0.0)).xyz);

  let r = frame.cameraRight;
  let u = frame.cameraUp;
  let f = frame.cameraForward;
  let e = frame.cameraPosition;
  let vx = vec4f(r.x, u.x, -f.x, 0);
  let vy = vec4f(r.y, u.y, -f.y, 0);
  let vz = vec4f(r.z, u.z, -f.z, 0);
  let vw = vec4f(-dot(r, e), -dot(u, e), dot(f, e), 1);
  let view = mat4x4f(vx, vy, vz, vw);
  let vp4 = view * wp4;

  let near = frame.cameraNear; let far = frame.cameraFar;
  let fv = 1.0 / tan(frame.cameraFovY * 0.5);
  let aspect = max(1.0, frame.width) / max(1.0, frame.height);
  let rInv = 1.0 / (near - far);
  let clip = vec4f(vp4.x * fv / aspect, vp4.y * fv, vp4.z * far * rInv + far * near * rInv, -vp4.z);

  var o: VsOut;
  o.clipPos = clip;
  o.worldPos = wp;
  o.worldNormal = wn;
  o.uv = uv;
  o.worldTangent = wt;
  o.tangentSign = tangent.w;
  return o;
}

const PI: f32 = 3.14159265;
fn dGGX(NdotH: f32, r: f32) -> f32 {
  let a2 = r * r * r * r;
  let d = NdotH * NdotH * (a2 - 1) + 1;
  return a2 / (PI * d * d);
}
fn gSchlick(NdotV: f32, r: f32) -> f32 {
  let k = (r + 1) * (r + 1) / 8;
  return NdotV / (NdotV * (1 - k) + k);
}
fn gSmith(ndv: f32, ndl: f32, r: f32) -> f32 {
  return gSchlick(ndv, r) * gSchlick(ndl, r);
}
fn fSchlick(cos: f32, f0: vec3f) -> vec3f {
  return f0 + (vec3f(1) - f0) * pow(clamp(1 - cos, 0, 1), 5);
}
fn evalPBR(alb: vec3f, met: f32, rou: f32, N: vec3f, V: vec3f, L: vec3f, lc: vec3f) -> vec3f {
  let H = normalize(V + L);
  let ndl = max(dot(N, L), 0);
  let ndv = max(dot(N, V), 0.001);
  let ndh = max(dot(N, H), 0);
  let vdh = max(dot(V, H), 0);
  let f0 = mix(vec3f(0.04), alb, met);
  let F = fSchlick(vdh, f0);
  let D = dGGX(ndh, rou);
  let G = gSmith(ndv, ndl, rou);
  let spec = (D * G * F) / max(4 * ndv * ndl, 0.001);
  let kD = (vec3f(1) - F) * (1 - met);
  return (kD * alb / PI + spec) * lc * ndl;
}

fn sampleEnvironment(rayDir: vec3f, origin: vec3f, keyDir: vec3f, sunStrength: f32) -> vec3f {
  let horizon = clamp(rayDir.y * 0.5 + 0.5, 0.0, 1.0);
  var sky = mix(vec3f(0.03, 0.05, 0.09), vec3f(0.12, 0.18, 0.28), horizon);
  let cp = rayDir.x * 5.5 + rayDir.z * 4.5 + origin.x * 0.22 + origin.z * 0.17 + frame.time * 0.08;
  let cloud = sin(cp) * 0.5 + 0.5;
  sky = sky + vec3f(cloud * 0.025, cloud * 0.018, cloud * 0.012);

  let ground = mix(vec3f(0.02, 0.022, 0.024), vec3f(0.08, 0.085, 0.09), clamp(-rayDir.y * 0.9, 0.0, 1.0));
  var env = mix(ground, sky, smoothstep(-0.08, 0.04, rayDir.y));

  let sunAmount = pow(max(dot(rayDir, keyDir), 0.0), 220.0);
  env = env + vec3f(1.2, 1.05, 0.9) * sunAmount * 1.3 * max(0.0, sunStrength);

  if (frame.fogEnabled > 0.5) {
    env = mix(env, frame.fogColor, clamp((1.0 - horizon) * 0.25, 0.0, 1.0));
  }
  return env;
}

fn computeShadowMapVisibility(worldPos: vec3f) -> f32 {
  let rel = worldPos - shadowMap.originMaxX.xyz;
  let lx = dot(rel, shadowMap.rightMinX.xyz);
  let ly = dot(rel, shadowMap.upMinY.xyz);
  let lz = dot(rel, shadowMap.forwardNear.xyz);
  let minX = shadowMap.rightMinX.w;
  let minY = shadowMap.upMinY.w;
  let nearZ = shadowMap.forwardNear.w;
  let maxX = shadowMap.originMaxX.w;
  let maxY = shadowMap.maxYFarModeStrength.x;
  let farZ = shadowMap.maxYFarModeStrength.y;
  let extentX = max(0.0001, maxX - minX);
  let extentY = max(0.0001, maxY - minY);
  let extentZ = max(0.0001, farZ - nearZ);
  let u = clamp((lx - minX) / extentX, 0.0, 1.0);
  let v = clamp((ly - minY) / extentY, 0.0, 1.0);
  let depth = clamp((lz - nearZ) / extentZ, 0.0, 1.0);
  let bias = max(0.0, shadowMap.params.x);
  let softness = max(0.0, shadowMap.params.y);
  let dims = textureDimensions(shadowMapTexture);
  let dimX = max(1, i32(dims.x));
  let dimY = max(1, i32(dims.y));
  let baseX = clamp(i32(floor(u * f32(dimX))), 0, dimX - 1);
  let baseY = clamp(i32(floor(v * f32(dimY))), 0, dimY - 1);
  let offsetRadius = i32(round(clamp(softness, 0.0, 4.0)));
  let sx0 = clamp(baseX - offsetRadius, 0, dimX - 1);
  let sx1 = baseX;
  let sx2 = clamp(baseX + offsetRadius, 0, dimX - 1);
  let sy0 = clamp(baseY - offsetRadius, 0, dimY - 1);
  let sy1 = baseY;
  let sy2 = clamp(baseY + offsetRadius, 0, dimY - 1);
  let threshold = depth - bias;
  var visibility = 0.0;
  visibility += select(0.0, 1.0, textureLoad(shadowMapTexture, vec2i(sx0, sy0), 0) >= threshold);
  visibility += select(0.0, 1.0, textureLoad(shadowMapTexture, vec2i(sx1, sy0), 0) >= threshold);
  visibility += select(0.0, 1.0, textureLoad(shadowMapTexture, vec2i(sx2, sy0), 0) >= threshold);
  visibility += select(0.0, 1.0, textureLoad(shadowMapTexture, vec2i(sx0, sy1), 0) >= threshold);
  visibility += select(0.0, 1.0, textureLoad(shadowMapTexture, vec2i(sx1, sy1), 0) >= threshold);
  visibility += select(0.0, 1.0, textureLoad(shadowMapTexture, vec2i(sx2, sy1), 0) >= threshold);
  visibility += select(0.0, 1.0, textureLoad(shadowMapTexture, vec2i(sx0, sy2), 0) >= threshold);
  visibility += select(0.0, 1.0, textureLoad(shadowMapTexture, vec2i(sx1, sy2), 0) >= threshold);
  visibility += select(0.0, 1.0, textureLoad(shadowMapTexture, vec2i(sx2, sy2), 0) >= threshold);
  return visibility / 9.0;
}

struct SceneOut {
  @location(0) hdr: vec4f, @location(1) normal: vec4f, @location(2) matBuf: vec4f,
}
@fragment fn fsMain(in: VsOut, @builtin(front_facing) ff: bool) -> SceneOut {
  var N = normalize(in.worldNormal);
  if (material.twoSided > 0.5 && !ff) {
    N = -N;
  }
  let rawTangent = normalize(in.worldTangent);
  let tangent = normalize(rawTangent - N * dot(rawTangent, N));
  let bitangent = normalize(cross(N, tangent) * in.tangentSign);
  let sampledNormal = textureSample(normalTex, baseColorSamp, in.uv).xyz * 2.0 - vec3f(1.0);
  N = normalize(tangent * sampledNormal.x + bitangent * sampledNormal.y + N * sampledNormal.z);

  let V = normalize(frame.cameraPosition - in.worldPos);
  let textureUv = in.uv * material.uvScaleOffset.xy + material.uvScaleOffset.zw;
  let baseSample = textureSample(baseColorTex, baseColorSamp, textureUv);
  let ormSample = textureSample(ormTex, baseColorSamp, textureUv).rgb;
  let emissiveSample = textureSample(emissiveTex, baseColorSamp, textureUv).rgb;
  let alb = material.baseColor.rgb * baseSample.rgb;
  let alpha = material.baseColor.a * baseSample.a;
  let ao = clamp(ormSample.r, 0.0, 1.0);
  let met = clamp(material.metallic * ormSample.b, 0.0, 1.0);
  let rou = max(material.roughness * ormSample.g, 0.04);

  let directionalLightingScale = max(0.0, frame.directionalLightingEnabled);
  let kd = normalize(frame.keyLightDir);
  let fd = normalize(vec3f(0.2,0.7,0.35));
  var rad = vec3f(0);
  rad += evalPBR(alb, met, rou, N, V, kd, vec3f(1.20,1.14,1.05) * directionalLightingScale);
  rad += evalPBR(alb, met, rou, N, V, fd, vec3f(0.35,0.38,0.45) * directionalLightingScale);

  let clustersX = max(1, i32(clusterInfo.params0.x));
  let clustersY = max(1, i32(clusterInfo.params0.y));
  let clustersZ = max(1, i32(clusterInfo.params0.z));
  let maxLightsPerCluster = max(1, i32(clusterInfo.params0.w));
  let tileSizeX = max(1.0, clusterInfo.params1.z);
  let tileSizeY = max(1.0, clusterInfo.params1.w);
  let clusterX = clamp(i32(in.clipPos.x / tileSizeX), 0, clustersX - 1);
  let clusterY = clamp(i32(in.clipPos.y / tileSizeY), 0, clustersY - 1);
  let clusterNear = max(0.0001, clusterInfo.params1.x);
  let clusterFar = max(clusterNear + 0.0001, clusterInfo.params1.y);
  let forwardDepth = clamp(dot(in.worldPos - frame.cameraPosition, frame.cameraForward), clusterNear, clusterFar);
  let linearNormalized = (forwardDepth - clusterNear) / max(0.0001, clusterFar - clusterNear);
  let logNormalized = (log(forwardDepth) - log(clusterNear)) / max(0.0001, log(clusterFar) - log(clusterNear));
  let hybridDepth = linearNormalized * 0.25 + logNormalized * 0.75;
  let clusterZ = clamp(i32(floor(hybridDepth * f32(clustersZ))), 0, clustersZ - 1);
  let clusterIndex = clusterX + clusterY * clustersX + clusterZ * clustersX * clustersY;
  let clusterRecord = clusterRecords.records[u32(clusterIndex)];
  let clusterOffset = i32(clusterRecord.x);
  let clusterLightCount = min(i32(clusterRecord.y), maxLightsPerCluster);
  let pointLightCount = i32(clamp(pointLights.data[0].x, 0.0, f32(${MAX_DYNAMIC_POINT_LIGHTS})));
  for (var ci = 0; ci < ${MAX_DYNAMIC_POINT_LIGHTS}; ci = ci + 1) {
    if (ci >= clusterLightCount) {
      break;
    }
    let lightIndex = i32(clusterLightIndices.indices[u32(clusterOffset + ci)]);
    if (lightIndex < 0 || lightIndex >= pointLightCount) {
      continue;
    }
    let posRange = pointLights.data[lightIndex * 3 + 1];
    let colorIntensity = pointLights.data[lightIndex * 3 + 2];
    let lightParams = pointLights.data[lightIndex * 3 + 3];
    let toLight = posRange.xyz - in.worldPos;
    let distanceToLight = length(toLight);
    let packedRange = posRange.w;
    let pointLightCastsShadows = packedRange > 0.0;
    let range = max(0.001, abs(packedRange));
    if (distanceToLight >= range) {
      continue;
    }
    let L = toLight / max(0.0001, distanceToLight);
    let normalizedDistance = distanceToLight / range;
    let falloff = clamp(1.0 - normalizedDistance, 0.0, 1.0);
    let attenuationCore = (falloff * falloff) / (0.35 + normalizedDistance * normalizedDistance * 2.2);
    let attenuationEdgeSoftness = clamp(lightParams.x, 0.1, 0.95);
    let edgeSoftness = 1.0 - smoothstep(attenuationEdgeSoftness, 1.0, normalizedDistance);
    let attenuation = attenuationCore * edgeSoftness;
    var lightRadiance = colorIntensity.xyz * max(0.0, colorIntensity.w) * attenuation * 2.2;
    if (frame.shadowsEnabled > 0.5 && material.shadowFlags.x > 0.5 && pointLightCastsShadows) {
      var pointShadowOcclusion = 0.0;
      for (var si = 0; si < ${MAX_SHADOW_CASTERS}; si = si + 1) {
        let caster = shadowCasters.casters[si];
        let radius = caster.w;
        if (radius <= 0.0001) {
          continue;
        }
        let toCaster = caster.xyz - in.worldPos;
        let projection = dot(toCaster, L);
        if (projection <= 0.0 || projection >= distanceToLight) {
          continue;
        }
        let closest = toCaster - L * projection;
        let distanceSq = dot(closest, closest);
        let radiusSq = radius * radius;
        if (distanceSq < radiusSq) {
          let blocker = 1.0 - smoothstep(0.0, radiusSq, distanceSq);
          pointShadowOcclusion = max(pointShadowOcclusion, blocker);
        }
      }
      let pointShadowStrength = clamp(frame.pointShadowStrength, 0.0, 2.5);
      let pointShadowVisibility = 1.0 - clamp(pointShadowOcclusion * pointShadowStrength, 0.0, 1.0);
      lightRadiance *= max(0.02, pointShadowVisibility);
    }
    rad += evalPBR(alb, met, rou, N, V, L, lightRadiance);
  }

  rad += alb * vec3f(0.05, 0.07, 0.11) * (1 - met) * ao;

  let R = reflect(-V, N);
  let f0 = mix(vec3f(0.04), alb, met);
  let envF = fSchlick(max(dot(N, V), 0.0), f0);
  let envSpec = sampleEnvironment(R, frame.cameraPosition, kd, directionalLightingScale);
  let envStrength = mix(0.25, 1.0, met) * (1.0 - rou * 0.85) * mix(0.5, 1.0, ao);
  rad += envSpec * envF * envStrength;

  rad += material.emissive * emissiveSample * material.emissiveIntensity;

  if (frame.shadowsEnabled > 0.5 && material.shadowFlags.x > 0.5 && directionalLightingScale > 0.001) {
    let shadowMode = shadowMap.maxYFarModeStrength.z;
    if (shadowMode > 0.5) {
      let shadowVisibility = computeShadowMapVisibility(in.worldPos);
      let shadowStrength = clamp(shadowMap.maxYFarModeStrength.w, 0.0, 1.0);
      rad *= max(0.2, mix(1.0, shadowVisibility, shadowStrength));
    } else {
    var shadowOcclusion = 0.0;
    for (var i = 0; i < ${MAX_SHADOW_CASTERS}; i = i + 1) {
      let caster = shadowCasters.casters[i];
      let radius = caster.w;
      if (radius <= 0.0001) {
        continue;
      }
      if (frame.shadowReceiverHeight > -900.0 && caster.y <= frame.shadowReceiverHeight + 0.02) {
        continue;
      }
      let toCaster = caster.xyz - in.worldPos;
      let t = dot(toCaster, kd);
      if (t <= 0.0) {
        continue;
      }
      let closest = toCaster - kd * t;
      let distanceSq = dot(closest, closest);
      let radiusSq = radius * radius;
      if (distanceSq < radiusSq) {
        let thickness = clamp((radiusSq - distanceSq) / max(radiusSq, 0.0001), 0.0, 1.0);
        let softness = smoothstep(0.0, radius * 2.5, t);
        shadowOcclusion = max(shadowOcclusion, thickness * softness);
      }
    }

    var receiverMask = 1.0;
    if (frame.shadowReceiverHeight > -900.0) {
      let receiverDistance = abs(in.worldPos.y - frame.shadowReceiverHeight);
      let band = max(0.01, frame.shadowReceiverBand);
      let onReceiver = 1.0 - smoothstep(band, band * 2.5, receiverDistance);
      let upFacing = smoothstep(0.25, 0.75, N.y);
      receiverMask = onReceiver * upFacing;
    }
    shadowOcclusion *= receiverMask;

    let ndl = clamp(dot(N, kd), 0.0, 1.0);
    let baseVisibility = mix(0.58, 1.0, smoothstep(0.05, 0.65, ndl));
    let occlusionVisibility = 1.0 - shadowOcclusion * 0.75;
    rad *= max(0.2, baseVisibility * occlusionVisibility);
    }
  }

  let dist = length(frame.cameraPosition - in.worldPos);
  if (frame.fogEnabled > 0.5) {
    let dr = max(0.001, frame.fogEndDistance - frame.fogStartDistance);
    let df = clamp((dist - frame.fogStartDistance)/dr, 0, 1);
    let dd = 1.0 - exp(-dist * max(0.0, frame.fogDensity));
    let hf = select(1.0, exp(-max(0.0, in.worldPos.y) * frame.fogHeightFalloff), frame.fogHeightFalloff > 0);
    rad = mix(rad, frame.fogColor, clamp(df * dd * hf, 0, 1));
  }

  let emi = dot(material.emissive * material.emissiveIntensity, vec3f(0.2126, 0.7152, 0.0722));
  let hi = clamp(emi + dot(rad, vec3f(0.2126, 0.7152, 0.0722)) * 0.1, 0, 1);
  let ld = clamp(dist / frame.cameraFar, 0, 1);

  var o: SceneOut;
  o.hdr = vec4f(rad, alpha);
  o.normal = vec4f(N * 0.5 + vec3f(0.5), 1);
  o.matBuf = vec4f(hi, ld, rou, met);
  return o;
}
`;

const SCENE_INSTANCED_SHADER = /* wgsl */ `
${SCENE_UNIFORMS_WGSL}
struct ShadowCasterUniforms {
  casters: array<vec4f, ${MAX_SHADOW_CASTERS}>,
}
@group(0) @binding(1) var<uniform> shadowCasters: ShadowCasterUniforms;

struct PointLightUniforms {
  data: array<vec4f, ${1 + MAX_DYNAMIC_POINT_LIGHTS * 3}>,
}
@group(0) @binding(2) var<uniform> pointLights: PointLightUniforms;

struct ClusterUniforms {
  params0: vec4f,
  params1: vec4f,
}
@group(0) @binding(3) var<uniform> clusterInfo: ClusterUniforms;

struct ClusterRecordBuffer {
  records: array<vec2u>,
}
@group(0) @binding(4) var<storage, read> clusterRecords: ClusterRecordBuffer;

struct ClusterLightIndexBuffer {
  indices: array<u32>,
}
@group(0) @binding(5) var<storage, read> clusterLightIndices: ClusterLightIndexBuffer;

struct ShadowMapUniforms {
  rightMinX: vec4f,
  upMinY: vec4f,
  forwardNear: vec4f,
  originMaxX: vec4f,
  maxYFarModeStrength: vec4f,
  params: vec4f,
}
@group(0) @binding(6) var<uniform> shadowMap: ShadowMapUniforms;
@group(0) @binding(7) var shadowMapTexture: texture_depth_2d;

struct MaterialUniforms {
  baseColor: vec4f,
  uvScaleOffset: vec4f,
  emissive: vec3f, emissiveIntensity: f32,
  metallic: f32, roughness: f32, twoSided: f32, transparent: f32,
  shadowFlags: vec4f,
}
struct InstancedMaterialRecord {
  baseColor: vec4f,
  uvScaleOffset: vec4f,
  emissive: vec4f,
  pbrFlags: vec4f,
  shadowFlags: vec4f,
}
struct InstancedMaterialTable {
  records: array<InstancedMaterialRecord>,
}
@group(1) @binding(0) var<uniform> material: MaterialUniforms;
@group(1) @binding(1) var baseColorTex: texture_2d_array<f32>;
@group(1) @binding(2) var baseColorSamp: sampler;
@group(1) @binding(3) var normalTex: texture_2d<f32>;
@group(1) @binding(4) var ormTex: texture_2d<f32>;
@group(1) @binding(5) var emissiveTex: texture_2d<f32>;
@group(1) @binding(6) var<storage, read> instancedMaterialTable: InstancedMaterialTable;

struct VsOut {
  @builtin(position) clipPos: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) worldNormal: vec3f,
  @location(2) uv: vec2f,
  @location(3) worldTangent: vec3f,
  @location(4) tangentSign: f32,
  @location(5) instanceCustom0: vec4f,
  @location(6) instanceCustom1: vec4f,
  @location(7) instanceMaterialIndex: f32,
}
@vertex fn vsMain(
  @location(0) pos: vec3f, @location(1) norm: vec3f,
  @location(2) uv: vec2f,  @location(3) tangent: vec4f,
  @location(4) model0: vec4f, @location(5) model1: vec4f,
  @location(6) model2: vec4f, @location(7) model3: vec4f,
  @location(8) instanceCustom0: vec4f,
  @location(9) instanceCustom1: vec4f,
  @location(10) instanceMaterialIndex: f32,
) -> VsOut {
  let model = mat4x4f(model0, model1, model2, model3);
  let wp4 = model * vec4f(pos, 1.0);
  let wp = wp4.xyz;
  let wn = normalize((model * vec4f(norm, 0.0)).xyz);
  let wt = normalize((model * vec4f(tangent.xyz, 0.0)).xyz);

  let r = frame.cameraRight;
  let u = frame.cameraUp;
  let f = frame.cameraForward;
  let e = frame.cameraPosition;
  let vx = vec4f(r.x, u.x, -f.x, 0);
  let vy = vec4f(r.y, u.y, -f.y, 0);
  let vz = vec4f(r.z, u.z, -f.z, 0);
  let vw = vec4f(-dot(r, e), -dot(u, e), dot(f, e), 1);
  let view = mat4x4f(vx, vy, vz, vw);
  let vp4 = view * wp4;

  let near = frame.cameraNear; let far = frame.cameraFar;
  let fv = 1.0 / tan(frame.cameraFovY * 0.5);
  let aspect = max(1.0, frame.width) / max(1.0, frame.height);
  let rInv = 1.0 / (near - far);
  let clip = vec4f(vp4.x * fv / aspect, vp4.y * fv, vp4.z * far * rInv + far * near * rInv, -vp4.z);

  var o: VsOut;
  o.clipPos = clip;
  o.worldPos = wp;
  o.worldNormal = wn;
  o.uv = uv;
  o.worldTangent = wt;
  o.tangentSign = tangent.w;
  o.instanceCustom0 = instanceCustom0;
  o.instanceCustom1 = instanceCustom1;
  o.instanceMaterialIndex = instanceMaterialIndex;
  return o;
}

const PI: f32 = 3.14159265;
fn dGGX(NdotH: f32, r: f32) -> f32 {
  let a2 = r * r * r * r;
  let d = NdotH * NdotH * (a2 - 1) + 1;
  return a2 / (PI * d * d);
}
fn gSchlick(NdotV: f32, r: f32) -> f32 {
  let k = (r + 1) * (r + 1) / 8;
  return NdotV / (NdotV * (1 - k) + k);
}
fn gSmith(ndv: f32, ndl: f32, r: f32) -> f32 {
  return gSchlick(ndv, r) * gSchlick(ndl, r);
}
fn fSchlick(cos: f32, f0: vec3f) -> vec3f {
  return f0 + (vec3f(1) - f0) * pow(clamp(1 - cos, 0, 1), 5);
}
fn evalPBR(alb: vec3f, met: f32, rou: f32, N: vec3f, V: vec3f, L: vec3f, lc: vec3f) -> vec3f {
  let H = normalize(V + L);
  let ndl = max(dot(N, L), 0);
  let ndv = max(dot(N, V), 0.001);
  let ndh = max(dot(N, H), 0);
  let vdh = max(dot(V, H), 0);
  let f0 = mix(vec3f(0.04), alb, met);
  let F = fSchlick(vdh, f0);
  let D = dGGX(ndh, rou);
  let G = gSmith(ndv, ndl, rou);
  let spec = (D * G * F) / max(4 * ndv * ndl, 0.001);
  let kD = (vec3f(1) - F) * (1 - met);
  return (kD * alb / PI + spec) * lc * ndl;
}

fn sampleEnvironment(rayDir: vec3f, origin: vec3f, keyDir: vec3f, sunStrength: f32) -> vec3f {
  let horizon = clamp(rayDir.y * 0.5 + 0.5, 0.0, 1.0);
  var sky = mix(vec3f(0.03, 0.05, 0.09), vec3f(0.12, 0.18, 0.28), horizon);
  let cp = rayDir.x * 5.5 + rayDir.z * 4.5 + origin.x * 0.22 + origin.z * 0.17 + frame.time * 0.08;
  let cloud = sin(cp) * 0.5 + 0.5;
  sky = sky + vec3f(cloud * 0.025, cloud * 0.018, cloud * 0.012);

  let ground = mix(vec3f(0.02, 0.022, 0.024), vec3f(0.08, 0.085, 0.09), clamp(-rayDir.y * 0.9, 0.0, 1.0));
  var env = mix(ground, sky, smoothstep(-0.08, 0.04, rayDir.y));

  let sunAmount = pow(max(dot(rayDir, keyDir), 0.0), 220.0);
  env = env + vec3f(1.2, 1.05, 0.9) * sunAmount * 1.3 * max(0.0, sunStrength);

  if (frame.fogEnabled > 0.5) {
    env = mix(env, frame.fogColor, clamp((1.0 - horizon) * 0.25, 0.0, 1.0));
  }
  return env;
}

fn computeShadowMapVisibility(worldPos: vec3f) -> f32 {
  let rel = worldPos - shadowMap.originMaxX.xyz;
  let lx = dot(rel, shadowMap.rightMinX.xyz);
  let ly = dot(rel, shadowMap.upMinY.xyz);
  let lz = dot(rel, shadowMap.forwardNear.xyz);
  let minX = shadowMap.rightMinX.w;
  let minY = shadowMap.upMinY.w;
  let nearZ = shadowMap.forwardNear.w;
  let maxX = shadowMap.originMaxX.w;
  let maxY = shadowMap.maxYFarModeStrength.x;
  let farZ = shadowMap.maxYFarModeStrength.y;
  let extentX = max(0.0001, maxX - minX);
  let extentY = max(0.0001, maxY - minY);
  let extentZ = max(0.0001, farZ - nearZ);
  let u = clamp((lx - minX) / extentX, 0.0, 1.0);
  let v = clamp((ly - minY) / extentY, 0.0, 1.0);
  let depth = clamp((lz - nearZ) / extentZ, 0.0, 1.0);
  let bias = max(0.0, shadowMap.params.x);
  let softness = max(0.0, shadowMap.params.y);
  let dims = textureDimensions(shadowMapTexture);
  let dimX = max(1, i32(dims.x));
  let dimY = max(1, i32(dims.y));
  let baseX = clamp(i32(floor(u * f32(dimX))), 0, dimX - 1);
  let baseY = clamp(i32(floor(v * f32(dimY))), 0, dimY - 1);
  let offsetRadius = i32(round(clamp(softness, 0.0, 4.0)));
  let sx0 = clamp(baseX - offsetRadius, 0, dimX - 1);
  let sx1 = baseX;
  let sx2 = clamp(baseX + offsetRadius, 0, dimX - 1);
  let sy0 = clamp(baseY - offsetRadius, 0, dimY - 1);
  let sy1 = baseY;
  let sy2 = clamp(baseY + offsetRadius, 0, dimY - 1);
  let threshold = depth - bias;
  var visibility = 0.0;
  visibility += select(0.0, 1.0, textureLoad(shadowMapTexture, vec2i(sx0, sy0), 0) >= threshold);
  visibility += select(0.0, 1.0, textureLoad(shadowMapTexture, vec2i(sx1, sy0), 0) >= threshold);
  visibility += select(0.0, 1.0, textureLoad(shadowMapTexture, vec2i(sx2, sy0), 0) >= threshold);
  visibility += select(0.0, 1.0, textureLoad(shadowMapTexture, vec2i(sx0, sy1), 0) >= threshold);
  visibility += select(0.0, 1.0, textureLoad(shadowMapTexture, vec2i(sx1, sy1), 0) >= threshold);
  visibility += select(0.0, 1.0, textureLoad(shadowMapTexture, vec2i(sx2, sy1), 0) >= threshold);
  visibility += select(0.0, 1.0, textureLoad(shadowMapTexture, vec2i(sx0, sy2), 0) >= threshold);
  visibility += select(0.0, 1.0, textureLoad(shadowMapTexture, vec2i(sx1, sy2), 0) >= threshold);
  visibility += select(0.0, 1.0, textureLoad(shadowMapTexture, vec2i(sx2, sy2), 0) >= threshold);
  return visibility / 9.0;
}

struct SceneOut {
  @location(0) hdr: vec4f, @location(1) normal: vec4f, @location(2) matBuf: vec4f,
}
@fragment fn fsMain(in: VsOut, @builtin(front_facing) ff: bool) -> SceneOut {
  let materialCount = i32(arrayLength(&instancedMaterialTable.records));
  let clampedMaterialIndex = clamp(
    i32(round(in.instanceMaterialIndex)),
    0,
    max(0, materialCount - 1),
  );
  let instanceMaterial = instancedMaterialTable.records[u32(clampedMaterialIndex)];
  let effectiveBaseColor = material.baseColor * instanceMaterial.baseColor;
  let effectiveUvScale = material.uvScaleOffset.xy * instanceMaterial.uvScaleOffset.xy;
  let effectiveUvOffset = material.uvScaleOffset.zw + instanceMaterial.uvScaleOffset.zw;
  let effectiveEmissive = material.emissive * instanceMaterial.emissive.rgb;
  let effectiveEmissiveIntensity = material.emissiveIntensity * instanceMaterial.emissive.w;
  let effectiveMetallic = material.metallic * instanceMaterial.pbrFlags.x;
  let effectiveRoughness = material.roughness * instanceMaterial.pbrFlags.y;
  let effectiveTwoSided = max(material.twoSided, instanceMaterial.pbrFlags.z);
  let effectiveReceivesShadows = max(material.shadowFlags.x, instanceMaterial.shadowFlags.x);
  let effectiveBaseColorLayer = max(0.0, material.shadowFlags.y + instanceMaterial.shadowFlags.y);

  var N = normalize(in.worldNormal);
  if (effectiveTwoSided > 0.5 && !ff) {
    N = -N;
  }
  let rawTangent = normalize(in.worldTangent);
  let tangent = normalize(rawTangent - N * dot(rawTangent, N));
  let bitangent = normalize(cross(N, tangent) * in.tangentSign);
  let sampledNormal = textureSample(normalTex, baseColorSamp, in.uv).xyz * 2.0 - vec3f(1.0);
  N = normalize(tangent * sampledNormal.x + bitangent * sampledNormal.y + N * sampledNormal.z);

  let V = normalize(frame.cameraPosition - in.worldPos);
  let textureUv = in.uv * effectiveUvScale + effectiveUvOffset;
  let baseColorLayer = clamp(
    i32(round(effectiveBaseColorLayer)),
    0,
    max(0, i32(textureNumLayers(baseColorTex)) - 1),
  );
  let baseSample = textureSample(baseColorTex, baseColorSamp, textureUv, baseColorLayer);
  let ormSample = textureSample(ormTex, baseColorSamp, textureUv).rgb;
  let emissiveSample = textureSample(emissiveTex, baseColorSamp, textureUv).rgb;
  let instanceTint = in.instanceCustom0;
  let instanceEmissiveTint = in.instanceCustom1;
  let alb = effectiveBaseColor.rgb * baseSample.rgb * instanceTint.rgb;
  let alpha = effectiveBaseColor.a * baseSample.a * instanceTint.a;
  let ao = clamp(ormSample.r, 0.0, 1.0);
  let met = clamp(effectiveMetallic * ormSample.b, 0.0, 1.0);
  let rou = max(effectiveRoughness * ormSample.g, 0.04);

  let directionalLightingScale = max(0.0, frame.directionalLightingEnabled);
  let kd = normalize(frame.keyLightDir);
  let fd = normalize(vec3f(0.2,0.7,0.35));
  var rad = vec3f(0);
  rad += evalPBR(alb, met, rou, N, V, kd, vec3f(1.20,1.14,1.05) * directionalLightingScale);
  rad += evalPBR(alb, met, rou, N, V, fd, vec3f(0.35,0.38,0.45) * directionalLightingScale);

  let clustersX = max(1, i32(clusterInfo.params0.x));
  let clustersY = max(1, i32(clusterInfo.params0.y));
  let clustersZ = max(1, i32(clusterInfo.params0.z));
  let maxLightsPerCluster = max(1, i32(clusterInfo.params0.w));
  let tileSizeX = max(1.0, clusterInfo.params1.z);
  let tileSizeY = max(1.0, clusterInfo.params1.w);
  let clusterX = clamp(i32(in.clipPos.x / tileSizeX), 0, clustersX - 1);
  let clusterY = clamp(i32(in.clipPos.y / tileSizeY), 0, clustersY - 1);
  let clusterNear = max(0.0001, clusterInfo.params1.x);
  let clusterFar = max(clusterNear + 0.0001, clusterInfo.params1.y);
  let forwardDepth = clamp(dot(in.worldPos - frame.cameraPosition, frame.cameraForward), clusterNear, clusterFar);
  let linearNormalized = (forwardDepth - clusterNear) / max(0.0001, clusterFar - clusterNear);
  let logNormalized = (log(forwardDepth) - log(clusterNear)) / max(0.0001, log(clusterFar) - log(clusterNear));
  let hybridDepth = linearNormalized * 0.25 + logNormalized * 0.75;
  let clusterZ = clamp(i32(floor(hybridDepth * f32(clustersZ))), 0, clustersZ - 1);
  let clusterIndex = clusterX + clusterY * clustersX + clusterZ * clustersX * clustersY;
  let clusterRecord = clusterRecords.records[u32(clusterIndex)];
  let clusterOffset = i32(clusterRecord.x);
  let clusterLightCount = min(i32(clusterRecord.y), maxLightsPerCluster);
  let pointLightCount = i32(clamp(pointLights.data[0].x, 0.0, f32(${MAX_DYNAMIC_POINT_LIGHTS})));
  for (var ci = 0; ci < ${MAX_DYNAMIC_POINT_LIGHTS}; ci = ci + 1) {
    if (ci >= clusterLightCount) {
      break;
    }
    let lightIndex = i32(clusterLightIndices.indices[u32(clusterOffset + ci)]);
    if (lightIndex < 0 || lightIndex >= pointLightCount) {
      continue;
    }
    let posRange = pointLights.data[lightIndex * 3 + 1];
    let colorIntensity = pointLights.data[lightIndex * 3 + 2];
    let lightParams = pointLights.data[lightIndex * 3 + 3];
    let toLight = posRange.xyz - in.worldPos;
    let distanceToLight = length(toLight);
    let packedRange = posRange.w;
    let pointLightCastsShadows = packedRange > 0.0;
    let range = max(0.001, abs(packedRange));
    if (distanceToLight >= range) {
      continue;
    }
    let L = toLight / max(0.0001, distanceToLight);
    let normalizedDistance = distanceToLight / range;
    let falloff = clamp(1.0 - normalizedDistance, 0.0, 1.0);
    let attenuationCore = (falloff * falloff) / (0.35 + normalizedDistance * normalizedDistance * 2.2);
    let attenuationEdgeSoftness = clamp(lightParams.x, 0.1, 0.95);
    let edgeSoftness = 1.0 - smoothstep(attenuationEdgeSoftness, 1.0, normalizedDistance);
    let attenuation = attenuationCore * edgeSoftness;
    var lightRadiance = colorIntensity.xyz * max(0.0, colorIntensity.w) * attenuation * 2.2;
    if (frame.shadowsEnabled > 0.5 && effectiveReceivesShadows > 0.5 && pointLightCastsShadows) {
      var pointShadowOcclusion = 0.0;
      for (var si = 0; si < ${MAX_SHADOW_CASTERS}; si = si + 1) {
        let caster = shadowCasters.casters[si];
        let radius = caster.w;
        if (radius <= 0.0001) {
          continue;
        }
        let toCaster = caster.xyz - in.worldPos;
        let projection = dot(toCaster, L);
        if (projection <= 0.0 || projection >= distanceToLight) {
          continue;
        }
        let closest = toCaster - L * projection;
        let distanceSq = dot(closest, closest);
        let radiusSq = radius * radius;
        if (distanceSq < radiusSq) {
          let blocker = 1.0 - smoothstep(0.0, radiusSq, distanceSq);
          pointShadowOcclusion = max(pointShadowOcclusion, blocker);
        }
      }
      let pointShadowStrength = clamp(frame.pointShadowStrength, 0.0, 2.5);
      let pointShadowVisibility = 1.0 - clamp(pointShadowOcclusion * pointShadowStrength, 0.0, 1.0);
      lightRadiance *= max(0.02, pointShadowVisibility);
    }
    rad += evalPBR(alb, met, rou, N, V, L, lightRadiance);
  }

  rad += alb * vec3f(0.05, 0.07, 0.11) * (1 - met) * ao;

  let R = reflect(-V, N);
  let f0 = mix(vec3f(0.04), alb, met);
  let envF = fSchlick(max(dot(N, V), 0.0), f0);
  let envSpec = sampleEnvironment(R, frame.cameraPosition, kd, directionalLightingScale);
  let envStrength = mix(0.25, 1.0, met) * (1.0 - rou * 0.85) * mix(0.5, 1.0, ao);
  rad += envSpec * envF * envStrength;

  rad +=
    effectiveEmissive *
    emissiveSample *
    instanceEmissiveTint.rgb *
    effectiveEmissiveIntensity;

  if (frame.shadowsEnabled > 0.5 && effectiveReceivesShadows > 0.5 && directionalLightingScale > 0.001) {
    let shadowMode = shadowMap.maxYFarModeStrength.z;
    if (shadowMode > 0.5) {
      let shadowVisibility = computeShadowMapVisibility(in.worldPos);
      let shadowStrength = clamp(shadowMap.maxYFarModeStrength.w, 0.0, 1.0);
      rad *= max(0.2, mix(1.0, shadowVisibility, shadowStrength));
    } else {
    var shadowOcclusion = 0.0;
    for (var i = 0; i < ${MAX_SHADOW_CASTERS}; i = i + 1) {
      let caster = shadowCasters.casters[i];
      let radius = caster.w;
      if (radius <= 0.0001) {
        continue;
      }
      if (frame.shadowReceiverHeight > -900.0 && caster.y <= frame.shadowReceiverHeight + 0.02) {
        continue;
      }
      let toCaster = caster.xyz - in.worldPos;
      let t = dot(toCaster, kd);
      if (t <= 0.0) {
        continue;
      }
      let closest = toCaster - kd * t;
      let distanceSq = dot(closest, closest);
      let radiusSq = radius * radius;
      if (distanceSq < radiusSq) {
        let thickness = clamp((radiusSq - distanceSq) / max(radiusSq, 0.0001), 0.0, 1.0);
        let softness = smoothstep(0.0, radius * 2.5, t);
        shadowOcclusion = max(shadowOcclusion, thickness * softness);
      }
    }

    var receiverMask = 1.0;
    if (frame.shadowReceiverHeight > -900.0) {
      let receiverDistance = abs(in.worldPos.y - frame.shadowReceiverHeight);
      let band = max(0.01, frame.shadowReceiverBand);
      let onReceiver = 1.0 - smoothstep(band, band * 2.5, receiverDistance);
      let upFacing = smoothstep(0.25, 0.75, N.y);
      receiverMask = onReceiver * upFacing;
    }
    shadowOcclusion *= receiverMask;

    let ndl = clamp(dot(N, kd), 0.0, 1.0);
    let baseVisibility = mix(0.58, 1.0, smoothstep(0.05, 0.65, ndl));
    let occlusionVisibility = 1.0 - shadowOcclusion * 0.75;
    rad *= max(0.2, baseVisibility * occlusionVisibility);
    }
  }

  let dist = length(frame.cameraPosition - in.worldPos);
  if (frame.fogEnabled > 0.5) {
    let dr = max(0.001, frame.fogEndDistance - frame.fogStartDistance);
    let df = clamp((dist - frame.fogStartDistance)/dr, 0, 1);
    let dd = 1.0 - exp(-dist * max(0.0, frame.fogDensity));
    let hf = select(1.0, exp(-max(0.0, in.worldPos.y) * frame.fogHeightFalloff), frame.fogHeightFalloff > 0);
    rad = mix(rad, frame.fogColor, clamp(df * dd * hf, 0, 1));
  }

  let emi = dot(
    effectiveEmissive * instanceEmissiveTint.rgb * effectiveEmissiveIntensity,
    vec3f(0.2126, 0.7152, 0.0722),
  );
  let hi = clamp(emi + dot(rad, vec3f(0.2126, 0.7152, 0.0722)) * 0.1, 0, 1);
  let ld = clamp(dist / frame.cameraFar, 0, 1);

  var o: SceneOut;
  o.hdr = vec4f(rad, alpha);
  o.normal = vec4f(N * 0.5 + vec3f(0.5), 1);
  o.matBuf = vec4f(hi, ld, rou, met);
  return o;
}
`;

const SHADOW_MAP_SHADER = /* wgsl */ `
struct ShadowMapUniforms {
  rightMinX: vec4f,
  upMinY: vec4f,
  forwardNear: vec4f,
  originMaxX: vec4f,
  maxYFarModeStrength: vec4f,
  params: vec4f,
}
struct TransformUniforms { model: mat4x4f, }
@group(0) @binding(0) var<uniform> shadowMap: ShadowMapUniforms;
@group(1) @binding(0) var<uniform> transform: TransformUniforms;

@vertex fn vsMain(@location(0) pos: vec3f) -> @builtin(position) vec4f {
  let worldPos = (transform.model * vec4f(pos, 1.0)).xyz;
  let rel = worldPos - shadowMap.originMaxX.xyz;
  let lx = dot(rel, shadowMap.rightMinX.xyz);
  let ly = dot(rel, shadowMap.upMinY.xyz);
  let lz = dot(rel, shadowMap.forwardNear.xyz);
  let minX = shadowMap.rightMinX.w;
  let minY = shadowMap.upMinY.w;
  let nearZ = shadowMap.forwardNear.w;
  let maxX = shadowMap.originMaxX.w;
  let maxY = shadowMap.maxYFarModeStrength.x;
  let farZ = shadowMap.maxYFarModeStrength.y;
  let extentX = max(0.0001, maxX - minX);
  let extentY = max(0.0001, maxY - minY);
  let extentZ = max(0.0001, farZ - nearZ);
  let u = (lx - minX) / extentX;
  let v = (ly - minY) / extentY;
  let z = clamp((lz - nearZ) / extentZ, 0.0, 1.0);
  let ndcX = u * 2.0 - 1.0;
  let ndcY = 1.0 - v * 2.0;
  return vec4f(ndcX, ndcY, z, 1.0);
}
`;

const SHADOW_MAP_INSTANCED_SHADER = /* wgsl */ `
struct ShadowMapUniforms {
  rightMinX: vec4f,
  upMinY: vec4f,
  forwardNear: vec4f,
  originMaxX: vec4f,
  maxYFarModeStrength: vec4f,
  params: vec4f,
}
@group(0) @binding(0) var<uniform> shadowMap: ShadowMapUniforms;

@vertex fn vsMain(
  @location(0) pos: vec3f,
  @location(4) iCol0: vec4f,
  @location(5) iCol1: vec4f,
  @location(6) iCol2: vec4f,
  @location(7) iCol3: vec4f,
) -> @builtin(position) vec4f {
  let model = mat4x4f(iCol0, iCol1, iCol2, iCol3);
  let worldPos = (model * vec4f(pos, 1.0)).xyz;
  let rel = worldPos - shadowMap.originMaxX.xyz;
  let lx = dot(rel, shadowMap.rightMinX.xyz);
  let ly = dot(rel, shadowMap.upMinY.xyz);
  let lz = dot(rel, shadowMap.forwardNear.xyz);
  let minX = shadowMap.rightMinX.w;
  let minY = shadowMap.upMinY.w;
  let nearZ = shadowMap.forwardNear.w;
  let maxX = shadowMap.originMaxX.w;
  let maxY = shadowMap.maxYFarModeStrength.x;
  let farZ = shadowMap.maxYFarModeStrength.y;
  let extentX = max(0.0001, maxX - minX);
  let extentY = max(0.0001, maxY - minY);
  let extentZ = max(0.0001, farZ - nearZ);
  let u = (lx - minX) / extentX;
  let v = (ly - minY) / extentY;
  let z = clamp((lz - nearZ) / extentZ, 0.0, 1.0);
  let ndcX = u * 2.0 - 1.0;
  let ndcY = 1.0 - v * 2.0;
  return vec4f(ndcX, ndcY, z, 1.0);
}
`;

const SSR_SHADER = /* wgsl */ `
${POST_UNIFORMS_WGSL}
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var hdrTex: texture_2d<f32>;
@group(0) @binding(3) var matTex: texture_2d<f32>;
@group(0) @binding(4) var historyTex: texture_2d<f32>;
@group(0) @binding(5) var normTex: texture_2d<f32>;
${FULLSCREEN_VS_WGSL}
@fragment fn fsMain(in: VsOut) -> @location(0) vec4f {
  let sampleUv = vec2f(in.uv.x, 1.0 - in.uv.y);
  let matInfo = textureSample(matTex, samp, sampleUv);
  let roughness = clamp(matInfo.z, 0.0, 1.0);
  let metallic = clamp(matInfo.w, 0.0, 1.0);
  let depthProxy = clamp(matInfo.y, 0.0, 1.0);
  let src = textureSample(hdrTex, samp, sampleUv).xyz;
  let normal = normalize(textureSample(normTex, samp, sampleUv).xyz * 2.0 - vec3f(1.0));
  let viewDir = normalize(vec3f((sampleUv - vec2f(0.5, 0.5)) * vec2f(1.8, -1.8), 1.0));
  let reflDir = normalize(reflect(-viewDir, normal));
  let roughnessCutoff = max(0.001, frame.ssrRoughnessCutoff);
  let smoothMask = 1.0 - smoothstep(roughnessCutoff * 0.7, roughnessCutoff, roughness);
  let metallicMask = mix(0.35, 1.0, metallic);
  let reflectiveMask = clamp(smoothMask * metallicMask, 0.0, 1.0);
  let reflSpan = clamp(0.018 + frame.ssrMaxDistance * 0.22, 0.018, 0.14);
  let reflOffset = normalize(reflDir.xy + vec2f(0.0001, 0.0001)) * reflSpan;
  let reflUv = vec2f(
    clamp(sampleUv.x + reflOffset.x * (0.35 + reflectiveMask * 1.1), 0.0, 1.0),
    clamp(sampleUv.y - reflOffset.y * (0.35 + reflectiveMask * 1.1), 0.0, 1.0),
  );
  let reflectedBase = textureSample(hdrTex, samp, reflUv).xyz;
  let reflectedHistory = textureSample(historyTex, samp, reflUv).xyz;
  let reflMat = textureSample(matTex, samp, reflUv);
  let reflDepth = clamp(reflMat.y, 0.0, 1.0);
  let expectedDepth = clamp(depthProxy + max(0.0008, frame.ssrMaxDistance * 0.004), 0.0, 1.0);
  let depthDelta = abs(reflDepth - expectedDepth);
  let depthTolerance = max(0.002, frame.ssrThickness * 0.08);
  let hitMask = 1.0 - smoothstep(depthTolerance, depthTolerance * 2.5, depthDelta);

  let dir = normalize(reflDir.xy + vec2f(0.0001, 0.0001));
  let texel = vec2f(1.0 / frame.width, 1.0 / frame.height);
  let dirSpan = texel * max(1.0, frame.ssrStride) * (0.8 + (1.0 - roughness) * 1.6);
  let tapUv0 = vec2f(clamp(reflUv.x + dir.x * dirSpan.x * 0.7, 0.0, 1.0), clamp(reflUv.y - dir.y * dirSpan.y * 0.7, 0.0, 1.0));
  let tapUv1 = vec2f(clamp(reflUv.x + dir.x * dirSpan.x * 1.35, 0.0, 1.0), clamp(reflUv.y - dir.y * dirSpan.y * 1.35, 0.0, 1.0));
  let tapCol0 = textureSample(hdrTex, samp, tapUv0).xyz;
  let tapCol1 = textureSample(hdrTex, samp, tapUv1).xyz;
  let tapDepth0 = clamp(textureSample(matTex, samp, tapUv0).y, 0.0, 1.0);
  let tapDepth1 = clamp(textureSample(matTex, samp, tapUv1).y, 0.0, 1.0);
  let tapDelta0 = abs(tapDepth0 - clamp(expectedDepth + max(0.0005, frame.ssrMaxDistance * 0.0015), 0.0, 1.0));
  let tapDelta1 = abs(tapDepth1 - clamp(expectedDepth + max(0.001, frame.ssrMaxDistance * 0.003), 0.0, 1.0));
  let tapHit0 = 1.0 - smoothstep(depthTolerance, depthTolerance * 2.5, tapDelta0);
  let tapHit1 = 1.0 - smoothstep(depthTolerance, depthTolerance * 2.5, tapDelta1);
  let tapWeight0 = tapHit0 * 0.75;
  let tapWeight1 = tapHit1 * 0.5;
  let tapWeightSum = tapWeight0 + tapWeight1;
  let reflectedTaps = (tapCol0 * tapWeight0 + tapCol1 * tapWeight1) / max(0.0001, tapWeightSum);
  var reflected = mix(reflectedBase, reflectedTaps, clamp(tapWeightSum, 0.0, 1.0));
  let historyClamp = mix(0.07, 0.22, roughness);
  let historyMin = max(vec3f(0.0), reflected - vec3f(historyClamp));
  let historyMax = reflected + vec3f(historyClamp);
  let historyClamped = clamp(reflectedHistory, historyMin, historyMax);
  let cameraMotion = abs(frame.motionDeltaRight) + abs(frame.motionDeltaUp) + abs(frame.motionDeltaForward);
  let motionFade = 1.0 - smoothstep(0.002, 0.05, cameraMotion);
  let historyConfidence = clamp(hitMask * (0.45 + 0.55 * clamp(tapWeightSum, 0.0, 1.0)), 0.0, 1.0);
  let historyBlend = clamp(frame.ssrResolve, 0.0, 1.0) * 0.22 * (1.0 - roughness) * motionFade * historyConfidence;
  reflected = mix(reflected, historyClamped, historyBlend);

  let distanceMask = clamp(1.0 - depthProxy * 0.8, 0.15, 1.0);
  let strength = clamp(frame.ssrResolve, 0.0, 1.0) * mix(0.14, 0.42, reflectiveMask) * distanceMask * hitMask;
  return vec4f(mix(src, reflected, strength), 1.0);
}
`;

const AO_SHADER = /* wgsl */ `
${POST_UNIFORMS_WGSL}
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var matTex: texture_2d<f32>;
@group(0) @binding(3) var normTex: texture_2d<f32>;
${FULLSCREEN_VS_WGSL}
@fragment fn fsMain(in: VsOut) -> @location(0) vec4f {
  if (frame.aoEnabled < 0.5) {
    return vec4f(1, 1, 1, 1);
  }
  let sampleUv = vec2f(in.uv.x, 1.0 - in.uv.y);
  let tx = vec2f(1/frame.width, 1/frame.height);
  let mc = textureSample(matTex, samp, sampleUv);
  let dc = mc.y;
  let nc = textureSample(normTex, samp, sampleUv).xyz * 2 - vec3f(1);
  let offs = array<vec2f, 4>(vec2f(tx.x, 0), vec2f(-tx.x, 0), vec2f(0, tx.y), vec2f(0, -tx.y));
  var occ = 0.0;
  for (var i = 0; i < 4; i = i + 1) {
    let ms = textureSample(matTex, samp, sampleUv+offs[i]);
    let dd = max(0.0, ms.y-dc);
    let ns = textureSample(normTex, samp, sampleUv + offs[i]).xyz * 2 - vec3f(1);
    occ += dd * (1 - max(0.0, dot(nc, ns)) * 0.75);
  }
  return vec4f(vec3f(clamp(1 - occ * 6, 0, 1)), 1);
}
`;

const BLOOM_PREFILTER_SHADER = /* wgsl */ `
${POST_UNIFORMS_WGSL}
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var hdrTex: texture_2d<f32>;
@group(0) @binding(3) var matTex: texture_2d<f32>;
${FULLSCREEN_VS_WGSL}

fn bloomMask(luma: f32, threshold: f32, knee: f32) -> f32 {
  let edge0 = max(0.0, threshold - knee);
  let edge1 = threshold + knee;
  let t = clamp((luma - edge0) / max(0.0001, edge1 - edge0), 0.0, 1.0);
  // Smooth cubic curve keeps transitions soft and avoids binary sparkle.
  return t * t * (3.0 - 2.0 * t);
}

@fragment fn fsMain(in: VsOut) -> @location(0) vec4f {
  if (frame.bloomEnabled < 0.5) {
    return vec4f(0, 0, 0, 1);
  }
  let strength = max(0.0, frame.bloomIntensity);
  let sampleUv = vec2f(in.uv.x, 1.0 - in.uv.y);
  let tx = vec2f(1/frame.width, 1/frame.height);
  let radiusScale = 1.2 + strength * 3.4;
  let centerMat = textureSample(matTex, samp, sampleUv);
  let centerEmissiveHint = clamp(centerMat.x, 0.0, 1.0);
  let threshold = mix(frame.bloomThreshold, frame.bloomThreshold * 0.28, centerEmissiveHint);
  let knee = max(0.0001, mix(frame.bloomKnee, frame.bloomKnee * 1.6 + 0.06, centerEmissiveHint));

  var col = vec3f(0);
  var ws = 0.0;

  // Prefilter only. Blur is handled by dedicated separable passes.
  let center = textureSample(hdrTex, samp, sampleUv).xyz;
  let centerLuma = dot(center, vec3f(0.2126, 0.7152, 0.0722));
  let centerMask = bloomMask(centerLuma, threshold, knee);
  let centerBoost = max(centerMask, centerEmissiveHint * 0.8) * (0.7 + strength * 1.05);
  let centerCompressed = center / (vec3f(1.0) + center * 0.2);
  col += centerCompressed * centerBoost;
  ws += centerBoost;

  let offs = array<vec2f, 8>(
    vec2f( 1.0,  0.0), vec2f(-1.0,  0.0), vec2f( 0.0,  1.0), vec2f( 0.0, -1.0),
    vec2f( 0.71,  0.71), vec2f(-0.71,  0.71), vec2f( 0.71, -0.71), vec2f(-0.71, -0.71)
  );
  for (var i = 0; i < 8; i = i + 1) {
    let uv = sampleUv + offs[i] * tx * radiusScale;
    let sc = textureSample(hdrTex, samp, uv).xyz;
    let sm = textureSample(matTex, samp, uv);
    let emissiveHint = clamp(sm.x, 0.0, 1.0);
    let luma = dot(sc, vec3f(0.2126, 0.7152, 0.0722));
    let mask = bloomMask(luma, threshold, knee);
    let boosted = max(mask, emissiveHint * 0.7) * (0.5 + strength * 0.85);
    let compressed = sc / (vec3f(1.0) + sc * 0.2);
    col += compressed * boosted * 0.11;
    ws += boosted * 0.11;
  }

  if (ws > 0) {
    col = (col / ws) * (0.45 + strength * 1.0);
  }
  return vec4f(col, 1);
}
`;

const BLOOM_BLUR_HORIZONTAL_SHADER = /* wgsl */ `
${POST_UNIFORMS_WGSL}
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var srcTex: texture_2d<f32>;
${FULLSCREEN_VS_WGSL}
@fragment fn fsMain(in: VsOut) -> @location(0) vec4f {
  let sampleUv = vec2f(in.uv.x, 1.0 - in.uv.y);
  if (frame.bloomEnabled < 0.5) {
    return vec4f(0, 0, 0, 1);
  }
  let strength = max(0.0, frame.bloomIntensity);
  let texel = vec2f(1.0 / max(1.0, frame.width), 0.0);
  let radius = 0.9 + strength * 2.0;
  let w0 = 0.227027;
  let w1 = 0.1945946;
  let w2 = 0.1216216;
  let w3 = 0.054054;
  let w4 = 0.016216;
  var col = textureSample(srcTex, samp, sampleUv).xyz * w0;
  col += textureSample(srcTex, samp, sampleUv + texel * radius * 1.0).xyz * w1;
  col += textureSample(srcTex, samp, sampleUv - texel * radius * 1.0).xyz * w1;
  col += textureSample(srcTex, samp, sampleUv + texel * radius * 2.0).xyz * w2;
  col += textureSample(srcTex, samp, sampleUv - texel * radius * 2.0).xyz * w2;
  col += textureSample(srcTex, samp, sampleUv + texel * radius * 3.0).xyz * w3;
  col += textureSample(srcTex, samp, sampleUv - texel * radius * 3.0).xyz * w3;
  col += textureSample(srcTex, samp, sampleUv + texel * radius * 4.0).xyz * w4;
  col += textureSample(srcTex, samp, sampleUv - texel * radius * 4.0).xyz * w4;
  return vec4f(col, 1);
}
`;

const BLOOM_BLUR_VERTICAL_SHADER = /* wgsl */ `
${POST_UNIFORMS_WGSL}
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var srcTex: texture_2d<f32>;
${FULLSCREEN_VS_WGSL}
@fragment fn fsMain(in: VsOut) -> @location(0) vec4f {
  let sampleUv = vec2f(in.uv.x, 1.0 - in.uv.y);
  if (frame.bloomEnabled < 0.5) {
    return vec4f(0, 0, 0, 1);
  }
  let strength = max(0.0, frame.bloomIntensity);
  let texel = vec2f(0.0, 1.0 / max(1.0, frame.height));
  let radius = 0.9 + strength * 2.0;
  let w0 = 0.227027;
  let w1 = 0.1945946;
  let w2 = 0.1216216;
  let w3 = 0.054054;
  let w4 = 0.016216;
  var col = textureSample(srcTex, samp, sampleUv).xyz * w0;
  col += textureSample(srcTex, samp, sampleUv + texel * radius * 1.0).xyz * w1;
  col += textureSample(srcTex, samp, sampleUv - texel * radius * 1.0).xyz * w1;
  col += textureSample(srcTex, samp, sampleUv + texel * radius * 2.0).xyz * w2;
  col += textureSample(srcTex, samp, sampleUv - texel * radius * 2.0).xyz * w2;
  col += textureSample(srcTex, samp, sampleUv + texel * radius * 3.0).xyz * w3;
  col += textureSample(srcTex, samp, sampleUv - texel * radius * 3.0).xyz * w3;
  col += textureSample(srcTex, samp, sampleUv + texel * radius * 4.0).xyz * w4;
  col += textureSample(srcTex, samp, sampleUv - texel * radius * 4.0).xyz * w4;
  return vec4f(col, 1);
}
`;

const DOF_PREFILTER_SHADER = /* wgsl */ `
${POST_UNIFORMS_WGSL}
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var hdrTex: texture_2d<f32>;
@group(0) @binding(3) var matTex: texture_2d<f32>;
${FULLSCREEN_VS_WGSL}
@fragment fn fsMain(in: VsOut) -> @location(0) vec4f {
  let sampleUv = vec2f(in.uv.x, 1.0 - in.uv.y);
  let source = textureSample(hdrTex, samp, sampleUv).xyz;
  if (frame.dofEnabled < 0.5) {
    return vec4f(source, 0);
  }
  let mat = textureSample(matTex, samp, sampleUv);
  let ld = mat.y * 60;
  let cn = clamp(abs(ld - frame.dofFocusDistance) / max(0.001, frame.dofFocusRange), 0, 1);
  let coc = clamp(cn * frame.dofAperture, 0, frame.dofMaxCoc);
  let blurMask = clamp(coc / max(0.001, frame.dofMaxCoc), 0, 1);
  return vec4f(source, blurMask);
}
`;

const DOF_BLUR_HORIZONTAL_SHADER = /* wgsl */ `
${POST_UNIFORMS_WGSL}
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var srcTex: texture_2d<f32>;
${FULLSCREEN_VS_WGSL}
@fragment fn fsMain(in: VsOut) -> @location(0) vec4f {
  let sampleUv = vec2f(in.uv.x, 1.0 - in.uv.y);
  if (frame.dofEnabled < 0.5) {
    return textureSample(srcTex, samp, sampleUv);
  }
  let radius = 0.9 + frame.dofAperture * 0.35;
  let texel = vec2f(1.0 / max(1.0, frame.width), 0.0);
  let w0 = 0.227027;
  let w1 = 0.1945946;
  let w2 = 0.1216216;
  let w3 = 0.054054;
  let w4 = 0.016216;
  var col = textureSample(srcTex, samp, sampleUv) * w0;
  col += textureSample(srcTex, samp, sampleUv + texel * radius * 1.0) * w1;
  col += textureSample(srcTex, samp, sampleUv - texel * radius * 1.0) * w1;
  col += textureSample(srcTex, samp, sampleUv + texel * radius * 2.0) * w2;
  col += textureSample(srcTex, samp, sampleUv - texel * radius * 2.0) * w2;
  col += textureSample(srcTex, samp, sampleUv + texel * radius * 3.0) * w3;
  col += textureSample(srcTex, samp, sampleUv - texel * radius * 3.0) * w3;
  col += textureSample(srcTex, samp, sampleUv + texel * radius * 4.0) * w4;
  col += textureSample(srcTex, samp, sampleUv - texel * radius * 4.0) * w4;
  return col;
}
`;

const DOF_BLUR_VERTICAL_COMBINE_SHADER = /* wgsl */ `
${POST_UNIFORMS_WGSL}
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var blurTex: texture_2d<f32>;
@group(0) @binding(3) var hdrTex: texture_2d<f32>;
${FULLSCREEN_VS_WGSL}
@fragment fn fsMain(in: VsOut) -> @location(0) vec4f {
  let sampleUv = vec2f(in.uv.x, 1.0 - in.uv.y);
  let original = textureSample(hdrTex, samp, sampleUv).xyz;
  if (frame.dofEnabled < 0.5) {
    return vec4f(original, 1);
  }
  let radius = 0.9 + frame.dofAperture * 0.35;
  let texel = vec2f(0.0, 1.0 / max(1.0, frame.height));
  let w0 = 0.227027;
  let w1 = 0.1945946;
  let w2 = 0.1216216;
  let w3 = 0.054054;
  let w4 = 0.016216;
  var blurred = textureSample(blurTex, samp, sampleUv) * w0;
  blurred += textureSample(blurTex, samp, sampleUv + texel * radius * 1.0) * w1;
  blurred += textureSample(blurTex, samp, sampleUv - texel * radius * 1.0) * w1;
  blurred += textureSample(blurTex, samp, sampleUv + texel * radius * 2.0) * w2;
  blurred += textureSample(blurTex, samp, sampleUv - texel * radius * 2.0) * w2;
  blurred += textureSample(blurTex, samp, sampleUv + texel * radius * 3.0) * w3;
  blurred += textureSample(blurTex, samp, sampleUv - texel * radius * 3.0) * w3;
  blurred += textureSample(blurTex, samp, sampleUv + texel * radius * 4.0) * w4;
  blurred += textureSample(blurTex, samp, sampleUv - texel * radius * 4.0) * w4;
  let blurMask = clamp(blurred.a, 0.0, 1.0);
  let color = mix(original, blurred.rgb, blurMask);
  return vec4f(color, 1);
}
`;

const MOTION_BLUR_SHADER = /* wgsl */ `
${POST_UNIFORMS_WGSL}
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var hdrTex: texture_2d<f32>;
@group(0) @binding(3) var matTex: texture_2d<f32>;
${FULLSCREEN_VS_WGSL}
@fragment fn fsMain(in: VsOut) -> @location(0) vec4f {
  let sampleUv = vec2f(in.uv.x, 1.0 - in.uv.y);
  let center = textureSample(hdrTex, samp, sampleUv).xyz;
  let enabledMask = select(0.0, 1.0, frame.motionBlurEnabled > 0.5);
  let depthProxy = textureSample(matTex, samp, sampleUv).y;
  let baseMotion = vec2f(frame.motionDeltaRight, -frame.motionDeltaUp);
  let radial = sampleUv - vec2f(0.5, 0.5);
  let radialLength = max(0.0001, length(radial));
  let radialDir = radial / radialLength;
  let radialMotion = radialDir * frame.motionDeltaForward * 0.55;
  let combinedMotion = baseMotion + radialMotion;
  let combinedLength = length(combinedMotion);
  let motionMask = select(0.0, 1.0, combinedLength > 0.00001) * enabledMask;
  let safeLength = max(0.00001, combinedLength);

  let samples = clamp(frame.motionBlurSamples, 1.0, 12.0);
  let pixel = vec2f(1.0 / max(1.0, frame.width), 1.0 / max(1.0, frame.height));
  let motionScale = frame.motionBlurStrength * frame.motionBlurShutterScale;
  let depthScale = clamp(0.3 + depthProxy * 0.7, 0.2, 1.0);
  let dir = (combinedMotion / safeLength) * combinedLength * motionScale * depthScale * 120.0 * pixel * motionMask;

  var accum = center;
  var weightSum = 1.0;
  for (var step = 1; step <= 12; step = step + 1) {
    let stepF = f32(step);
    let sampleMask = select(0.0, 1.0, stepF <= samples);
    let t = stepF / max(1.0, samples);
    let weight = (1.0 - t * 0.7) * sampleMask;
    accum += textureSample(hdrTex, samp, sampleUv + dir * t).xyz * weight;
    accum += textureSample(hdrTex, samp, sampleUv - dir * t).xyz * weight;
    weightSum += weight * 2.0;
  }

  return vec4f(accum / max(0.0001, weightSum), 1);
}
`;

const COMPOSITE_SHADER = /* wgsl */ `
${POST_UNIFORMS_WGSL}
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var matTex: texture_2d<f32>;
@group(0) @binding(3) var aoTex: texture_2d<f32>;
@group(0) @binding(4) var bloomTex: texture_2d<f32>;
@group(0) @binding(5) var dofTex: texture_2d<f32>;
@group(0) @binding(6) var motionTex: texture_2d<f32>;
@group(0) @binding(7) var ssrTex: texture_2d<f32>;
${FULLSCREEN_VS_WGSL}
fn aces(x: vec3f) -> vec3f {
  return clamp((x * (2.51 * x + vec3f(0.03))) / (x * (2.43 * x + vec3f(0.59)) + vec3f(0.14)), vec3f(0), vec3f(1));
}
fn hash12(p: vec2f) -> f32 {
  let h = dot(p, vec2f(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}
@fragment fn fsMain(in: VsOut) -> @location(0) vec4f {
  let sampleUv = vec2f(in.uv.x, 1.0 - in.uv.y);
  let matInfo = textureSample(matTex, samp, sampleUv);
  let depthProxy = clamp(matInfo.y, 0.0, 1.0);
  let ao = select(1.0, textureSample(aoTex, samp, sampleUv).x, frame.aoEnabled > 0.5);
  let dof = textureSample(dofTex, samp, sampleUv).xyz;
  let motion = select(dof, textureSample(motionTex, samp, sampleUv).xyz, frame.motionBlurEnabled > 0.5);
  var ssr = motion;
  if (frame.ssrEnabled > 0.5) {
    let ssrSample = textureSample(ssrTex, samp, sampleUv).xyz;
    let roughness = clamp(matInfo.z, 0.0, 1.0);
    let metallic = clamp(matInfo.w, 0.0, 1.0);
    let roughnessCutoff = max(0.001, frame.ssrRoughnessCutoff);
    let smoothMask = 1.0 - smoothstep(roughnessCutoff * 0.7, roughnessCutoff, roughness);
    let reflectiveMask = clamp(smoothMask * mix(0.25, 1.0, metallic), 0.0, 1.0);
    let ssrBlend = clamp(frame.ssrResolve * mix(0.14, 0.45, reflectiveMask), 0.0, 0.45);
    ssr = mix(motion, ssrSample, ssrBlend);
  }
  let bloom = select(vec3f(0), textureSample(bloomTex, samp, sampleUv).xyz, frame.bloomEnabled > 0.5);
  let bloomMix = 0.2 + max(0.0, frame.bloomIntensity) * 0.55;
  var col = ssr * ao + bloom * bloomMix;

  if (frame.debugView > 0.5 && frame.debugView < 1.5) {
    let clusterTile = vec2f(max(1.0, frame.clusterTileX), max(1.0, frame.clusterTileY));
    let clusterCoord = floor(sampleUv * vec2f(frame.width, frame.height) / clusterTile);
    let clusterDensity = hash12(clusterCoord);
    let clusterColor = vec3f(0.1 + clusterDensity * 0.85, 0.1, 0.35 + (1.0 - clusterDensity) * 0.55);
    let edge = step(0.985, fract(sampleUv.x * frame.width / clusterTile.x)) + step(0.985, fract(sampleUv.y * frame.height / clusterTile.y));
    let gridMix = clamp(edge, 0.0, 1.0);
    let depthFade = clamp(1.0 - depthProxy * 0.85, 0.25, 1.0);
    let sceneBase = clamp(col * 0.9 + vec3f(0.03), vec3f(0.0), vec3f(1.0));
    let debugTint = mix(clusterColor, vec3f(0.98, 0.98, 1.0), gridMix * 0.65) * depthFade;
    let debugColor = mix(sceneBase, debugTint, 0.6);
    return vec4f(debugColor, 1);
  }

  if (frame.debugView > 1.5 && frame.debugView < 2.5) {
    let lightHeat = clamp(dot(col + bloom, vec3f(0.2126, 0.7152, 0.0722)) * 2.0, 0.0, 1.0);
    let heat = vec3f(0.15 + lightHeat * 0.8, 0.2 + (1.0 - lightHeat) * 0.45, 0.1);
    return vec4f(heat, 1);
  }

  if (frame.debugView > 2.5) {
    let sceneLuma = dot(motion, vec3f(0.2126, 0.7152, 0.0722));
    let shadowFromAo = clamp(1.0 - ao, 0.0, 1.0);
    var shadowStrength = clamp(shadowFromAo * 0.75 + (1.0 - sceneLuma) * 0.2 + depthProxy * 0.1, 0.0, 1.0);
    if (frame.shadowsEnabled < 0.5) {
      shadowStrength = shadowStrength * 0.3;
    }
    return vec4f(vec3f(shadowStrength), 1);
  }

  if (frame.colorGradingEnabled > 0.5) {
    col = col * exp2(frame.exposure);
    let luma = dot(col, vec3f(0.2126, 0.7152, 0.0722));
    col = vec3f(luma) + (col - vec3f(luma)) * frame.saturation;
    col = (col - vec3f(0.5)) * frame.contrast + vec3f(0.5);
    col += vec3f(frame.temperature * 0.02 + frame.tint * 0.01, -frame.tint * 0.01, -frame.temperature * 0.02);
    return vec4f(aces(max(col, vec3f(0))), 1);
  }
  return vec4f(clamp(col, vec3f(0), vec3f(1)), 1);
}
`;

export class WebGpuPostGraph {
  private readonly device: GPUDevice;
  private readonly context: GPUCanvasContext;
  private readonly format: GPUTextureFormat;
  private readonly camera: Camera;
  private readonly resources = new FrameResourceStore();
  private readonly stageResources = new FrameResourceStore();
  private width = 0;
  private height = 0;
  private readonly postUniformBuffer: GPUBuffer;
  private readonly sceneUniformBuffer: GPUBuffer;
  private readonly shadowCasterBuffer: GPUBuffer;
  private readonly pointLightBuffer: GPUBuffer;
  private readonly clusterUniformBuffer: GPUBuffer;
  private clusterRecordBuffer: GPUBuffer;
  private clusterLightIndexBuffer: GPUBuffer;
  private clusterRecordCapacity = 0;
  private clusterLightIndexCapacity = 0;
  private readonly linearSampler: GPUSampler;
  private readonly whiteTexture: LoadedTexture;
  private readonly whiteTextureArrayView: GPUTextureView;
  private readonly flatNormalTexture: LoadedTexture;
  private readonly ormDefaultTexture: LoadedTexture;
  private readonly textureCache = new Map<string, Promise<LoadedTexture>>();
  private readonly textureArrayCache = new Map<string, Promise<LoadedTexture>>();
  private readonly skyPipeline: GPURenderPipeline;
  private readonly scenePipeline: GPURenderPipeline;
  private readonly sceneInstancedPipeline: GPURenderPipeline;
  private readonly shadowMapPipeline: GPURenderPipeline;
  private readonly shadowMapInstancedPipeline: GPURenderPipeline;
  private readonly shadowMapInstancedExternalPipeline: GPURenderPipeline;
  private readonly externalInstancedPipelineCache = new Map<string, GPURenderPipeline>();
  private readonly aoPipeline: GPURenderPipeline;
  private readonly bloomPrefilterPipeline: GPURenderPipeline;
  private readonly bloomBlurHorizontalPipeline: GPURenderPipeline;
  private readonly bloomBlurVerticalPipeline: GPURenderPipeline;
  private readonly dofPrefilterPipeline: GPURenderPipeline;
  private readonly dofBlurHorizontalPipeline: GPURenderPipeline;
  private readonly dofBlurVerticalCombinePipeline: GPURenderPipeline;
  private readonly ssrPipeline: GPURenderPipeline;
  private readonly motionBlurPipeline: GPURenderPipeline;
  private readonly compositePipeline: GPURenderPipeline;
  private skyBindGroup: GPUBindGroup | null = null;
  private aoBindGroup: GPUBindGroup | null = null;
  private bloomPrefilterBindGroup: GPUBindGroup | null = null;
  private bloomBlurHorizontalBindGroup: GPUBindGroup | null = null;
  private bloomBlurVerticalBindGroup: GPUBindGroup | null = null;
  private dofPrefilterBindGroup: GPUBindGroup | null = null;
  private dofBlurHorizontalBindGroup: GPUBindGroup | null = null;
  private dofBlurVerticalCombineBindGroup: GPUBindGroup | null = null;
  private ssrBindGroup: GPUBindGroup | null = null;
  private motionBlurBindGroup: GPUBindGroup | null = null;
  private compositeBindGroup: GPUBindGroup | null = null;
  private gpuMeshes: GpuMesh[] = [];
  private readonly gpuMeshCache = new Map<SceneMeshInstance, GpuMesh>();
  private gpuInstancedMeshes: GpuInstancedMesh[] = [];
  private readonly gpuInstancedMeshCache = new Map<SceneInstancedMesh, GpuInstancedMesh>();
  private sceneTextureLibrary: Record<string, string> = {};
  private sceneTextureArrayLibrary: Record<string, string[]> = {};
  private sceneDirectionalLightingEnabled = true;
  private sceneDirectionalLightingIntensity = 1;
  private sceneKeyLightDirection: [number, number, number] | null = null;
  private sceneShadowMapBiasOverride: number | null = null;
  private sceneShadowMapSoftnessOverride: number | null = null;
  private scenePointLights: Array<{
    type: 'point' | 'spot' | 'area';
    position: [number, number, number];
    color: [number, number, number];
    intensity: number;
    range: number;
    castsShadows: boolean;
  }> = [];
  private previousCameraPosition: [number, number, number] | null = null;
  private previousCameraForward: [number, number, number] | null = null;
  private ssrHistoryInitialized = false;
  private readonly shaderOverrides: WebGpuPostGraphShaderOverrides;
  private readonly stageFailurePolicy: WebGpuStageFailurePolicy;
  private readonly stageCpuBudgetMs: number;
  private readonly warnOnExternalLayoutMismatch: boolean;
  private readonly stageMap = new Map<WebGpuStageInjectionPoint, RegisteredWebGpuStage[]>();
  private stageRegistrationCounter = 0;
  private readonly shadowMapUniformBuffer: GPUBuffer;
  private shadowMapTexture: TextureHandle;
  private readonly shadowMapFallbackTexture: TextureHandle;
  private shadowMapResolution = 1024;

  constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    format: GPUTextureFormat,
    camera: Camera,
    options?: WebGpuPostGraphOptions,
  ) {
    this.device = device;
    this.context = context;
    this.format = format;
    this.camera = camera;
    this.shaderOverrides = options?.shaderOverrides ?? {};
    this.stageFailurePolicy = options?.stageFailurePolicy ?? 'skip-stage';
    this.stageCpuBudgetMs = Math.max(0, options?.stageCpuBudgetMs ?? 0);
    this.warnOnExternalLayoutMismatch = options?.warnOnExternalLayoutMismatch ?? true;
    this.postUniformBuffer = device.createBuffer({ size: POST_UNIFORM_FLOAT_COUNT * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.sceneUniformBuffer = device.createBuffer({ size: SCENE_UNIFORM_FLOAT_COUNT * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.shadowCasterBuffer = device.createBuffer({ size: SHADOW_CASTER_FLOAT_COUNT * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.pointLightBuffer = device.createBuffer({ size: POINT_LIGHT_FLOAT_COUNT * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.clusterUniformBuffer = device.createBuffer({ size: CLUSTER_UNIFORM_FLOAT_COUNT * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.shadowMapUniformBuffer = device.createBuffer({ size: SHADOW_MAP_UNIFORM_FLOAT_COUNT * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.clusterRecordBuffer = device.createBuffer({ size: 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.clusterLightIndexBuffer = device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.clusterRecordCapacity = 2;
    this.clusterLightIndexCapacity = 1;
    this.linearSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    this.whiteTexture = this.createSolidTexture(255, 255, 255, 255, 'rgba8unorm-srgb');
    this.whiteTextureArrayView = this.createSingleLayerArrayView(this.whiteTexture.texture);
    this.flatNormalTexture = this.createSolidTexture(128, 128, 255, 255, 'rgba8unorm');
    this.ormDefaultTexture = this.createSolidTexture(255, 255, 255, 255, 'rgba8unorm');
    this.shadowMapFallbackTexture = this.createDepthTexture(this.shadowMapResolution);
    this.shadowMapTexture = this.shadowMapFallbackTexture;
    this.skyPipeline = this.createSkyPipeline();
    this.scenePipeline = this.createScenePipeline();
    this.sceneInstancedPipeline = this.createSceneInstancedPipeline();
    this.shadowMapPipeline = this.createShadowMapPipeline();
    this.shadowMapInstancedPipeline = this.createShadowMapInstancedPipeline();
    this.shadowMapInstancedExternalPipeline = this.createShadowMapInstancedExternalPipeline();
    this.aoPipeline = this.createPostPipeline(this.resolveShaderCode('ambientOcclusion', AO_SHADER), 'r8unorm');
    this.bloomPrefilterPipeline = this.createPostPipeline(this.resolveShaderCode('bloomPrefilter', BLOOM_PREFILTER_SHADER), 'rgba16float');
    this.bloomBlurHorizontalPipeline = this.createPostPipeline(this.resolveShaderCode('bloomBlurHorizontal', BLOOM_BLUR_HORIZONTAL_SHADER), 'rgba16float');
    this.bloomBlurVerticalPipeline = this.createPostPipeline(this.resolveShaderCode('bloomBlurVertical', BLOOM_BLUR_VERTICAL_SHADER), 'rgba16float');
    this.dofPrefilterPipeline = this.createPostPipeline(this.resolveShaderCode('depthOfFieldPrefilter', DOF_PREFILTER_SHADER), 'rgba16float');
    this.dofBlurHorizontalPipeline = this.createPostPipeline(this.resolveShaderCode('depthOfFieldBlurHorizontal', DOF_BLUR_HORIZONTAL_SHADER), 'rgba16float');
    this.dofBlurVerticalCombinePipeline = this.createPostPipeline(this.resolveShaderCode('depthOfFieldBlurVerticalCombine', DOF_BLUR_VERTICAL_COMBINE_SHADER), 'rgba16float');
    this.ssrPipeline = this.createPostPipeline(this.resolveShaderCode('screenSpaceReflections', SSR_SHADER), 'rgba16float');
    this.motionBlurPipeline = this.createPostPipeline(this.resolveShaderCode('motionBlur', MOTION_BLUR_SHADER), 'rgba16float');
    this.compositePipeline = this.createPostPipeline(this.resolveShaderCode('composite', COMPOSITE_SHADER), this.format);
    this.stageMap.set('pre-scene', []);
    this.stageMap.set('pre-post', []);
    this.stageMap.set('pre-composite', []);
    for (const stage of options?.stages ?? []) {
      this.registerStage(stage);
    }
  }

  registerStage(stage: WebGpuStage): void {
    const registrationIndex = this.stageRegistrationCounter;
    this.stageRegistrationCounter += 1;
    const registeredStage: RegisteredWebGpuStage = {
      ...stage,
      registrationIndex,
    };
    const stageList = this.stageMap.get(stage.injectionPoint);
    if (!stageList) {
      throw new Error(`Unknown stage injection point '${stage.injectionPoint}'.`);
    }
    if (stageList.some((existingStage) => existingStage.name === stage.name)) {
      console.warn(
        `WebGpuPostGraph stage '${stage.name}' is already registered at injection point '${stage.injectionPoint}'.`,
      );
    }
    stageList.push(registeredStage);
    stageList.sort((left, right) => {
      const leftOrder = left.order ?? 0;
      const rightOrder = right.order ?? 0;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left.registrationIndex - right.registrationIndex;
    });
  }

  private isTextureHandle(value: unknown): value is TextureHandle {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const candidate = value as Partial<TextureHandle>;
    return !!candidate.texture && !!candidate.view && typeof candidate.format === 'string';
  }

  private detectStageResourceKind(value: unknown): WebGpuStageResourceKind | 'unknown' {
    if (value instanceof GPUBuffer) {
      return 'buffer';
    }
    if (this.isTextureHandle(value)) {
      return 'texture-handle';
    }
    if (value instanceof GPUTextureView) {
      return 'texture-view';
    }
    if (value instanceof GPUSampler) {
      return 'sampler';
    }
    if (typeof value === 'number') {
      return 'number';
    }
    if (typeof value === 'boolean') {
      return 'boolean';
    }
    if (typeof value === 'string') {
      return 'string';
    }
    if (value && typeof value === 'object') {
      return 'object';
    }
    return 'unknown';
  }

  private validateStageResourceContracts(
    stage: WebGpuStage,
    contracts: WebGpuStageResourceContract[] | undefined,
    phase: 'reads' | 'writes',
    stageResources: FrameResourceStore,
  ): void {
    for (const contract of contracts ?? []) {
      const required = contract.required ?? true;
      const hasResource = stageResources.has(contract.name);
      if (!hasResource) {
        if (required) {
          throw new Error(
            `Stage '${stage.name}' ${phase} contract missing required resource '${contract.name}'.`,
          );
        }
        continue;
      }
      if (!contract.kind) {
        continue;
      }
      const resourceValue = stageResources.get(contract.name);
      const detectedKind = this.detectStageResourceKind(resourceValue);
      if (detectedKind !== contract.kind) {
        throw new Error(
          `Stage '${stage.name}' ${phase} contract type mismatch for resource '${contract.name}': expected '${contract.kind}', got '${detectedKind}'.`,
        );
      }
    }
  }

  setScene(scene: RenderScene): void {
    this.sceneTextureLibrary = scene.textureLibrary ?? {};
    this.sceneTextureArrayLibrary = scene.textureArrayLibrary ?? {};
    this.sceneDirectionalLightingEnabled = scene.directionalLightingEnabled !== false;
    this.sceneDirectionalLightingIntensity = this.sceneDirectionalLightingEnabled
      ? Math.max(0, scene.directionalLightingIntensity ?? 1)
      : 0;
    this.sceneKeyLightDirection = scene.keyLightDirection
      ? [scene.keyLightDirection[0], scene.keyLightDirection[1], scene.keyLightDirection[2]]
      : null;
    this.sceneShadowMapBiasOverride = Number.isFinite(scene.shadowMapBiasOverride)
      ? Math.max(0, scene.shadowMapBiasOverride ?? 0)
      : null;
    this.sceneShadowMapSoftnessOverride = Number.isFinite(scene.shadowMapSoftnessOverride)
      ? Math.max(0, scene.shadowMapSoftnessOverride ?? 0)
      : null;
    const activeMeshes = new Set<SceneMeshInstance>();
    const nextGpuMeshes: GpuMesh[] = [];
    for (const mesh of scene.meshes) {
      let gpuMesh = this.gpuMeshCache.get(mesh);
      if (!gpuMesh) {
        gpuMesh = this.uploadMesh(mesh);
        this.gpuMeshCache.set(mesh, gpuMesh);
      }
      this.updateGpuMeshUniforms(mesh, gpuMesh);
      nextGpuMeshes.push(gpuMesh);
      activeMeshes.add(mesh);
    }
    for (const [mesh, gpuMesh] of this.gpuMeshCache.entries()) {
      if (activeMeshes.has(mesh)) {
        continue;
      }
      this.destroyGpuMesh(gpuMesh);
      this.gpuMeshCache.delete(mesh);
    }
    this.gpuMeshes = nextGpuMeshes;

    const activeInstancedMeshes = new Set<SceneInstancedMesh>();
    const nextGpuInstancedMeshes: GpuInstancedMesh[] = [];
    for (const mesh of scene.instancedMeshes ?? []) {
      let gpuMesh = this.gpuInstancedMeshCache.get(mesh);
      if (!gpuMesh) {
        gpuMesh = this.uploadInstancedMesh(mesh);
        this.gpuInstancedMeshCache.set(mesh, gpuMesh);
      }
      this.updateGpuInstancedMeshUniforms(mesh, gpuMesh);
      nextGpuInstancedMeshes.push(gpuMesh);
      activeInstancedMeshes.add(mesh);
    }
    for (const [mesh, gpuMesh] of this.gpuInstancedMeshCache.entries()) {
      if (activeInstancedMeshes.has(mesh)) {
        continue;
      }
      this.destroyGpuInstancedMesh(gpuMesh);
      this.gpuInstancedMeshCache.delete(mesh);
    }
    this.gpuInstancedMeshes = nextGpuInstancedMeshes;

    this.scenePointLights = scene.lights
      .filter((light) => light.type === 'point' || light.type === 'spot' || light.type === 'area')
      .slice(0, MAX_DYNAMIC_POINT_LIGHTS)
      .map((light) => ({
        type: light.type,
        position: [light.position[0], light.position[1], light.position[2]],
        color: [light.color[0], light.color[1], light.color[2]],
        intensity: light.intensity,
        range: light.range,
        castsShadows: light.castsShadows,
      }));
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, width); const h = Math.max(1, height);
    if (this.width === w && this.height === h) { return; }
    this.width = w; this.height = h;
    for (const name of ['scene-hdr', 'scene-normal', 'scene-material', 'ssr', 'ssr-history', 'ao', 'bloom-prefilter', 'bloom-temp', 'bloom', 'dof-prefilter', 'dof-temp', 'dof', 'motion-blur'] as const) {
      const fmt = name === 'ao' ? 'r8unorm' : 'rgba16float';
      this.allocTexture(name, fmt);
    }
    this.allocTexture('scene-depth', 'depth24plus');
    this.ssrHistoryInitialized = false;
    this.rebuildBindGroups();
  }

  render(
    config: RendererConfig,
    timeSeconds: number,
    deltaTimeMs: number,
    frameIndex: number,
  ): RenderPassTimingResult[] {
    const timings: RenderPassTimingResult[] = [];
    this.syncGpuSceneState();
    const cp = this.camera.getLocation(); const cf = this.camera.forwardDir();
    const cr = this.camera.rightDir(); const cu = this.camera.upDir();
    const frustumCullingEnabled = config.visibility.frustumCullingEnabled;
    const frustumPadding = Math.max(1, config.visibility.frustumCullingPadding);
    const tanHalfFovY = Math.tan(this.camera.getFovYRadians() * 0.5);
    const tanHalfFovX = tanHalfFovY * Math.max(0.0001, this.width / Math.max(1, this.height));
    const cameraNear = this.camera.getNear();
    const cameraFar = this.camera.getFar();
    const ssrFeatureEnabled =
      config.screenSpaceReflections.enabled && config.screenSpaceReflections.experimentalEnabled;
    const ssrStage = ssrFeatureEnabled ? Math.max(0, Math.min(2, config.screenSpaceReflections.stage)) : 0;
    const ssrPassEnabled = ssrStage >= 1;
    const ssrCopyEnabled = ssrStage >= 2;

    const previousCamera = this.previousCameraPosition ?? cp;
    const previousForward = this.previousCameraForward ?? cf;
    const deltaPosition: [number, number, number] = [
      cp[0] - previousCamera[0],
      cp[1] - previousCamera[1],
      cp[2] - previousCamera[2],
    ];
    this.previousCameraPosition = cp;
    this.previousCameraForward = cf;

    const deltaForward: [number, number, number] = [
      cf[0] - previousForward[0],
      cf[1] - previousForward[1],
      cf[2] - previousForward[2],
    ];

    const positionDeltaRight =
      deltaPosition[0] * cr[0] + deltaPosition[1] * cr[1] + deltaPosition[2] * cr[2];
    const positionDeltaUp =
      deltaPosition[0] * cu[0] + deltaPosition[1] * cu[1] + deltaPosition[2] * cu[2];
    const motionDeltaForward =
      deltaPosition[0] * cf[0] + deltaPosition[1] * cf[1] + deltaPosition[2] * cf[2];
    const angularDeltaRight =
      deltaForward[0] * cr[0] + deltaForward[1] * cr[1] + deltaForward[2] * cr[2];
    const angularDeltaUp =
      deltaForward[0] * cu[0] + deltaForward[1] * cu[1] + deltaForward[2] * cu[2];

    const motionDeltaRight = positionDeltaRight + angularDeltaRight * 3.2;
    const motionDeltaUp = positionDeltaUp + angularDeltaUp * 3.2;
    const motionShutterScale = Math.min(2, Math.max(0, config.motionBlur.shutterAngle / 360));

    const debugViewIndex =
      config.clustered.debugView === 'clusters'
        ? 1
        : config.clustered.debugView === 'lights'
          ? 2
          : config.clustered.debugView === 'shadows'
            ? 3
            : 0;

    const postData = new Float32Array([
      timeSeconds, this.width, this.height, config.bloom.intensity,
      config.bloom.threshold, config.bloom.knee, config.depthOfField.focusDistance, config.depthOfField.focusRange,
      config.depthOfField.aperture, config.depthOfField.maxCoC, 0, config.colorGrading.exposure,
      config.colorGrading.contrast, config.colorGrading.saturation, config.colorGrading.temperature, config.colorGrading.tint,
      config.ambientOcclusion.enabled ? 1 : 0, 0, 0, 0,
      config.bloom.enabled ? 1 : 0, config.depthOfField.enabled ? 1 : 0, 0, debugViewIndex,
      config.motionBlur.enabled ? 1 : 0, config.motionBlur.intensity, motionShutterScale, config.motionBlur.sampleCount,
      motionDeltaRight, motionDeltaUp, motionDeltaForward, 0,
      Math.max(1, config.clustered.tileSizeX), Math.max(1, config.clustered.tileSizeY), config.shadows.enabled ? 1 : 0, config.colorGrading.enabled ? 1 : 0,
      ssrPassEnabled ? 1 : 0,
      config.screenSpaceReflections.maxSteps,
      config.screenSpaceReflections.maxDistance,
      config.screenSpaceReflections.thickness,
      config.screenSpaceReflections.stride,
      config.screenSpaceReflections.resolve,
      config.screenSpaceReflections.roughnessCutoff,
      0,
    ]);
    this.device.queue.writeBuffer(this.postUniformBuffer, 0, postData);

    const keyLight = (() => {
      const azimuthRadians = (config.shadows.keyLightAzimuthDeg * Math.PI) / 180;
      const elevationRadians = (config.shadows.keyLightElevationDeg * Math.PI) / 180;
      const horizontal = Math.cos(elevationRadians);
      return [
        Math.cos(azimuthRadians) * horizontal,
        Math.sin(elevationRadians),
        Math.sin(azimuthRadians) * horizontal,
      ] as const;
    })();
    const sceneKeyLight = this.sceneKeyLightDirection ?? keyLight;
    const shadowMapTechniqueEnabled = config.shadows.technique === 'shadow-map';
    this.ensureShadowMapResolution(config.shadows.directionalResolution);
    this.updateShadowMapUniformData(sceneKeyLight, config, shadowMapTechniqueEnabled);

    const directionalLightingIntensity = this.sceneDirectionalLightingEnabled
      ? this.sceneDirectionalLightingIntensity
      : 0;

    const sceneUniformData = new Float32Array([
      timeSeconds, this.width, this.height, 0,
      cp[0],cp[1],cp[2],0, cf[0],cf[1],cf[2],0, cr[0],cr[1],cr[2],0, cu[0],cu[1],cu[2],0,
      this.camera.getFovYRadians(), this.camera.getNear(), this.camera.getFar(), config.shadows.enabled ? 1 : 0,
      config.fog.enabled?1:0, config.fog.density, config.fog.startDistance, config.fog.endDistance,
      config.fog.color[0], config.fog.color[1], config.fog.color[2], config.fog.heightFalloff,
      sceneKeyLight[0], sceneKeyLight[1], sceneKeyLight[2], directionalLightingIntensity,
      this.detectShadowReceiverHeight(), this.detectShadowReceiverBand(),
      Math.max(0, Math.min(2.5, config.shadows.pointShadowStrength)),
      Math.max(0.1, Math.min(0.95, config.shadows.pointShadowSoftness)),
      Math.max(0.1, Math.min(0.95, config.shadows.spotShadowSoftness)),
      Math.max(0.1, Math.min(0.95, config.shadows.areaShadowSoftness)),
      0,
      0,
    ]);
    this.device.queue.writeBuffer(this.sceneUniformBuffer, 0, sceneUniformData);

    const shadowCasterData = new Float32Array(SHADOW_CASTER_FLOAT_COUNT);
    let shadowCasterCount = 0;
    const shadowCastingPointLights = this.scenePointLights.filter((light) => light.castsShadows);
    for (const mesh of this.gpuMeshes) {
      if (mesh.transparent || !mesh.castsShadows) {
        continue;
      }
      if (shadowCasterCount >= MAX_SHADOW_CASTERS) {
        break;
      }
      const m = mesh.worldTransform;
      const cx = mesh.boundsCenter[0];
      const cy = mesh.boundsCenter[1];
      const cz = mesh.boundsCenter[2];
      const worldX = m[0] * cx + m[4] * cy + m[8] * cz + m[12];
      const worldY = m[1] * cx + m[5] * cy + m[9] * cz + m[13];
      const worldZ = m[2] * cx + m[6] * cy + m[10] * cz + m[14];
      const scaleX = Math.hypot(m[0], m[1], m[2]);
      const scaleY = Math.hypot(m[4], m[5], m[6]);
      const scaleZ = Math.hypot(m[8], m[9], m[10]);
      const rawRadius = mesh.boundsRadius * Math.max(scaleX, scaleY, scaleZ);
      const radius = rawRadius;
      const isLikelyReceiverSurface =
        scaleY < Math.max(0.06, scaleX * 0.12) &&
        scaleY < Math.max(0.06, scaleZ * 0.12);
      if (isLikelyReceiverSurface) {
        continue;
      }
      if (radius < 0.08 || radius > 6) {
        continue;
      }
      const base = shadowCasterCount * 4;
      shadowCasterData[base] = worldX;
      shadowCasterData[base + 1] = worldY;
      shadowCasterData[base + 2] = worldZ;
      shadowCasterData[base + 3] = radius;
      shadowCasterCount += 1;
    }
    for (const [inst, mesh] of this.gpuInstancedMeshCache.entries()) {
      if (shadowCasterCount >= MAX_SHADOW_CASTERS) {
        break;
      }
      if (!mesh.castsShadows || mesh.drawSourceMode !== 'cpuPacked') {
        continue;
      }
      const localCenter = mesh.localBoundsCenter;
      const localRadius = mesh.localBoundsRadius;
      for (const transform of inst.instanceTransforms) {
        if (shadowCasterCount >= MAX_SHADOW_CASTERS) {
          break;
        }

        const worldX =
          transform[0] * localCenter[0] +
          transform[4] * localCenter[1] +
          transform[8] * localCenter[2] +
          transform[12];
        const worldY =
          transform[1] * localCenter[0] +
          transform[5] * localCenter[1] +
          transform[9] * localCenter[2] +
          transform[13];
        const worldZ =
          transform[2] * localCenter[0] +
          transform[6] * localCenter[1] +
          transform[10] * localCenter[2] +
          transform[14];
        const scaleX = Math.hypot(transform[0], transform[1], transform[2]);
        const scaleY = Math.hypot(transform[4], transform[5], transform[6]);
        const scaleZ = Math.hypot(transform[8], transform[9], transform[10]);
        const rawRadius = localRadius * Math.max(scaleX, scaleY, scaleZ);
        const radius = rawRadius;
        if (radius < 0.08 || radius > 6) {
          continue;
        }

        // Keep only casters that can plausibly occlude at least one shadow-casting point light.
        if (shadowCastingPointLights.length > 0) {
          let potentiallyRelevant = false;
          for (const light of shadowCastingPointLights) {
            const dx = worldX - light.position[0];
            const dy = worldY - light.position[1];
            const dz = worldZ - light.position[2];
            const maxDistance = light.range + radius + 0.4;
            if (dx * dx + dy * dy + dz * dz <= maxDistance * maxDistance) {
              potentiallyRelevant = true;
              break;
            }
          }
          if (!potentiallyRelevant) {
            continue;
          }
        }

        const base = shadowCasterCount * 4;
        shadowCasterData[base] = worldX;
        shadowCasterData[base + 1] = worldY;
        shadowCasterData[base + 2] = worldZ;
        shadowCasterData[base + 3] = radius;
        shadowCasterCount += 1;
      }
    }
    this.device.queue.writeBuffer(this.shadowCasterBuffer, 0, shadowCasterData);

    const clusteredLightingData = this.buildClusteredLightingData(config);

    const pointLightData = new Float32Array(POINT_LIGHT_FLOAT_COUNT);
    if (clusteredLightingData.valid) {
      pointLightData[0] = this.scenePointLights.length;
    } else {
      pointLightData[0] = 0;
    }
    for (let lightIndex = 0; lightIndex < this.scenePointLights.length; lightIndex += 1) {
      if (!clusteredLightingData.valid) {
        break;
      }
      const light = this.scenePointLights[lightIndex];
      const base = 4 + lightIndex * 12;
      const softness = light.type === 'spot'
        ? config.shadows.spotShadowSoftness
        : light.type === 'area'
          ? config.shadows.areaShadowSoftness
          : config.shadows.pointShadowSoftness;
      pointLightData[base + 0] = light.position[0];
      pointLightData[base + 1] = light.position[1];
      pointLightData[base + 2] = light.position[2];
      const packedRange = Math.max(0.001, light.range);
      pointLightData[base + 3] = light.castsShadows ? packedRange : -packedRange;
      pointLightData[base + 4] = light.color[0];
      pointLightData[base + 5] = light.color[1];
      pointLightData[base + 6] = light.color[2];
      pointLightData[base + 7] = Math.max(0, light.intensity);
      pointLightData[base + 8] = Math.max(0.1, Math.min(0.95, softness));
      pointLightData[base + 9] = light.type === 'spot' ? 1 : light.type === 'area' ? 2 : 0;
      pointLightData[base + 10] = 0;
      pointLightData[base + 11] = 0;
    }
    this.device.queue.writeBuffer(this.pointLightBuffer, 0, pointLightData);
    this.device.queue.writeBuffer(
      this.clusterUniformBuffer,
      0,
      clusteredLightingData.uniformData.buffer,
      clusteredLightingData.uniformData.byteOffset,
      clusteredLightingData.uniformData.byteLength,
    );
    this.ensureClusterStorageCapacity(
      clusteredLightingData.clusterRecords.length,
      clusteredLightingData.clusterLightIndices.length,
    );
    this.device.queue.writeBuffer(
      this.clusterRecordBuffer,
      0,
      clusteredLightingData.clusterRecords.buffer,
      clusteredLightingData.clusterRecords.byteOffset,
      clusteredLightingData.clusterRecords.byteLength,
    );
    this.device.queue.writeBuffer(
      this.clusterLightIndexBuffer,
      0,
      clusteredLightingData.clusterLightIndices.buffer,
      clusteredLightingData.clusterLightIndices.byteOffset,
      clusteredLightingData.clusterLightIndices.byteLength,
    );

    this.stageResources.clear();
    this.stageResources.set('frame-index', frameIndex);
    this.stageResources.set('frame-time-seconds', timeSeconds);
    this.stageResources.set('frame-delta-ms', deltaTimeMs);
    this.stageResources.set('viewport-width', this.width);
    this.stageResources.set('viewport-height', this.height);

    const hdr = this.req('scene-hdr'); const norm = this.req('scene-normal'); const mat = this.req('scene-material');
    const depth = this.req('scene-depth'); const ssr = this.req('ssr'); const ssrHistory = this.req('ssr-history'); const ao = this.req('ao'); const bloomPrefilter = this.req('bloom-prefilter');
    const bloomTemp = this.req('bloom-temp'); const bloom = this.req('bloom');
    const dofPrefilter = this.req('dof-prefilter'); const dofTemp = this.req('dof-temp');
    const dof = this.req('dof'); const motionBlur = this.req('motion-blur');
    this.stageResources.set('scene-hdr', hdr);
    this.stageResources.set('scene-normal', norm);
    this.stageResources.set('scene-material', mat);
    this.stageResources.set('scene-depth', depth);
    this.stageResources.set('ssr', ssr);
    this.stageResources.set('ssr-history', ssrHistory);
    this.stageResources.set('ao', ao);
    this.stageResources.set('bloom-prefilter', bloomPrefilter);
    this.stageResources.set('bloom-temp', bloomTemp);
    this.stageResources.set('bloom', bloom);
    this.stageResources.set('dof-prefilter', dofPrefilter);
    this.stageResources.set('dof-temp', dofTemp);
    this.stageResources.set('dof', dof);
    this.stageResources.set('motion-blur', motionBlur);
    const canvas = this.context.getCurrentTexture().createView();
    this.stageResources.set('canvas-view', canvas);
    const enc = this.device.createCommandEncoder();

    this.executeStages(
      'pre-scene',
      timings,
      {
        device: this.device,
        encoder: enc,
        config,
        frameIndex,
        timeSeconds,
        deltaTimeMs,
        width: this.width,
        height: this.height,
        resources: this.stageResources,
      },
    );

    this.tp(timings, 'shadow-map', () => {
      if (!config.shadows.enabled || !shadowMapTechniqueEnabled) {
        return;
      }
      this.renderShadowMap(enc);
    });

    this.tp(timings, 'scene-prepass', () => {
      const pass = enc.beginRenderPass({
        colorAttachments: [
          { view: hdr.view, loadOp: 'clear', storeOp: 'store', clearValue: {r:0,g:0,b:0,a:1} },
          { view: norm.view, loadOp: 'clear', storeOp: 'store', clearValue: {r:.5,g:.5,b:1,a:1} },
          { view: mat.view, loadOp: 'clear', storeOp: 'store', clearValue: {r:0,g:1,b:0,a:1} },
        ],
        depthStencilAttachment: { view: depth.view, depthClearValue:1, depthLoadOp:'clear', depthStoreOp:'store' },
      });

      if (this.skyBindGroup) { pass.setPipeline(this.skyPipeline); pass.setBindGroup(0, this.skyBindGroup); pass.draw(3); }
      if (this.gpuMeshes.length > 0) {
        pass.setPipeline(this.scenePipeline);
        const frameGroup = this.device.createBindGroup({
          layout: this.scenePipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: this.sceneUniformBuffer } },
            { binding: 1, resource: { buffer: this.shadowCasterBuffer } },
            { binding: 2, resource: { buffer: this.pointLightBuffer } },
            { binding: 3, resource: { buffer: this.clusterUniformBuffer } },
            { binding: 4, resource: { buffer: this.clusterRecordBuffer } },
            { binding: 5, resource: { buffer: this.clusterLightIndexBuffer } },
            { binding: 6, resource: { buffer: this.shadowMapUniformBuffer } },
            { binding: 7, resource: this.shadowMapTexture.view },
          ],
        });
        pass.setBindGroup(0, frameGroup);
        for (const m of this.gpuMeshes) {
          if (frustumCullingEnabled) {
            const worldCenter = this.computeWorldBoundsCenter(m.worldTransform, m.boundsCenter);
            const scaleX = Math.hypot(m.worldTransform[0], m.worldTransform[1], m.worldTransform[2]);
            const scaleY = Math.hypot(m.worldTransform[4], m.worldTransform[5], m.worldTransform[6]);
            const scaleZ = Math.hypot(m.worldTransform[8], m.worldTransform[9], m.worldTransform[10]);
            const worldRadius = m.boundsRadius * Math.max(scaleX, scaleY, scaleZ);
            const visible = this.isSphereVisibleInFrustum(
              worldCenter,
              worldRadius * frustumPadding,
              cp,
              cf,
              cr,
              cu,
              tanHalfFovX,
              tanHalfFovY,
              cameraNear,
              cameraFar,
            );
            if (!visible) {
              continue;
            }
          }
          pass.setBindGroup(1, m.meshBindGroup);
          pass.setVertexBuffer(0, m.vertexBuffer);
          pass.setIndexBuffer(m.indexBuffer, 'uint32');
          pass.drawIndexed(m.indexCount);
        }
      }

      if (this.gpuInstancedMeshes.length > 0) {
        const frameGroupCache = new Map<GPURenderPipeline, GPUBindGroup>();
        let currentInstancedPipeline: GPURenderPipeline | null = null;
        for (const m of this.gpuInstancedMeshes) {
          if (m.instanceCount <= 0) {
            continue;
          }
          if (frustumCullingEnabled && m.worldBoundsRadius > 0) {
            const visible = this.isSphereVisibleInFrustum(
              m.worldBoundsCenter,
              m.worldBoundsRadius * frustumPadding,
              cp,
              cf,
              cr,
              cu,
              tanHalfFovX,
              tanHalfFovY,
              cameraNear,
              cameraFar,
            );
            if (!visible) {
              continue;
            }
          }
          let activeInstancedPipeline = this.sceneInstancedPipeline;
          if (m.drawSourceMode === 'gpuExternal') {
            if (!m.externalPipelineSignature) {
              console.warn('Skipping gpuExternal instanced draw with missing pipeline signature.');
              continue;
            }
            const externalPipeline = this.externalInstancedPipelineCache.get(
              m.externalPipelineSignature,
            );
            if (!externalPipeline) {
              console.warn('Skipping gpuExternal instanced draw with missing pipeline.');
              continue;
            }
            activeInstancedPipeline = externalPipeline;
          }
          if (currentInstancedPipeline !== activeInstancedPipeline) {
            pass.setPipeline(activeInstancedPipeline);
            currentInstancedPipeline = activeInstancedPipeline;
          }
          let frameGroup = frameGroupCache.get(activeInstancedPipeline);
          if (!frameGroup) {
            frameGroup = this.device.createBindGroup({
              layout: activeInstancedPipeline.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: { buffer: this.sceneUniformBuffer } },
                { binding: 1, resource: { buffer: this.shadowCasterBuffer } },
                { binding: 2, resource: { buffer: this.pointLightBuffer } },
                { binding: 3, resource: { buffer: this.clusterUniformBuffer } },
                { binding: 4, resource: { buffer: this.clusterRecordBuffer } },
                { binding: 5, resource: { buffer: this.clusterLightIndexBuffer } },
                { binding: 6, resource: { buffer: this.shadowMapUniformBuffer } },
                { binding: 7, resource: this.shadowMapTexture.view },
              ],
            });
            frameGroupCache.set(activeInstancedPipeline, frameGroup);
          }
          pass.setBindGroup(0, frameGroup);
          const meshGroup =
            activeInstancedPipeline === this.sceneInstancedPipeline
              ? m.meshBindGroup
              : this.createInstancedMeshBindGroup(
                  activeInstancedPipeline,
                  m.materialBuffer,
                  m.instancedMaterialTableBuffer,
                  m.baseColorView,
                  m.normalView,
                  m.ormView,
                  m.emissiveView,
                );
          pass.setBindGroup(1, meshGroup);
          pass.setVertexBuffer(0, m.vertexBuffer);
          if (m.drawSourceMode === 'gpuExternal') {
            let bufferSlot = 1;
            for (const externalBinding of m.externalInstanceBuffers) {
              pass.setVertexBuffer(bufferSlot, externalBinding.buffer, externalBinding.offset ?? 0);
              bufferSlot += 1;
            }
          } else {
            pass.setVertexBuffer(1, m.instanceBuffer);
          }
          pass.setIndexBuffer(m.indexBuffer, 'uint32');
          pass.drawIndexed(m.indexCount, m.instanceCount);
        }
      }
      pass.end();
    });

    this.executeStages(
      'pre-post',
      timings,
      {
        device: this.device,
        encoder: enc,
        config,
        frameIndex,
        timeSeconds,
        deltaTimeMs,
        width: this.width,
        height: this.height,
        resources: this.stageResources,
      },
    );

    if (ssrCopyEnabled) {
      this.tp(timings, 'screen-space-reflections-copy', () => {
        enc.copyTextureToTexture(
          { texture: hdr.texture },
          { texture: ssr.texture },
          { width: this.width, height: this.height, depthOrArrayLayers: 1 },
        );
      });
    }

    if (ssrPassEnabled && !this.ssrHistoryInitialized) {
      this.tp(timings, 'screen-space-reflections-history-bootstrap', () => {
        enc.copyTextureToTexture(
          { texture: hdr.texture },
          { texture: ssrHistory.texture },
          { width: this.width, height: this.height, depthOrArrayLayers: 1 },
        );
      });
      this.ssrHistoryInitialized = true;
    }

    this.tp(timings, 'ambient-occlusion', () => {
      const pass = enc.beginRenderPass({ colorAttachments: [{view:ao.view, loadOp:'clear', storeOp:'store', clearValue:{r:1,g:1,b:1,a:1}}] });
      if (this.aoBindGroup) { pass.setPipeline(this.aoPipeline); pass.setBindGroup(0, this.aoBindGroup); pass.draw(3); }
      pass.end();
    });
    this.tp(timings, 'screen-space-reflections', () => {
      if (!ssrPassEnabled) {
        return;
      }
      const pass = enc.beginRenderPass({
        colorAttachments: [{
          view: ssr.view,
          loadOp: ssrCopyEnabled ? 'load' : 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        }],
      });
      pass.setPipeline(this.ssrPipeline);
      if (this.ssrBindGroup) {
        pass.setBindGroup(0, this.ssrBindGroup);
      }
      pass.draw(3);
      pass.end();
    });
    this.tp(timings, 'bloom-prefilter', () => {
      const pass = enc.beginRenderPass({ colorAttachments: [{view:bloomPrefilter.view, loadOp:'clear', storeOp:'store', clearValue:{r:0,g:0,b:0,a:1}}] });
      if (this.bloomPrefilterBindGroup) {
        pass.setPipeline(this.bloomPrefilterPipeline);
        pass.setBindGroup(0, this.bloomPrefilterBindGroup);
        pass.draw(3);
      }
      pass.end();
    });
    this.tp(timings, 'bloom-blur-horizontal', () => {
      const pass = enc.beginRenderPass({ colorAttachments: [{view:bloomTemp.view, loadOp:'clear', storeOp:'store', clearValue:{r:0,g:0,b:0,a:1}}] });
      if (this.bloomBlurHorizontalBindGroup) {
        pass.setPipeline(this.bloomBlurHorizontalPipeline);
        pass.setBindGroup(0, this.bloomBlurHorizontalBindGroup);
        pass.draw(3);
      }
      pass.end();
    });
    this.tp(timings, 'bloom-blur-vertical', () => {
      const pass = enc.beginRenderPass({ colorAttachments: [{view:bloom.view, loadOp:'clear', storeOp:'store', clearValue:{r:0,g:0,b:0,a:1}}] });
      if (this.bloomBlurVerticalBindGroup) {
        pass.setPipeline(this.bloomBlurVerticalPipeline);
        pass.setBindGroup(0, this.bloomBlurVerticalBindGroup);
        pass.draw(3);
      }
      pass.end();
    });
    this.tp(timings, 'depth-of-field-prefilter', () => {
      const pass = enc.beginRenderPass({ colorAttachments: [{view:dofPrefilter.view, loadOp:'clear', storeOp:'store', clearValue:{r:0,g:0,b:0,a:0}}] });
      if (this.dofPrefilterBindGroup) {
        pass.setPipeline(this.dofPrefilterPipeline);
        pass.setBindGroup(0, this.dofPrefilterBindGroup);
        pass.draw(3);
      }
      pass.end();
    });
    this.tp(timings, 'depth-of-field-blur-horizontal', () => {
      const pass = enc.beginRenderPass({ colorAttachments: [{view:dofTemp.view, loadOp:'clear', storeOp:'store', clearValue:{r:0,g:0,b:0,a:0}}] });
      if (this.dofBlurHorizontalBindGroup) {
        pass.setPipeline(this.dofBlurHorizontalPipeline);
        pass.setBindGroup(0, this.dofBlurHorizontalBindGroup);
        pass.draw(3);
      }
      pass.end();
    });
    this.tp(timings, 'depth-of-field-blur-vertical', () => {
      const pass = enc.beginRenderPass({ colorAttachments: [{view:dof.view, loadOp:'clear', storeOp:'store', clearValue:{r:0,g:0,b:0,a:1}}] });
      if (this.dofBlurVerticalCombineBindGroup) {
        pass.setPipeline(this.dofBlurVerticalCombinePipeline);
        pass.setBindGroup(0, this.dofBlurVerticalCombineBindGroup);
        pass.draw(3);
      }
      pass.end();
    });
    this.tp(timings, 'motion-blur', () => {
      const pass = enc.beginRenderPass({ colorAttachments: [{view:motionBlur.view, loadOp:'clear', storeOp:'store', clearValue:{r:0,g:0,b:0,a:1}}] });
      if (this.motionBlurBindGroup) { pass.setPipeline(this.motionBlurPipeline); pass.setBindGroup(0, this.motionBlurBindGroup); pass.draw(3); }
      pass.end();
    });

    this.executeStages(
      'pre-composite',
      timings,
      {
        device: this.device,
        encoder: enc,
        config,
        frameIndex,
        timeSeconds,
        deltaTimeMs,
        width: this.width,
        height: this.height,
        resources: this.stageResources,
      },
    );

    this.tp(timings, 'color-grading', () => {
      const pass = enc.beginRenderPass({ colorAttachments: [{view:canvas, loadOp:'clear', storeOp:'store', clearValue:{r:0,g:0,b:0,a:1}}] });
      if (this.compositeBindGroup) { pass.setPipeline(this.compositePipeline); pass.setBindGroup(0, this.compositeBindGroup); pass.draw(3); }
      pass.end();
    });

    if (ssrPassEnabled) {
      this.tp(timings, 'screen-space-reflections-history-store', () => {
        enc.copyTextureToTexture(
          { texture: ssr.texture },
          { texture: ssrHistory.texture },
          { width: this.width, height: this.height, depthOrArrayLayers: 1 },
        );
      });
    }

    this.device.queue.submit([enc.finish()]);

    return timings;
  }

  private syncGpuSceneState(): void {
    for (const [mesh, gpuMesh] of this.gpuMeshCache.entries()) {
      this.updateGpuMeshUniforms(mesh, gpuMesh);
    }
    for (const [instancedMesh, gpuMesh] of this.gpuInstancedMeshCache.entries()) {
      this.updateGpuInstancedMeshUniforms(instancedMesh, gpuMesh);
    }
  }

  private ensureShadowMapResolution(resolution: number): void {
    const clampedResolution = Math.max(128, Math.floor(resolution));
    if (this.shadowMapResolution === clampedResolution && this.shadowMapTexture !== this.shadowMapFallbackTexture) {
      return;
    }
    if (this.shadowMapTexture !== this.shadowMapFallbackTexture) {
      this.shadowMapTexture.texture.destroy();
    }
    this.shadowMapResolution = clampedResolution;
    this.shadowMapTexture = this.createDepthTexture(this.shadowMapResolution);
  }

  private updateShadowMapUniformData(
    keyLightDirection: readonly [number, number, number],
    config: RendererConfig,
    shadowMapTechniqueEnabled: boolean,
  ): void {
    const normalize = (value: [number, number, number]): [number, number, number] => {
      const length = Math.hypot(value[0], value[1], value[2]);
      if (length <= 0.000001) {
        return [0, 1, 0];
      }
      return [value[0] / length, value[1] / length, value[2] / length];
    };
    const dot = (a: readonly number[], b: readonly number[]): number => {
      return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    };
    const cross = (a: readonly number[], b: readonly number[]): [number, number, number] => {
      return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
      ];
    };

    const lightForward = normalize([
      -keyLightDirection[0],
      -keyLightDirection[1],
      -keyLightDirection[2],
    ]);
    const provisionalUp: [number, number, number] = Math.abs(lightForward[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    const lightRight = normalize(cross(provisionalUp, lightForward));
    const lightUp = normalize(cross(lightForward, lightRight));

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const mesh of this.gpuMeshes) {
      if (mesh.transparent || !mesh.castsShadows) {
        continue;
      }
      const worldCenter = this.computeWorldBoundsCenter(mesh.worldTransform, mesh.boundsCenter);
      const scaleX = Math.hypot(mesh.worldTransform[0], mesh.worldTransform[1], mesh.worldTransform[2]);
      const scaleY = Math.hypot(mesh.worldTransform[4], mesh.worldTransform[5], mesh.worldTransform[6]);
      const scaleZ = Math.hypot(mesh.worldTransform[8], mesh.worldTransform[9], mesh.worldTransform[10]);
      const worldRadius = mesh.boundsRadius * Math.max(scaleX, scaleY, scaleZ);
      const lx = dot(worldCenter, lightRight);
      const ly = dot(worldCenter, lightUp);
      const lz = dot(worldCenter, lightForward);
      minX = Math.min(minX, lx - worldRadius);
      maxX = Math.max(maxX, lx + worldRadius);
      minY = Math.min(minY, ly - worldRadius);
      maxY = Math.max(maxY, ly + worldRadius);
      minZ = Math.min(minZ, lz - worldRadius);
      maxZ = Math.max(maxZ, lz + worldRadius);
    }
    for (const mesh of this.gpuInstancedMeshes) {
      if (!mesh.castsShadows || mesh.instanceCount <= 0) {
        continue;
      }
      const worldCenter = mesh.worldBoundsCenter;
      const worldRadius = mesh.worldBoundsRadius;
      const lx = dot(worldCenter, lightRight);
      const ly = dot(worldCenter, lightUp);
      const lz = dot(worldCenter, lightForward);
      minX = Math.min(minX, lx - worldRadius);
      maxX = Math.max(maxX, lx + worldRadius);
      minY = Math.min(minY, ly - worldRadius);
      maxY = Math.max(maxY, ly + worldRadius);
      minZ = Math.min(minZ, lz - worldRadius);
      maxZ = Math.max(maxZ, lz + worldRadius);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(minZ)) {
      minX = -10;
      maxX = 10;
      minY = -10;
      maxY = 10;
      minZ = -30;
      maxZ = 30;
    }

    const paddingXY = 0.75;
    const paddingZ = 1.5;
    minX -= paddingXY;
    maxX += paddingXY;
    minY -= paddingXY;
    maxY += paddingXY;
    minZ -= paddingZ;
    maxZ += paddingZ;

    const centerX = (minX + maxX) * 0.5;
    const centerY = (minY + maxY) * 0.5;
    const centerZ = (minZ + maxZ) * 0.5;
    const lightOrigin: [number, number, number] = [
      lightRight[0] * centerX + lightUp[0] * centerY + lightForward[0] * centerZ,
      lightRight[1] * centerX + lightUp[1] * centerY + lightForward[1] * centerZ,
      lightRight[2] * centerX + lightUp[2] * centerY + lightForward[2] * centerZ,
    ];

    const shadowMapBias = this.sceneShadowMapBiasOverride ?? config.shadows.shadowMapBias;
    const shadowMapSoftness = this.sceneShadowMapSoftnessOverride ?? config.shadows.shadowMapSoftness;

    const uniform = new Float32Array([
      lightRight[0], lightRight[1], lightRight[2], minX,
      lightUp[0], lightUp[1], lightUp[2], minY,
      lightForward[0], lightForward[1], lightForward[2], minZ,
      lightOrigin[0], lightOrigin[1], lightOrigin[2], maxX,
      maxY, maxZ, shadowMapTechniqueEnabled ? 1 : 0, config.shadows.shadowMapStrength,
      shadowMapBias, shadowMapSoftness, this.shadowMapResolution, 0,
    ]);
    this.device.queue.writeBuffer(this.shadowMapUniformBuffer, 0, uniform);
  }

  private renderShadowMap(encoder: GPUCommandEncoder): void {
    const pass = encoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: {
        view: this.shadowMapTexture.view,
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    const frameGroupMesh = this.device.createBindGroup({
      layout: this.shadowMapPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.shadowMapUniformBuffer } }],
    });

    const frameGroupInstanced = this.device.createBindGroup({
      layout: this.shadowMapInstancedPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.shadowMapUniformBuffer } }],
    });

    const frameGroupInstancedExternal = this.device.createBindGroup({
      layout: this.shadowMapInstancedExternalPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.shadowMapUniformBuffer } }],
    });

    pass.setPipeline(this.shadowMapPipeline);
    pass.setBindGroup(0, frameGroupMesh);
    for (const mesh of this.gpuMeshes) {
      if (mesh.transparent || !mesh.castsShadows) {
        continue;
      }
      pass.setBindGroup(1, mesh.shadowBindGroup);
      pass.setVertexBuffer(0, mesh.vertexBuffer);
      pass.setIndexBuffer(mesh.indexBuffer, 'uint32');
      pass.drawIndexed(mesh.indexCount);
    }

    for (const mesh of this.gpuInstancedMeshes) {
      if (!mesh.castsShadows || mesh.instanceCount <= 0) {
        continue;
      }
      if (mesh.drawSourceMode === 'gpuExternal') {
        pass.setPipeline(this.shadowMapInstancedExternalPipeline);
        pass.setBindGroup(0, frameGroupInstancedExternal);
        pass.setVertexBuffer(0, mesh.vertexBuffer);
        const matrixBinding = mesh.externalInstanceBuffers.find((binding) => {
          for (const attribute of binding.layout.attributes) {
            if (attribute.shaderLocation === 4) {
              return true;
            }
          }
          return false;
        });
        if (!matrixBinding) {
          continue;
        }
        pass.setVertexBuffer(1, matrixBinding.buffer, matrixBinding.offset ?? 0);
      } else {
        pass.setPipeline(this.shadowMapInstancedPipeline);
        pass.setBindGroup(0, frameGroupInstanced);
        pass.setVertexBuffer(0, mesh.vertexBuffer);
        pass.setVertexBuffer(1, mesh.instanceBuffer);
      }
      pass.setIndexBuffer(mesh.indexBuffer, 'uint32');
      pass.drawIndexed(mesh.indexCount, mesh.instanceCount);
    }
    pass.end();
  }

  private uploadMesh(inst: SceneMeshInstance): GpuMesh {
    const { geometry, material, transform } = inst;
    const vb = this.device.createBuffer({ size: geometry.vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(vb, 0, geometry.vertices.buffer, geometry.vertices.byteOffset, geometry.vertices.byteLength);
    const ib = this.device.createBuffer({ size: geometry.indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(ib, 0, geometry.indices.buffer, geometry.indices.byteOffset, geometry.indices.byteLength);
    const matData = this.buildMaterialData(material);
    const mb = this.device.createBuffer({ size: MATERIAL_UNIFORM_FLOAT_COUNT * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(
      mb,
      0,
      matData.buffer,
      matData.byteOffset,
      matData.byteLength,
    );
    const world = transform ?? mat4Identity();
    const tb = this.device.createBuffer({ size: TRANSFORM_UNIFORM_FLOAT_COUNT * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(tb, 0, world.buffer, world.byteOffset, world.byteLength);

    const geometryBounds = this.computeGeometryBounds(geometry);

    const gpuMesh: GpuMesh = {
      vertexBuffer: vb,
      vertexBufferSize: geometry.vertices.byteLength,
      indexBuffer: ib,
      indexBufferSize: geometry.indices.byteLength,
      indexCount: geometry.indexCount,
      geometryVersion: geometry.version ?? 0,
      materialBuffer: mb,
      transformBuffer: tb,
      meshBindGroup: this.createMeshBindGroup(
        mb,
        tb,
        this.whiteTexture.view,
        this.flatNormalTexture.view,
        this.ormDefaultTexture.view,
        this.whiteTexture.view,
      ),
      worldTransform: new Float32Array(world),
      boundsCenter: geometryBounds.center,
      boundsExtents: geometryBounds.extents,
      boundsRadius: geometryBounds.radius,
      transparent: material.transparent,
      castsShadows: material.castsShadows,
      receivesShadows: material.receivesShadows,
      shadowBindGroup: this.createShadowMeshBindGroup(tb),
    };

    const baseColorTextureUrl = this.resolveMaterialTextureUrl(material, 'baseColor');
    const normalTextureUrl = this.resolveMaterialTextureUrl(material, 'normal');
    const ormTextureUrl = this.resolveMaterialTextureUrl(material, 'orm');
    const emissiveTextureUrl = this.resolveMaterialTextureUrl(material, 'emissive');

    let baseColorView = this.whiteTexture.view;
    let normalView = this.flatNormalTexture.view;
    let ormView = this.ormDefaultTexture.view;
    let emissiveView = this.whiteTexture.view;
    const applyBindGroup = (): void => {
      gpuMesh.meshBindGroup = this.createMeshBindGroup(
        mb,
        tb,
        baseColorView,
        normalView,
        ormView,
        emissiveView,
      );
    };

    if (baseColorTextureUrl) {
      void this.loadTextureFromUrl(baseColorTextureUrl, 'rgba8unorm-srgb')
        .then((loadedTexture) => {
          baseColorView = loadedTexture.view;
          applyBindGroup();
        })
        .catch((error: unknown) => {
          console.warn('Failed to load base color texture.', baseColorTextureUrl, error);
        });
    }

    if (normalTextureUrl) {
      void this.loadTextureFromUrl(normalTextureUrl, 'rgba8unorm')
        .then((loadedTexture) => {
          normalView = loadedTexture.view;
          applyBindGroup();
        })
        .catch((error: unknown) => {
          console.warn('Failed to load normal texture.', normalTextureUrl, error);
        });
    }

    if (ormTextureUrl) {
      void this.loadTextureFromUrl(ormTextureUrl, 'rgba8unorm')
        .then((loadedTexture) => {
          ormView = loadedTexture.view;
          applyBindGroup();
        })
        .catch((error: unknown) => {
          console.warn('Failed to load ORM texture.', ormTextureUrl, error);
        });
    }

    if (emissiveTextureUrl) {
      void this.loadTextureFromUrl(emissiveTextureUrl, 'rgba8unorm-srgb')
        .then((loadedTexture) => {
          emissiveView = loadedTexture.view;
          applyBindGroup();
        })
        .catch((error: unknown) => {
          console.warn('Failed to load emissive texture.', emissiveTextureUrl, error);
        });
    }

    return gpuMesh;
  }

  private destroyGpuMesh(mesh: GpuMesh): void {
    mesh.vertexBuffer.destroy();
    mesh.indexBuffer.destroy();
    mesh.materialBuffer.destroy();
    mesh.transformBuffer.destroy();
  }

  private updateGpuMeshUniforms(inst: SceneMeshInstance, gpuMesh: GpuMesh): void {
    const geometryVersion = inst.geometry.version ?? 0;
    if (geometryVersion !== gpuMesh.geometryVersion) {
      if (inst.geometry.vertices.byteLength > gpuMesh.vertexBufferSize) {
        gpuMesh.vertexBuffer.destroy();
        gpuMesh.vertexBuffer = this.device.createBuffer({
          size: inst.geometry.vertices.byteLength,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        gpuMesh.vertexBufferSize = inst.geometry.vertices.byteLength;
      }
      this.device.queue.writeBuffer(
        gpuMesh.vertexBuffer,
        0,
        inst.geometry.vertices.buffer,
        inst.geometry.vertices.byteOffset,
        inst.geometry.vertices.byteLength,
      );

      if (inst.geometry.indices.byteLength > gpuMesh.indexBufferSize) {
        gpuMesh.indexBuffer.destroy();
        gpuMesh.indexBuffer = this.device.createBuffer({
          size: inst.geometry.indices.byteLength,
          usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        gpuMesh.indexBufferSize = inst.geometry.indices.byteLength;
      }
      this.device.queue.writeBuffer(
        gpuMesh.indexBuffer,
        0,
        inst.geometry.indices.buffer,
        inst.geometry.indices.byteOffset,
        inst.geometry.indices.byteLength,
      );
      gpuMesh.indexCount = inst.geometry.indexCount;
      gpuMesh.geometryVersion = geometryVersion;
    }

    const materialData = this.buildMaterialData(inst.material);
    this.device.queue.writeBuffer(
      gpuMesh.materialBuffer,
      0,
      materialData.buffer,
      materialData.byteOffset,
      materialData.byteLength,
    );

    const world = inst.transform ?? mat4Identity();
    this.device.queue.writeBuffer(
      gpuMesh.transformBuffer,
      0,
      world.buffer,
      world.byteOffset,
      world.byteLength,
    );
    gpuMesh.worldTransform.set(world);
    gpuMesh.transparent = inst.material.transparent;
    gpuMesh.castsShadows = inst.material.castsShadows;
    gpuMesh.receivesShadows = inst.material.receivesShadows;
  }

  private createMeshBindGroup(
    materialBuffer: GPUBuffer,
    transformBuffer: GPUBuffer,
    baseColorTextureView: GPUTextureView,
    normalTextureView: GPUTextureView,
    ormTextureView: GPUTextureView,
    emissiveTextureView: GPUTextureView,
  ): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.scenePipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: materialBuffer } },
        { binding: 1, resource: { buffer: transformBuffer } },
        { binding: 2, resource: baseColorTextureView },
        { binding: 3, resource: this.linearSampler },
        { binding: 4, resource: normalTextureView },
        { binding: 5, resource: ormTextureView },
        { binding: 6, resource: emissiveTextureView },
      ],
    });
  }

  private createShadowMeshBindGroup(transformBuffer: GPUBuffer): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.shadowMapPipeline.getBindGroupLayout(1),
      entries: [{ binding: 0, resource: { buffer: transformBuffer } }],
    });
  }

  private createDepthTexture(size: number): TextureHandle {
    const texture = this.device.createTexture({
      size: { width: size, height: size, depthOrArrayLayers: 1 },
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    return {
      texture,
      view: texture.createView(),
      format: 'depth24plus',
    };
  }

  private createInstancedMeshBindGroup(
    pipeline: GPURenderPipeline,
    materialBuffer: GPUBuffer,
    instancedMaterialTableBuffer: GPUBuffer,
    baseColorTextureView: GPUTextureView,
    normalTextureView: GPUTextureView,
    ormTextureView: GPUTextureView,
    emissiveTextureView: GPUTextureView,
  ): GPUBindGroup {
    return this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: materialBuffer } },
        { binding: 1, resource: baseColorTextureView },
        { binding: 2, resource: this.linearSampler },
        { binding: 3, resource: normalTextureView },
        { binding: 4, resource: ormTextureView },
        { binding: 5, resource: emissiveTextureView },
        { binding: 6, resource: { buffer: instancedMaterialTableBuffer } },
      ],
    });
  }

  private resolveInstancedDrawSource(inst: SceneInstancedMesh): SceneInstancedDrawSource {
    return inst.drawSource ?? { mode: 'cpuPacked' };
  }

  private buildExternalInstancedPipelineSignature(
    externalBuffers: SceneExternalInstanceBufferBinding[],
  ): string {
    return externalBuffers
      .map((binding) => {
        const attributes = Array.from(binding.layout.attributes);
        const attrs = attributes
          .map((attribute: GPUVertexAttribute) => `${attribute.shaderLocation}:${attribute.offset}:${attribute.format}`)
          .join('|');
        return `${binding.layout.arrayStride}:${binding.layout.stepMode ?? 'vertex'}:${attrs}`;
      })
      .join('||');
  }

  private validateExternalInstanceBuffers(
    externalBuffers: SceneExternalInstanceBufferBinding[],
  ): boolean {
    if (externalBuffers.length === 0) {
      return false;
    }
    for (const binding of externalBuffers) {
      if (!binding.buffer) {
        return false;
      }
      const stepMode = binding.layout.stepMode ?? 'vertex';
      if (stepMode !== 'instance') {
        return false;
      }
      const attributes = Array.from(binding.layout.attributes);
      if (attributes.length === 0) {
        return false;
      }
    }

    const allAttributes = externalBuffers.flatMap((binding) => Array.from(binding.layout.attributes));
    const shaderLocations = allAttributes.map((attribute) => attribute.shaderLocation);
    const uniqueShaderLocations = new Set(shaderLocations);
    if (uniqueShaderLocations.size !== shaderLocations.length) {
      console.warn(
        'gpuExternal instance buffers contain duplicate shader locations; expected unique bindings.',
      );
      return false;
    }

    if (this.warnOnExternalLayoutMismatch) {
      const expectedLocations = [4, 5, 6, 7, 8, 9, 10];
      const missingLocations = expectedLocations.filter(
        (location) => !uniqueShaderLocations.has(location),
      );
      if (missingLocations.length > 0) {
        console.warn(
          `gpuExternal instance buffers are missing expected sceneInstanced shader locations: ${missingLocations.join(', ')}.`,
        );
      }
    }

    return true;
  }

  private getOrCreateExternalInstancedPipeline(
    externalBuffers: SceneExternalInstanceBufferBinding[],
  ): { signature: string; pipeline: GPURenderPipeline } {
    const signature = this.buildExternalInstancedPipelineSignature(externalBuffers);
    const existingPipeline = this.externalInstancedPipelineCache.get(signature);
    if (existingPipeline) {
      return {
        signature,
        pipeline: existingPipeline,
      };
    }

    const shaderModule = this.device.createShaderModule({
      code: this.resolveShaderCode('sceneInstanced', SCENE_INSTANCED_SHADER),
    });
    const pipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vsMain',
        buffers: [
          {
            arrayStride: VERTEX_STRIDE_BYTES,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
              { shaderLocation: 2, offset: 24, format: 'float32x2' },
              { shaderLocation: 3, offset: 32, format: 'float32x4' },
            ],
          },
          ...externalBuffers.map((binding) => binding.layout),
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fsMain',
        targets: [{ format: 'rgba16float' }, { format: 'rgba16float' }, { format: 'rgba16float' }],
      },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });

    this.externalInstancedPipelineCache.set(signature, pipeline);
    return {
      signature,
      pipeline,
    };
  }

  private uploadInstancedMesh(inst: SceneInstancedMesh): GpuInstancedMesh {
    const { geometry, material } = inst;
    const drawSource = this.resolveInstancedDrawSource(inst);
    const geometryBounds = this.computeGeometryBounds(geometry);
    const vb = this.device.createBuffer({ size: geometry.vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(vb, 0, geometry.vertices.buffer, geometry.vertices.byteOffset, geometry.vertices.byteLength);
    const ib = this.device.createBuffer({ size: geometry.indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(ib, 0, geometry.indices.buffer, geometry.indices.byteOffset, geometry.indices.byteLength);

    const matData = this.buildMaterialData(material);
    const mb = this.device.createBuffer({ size: MATERIAL_UNIFORM_FLOAT_COUNT * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(
      mb,
      0,
      matData.buffer,
      matData.byteOffset,
      matData.byteLength,
    );

    const instancedMaterialData = this.buildInstancedMaterialTableData(inst);
    const instancedMaterialTableBuffer = this.device.createBuffer({
      size: instancedMaterialData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(
      instancedMaterialTableBuffer,
      0,
      instancedMaterialData.buffer,
      instancedMaterialData.byteOffset,
      instancedMaterialData.byteLength,
    );

    let instanceCount = 0;
    let instanceCapacity = 1;
    let drawSourceMode: 'cpuPacked' | 'gpuExternal' = 'cpuPacked';
    let externalInstanceBuffers: SceneExternalInstanceBufferBinding[] = [];
    let externalPipelineSignature: string | undefined;
    if (drawSource.mode === 'gpuExternal') {
      const validExternalBuffers = this.validateExternalInstanceBuffers(drawSource.instanceBuffers);
      if (validExternalBuffers) {
        drawSourceMode = 'gpuExternal';
        instanceCount = Math.max(0, Math.floor(drawSource.instanceCount));
        externalInstanceBuffers = drawSource.instanceBuffers;
        const pipelineMeta = this.getOrCreateExternalInstancedPipeline(externalInstanceBuffers);
        externalPipelineSignature = pipelineMeta.signature;
      } else {
        console.warn(
          'Invalid gpuExternal instance buffer definitions detected; falling back to cpuPacked mode.',
        );
      }
    }
    if (drawSourceMode === 'cpuPacked') {
      instanceCount = Math.max(0, inst.instanceTransforms.length);
      instanceCapacity = Math.max(instanceCount, 1);
    } else {
      instanceCapacity = 1;
    }
    const packed = this.packInstancedVertexData(inst, instanceCount, drawSourceMode);
    const instanceBuffer = this.device.createBuffer({
      size: packed.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    if (drawSourceMode === 'cpuPacked') {
      this.device.queue.writeBuffer(instanceBuffer, 0, packed.buffer, packed.byteOffset, packed.byteLength);
    }

    const gpuMesh: GpuInstancedMesh = {
      vertexBuffer: vb,
      indexBuffer: ib,
      indexCount: geometry.indexCount,
      instanceBuffer,
      instanceCapacity,
      instanceCount,
      drawSourceMode,
      externalInstanceBuffers,
      externalPipelineSignature,
      materialBuffer: mb,
      instancedMaterialTableBuffer,
      instancedMaterialCount: instancedMaterialData.length / INSTANCED_MATERIAL_RECORD_FLOAT_COUNT,
      baseColorArrayId: undefined,
      baseColorView: this.whiteTextureArrayView,
      normalView: this.flatNormalTexture.view,
      ormView: this.ormDefaultTexture.view,
      emissiveView: this.whiteTexture.view,
      meshBindGroup: this.createInstancedMeshBindGroup(
        this.sceneInstancedPipeline,
        mb,
        instancedMaterialTableBuffer,
        this.whiteTextureArrayView,
        this.flatNormalTexture.view,
        this.ormDefaultTexture.view,
        this.whiteTexture.view,
      ),
      castsShadows: inst.material.castsShadows,
      localBoundsCenter: geometryBounds.center,
      localBoundsRadius: geometryBounds.radius,
      worldBoundsCenter: [0, 0, 0],
      worldBoundsRadius: 0,
    };

    this.updateInstancedWorldBounds(inst, gpuMesh, drawSource);

    const baseColorTextureArray = this.resolveInstancedBaseColorTextureArray(inst);
    const baseColorTextureUrl = this.resolveMaterialTextureUrl(material, 'baseColor');
    const normalTextureUrl = this.resolveMaterialTextureUrl(material, 'normal');
    const ormTextureUrl = this.resolveMaterialTextureUrl(material, 'orm');
    const emissiveTextureUrl = this.resolveMaterialTextureUrl(material, 'emissive');

    let baseColorView = this.whiteTextureArrayView;
    let normalView = this.flatNormalTexture.view;
    let ormView = this.ormDefaultTexture.view;
    let emissiveView = this.whiteTexture.view;
    const applyBindGroup = (): void => {
      gpuMesh.baseColorArrayId = baseColorTextureArray.arrayId;
      gpuMesh.baseColorView = baseColorView;
      gpuMesh.normalView = normalView;
      gpuMesh.ormView = ormView;
      gpuMesh.emissiveView = emissiveView;
      gpuMesh.meshBindGroup = this.createInstancedMeshBindGroup(
        this.sceneInstancedPipeline,
        mb,
        gpuMesh.instancedMaterialTableBuffer,
        baseColorView,
        normalView,
        ormView,
        emissiveView,
      );
    };

    if (baseColorTextureArray.urls) {
      void this.loadTextureArrayFromUrls(baseColorTextureArray.urls, 'rgba8unorm-srgb')
        .then((loadedTexture) => {
          baseColorView = loadedTexture.view;
          applyBindGroup();
        })
        .catch((error: unknown) => {
          console.warn('Failed to load instanced base color texture array.', baseColorTextureArray.arrayId, error);
        });
    } else if (baseColorTextureUrl) {
      void this.loadTextureArrayFromUrls([baseColorTextureUrl], 'rgba8unorm-srgb')
        .then((loadedTexture) => {
          baseColorView = loadedTexture.view;
          applyBindGroup();
        })
        .catch((error: unknown) => {
          console.warn('Failed to load instanced base color texture.', baseColorTextureUrl, error);
        });
    }

    if (normalTextureUrl) {
      void this.loadTextureFromUrl(normalTextureUrl, 'rgba8unorm')
        .then((loadedTexture) => {
          normalView = loadedTexture.view;
          applyBindGroup();
        })
        .catch((error: unknown) => {
          console.warn('Failed to load instanced normal texture.', normalTextureUrl, error);
        });
    }

    if (ormTextureUrl) {
      void this.loadTextureFromUrl(ormTextureUrl, 'rgba8unorm')
        .then((loadedTexture) => {
          ormView = loadedTexture.view;
          applyBindGroup();
        })
        .catch((error: unknown) => {
          console.warn('Failed to load instanced ORM texture.', ormTextureUrl, error);
        });
    }

    if (emissiveTextureUrl) {
      void this.loadTextureFromUrl(emissiveTextureUrl, 'rgba8unorm-srgb')
        .then((loadedTexture) => {
          emissiveView = loadedTexture.view;
          applyBindGroup();
        })
        .catch((error: unknown) => {
          console.warn('Failed to load instanced emissive texture.', emissiveTextureUrl, error);
        });
    }

    return gpuMesh;
  }

  private destroyGpuInstancedMesh(mesh: GpuInstancedMesh): void {
    mesh.vertexBuffer.destroy();
    mesh.indexBuffer.destroy();
    mesh.materialBuffer.destroy();
    mesh.instancedMaterialTableBuffer.destroy();
    mesh.instanceBuffer.destroy();
  }

  private updateGpuInstancedMeshUniforms(inst: SceneInstancedMesh, gpuMesh: GpuInstancedMesh): void {
    gpuMesh.castsShadows = inst.material.castsShadows;
    const materialData = this.buildMaterialData(inst.material);
    this.device.queue.writeBuffer(
      gpuMesh.materialBuffer,
      0,
      materialData.buffer,
      materialData.byteOffset,
      materialData.byteLength,
    );

    const nextBaseColorArray = this.resolveInstancedBaseColorTextureArray(inst);
    const nextBaseColorTextureUrl = this.resolveMaterialTextureUrl(inst.material, 'baseColor');
    if (nextBaseColorArray.arrayId !== gpuMesh.baseColorArrayId) {
      if (nextBaseColorArray.urls) {
        void this.loadTextureArrayFromUrls(nextBaseColorArray.urls, 'rgba8unorm-srgb')
          .then((loadedTexture) => {
            gpuMesh.baseColorArrayId = nextBaseColorArray.arrayId;
            gpuMesh.baseColorView = loadedTexture.view;
            gpuMesh.meshBindGroup = this.createInstancedMeshBindGroup(
              this.sceneInstancedPipeline,
              gpuMesh.materialBuffer,
              gpuMesh.instancedMaterialTableBuffer,
              gpuMesh.baseColorView,
              gpuMesh.normalView,
              gpuMesh.ormView,
              gpuMesh.emissiveView,
            );
          })
          .catch((error: unknown) => {
            console.warn('Failed to update instanced base color texture array.', nextBaseColorArray.arrayId, error);
          });
      } else if (nextBaseColorTextureUrl) {
        void this.loadTextureArrayFromUrls([nextBaseColorTextureUrl], 'rgba8unorm-srgb')
          .then((loadedTexture) => {
            gpuMesh.baseColorArrayId = undefined;
            gpuMesh.baseColorView = loadedTexture.view;
            gpuMesh.meshBindGroup = this.createInstancedMeshBindGroup(
              this.sceneInstancedPipeline,
              gpuMesh.materialBuffer,
              gpuMesh.instancedMaterialTableBuffer,
              gpuMesh.baseColorView,
              gpuMesh.normalView,
              gpuMesh.ormView,
              gpuMesh.emissiveView,
            );
          })
          .catch((error: unknown) => {
            console.warn('Failed to update instanced base color texture.', nextBaseColorTextureUrl, error);
          });
      } else {
        gpuMesh.baseColorArrayId = undefined;
        gpuMesh.baseColorView = this.whiteTextureArrayView;
        gpuMesh.meshBindGroup = this.createInstancedMeshBindGroup(
          this.sceneInstancedPipeline,
          gpuMesh.materialBuffer,
          gpuMesh.instancedMaterialTableBuffer,
          gpuMesh.baseColorView,
          gpuMesh.normalView,
          gpuMesh.ormView,
          gpuMesh.emissiveView,
        );
      }
    }

    const instancedMaterialData = this.buildInstancedMaterialTableData(inst);
    const nextMaterialCount = instancedMaterialData.length / INSTANCED_MATERIAL_RECORD_FLOAT_COUNT;
    if (nextMaterialCount !== gpuMesh.instancedMaterialCount) {
      gpuMesh.instancedMaterialTableBuffer.destroy();
      gpuMesh.instancedMaterialTableBuffer = this.device.createBuffer({
        size: instancedMaterialData.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      gpuMesh.instancedMaterialCount = nextMaterialCount;
      gpuMesh.meshBindGroup = this.createInstancedMeshBindGroup(
        this.sceneInstancedPipeline,
        gpuMesh.materialBuffer,
        gpuMesh.instancedMaterialTableBuffer,
        gpuMesh.baseColorView,
        gpuMesh.normalView,
        gpuMesh.ormView,
        gpuMesh.emissiveView,
      );
    }
    this.device.queue.writeBuffer(
      gpuMesh.instancedMaterialTableBuffer,
      0,
      instancedMaterialData.buffer,
      instancedMaterialData.byteOffset,
      instancedMaterialData.byteLength,
    );

    const drawSource = this.resolveInstancedDrawSource(inst);
    if (drawSource.mode === 'gpuExternal') {
      const validExternalBuffers = this.validateExternalInstanceBuffers(drawSource.instanceBuffers);
      if (validExternalBuffers) {
        gpuMesh.drawSourceMode = 'gpuExternal';
        gpuMesh.externalInstanceBuffers = drawSource.instanceBuffers;
        gpuMesh.instanceCount = Math.max(0, Math.floor(drawSource.instanceCount));
        const pipelineMeta = this.getOrCreateExternalInstancedPipeline(gpuMesh.externalInstanceBuffers);
        gpuMesh.externalPipelineSignature = pipelineMeta.signature;
      } else {
        console.warn(
          'Invalid gpuExternal instance buffer definitions detected during update; falling back to cpuPacked mode.',
        );
        gpuMesh.drawSourceMode = 'cpuPacked';
        gpuMesh.externalInstanceBuffers = [];
        gpuMesh.externalPipelineSignature = undefined;
      }
    }

    if (drawSource.mode !== 'gpuExternal' || gpuMesh.drawSourceMode !== 'gpuExternal') {
      gpuMesh.drawSourceMode = 'cpuPacked';
      gpuMesh.externalInstanceBuffers = [];
      gpuMesh.externalPipelineSignature = undefined;
      const instanceCount = Math.max(0, inst.instanceTransforms.length);
      if (instanceCount > gpuMesh.instanceCapacity) {
        gpuMesh.instanceBuffer.destroy();
        const newCapacity = Math.max(instanceCount, gpuMesh.instanceCapacity * 2, 1);
        gpuMesh.instanceBuffer = this.device.createBuffer({
          size: newCapacity * INSTANCE_STRIDE_FLOAT_COUNT * 4,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        gpuMesh.instanceCapacity = newCapacity;
      }

      const packed = this.packInstancedVertexData(inst, instanceCount, 'cpuPacked');
      this.device.queue.writeBuffer(
        gpuMesh.instanceBuffer,
        0,
        packed.buffer,
        packed.byteOffset,
        packed.byteLength,
      );
      gpuMesh.instanceCount = instanceCount;
    }

    this.updateInstancedWorldBounds(inst, gpuMesh, drawSource);
  }

  private packInstancedVertexData(
    inst: SceneInstancedMesh,
    instanceCount: number,
    drawSourceMode: 'cpuPacked' | 'gpuExternal',
  ): Float32Array {
    if (drawSourceMode === 'gpuExternal') {
      return new Float32Array(INSTANCE_STRIDE_FLOAT_COUNT);
    }
    const packed = new Float32Array(Math.max(INSTANCE_STRIDE_FLOAT_COUNT, instanceCount * INSTANCE_STRIDE_FLOAT_COUNT));
    const custom0 = inst.instanceCustomData?.custom0;
    const custom1 = inst.instanceCustomData?.custom1;
    const materialIndices = inst.instanceMaterialIndices;

    for (let index = 0; index < instanceCount; index += 1) {
      const instanceBase = index * INSTANCE_STRIDE_FLOAT_COUNT;
      packed.set(inst.instanceTransforms[index], instanceBase);

      const custom0Offset = instanceBase + INSTANCE_TRANSFORM_FLOAT_COUNT;
      const custom0Value = custom0?.[index] ?? [1, 1, 1, 1];
      packed[custom0Offset + 0] = custom0Value[0];
      packed[custom0Offset + 1] = custom0Value[1];
      packed[custom0Offset + 2] = custom0Value[2];
      packed[custom0Offset + 3] = custom0Value[3];

      const custom1Offset = custom0Offset + INSTANCE_CUSTOM_FLOAT_COUNT;
      const custom1Value = custom1?.[index] ?? [1, 1, 1, 1];
      packed[custom1Offset + 0] = custom1Value[0];
      packed[custom1Offset + 1] = custom1Value[1];
      packed[custom1Offset + 2] = custom1Value[2];
      packed[custom1Offset + 3] = custom1Value[3];

      const materialIndexOffset = custom1Offset + INSTANCE_CUSTOM_FLOAT_COUNT;
      packed[materialIndexOffset] = materialIndices?.[index] ?? 0;
    }

    return packed;
  }

  private resolveInstancedBaseColorTextureArray(inst: SceneInstancedMesh): { arrayId?: string; urls?: string[] } {
    const sourceMaterials =
      inst.instanceMaterials && inst.instanceMaterials.length > 0 ? inst.instanceMaterials : [inst.material];
    let selectedArrayId: string | undefined;
    for (const material of sourceMaterials) {
      const candidateArrayId = material.textureArrayIds?.baseColor;
      if (!candidateArrayId) {
        continue;
      }
      if (!selectedArrayId) {
        selectedArrayId = candidateArrayId;
      } else if (selectedArrayId !== candidateArrayId) {
        console.warn(
          'Instanced mesh has mixed baseColor texture-array IDs; using first ID only for this draw.',
          selectedArrayId,
          candidateArrayId,
        );
      }
    }

    if (!selectedArrayId) {
      return {};
    }

    const urls = this.sceneTextureArrayLibrary[selectedArrayId];
    if (!urls || urls.length === 0) {
      console.warn('Instanced baseColor texture-array ID was not found in scene textureArrayLibrary.', selectedArrayId);
      return {};
    }

    return {
      arrayId: selectedArrayId,
      urls,
    };
  }

  private buildInstancedMaterialTableData(inst: SceneInstancedMesh): Float32Array {
    const sourceMaterials =
      inst.instanceMaterials && inst.instanceMaterials.length > 0 ? inst.instanceMaterials : [inst.material];
    const packed = new Float32Array(
      Math.max(INSTANCED_MATERIAL_RECORD_FLOAT_COUNT, sourceMaterials.length * INSTANCED_MATERIAL_RECORD_FLOAT_COUNT),
    );

    for (let index = 0; index < sourceMaterials.length; index += 1) {
      const material = sourceMaterials[index];
      const base = index * INSTANCED_MATERIAL_RECORD_FLOAT_COUNT;

      packed[base + 0] = material.baseColor[0];
      packed[base + 1] = material.baseColor[1];
      packed[base + 2] = material.baseColor[2];
      packed[base + 3] = material.baseColor[3];

      packed[base + 4] = material.uvScaleOffset[0];
      packed[base + 5] = material.uvScaleOffset[1];
      packed[base + 6] = material.uvScaleOffset[2];
      packed[base + 7] = material.uvScaleOffset[3];

      packed[base + 8] = material.emissive[0];
      packed[base + 9] = material.emissive[1];
      packed[base + 10] = material.emissive[2];
      packed[base + 11] = material.emissiveIntensity;

      packed[base + 12] = material.metallic;
      packed[base + 13] = material.roughness;
      packed[base + 14] = material.twoSided ? 1 : 0;
      packed[base + 15] = material.transparent ? 1 : 0;

      packed[base + 16] = material.receivesShadows ? 1 : 0;
      packed[base + 17] = Math.max(0, material.textureArrayLayers?.baseColor ?? 0);
      packed[base + 18] = 0;
      packed[base + 19] = 0;
    }

    return packed;
  }

  private buildMaterialData(material: PbrMaterial): Float32Array {
    return new Float32Array([
      material.baseColor[0], material.baseColor[1], material.baseColor[2], material.baseColor[3],
      material.uvScaleOffset[0], material.uvScaleOffset[1], material.uvScaleOffset[2], material.uvScaleOffset[3],
      material.emissive[0], material.emissive[1], material.emissive[2], material.emissiveIntensity,
      material.metallic, material.roughness, material.twoSided ? 1 : 0, material.transparent ? 1 : 0,
      material.receivesShadows ? 1 : 0, 0, 0, 0,
    ]);
  }

  private resolveMaterialTextureUrl(
    material: PbrMaterial,
    slot: 'baseColor' | 'orm' | 'normal' | 'emissive',
  ): string | undefined {
    const textureId = material.textureIds?.[slot];
    if (textureId) {
      const resolvedFromLibrary = this.sceneTextureLibrary[textureId];
      if (resolvedFromLibrary) {
        return resolvedFromLibrary;
      }
      return textureId;
    }
    return material.textures[slot];
  }

  private createSingleLayerArrayView(texture: GPUTexture): GPUTextureView {
    return texture.createView({ dimension: '2d-array', baseArrayLayer: 0, arrayLayerCount: 1 });
  }

  private createSolidTexture(
    r: number,
    g: number,
    b: number,
    a: number,
    format: GPUTextureFormat,
  ): LoadedTexture {
    const texture = this.device.createTexture({
      size: { width: 1, height: 1, depthOrArrayLayers: 1 },
      format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    const bytes = new Uint8Array([r, g, b, a]);
    this.device.queue.writeTexture(
      { texture },
      bytes,
      { bytesPerRow: 4, rowsPerImage: 1 },
      { width: 1, height: 1, depthOrArrayLayers: 1 },
    );
    return {
      texture,
      view: texture.createView(),
    };
  }

  private loadTextureArrayFromUrls(urls: string[], format: GPUTextureFormat): Promise<LoadedTexture> {
    const normalizedUrls = urls.filter((url) => url.length > 0);
    if (normalizedUrls.length === 0) {
      return Promise.resolve({ texture: this.whiteTexture.texture, view: this.whiteTextureArrayView });
    }
    const cacheKey = `${format}|${normalizedUrls.join('|')}`;
    const cached = this.textureArrayCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const pending = (async (): Promise<LoadedTexture> => {
      const bitmaps = await Promise.all(
        normalizedUrls.map(async (url) => {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Failed to fetch texture array layer: ${url}`);
          }
          const blob = await response.blob();
          return createImageBitmap(blob);
        }),
      );

      const first = bitmaps[0];
      const width = first.width;
      const height = first.height;
      for (const bitmap of bitmaps) {
        if (bitmap.width !== width || bitmap.height !== height) {
          bitmap.close();
          for (const openBitmap of bitmaps) {
            if (openBitmap !== bitmap) {
              openBitmap.close();
            }
          }
          throw new Error('Texture array layers must all have matching dimensions.');
        }
      }

      const texture = this.device.createTexture({
        size: { width, height, depthOrArrayLayers: bitmaps.length },
        format,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });

      for (let layerIndex = 0; layerIndex < bitmaps.length; layerIndex += 1) {
        const image = bitmaps[layerIndex];
        this.device.queue.copyExternalImageToTexture(
          { source: image },
          { texture, origin: { x: 0, y: 0, z: layerIndex } },
          { width, height, depthOrArrayLayers: 1 },
        );
        image.close();
      }

      return {
        texture,
        view: texture.createView({ dimension: '2d-array', baseArrayLayer: 0, arrayLayerCount: bitmaps.length }),
      };
    })();

    this.textureArrayCache.set(cacheKey, pending);
    return pending;
  }

  private loadTextureFromUrl(url: string, format: GPUTextureFormat): Promise<LoadedTexture> {
    const cacheKey = `${format}|${url}`;
    const cached = this.textureCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const pending = (async (): Promise<LoadedTexture> => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch texture: ${url}`);
      }
      const blob = await response.blob();
      const image = await createImageBitmap(blob);
      const texture = this.device.createTexture({
        size: { width: image.width, height: image.height, depthOrArrayLayers: 1 },
        format,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.device.queue.copyExternalImageToTexture(
        { source: image },
        { texture },
        { width: image.width, height: image.height, depthOrArrayLayers: 1 },
      );
      image.close();
      return {
        texture,
        view: texture.createView(),
      };
    })();

    this.textureCache.set(cacheKey, pending);
    return pending;
  }

  private computeGeometryBounds(geometry: MeshGeometry): {
    center: [number, number, number];
    extents: [number, number, number];
    radius: number;
  } {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    const stride = VERTEX_STRIDE_BYTES / 4;
    for (let index = 0; index < geometry.vertexCount; index += 1) {
      const offset = index * stride;
      const px = geometry.vertices[offset];
      const py = geometry.vertices[offset + 1];
      const pz = geometry.vertices[offset + 2];
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      minZ = Math.min(minZ, pz);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
      maxZ = Math.max(maxZ, pz);
    }

    const center: [number, number, number] = [
      (minX + maxX) * 0.5,
      (minY + maxY) * 0.5,
      (minZ + maxZ) * 0.5,
    ];

    const extents: [number, number, number] = [
      Math.max(0.0001, (maxX - minX) * 0.5),
      Math.max(0.0001, (maxY - minY) * 0.5),
      Math.max(0.0001, (maxZ - minZ) * 0.5),
    ];

    let radius = 0;
    for (let index = 0; index < geometry.vertexCount; index += 1) {
      const offset = index * stride;
      const dx = geometry.vertices[offset] - center[0];
      const dy = geometry.vertices[offset + 1] - center[1];
      const dz = geometry.vertices[offset + 2] - center[2];
      radius = Math.max(radius, Math.hypot(dx, dy, dz));
    }

    return {
      center,
      extents,
      radius: Math.max(0.0001, radius),
    };
  }

  private computeWorldBoundsCenter(
    worldTransform: Float32Array,
    localCenter: [number, number, number],
  ): [number, number, number] {
    const cx = localCenter[0];
    const cy = localCenter[1];
    const cz = localCenter[2];
    return [
      worldTransform[0] * cx + worldTransform[4] * cy + worldTransform[8] * cz + worldTransform[12],
      worldTransform[1] * cx + worldTransform[5] * cy + worldTransform[9] * cz + worldTransform[13],
      worldTransform[2] * cx + worldTransform[6] * cy + worldTransform[10] * cz + worldTransform[14],
    ];
  }

  private isSphereVisibleInFrustum(
    center: [number, number, number],
    radius: number,
    cameraPosition: [number, number, number],
    cameraForward: [number, number, number],
    cameraRight: [number, number, number],
    cameraUp: [number, number, number],
    tanHalfFovX: number,
    tanHalfFovY: number,
    near: number,
    far: number,
  ): boolean {
    const toCenterX = center[0] - cameraPosition[0];
    const toCenterY = center[1] - cameraPosition[1];
    const toCenterZ = center[2] - cameraPosition[2];

    const depth =
      toCenterX * cameraForward[0] + toCenterY * cameraForward[1] + toCenterZ * cameraForward[2];
    if (depth + radius < near || depth - radius > far) {
      return false;
    }

    const horizontal =
      toCenterX * cameraRight[0] + toCenterY * cameraRight[1] + toCenterZ * cameraRight[2];
    const vertical = toCenterX * cameraUp[0] + toCenterY * cameraUp[1] + toCenterZ * cameraUp[2];

    const horizontalLimit = Math.max(0, depth) * tanHalfFovX + radius;
    const verticalLimit = Math.max(0, depth) * tanHalfFovY + radius;
    if (Math.abs(horizontal) > horizontalLimit) {
      return false;
    }
    if (Math.abs(vertical) > verticalLimit) {
      return false;
    }

    return true;
  }

  private updateInstancedWorldBounds(
    inst: SceneInstancedMesh,
    gpuMesh: GpuInstancedMesh,
    drawSource: SceneInstancedDrawSource,
  ): void {
    if (drawSource.mode === 'gpuExternal') {
      const externalWorldBounds = drawSource.worldBounds;
      if (!externalWorldBounds) {
        gpuMesh.worldBoundsCenter = [0, 0, 0];
        gpuMesh.worldBoundsRadius = 0;
        return;
      }
      gpuMesh.worldBoundsCenter = [
        externalWorldBounds.center[0],
        externalWorldBounds.center[1],
        externalWorldBounds.center[2],
      ];
      gpuMesh.worldBoundsRadius = Math.max(0, externalWorldBounds.radius);
      return;
    }

    const instanceTransforms = inst.instanceTransforms;
    if (instanceTransforms.length === 0) {
      gpuMesh.worldBoundsCenter = [0, 0, 0];
      gpuMesh.worldBoundsRadius = 0;
      return;
    }

    const localCenter = gpuMesh.localBoundsCenter;
    const localRadius = gpuMesh.localBoundsRadius;

    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    for (const transform of instanceTransforms) {
      const worldCenter = this.computeWorldBoundsCenter(transform, localCenter);
      const scaleX = Math.hypot(transform[0], transform[1], transform[2]);
      const scaleY = Math.hypot(transform[4], transform[5], transform[6]);
      const scaleZ = Math.hypot(transform[8], transform[9], transform[10]);
      const worldRadius = localRadius * Math.max(scaleX, scaleY, scaleZ);

      minX = Math.min(minX, worldCenter[0] - worldRadius);
      minY = Math.min(minY, worldCenter[1] - worldRadius);
      minZ = Math.min(minZ, worldCenter[2] - worldRadius);
      maxX = Math.max(maxX, worldCenter[0] + worldRadius);
      maxY = Math.max(maxY, worldCenter[1] + worldRadius);
      maxZ = Math.max(maxZ, worldCenter[2] + worldRadius);
    }

    const worldBoundsCenter: [number, number, number] = [
      (minX + maxX) * 0.5,
      (minY + maxY) * 0.5,
      (minZ + maxZ) * 0.5,
    ];

    let worldBoundsRadius = 0;
    for (const transform of instanceTransforms) {
      const worldCenter = this.computeWorldBoundsCenter(transform, localCenter);
      const scaleX = Math.hypot(transform[0], transform[1], transform[2]);
      const scaleY = Math.hypot(transform[4], transform[5], transform[6]);
      const scaleZ = Math.hypot(transform[8], transform[9], transform[10]);
      const worldRadius = localRadius * Math.max(scaleX, scaleY, scaleZ);
      const dx = worldCenter[0] - worldBoundsCenter[0];
      const dy = worldCenter[1] - worldBoundsCenter[1];
      const dz = worldCenter[2] - worldBoundsCenter[2];
      worldBoundsRadius = Math.max(worldBoundsRadius, Math.hypot(dx, dy, dz) + worldRadius);
    }

    gpuMesh.worldBoundsCenter = worldBoundsCenter;
    gpuMesh.worldBoundsRadius = Math.max(0.0001, worldBoundsRadius);
  }

  private detectShadowReceiverHeight(): number {
    let receiverHeight = Number.POSITIVE_INFINITY;
    for (const mesh of this.gpuMeshes) {
      if (mesh.transparent || !mesh.receivesShadows) {
        continue;
      }
      const m = mesh.worldTransform;
      const scaleX = Math.hypot(m[0], m[1], m[2]);
      const scaleY = Math.hypot(m[4], m[5], m[6]);
      const scaleZ = Math.hypot(m[8], m[9], m[10]);
      const extentX = mesh.boundsExtents[0] * scaleX;
      const extentY = mesh.boundsExtents[1] * scaleY;
      const extentZ = mesh.boundsExtents[2] * scaleZ;
      const isReceiverLike =
        extentY < Math.max(0.06, extentX * 0.06) &&
        extentY < Math.max(0.06, extentZ * 0.06) &&
        Math.max(extentX, extentZ) > 1.5;
      if (!isReceiverLike) {
        continue;
      }
      const cy =
        m[1] * mesh.boundsCenter[0] +
        m[5] * mesh.boundsCenter[1] +
        m[9] * mesh.boundsCenter[2] +
        m[13];
      if (cy < receiverHeight) {
        receiverHeight = cy;
      }
    }
    if (!Number.isFinite(receiverHeight)) {
      return -1000;
    }
    return receiverHeight;
  }

  private detectShadowReceiverBand(): number {
    let bestBand = 0.08;
    for (const mesh of this.gpuMeshes) {
      if (mesh.transparent || !mesh.receivesShadows) {
        continue;
      }
      const m = mesh.worldTransform;
      const scaleX = Math.hypot(m[0], m[1], m[2]);
      const scaleY = Math.hypot(m[4], m[5], m[6]);
      const scaleZ = Math.hypot(m[8], m[9], m[10]);
      const extentX = mesh.boundsExtents[0] * scaleX;
      const extentY = mesh.boundsExtents[1] * scaleY;
      const extentZ = mesh.boundsExtents[2] * scaleZ;
      const isReceiverLike =
        extentY < Math.max(0.06, extentX * 0.06) &&
        extentY < Math.max(0.06, extentZ * 0.06) &&
        Math.max(extentX, extentZ) > 1.5;
      if (!isReceiverLike) {
        continue;
      }
      bestBand = Math.max(0.04, extentY * 0.9 + 0.03);
      break;
    }
    return bestBand;
  }

  private ensureClusterStorageCapacity(requiredRecordU32: number, requiredIndexU32: number): void {
    const requiredRecordCapacity = Math.max(2, requiredRecordU32);
    if (requiredRecordCapacity > this.clusterRecordCapacity) {
      this.clusterRecordBuffer.destroy();
      this.clusterRecordBuffer = this.device.createBuffer({
        size: requiredRecordCapacity * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.clusterRecordCapacity = requiredRecordCapacity;
    }

    const requiredIndexCapacity = Math.max(1, requiredIndexU32);
    if (requiredIndexCapacity > this.clusterLightIndexCapacity) {
      this.clusterLightIndexBuffer.destroy();
      this.clusterLightIndexBuffer = this.device.createBuffer({
        size: requiredIndexCapacity * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.clusterLightIndexCapacity = requiredIndexCapacity;
    }
  }

  private buildClusteredLightingData(config: RendererConfig): {
    valid: boolean;
    uniformData: Float32Array;
    clusterRecords: Uint32Array;
    clusterLightIndices: Uint32Array;
  } {
    const tileSizeX = Math.max(1, Math.floor(config.clustered.tileSizeX));
    const tileSizeY = Math.max(1, Math.floor(config.clustered.tileSizeY));
    const clustersX = Math.max(1, Math.ceil(this.width / tileSizeX));
    const clustersY = Math.max(1, Math.ceil(this.height / tileSizeY));
    const requestedClustersZ = Math.max(1, config.clustered.enabled ? Math.floor(config.clustered.zSlices) : 1);
    const clustersXY = clustersX * clustersY;
    const maxClustersZByBudget = Math.max(1, Math.floor(MAX_SAFE_CLUSTER_COUNT / Math.max(1, clustersXY)));
    const clustersZ = Math.max(1, Math.min(requestedClustersZ, maxClustersZByBudget));
    const maxLightsPerCluster = Math.max(1, Math.floor(config.clustered.maxLightsPerCluster));
    const clusterCount = clustersX * clustersY * clustersZ;
    const nearPlane = Math.max(0.0001, this.camera.getNear());
    const farPlane = Math.max(nearPlane + 0.0001, this.camera.getFar());
    const fallbackData = {
      valid: false,
      uniformData: new Float32Array([1, 1, 1, 1, nearPlane, farPlane, 1, 1]),
      clusterRecords: new Uint32Array([0, 0]),
      clusterLightIndices: new Uint32Array([0]),
    };

    if (!Number.isFinite(this.width) || !Number.isFinite(this.height) || this.width <= 0 || this.height <= 0) {
      return fallbackData;
    }
    if (!Number.isFinite(clusterCount) || clusterCount < 1) {
      return fallbackData;
    }
    if (!Number.isFinite(nearPlane) || !Number.isFinite(farPlane) || farPlane <= nearPlane) {
      return fallbackData;
    }

    const clusterRecords = new Uint32Array(Math.max(2, clusterCount * 2));
    const totalLights = this.scenePointLights.length;
    const selectedLightCount = Math.max(
      0,
      Math.min(totalLights, maxLightsPerCluster, MAX_SHARED_CLUSTER_LIGHTS),
    );
    const clusterLightIndices = new Uint32Array(Math.max(1, selectedLightCount));

    if (selectedLightCount > 0) {
      for (let listIndex = 0; listIndex < selectedLightCount; listIndex += 1) {
        const sample = Math.floor((listIndex * totalLights) / selectedLightCount);
        clusterLightIndices[listIndex] = Math.min(totalLights - 1, Math.max(0, sample));
      }
    }

    for (let clusterIndex = 0; clusterIndex < clusterCount; clusterIndex += 1) {
      const recordBase = clusterIndex * 2;
      clusterRecords[recordBase] = 0;
      clusterRecords[recordBase + 1] = selectedLightCount;
    }

    const uniformData = new Float32Array([
      clustersX,
      clustersY,
      clustersZ,
      maxLightsPerCluster,
      nearPlane,
      farPlane,
      tileSizeX,
      tileSizeY,
    ]);

    return {
      valid: true,
      uniformData,
      clusterRecords,
      clusterLightIndices,
    };
  }

  private allocTexture(name: string, format: GPUTextureFormat): void {
    const old = this.resources.get<TextureHandle>(name);
    if (old) { old.texture.destroy(); }
    const usageBase = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    const usage =
      format === 'depth24plus'
        ? usageBase
        : usageBase | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST;
    const texture = this.device.createTexture({
      size: { width: this.width, height: this.height, depthOrArrayLayers: 1 }, format,
      usage,
    });
    this.resources.set(name, { texture, view: texture.createView(), format } satisfies TextureHandle);
  }

  private req(name: string): TextureHandle { return this.resources.require<TextureHandle>(name); }

  private rebuildBindGroups(): void {
    const hdr = this.req('scene-hdr'); const norm = this.req('scene-normal');
    const mat = this.req('scene-material'); const ao = this.req('ao');
    const ssr = this.req('ssr');
    const ssrHistory = this.req('ssr-history');
    const bloom = this.req('bloom'); const dof = this.req('dof');
    const motionBlur = this.req('motion-blur');
    this.skyBindGroup = this.device.createBindGroup({ layout: this.skyPipeline.getBindGroupLayout(0), entries: [{binding:0, resource:{buffer:this.sceneUniformBuffer}}] });
    this.aoBindGroup = this.device.createBindGroup({ layout: this.aoPipeline.getBindGroupLayout(0), entries: [{binding:0,resource:{buffer:this.postUniformBuffer}},{binding:1,resource:this.linearSampler},{binding:2,resource:mat.view},{binding:3,resource:norm.view}] });
    const bloomPrefilter = this.req('bloom-prefilter');
    const bloomTemp = this.req('bloom-temp');
    const dofPrefilter = this.req('dof-prefilter');
    const dofTemp = this.req('dof-temp');
    this.bloomPrefilterBindGroup = this.device.createBindGroup({ layout: this.bloomPrefilterPipeline.getBindGroupLayout(0), entries: [{binding:0,resource:{buffer:this.postUniformBuffer}},{binding:1,resource:this.linearSampler},{binding:2,resource:hdr.view},{binding:3,resource:mat.view}] });
    this.bloomBlurHorizontalBindGroup = this.device.createBindGroup({ layout: this.bloomBlurHorizontalPipeline.getBindGroupLayout(0), entries: [{binding:0,resource:{buffer:this.postUniformBuffer}},{binding:1,resource:this.linearSampler},{binding:2,resource:bloomPrefilter.view}] });
    this.bloomBlurVerticalBindGroup = this.device.createBindGroup({ layout: this.bloomBlurVerticalPipeline.getBindGroupLayout(0), entries: [{binding:0,resource:{buffer:this.postUniformBuffer}},{binding:1,resource:this.linearSampler},{binding:2,resource:bloomTemp.view}] });
    this.dofPrefilterBindGroup = this.device.createBindGroup({ layout: this.dofPrefilterPipeline.getBindGroupLayout(0), entries: [{binding:0,resource:{buffer:this.postUniformBuffer}},{binding:1,resource:this.linearSampler},{binding:2,resource:hdr.view},{binding:3,resource:mat.view}] });
    this.dofBlurHorizontalBindGroup = this.device.createBindGroup({ layout: this.dofBlurHorizontalPipeline.getBindGroupLayout(0), entries: [{binding:0,resource:{buffer:this.postUniformBuffer}},{binding:1,resource:this.linearSampler},{binding:2,resource:dofPrefilter.view}] });
    this.dofBlurVerticalCombineBindGroup = this.device.createBindGroup({ layout: this.dofBlurVerticalCombinePipeline.getBindGroupLayout(0), entries: [{binding:0,resource:{buffer:this.postUniformBuffer}},{binding:1,resource:this.linearSampler},{binding:2,resource:dofTemp.view},{binding:3,resource:hdr.view}] });
    this.ssrBindGroup = this.device.createBindGroup({ layout: this.ssrPipeline.getBindGroupLayout(0), entries: [{binding:0,resource:{buffer:this.postUniformBuffer}},{binding:1,resource:this.linearSampler},{binding:2,resource:hdr.view},{binding:3,resource:mat.view},{binding:4,resource:ssrHistory.view},{binding:5,resource:norm.view}] });
    this.motionBlurBindGroup = this.device.createBindGroup({ layout: this.motionBlurPipeline.getBindGroupLayout(0), entries: [{binding:0,resource:{buffer:this.postUniformBuffer}},{binding:1,resource:this.linearSampler},{binding:2,resource:dof.view},{binding:3,resource:mat.view}] });
    this.compositeBindGroup = this.device.createBindGroup({ layout: this.compositePipeline.getBindGroupLayout(0), entries: [{binding:0,resource:{buffer:this.postUniformBuffer}},{binding:1,resource:this.linearSampler},{binding:2,resource:mat.view},{binding:3,resource:ao.view},{binding:4,resource:bloom.view},{binding:5,resource:dof.view},{binding:6,resource:motionBlur.view},{binding:7,resource:ssr.view}] });
  }

  private createSkyPipeline(): GPURenderPipeline {
    const mod = this.device.createShaderModule({ code: this.resolveShaderCode('sky', SKY_SHADER) });
    return this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: mod, entryPoint: 'vsMain' },
      fragment: { module: mod, entryPoint: 'fsMain', targets: [{format:'rgba16float'},{format:'rgba16float'},{format:'rgba16float'}] },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less-equal' },
      primitive: { topology: 'triangle-list' },
    });
  }

  private createScenePipeline(): GPURenderPipeline {
    const mod = this.device.createShaderModule({ code: this.resolveShaderCode('scene', SCENE_SHADER) });
    return this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: mod, entryPoint: 'vsMain',
        buffers: [{ arrayStride: VERTEX_STRIDE_BYTES, attributes: [
          {shaderLocation:0, offset:0,  format:'float32x3'},
          {shaderLocation:1, offset:12, format:'float32x3'},
          {shaderLocation:2, offset:24, format:'float32x2'},
          {shaderLocation:3, offset:32, format:'float32x4'},
        ]}],
      },
      fragment: { module: mod, entryPoint: 'fsMain', targets: [{format:'rgba16float'},{format:'rgba16float'},{format:'rgba16float'}] },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
      // Keep meshes visible across mixed winding conventions while scene data stabilizes.
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });
  }

  private createSceneInstancedPipeline(): GPURenderPipeline {
    const mod = this.device.createShaderModule({ code: this.resolveShaderCode('sceneInstanced', SCENE_INSTANCED_SHADER) });
    return this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: mod, entryPoint: 'vsMain',
        buffers: [
          {
            arrayStride: VERTEX_STRIDE_BYTES,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
              { shaderLocation: 2, offset: 24, format: 'float32x2' },
              { shaderLocation: 3, offset: 32, format: 'float32x4' },
            ],
          },
          {
            arrayStride: INSTANCE_STRIDE_FLOAT_COUNT * 4,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 4, offset: 0, format: 'float32x4' },
              { shaderLocation: 5, offset: 16, format: 'float32x4' },
              { shaderLocation: 6, offset: 32, format: 'float32x4' },
              { shaderLocation: 7, offset: 48, format: 'float32x4' },
              { shaderLocation: 8, offset: 64, format: 'float32x4' },
              { shaderLocation: 9, offset: 80, format: 'float32x4' },
              { shaderLocation: 10, offset: 96, format: 'float32' },
            ],
          },
        ],
      },
      fragment: { module: mod, entryPoint: 'fsMain', targets: [{ format: 'rgba16float' }, { format: 'rgba16float' }, { format: 'rgba16float' }] },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });
  }

  private createShadowMapPipeline(): GPURenderPipeline {
    const mod = this.device.createShaderModule({ code: SHADOW_MAP_SHADER });
    return this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: mod,
        entryPoint: 'vsMain',
        buffers: [{
          arrayStride: VERTEX_STRIDE_BYTES,
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
        }],
      },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
    });
  }

  private createShadowMapInstancedPipeline(): GPURenderPipeline {
    const mod = this.device.createShaderModule({ code: SHADOW_MAP_INSTANCED_SHADER });
    return this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: mod,
        entryPoint: 'vsMain',
        buffers: [
          {
            arrayStride: VERTEX_STRIDE_BYTES,
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
          },
          {
            arrayStride: INSTANCE_STRIDE_FLOAT_COUNT * 4,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 4, offset: 0, format: 'float32x4' },
              { shaderLocation: 5, offset: 16, format: 'float32x4' },
              { shaderLocation: 6, offset: 32, format: 'float32x4' },
              { shaderLocation: 7, offset: 48, format: 'float32x4' },
            ],
          },
        ],
      },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
    });
  }

  private createShadowMapInstancedExternalPipeline(): GPURenderPipeline {
    const mod = this.device.createShaderModule({ code: SHADOW_MAP_INSTANCED_SHADER });
    return this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: mod,
        entryPoint: 'vsMain',
        buffers: [
          {
            arrayStride: VERTEX_STRIDE_BYTES,
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
          },
          {
            arrayStride: 64,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 4, offset: 0, format: 'float32x4' },
              { shaderLocation: 5, offset: 16, format: 'float32x4' },
              { shaderLocation: 6, offset: 32, format: 'float32x4' },
              { shaderLocation: 7, offset: 48, format: 'float32x4' },
            ],
          },
        ],
      },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
    });
  }

  private createPostPipeline(code: string, fmt: GPUTextureFormat): GPURenderPipeline {
    const mod = this.device.createShaderModule({ code });
    return this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: mod, entryPoint: 'vsMain' },
      fragment: { module: mod, entryPoint: 'fsMain', targets: [{format: fmt}] },
      primitive: { topology: 'triangle-list' },
    });
  }

  private resolveShaderCode(shaderId: WebGpuPostGraphShaderId, fallbackCode: string): string {
    const overrideCode = this.shaderOverrides[shaderId];
    if (typeof overrideCode === 'string' && overrideCode.trim().length > 0) {
      return overrideCode;
    }
    return fallbackCode;
  }

  private executeStages(
    injectionPoint: WebGpuStageInjectionPoint,
    timings: RenderPassTimingResult[],
    context: WebGpuStageContext,
  ): void {
    const stages = this.stageMap.get(injectionPoint);
    if (!stages || stages.length === 0) {
      return;
    }
    for (const stage of stages) {
      if (stage.enabled && !stage.enabled(context.config)) {
        continue;
      }
      const timingName = `stage:${injectionPoint}:${stage.name}`;
      const startTime = performance.now();
      try {
        this.validateStageResourceContracts(stage, stage.reads, 'reads', context.resources);
        stage.execute(context);
        this.validateStageResourceContracts(stage, stage.writes, 'writes', context.resources);
      } catch (error: unknown) {
        if (this.stageFailurePolicy === 'fail-fast') {
          throw error;
        }
        console.warn(`WebGpuPostGraph stage failed (${injectionPoint}/${stage.name}).`, error);
        continue;
      }
      const cpuTimeMs = performance.now() - startTime;
      if (this.stageCpuBudgetMs > 0 && cpuTimeMs > this.stageCpuBudgetMs) {
        console.warn(
          `WebGpuPostGraph stage '${stage.name}' exceeded CPU budget (${cpuTimeMs.toFixed(2)}ms > ${this.stageCpuBudgetMs.toFixed(2)}ms).`,
        );
      }
      timings.push({
        passName: timingName,
        cpuTimeMs,
      });
    }
  }

  private tp(target: RenderPassTimingResult[], name: string, run: () => void): void {
    const s = performance.now(); run(); target.push({ passName: name, cpuTimeMs: performance.now() - s });
  }
}
