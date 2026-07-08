// Train example: a single USD freight train with a sky-2 hemisphere and a
// painterly post-process injected into the renderer's pre-composite slot.
//
// The post-process is a single-pass implementation of the circular Kuwahara
// filter with polynomial weighting (Papari extension, Kyprianidis 2010 — see
// https://blog.maximeheckel.com/posts/on-crafting-painterly-shaders/).
// At each pixel:
//
//   • 8 sectors of a circular kernel of radius `WC_RADIUS` (pixels) are
//     sampled.
//   • For each sector we accumulate a polynomial-weighted mean colour and
//     the luminance variance.
//   • The output is the mean colour of the sector with the lowest variance.
//
// The Kuwahara family preserves edges (sectors straddling an edge have
// high variance and lose) while smoothing flat regions, giving the soft
// brush-stroke look characteristic of watercolour. A small saturation
// boost in the same fragment compensates for the smoothing's tendency to
// wash colours out.

import type { RenderScene } from '@dotdotdash/stunner-core/renderer/mesh/SceneTypes';
import { createSkySphere } from '@dotdotdash/stunner-core/sky';
import type { RendererEngineOptions } from '@dotdotdash/stunner-core/renderer/RendererEngine';

import {
  startSingleModelExample,
  FULLSCREEN_TRIANGLE_VS_WGSL,
  type UsdExampleController,
  type PostProcessTextureHandle,
} from './shared';

export type TrainExampleController = UsdExampleController & {
  /**
   * Engine-level customisation (post-process injection stages, frame hooks,
   * etc.) that the host (CanvasStage) merges into `RendererEngine` options
   * when constructing the engine. Mirrors the pattern used by the crowd /
   * crowd / city examples.
   */
  engineOptions: RendererEngineOptions;
};

// ── Sky ────────────────────────────────────────────────────────────────────
//
// Train measures ~20 m × 3 m × 19 m in world units (see the metersPerUnit
// stage scaling in BuildScene); 80 m radius keeps the sphere well clear of
// the model while staying inside the renderer's far plane.

const TRAIN_SKY_RADIUS = 80;
const TRAIN_SKY_TEXTURE = 'sky-2';

const addTrainSky = (scene: RenderScene): void => {
  scene.textureLibrary = scene.textureLibrary ?? {};
  const textureId = `demo:sky:${TRAIN_SKY_TEXTURE}`;
  scene.textureLibrary[textureId] = `/images/${TRAIN_SKY_TEXTURE}.png`;
  const sky = createSkySphere({
    textureId,
    radius: TRAIN_SKY_RADIUS,
    intensity: 1,
    blendAmount: 1,
    blendMode: 'alpha',
  });
  // Keep train sky emissive even when using installed core builds where
  // SkySphere binds baseColor to the sky texture (which can attenuate with
  // PNG alpha). Train wants a fully emissive backdrop.
  if (sky.material.textureIds) {
    delete sky.material.textureIds.baseColor;
  }
  sky.material.transparent = false;
  scene.meshes.push(sky);
  scene.environmentMap = {
    textureId,
    intensity: 1,
  };
};

// Rotate every world transform / light position / probe in the scene 180°
// around the Y (up) axis. After the USD loader's Z-up→Y-up correction, "yaw"
// in the engine is rotation around Y, so this flips the train to face the
// opposite direction. Equivalent to negating x and z on every column of the
// column-major 4×4 transform.
const yaw180Scene = (scene: RenderScene): void => {
  const flipMatInPlace = (m: Float32Array | undefined): void => {
    if (!m) return;
    for (const i of [0, 2, 4, 6, 8, 10, 12, 14]) m[i] = -(m[i] ?? 0);
  };
  for (const mesh of scene.meshes) flipMatInPlace(mesh.transform);
  for (const im of scene.instancedMeshes ?? []) {
    for (const t of im.instanceTransforms) flipMatInPlace(t);
  }
  for (const light of scene.lights) {
    if ('position' in light) {
      light.position = [-light.position[0], light.position[1], -light.position[2]];
    }
    if ('direction' in light) {
      light.direction = [-light.direction[0], light.direction[1], -light.direction[2]];
    }
  }
  for (const probe of scene.reflectionProbes ?? []) {
    probe.position = [-probe.position[0], probe.position[1], -probe.position[2]];
  }
};

// ── Watercolor post-process ────────────────────────────────────────────────

