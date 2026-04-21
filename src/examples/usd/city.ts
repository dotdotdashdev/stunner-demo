// City example: three procedural city USDs (city5, city6, city7) merged
// into a single scene laid out side-by-side along X, with a sky-1 sphere
// in `multiply` blend mode acting as the dominant atmospheric tint, and a
// bespoke chromatic-aberration post-process injected into the pre-composite
// slot for a subtle anamorphic-lens look.

import type { RenderScene } from '@stunner/core/renderer/mesh/SceneTypes';
import type { PbrMaterial } from '@stunner/core/renderer/mesh/MaterialTypes';
import { createSkySphere } from '@stunner/core/sky';
import type { RendererEngineOptions } from '@stunner/core/renderer/RendererEngine';
import type { WebGl2InjectionStage } from '@stunner/core/renderer/webgl2/WebGl2DeferredPipeline';

import {
  loadAndProcessUsdScene,
  translateScene,
  linkWebGl2Program,
  FULLSCREEN_TRIANGLE_VS_WGSL,
  FULLSCREEN_TRIANGLE_VERTEX_GLSL,
  type ModelKey,
  type LoadedScene,
  type UsdExampleController,
  type PostProcessTextureHandle,
} from './shared';

export type CityExampleController = UsdExampleController & {
  /**
   * Engine-level customisation (post-process injection stages, frame hooks,
   * etc.) that the host (CanvasStage) merges into `RendererEngine` options
   * when constructing the engine. Mirrors the pattern used by the crowd /
   * crowdCompute / train examples.
   */
  engineOptions: RendererEngineOptions;
};

const CITY_MODEL_KEYS: ReadonlyArray<ModelKey> = ['city5', 'city6', 'city7'];

// ── Sky ────────────────────────────────────────────────────────────────────
//
// City scenes are laid out across ~25 m on the X axis (3 cities * ~8 m
// spacing) and the camera roams freely, so the sky needs enough radius to
// avoid clipping into the buildings while still sitting inside the
// renderer's far plane.

const CITY_SKY_RADIUS = 250;
const CITY_SKY_TEXTURE = 'sky-1';

const addCitySky = (scene: RenderScene): void => {
  scene.textureLibrary = scene.textureLibrary ?? {};
  const textureId = `demo:sky:${CITY_SKY_TEXTURE}`;
  scene.textureLibrary[textureId] = `/images/${CITY_SKY_TEXTURE}.png`;
  scene.meshes.push(
    createSkySphere({
      textureId,
      radius: CITY_SKY_RADIUS,
      intensity: 1,
      blendAmount: 1,
      blendMode: 'multiply',
    }),
  );
  scene.environmentMap = {
    textureId,
    intensity: 1,
  };
};

// ── Multi-scene merge ──────────────────────────────────────────────────────

// Re-key every entry in the scene's texture library with `prefix` and update
// every material reference to match. Required when merging multiple loaded
// USD scenes into one because the authored asset URIs (e.g. "0/textures/road.png")
// can collide between source files.
const prefixSceneTextureIds = (scene: RenderScene, prefix: string): void => {
  const lib = scene.textureLibrary;
  if (!lib) return;
  const remap = new Map<string, string>();
  const newLib: Record<string, string> = {};
  for (const [oldId, value] of Object.entries(lib)) {
    const newId = `${prefix}|${oldId}`;
    remap.set(oldId, newId);
    newLib[newId] = value;
  }
  scene.textureLibrary = newLib;
  const visitMat = (mat: PbrMaterial): void => {
    const ids = mat.textureIds;
    if (!ids) return;
    for (const slot of Object.keys(ids) as Array<keyof typeof ids>) {
      const old = ids[slot];
      if (old !== undefined) {
        const replacement = remap.get(old);
        if (replacement !== undefined) ids[slot] = replacement;
      }
    }
  };
  const seen = new Set<PbrMaterial>();
  const visitOnce = (m: PbrMaterial): void => {
    if (seen.has(m)) return;
    seen.add(m);
    visitMat(m);
  };
  for (const m of scene.meshes) visitOnce(m.material);
  for (const im of scene.instancedMeshes ?? []) {
    visitOnce(im.material);
    for (const im2 of im.instanceMaterials ?? []) visitOnce(im2);
  }
};

