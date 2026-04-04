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
};

const POST_UNIFORM_FLOAT_COUNT = 20;
const SCENE_UNIFORM_FLOAT_COUNT = 48;
const MATERIAL_UNIFORM_FLOAT_COUNT = 16;
const TRANSFORM_UNIFORM_FLOAT_COUNT = 16;

const SCENE_UNIFORMS_WGSL = /* wgsl */ `
struct FrameUniforms {
  time: f32, width: f32, height: f32, _pad0: f32,
  bloomThreshold: f32, bloomKnee: f32, dofFocusDistance: f32, dofFocusRange: f32,
  dofAperture: f32, dofMaxCoc: f32, exposure: f32, contrast: f32,
  saturation: f32, temperature: f32, tint: f32, aoEnabled: f32,
  bloomEnabled: f32, dofEnabled: f32, colorGradingEnabled: f32, _pad1: f32,
  cameraPosition: vec3f, _pad2: f32,
  cameraForward: vec3f, _pad3: f32,
  cameraRight: vec3f, _pad4: f32,
  cameraUp: vec3f, _pad5: f32,
  cameraFovY: f32, cameraNear: f32, cameraFar: f32, shadowsEnabled: f32,
  fogEnabled: f32, fogDensity: f32, fogStartDistance: f32, fogEndDistance: f32,
  fogColor: vec3f, fogHeightFalloff: f32,
}
@group(0) @binding(0) var<uniform> frame: FrameUniforms;
`;

const POST_UNIFORMS_WGSL = /* wgsl */ `
struct FrameUniforms {
  time: f32, width: f32, height: f32, _pad0: f32,
  bloomThreshold: f32, bloomKnee: f32, dofFocusDistance: f32, dofFocusRange: f32,
  dofAperture: f32, dofMaxCoc: f32, exposure: f32, contrast: f32,
  saturation: f32, temperature: f32, tint: f32, aoEnabled: f32,
  bloomEnabled: f32, dofEnabled: f32, colorGradingEnabled: f32, _pad1: f32,
}
@group(0) @binding(0) var<uniform> frame: FrameUniforms;
`;

const FULLSCREEN_VS_WGSL = /* wgsl */ `
struct VsOut { @builtin(position) position: vec4f, @location(0) uv: vec2f, }
@vertex fn vsMain(@builtin(vertex_index) vi: u32) -> VsOut {
  var p = array<vec2f,3>(vec2f(-1,-3),vec2f(3,1),vec2f(-1,1));
  var o: VsOut; o.position = vec4f(p[vi],0,1); o.uv = p[vi]*0.5+vec2f(0.5); return o;
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
  var p = array<vec2f,3>(vec2f(-1,-3),vec2f(3,1),vec2f(-1,1));
  var o: VsOut; o.position = vec4f(p[vi], 0.9999, 1); o.uv = p[vi]*0.5+vec2f(0.5); return o;
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
  var sky = mix(vec3f(0.03,0.05,0.09), vec3f(0.12,0.18,0.28), horizon);
  let cp = rayDir.x*5.5 + rayDir.z*4.5 + origin.x*0.22 + origin.z*0.17 + frame.time*0.08;
  let cloud = sin(cp)*0.5+0.5;
  sky = sky + vec3f(cloud*0.025, cloud*0.018, cloud*0.012);
  if (frame.fogEnabled > 0.5) {
    sky = mix(sky, frame.fogColor, clamp((1.0-horizon)*0.35, 0.0, 1.0));
  }
  var o: SkyOut;
  o.hdr = vec4f(sky,1); o.normal = vec4f(0.5,0.5,1,1); o.material = vec4f(0,1,0,1);
  return o;
}
`;