const WC_RADIUS = 5;       // Sector radius in pixels.
const WC_SATURATION = 1.25; // Post-smoothing saturation boost.

type WebGpuWatercolorState = {
  pipeline: GPURenderPipeline;
  sampler: GPUSampler;
  uniformBuffer: GPUBuffer;
  outputTexture: GPUTexture | null;
  outputView: GPUTextureView | null;
  outputWidth: number;
  outputHeight: number;
  outputFormat: GPUTextureFormat;
};

const WC_FRAGMENT_WGSL = /* wgsl */ `
@group(0) @binding(0) var linearSampler: sampler;
@group(0) @binding(1) var sourceColorTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> wcParams: vec4f; // x: radius (px), y: saturation, zw: 1/resolution

const SECTOR_COUNT: u32 = 8u;
const TWO_PI: f32 = 6.28318530718;
const ANGLE_HALF: f32 = 0.392699; // π/8
const ANGLE_STEP: f32 = 0.196349; // π/16
const MAX_RADIUS: u32 = 8u;       // Loop bound; actual radius is clamped via wcParams.x.

fn polyWeight(sx: f32, sy: f32) -> f32 {
  // [(x + ζ) - η y²]² from Kyprianidis et al. (2010), a cheap polynomial
  // approximation of a Gaussian centred on the radial sample direction.
  let eta: f32 = 0.1;
  let lambda: f32 = 0.5;
  let v = (sx + eta) - lambda * sy * sy;
  return max(0.0, v * v);
}

fn sampleSector(uv: vec2f, texel: vec2f, baseAngle: f32, radius: f32) -> vec4f {
  // Returns vec4(avgColor.rgb, luminanceVariance).
  var colorSum = vec3f(0.0);
  var sqColorSum = vec3f(0.0);
  var weightSum: f32 = 0.0;
  for (var ri: u32 = 1u; ri <= MAX_RADIUS; ri = ri + 1u) {
    let r = f32(ri);
    if (r > radius) { break; }
    var a: f32 = -ANGLE_HALF;
    loop {
      if (a > ANGLE_HALF + 0.0001) { break; }
      let theta = baseAngle + a;
      let off = vec2f(cos(theta), sin(theta)) * r;
      let w = polyWeight(off.x, off.y);
      let c = textureSampleLevel(sourceColorTexture, linearSampler, uv + off * texel, 0.0).rgb;
      colorSum = colorSum + c * w;
      sqColorSum = sqColorSum + c * c * w;
      weightSum = weightSum + w;
      a = a + ANGLE_STEP;
    }
  }
  let inv = 1.0 / max(weightSum, 1e-6);
  let avg = colorSum * inv;
  let varRgb = max(sqColorSum * inv - avg * avg, vec3f(0.0));
  let lumVar = dot(varRgb, vec3f(0.299, 0.587, 0.114));
  return vec4f(avg, lumVar);
}

fn satAdjust(rgb: vec3f, s: f32) -> vec3f {
  let lum = dot(rgb, vec3f(0.2125, 0.7154, 0.0721));
  return mix(vec3f(lum), rgb, s);
}

@fragment
fn fsMain(inFragment: VsOut) -> @location(0) vec4f {
  let uv = vec2f(inFragment.uv.x, 1.0 - inFragment.uv.y);
  let texel = wcParams.zw;
  let radius = max(1.0, wcParams.x);

  var bestColor = vec3f(0.0);
  var bestVar: f32 = 1e10;
  for (var i: u32 = 0u; i < SECTOR_COUNT; i = i + 1u) {
    let baseAngle = f32(i) * (TWO_PI / f32(SECTOR_COUNT));
    let s = sampleSector(uv, texel, baseAngle, radius);
    if (s.w < bestVar) {
      bestVar = s.w;
      bestColor = s.xyz;
    }
  }

  let alpha = textureSampleLevel(sourceColorTexture, linearSampler, uv, 0.0).a;
  return vec4f(satAdjust(bestColor, wcParams.y), alpha);
}
`;

