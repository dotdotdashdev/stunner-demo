import type {
  RendererEngineOptions,
  RendererFrameHookContext,
  RendererInvalidationEvent,
} from '@stunner/core/renderer/RendererEngine';
import type { WebGl2InjectionStage } from '@stunner/core/renderer/webgl2/WebGl2DeferredPipeline';
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
import {
  CROWD_BODY_COUNT_MAX,
  CROWD_BODY_COUNT_MIN,
  CROWD_COLLISION_RADIUS_MAX,
  CROWD_COLLISION_RADIUS_MIN,
  DEFAULT_CROWD_OPTIONS,
  type CrowdExampleOptions,
} from './crowdCompute';

export {
  CROWD_BODY_COUNT_MAX,
  CROWD_BODY_COUNT_MIN,
  CROWD_COLLISION_RADIUS_MAX,
  CROWD_COLLISION_RADIUS_MIN,
  DEFAULT_CROWD_OPTIONS,
  type CrowdExampleOptions,
} from './crowdCompute';

type CrowdExampleController = {
  engineOptions: RendererEngineOptions;
  setOptions: (options: CrowdExampleOptions) => void;
  dispose: () => void;
};

const CESIUM_MAN_MODEL_URL = '/models/cesium-man/CesiumMan.gltf';
const FLOOR_SIZE = 20;
const FLOOR_HALF_SIZE = FLOOR_SIZE * 0.5;
const GROUND_RADIUS = FLOOR_SIZE * 0.75;
const WEBGL2_GROUND_RADIUS_SCALE = 10;
const BASE_MODEL_SCALE = 0.85;
const SCALE_VARIATION_MIN = 0.95;
const SCALE_VARIATION_MAX = 1.05;
const BODY_SPEED_MIN = 0.6;
const BODY_SPEED_MAX = 1.2;
const SPEED_BUCKET_COUNT = 4;
const MODEL_CLEARANCE_Y = 0.02;
const MODEL_YAW_OFFSET = -Math.PI * 0.5;

const getGroundRadiusForBackend = (backend: 'webgpu' | 'webgl2'): number => {
  return backend === 'webgl2' ? GROUND_RADIUS * WEBGL2_GROUND_RADIUS_SCALE : GROUND_RADIUS;
};

const BODY_STATE_STRIDE = 8;
const BODY_STATE_POSITION_X = 0;
const BODY_STATE_POSITION_Y = 1;
const BODY_STATE_POSITION_Z = 2;
const BODY_STATE_SPEED = 3;
const BODY_STATE_YAW = 4;
const BODY_STATE_TARGET_YAW = 5;
const BODY_STATE_ANIMATION_TIME = 6;
const BODY_STATE_SCALE = 7;

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

