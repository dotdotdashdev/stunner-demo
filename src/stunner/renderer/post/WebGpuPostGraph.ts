import type { RendererConfig } from '../config/RendererConfig';
import { Camera } from '../../camera/Camera';
import { FrameResourceStore } from '../graph/FrameResourceStore';
import type { RenderPassTimingResult } from '../graph/RenderGraphTypes';
import type { RenderScene, SceneMeshInstance } from '../mesh/SceneTypes';
import { mat4Identity } from '../mesh/SceneTypes';
import { VERTEX_STRIDE_BYTES } from '../mesh/MeshTypes';

type TextureHandle = {
  texture: GPUTexture;
  view: GPUTextureView;
  format: GPUTextureFormat;
};

type GpuMesh = {
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  indexCount: number;
  materialBuffer: GPUBuffer;
  transformBuffer: GPUBuffer;
  meshBindGroup: GPUBindGroup;
  worldTransform: Float32Array;
  boundsCenter: [number, number, number];
  boundsExtents: [number, number, number];
  boundsRadius: number;
  transparent: boolean;
};

type LoadedTexture = {
  texture: GPUTexture;
  view: GPUTextureView;
};

const POST_UNIFORM_FLOAT_COUNT = 44;
const SCENE_UNIFORM_FLOAT_COUNT = 40;
const MAX_SHADOW_CASTERS = 24;
const SHADOW_CASTER_FLOAT_COUNT = MAX_SHADOW_CASTERS * 4;
const MATERIAL_UNIFORM_FLOAT_COUNT = 16;
const TRANSFORM_UNIFORM_FLOAT_COUNT = 16;

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
  keyLightDir: vec3f, _pad5: f32,
  shadowReceiverHeight: f32, shadowReceiverBand: f32, _pad6: f32, _pad7: f32,
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