const createWebGpuWatercolorState = (
  device: GPUDevice,
  outputFormat: GPUTextureFormat,
): WebGpuWatercolorState => {
  const module = device.createShaderModule({
    code: `${FULLSCREEN_TRIANGLE_VS_WGSL}\n${WC_FRAGMENT_WGSL}`,
  });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vsMain' },
    fragment: { module, entryPoint: 'fsMain', targets: [{ format: outputFormat }] },
    primitive: { topology: 'triangle-list' },
  });
  return {
    pipeline,
    sampler: device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
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

const ensureWebGpuWatercolorOutput = (
  state: WebGpuWatercolorState,
  device: GPUDevice,
  width: number,
  height: number,
): PostProcessTextureHandle => {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  if (!state.outputTexture || state.outputWidth !== w || state.outputHeight !== h) {
    state.outputTexture?.destroy();
    state.outputTexture = device.createTexture({
      size: { width: w, height: h, depthOrArrayLayers: 1 },
      format: state.outputFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT
        | GPUTextureUsage.TEXTURE_BINDING
        | GPUTextureUsage.COPY_SRC,
    });
    state.outputView = state.outputTexture.createView();
    state.outputWidth = w;
    state.outputHeight = h;
  }
  return {
    texture: state.outputTexture!,
    view: state.outputView!,
    format: state.outputFormat,
  };
};

export const startTrainExample = (
  applyScene: (scene: RenderScene) => void,
  onLoadingProgress?: (progress: number | null) => void,
): TrainExampleController => {
  let webGpuWcState: WebGpuWatercolorState | null = null;

  const inner = startSingleModelExample('train', applyScene, onLoadingProgress, (scene) => {
    yaw180Scene(scene);
    addTrainSky(scene);
  });

  const webGpuStages = [
    {
      name: 'train-watercolor',
      injectionPoint: 'pre-composite' as const,
      reads: [
        { name: 'motion-blur', kind: 'texture-handle' as const },
        { name: 'dof', kind: 'texture-handle' as const },
      ],
      writes: [
        { name: 'motion-blur', kind: 'texture-handle' as const },
        { name: 'dof', kind: 'texture-handle' as const },
      ],
      execute: (stageContext: {
        device: GPUDevice;
        encoder: GPUCommandEncoder;
        width: number;
        height: number;
        resources: {
          get: <T>(name: string) => T | undefined;
          set: (name: string, value: unknown) => void;
        };
      }) => {
        if (stageContext.width <= 0 || stageContext.height <= 0) return;
        const sourceColor = stageContext.resources.get<PostProcessTextureHandle>('motion-blur');
        const sourceDof = stageContext.resources.get<PostProcessTextureHandle>('dof');
        if (!sourceColor || !sourceDof) return;
        if (!webGpuWcState) {
          webGpuWcState = createWebGpuWatercolorState(stageContext.device, sourceColor.format);
        }
        const output = ensureWebGpuWatercolorOutput(
          webGpuWcState,
          stageContext.device,
          stageContext.width,
          stageContext.height,
        );
        stageContext.device.queue.writeBuffer(
          webGpuWcState.uniformBuffer,
          0,
          new Float32Array([
            WC_RADIUS,
            WC_SATURATION,
            1 / Math.max(1, stageContext.width),
            1 / Math.max(1, stageContext.height),
          ]),
        );
        const bindGroup = stageContext.device.createBindGroup({
          layout: webGpuWcState.pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: webGpuWcState.sampler },
            { binding: 1, resource: sourceColor.view },
            { binding: 2, resource: { buffer: webGpuWcState.uniformBuffer } },
          ],
        });
        const pass = stageContext.encoder.beginRenderPass({
          colorAttachments: [{
            view: output.view,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          }],
        });
        pass.setPipeline(webGpuWcState.pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3);
        pass.end();
        const copySize = {
          width: stageContext.width,
          height: stageContext.height,
          depthOrArrayLayers: 1,
        };
        stageContext.encoder.copyTextureToTexture(
          { texture: output.texture },
          { texture: sourceColor.texture },
          copySize,
        );
        stageContext.encoder.copyTextureToTexture(
          { texture: output.texture },
          { texture: sourceDof.texture },
          copySize,
        );
        stageContext.resources.set('motion-blur', output);
        stageContext.resources.set('dof', output);
      },
    },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const engineOptions: RendererEngineOptions = {
    webGpuStages: webGpuStages as any,
    webGpuStageFailurePolicy: 'skip-stage',
  };

  return {
    engineOptions,
    dispose: () => {
      inner.dispose();
      if (webGpuWcState) {
        webGpuWcState.uniformBuffer.destroy();
        webGpuWcState.outputTexture?.destroy();
        webGpuWcState = null;
      }
    },
  };
};