const SCENE_SHADER = /* wgsl */ `
${SCENE_UNIFORMS_WGSL}
struct MaterialUniforms {
  baseColor: vec4f,
  emissive: vec3f, emissiveIntensity: f32,
  metalness: f32, roughness: f32, twoSided: f32, transparent: f32,
  _pad: vec4f,
}
struct TransformUniforms { model: mat4x4f, }
@group(1) @binding(0) var<uniform> material: MaterialUniforms;
@group(1) @binding(1) var<uniform> transform: TransformUniforms;

struct VsOut {
  @builtin(position) clipPos: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) worldNormal: vec3f,
  @location(2) uv: vec2f,
}
@vertex fn vsMain(
  @location(0) pos: vec3f, @location(1) norm: vec3f,
  @location(2) uv: vec2f,  @location(3) tangent: vec4f,
) -> VsOut {
  let wp4 = transform.model * vec4f(pos, 1.0);
  let wp = wp4.xyz;
  let m = transform.model;
  let wn = normalize((m * vec4f(norm, 0.0)).xyz);

  let r = frame.cameraRight; let u = frame.cameraUp; let f = frame.cameraForward; let e = frame.cameraPosition;
  let vx = vec4f(r.x, u.x, -f.x, 0); let vy = vec4f(r.y, u.y, -f.y, 0);
  let vz = vec4f(r.z, u.z, -f.z, 0); let vw = vec4f(-dot(r,e), -dot(u,e), dot(f,e), 1);
  let view = mat4x4f(vx, vy, vz, vw);
  let vp4 = view * wp4;

  let near = frame.cameraNear; let far = frame.cameraFar;
  let fv = 1.0 / tan(frame.cameraFovY * 0.5);
  let aspect = max(1.0, frame.width) / max(1.0, frame.height);
  let rInv = 1.0 / (near - far);
  let clip = vec4f(vp4.x * fv / aspect, vp4.y * fv, vp4.z * far * rInv + far * near * rInv, -vp4.z);

  var o: VsOut; o.clipPos = clip; o.worldPos = wp; o.worldNormal = wn; o.uv = uv; return o;
}

const PI: f32 = 3.14159265;
fn dGGX(NdotH: f32, r: f32) -> f32 { let a2 = r*r*r*r; let d = NdotH*NdotH*(a2-1)+1; return a2/(PI*d*d); }
fn gSchlick(NdotV: f32, r: f32) -> f32 { let k=(r+1)*(r+1)/8; return NdotV/(NdotV*(1-k)+k); }
fn gSmith(ndv: f32, ndl: f32, r: f32) -> f32 { return gSchlick(ndv,r)*gSchlick(ndl,r); }
fn fSchlick(cos: f32, f0: vec3f) -> vec3f { return f0+(vec3f(1)-f0)*pow(clamp(1-cos,0,1),5); }
fn evalPBR(alb: vec3f, met: f32, rou: f32, N: vec3f, V: vec3f, L: vec3f, lc: vec3f) -> vec3f {
  let H = normalize(V+L);
  let ndl = max(dot(N,L),0); let ndv = max(dot(N,V),0.001); let ndh = max(dot(N,H),0); let vdh = max(dot(V,H),0);
  let f0 = mix(vec3f(0.04), alb, met);
  let F = fSchlick(vdh, f0); let D = dGGX(ndh, rou); let G = gSmith(ndv, ndl, rou);
  let spec = (D*G*F)/max(4*ndv*ndl, 0.001);
  let kD = (vec3f(1)-F)*(1-met);
  return (kD*alb/PI + spec)*lc*ndl;
}

struct SceneOut {
  @location(0) hdr: vec4f, @location(1) normal: vec4f, @location(2) matBuf: vec4f,
}
@fragment fn fsMain(in: VsOut, @builtin(front_facing) ff: bool) -> SceneOut {
  var N = normalize(in.worldNormal);
  if (material.twoSided > 0.5 && !ff) { N = -N; }
  let V = normalize(frame.cameraPosition - in.worldPos);
  let alb = material.baseColor.rgb;
  let met = material.metalness;
  let rou = max(material.roughness, 0.04);

  let kd = normalize(vec3f(-0.35,1,0.25));
  let fd = normalize(vec3f(0.2,0.7,0.35));
  var rad = vec3f(0);
  rad += evalPBR(alb, met, rou, N, V, kd, vec3f(1.20,1.14,1.05));
  rad += evalPBR(alb, met, rou, N, V, fd, vec3f(0.35,0.38,0.45));
  rad += alb * vec3f(0.05,0.07,0.11) * (1-met);
  rad += material.emissive * material.emissiveIntensity;

  if (frame.shadowsEnabled > 0.5) {
    let keyLightVisibility = clamp(dot(N, kd), 0.0, 1.0);
    let shadowMask = mix(0.58, 1.0, smoothstep(0.05, 0.65, keyLightVisibility));
    rad *= shadowMask;
  }

  let dist = length(frame.cameraPosition - in.worldPos);
  if (frame.fogEnabled > 0.5) {
    let dr = max(0.001, frame.fogEndDistance - frame.fogStartDistance);
    let df = clamp((dist - frame.fogStartDistance)/dr, 0, 1);
    let dd = 1.0 - exp(-dist * max(0.0, frame.fogDensity));
    let hf = select(1.0, exp(-max(0.0, in.worldPos.y)*frame.fogHeightFalloff), frame.fogHeightFalloff>0);
    rad = mix(rad, frame.fogColor, clamp(df*dd*hf, 0, 1));
  }

  let emi = dot(material.emissive*material.emissiveIntensity, vec3f(0.2126,0.7152,0.0722));
  let hi = clamp(emi + dot(rad, vec3f(0.2126,0.7152,0.0722))*0.1, 0, 1);
  let ld = clamp(dist / frame.cameraFar, 0, 1);

  var o: SceneOut;
  o.hdr = vec4f(rad, material.baseColor.a);
  o.normal = vec4f(N*0.5+vec3f(0.5), 1);
  o.matBuf = vec4f(hi, ld, 0, 1);
  return o;
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
  let tx = vec2f(1/frame.width, 1/frame.height);
  let mc = textureSample(matTex, samp, in.uv); let dc = mc.y;
  let nc = textureSample(normTex, samp, in.uv).xyz*2-vec3f(1);
  let offs = array<vec2f,4>(vec2f(tx.x,0),vec2f(-tx.x,0),vec2f(0,tx.y),vec2f(0,-tx.y));
  var occ = 0.0;
  for (var i=0;i<4;i=i+1) {
    let ms = textureSample(matTex, samp, in.uv+offs[i]);
    let dd = max(0.0, ms.y-dc);
    let ns = textureSample(normTex, samp, in.uv+offs[i]).xyz*2-vec3f(1);
    occ += dd*(1-max(0.0,dot(nc,ns))*0.75);
  }
  return vec4f(vec3f(clamp(1-occ*6,0,1)),1);
}
`;

