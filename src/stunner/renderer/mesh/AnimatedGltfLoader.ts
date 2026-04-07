import { loadGltfSceneFromArrayBuffer, type GltfLoadResult } from './GltfLoader';
import {
  mat4Identity,
  mat4Multiply,
  type Mat4,
  type SceneMeshInstance,
} from './SceneTypes';

const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const GLB_MAGIC = 0x46546c67;

const COMPONENT_BYTE_SIZE: Record<number, number> = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
};

const TYPE_COMPONENT_COUNT: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT4: 16,
};

type AnimatedAccessorType = 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT4';

type GltfAccessor = {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT4';
  normalized?: boolean;
};

type GltfBuffer = {
  uri?: string;
  byteLength: number;
};

type GltfBufferView = {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
};

type GltfPrimitive = {
  attributes: {
    POSITION?: number;
    NORMAL?: number;
    TANGENT?: number;
    JOINTS_0?: number;
    WEIGHTS_0?: number;
  };
};

type GltfMesh = {
  primitives: GltfPrimitive[];
};

type GltfNode = {
  name?: string;
  mesh?: number;
  skin?: number;
  children?: number[];
  matrix?: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  weights?: number[];
};

type GltfScene = {
  nodes?: number[];
};

type GltfSkin = {
  inverseBindMatrices?: number;
  joints: number[];
};

type GltfAnimationSampler = {
  input: number;
  output: number;
  interpolation?: 'LINEAR' | 'STEP' | 'CUBICSPLINE';
};

type GltfAnimationChannel = {
  sampler: number;
  target: {
    node?: number;
    path: 'translation' | 'rotation' | 'scale' | 'weights';
  };
};

type GltfAnimation = {
  name?: string;
  samplers: GltfAnimationSampler[];
  channels: GltfAnimationChannel[];
};