type CrowdState = {
  scene: RenderScene;
  options: CrowdExampleOptions;
  bodyState: Float32Array;
  bodyStateNext: Float32Array;
  loadedAsset: LoadedCrowdAsset;
  instanceTransforms: Mat4[];
  instanceCustom0: [number, number, number, number][];
  instanceCustom1: [number, number, number, number][];
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

type CrowdWebGl2CelShadingState = {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  framebuffer: WebGLFramebuffer;
  resolveFramebuffer: WebGLFramebuffer;
  outputTexture: WebGLTexture;
  outputWidth: number;
  outputHeight: number;
  uColorTexture: WebGLUniformLocation;
  uNormalTexture: WebGLUniformLocation;
  uDepthTexture: WebGLUniformLocation;
  uCelParams: WebGLUniformLocation;
};

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

const CROWD_CEL_FULLSCREEN_TRIANGLE_VERTEX_GLSL = `#version 300 es
precision highp float;

out vec2 vUv;

void main() {
  vec2 position;
  if (gl_VertexID == 0) {
    position = vec2(-1.0, -3.0);
  } else if (gl_VertexID == 1) {
    position = vec2(3.0, 1.0);
  } else {
    position = vec2(-1.0, 1.0);
  }
  gl_Position = vec4(position, 0.0, 1.0);
  vUv = position * 0.5 + vec2(0.5, 0.5);
}
`;

const CROWD_CEL_FRAGMENT_GLSL = `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uColorTexture;
uniform sampler2D uNormalTexture;
uniform sampler2D uDepthTexture;
uniform vec4 uCelParams;

out vec4 outColor;

float luminance(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec2 uv = vUv;
  vec2 dimensions = vec2(textureSize(uColorTexture, 0));
  vec2 texelSize = vec2(1.0 / dimensions.x, 1.0 / dimensions.y);

  vec3 color = texture(uColorTexture, uv).rgb;
  vec3 normalCenter = normalize(texture(uNormalTexture, uv).xyz * 2.0 - vec3(1.0));
  vec3 normalRight = normalize(texture(uNormalTexture, uv + vec2(texelSize.x, 0.0)).xyz * 2.0 - vec3(1.0));
  vec3 normalUp = normalize(texture(uNormalTexture, uv + vec2(0.0, texelSize.y)).xyz * 2.0 - vec3(1.0));

  float depthCenter = texture(uDepthTexture, uv).r;
  float depthRight = texture(uDepthTexture, uv + vec2(texelSize.x, 0.0)).r;
  float depthUp = texture(uDepthTexture, uv + vec2(0.0, texelSize.y)).r;

  float toneBands = max(2.0, uCelParams.x);
  float edgeScale = max(0.0, uCelParams.y);
  float outlineDarkness = clamp(uCelParams.z, 0.0, 1.0);
  float luma = clamp(luminance(color), 0.0, 1.0);
  float quantized = floor(luma * toneBands) / max(1.0, toneBands - 1.0);
  vec3 celLit = color * (0.45 + quantized * 0.75);

  float normalEdge = length(normalCenter - normalRight) + length(normalCenter - normalUp);
  float depthEdge = abs(depthCenter - depthRight) + abs(depthCenter - depthUp);
  float edgeStrength = clamp(
    (smoothstep(0.07, 0.24, normalEdge) + smoothstep(0.0015, 0.008, depthEdge)) * edgeScale,
    0.0,
    1.0
  );

  vec3 outlineColor = vec3(1.0 - outlineDarkness);
  vec3 outlined = mix(celLit, outlineColor, edgeStrength);
  outColor = vec4(max(vec3(0.0), outlined), 1.0);
}
`;

const createWebGlShader = (
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader => {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Failed to create WebGL shader for crowd cel shading.');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'Unknown shader compile error.';
    gl.deleteShader(shader);
    throw new Error(`Crowd WebGL2 cel shader compile failed: ${log}`);
  }
  return shader;
};

const createWebGlProgram = (
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram => {
  const vertexShader = createWebGlShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createWebGlShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error('Failed to create WebGL program for crowd cel shading.');
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'Unknown program link error.';
    gl.deleteProgram(program);
    throw new Error(`Crowd WebGL2 cel program link failed: ${log}`);
  }
  return program;
};

const ensureCrowdWebGl2Output = (
  state: CrowdWebGl2CelShadingState,
  width: number,
  height: number,
): void => {
  const targetWidth = Math.max(1, Math.floor(width));
  const targetHeight = Math.max(1, Math.floor(height));
  if (state.outputWidth === targetWidth && state.outputHeight === targetHeight) {
    return;
  }
  const gl = state.gl;
  gl.bindTexture(gl.TEXTURE_2D, state.outputTexture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    targetWidth,
    targetHeight,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
  state.outputWidth = targetWidth;
  state.outputHeight = targetHeight;
};

const createCrowdWebGl2CelShadingState = (
  gl: WebGL2RenderingContext,
): CrowdWebGl2CelShadingState => {
  const program = createWebGlProgram(
    gl,
    CROWD_CEL_FULLSCREEN_TRIANGLE_VERTEX_GLSL,
    CROWD_CEL_FRAGMENT_GLSL,
  );
  const vao = gl.createVertexArray();
  const framebuffer = gl.createFramebuffer();
  const resolveFramebuffer = gl.createFramebuffer();
  const outputTexture = gl.createTexture();
  if (!vao || !framebuffer || !resolveFramebuffer || !outputTexture) {
    if (vao) {
      gl.deleteVertexArray(vao);
    }
    if (framebuffer) {
      gl.deleteFramebuffer(framebuffer);
    }
    if (resolveFramebuffer) {
      gl.deleteFramebuffer(resolveFramebuffer);
    }
    if (outputTexture) {
      gl.deleteTexture(outputTexture);
    }
    gl.deleteProgram(program);
    throw new Error('Failed to allocate WebGL2 resources for crowd cel shading.');
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
    throw new Error(`Crowd WebGL2 cel framebuffer incomplete (status ${status}).`);
  }

  const uColorTexture = gl.getUniformLocation(program, 'uColorTexture');
  const uNormalTexture = gl.getUniformLocation(program, 'uNormalTexture');
  const uDepthTexture = gl.getUniformLocation(program, 'uDepthTexture');
  const uCelParams = gl.getUniformLocation(program, 'uCelParams');
  if (!uColorTexture || !uNormalTexture || !uDepthTexture || !uCelParams) {
    gl.deleteTexture(outputTexture);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
    throw new Error('Failed to query crowd WebGL2 cel uniforms.');
  }

  return {
    gl,
    program,
    vao,
    framebuffer,
    resolveFramebuffer,
    outputTexture,
    outputWidth: 1,
    outputHeight: 1,
    uColorTexture,
    uNormalTexture,
    uDepthTexture,
    uCelParams,
  };
};

const destroyCrowdWebGl2CelShadingState = (state: CrowdWebGl2CelShadingState | null): void => {
  if (!state) {
    return;
  }
  const gl = state.gl;
  gl.deleteTexture(state.outputTexture);
  gl.deleteFramebuffer(state.framebuffer);
  gl.deleteFramebuffer(state.resolveFramebuffer);
  gl.deleteVertexArray(state.vao);
  gl.deleteProgram(state.program);
};

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
    celShadingEnabled: Boolean(candidate.celShadingEnabled),
    celBandCount: Math.max(2, Math.min(8, Math.round(candidate.celBandCount))),
    celEdgeStrength: Math.max(0, Math.min(2, candidate.celEdgeStrength)),
    celOutlineDarkness: Math.max(0, Math.min(1, candidate.celOutlineDarkness)),
  };
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
      drawSource: { mode: 'cpuPacked' },
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

const createInitialCrowdState = (
  bodyCount: number,
  buckets: CrowdBucket[],
): {
  stateData: Float32Array;
  bucketStarts: number[];
  bucketCounts: number[];
} => {
  const stateData = new Float32Array(bodyCount * BODY_STATE_STRIDE);
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
      const base = index * BODY_STATE_STRIDE;

      stateData[base + BODY_STATE_POSITION_X] = x;
      stateData[base + BODY_STATE_POSITION_Y] = 0;
      stateData[base + BODY_STATE_POSITION_Z] = z;
      stateData[base + BODY_STATE_SPEED] = speed;
      stateData[base + BODY_STATE_YAW] = yaw;
      stateData[base + BODY_STATE_TARGET_YAW] = yaw;
      stateData[base + BODY_STATE_ANIMATION_TIME] = randomRange(0, Math.PI * 2);
      stateData[base + BODY_STATE_SCALE] = bodyScale;
    }
  }

  return {
    stateData,
    bucketStarts,
    bucketCounts,
  };
};