const BLOOM_SHADER = /* wgsl */ `
${POST_UNIFORMS_WGSL}
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var hdrTex: texture_2d<f32>;
${FULLSCREEN_VS_WGSL}
@fragment fn fsMain(in: VsOut) -> @location(0) vec4f {
  if (frame.bloomEnabled < 0.5) {
    return vec4f(0, 0, 0, 1);
  }
  let tx = vec2f(1/frame.width, 1/frame.height);
  var col = vec3f(0); var ws = 0.0;
  for (var y=-1;y<=1;y=y+1) { for (var x=-1;x<=1;x=x+1) {
    let sc = textureSample(hdrTex, samp, in.uv+vec2f(f32(x),f32(y))*tx*1.6).xyz;
    let luma = dot(sc, vec3f(0.2126,0.7152,0.0722));
    let ks = frame.bloomThreshold - frame.bloomKnee;
    let soft = clamp((luma-ks)/max(0.0001,frame.bloomKnee),0,1);
    let bw = max(soft*0.8, select(0.0,1.0,luma>frame.bloomThreshold));
    let w = 1.0/(1+length(vec2f(f32(x),f32(y))));
    col += sc*bw*w; ws += w;
  }}
  if (ws>0) { col=col/ws; }
  return vec4f(col,1);
}
`;

const DOF_SHADER = /* wgsl */ `
${POST_UNIFORMS_WGSL}
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var hdrTex: texture_2d<f32>;
@group(0) @binding(3) var matTex: texture_2d<f32>;
${FULLSCREEN_VS_WGSL}
@fragment fn fsMain(in: VsOut) -> @location(0) vec4f {
  if (frame.dofEnabled < 0.5) {
    return vec4f(textureSample(hdrTex, samp, in.uv).xyz, 1);
  }
  let mat = textureSample(matTex, samp, in.uv);
  let ld = mat.y*60; let hi = mat.x;
  let cn = clamp(abs(ld-frame.dofFocusDistance)/max(0.001,frame.dofFocusRange),0,1);
  let coc = clamp(cn*frame.dofAperture,0,frame.dofMaxCoc);
  let rad = coc*0.004+hi*0.002;
  var col = vec3f(0); var ws = 0.0;
  for (var i=0;i<8;i=i+1) {
    let a = f32(i)*0.785398;
    col += textureSample(hdrTex, samp, in.uv+vec2f(cos(a),sin(a))*rad).xyz; ws+=1;
  }
  if (ws>0) { col=col/ws; }
  let ctr = textureSample(hdrTex, samp, in.uv).xyz;
  let bl = clamp(coc/max(0.001,frame.dofMaxCoc),0,1);
  return vec4f(ctr*(1-bl)+col*bl, 1);
}
`;