// Append `source`'s meshes / instanced meshes / lights / texture library
// entries into `target`. Caller is responsible for any prior translation /
// scaling / texture id namespacing on the source.
const mergeSceneInto = (target: RenderScene, source: RenderScene): void => {
  for (const m of source.meshes) target.meshes.push(m);
  if (source.instancedMeshes && source.instancedMeshes.length > 0) {
    target.instancedMeshes = target.instancedMeshes ?? [];
    for (const im of source.instancedMeshes) target.instancedMeshes.push(im);
  }
  for (const l of source.lights) target.lights.push(l);
  if (source.textureLibrary) {
    target.textureLibrary = target.textureLibrary ?? {};
    for (const [k, v] of Object.entries(source.textureLibrary)) {
      target.textureLibrary[k] = v;
    }
  }
  if (source.textureArrayLibrary) {
    target.textureArrayLibrary = target.textureArrayLibrary ?? {};
    for (const [k, v] of Object.entries(source.textureArrayLibrary)) {
      target.textureArrayLibrary[k] = v;
    }
  }
  if (source.reflectionProbes && source.reflectionProbes.length > 0) {
    target.reflectionProbes = target.reflectionProbes ?? [];
    for (const p of source.reflectionProbes) target.reflectionProbes.push(p);
  }
};

// ── Chromatic aberration post-process ──────────────────────────────────────
//
// Samples the HDR colour buffer three times — once per channel — with offsets
// that grow radially toward the screen edges, then writes the recombined
// colour back into the same buffer. Strength and falloff are tuned for a
// subtle anamorphic-lens feel; bump `STRENGTH` for a stronger effect.

const CA_STRENGTH = 0.012; // Peak per-channel UV offset at the corners.
const CA_FALLOFF = 2.2;   // How quickly offset ramps from centre to edge.
const CA_RED_BLUE_RATIO = 1.0; // Sign factor; 1 splits R outward / B inward.

type WebGpuChromaticAberrationState = {
  pipeline: GPURenderPipeline;
  sampler: GPUSampler;
  uniformBuffer: GPUBuffer;
  outputTexture: GPUTexture | null;
  outputView: GPUTextureView | null;
  outputWidth: number;
  outputHeight: number;
  outputFormat: GPUTextureFormat;
};

type WebGl2ChromaticAberrationState = {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  framebuffer: WebGLFramebuffer;
  resolveFramebuffer: WebGLFramebuffer;
  outputTexture: WebGLTexture;
  outputWidth: number;
  outputHeight: number;
  uColorTexture: WebGLUniformLocation;
  uCaParams: WebGLUniformLocation;
};

const CA_FRAGMENT_WGSL = /* wgsl */ `
@group(0) @binding(0) var linearSampler: sampler;
@group(0) @binding(1) var sourceColorTexture: texture_2d<f32>;
@group(0) @binding(2) var<uniform> caParams: vec4f; // x: strength, y: falloff, z: red/blue split sign.

@fragment
fn fsMain(inFragment: VsOut) -> @location(0) vec4f {
  let uv = vec2f(inFragment.uv.x, 1.0 - inFragment.uv.y);
  let strength = caParams.x;
  let falloff = max(0.5, caParams.y);
  let split = caParams.z;

  // Radial vector from screen centre. pow() lets the centre stay clean
  // while the corners get the full offset, mimicking real lens CA.
  let centred = uv - vec2f(0.5, 0.5);
  let radius = length(centred) * 1.4142136; // 1 at corners, 0 at centre.
  let radial = select(centred / max(0.0001, length(centred)), vec2f(0.0), length(centred) < 0.0001);
  let offset = radial * strength * pow(radius, falloff);

  let r = textureSample(sourceColorTexture, linearSampler, uv + offset * split).r;
  let g = textureSample(sourceColorTexture, linearSampler, uv).g;
  let b = textureSample(sourceColorTexture, linearSampler, uv - offset * split).b;
  let alpha = textureSample(sourceColorTexture, linearSampler, uv).a;
  return vec4f(r, g, b, alpha);
}
`;

const CA_FRAGMENT_GLSL = `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uColorTexture;
uniform vec4 uCaParams; // x: strength, y: falloff, z: split sign.

out vec4 outColor;

void main() {
  vec2 uv = vUv;
  float strength = uCaParams.x;
  float falloff = max(0.5, uCaParams.y);
  float split = uCaParams.z;

  vec2 centred = uv - vec2(0.5);
  float len = length(centred);
  float radius = len * 1.4142136;
  vec2 radial = len < 0.0001 ? vec2(0.0) : centred / len;
  vec2 offset = radial * strength * pow(radius, falloff);

  float r = texture(uColorTexture, uv + offset * split).r;
  float g = texture(uColorTexture, uv).g;
  float b = texture(uColorTexture, uv - offset * split).b;
  float alpha = texture(uColorTexture, uv).a;
  outColor = vec4(r, g, b, alpha);
}
`;