type GltfDocument = {
  buffers?: GltfBuffer[];
  bufferViews?: GltfBufferView[];
  accessors?: GltfAccessor[];
  meshes?: GltfMesh[];
  nodes?: GltfNode[];
  scenes?: GltfScene[];
  scene?: number;
  skins?: GltfSkin[];
  animations?: GltfAnimation[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
};

type NodePoseOverride = {
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  weights?: number[];
};

type NodeState = {
  name: string;
  parentIndex: number;
  children: number[];
  baseTranslation: [number, number, number];
  baseRotation: [number, number, number, number];
  baseScale: [number, number, number];
  baseWeights: number[];
  translation: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
  weights: number[];
  localMatrix: Mat4;
  worldMatrix: Mat4;
};

type RuntimeSkin = {
  joints: number[];
  inverseBindMatrices: Float32Array;
};

type RuntimePrimitiveBinding = {
  mesh: SceneMeshInstance;
  nodeIndex: number;
  skinIndex?: number;
};

type RuntimeSkinnedPrimitive = {
  mesh: SceneMeshInstance;
  nodeIndex: number;
  skinIndex: number;
  basePositions: Float32Array;
  baseNormals: Float32Array;
  baseTangents: Float32Array;
  jointIndices: Uint16Array;
  jointWeights: Float32Array;
};

type RuntimeAnimationSampler = {
  input: Float32Array;
  output: Float32Array;
  interpolation: 'LINEAR' | 'STEP' | 'CUBICSPLINE';
  outputElementSize: number;
};

type RuntimeAnimationChannel = {
  nodeIndex: number;
  path: 'translation' | 'rotation' | 'scale' | 'weights';
  sampler: RuntimeAnimationSampler;
};

type RuntimeAnimationClip = {
  name: string;
  channels: RuntimeAnimationChannel[];
  durationSeconds: number;
};

type AnimatedRuntime = {
  nodes: NodeState[];
  rootNodes: number[];
  skins: RuntimeSkin[];
  primitiveBindings: RuntimePrimitiveBinding[];
  skinnedPrimitives: RuntimeSkinnedPrimitive[];
  clips: RuntimeAnimationClip[];
  clipByName: Map<string, RuntimeAnimationClip>;
};

export type AnimatedRigController = {
  update: (deltaTimeSeconds: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  setLooping: (looping: boolean) => void;
  setClipByName: (clipName: string) => boolean;
  clearClip: () => void;
  setNodePoseOverride: (nodeName: string, override: NodePoseOverride) => void;
  clearNodePoseOverride: (nodeName: string) => void;
  clearAllNodePoseOverrides: () => void;
  getClipNames: () => string[];
};

export type AnimatedGltfLoadResult = GltfLoadResult & {
  controller: AnimatedRigController;
};

const textDecoder = new TextDecoder();

const isGzipData = (data: ArrayBuffer): boolean => {
  if (data.byteLength < 2) {
    return false;
  }
  const view = new Uint8Array(data, 0, 2);
  return view[0] === 0x1f && view[1] === 0x8b;
};

const gunzipIfNeeded = async (data: ArrayBuffer): Promise<ArrayBuffer> => {
  if (!isGzipData(data)) {
    return data;
  }
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Gzip-compressed glTF data was provided, but DecompressionStream is unavailable in this environment.');
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).arrayBuffer();
};

const parseGlb = (bytes: ArrayBuffer): { json: GltfDocument; binChunk?: ArrayBuffer } => {
  const header = new DataView(bytes);
  if (header.byteLength < 12) {
    throw new Error('Invalid GLB: header is too small.');
  }
  const magic = header.getUint32(0, true);
  if (magic !== GLB_MAGIC) {
    throw new Error('Invalid GLB: incorrect magic number.');
  }
  const length = header.getUint32(8, true);
  if (length > bytes.byteLength) {
    throw new Error('Invalid GLB: declared length exceeds buffer length.');
  }

  let offset = 12;
  let json: GltfDocument | undefined;
  let binChunk: ArrayBuffer | undefined;

  while (offset + 8 <= length) {
    const chunkLength = header.getUint32(offset, true);
    const chunkType = header.getUint32(offset + 4, true);
    offset += 8;

    if (offset + chunkLength > length) {
      throw new Error('Invalid GLB: chunk extends beyond file length.');
    }

    const chunkSlice = bytes.slice(offset, offset + chunkLength);
    if (chunkType === JSON_CHUNK_TYPE) {
      const jsonText = textDecoder.decode(new Uint8Array(chunkSlice));
      json = JSON.parse(jsonText) as GltfDocument;
    } else if (chunkType === BIN_CHUNK_TYPE) {
      binChunk = chunkSlice;
    }

    offset += chunkLength;
  }

  if (!json) {
    throw new Error('Invalid GLB: missing JSON chunk.');
  }

  return { json, binChunk };
};

const parseGltfDocument = (data: ArrayBuffer): { json: GltfDocument; binChunk?: ArrayBuffer } => {
  const view = new DataView(data);
  if (view.byteLength >= 4 && view.getUint32(0, true) === GLB_MAGIC) {
    return parseGlb(data);
  }
  const jsonText = textDecoder.decode(new Uint8Array(data));
  return { json: JSON.parse(jsonText) as GltfDocument };
};

const isDracoCompressed = (gltf: GltfDocument): boolean => {
  if (gltf.extensionsUsed?.includes('KHR_draco_mesh_compression')) {
    return true;
  }
  if (gltf.extensionsRequired?.includes('KHR_draco_mesh_compression')) {
    return true;
  }
  return false;
};

const resolveUri = (uri: string, baseUrl: string | undefined): string => {
  if (uri.startsWith('data:')) {
    return uri;
  }
  if (!baseUrl) {
    return uri;
  }

  let normalizedBase = baseUrl;
  try {
    normalizedBase = new URL(baseUrl).toString();
  } catch {
    if (typeof window !== 'undefined') {
      normalizedBase = new URL(baseUrl, window.location.href).toString();
    } else {
      return uri;
    }
  }

  return new URL(uri, normalizedBase).toString();
};

const decodeDataUri = (uri: string): ArrayBuffer => {
  const match = /^data:.*?;base64,(.*)$/i.exec(uri);
  if (!match) {
    throw new Error('Only base64 data URIs are supported for glTF resources.');
  }
  const encoded = match[1];
  const raw = atob(encoded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes.buffer;
};

const readBufferViewRange = (
  gltf: GltfDocument,
  buffers: ArrayBuffer[],
  bufferViewIndex: number,
): { data: ArrayBuffer; byteOffset: number; byteLength: number; byteStride?: number } => {
  const view = gltf.bufferViews?.[bufferViewIndex];
  if (!view) {
    throw new Error(`glTF bufferView ${bufferViewIndex} is missing.`);
  }
  const data = buffers[view.buffer];
  if (!data) {
    throw new Error(`glTF buffer ${view.buffer} is missing.`);
  }
  return {
    data,
    byteOffset: view.byteOffset ?? 0,
    byteLength: view.byteLength,
    byteStride: view.byteStride,
  };
};

const readComponent = (dataView: DataView, componentType: number, byteOffset: number): number => {
  if (componentType === 5120) {
    return dataView.getInt8(byteOffset);
  }
  if (componentType === 5121) {
    return dataView.getUint8(byteOffset);
  }
  if (componentType === 5122) {
    return dataView.getInt16(byteOffset, true);
  }
  if (componentType === 5123) {
    return dataView.getUint16(byteOffset, true);
  }
  if (componentType === 5125) {
    return dataView.getUint32(byteOffset, true);
  }
  if (componentType === 5126) {
    return dataView.getFloat32(byteOffset, true);
  }
  throw new Error(`Unsupported accessor componentType: ${componentType}.`);
};

const normalizeComponent = (value: number, componentType: number): number => {
  if (componentType === 5120) {
    return Math.max(value / 127, -1);
  }
  if (componentType === 5121) {
    return value / 255;
  }
  if (componentType === 5122) {
    return Math.max(value / 32767, -1);
  }
  if (componentType === 5123) {
    return value / 65535;
  }
  return value;
};

const readAccessorAsFloatArray = (
  gltf: GltfDocument,
  buffers: ArrayBuffer[],
  accessorIndex: number,
  expectedType: AnimatedAccessorType | AnimatedAccessorType[],
): Float32Array => {
  const accessor = gltf.accessors?.[accessorIndex];
  if (!accessor) {
    throw new Error(`glTF accessor ${accessorIndex} is missing.`);
  }
  const expectedTypes = Array.isArray(expectedType) ? expectedType : [expectedType];
  if (!expectedTypes.includes(accessor.type)) {
    throw new Error(`Accessor ${accessorIndex} expected ${expectedTypes.join('|')}, got ${accessor.type}.`);
  }
  const componentCount = TYPE_COMPONENT_COUNT[accessor.type];
  if (typeof accessor.bufferView !== 'number') {
    return new Float32Array(accessor.count * componentCount);
  }

  const componentSize = COMPONENT_BYTE_SIZE[accessor.componentType];
  if (!componentSize) {
    throw new Error(`Unsupported accessor component type ${accessor.componentType}.`);
  }

  const view = readBufferViewRange(gltf, buffers, accessor.bufferView);
  const accessorOffset = accessor.byteOffset ?? 0;
  const stride = view.byteStride ?? componentCount * componentSize;
  const baseOffset = accessorOffset;
  const dataView = new DataView(view.data, view.byteOffset, view.byteLength);

  const out = new Float32Array(accessor.count * componentCount);
  for (let index = 0; index < accessor.count; index += 1) {
    const elementOffset = baseOffset + index * stride;
    const elementEnd = elementOffset + componentCount * componentSize;
    if (elementEnd > dataView.byteLength) {
      throw new Error(
        `Accessor ${accessorIndex} read would exceed bufferView bounds (end ${elementEnd} > ${dataView.byteLength}).`,
      );
    }
    for (let component = 0; component < componentCount; component += 1) {
      const componentOffset = elementOffset + component * componentSize;
      const rawValue = readComponent(dataView, accessor.componentType, componentOffset);
      const value = accessor.normalized ? normalizeComponent(rawValue, accessor.componentType) : rawValue;
      out[index * componentCount + component] = value;
    }
  }

  return out;
};

const readAccessorAsJointIndices = (
  gltf: GltfDocument,
  buffers: ArrayBuffer[],
  accessorIndex: number,
): Uint16Array => {
  const accessor = gltf.accessors?.[accessorIndex];
  if (!accessor) {
    throw new Error(`glTF accessor ${accessorIndex} is missing.`);
  }
  if (accessor.type !== 'VEC4') {
    throw new Error(`Joint accessor ${accessorIndex} must be VEC4.`);
  }
  const componentCount = TYPE_COMPONENT_COUNT[accessor.type];
  if (typeof accessor.bufferView !== 'number') {
    return new Uint16Array(accessor.count * componentCount);
  }

  const componentSize = COMPONENT_BYTE_SIZE[accessor.componentType];
  if (!componentSize) {
    throw new Error(`Unsupported joint accessor component type ${accessor.componentType}.`);
  }

  const view = readBufferViewRange(gltf, buffers, accessor.bufferView);
  const accessorOffset = accessor.byteOffset ?? 0;
  const stride = view.byteStride ?? componentCount * componentSize;
  const baseOffset = accessorOffset;
  const dataView = new DataView(view.data, view.byteOffset, view.byteLength);

  const out = new Uint16Array(accessor.count * componentCount);
  for (let index = 0; index < accessor.count; index += 1) {
    const elementOffset = baseOffset + index * stride;
    const elementEnd = elementOffset + componentCount * componentSize;
    if (elementEnd > dataView.byteLength) {
      throw new Error(
        `Joint accessor ${accessorIndex} read would exceed bufferView bounds (end ${elementEnd} > ${dataView.byteLength}).`,
      );
    }
    for (let component = 0; component < componentCount; component += 1) {
      const componentOffset = elementOffset + component * componentSize;
      out[index * componentCount + component] = readComponent(dataView, accessor.componentType, componentOffset);
    }
  }

  return out;
};

const loadBuffers = async (
  gltf: GltfDocument,
  baseUrl: string | undefined,
  binChunk?: ArrayBuffer,
): Promise<ArrayBuffer[]> => {
  const out: ArrayBuffer[] = [];
  for (let index = 0; index < (gltf.buffers?.length ?? 0); index += 1) {
    const buffer = gltf.buffers?.[index];
    if (!buffer) {
      continue;
    }
    if (index === 0 && binChunk) {
      out.push(binChunk);
      continue;
    }
    if (!buffer.uri) {
      throw new Error(`glTF buffer ${index} is missing URI and has no GLB BIN chunk.`);
    }
    const resolved = resolveUri(buffer.uri, baseUrl);
    if (resolved.startsWith('data:')) {
      out.push(decodeDataUri(resolved));
      continue;
    }
    const response = await fetch(resolved);
    if (!response.ok) {
      throw new Error(`Failed to fetch glTF buffer: ${resolved}`);
    }
    out.push(await response.arrayBuffer());
  }
  return out;
};

const composeTrsMatrix = (
  translation: [number, number, number],
  rotation: [number, number, number, number],
  scale: [number, number, number],
): Mat4 => {
  const [tx, ty, tz] = translation;
  const [qx, qy, qz, qw] = rotation;
  const [sx, sy, sz] = scale;

  const x2 = qx + qx;
  const y2 = qy + qy;
  const z2 = qz + qz;
  const xx = qx * x2;
  const xy = qx * y2;
  const xz = qx * z2;
  const yy = qy * y2;
  const yz = qy * z2;
  const zz = qz * z2;
  const wx = qw * x2;
  const wy = qw * y2;
  const wz = qw * z2;

  const out = new Float32Array(16);
  out[0] = (1 - (yy + zz)) * sx;
  out[1] = (xy + wz) * sx;
  out[2] = (xz - wy) * sx;
  out[3] = 0;
  out[4] = (xy - wz) * sy;
  out[5] = (1 - (xx + zz)) * sy;
  out[6] = (yz + wx) * sy;
  out[7] = 0;
  out[8] = (xz + wy) * sz;
  out[9] = (yz - wx) * sz;
  out[10] = (1 - (xx + yy)) * sz;
  out[11] = 0;
  out[12] = tx;
  out[13] = ty;
  out[14] = tz;
  out[15] = 1;
  return out;
};

const decomposeMatrix = (matrix: Mat4): {
  translation: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
} => {
  const translation: [number, number, number] = [matrix[12], matrix[13], matrix[14]];

  const sx = Math.hypot(matrix[0], matrix[1], matrix[2]) || 1;
  const sy = Math.hypot(matrix[4], matrix[5], matrix[6]) || 1;
  const sz = Math.hypot(matrix[8], matrix[9], matrix[10]) || 1;
  const scale: [number, number, number] = [sx, sy, sz];

  const m00 = matrix[0] / sx;
  const m01 = matrix[4] / sy;
  const m02 = matrix[8] / sz;
  const m10 = matrix[1] / sx;
  const m11 = matrix[5] / sy;
  const m12 = matrix[9] / sz;
  const m20 = matrix[2] / sx;
  const m21 = matrix[6] / sy;
  const m22 = matrix[10] / sz;

  const trace = m00 + m11 + m22;
  let qx = 0;
  let qy = 0;
  let qz = 0;
  let qw = 1;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    qw = 0.25 * s;
    qx = (m21 - m12) / s;
    qy = (m02 - m20) / s;
    qz = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }

  const rotation: [number, number, number, number] = [qx, qy, qz, qw];
  return { translation, rotation, scale };
};

const nodeLocalMatrix = (node: GltfNode): Mat4 => {
  if (node.matrix) {
    return new Float32Array(node.matrix);
  }
  return composeTrsMatrix(
    node.translation ?? [0, 0, 0],
    node.rotation ?? [0, 0, 0, 1],
    node.scale ?? [1, 1, 1],
  );
};

const normalizeQuaternion = (rotation: [number, number, number, number]): [number, number, number, number] => {
  const length = Math.hypot(rotation[0], rotation[1], rotation[2], rotation[3]) || 1;
  return [rotation[0] / length, rotation[1] / length, rotation[2] / length, rotation[3] / length];
};

const slerpQuat = (
  a: [number, number, number, number],
  b: [number, number, number, number],
  t: number,
): [number, number, number, number] => {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bx = b[0];
  let by = b[1];
  let bz = b[2];
  let bw = b[3];
  if (dot < 0) {
    dot = -dot;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (dot > 0.9995) {
    return normalizeQuaternion([
      a[0] + (bx - a[0]) * t,
      a[1] + (by - a[1]) * t,
      a[2] + (bz - a[2]) * t,
      a[3] + (bw - a[3]) * t,
    ]);
  }
  const theta0 = Math.acos(Math.max(-1, Math.min(1, dot)));
  const sinTheta0 = Math.sin(theta0);
  const theta = theta0 * t;
  const sinTheta = Math.sin(theta);
  const s0 = Math.cos(theta) - dot * sinTheta / sinTheta0;
  const s1 = sinTheta / sinTheta0;
  return [
    a[0] * s0 + bx * s1,
    a[1] * s0 + by * s1,
    a[2] * s0 + bz * s1,
    a[3] * s0 + bw * s1,
  ];
};

const invertMat4 = (matrix: Mat4): Mat4 => {
  const out = new Float32Array(16);
  const m = matrix;

  const b00 = m[0] * m[5] - m[1] * m[4];
  const b01 = m[0] * m[6] - m[2] * m[4];
  const b02 = m[0] * m[7] - m[3] * m[4];
  const b03 = m[1] * m[6] - m[2] * m[5];
  const b04 = m[1] * m[7] - m[3] * m[5];
  const b05 = m[2] * m[7] - m[3] * m[6];
  const b06 = m[8] * m[13] - m[9] * m[12];
  const b07 = m[8] * m[14] - m[10] * m[12];
  const b08 = m[8] * m[15] - m[11] * m[12];
  const b09 = m[9] * m[14] - m[10] * m[13];
  const b10 = m[9] * m[15] - m[11] * m[13];
  const b11 = m[10] * m[15] - m[11] * m[14];

  const determinant = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(determinant) < 1e-10) {
    return mat4Identity();
  }
  const invDet = 1 / determinant;

  out[0] = (m[5] * b11 - m[6] * b10 + m[7] * b09) * invDet;
  out[1] = (-m[1] * b11 + m[2] * b10 - m[3] * b09) * invDet;
  out[2] = (m[13] * b05 - m[14] * b04 + m[15] * b03) * invDet;
  out[3] = (-m[9] * b05 + m[10] * b04 - m[11] * b03) * invDet;
  out[4] = (-m[4] * b11 + m[6] * b08 - m[7] * b07) * invDet;
  out[5] = (m[0] * b11 - m[2] * b08 + m[3] * b07) * invDet;
  out[6] = (-m[12] * b05 + m[14] * b02 - m[15] * b01) * invDet;
  out[7] = (m[8] * b05 - m[10] * b02 + m[11] * b01) * invDet;
  out[8] = (m[4] * b10 - m[5] * b08 + m[7] * b06) * invDet;
  out[9] = (-m[0] * b10 + m[1] * b08 - m[3] * b06) * invDet;
  out[10] = (m[12] * b04 - m[13] * b02 + m[15] * b00) * invDet;
  out[11] = (-m[8] * b04 + m[9] * b02 - m[11] * b00) * invDet;
  out[12] = (-m[4] * b09 + m[5] * b07 - m[6] * b06) * invDet;
  out[13] = (m[0] * b09 - m[1] * b07 + m[2] * b06) * invDet;
  out[14] = (-m[12] * b03 + m[13] * b01 - m[14] * b00) * invDet;
  out[15] = (m[8] * b03 - m[9] * b01 + m[10] * b00) * invDet;

  return out;
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

const normalizeVec3 = (v: [number, number, number]): [number, number, number] => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

const setMeshTransform = (mesh: SceneMeshInstance, matrix: Mat4): void => {
  if (!mesh.transform) {
    mesh.transform = new Float32Array(matrix);
    return;
  }
  mesh.transform.set(matrix);
};

const sampleChannel = (
  sampler: RuntimeAnimationSampler,
  timeSeconds: number,
): { indexA: number; indexB: number; t: number } => {
  const times = sampler.input;
  if (times.length <= 1) {
    return { indexA: 0, indexB: 0, t: 0 };
  }
  if (timeSeconds <= times[0]) {
    return { indexA: 0, indexB: 0, t: 0 };
  }
  const lastIndex = times.length - 1;
  if (timeSeconds >= times[lastIndex]) {
    return { indexA: lastIndex, indexB: lastIndex, t: 0 };
  }

  let low = 0;
  let high = lastIndex;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const value = times[mid];
    if (value < timeSeconds) {
      low = mid + 1;
    } else if (value > timeSeconds) {
      high = mid - 1;
    } else {
      return { indexA: mid, indexB: mid, t: 0 };
    }
  }

  const indexB = Math.max(1, low);
  const indexA = indexB - 1;
  const timeA = times[indexA];
  const timeB = times[indexB];
  const delta = Math.max(1e-6, timeB - timeA);
  return { indexA, indexB, t: (timeSeconds - timeA) / delta };
};

const buildAnimatedRuntime = async (
  gltf: GltfDocument,
  buffers: ArrayBuffer[],
  meshes: SceneMeshInstance[],
): Promise<AnimatedRuntime> => {
  const nodes = gltf.nodes ?? [];
  const scenes = gltf.scenes ?? [];
  const defaultSceneIndex = gltf.scene ?? 0;
  const defaultScene = scenes[defaultSceneIndex];
  const rootNodes = defaultScene?.nodes ?? nodes.map((_, index) => index);

  const nodeStates: NodeState[] = nodes.map((node, index) => {
    const local = nodeLocalMatrix(node);
    const decomposed = decomposeMatrix(local);
    return {
      name: node.name ?? `node-${index}`,
      parentIndex: -1,
      children: [...(node.children ?? [])],
      baseTranslation: [...decomposed.translation],
      baseRotation: [...decomposed.rotation],
      baseScale: [...decomposed.scale],
      baseWeights: [...(node.weights ?? [])],
      translation: [...decomposed.translation],
      rotation: [...decomposed.rotation],
      scale: [...decomposed.scale],
      weights: [...(node.weights ?? [])],
      localMatrix: local,
      worldMatrix: mat4Identity(),
    };
  });

  for (let index = 0; index < nodeStates.length; index += 1) {
    for (const child of nodeStates[index].children) {
      if (nodeStates[child]) {
        nodeStates[child].parentIndex = index;
      }
    }
  }

  const skins: RuntimeSkin[] = (gltf.skins ?? []).map((skin) => {
    const jointCount = skin.joints.length;
    let inverseBindMatrices = new Float32Array(jointCount * 16);
    for (let jointIndex = 0; jointIndex < jointCount; jointIndex += 1) {
      inverseBindMatrices[jointIndex * 16 + 0] = 1;
      inverseBindMatrices[jointIndex * 16 + 5] = 1;
      inverseBindMatrices[jointIndex * 16 + 10] = 1;
      inverseBindMatrices[jointIndex * 16 + 15] = 1;
    }
    if (typeof skin.inverseBindMatrices === 'number') {
      const loaded = readAccessorAsFloatArray(gltf, buffers, skin.inverseBindMatrices, 'MAT4');
      if (loaded.length >= inverseBindMatrices.length) {
        inverseBindMatrices = new Float32Array(loaded);
      }
    }
    return {
      joints: [...skin.joints],
      inverseBindMatrices,
    };
  });

  const primitiveBindings: RuntimePrimitiveBinding[] = [];
  const skinnedPrimitives: RuntimeSkinnedPrimitive[] = [];
  const meshesByGltfIndex = gltf.meshes ?? [];
  let meshOrdinal = 0;

  const visitNode = async (nodeIndex: number): Promise<void> => {
    const node = nodes[nodeIndex];
    if (!node) {
      return;
    }

    if (typeof node.mesh === 'number') {
      const mesh = meshesByGltfIndex[node.mesh];
      if (mesh) {
        for (const primitive of mesh.primitives) {
          const sceneMesh = meshes[meshOrdinal];
          if (!sceneMesh) {
            meshOrdinal += 1;
            continue;
          }

          primitiveBindings.push({
            mesh: sceneMesh,
            nodeIndex,
            skinIndex: typeof node.skin === 'number' ? node.skin : undefined,
          });

          const jointsAccessor = primitive.attributes.JOINTS_0;
          const weightsAccessor = primitive.attributes.WEIGHTS_0;

          if (
            typeof node.skin === 'number' &&
            typeof jointsAccessor === 'number' &&
            typeof weightsAccessor === 'number'
          ) {
            const basePositions = new Float32Array(sceneMesh.geometry.vertexCount * 3);
            const baseNormals = new Float32Array(sceneMesh.geometry.vertexCount * 3);
            const baseTangents = new Float32Array(sceneMesh.geometry.vertexCount * 4);
            for (let vertexIndex = 0; vertexIndex < sceneMesh.geometry.vertexCount; vertexIndex += 1) {
              const sourceOffset = vertexIndex * 12;
              const positionOffset = vertexIndex * 3;
              const tangentOffset = vertexIndex * 4;
              basePositions[positionOffset + 0] = sceneMesh.geometry.vertices[sourceOffset + 0];
              basePositions[positionOffset + 1] = sceneMesh.geometry.vertices[sourceOffset + 1];
              basePositions[positionOffset + 2] = sceneMesh.geometry.vertices[sourceOffset + 2];
              baseNormals[positionOffset + 0] = sceneMesh.geometry.vertices[sourceOffset + 3];
              baseNormals[positionOffset + 1] = sceneMesh.geometry.vertices[sourceOffset + 4];
              baseNormals[positionOffset + 2] = sceneMesh.geometry.vertices[sourceOffset + 5];
              baseTangents[tangentOffset + 0] = sceneMesh.geometry.vertices[sourceOffset + 8];
              baseTangents[tangentOffset + 1] = sceneMesh.geometry.vertices[sourceOffset + 9];
              baseTangents[tangentOffset + 2] = sceneMesh.geometry.vertices[sourceOffset + 10];
              baseTangents[tangentOffset + 3] = sceneMesh.geometry.vertices[sourceOffset + 11];
            }

            let jointIndices = readAccessorAsJointIndices(gltf, buffers, jointsAccessor);
            let jointWeights = readAccessorAsFloatArray(gltf, buffers, weightsAccessor, 'VEC4');
            sceneMesh.geometry.skinning = {
              jointIndices,
              jointWeights,
            };

            skinnedPrimitives.push({
              mesh: sceneMesh,
              nodeIndex,
              skinIndex: node.skin,
              basePositions,
              baseNormals,
              baseTangents,
              jointIndices,
              jointWeights,
            });
          }

          meshOrdinal += 1;
        }
      }
    }

    for (const child of node.children ?? []) {
      await visitNode(child);
    }
  };

  for (const rootNode of rootNodes) {
    await visitNode(rootNode);
  }

  const clips: RuntimeAnimationClip[] = (gltf.animations ?? []).map((animation, clipIndex) => {
    const clipChannels: RuntimeAnimationChannel[] = [];
    let durationSeconds = 0;

    for (const channel of animation.channels) {
      if (typeof channel.target.node !== 'number') {
        continue;
      }
      const samplerRef = animation.samplers[channel.sampler];
      if (!samplerRef) {
        continue;
      }
      const input = readAccessorAsFloatArray(gltf, buffers, samplerRef.input, 'SCALAR');
      const expectedType = channel.target.path === 'rotation' ? 'VEC4' : 'VEC3';
      let output = readAccessorAsFloatArray(
        gltf,
        buffers,
        samplerRef.output,
        channel.target.path === 'weights' ? 'SCALAR' : expectedType,
      );
      if (samplerRef.interpolation === 'CUBICSPLINE') {
        const elementSize = channel.target.path === 'rotation' ? 4 : 3;
        const sampled = new Float32Array(input.length * elementSize);
        for (let frameIndex = 0; frameIndex < input.length; frameIndex += 1) {
          const sourceBase = frameIndex * elementSize * 3 + elementSize;
          sampled.set(output.subarray(sourceBase, sourceBase + elementSize), frameIndex * elementSize);
        }
        output = sampled;
      }
      durationSeconds = Math.max(durationSeconds, input.length > 0 ? input[input.length - 1] : 0);
      clipChannels.push({
        nodeIndex: channel.target.node,
        path: channel.target.path,
        sampler: {
          input,
          output,
          interpolation: samplerRef.interpolation ?? 'LINEAR',
          outputElementSize:
            channel.target.path === 'rotation'
              ? 4
              : channel.target.path === 'weights'
                ? Math.max(1, output.length / Math.max(1, input.length))
                : 3,
        },
      });
    }

    return {
      name: animation.name ?? `clip-${clipIndex}`,
      channels: clipChannels,
      durationSeconds,
    };
  });

  const clipByName = new Map<string, RuntimeAnimationClip>();
  for (const clip of clips) {
    clipByName.set(clip.name, clip);
  }

  return {
    nodes: nodeStates,
    rootNodes,
    skins,
    primitiveBindings,
    skinnedPrimitives,
    clips,
    clipByName,
  };
};

type AnimatedRuntimeOptions = {
  playbackSpeed?: number;
  loop?: boolean;
  clipName?: string;
};

const createAnimatedRigController = (
  runtime: AnimatedRuntime,
): AnimatedRigController & { setInitialState: (options: AnimatedRuntimeOptions) => void } => {
  let playbackSpeed = 1;
  let looping = true;
  let playbackTimeSeconds = 0;
  let activeClip: RuntimeAnimationClip | null = runtime.clips[0] ?? null;
  const nodeOverrides = new Map<string, NodePoseOverride>();

  const applyChannelAtTime = (channel: RuntimeAnimationChannel, timeSeconds: number): void => {
    const node = runtime.nodes[channel.nodeIndex];
    if (!node) {
      return;
    }

    const sample = sampleChannel(channel.sampler, timeSeconds);
    const elementSize = channel.sampler.outputElementSize;
    const offsetA = sample.indexA * elementSize;
    const offsetB = sample.indexB * elementSize;
    const data = channel.sampler.output;
    const t = channel.sampler.interpolation === 'STEP' ? 0 : sample.t;

    if (channel.path === 'translation') {
      node.translation = [
        data[offsetA] + (data[offsetB] - data[offsetA]) * t,
        data[offsetA + 1] + (data[offsetB + 1] - data[offsetA + 1]) * t,
        data[offsetA + 2] + (data[offsetB + 2] - data[offsetA + 2]) * t,
      ];
      return;
    }

    if (channel.path === 'scale') {
      node.scale = [
        data[offsetA] + (data[offsetB] - data[offsetA]) * t,
        data[offsetA + 1] + (data[offsetB + 1] - data[offsetA + 1]) * t,
        data[offsetA + 2] + (data[offsetB + 2] - data[offsetA + 2]) * t,
      ];
      return;
    }

    if (channel.path === 'rotation') {
      node.rotation = slerpQuat(
        [data[offsetA], data[offsetA + 1], data[offsetA + 2], data[offsetA + 3]],
        [data[offsetB], data[offsetB + 1], data[offsetB + 2], data[offsetB + 3]],
        t,
      );
      return;
    }

    if (channel.path === 'weights') {
      const nextWeights: number[] = [];
      for (let index = 0; index < elementSize; index += 1) {
        const a = data[offsetA + index] ?? 0;
        const b = data[offsetB + index] ?? a;
        nextWeights.push(a + (b - a) * t);
      }
      node.weights = nextWeights;
    }
  };

  const updateNodeWorldMatrices = (): void => {
    for (const node of runtime.nodes) {
      node.localMatrix = composeTrsMatrix(node.translation, node.rotation, node.scale);
    }

    const visitNode = (nodeIndex: number, parentWorld: Mat4): void => {
      const node = runtime.nodes[nodeIndex];
      if (!node) {
        return;
      }
      node.worldMatrix = mat4Multiply(parentWorld, node.localMatrix);
      for (const child of node.children) {
        visitNode(child, node.worldMatrix);
      }
    };

    const identity = mat4Identity();
    for (const rootNode of runtime.rootNodes) {
      visitNode(rootNode, identity);
    }
  };

  const applySkinnedPrimitives = (): void => {
    const paletteMatricesBySkin = new Map<number, Mat4[]>();

    for (const primitive of runtime.skinnedPrimitives) {
      const skin = runtime.skins[primitive.skinIndex];
      if (!skin) {
        continue;
      }

      const meshWorld = runtime.nodes[primitive.nodeIndex]?.worldMatrix ?? mat4Identity();
      const inverseMeshWorld = invertMat4(meshWorld);
      let paletteMatrices = paletteMatricesBySkin.get(primitive.skinIndex);
      if (!paletteMatrices) {
        paletteMatrices = skin.joints.map((jointNodeIndex, jointIndex) => {
          const jointWorld = runtime.nodes[jointNodeIndex]?.worldMatrix ?? mat4Identity();
          const bindBase = jointIndex * 16;
          const inverseBind = skin.inverseBindMatrices.subarray(bindBase, bindBase + 16);
          const skinMatrix = mat4Multiply(new Float32Array(jointWorld), new Float32Array(inverseBind));
          return mat4Multiply(inverseMeshWorld, skinMatrix);
        });
        paletteMatricesBySkin.set(primitive.skinIndex, paletteMatrices);
      }

      const vertices = primitive.mesh.geometry.vertices;
      const vertexCount = primitive.mesh.geometry.vertexCount;
      for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
        const basePosOffset = vertexIndex * 3;
        const baseTangentOffset = vertexIndex * 4;
        const influenceOffset = vertexIndex * 4;

        let px = 0;
        let py = 0;
        let pz = 0;
        let nx = 0;
        let ny = 0;
        let nz = 0;
        let tx = 0;
        let ty = 0;
        let tz = 0;

        for (let influenceIndex = 0; influenceIndex < 4; influenceIndex += 1) {
          const weight = primitive.jointWeights[influenceOffset + influenceIndex] ?? 0;
          if (weight <= 0) {
            continue;
          }
          const jointIndex = primitive.jointIndices[influenceOffset + influenceIndex] ?? 0;
          const matrix = paletteMatrices[jointIndex] ?? mat4Identity();

          const transformedPosition = transformPoint(
            matrix,
            primitive.basePositions[basePosOffset],
            primitive.basePositions[basePosOffset + 1],
            primitive.basePositions[basePosOffset + 2],
          );
          px += transformedPosition[0] * weight;
          py += transformedPosition[1] * weight;
          pz += transformedPosition[2] * weight;

          const transformedNormal = transformVector(
            matrix,
            primitive.baseNormals[basePosOffset],
            primitive.baseNormals[basePosOffset + 1],
            primitive.baseNormals[basePosOffset + 2],
          );
          nx += transformedNormal[0] * weight;
          ny += transformedNormal[1] * weight;
          nz += transformedNormal[2] * weight;

          const transformedTangent = transformVector(
            matrix,
            primitive.baseTangents[baseTangentOffset],
            primitive.baseTangents[baseTangentOffset + 1],
            primitive.baseTangents[baseTangentOffset + 2],
          );
          tx += transformedTangent[0] * weight;
          ty += transformedTangent[1] * weight;
          tz += transformedTangent[2] * weight;
        }

        const normalizedNormal = normalizeVec3([nx, ny, nz]);
        const normalizedTangent = normalizeVec3([tx, ty, tz]);
        const vertexOffset = vertexIndex * 12;

        vertices[vertexOffset + 0] = px;
        vertices[vertexOffset + 1] = py;
        vertices[vertexOffset + 2] = pz;

        vertices[vertexOffset + 3] = normalizedNormal[0];
        vertices[vertexOffset + 4] = normalizedNormal[1];
        vertices[vertexOffset + 5] = normalizedNormal[2];

        vertices[vertexOffset + 8] = normalizedTangent[0];
        vertices[vertexOffset + 9] = normalizedTangent[1];
        vertices[vertexOffset + 10] = normalizedTangent[2];
      }

      primitive.mesh.geometry.version = (primitive.mesh.geometry.version ?? 0) + 1;
      setMeshTransform(primitive.mesh, meshWorld);
    }
  };

  const applyCurrentPose = (): void => {
    for (const node of runtime.nodes) {
      node.translation = [...node.baseTranslation];
      node.rotation = [...node.baseRotation];
      node.scale = [...node.baseScale];
      node.weights = [...node.baseWeights];
    }

    if (activeClip && activeClip.durationSeconds > 0 && activeClip.channels.length > 0) {
      const playbackTime = looping
        ? ((playbackTimeSeconds % activeClip.durationSeconds) + activeClip.durationSeconds) % activeClip.durationSeconds
        : Math.min(activeClip.durationSeconds, Math.max(0, playbackTimeSeconds));
      for (const channel of activeClip.channels) {
        applyChannelAtTime(channel, playbackTime);
      }
    }

    for (const [nodeName, override] of nodeOverrides.entries()) {
      const node = runtime.nodes.find((candidate) => candidate.name === nodeName);
      if (!node) {
        continue;
      }
      if (override.translation) {
        node.translation = [...override.translation];
      }
      if (override.rotation) {
        node.rotation = normalizeQuaternion([...override.rotation]);
      }
      if (override.scale) {
        node.scale = [...override.scale];
      }
      if (override.weights) {
        node.weights = [...override.weights];
      }
    }

    updateNodeWorldMatrices();

    for (const binding of runtime.primitiveBindings) {
      if (typeof binding.skinIndex === 'number') {
        continue;
      }
      const world = runtime.nodes[binding.nodeIndex]?.worldMatrix;
      if (world) {
        setMeshTransform(binding.mesh, world);
      }
    }

    if (runtime.skinnedPrimitives.length > 0) {
      applySkinnedPrimitives();
    }
  };

  const setInitialState = (options: AnimatedRuntimeOptions): void => {
    playbackSpeed = Number.isFinite(options.playbackSpeed) ? options.playbackSpeed ?? 1 : 1;
    looping = options.loop ?? true;
    if (options.clipName) {
      activeClip = runtime.clipByName.get(options.clipName) ?? activeClip;
    }
    applyCurrentPose();
  };

  return {
    setInitialState,
    update: (deltaTimeSeconds: number) => {
      if (!Number.isFinite(deltaTimeSeconds)) {
        return;
      }
      playbackTimeSeconds += Math.max(0, deltaTimeSeconds) * playbackSpeed;
      applyCurrentPose();
    },
    setPlaybackSpeed: (speed: number) => {
      if (!Number.isFinite(speed)) {
        return;
      }
      playbackSpeed = speed;
    },
    setLooping: (loop: boolean) => {
      looping = loop;
    },
    setClipByName: (clipName: string) => {
      const clip = runtime.clipByName.get(clipName);
      if (!clip) {
        return false;
      }
      activeClip = clip;
      playbackTimeSeconds = 0;
      applyCurrentPose();
      return true;
    },
    clearClip: () => {
      activeClip = null;
      applyCurrentPose();
    },
    setNodePoseOverride: (nodeName: string, override: NodePoseOverride) => {
      nodeOverrides.set(nodeName, { ...override });
      applyCurrentPose();
    },
    clearNodePoseOverride: (nodeName: string) => {
      nodeOverrides.delete(nodeName);
      applyCurrentPose();
    },
    clearAllNodePoseOverrides: () => {
      nodeOverrides.clear();
      applyCurrentPose();
    },
    getClipNames: () => runtime.clips.map((clip) => clip.name),
  };
};