const COMPOSITE_SHADER = /* wgsl */ `
${POST_UNIFORMS_WGSL}
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(3) var aoTex: texture_2d<f32>;
@group(0) @binding(4) var bloomTex: texture_2d<f32>;
@group(0) @binding(5) var dofTex: texture_2d<f32>;
${FULLSCREEN_VS_WGSL}
fn aces(x: vec3f) -> vec3f {
  return clamp((x*(2.51*x+vec3f(0.03)))/(x*(2.43*x+vec3f(0.59))+vec3f(0.14)),vec3f(0),vec3f(1));
}
@fragment fn fsMain(in: VsOut) -> @location(0) vec4f {
  let ao = select(1.0, textureSample(aoTex, samp, in.uv).x, frame.aoEnabled > 0.5);
  let dof = textureSample(dofTex, samp, in.uv).xyz;
  let bloom = select(vec3f(0), textureSample(bloomTex, samp, in.uv).xyz, frame.bloomEnabled > 0.5);
  var col = dof*ao + bloom*0.35;
  if (frame.colorGradingEnabled > 0.5) {
    col = col * exp2(frame.exposure);
    let luma = dot(col, vec3f(0.2126,0.7152,0.0722));
    col = vec3f(luma)+(col-vec3f(luma))*frame.saturation;
    col = (col-vec3f(0.5))*frame.contrast+vec3f(0.5);
    col += vec3f(frame.temperature*0.02+frame.tint*0.01, -frame.tint*0.01, -frame.temperature*0.02);
    return vec4f(aces(max(col,vec3f(0))),1);
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
  private readonly linearSampler: GPUSampler;
  private readonly skyPipeline: GPURenderPipeline;
  private readonly scenePipeline: GPURenderPipeline;
  private readonly aoPipeline: GPURenderPipeline;
  private readonly bloomPipeline: GPURenderPipeline;
  private readonly dofPipeline: GPURenderPipeline;
  private readonly compositePipeline: GPURenderPipeline;
  private skyBindGroup: GPUBindGroup | null = null;
  private aoBindGroup: GPUBindGroup | null = null;
  private bloomBindGroup: GPUBindGroup | null = null;
  private dofBindGroup: GPUBindGroup | null = null;
  private compositeBindGroup: GPUBindGroup | null = null;
  private gpuMeshes: GpuMesh[] = [];

  constructor(device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat, camera: Camera) {
    this.device = device;
    this.context = context;
    this.format = format;
    this.camera = camera;
    this.postUniformBuffer = device.createBuffer({ size: POST_UNIFORM_FLOAT_COUNT * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.sceneUniformBuffer = device.createBuffer({ size: SCENE_UNIFORM_FLOAT_COUNT * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.linearSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    this.skyPipeline = this.createSkyPipeline();
    this.scenePipeline = this.createScenePipeline();
    this.aoPipeline = this.createPostPipeline(AO_SHADER, 'r8unorm');
    this.bloomPipeline = this.createPostPipeline(BLOOM_SHADER, 'rgba16float');
    this.dofPipeline = this.createPostPipeline(DOF_SHADER, 'rgba16float');
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
    for (const name of ['scene-hdr', 'scene-normal', 'scene-material', 'ao', 'bloom', 'dof'] as const) {
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
    const postData = new Float32Array([
      timeSeconds, this.width, this.height, 0,
      config.bloom.threshold, config.bloom.knee, config.depthOfField.focusDistance, config.depthOfField.focusRange,
      config.depthOfField.aperture, config.depthOfField.maxCoC, config.colorGrading.exposure, config.colorGrading.contrast,
      config.colorGrading.saturation, config.colorGrading.temperature, config.colorGrading.tint, config.ambientOcclusion.enabled ? 1 : 0,
      config.bloom.enabled ? 1 : 0, config.depthOfField.enabled ? 1 : 0, config.colorGrading.enabled ? 1 : 0, 0,
    ]);
    this.device.queue.writeBuffer(this.postUniformBuffer, 0, postData);
    const sceneData = new Float32Array([
      ...postData,
      cp[0],cp[1],cp[2],0, cf[0],cf[1],cf[2],0, cr[0],cr[1],cr[2],0, cu[0],cu[1],cu[2],0,
      this.camera.getFovYRadians(), this.camera.getNear(), this.camera.getFar(), config.shadows.enabled ? 1 : 0,
      config.fog.enabled?1:0, config.fog.density, config.fog.startDistance, config.fog.endDistance,
      config.fog.color[0], config.fog.color[1], config.fog.color[2], config.fog.heightFalloff,
    ]);
    this.device.queue.writeBuffer(this.sceneUniformBuffer, 0, sceneData);

    const hdr = this.req('scene-hdr'); const norm = this.req('scene-normal'); const mat = this.req('scene-material');
    const depth = this.req('scene-depth'); const ao = this.req('ao'); const bloom = this.req('bloom');
    const dof = this.req('dof'); const canvas = this.context.getCurrentTexture().createView();
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
        const frameGroup = this.device.createBindGroup({ layout: this.scenePipeline.getBindGroupLayout(0), entries: [{binding:0, resource:{buffer:this.sceneUniformBuffer}}] });
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

    this.tp(timings, 'ambient-occlusion', () => {
      const pass = enc.beginRenderPass({ colorAttachments: [{view:ao.view, loadOp:'clear', storeOp:'store', clearValue:{r:1,g:1,b:1,a:1}}] });
      if (this.aoBindGroup) { pass.setPipeline(this.aoPipeline); pass.setBindGroup(0, this.aoBindGroup); pass.draw(3); }
      pass.end();
    });
    this.tp(timings, 'bloom', () => {
      const pass = enc.beginRenderPass({ colorAttachments: [{view:bloom.view, loadOp:'clear', storeOp:'store', clearValue:{r:0,g:0,b:0,a:1}}] });
      if (this.bloomBindGroup) { pass.setPipeline(this.bloomPipeline); pass.setBindGroup(0, this.bloomBindGroup); pass.draw(3); }
      pass.end();
    });
    this.tp(timings, 'depth-of-field', () => {
      const pass = enc.beginRenderPass({ colorAttachments: [{view:dof.view, loadOp:'clear', storeOp:'store', clearValue:{r:0,g:0,b:0,a:1}}] });
      if (this.dofBindGroup) { pass.setPipeline(this.dofPipeline); pass.setBindGroup(0, this.dofBindGroup); pass.draw(3); }
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
      material.metalness, material.roughness, material.twoSided?1:0, material.transparent?1:0,
      0,0,0,0,
    ]);
    const mb = this.device.createBuffer({ size: MATERIAL_UNIFORM_FLOAT_COUNT * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(mb, 0, matData);
    const world = transform ?? mat4Identity();
    const tb = this.device.createBuffer({ size: TRANSFORM_UNIFORM_FLOAT_COUNT * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(tb, 0, world.buffer, world.byteOffset, world.byteLength);
    const meshBindGroup = this.device.createBindGroup({
      layout: this.scenePipeline.getBindGroupLayout(1),
      entries: [{ binding: 0, resource: { buffer: mb } }, { binding: 1, resource: { buffer: tb } }],
    });
    return { vertexBuffer: vb, indexBuffer: ib, indexCount: geometry.indexCount, materialBuffer: mb, transformBuffer: tb, meshBindGroup };
  }

  private allocTexture(name: string, format: GPUTextureFormat): void {
    const old = this.resources.get<TextureHandle>(name);
    if (old) { old.texture.destroy(); }
    const texture = this.device.createTexture({
      size: { width: this.width, height: this.height, depthOrArrayLayers: 1 }, format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.resources.set(name, { texture, view: texture.createView(), format } satisfies TextureHandle);
  }

  private req(name: string): TextureHandle { return this.resources.require<TextureHandle>(name); }

  private rebuildBindGroups(): void {
    const hdr = this.req('scene-hdr'); const norm = this.req('scene-normal');
    const mat = this.req('scene-material'); const ao = this.req('ao');
    const bloom = this.req('bloom'); const dof = this.req('dof');
    this.skyBindGroup = this.device.createBindGroup({ layout: this.skyPipeline.getBindGroupLayout(0), entries: [{binding:0, resource:{buffer:this.sceneUniformBuffer}}] });
    this.aoBindGroup = this.device.createBindGroup({ layout: this.aoPipeline.getBindGroupLayout(0), entries: [{binding:0,resource:{buffer:this.postUniformBuffer}},{binding:1,resource:this.linearSampler},{binding:2,resource:mat.view},{binding:3,resource:norm.view}] });
    this.bloomBindGroup = this.device.createBindGroup({ layout: this.bloomPipeline.getBindGroupLayout(0), entries: [{binding:0,resource:{buffer:this.postUniformBuffer}},{binding:1,resource:this.linearSampler},{binding:2,resource:hdr.view}] });
    this.dofBindGroup = this.device.createBindGroup({ layout: this.dofPipeline.getBindGroupLayout(0), entries: [{binding:0,resource:{buffer:this.postUniformBuffer}},{binding:1,resource:this.linearSampler},{binding:2,resource:hdr.view},{binding:3,resource:mat.view}] });
    this.compositeBindGroup = this.device.createBindGroup({ layout: this.compositePipeline.getBindGroupLayout(0), entries: [{binding:0,resource:{buffer:this.postUniformBuffer}},{binding:1,resource:this.linearSampler},{binding:3,resource:ao.view},{binding:4,resource:bloom.view},{binding:5,resource:dof.view}] });
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