const createWebGpuCaState = (
  device: GPUDevice,
  outputFormat: GPUTextureFormat,
): WebGpuChromaticAberrationState => {
  const module = device.createShaderModule({
    code: `${FULLSCREEN_TRIANGLE_VS_WGSL}\n${CA_FRAGMENT_WGSL}`,
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

const ensureWebGpuCaOutput = (
  state: WebGpuChromaticAberrationState,
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

const createWebGl2CaState = (
  gl: WebGL2RenderingContext,
): WebGl2ChromaticAberrationState => {
  const program = linkWebGl2Program(
    gl,
    FULLSCREEN_TRIANGLE_VERTEX_GLSL,
    CA_FRAGMENT_GLSL,
    'city CA',
  );
  const vao = gl.createVertexArray();
  const framebuffer = gl.createFramebuffer();
  const resolveFramebuffer = gl.createFramebuffer();
  const outputTexture = gl.createTexture();
  if (!vao || !framebuffer || !resolveFramebuffer || !outputTexture) {
    if (vao) gl.deleteVertexArray(vao);
    if (framebuffer) gl.deleteFramebuffer(framebuffer);
    if (resolveFramebuffer) gl.deleteFramebuffer(resolveFramebuffer);
    if (outputTexture) gl.deleteTexture(outputTexture);
    gl.deleteProgram(program);
    throw new Error('city CA: failed to allocate WebGL2 resources');
  }
  gl.bindTexture(gl.TEXTURE_2D, outputTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outputTexture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteTexture(outputTexture);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteFramebuffer(resolveFramebuffer);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
    throw new Error(`city CA framebuffer incomplete (status ${status})`);
  }
  const uColorTexture = gl.getUniformLocation(program, 'uColorTexture');
  const uCaParams = gl.getUniformLocation(program, 'uCaParams');
  if (!uColorTexture || !uCaParams) {
    gl.deleteTexture(outputTexture);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteFramebuffer(resolveFramebuffer);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
    throw new Error('city CA: failed to query WebGL2 uniforms');
  }
  return {
    gl, program, vao, framebuffer, resolveFramebuffer, outputTexture,
    outputWidth: 1, outputHeight: 1, uColorTexture, uCaParams,
  };
};

const ensureWebGl2CaOutput = (
  state: WebGl2ChromaticAberrationState,
  width: number,
  height: number,
): void => {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  if (state.outputWidth === w && state.outputHeight === h) return;
  const gl = state.gl;
  gl.bindTexture(gl.TEXTURE_2D, state.outputTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  state.outputWidth = w;
  state.outputHeight = h;
};

const destroyWebGl2CaState = (
  state: WebGl2ChromaticAberrationState | null,
): void => {
  if (!state) return;
  const gl = state.gl;
  gl.deleteTexture(state.outputTexture);
  gl.deleteFramebuffer(state.framebuffer);
  gl.deleteFramebuffer(state.resolveFramebuffer);
  gl.deleteVertexArray(state.vao);
  gl.deleteProgram(state.program);
};

export const startCityExample = (
  applyScene: (scene: RenderScene) => void,
  onLoadingProgress?: (progress: number | null) => void,
): CityExampleController => {
  let disposed = false;
  let blobUrlsToRevoke: string[] = [];
  let webGpuCaState: WebGpuChromaticAberrationState | null = null;
  let webGl2CaState: WebGl2ChromaticAberrationState | null = null;
  onLoadingProgress?.(0);

  void (async (): Promise<void> => {
    const spacing = [ 5, 8.45, 7.5 ];
    const offsets = [ -0.065, 0, 0.935 ];
    try {
      const total = CITY_MODEL_KEYS.length;
      const loaded = await Promise.all(
        CITY_MODEL_KEYS.map((key, idx) =>
          loadAndProcessUsdScene(
            key,
            (p) => {
              if (disposed) return;
              // Aggregate progress across all city loads.
              onLoadingProgress?.((idx + p) / total);
            },
            () => disposed,
          ),
        ),
      );

      if (disposed) {
        for (const l of loaded) {
          if (l) for (const u of l.blobUrls) URL.revokeObjectURL(u);
        }
        return;
      }

      const valid = loaded.filter((l): l is LoadedScene => l !== null);
      if (valid.length === 0) {
        onLoadingProgress?.(null);
        return;
      }

      // Build a combined scene from the first city's scene; merge the others
      // in with translation + texture-id namespacing.
      const combined = valid[0]!.scene;
      const offset0 = -((valid.length - 1) * spacing[0]) / 2;
      prefixSceneTextureIds(combined, CITY_MODEL_KEYS[0]!);
      translateScene(combined, offset0, 0, offsets[0]);

      for (let i = 1; i < valid.length; i += 1) {
        const src = valid[i]!.scene;
        prefixSceneTextureIds(src, CITY_MODEL_KEYS[i]!);
        translateScene(src, offset0 + i * spacing[i], 0, offsets[i]);
        mergeSceneInto(combined, src);
      }

      blobUrlsToRevoke = valid.flatMap((l) => l.blobUrls);
      addCitySky(combined);
      applyScene(combined);
      onLoadingProgress?.(null);
    } catch (err) {
      if (!disposed) onLoadingProgress?.(null);
      console.warn('usd[city] example failed to load.', err);
    }
  })();

  // Bespoke chromatic aberration injected into the renderer's pre-composite
  // slot — same hook the crowd / crowdCompute / train examples use.
  // Reads the HDR colour buffer ('motion-blur' / 'dof'), splits R/G/B with
  // a radial UV offset, copies the result back so subsequent stages and the
  // composite see the aberrated image.
  const webGpuStages = [
    {
      name: 'city-chromatic-aberration',
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
        if (!webGpuCaState) {
          webGpuCaState = createWebGpuCaState(stageContext.device, sourceColor.format);
        }
        const output = ensureWebGpuCaOutput(
          webGpuCaState,
          stageContext.device,
          stageContext.width,
          stageContext.height,
        );
        stageContext.device.queue.writeBuffer(
          webGpuCaState.uniformBuffer,
          0,
          new Float32Array([CA_STRENGTH, CA_FALLOFF, CA_RED_BLUE_RATIO, 0]),
        );
        const bindGroup = stageContext.device.createBindGroup({
          layout: webGpuCaState.pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: webGpuCaState.sampler },
            { binding: 1, resource: sourceColor.view },
            { binding: 2, resource: { buffer: webGpuCaState.uniformBuffer } },
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
        pass.setPipeline(webGpuCaState.pipeline);
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

  const webGl2Stages: WebGl2InjectionStage[] = [
    {
      name: 'city-chromatic-aberration',
      injectionPoint: 'pre-composite',
      execute: (stageContext) => {
        if (stageContext.width <= 0 || stageContext.height <= 0) return;
        if (!webGl2CaState || webGl2CaState.gl !== stageContext.gl) {
          destroyWebGl2CaState(webGl2CaState);
          webGl2CaState = createWebGl2CaState(stageContext.gl);
        }
        ensureWebGl2CaOutput(webGl2CaState, stageContext.width, stageContext.height);
        const gl = stageContext.gl;
        const prevFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        const prevReadFramebuffer = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        const prevDrawFramebuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        const prevProgram = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
        const prevVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null;
        const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

        gl.bindFramebuffer(gl.FRAMEBUFFER, webGl2CaState.framebuffer);
        gl.viewport(0, 0, stageContext.width, stageContext.height);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.BLEND);
        gl.useProgram(webGl2CaState.program);
        gl.bindVertexArray(webGl2CaState.vao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, stageContext.colorTexture);
        gl.uniform1i(webGl2CaState.uColorTexture, 0);
        gl.uniform4f(
          webGl2CaState.uCaParams,
          CA_STRENGTH,
          CA_FALLOFF,
          CA_RED_BLUE_RATIO,
          0,
        );
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // Blit the aberrated image back into the engine's colour texture so
        // downstream composite picks it up.
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, webGl2CaState.framebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, webGl2CaState.resolveFramebuffer);
        gl.framebufferTexture2D(
          gl.DRAW_FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          stageContext.colorTexture,
          0,
        );
        gl.blitFramebuffer(
          0, 0, stageContext.width, stageContext.height,
          0, 0, stageContext.width, stageContext.height,
          gl.COLOR_BUFFER_BIT, gl.NEAREST,
        );
        gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindVertexArray(prevVao);
        gl.useProgram(prevProgram);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevReadFramebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, prevDrawFramebuffer);
        gl.bindFramebuffer(gl.FRAMEBUFFER, prevFramebuffer);
        gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
      },
    },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const engineOptions: RendererEngineOptions = {
    webGpuStages: webGpuStages as any,
    webGl2Stages,
    webGpuStageFailurePolicy: 'skip-stage',
  };

  return {
    engineOptions,
    dispose: () => {
      disposed = true;
      onLoadingProgress?.(null);
      for (const url of blobUrlsToRevoke) URL.revokeObjectURL(url);
      blobUrlsToRevoke = [];
      if (webGpuCaState) {
        webGpuCaState.uniformBuffer.destroy();
        webGpuCaState.outputTexture?.destroy();
        webGpuCaState = null;
      }
      destroyWebGl2CaState(webGl2CaState);
      webGl2CaState = null;
    },
  };
};