const buildInitialInstanceData = (
  bodyCount: number,
  bodyBaseY: number,
): {
  instanceTransforms: Mat4[];
  instanceCustom0: [number, number, number, number][];
  instanceCustom1: [number, number, number, number][];
} => {
  const instanceTransforms: Mat4[] = [];
  const instanceCustom0: [number, number, number, number][] = [];
  const instanceCustom1: [number, number, number, number][] = [];

  for (let index = 0; index < bodyCount; index += 1) {
    const transform = mat4Identity();
    transform[0] = BASE_MODEL_SCALE;
    transform[5] = BASE_MODEL_SCALE;
    transform[10] = BASE_MODEL_SCALE;
    transform[13] = bodyBaseY * BASE_MODEL_SCALE;
    instanceTransforms.push(transform);
    instanceCustom0.push([1, 1, 1, 1]);
    instanceCustom1.push([0, 0, 0, 1]);
  }

  return {
    instanceTransforms,
    instanceCustom0,
    instanceCustom1,
  };
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const rotateToward = (current: number, goalYaw: number, maxStep: number): number => {
  const delta = Math.atan2(Math.sin(goalYaw - current), Math.cos(goalYaw - current));
  const step = clamp(delta, -maxStep, maxStep);
  return current + step;
};

const safeNormalize2 = (x: number, y: number, fallbackX: number, fallbackY: number): [number, number] => {
  const lengthSq = x * x + y * y;
  if (lengthSq < 1e-8) {
    return [fallbackX, fallbackY];
  }
  const inverseLength = 1 / Math.sqrt(lengthSq);
  return [x * inverseLength, y * inverseLength];
};

const createCpuState = (
  loadedAsset: LoadedCrowdAsset,
  runtimeOptions: CrowdExampleOptions,
  backend: 'webgpu' | 'webgl2',
): CrowdState => {
  const { stateData, bucketStarts, bucketCounts } = createInitialCrowdState(
    runtimeOptions.bodyCount,
    loadedAsset.buckets,
  );
  const { instanceTransforms, instanceCustom0, instanceCustom1 } = buildInitialInstanceData(
    runtimeOptions.bodyCount,
    loadedAsset.modelBaseY,
  );

  for (let bucketIndex = 0; bucketIndex < loadedAsset.buckets.length; bucketIndex += 1) {
    const bucket = loadedAsset.buckets[bucketIndex];
    const startIndex = bucketStarts[bucketIndex];
    const count = bucketCounts[bucketIndex];
    const bucketTransforms = instanceTransforms.slice(startIndex, startIndex + count);
    const bucketCustom0 = instanceCustom0.slice(startIndex, startIndex + count);
    const bucketCustom1 = instanceCustom1.slice(startIndex, startIndex + count);

    for (const mesh of bucket.instancedMeshes) {
      mesh.instanceTransforms = bucketTransforms;
      mesh.instanceCustomData = {
        custom0: bucketCustom0,
        custom1: bucketCustom1,
      };
      mesh.drawSource = { mode: 'cpuPacked' };
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

  const scene: RenderScene = {
    meshes: [
      {
        geometry: createCircle({ radius: getGroundRadiusForBackend(backend), radialSegments: 80, ringSegments: 10 }),
        material: floorMaterial,
        transform: mat4Identity(),
      },
    ],
    instancedMeshes: loadedAsset.instancedMeshes,
    textureLibrary: loadedAsset.textureLibrary,
    lights: [],
  };

  return {
    scene,
    options: runtimeOptions,
    bodyState: stateData,
    bodyStateNext: new Float32Array(stateData.length),
    loadedAsset,
    instanceTransforms,
    instanceCustom0,
    instanceCustom1,
  };
};

const createFallbackFloorScene = (backend: 'webgpu' | 'webgl2'): RenderScene => {
  const floorMaterial = createDefaultMaterial({
    name: 'crowd-floor-fallback',
    baseColor: [0.085882, 0.18451, 0.106471, 1],
    roughness: 0.96,
    metallic: 0.04,
    castsShadows: false,
    receivesShadows: true,
  });

  return {
    meshes: [
      {
        geometry: createCircle({ radius: getGroundRadiusForBackend(backend), radialSegments: 80, ringSegments: 10 }),
        material: floorMaterial,
        transform: mat4Identity(),
      },
    ],
    instancedMeshes: [],
    textureLibrary: {},
    lights: [],
  };
};

const stepCpuSimulation = (
  state: CrowdState,
  deltaTimeMs: number,
): void => {
  const options = state.options;
  const sourceState = state.bodyState;
  const targetState = state.bodyStateNext;
  const count = options.bodyCount;
  if (count <= 0) {
    return;
  }

  const clampedDeltaSeconds = Math.min(0.033, Math.max(0.001, deltaTimeMs / 1000));
  const collisionRadius = options.collisionRadius;
  const interactionRadius = Math.max(0.001, collisionRadius * 2.0);
  const interactionRadiusSq = interactionRadius * interactionRadius;
  const boundary = FLOOR_HALF_SIZE - collisionRadius;
  const clampedTurnRate = Math.max(0.01, options.turnRate);
  const collisionRadiusDenominator = Math.max(0.01, collisionRadius);
  const pushStrength = 0.45;

  for (let index = 0; index < count; index += 1) {
    const base = index * BODY_STATE_STRIDE;

    let positionX = sourceState[base + BODY_STATE_POSITION_X];
    const positionY = sourceState[base + BODY_STATE_POSITION_Y];
    let positionZ = sourceState[base + BODY_STATE_POSITION_Z];
    const baseSpeed = sourceState[base + BODY_STATE_SPEED];
    let yaw = sourceState[base + BODY_STATE_YAW];
    let targetYaw = sourceState[base + BODY_STATE_TARGET_YAW];
    let animationTime = sourceState[base + BODY_STATE_ANIMATION_TIME];
    const bodyScale = sourceState[base + BODY_STATE_SCALE];

    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    let openDirectionX = forwardX;
    let openDirectionZ = forwardZ;
    let pushX = 0;
    let pushZ = 0;

    for (let neighborIndex = 0; neighborIndex < count; neighborIndex += 1) {
      if (neighborIndex === index) {
        continue;
      }

      const neighborBase = neighborIndex * BODY_STATE_STRIDE;
      const deltaX = sourceState[neighborBase + BODY_STATE_POSITION_X] - positionX;
      const deltaZ = sourceState[neighborBase + BODY_STATE_POSITION_Z] - positionZ;
      const distanceSq = deltaX * deltaX + deltaZ * deltaZ;
      if (distanceSq <= 1e-8 || distanceSq >= interactionRadiusSq) {
        continue;
      }

      const distance = Math.sqrt(distanceSq);

      const awayX = -deltaX / distance;
      const awayZ = -deltaZ / distance;
      const overlap = (interactionRadius - distance) / interactionRadius;
      const neighborSpeed = sourceState[neighborBase + BODY_STATE_SPEED];
      const speedAdvantage = Math.max(0, baseSpeed - neighborSpeed);
      const pushWeight = overlap * (1 + speedAdvantage * 1.25);
      pushX += awayX * pushWeight;
      pushZ += awayZ * pushWeight;
      openDirectionX += awayX * overlap;
      openDirectionZ += awayZ * overlap;
    }

    if (positionX > boundary) {
      openDirectionX += -1 * ((positionX - boundary) / collisionRadiusDenominator);
    }
    if (positionX < -boundary) {
      openDirectionX += 1 * ((-boundary - positionX) / collisionRadiusDenominator);
    }
    if (positionZ > boundary) {
      openDirectionZ += -1 * ((positionZ - boundary) / collisionRadiusDenominator);
    }
    if (positionZ < -boundary) {
      openDirectionZ += 1 * ((-boundary - positionZ) / collisionRadiusDenominator);
    }

    const [desiredDirectionX, desiredDirectionZ] = safeNormalize2(
      openDirectionX + pushX * 0.55,
      openDirectionZ + pushZ * 0.55,
      forwardX,
      forwardZ,
    );
    targetYaw = Math.atan2(desiredDirectionX, desiredDirectionZ);
    yaw = rotateToward(yaw, targetYaw, clampedTurnRate * clampedDeltaSeconds);

    const facingX = Math.sin(yaw);
    const facingZ = Math.cos(yaw);
    const [displacementDirectionX, displacementDirectionZ] = safeNormalize2(
      facingX + pushX * pushStrength,
      facingZ + pushZ * pushStrength,
      facingX,
      facingZ,
    );
    const speedBoost = clamp(Math.hypot(pushX, pushZ) * 0.3, 0, 0.8);
    const movementSpeed = baseSpeed * (1 + speedBoost);
    positionX += displacementDirectionX * movementSpeed * clampedDeltaSeconds;
    positionZ += displacementDirectionZ * movementSpeed * clampedDeltaSeconds;

    if (Math.abs(positionX) > FLOOR_HALF_SIZE || Math.abs(positionZ) > FLOOR_HALF_SIZE) {
      positionX = clamp(positionX, -FLOOR_HALF_SIZE, FLOOR_HALF_SIZE);
      positionZ = clamp(positionZ, -FLOOR_HALF_SIZE, FLOOR_HALF_SIZE);
      const [toCenterX, toCenterZ] = safeNormalize2(-positionX, -positionZ, facingX, facingZ);
      targetYaw = Math.atan2(toCenterX, toCenterZ);
      yaw = rotateToward(yaw, targetYaw, clampedTurnRate * clampedDeltaSeconds * 1.45);
    }

    animationTime += movementSpeed * clampedDeltaSeconds;

    targetState[base + BODY_STATE_POSITION_X] = positionX;
    targetState[base + BODY_STATE_POSITION_Y] = positionY;
    targetState[base + BODY_STATE_POSITION_Z] = positionZ;
    targetState[base + BODY_STATE_SPEED] = baseSpeed;
    targetState[base + BODY_STATE_YAW] = yaw;
    targetState[base + BODY_STATE_TARGET_YAW] = targetYaw;
    targetState[base + BODY_STATE_ANIMATION_TIME] = animationTime;
    targetState[base + BODY_STATE_SCALE] = bodyScale;

    const modelYaw = Math.atan2(displacementDirectionZ, displacementDirectionX);
    const renderYaw = modelYaw + MODEL_YAW_OFFSET;
    const c = Math.cos(renderYaw) * bodyScale;
    const s = Math.sin(renderYaw) * bodyScale;
    const scaleDrop = Math.max(0, BASE_MODEL_SCALE - bodyScale);
    const scaledFloorContactOffset = scaleDrop * state.loadedAsset.modelBaseY;
    const floorSinkOffset = 0.03;

    const matrix = state.instanceTransforms[index];
    matrix[0] = c;
    matrix[1] = 0;
    matrix[2] = s;
    matrix[3] = 0;
    matrix[4] = 0;
    matrix[5] = bodyScale;
    matrix[6] = 0;
    matrix[7] = 0;
    matrix[8] = -s;
    matrix[9] = 0;
    matrix[10] = c;
    matrix[11] = 0;
    matrix[12] = positionX;
    matrix[13] = state.loadedAsset.modelBaseY * bodyScale - scaledFloorContactOffset - floorSinkOffset;
    matrix[14] = positionZ;
    matrix[15] = 1;

    const speedLerp = clamp((baseSpeed - BODY_SPEED_MIN) / (BODY_SPEED_MAX - BODY_SPEED_MIN), 0, 1);
    state.instanceCustom0[index][0] = 1;
    state.instanceCustom0[index][1] = 1;
    state.instanceCustom0[index][2] = 1;
    state.instanceCustom0[index][3] = 1;
    state.instanceCustom1[index][0] = speedLerp;
    state.instanceCustom1[index][1] = movementSpeed;
    state.instanceCustom1[index][2] = animationTime;
    state.instanceCustom1[index][3] = 1;
  }

  const current = state.bodyState;
  state.bodyState = state.bodyStateNext;
  state.bodyStateNext = current;

  for (const bucket of state.loadedAsset.buckets) {
    bucket.source.controller.setPlaybackSpeed(bucket.playbackSpeed);
    bucket.source.controller.update(clampedDeltaSeconds);
    bakeSourceTransformsIntoGeometry(bucket.source);
  }
};

export const startCrowdExample = (
  applyScene: (scene: RenderScene) => void,
  initialOptions?: Partial<CrowdExampleOptions>,
): CrowdExampleController => {
  let activeBackend: 'webgpu' | 'webgl2' = 'webgpu';
  const fallbackScene = createFallbackFloorScene(activeBackend);
  applyScene(fallbackScene);

  let disposed = false;
  let options = sanitizeCrowdOptions({
    ...DEFAULT_CROWD_OPTIONS,
    ...initialOptions,
  });
  let crowdState: CrowdState | null = null;
  let crowdCelShadingState: CrowdCelShadingState | null = null;
  let crowdWebGl2CelShadingState: CrowdWebGl2CelShadingState | null = null;
  let crowdAsset: LoadedCrowdAsset | null = null;
  let crowdAssetError: unknown = null;

  const crowdAssetPromise = loadCrowdAsset()
    .then((asset) => {
      crowdAsset = asset;
    })
    .catch((error: unknown) => {
      crowdAssetError = error;
      if (!disposed) {
        applyScene(createFallbackFloorScene(activeBackend));
      }
    });

  const destroyCelShadingState = (): void => {
    if (crowdCelShadingState) {
      crowdCelShadingState.uniformBuffer.destroy();
      crowdCelShadingState.outputTexture?.destroy();
      crowdCelShadingState.outputTexture = null;
      crowdCelShadingState.outputView = null;
      crowdCelShadingState = null;
    }
    destroyCrowdWebGl2CelShadingState(crowdWebGl2CelShadingState);
    crowdWebGl2CelShadingState = null;
  };

  const webGl2Stages: WebGl2InjectionStage[] = [
    {
      name: 'crowd-cel-shading',
      injectionPoint: 'pre-composite',
      execute: (stageContext) => {
        if (!options.celShadingEnabled || stageContext.width <= 0 || stageContext.height <= 0) {
          return;
        }
        if (!crowdWebGl2CelShadingState || crowdWebGl2CelShadingState.gl !== stageContext.gl) {
          destroyCrowdWebGl2CelShadingState(crowdWebGl2CelShadingState);
          crowdWebGl2CelShadingState = createCrowdWebGl2CelShadingState(stageContext.gl);
        }

        ensureCrowdWebGl2Output(crowdWebGl2CelShadingState, stageContext.width, stageContext.height);
        const gl = stageContext.gl;
        const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        const previousReadFramebuffer = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        const previousDrawFramebuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        const previousProgram = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;
        const previousVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null;
        const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

        gl.bindFramebuffer(gl.FRAMEBUFFER, crowdWebGl2CelShadingState.framebuffer);
        gl.viewport(0, 0, stageContext.width, stageContext.height);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.BLEND);
        gl.useProgram(crowdWebGl2CelShadingState.program);
        gl.bindVertexArray(crowdWebGl2CelShadingState.vao);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, stageContext.colorTexture);
        gl.uniform1i(crowdWebGl2CelShadingState.uColorTexture, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, stageContext.normalTexture);
        gl.uniform1i(crowdWebGl2CelShadingState.uNormalTexture, 1);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, stageContext.depthTexture);
        gl.uniform1i(crowdWebGl2CelShadingState.uDepthTexture, 2);
        gl.uniform4f(
          crowdWebGl2CelShadingState.uCelParams,
          options.celBandCount,
          options.celEdgeStrength,
          options.celOutlineDarkness,
          0,
        );

        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, crowdWebGl2CelShadingState.framebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, crowdWebGl2CelShadingState.resolveFramebuffer);
        gl.framebufferTexture2D(
          gl.DRAW_FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          stageContext.colorTexture,
          0,
        );
        gl.blitFramebuffer(
          0,
          0,
          stageContext.width,
          stageContext.height,
          0,
          0,
          stageContext.width,
          stageContext.height,
          gl.COLOR_BUFFER_BIT,
          gl.NEAREST,
        );
        gl.framebufferTexture2D(
          gl.DRAW_FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          null,
          0,
        );

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, null);

        gl.bindVertexArray(previousVao);
        gl.useProgram(previousProgram);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previousReadFramebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, previousDrawFramebuffer);
        gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
        gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
      },
    },
  ];

  const initialize = (hookContext: RendererFrameHookContext): void => {
    if (crowdState || disposed || !crowdAsset) {
      return;
    }

    activeBackend = hookContext.backend;
    crowdState = createCpuState(crowdAsset, options, activeBackend);
    applyScene(crowdState.scene);
  };

  const engineOptions: RendererEngineOptions = {
    onRendererInvalidated: (event: RendererInvalidationEvent) => {
      if (!event.requiresSceneReinit) {
        return;
      }
      destroyCelShadingState();
    },
    frameHooks: {
      beforeFrame: (hookContext) => {
        initialize(hookContext);
        if (crowdAssetError) {
          console.warn('Crowd example failed to load Cesium Man.', crowdAssetError);
          crowdAssetError = null;
        }
        if (!crowdState || disposed) {
          return;
        }
        stepCpuSimulation(crowdState, hookContext.deltaTimeMs);
      },
      onError: (_phase, error) => {
        console.warn('Crowd example frame hook error.', error);
      },
    },
    webGpuStages: [
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

          stageContext.resources.set('dof', celOutput);
          stageContext.resources.set('motion-blur', celOutput);
        },
      },
    ],
    webGl2Stages,
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
        crowdState = createCpuState(crowdAsset, options, activeBackend);
        applyScene(crowdState.scene);
        return;
      }

      crowdState.options = options;
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
      crowdState = null;
      destroyCelShadingState();
    },
  };
};