struct MaterialUniforms {
  baseColor: vec4f,
  emissive: vec3f, emissiveIntensity: f32,
  metallic: f32, roughness: f32, twoSided: f32, transparent: f32,
  _pad: vec4f,
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

fn sampleEnvironment(rayDir: vec3f, origin: vec3f, keyDir: vec3f) -> vec3f {
  let horizon = clamp(rayDir.y * 0.5 + 0.5, 0.0, 1.0);
  var sky = mix(vec3f(0.03, 0.05, 0.09), vec3f(0.12, 0.18, 0.28), horizon);
  let cp = rayDir.x * 5.5 + rayDir.z * 4.5 + origin.x * 0.22 + origin.z * 0.17 + frame.time * 0.08;
  let cloud = sin(cp) * 0.5 + 0.5;
  sky = sky + vec3f(cloud * 0.025, cloud * 0.018, cloud * 0.012);

  let ground = mix(vec3f(0.02, 0.022, 0.024), vec3f(0.08, 0.085, 0.09), clamp(-rayDir.y * 0.9, 0.0, 1.0));
  var env = mix(ground, sky, smoothstep(-0.08, 0.04, rayDir.y));

  let sunAmount = pow(max(dot(rayDir, keyDir), 0.0), 220.0);
  env = env + vec3f(1.2, 1.05, 0.9) * sunAmount * 1.3;

  if (frame.fogEnabled > 0.5) {
    env = mix(env, frame.fogColor, clamp((1.0 - horizon) * 0.25, 0.0, 1.0));
  }
  return env;
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
  let baseSample = textureSample(baseColorTex, baseColorSamp, in.uv);
  let ormSample = textureSample(ormTex, baseColorSamp, in.uv).rgb;
  let emissiveSample = textureSample(emissiveTex, baseColorSamp, in.uv).rgb;
  let alb = material.baseColor.rgb * baseSample.rgb;
  let alpha = material.baseColor.a * baseSample.a;
  let ao = clamp(ormSample.r, 0.0, 1.0);
  let met = clamp(material.metallic * ormSample.b, 0.0, 1.0);
  let rou = max(material.roughness * ormSample.g, 0.04);

  let kd = normalize(frame.keyLightDir);
  let fd = normalize(vec3f(0.2,0.7,0.35));
  var rad = vec3f(0);
  rad += evalPBR(alb, met, rou, N, V, kd, vec3f(1.20,1.14,1.05));
  rad += evalPBR(alb, met, rou, N, V, fd, vec3f(0.35,0.38,0.45));
  rad += alb * vec3f(0.05, 0.07, 0.11) * (1 - met) * ao;

  let R = reflect(-V, N);
  let f0 = mix(vec3f(0.04), alb, met);
  let envF = fSchlick(max(dot(N, V), 0.0), f0);
  let envSpec = sampleEnvironment(R, frame.cameraPosition, kd);
  let envStrength = mix(0.25, 1.0, met) * (1.0 - rou * 0.85) * mix(0.5, 1.0, ao);
  rad += envSpec * envF * envStrength;

  rad += material.emissive * emissiveSample * material.emissiveIntensity;

  if (frame.shadowsEnabled > 0.5) {
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

const SSR_SHADER = /* wgsl */ `
${POST_UNIFORMS_WGSL}
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var hdrTex: texture_2d<f32>;
@group(0) @binding(3) var normTex: texture_2d<f32>;
@group(0) @binding(4) var matTex: texture_2d<f32>;
${FULLSCREEN_VS_WGSL}

fn fresnelSchlick(cosTheta: f32, f0: vec3f) -> vec3f {
  return f0 + (vec3f(1.0) - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

@fragment fn fsMain(in: VsOut) -> @location(0) vec4f {
  let sampleUv = vec2f(in.uv.x, 1.0 - in.uv.y);
  let src = textureSample(hdrTex, samp, sampleUv).xyz;
  if (frame.ssrEnabled < 0.5) {
    return vec4f(src, 1.0);
  }

  let matInfo = textureSample(matTex, samp, sampleUv);
  let depthProxy = clamp(matInfo.y, 0.0, 1.0);
  let roughness = clamp(matInfo.z, 0.0, 1.0);
  let metallic = clamp(matInfo.w, 0.0, 1.0);
  if (roughness > frame.ssrRoughnessCutoff || metallic < 0.06) {
    return vec4f(src, 1.0);
  }

  let nTex = textureSample(normTex, samp, sampleUv).xyz * 2.0 - vec3f(1.0);
  let N = normalize(nTex);

  let ndc = sampleUv * 2.0 - vec2f(1.0);
  let aspect = max(1.0, frame.width) / max(1.0, frame.height);
  let tanHalfFov = tan(0.5 * 1.0471976);
  let V = normalize(vec3f(ndc.x * aspect * tanHalfFov, ndc.y * tanHalfFov, 1.0));
  let R = reflect(-V, N);

  let dir2 = normalize(R.xy + vec2f(0.00001, 0.00001));
  let texel = vec2f(1.0 / max(1.0, frame.width), 1.0 / max(1.0, frame.height));
  let stride = max(0.4, frame.ssrStride);
  let maxSteps = clamp(frame.ssrMaxSteps, 1.0, 24.0);
  let maxDistance = max(0.01, frame.ssrMaxDistance);
  let thickness = max(0.001, frame.ssrThickness);

  var hitColor = vec3f(0.0);
  var hitConfidence = 0.0;
  var uv = sampleUv;

  for (var i = 0; i < 24; i = i + 1) {
    let fi = f32(i);
    let enabledStep = select(0.0, 1.0, fi < maxSteps);
    if (enabledStep < 0.5) {
      continue;
    }
    let t = (fi + 1.0) / maxSteps;
    let stepScale = (0.7 + t * 1.8) * stride;
    uv = uv + dir2 * texel * stepScale;
    if (uv.x <= 0.001 || uv.y <= 0.001 || uv.x >= 0.999 || uv.y >= 0.999) {
      break;
    }
    let sceneDepth = clamp(textureSample(matTex, samp, uv).y, 0.0, 1.0);
    let rayDepth = depthProxy + t * maxDistance;
    let delta = abs(sceneDepth - rayDepth);
    let crossed = select(0.0, 1.0, sceneDepth >= depthProxy + 0.001 && delta < thickness);
    if (crossed > 0.5) {
      hitColor = textureSample(hdrTex, samp, uv).xyz;
      let edgeFadeX = smoothstep(0.0, 0.06, uv.x) * smoothstep(0.0, 0.06, 1.0 - uv.x);
      let edgeFadeY = smoothstep(0.0, 0.06, uv.y) * smoothstep(0.0, 0.06, 1.0 - uv.y);
      hitConfidence = edgeFadeX * edgeFadeY * (1.0 - t * 0.35);
      break;
    }
  }

  if (hitConfidence <= 0.0) {
    return vec4f(src, 1.0);
  }

  let nv = clamp(dot(N, V), 0.0, 1.0);
  let f0 = vec3f(0.04 + metallic * 0.86);
  let fresnel = fresnelSchlick(nv, f0);
  let roughFade = clamp(1.0 - roughness / max(0.001, frame.ssrRoughnessCutoff), 0.0, 1.0);
  let reflectivity = clamp(metallic * 0.9 + (1.0 - roughness) * 0.25, 0.0, 1.0);
  let blend = clamp(frame.ssrResolve * hitConfidence * roughFade * reflectivity, 0.0, 1.0);
  let reflected = hitColor * fresnel * (0.35 + metallic * 0.65);
  return vec4f(src + reflected * blend, 1.0);
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
  let bloom = select(vec3f(0), textureSample(bloomTex, samp, sampleUv).xyz, frame.bloomEnabled > 0.5);
  let bloomMix = 0.2 + max(0.0, frame.bloomIntensity) * 0.55;
  var col = motion * ao + bloom * bloomMix;

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
  private width = 0;
  private height = 0;
  private readonly postUniformBuffer: GPUBuffer;
  private readonly sceneUniformBuffer: GPUBuffer;
  private readonly shadowCasterBuffer: GPUBuffer;
  private readonly linearSampler: GPUSampler;
  private readonly whiteTexture: LoadedTexture;
  private readonly flatNormalTexture: LoadedTexture;
  private readonly ormDefaultTexture: LoadedTexture;
  private readonly textureCache = new Map<string, Promise<LoadedTexture>>();
  private readonly skyPipeline: GPURenderPipeline;
  private readonly scenePipeline: GPURenderPipeline;
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
  private previousCameraPosition: [number, number, number] | null = null;
  private previousCameraForward: [number, number, number] | null = null;

  constructor(device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat, camera: Camera) {
    this.device = device;
    this.context = context;
    this.format = format;
    this.camera = camera;
    this.postUniformBuffer = device.createBuffer({ size: POST_UNIFORM_FLOAT_COUNT * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.sceneUniformBuffer = device.createBuffer({ size: SCENE_UNIFORM_FLOAT_COUNT * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.shadowCasterBuffer = device.createBuffer({ size: SHADOW_CASTER_FLOAT_COUNT * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.linearSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    this.whiteTexture = this.createSolidTexture(255, 255, 255, 255, 'rgba8unorm-srgb');
    this.flatNormalTexture = this.createSolidTexture(128, 128, 255, 255, 'rgba8unorm');
    this.ormDefaultTexture = this.createSolidTexture(255, 255, 255, 255, 'rgba8unorm');
    this.skyPipeline = this.createSkyPipeline();
    this.scenePipeline = this.createScenePipeline();
    this.aoPipeline = this.createPostPipeline(AO_SHADER, 'r8unorm');
    this.bloomPrefilterPipeline = this.createPostPipeline(BLOOM_PREFILTER_SHADER, 'rgba16float');
    this.bloomBlurHorizontalPipeline = this.createPostPipeline(BLOOM_BLUR_HORIZONTAL_SHADER, 'rgba16float');
    this.bloomBlurVerticalPipeline = this.createPostPipeline(BLOOM_BLUR_VERTICAL_SHADER, 'rgba16float');
    this.dofPrefilterPipeline = this.createPostPipeline(DOF_PREFILTER_SHADER, 'rgba16float');
    this.dofBlurHorizontalPipeline = this.createPostPipeline(DOF_BLUR_HORIZONTAL_SHADER, 'rgba16float');
    this.dofBlurVerticalCombinePipeline = this.createPostPipeline(DOF_BLUR_VERTICAL_COMBINE_SHADER, 'rgba16float');
    this.ssrPipeline = this.createPostPipeline(SSR_SHADER, 'rgba16float');
    this.motionBlurPipeline = this.createPostPipeline(MOTION_BLUR_SHADER, 'rgba16float');
    this.compositePipeline = this.createPostPipeline(COMPOSITE_SHADER, this.format);
  }

  setScene(scene: RenderScene): void {
    for (const m of this.gpuMeshes) {
      m.vertexBuffer.destroy(); m.indexBuffer.destroy();
      m.materialBuffer.destroy(); m.transformBuffer.destroy();
    }
    this.gpuMeshes = scene.meshes.map((inst) => this.uploadMesh(inst));
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, width); const h = Math.max(1, height);
    if (this.width === w && this.height === h) { return; }
    this.width = w; this.height = h;
    for (const name of ['scene-hdr', 'scene-normal', 'scene-material', 'ssr', 'ao', 'bloom-prefilter', 'bloom-temp', 'bloom', 'dof-prefilter', 'dof-temp', 'dof', 'motion-blur'] as const) {
      const fmt = name === 'ao' ? 'r8unorm' : 'rgba16float';
      this.allocTexture(name, fmt);
    }
    this.allocTexture('scene-depth', 'depth24plus');
    this.rebuildBindGroups();
  }

  render(config: RendererConfig, timeSeconds: number): RenderPassTimingResult[] {
    const timings: RenderPassTimingResult[] = [];
    const cp = this.camera.getLocation(); const cf = this.camera.forwardDir();
    const cr = this.camera.rightDir(); const cu = this.camera.upDir();
    const ssrPassEnabled = false;

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

    const sceneUniformData = new Float32Array([
      timeSeconds, this.width, this.height, 0,
      cp[0],cp[1],cp[2],0, cf[0],cf[1],cf[2],0, cr[0],cr[1],cr[2],0, cu[0],cu[1],cu[2],0,
      this.camera.getFovYRadians(), this.camera.getNear(), this.camera.getFar(), config.shadows.enabled ? 1 : 0,
      config.fog.enabled?1:0, config.fog.density, config.fog.startDistance, config.fog.endDistance,
      config.fog.color[0], config.fog.color[1], config.fog.color[2], config.fog.heightFalloff,
      keyLight[0], keyLight[1], keyLight[2], 0,
      this.detectShadowReceiverHeight(), this.detectShadowReceiverBand(), 0, 0,
    ]);
    this.device.queue.writeBuffer(this.sceneUniformBuffer, 0, sceneUniformData);

    const shadowCasterData = new Float32Array(SHADOW_CASTER_FLOAT_COUNT);
    let shadowCasterCount = 0;
    for (const mesh of this.gpuMeshes) {
      if (mesh.transparent) {
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
      const radius = rawRadius * 0.72;
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
    this.device.queue.writeBuffer(this.shadowCasterBuffer, 0, shadowCasterData);

    const hdr = this.req('scene-hdr'); const norm = this.req('scene-normal'); const mat = this.req('scene-material');
    const depth = this.req('scene-depth'); const ssr = this.req('ssr'); const ao = this.req('ao'); const bloomPrefilter = this.req('bloom-prefilter');
    const bloomTemp = this.req('bloom-temp'); const bloom = this.req('bloom');
    const dofPrefilter = this.req('dof-prefilter'); const dofTemp = this.req('dof-temp');
    const dof = this.req('dof'); const motionBlur = this.req('motion-blur');
    const canvas = this.context.getCurrentTexture().createView();
    const enc = this.device.createCommandEncoder();

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
          ],
        });
        pass.setBindGroup(0, frameGroup);
        for (const m of this.gpuMeshes) {
          pass.setBindGroup(1, m.meshBindGroup);
          pass.setVertexBuffer(0, m.vertexBuffer);
          pass.setIndexBuffer(m.indexBuffer, 'uint32');
          pass.drawIndexed(m.indexCount);
        }
      }
      pass.end();
    });

    if (ssrPassEnabled) {
      this.tp(timings, 'screen-space-reflections-copy', () => {
        enc.copyTextureToTexture(
          { texture: hdr.texture },
          { texture: ssr.texture },
          { width: this.width, height: this.height, depthOrArrayLayers: 1 },
        );
      });
    }

    this.tp(timings, 'ambient-occlusion', () => {
      const pass = enc.beginRenderPass({ colorAttachments: [{view:ao.view, loadOp:'clear', storeOp:'store', clearValue:{r:1,g:1,b:1,a:1}}] });
      if (this.aoBindGroup) { pass.setPipeline(this.aoPipeline); pass.setBindGroup(0, this.aoBindGroup); pass.draw(3); }
      pass.end();
    });
    this.tp(timings, 'screen-space-reflections', () => {
      if (!ssrPassEnabled || !this.ssrBindGroup) {
        return;
      }
      const pass = enc.beginRenderPass({ colorAttachments: [{view:ssr.view, loadOp:'load', storeOp:'store'}] });
      if (this.ssrBindGroup) {
        pass.setPipeline(this.ssrPipeline);
        pass.setBindGroup(0, this.ssrBindGroup);
        pass.draw(3);
      }
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
    this.tp(timings, 'color-grading', () => {
      const pass = enc.beginRenderPass({ colorAttachments: [{view:canvas, loadOp:'clear', storeOp:'store', clearValue:{r:0,g:0,b:0,a:1}}] });
      if (this.compositeBindGroup) { pass.setPipeline(this.compositePipeline); pass.setBindGroup(0, this.compositeBindGroup); pass.draw(3); }
      pass.end();
    });

    this.device.queue.submit([enc.finish()]);
    return timings;
  }

  private uploadMesh(inst: SceneMeshInstance): GpuMesh {
    const { geometry, material, transform } = inst;
    const vb = this.device.createBuffer({ size: geometry.vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(vb, 0, geometry.vertices.buffer, geometry.vertices.byteOffset, geometry.vertices.byteLength);
    const ib = this.device.createBuffer({ size: geometry.indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(ib, 0, geometry.indices.buffer, geometry.indices.byteOffset, geometry.indices.byteLength);
    const matData = new Float32Array([
      material.baseColor[0], material.baseColor[1], material.baseColor[2], material.baseColor[3],
      material.emissive[0], material.emissive[1], material.emissive[2], material.emissiveIntensity,
      material.metallic, material.roughness, material.twoSided?1:0, material.transparent?1:0,
      0,0,0,0,
    ]);
    const mb = this.device.createBuffer({ size: MATERIAL_UNIFORM_FLOAT_COUNT * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(mb, 0, matData);
    const world = transform ?? mat4Identity();
    const tb = this.device.createBuffer({ size: TRANSFORM_UNIFORM_FLOAT_COUNT * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(tb, 0, world.buffer, world.byteOffset, world.byteLength);

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
    const boundsCenter: [number, number, number] = [
      (minX + maxX) * 0.5,
      (minY + maxY) * 0.5,
      (minZ + maxZ) * 0.5,
    ];
    const boundsExtents: [number, number, number] = [
      Math.max(0.0001, (maxX - minX) * 0.5),
      Math.max(0.0001, (maxY - minY) * 0.5),
      Math.max(0.0001, (maxZ - minZ) * 0.5),
    ];
    let boundsRadius = 0;
    for (let index = 0; index < geometry.vertexCount; index += 1) {
      const offset = index * stride;
      const dx = geometry.vertices[offset] - boundsCenter[0];
      const dy = geometry.vertices[offset + 1] - boundsCenter[1];
      const dz = geometry.vertices[offset + 2] - boundsCenter[2];
      boundsRadius = Math.max(boundsRadius, Math.hypot(dx, dy, dz));
    }

    const gpuMesh: GpuMesh = {
      vertexBuffer: vb,
      indexBuffer: ib,
      indexCount: geometry.indexCount,
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
      boundsCenter,
      boundsExtents,
      boundsRadius: Math.max(0.0001, boundsRadius),
      transparent: material.transparent,
    };

    const baseColorTextureUrl = material.textures.baseColor;
    const normalTextureUrl = material.textures.normal;
    const ormTextureUrl = material.textures.orm;
    const emissiveTextureUrl = material.textures.emissive;

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

  private detectShadowReceiverHeight(): number {
    let receiverHeight = Number.POSITIVE_INFINITY;
    for (const mesh of this.gpuMeshes) {
      if (mesh.transparent) {
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
      if (mesh.transparent) {
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
    const bloom = this.req('bloom'); const dof = this.req('dof');
    const motionBlur = this.req('motion-blur');
    this.skyBindGroup = this.device.createBindGroup({ layout: this.skyPipeline.getBindGroupLayout(0), entries: [{binding:0, resource:{buffer:this.sceneUniformBuffer}}] });
    this.aoBindGroup = this.device.createBindGroup({ layout: this.aoPipeline.getBindGroupLayout(0), entries: [{binding:0,resource:{buffer:this.postUniformBuffer}},{binding:1,resource:this.linearSampler},{binding:2,resource:mat.view},{binding:3,resource:norm.view}] });
    this.ssrBindGroup = this.device.createBindGroup({ layout: this.ssrPipeline.getBindGroupLayout(0), entries: [{binding:0,resource:{buffer:this.postUniformBuffer}},{binding:1,resource:this.linearSampler},{binding:2,resource:hdr.view},{binding:3,resource:norm.view},{binding:4,resource:mat.view}] });
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
    this.motionBlurBindGroup = this.device.createBindGroup({ layout: this.motionBlurPipeline.getBindGroupLayout(0), entries: [{binding:0,resource:{buffer:this.postUniformBuffer}},{binding:1,resource:this.linearSampler},{binding:2,resource:dof.view},{binding:3,resource:mat.view}] });
    this.compositeBindGroup = this.device.createBindGroup({ layout: this.compositePipeline.getBindGroupLayout(0), entries: [{binding:0,resource:{buffer:this.postUniformBuffer}},{binding:1,resource:this.linearSampler},{binding:2,resource:mat.view},{binding:3,resource:ao.view},{binding:4,resource:bloom.view},{binding:5,resource:dof.view},{binding:6,resource:motionBlur.view}] });
  }

  private createSkyPipeline(): GPURenderPipeline {
    const mod = this.device.createShaderModule({ code: SKY_SHADER });
    return this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: mod, entryPoint: 'vsMain' },
      fragment: { module: mod, entryPoint: 'fsMain', targets: [{format:'rgba16float'},{format:'rgba16float'},{format:'rgba16float'}] },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less-equal' },
      primitive: { topology: 'triangle-list' },
    });
  }

  private createScenePipeline(): GPURenderPipeline {
    const mod = this.device.createShaderModule({ code: SCENE_SHADER });
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

  private createPostPipeline(code: string, fmt: GPUTextureFormat): GPURenderPipeline {
    const mod = this.device.createShaderModule({ code });
    return this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: mod, entryPoint: 'vsMain' },
      fragment: { module: mod, entryPoint: 'fsMain', targets: [{format: fmt}] },
      primitive: { topology: 'triangle-list' },
    });
  }

  private tp(target: RenderPassTimingResult[], name: string, run: () => void): void {
    const s = performance.now(); run(); target.push({ passName: name, cpuTimeMs: performance.now() - s });
  }
}