export const loadAnimatedGltfSceneFromUrl = async (
  url: string,
  options: AnimatedRuntimeOptions = {},
): Promise<AnimatedGltfLoadResult> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch glTF asset: ${url}`);
  }
  const source = await response.arrayBuffer();
  const parsedForValidation = parseGltfDocument(await gunzipIfNeeded(source));
  if (isDracoCompressed(parsedForValidation.json)) {
    console.warn(
      'KHR_draco_mesh_compression is not supported by this renderer. Convert the model to plain glTF/GLB before loading.',
      url,
    );
    throw new Error('Draco-compressed glTF is not supported. Convert the model before loading.');
  }
  const staticResult = await loadGltfSceneFromArrayBuffer(source, { baseUrl: url });

  const decompressed = await gunzipIfNeeded(source);
  const parsed = parseGltfDocument(decompressed);
  const buffers = await loadBuffers(parsed.json, url, parsed.binChunk);
  const runtime = await buildAnimatedRuntime(parsed.json, buffers, staticResult.meshes);

  const controller = createAnimatedRigController(runtime);
  controller.setInitialState(options);

  return {
    ...staticResult,
    controller,
  };
};

export const loadAnimatedGltfSceneFromArrayBuffer = async (
  source: ArrayBuffer,
  options: AnimatedRuntimeOptions & { baseUrl?: string } = {},
): Promise<AnimatedGltfLoadResult> => {
  const parsedForValidation = parseGltfDocument(await gunzipIfNeeded(source));
  if (isDracoCompressed(parsedForValidation.json)) {
    console.warn(
      'KHR_draco_mesh_compression is not supported by this renderer. Convert the model to plain glTF/GLB before loading.',
      options.baseUrl,
    );
    throw new Error('Draco-compressed glTF is not supported. Convert the model before loading.');
  }
  const staticResult = await loadGltfSceneFromArrayBuffer(source, { baseUrl: options.baseUrl });
  const decompressed = await gunzipIfNeeded(source);
  const parsed = parseGltfDocument(decompressed);
  const buffers = await loadBuffers(parsed.json, options.baseUrl, parsed.binChunk);
  const runtime = await buildAnimatedRuntime(parsed.json, buffers, staticResult.meshes);
  const controller = createAnimatedRigController(runtime);
  controller.setInitialState(options);

  return {
    ...staticResult,
    controller,
  };
};
