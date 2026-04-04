import type { RendererConfig } from '../config/RendererConfig';
import { Camera } from '../../camera/Camera';
import { FrameResourceStore } from '../graph/FrameResourceStore';
import type { RenderPassTimingResult } from '../graph/RenderGraphTypes';
type TextureHandle = {
  texture: GPUTexture;
  view: GPUTextureView;
  format: GPUTextureFormat;
};
const SCENE_SHADER = /* wgsl */ `
struct FrameUniforms {
  time: f32,
  width: f32,
  height: f32,
  _pad0: f32,
  bloomThreshold: f32,
  bloomKnee: f32,
  dofFocusDistance: f32,
  dofFocusRange: f32,
  dofAperture: f32,
  dofMaxCoc: f32,
  exposure: f32,
  contrast: f32,
  saturation: f32,
  temperature: f32,
  tint: f32,
  _pad1: f32,
  cameraPosition: vec3f,
  _pad2: f32,
  cameraForward: vec3f,
  _pad3: f32,
  cameraRight: vec3f,
  _pad4: f32,
  cameraUp: vec3f,
  _pad5: f32,
  cameraFovY: f32,
  cameraNear: f32,
  cameraFar: f32,
  _pad6: f32,
}

@group(0) @binding(0) var<uniform> frame: FrameUniforms;

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

  var out: VsOut;
  let pos = positions[vertexIndex];
  out.position = vec4f(pos, 0.0, 1.0);
  out.uv = pos * 0.5 + vec2f(0.5, 0.5);
  return out;
}

struct SceneOut {
  @location(0) hdr: vec4f,
  @location(1) normal: vec4f,
  @location(2) material: vec4f,
  @builtin(frag_depth) depth: f32,
}

fn sphereSdf(p: vec3f, center: vec3f, radius: f32) -> f32 {
  return length(p - center) - radius;
}

fn planeSdf(p: vec3f, normal: vec3f, offset: f32) -> f32 {
  return dot(p, normal) + offset;
}

fn mapScene(p: vec3f) -> vec2f {
  let sphereCenter = vec3f(sin(frame.time * 0.5) * 1.25, 0.9, -5.5);
  let dSphere = sphereSdf(p, sphereCenter, 0.9);
  let dPlane = planeSdf(p, vec3f(0.0, 1.0, 0.0), 0.2);

  if (dSphere < dPlane) {
    return vec2f(dSphere, 1.0);
  }

  return vec2f(dPlane, 2.0);
}

fn estimateNormal(p: vec3f) -> vec3f {
  let e = 0.002;
  let d = mapScene(p).x;
  let n = vec3f(
    mapScene(p + vec3f(e, 0.0, 0.0)).x - d,
    mapScene(p + vec3f(0.0, e, 0.0)).x - d,
    mapScene(p + vec3f(0.0, 0.0, e)).x - d,
  );
  return normalize(n);
}

@fragment
fn fsMain(in: VsOut) -> SceneOut {
  let resolution = vec2f(max(1.0, frame.width), max(1.0, frame.height));
  let uv = in.uv;
  let ndc = uv * 2.0 - vec2f(1.0, 1.0);
  let aspect = resolution.x / resolution.y;

  let origin = frame.cameraPosition;
  let tanHalfFov = tan(frame.cameraFovY * 0.5);
  let rayDir = normalize(
    frame.cameraForward +
    frame.cameraRight * (ndc.x * aspect * tanHalfFov) +
    frame.cameraUp * (-ndc.y * tanHalfFov),
  );

  var t = 0.0;
  var materialId = 0.0;
  var hit = false;

  for (var step = 0; step < 96; step = step + 1) {
    let position = origin + rayDir * t;
    let scene = mapScene(position);
    if (scene.x < 0.0015) {
      hit = true;
      materialId = scene.y;
      break;
    }

    t = t + scene.x;
    if (t > 60.0) {
      break;
    }
  }

  var out: SceneOut;

  if (!hit) {
    let sky = vec3f(0.04, 0.06, 0.1) + vec3f(0.06, 0.1, 0.18) * max(0.0, 1.0 - uv.y);
    out.hdr = vec4f(sky, 1.0);
    out.normal = vec4f(0.5, 0.5, 1.0, 1.0);
    out.material = vec4f(0.0, 1.0, 0.0, 1.0);
    out.depth = 1.0;
    return out;
  }

  let hitPos = origin + rayDir * t;
  var normal = estimateNormal(hitPos);
  let viewDir = normalize(origin - hitPos);

  let keyLightDir = normalize(vec3f(0.35, -1.0, -0.25));
  let fillLightDir = normalize(vec3f(-0.2, -0.7, -0.35));

  let baseColor = select(vec3f(0.14, 0.16, 0.18), vec3f(0.9, 0.74, 0.56), materialId < 1.5);

  let ndlKey = max(0.0, dot(normal, -keyLightDir));
  let ndlFill = max(0.0, dot(normal, -fillLightDir));
  let halfVec = normalize(-keyLightDir + viewDir);
  let specular = pow(max(0.0, dot(normal, halfVec)), 42.0);

  let lit = baseColor * (0.18 + ndlKey * 1.55 + ndlFill * 0.45) + vec3f(1.0, 0.95, 0.9) * specular * 1.2;

  let linearDepth = clamp(t / 60.0, 0.0, 1.0);
  let highlight = clamp(specular * 1.2 + ndlKey * 0.25, 0.0, 1.0);

  out.hdr = vec4f(lit, 1.0);
  out.normal = vec4f(normal * 0.5 + vec3f(0.5), 1.0);
  out.material = vec4f(highlight, linearDepth, 0.0, 1.0);
  out.depth = linearDepth;
  return out;
}
`;
const AO_SHADER = /* wgsl */ `
struct FrameUniforms {
  time: f32,
  width: f32,
  height: f32,
  _pad0: f32,
  bloomThreshold: f32,
  bloomKnee: f32,
  dofFocusDistance: f32,
  dofFocusRange: f32,
  dofAperture: f32,
  dofMaxCoc: f32,
  exposure: f32,
  contrast: f32,
  saturation: f32,
  temperature: f32,
  tint: f32,
  _pad1: f32,
}

@group(0) @binding(0) var<uniform> frame: FrameUniforms;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var materialTex: texture_2d<f32>;
@group(0) @binding(3) var normalTex: texture_2d<f32>;

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

  var out: VsOut;
  let pos = positions[vertexIndex];
  out.position = vec4f(pos, 0.0, 1.0);
  out.uv = pos * 0.5 + vec2f(0.5, 0.5);
  return out;
}

@fragment
fn fsMain(in: VsOut) -> @location(0) vec4f {
  let texel = vec2f(1.0 / frame.width, 1.0 / frame.height);
  let materialCenter = textureSample(materialTex, linearSampler, in.uv);
  let depthCenter = materialCenter.y;
  let normalCenter = textureSample(normalTex, linearSampler, in.uv).xyz * 2.0 - vec3f(1.0);

  let offsets = array<vec2f, 4>(
    vec2f(texel.x, 0.0),
    vec2f(-texel.x, 0.0),
    vec2f(0.0, texel.y),
    vec2f(0.0, -texel.y),
  );

  var occlusion = 0.0;
  for (var i = 0; i < 4; i = i + 1) {
    let uv = in.uv + offsets[i];
    let materialSample = textureSample(materialTex, linearSampler, uv);
    let depthDelta = max(0.0, materialSample.y - depthCenter);
    let normalSample = textureSample(normalTex, linearSampler, uv).xyz * 2.0 - vec3f(1.0);
    let normalTerm = max(0.0, dot(normalCenter, normalSample));
    occlusion = occlusion + depthDelta * (1.0 - normalTerm * 0.75);
  }

  let ao = clamp(1.0 - occlusion * 6.0, 0.0, 1.0);
  return vec4f(vec3f(ao), 1.0);
}
`;
const BLOOM_SHADER = /* wgsl */ `
struct FrameUniforms {
  time: f32,
  width: f32,
  height: f32,
  _pad0: f32,
  bloomThreshold: f32,
  bloomKnee: f32,
  dofFocusDistance: f32,
  dofFocusRange: f32,
  dofAperture: f32,
  dofMaxCoc: f32,
  exposure: f32,
  contrast: f32,
  saturation: f32,
  temperature: f32,
  tint: f32,
  _pad1: f32,
}

@group(0) @binding(0) var<uniform> frame: FrameUniforms;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var hdrTex: texture_2d<f32>;

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

  var out: VsOut;
  let pos = positions[vertexIndex];
  out.position = vec4f(pos, 0.0, 1.0);
  out.uv = pos * 0.5 + vec2f(0.5, 0.5);
  return out;
}

@fragment
fn fsMain(in: VsOut) -> @location(0) vec4f {
  let texel = vec2f(1.0 / frame.width, 1.0 / frame.height);

  var color = vec3f(0.0);
  var weightSum = 0.0;

  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let offset = vec2f(f32(x), f32(y)) * texel * 1.6;
      let sampleColor = textureSample(hdrTex, linearSampler, in.uv + offset).xyz;
      let luma = dot(sampleColor, vec3f(0.2126, 0.7152, 0.0722));
      let kneeStart = frame.bloomThreshold - frame.bloomKnee;
      let soft = clamp((luma - kneeStart) / max(0.0001, frame.bloomKnee), 0.0, 1.0);
      let hard = select(0.0, 1.0, luma > frame.bloomThreshold);
      let brightWeight = max(soft * 0.8, hard);
      let weight = 1.0 / (1.0 + length(vec2f(f32(x), f32(y))));
      color = color + sampleColor * brightWeight * weight;
      weightSum = weightSum + weight;
    }
  }

  if (weightSum > 0.0) {
    color = color / weightSum;
  }

  return vec4f(color, 1.0);
}
`;
const DOF_SHADER = /* wgsl */ `
struct FrameUniforms {
  time: f32,
  width: f32,
  height: f32,
  _pad0: f32,
  bloomThreshold: f32,
  bloomKnee: f32,
  dofFocusDistance: f32,
  dofFocusRange: f32,
  dofAperture: f32,
  dofMaxCoc: f32,
  exposure: f32,
  contrast: f32,
  saturation: f32,
  temperature: f32,
  tint: f32,
  _pad1: f32,
}

@group(0) @binding(0) var<uniform> frame: FrameUniforms;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var hdrTex: texture_2d<f32>;
@group(0) @binding(3) var materialTex: texture_2d<f32>;

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

  var out: VsOut;
  let pos = positions[vertexIndex];
  out.position = vec4f(pos, 0.0, 1.0);
  out.uv = pos * 0.5 + vec2f(0.5, 0.5);
  return out;
}

@fragment
fn fsMain(in: VsOut) -> @location(0) vec4f {
  let texel = vec2f(1.0 / frame.width, 1.0 / frame.height);
  let material = textureSample(materialTex, linearSampler, in.uv);
  let linearDepth = material.y * 60.0;
  let highlight = material.x;

  let cocNorm = clamp(abs(linearDepth - frame.dofFocusDistance) / max(0.001, frame.dofFocusRange), 0.0, 1.0);
  let coc = clamp(cocNorm * frame.dofAperture, 0.0, frame.dofMaxCoc);
  let radius = coc * 0.004 + highlight * 0.002;

  var color = vec3f(0.0);
  var weightSum = 0.0;

  for (var i = 0; i < 8; i = i + 1) {
    let angle = f32(i) * 0.78539816339;
    let dir = vec2f(cos(angle), sin(angle));
    let sampleUv = in.uv + dir * radius;
    let weight = 1.0;
    color = color + textureSample(hdrTex, linearSampler, sampleUv).xyz * weight;
    weightSum = weightSum + weight;
  }

  if (weightSum > 0.0) {
    color = color / weightSum;
  }

  let center = textureSample(hdrTex, linearSampler, in.uv).xyz;
  let blend = clamp(coc / max(0.001, frame.dofMaxCoc), 0.0, 1.0);
  let mixed = center * (1.0 - blend) + color * blend;

  return vec4f(mixed, 1.0);
}
`;
const COMPOSITE_SHADER = /* wgsl */ `
struct FrameUniforms {
  time: f32,
  width: f32,
  height: f32,
  _pad0: f32,
  bloomThreshold: f32,
  bloomKnee: f32,
  dofFocusDistance: f32,
  dofFocusRange: f32,
  dofAperture: f32,
  dofMaxCoc: f32,
  exposure: f32,
  contrast: f32,
  saturation: f32,
  temperature: f32,
  tint: f32,
  _pad1: f32,
}

@group(0) @binding(0) var<uniform> frame: FrameUniforms;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var hdrTex: texture_2d<f32>;
@group(0) @binding(3) var aoTex: texture_2d<f32>;
@group(0) @binding(4) var bloomTex: texture_2d<f32>;
@group(0) @binding(5) var dofTex: texture_2d<f32>;

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

  var out: VsOut;
  let pos = positions[vertexIndex];
  out.position = vec4f(pos, 0.0, 1.0);
  out.uv = pos * 0.5 + vec2f(0.5, 0.5);
  return out;
}

fn acesTonemap(x: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + vec3f(b))) / (x * (c * x + vec3f(d)) + vec3f(e)), vec3f(0.0), vec3f(1.0));
}

@fragment
fn fsMain(in: VsOut) -> @location(0) vec4f {
  let ao = textureSample(aoTex, linearSampler, in.uv).x;
  let hdr = textureSample(hdrTex, linearSampler, in.uv).xyz;
  let dof = textureSample(dofTex, linearSampler, in.uv).xyz;
  let bloom = textureSample(bloomTex, linearSampler, in.uv).xyz;

  var color = dof * ao;
  color = color + bloom * 0.35;

  let exposureScale = exp2(frame.exposure);
  color = color * exposureScale;

  let luma = dot(color, vec3f(0.2126, 0.7152, 0.0722));
  color = vec3f(luma) + (color - vec3f(luma)) * frame.saturation;
  color = (color - vec3f(0.5)) * frame.contrast + vec3f(0.5);

  color = color + vec3f(frame.temperature * 0.02 + frame.tint * 0.01, -frame.tint * 0.01, -frame.temperature * 0.02);
  color = acesTonemap(max(color, vec3f(0.0)));

  let mixed = mix(hdr, color, 1.0);
  return vec4f(mixed, 1.0);
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
  private frameUniformBuffer: GPUBuffer;
  private linearSampler: GPUSampler;
  private scenePipeline: GPURenderPipeline;
  private aoPipeline: GPURenderPipeline;
  private bloomPipeline: GPURenderPipeline;
  private dofPipeline: GPURenderPipeline;
  private compositePipeline: GPURenderPipeline;
  private sceneBindGroup: GPUBindGroup | null = null;
  private aoBindGroup: GPUBindGroup | null = null;
  private bloomBindGroup: GPUBindGroup | null = null;
  private dofBindGroup: GPUBindGroup | null = null;
  private compositeBindGroup: GPUBindGroup | null = null;
  constructor(
    device: GPUDevice,
    context: GPUCanvasContext,
    format: GPUTextureFormat,
    camera: Camera,
  ) {
    this.device = device;
    this.context = context;
    this.format = format;
    this.camera = camera;
    this.frameUniformBuffer = device.createBuffer({
      size: 32 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.linearSampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    this.scenePipeline = this.createScenePipeline();
    this.aoPipeline = this.createSingleTargetPipeline(AO_SHADER, 'r8unorm');
    this.bloomPipeline = this.createSingleTargetPipeline(BLOOM_SHADER, 'rgba16float');
    this.dofPipeline = this.createSingleTargetPipeline(DOF_SHADER, 'rgba16float');
    this.compositePipeline = this.createSingleTargetPipeline(COMPOSITE_SHADER, this.format);
  }
  resize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    if (this.width === w && this.height === h) {
      return;
    }
    this.width = w;
    this.height = h;
    this.createOrResizeTexture('scene-hdr', 'rgba16float');
    this.createOrResizeTexture('scene-normal', 'rgba16float');
    this.createOrResizeTexture('scene-material', 'rgba16float');
    this.createOrResizeTexture('scene-depth', 'depth24plus');
    this.createOrResizeTexture('ao', 'r8unorm');
    this.createOrResizeTexture('bloom', 'rgba16float');
    this.createOrResizeTexture('dof', 'rgba16float');
    this.rebuildBindGroups();
  }
  render(config: RendererConfig, timeSeconds: number): RenderPassTimingResult[] {
    const timings: RenderPassTimingResult[] = [];
    const cameraPosition = this.camera.getLocation();
    const cameraForward = this.camera.forwardDir();
    const cameraRight = this.camera.rightDir();
    const cameraUp = this.camera.upDir();
    const frameData = new Float32Array([
      timeSeconds,
      this.width,
      this.height,
      0,
      config.bloom.threshold,
      config.bloom.knee,
      config.depthOfField.focusDistance,
      config.depthOfField.focusRange,
      config.depthOfField.aperture,
      config.depthOfField.maxCoC,
      config.colorGrading.exposure,
      config.colorGrading.contrast,
      config.colorGrading.saturation,
      config.colorGrading.temperature,
      config.colorGrading.tint,
      0,
      cameraPosition[0],
      cameraPosition[1],
      cameraPosition[2],
      0,
      cameraForward[0],
      cameraForward[1],
      cameraForward[2],
      0,
      cameraRight[0],
      cameraRight[1],
      cameraRight[2],
      0,
      cameraUp[0],
      cameraUp[1],
      cameraUp[2],
      0,
      this.camera.getFovYRadians(),
      this.camera.getNear(),
      this.camera.getFar(),
      0,
    ]);
    this.device.queue.writeBuffer(this.frameUniformBuffer, 0, frameData);
    const sceneHdr = this.requireTexture('scene-hdr');
    const sceneNormal = this.requireTexture('scene-normal');
    const sceneMaterial = this.requireTexture('scene-material');
    const sceneDepth = this.requireTexture('scene-depth');
    const ao = this.requireTexture('ao');
    const bloom = this.requireTexture('bloom');
    const dof = this.requireTexture('dof');
    const currentCanvasView = this.context.getCurrentTexture().createView();
    const encoder = this.device.createCommandEncoder();
    this.timePass(timings, 'scene-prepass', () => {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: sceneHdr.view,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          },
          {
            view: sceneNormal.view,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0.5, g: 0.5, b: 1, a: 1 },
          },
          {
            view: sceneMaterial.view,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 1, b: 0, a: 1 },
          },
        ],
        depthStencilAttachment: {
          view: sceneDepth.view,
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      });
      pass.setPipeline(this.scenePipeline);
      if (this.sceneBindGroup) {
        pass.setBindGroup(0, this.sceneBindGroup);
      }
      pass.draw(3);
      pass.end();
    });
    this.timePass(timings, 'ambient-occlusion', () => {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: ao.view,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 1, g: 1, b: 1, a: 1 },
          },
        ],
      });
      pass.setPipeline(this.aoPipeline);
      if (this.aoBindGroup) {
        pass.setBindGroup(0, this.aoBindGroup);
      }
      pass.draw(3);
      pass.end();
    });
    this.timePass(timings, 'bloom', () => {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: bloom.view,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          },
        ],
      });
      pass.setPipeline(this.bloomPipeline);
      if (this.bloomBindGroup) {
        pass.setBindGroup(0, this.bloomBindGroup);
      }
      pass.draw(3);
      pass.end();
    });
    this.timePass(timings, 'depth-of-field', () => {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: dof.view,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          },
        ],
      });
      pass.setPipeline(this.dofPipeline);
      if (this.dofBindGroup) {
        pass.setBindGroup(0, this.dofBindGroup);
      }
      pass.draw(3);
      pass.end();
    });
    this.timePass(timings, 'color-grading', () => {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: currentCanvasView,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          },
        ],
      });
      pass.setPipeline(this.compositePipeline);
      if (this.compositeBindGroup) {
        pass.setBindGroup(0, this.compositeBindGroup);
      }
      pass.draw(3);
      pass.end();
    });
    this.device.queue.submit([encoder.finish()]);
    return timings;
  }
  private createOrResizeTexture(name: string, format: GPUTextureFormat): void {
    const old = this.resources.get<TextureHandle>(name);
    if (old) {
      old.texture.destroy();
    }
    const usage =
      format === 'depth24plus'
        ? GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        : GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    const texture = this.device.createTexture({
      size: { width: this.width, height: this.height, depthOrArrayLayers: 1 },
      format,
      usage,
    });
    this.resources.set(name, {
      texture,
      view: texture.createView(),
      format,
    } satisfies TextureHandle);
  }
  private requireTexture(name: string): TextureHandle {
    return this.resources.require<TextureHandle>(name);
  }
  private rebuildBindGroups(): void {
    const sceneHdr = this.requireTexture('scene-hdr');
    const sceneNormal = this.requireTexture('scene-normal');
    const sceneMaterial = this.requireTexture('scene-material');
    const ao = this.requireTexture('ao');
    const bloom = this.requireTexture('bloom');
    const dof = this.requireTexture('dof');
    this.sceneBindGroup = this.device.createBindGroup({
      layout: this.scenePipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: this.frameUniformBuffer },
        },
      ],
    });
    this.aoBindGroup = this.device.createBindGroup({
      layout: this.aoPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.frameUniformBuffer } },
        { binding: 1, resource: this.linearSampler },
        { binding: 2, resource: sceneMaterial.view },
        { binding: 3, resource: sceneNormal.view },
      ],
    });
    this.bloomBindGroup = this.device.createBindGroup({
      layout: this.bloomPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.frameUniformBuffer } },
        { binding: 1, resource: this.linearSampler },
        { binding: 2, resource: sceneHdr.view },
      ],
    });
    this.dofBindGroup = this.device.createBindGroup({
      layout: this.dofPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.frameUniformBuffer } },
        { binding: 1, resource: this.linearSampler },
        { binding: 2, resource: sceneHdr.view },
        { binding: 3, resource: sceneMaterial.view },
      ],
    });
    this.compositeBindGroup = this.device.createBindGroup({
      layout: this.compositePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.frameUniformBuffer } },
        { binding: 1, resource: this.linearSampler },
        { binding: 2, resource: sceneHdr.view },
        { binding: 3, resource: ao.view },
        { binding: 4, resource: bloom.view },
        { binding: 5, resource: dof.view },
      ],
    });
  }
  private createScenePipeline(): GPURenderPipeline {
    const shaderModule = this.device.createShaderModule({ code: SCENE_SHADER });
    return this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vsMain',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fsMain',
        targets: [{ format: 'rgba16float' }, { format: 'rgba16float' }, { format: 'rgba16float' }],
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
      primitive: {
        topology: 'triangle-list',
      },
    });
  }
  private createSingleTargetPipeline(
    shaderCode: string,
    targetFormat: GPUTextureFormat,
  ): GPURenderPipeline {
    const shaderModule = this.device.createShaderModule({ code: shaderCode });
    return this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vsMain',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fsMain',
        targets: [{ format: targetFormat }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });
  }
  private timePass(target: RenderPassTimingResult[], passName: string, run: () => void): void {
    const start = performance.now();
    run();
    target.push({
      passName,
      cpuTimeMs: performance.now() - start,
    });
  }
}
