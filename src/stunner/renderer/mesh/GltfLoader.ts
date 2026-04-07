import { createDefaultMaterial, type PbrMaterial } from './MaterialTypes';
import { VERTEX_STRIDE_BYTES, type MeshGeometry } from './MeshTypes';
import {
  mat4Identity,
  mat4Multiply,
  type Mat4,
  type SceneMeshInstance,
} from './SceneTypes';

type GltfAccessor = {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT2' | 'MAT3' | 'MAT4';
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

type GltfTextureInfo = {
  index: number;
  extensions?: {
    KHR_texture_transform?: {
      offset?: [number, number];
      scale?: [number, number];
    };
  };
};

type GltfPbrMaterial = {
  baseColorFactor?: [number, number, number, number];
  baseColorTexture?: GltfTextureInfo;
  metallicFactor?: number;
  roughnessFactor?: number;
  metallicRoughnessTexture?: GltfTextureInfo;
};

type GltfMaterial = {
  name?: string;
  pbrMetallicRoughness?: GltfPbrMaterial;
  occlusionTexture?: GltfTextureInfo;
  normalTexture?: GltfTextureInfo;
  emissiveTexture?: GltfTextureInfo;
  emissiveFactor?: [number, number, number];
  alphaMode?: 'OPAQUE' | 'MASK' | 'BLEND';
  doubleSided?: boolean;
  extensions?: {
    KHR_materials_emissive_strength?: {
      emissiveStrength?: number;
    };
    KHR_materials_clearcoat?: {
      clearcoatFactor?: number;
      clearcoatRoughnessFactor?: number;
      clearcoatTexture?: GltfTextureInfo;
      clearcoatRoughnessTexture?: GltfTextureInfo;
      clearcoatNormalTexture?: GltfTextureInfo;
    };
    KHR_materials_anisotropy?: {
      anisotropyStrength?: number;
      anisotropyRotation?: number;
      anisotropyTexture?: GltfTextureInfo;
    };
  };
};

type GltfPrimitive = {
  attributes: {
    POSITION?: number;
    NORMAL?: number;
    TEXCOORD_0?: number;
    TANGENT?: number;
  };
  indices?: number;
  material?: number;
  extensions?: {
    KHR_draco_mesh_compression?: unknown;
  };
};

type GltfMesh = {
  name?: string;
  primitives: GltfPrimitive[];
};

type GltfNode = {
  name?: string;
  mesh?: number;
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
};

type GltfImage = {
  uri?: string;
  mimeType?: string;
  bufferView?: number;
};

type GltfTexture = {
  source?: number;
  extensions?: {
    KHR_texture_basisu?: {
      source?: number;
    };
  };
};

type GltfScene = {
  nodes?: number[];
};

type GltfDocument = {
  buffers?: GltfBuffer[];
  bufferViews?: GltfBufferView[];
  accessors?: GltfAccessor[];
  materials?: GltfMaterial[];
  meshes?: GltfMesh[];
  nodes?: GltfNode[];
  images?: GltfImage[];
  textures?: GltfTexture[];
  scenes?: GltfScene[];
  scene?: number;
  extensionsUsed?: string[];
  extensionsRequired?: string[];
};

type LoadedImageMap = {
  textureUris: Map<number, string>;
  dispose: () => void;
};

export type GltfLoadResult = {
  meshes: SceneMeshInstance[];
  textureLibrary: Record<string, string>;
  dispose: () => void;
};

const textureLibraryIdForTextureIndex = (textureIndex: number): string => {
  return `gltf-texture-${textureIndex}`;
};

const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const GLB_MAGIC = 0x46546c67;
const F32_PER_VERTEX = VERTEX_STRIDE_BYTES / 4;

const COMPONENT_BYTE_SIZE: Record<number, number> = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
};

const TYPE_COMPONENT_COUNT: Record<GltfAccessor['type'], number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
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
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes.buffer;
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
  for (const mesh of gltf.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      if (primitive.extensions?.KHR_draco_mesh_compression) {
        return true;
      }
    }
  }
  return false;
};

const readBufferViewRange = (
  gltf: GltfDocument,
  bufferIndexData: ArrayBuffer[],
  bufferViewIndex: number,
): { data: ArrayBuffer; byteOffset: number; byteLength: number; byteStride?: number } => {
  const bufferViews = gltf.bufferViews ?? [];
  const view = bufferViews[bufferViewIndex];
  if (!view) {
    throw new Error(`glTF bufferView ${bufferViewIndex} is missing.`);
  }
  const sourceBuffer = bufferIndexData[view.buffer];
  if (!sourceBuffer) {
    throw new Error(`glTF buffer ${view.buffer} is missing.`);
  }
  const byteOffset = view.byteOffset ?? 0;
  const byteLength = view.byteLength;
  return {
    data: sourceBuffer,
    byteOffset,
    byteLength,
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
  bufferIndexData: ArrayBuffer[],
  accessorIndex: number,
  expectedType: 'VEC2' | 'VEC3' | 'VEC4',
): Float32Array => {
  const accessors = gltf.accessors ?? [];
  const accessor = accessors[accessorIndex];
  if (!accessor) {
    throw new Error(`glTF accessor ${accessorIndex} is missing.`);
  }
  if (accessor.type !== expectedType) {
    throw new Error(`Accessor ${accessorIndex} expected ${expectedType}, got ${accessor.type}.`);
  }
  if (typeof accessor.bufferView !== 'number') {
    return new Float32Array(accessor.count * TYPE_COMPONENT_COUNT[accessor.type]);
  }

  const componentCount = TYPE_COMPONENT_COUNT[accessor.type];
  const componentSize = COMPONENT_BYTE_SIZE[accessor.componentType];
  if (!componentSize) {
    throw new Error(`Unsupported component type ${accessor.componentType}.`);
  }

  const bufferView = readBufferViewRange(gltf, bufferIndexData, accessor.bufferView);
  const accessorOffset = accessor.byteOffset ?? 0;
  const stride = bufferView.byteStride ?? componentCount * componentSize;
  const baseOffset = bufferView.byteOffset + accessorOffset;

  const out = new Float32Array(accessor.count * componentCount);
  const view = new DataView(bufferView.data);

  for (let i = 0; i < accessor.count; i++) {
    const elementOffset = baseOffset + i * stride;
    for (let c = 0; c < componentCount; c++) {
      const componentOffset = elementOffset + c * componentSize;
      const raw = readComponent(view, accessor.componentType, componentOffset);
      const value = accessor.normalized
        ? normalizeComponent(raw, accessor.componentType)
        : raw;
      out[i * componentCount + c] = value;
    }
  }

  return out;
};

const readIndicesAccessor = (
  gltf: GltfDocument,
  bufferIndexData: ArrayBuffer[],
  accessorIndex: number,
): Uint32Array => {
  const accessors = gltf.accessors ?? [];
  const accessor = accessors[accessorIndex];
  if (!accessor) {
    throw new Error(`glTF index accessor ${accessorIndex} is missing.`);
  }
  if (accessor.type !== 'SCALAR') {
    throw new Error(`Index accessor ${accessorIndex} must be SCALAR.`);
  }
  if (typeof accessor.bufferView !== 'number') {
    throw new Error(`Index accessor ${accessorIndex} has no bufferView.`);
  }

  if (accessor.componentType !== 5121 && accessor.componentType !== 5123 && accessor.componentType !== 5125) {
    throw new Error(`Unsupported index component type ${accessor.componentType}.`);
  }

  const componentSize = COMPONENT_BYTE_SIZE[accessor.componentType];
  const bufferView = readBufferViewRange(gltf, bufferIndexData, accessor.bufferView);
  const accessorOffset = accessor.byteOffset ?? 0;
  const stride = bufferView.byteStride ?? componentSize;
  const baseOffset = bufferView.byteOffset + accessorOffset;

  const out = new Uint32Array(accessor.count);
  const view = new DataView(bufferView.data);
  for (let i = 0; i < accessor.count; i++) {
    const byteOffset = baseOffset + i * stride;
    out[i] = readComponent(view, accessor.componentType, byteOffset);
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

const nodeLocalMatrix = (node: GltfNode): Mat4 => {
  if (node.matrix) {
    return new Float32Array(node.matrix);
  }
  const translation: [number, number, number] = node.translation ?? [0, 0, 0];
  const rotation: [number, number, number, number] = node.rotation ?? [0, 0, 0, 1];
  const scale: [number, number, number] = node.scale ?? [1, 1, 1];
  return composeTrsMatrix(translation, rotation, scale);
};

const computeFallbackNormals = (positions: Float32Array, indices: Uint32Array): Float32Array => {
  const normals = new Float32Array((positions.length / 3) * 3);
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    const e1x = positions[i1] - positions[i0];
    const e1y = positions[i1 + 1] - positions[i0 + 1];
    const e1z = positions[i1 + 2] - positions[i0 + 2];
    const e2x = positions[i2] - positions[i0];
    const e2y = positions[i2 + 1] - positions[i0 + 1];
    const e2z = positions[i2 + 2] - positions[i0 + 2];

    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    normals[i0] += nx;
    normals[i0 + 1] += ny;
    normals[i0 + 2] += nz;
    normals[i1] += nx;
    normals[i1 + 1] += ny;
    normals[i1 + 2] += nz;
    normals[i2] += nx;
    normals[i2 + 1] += ny;
    normals[i2 + 2] += nz;
  }

  for (let v = 0; v < normals.length; v += 3) {
    const len = Math.hypot(normals[v], normals[v + 1], normals[v + 2]) || 1;
    normals[v] /= len;
    normals[v + 1] /= len;
    normals[v + 2] /= len;
  }

  return normals;
};

const computeFallbackTangents = (
  positions: Float32Array,
  normals: Float32Array,
  uvs: Float32Array,
  indices: Uint32Array,
): Float32Array => {
  const vertexCount = positions.length / 3;
  const tanX = new Float32Array(vertexCount);
  const tanY = new Float32Array(vertexCount);
  const tanZ = new Float32Array(vertexCount);

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i];
    const i1 = indices[i + 1];
    const i2 = indices[i + 2];

    const p0 = i0 * 3;
    const p1 = i1 * 3;
    const p2 = i2 * 3;
    const uv0 = i0 * 2;
    const uv1 = i1 * 2;
    const uv2 = i2 * 2;

    const e1x = positions[p1] - positions[p0];
    const e1y = positions[p1 + 1] - positions[p0 + 1];
    const e1z = positions[p1 + 2] - positions[p0 + 2];
    const e2x = positions[p2] - positions[p0];
    const e2y = positions[p2 + 1] - positions[p0 + 1];
    const e2z = positions[p2 + 2] - positions[p0 + 2];

    const du1 = uvs[uv1] - uvs[uv0];
    const dv1 = uvs[uv1 + 1] - uvs[uv0 + 1];
    const du2 = uvs[uv2] - uvs[uv0];
    const dv2 = uvs[uv2 + 1] - uvs[uv0 + 1];

    const det = du1 * dv2 - du2 * dv1;
    const r = det !== 0 ? 1 / det : 0;
    const tx = (dv2 * e1x - dv1 * e2x) * r;
    const ty = (dv2 * e1y - dv1 * e2y) * r;
    const tz = (dv2 * e1z - dv1 * e2z) * r;

    tanX[i0] += tx;
    tanY[i0] += ty;
    tanZ[i0] += tz;
    tanX[i1] += tx;
    tanY[i1] += ty;
    tanZ[i1] += tz;
    tanX[i2] += tx;
    tanY[i2] += ty;
    tanZ[i2] += tz;
  }

  const tangents = new Float32Array(vertexCount * 4);
  for (let i = 0; i < vertexCount; i++) {
    const ni = i * 3;
    let tx = tanX[i];
    let ty = tanY[i];
    let tz = tanZ[i];

    const nx = normals[ni];
    const ny = normals[ni + 1];
    const nz = normals[ni + 2];

    const dot = tx * nx + ty * ny + tz * nz;
    tx -= nx * dot;
    ty -= ny * dot;
    tz -= nz * dot;

    const len = Math.hypot(tx, ty, tz) || 1;
    tangents[i * 4] = tx / len;
    tangents[i * 4 + 1] = ty / len;
    tangents[i * 4 + 2] = tz / len;
    tangents[i * 4 + 3] = 1;
  }
  return tangents;
};

const buildGeometry = (
  gltf: GltfDocument,
  bufferIndexData: ArrayBuffer[],
  primitive: GltfPrimitive,
): MeshGeometry => {

  if (typeof primitive.attributes.POSITION !== 'number') {
    throw new Error('glTF primitive is missing POSITION attribute.');
  }

  const positions = readAccessorAsFloatArray(gltf, bufferIndexData, primitive.attributes.POSITION, 'VEC3');
  const vertexCount = positions.length / 3;
  const indices =
    typeof primitive.indices === 'number'
      ? readIndicesAccessor(gltf, bufferIndexData, primitive.indices)
      : (() => {
          const generated = new Uint32Array(vertexCount);
          for (let i = 0; i < vertexCount; i++) {
            generated[i] = i;
          }
          return generated;
        })();

  const normals =
    typeof primitive.attributes.NORMAL === 'number'
      ? readAccessorAsFloatArray(gltf, bufferIndexData, primitive.attributes.NORMAL, 'VEC3')
      : computeFallbackNormals(positions, indices);

  const uvs =
    typeof primitive.attributes.TEXCOORD_0 === 'number'
      ? readAccessorAsFloatArray(gltf, bufferIndexData, primitive.attributes.TEXCOORD_0, 'VEC2')
      : new Float32Array(vertexCount * 2);

  const tangents =
    typeof primitive.attributes.TANGENT === 'number'
      ? readAccessorAsFloatArray(gltf, bufferIndexData, primitive.attributes.TANGENT, 'VEC4')
      : computeFallbackTangents(positions, normals, uvs, indices);

  const vertices = new Float32Array(vertexCount * F32_PER_VERTEX);
  for (let i = 0; i < vertexCount; i++) {
    const vi = i * F32_PER_VERTEX;
    const pi = i * 3;
    const ui = i * 2;
    const ti = i * 4;

    vertices[vi] = positions[pi];
    vertices[vi + 1] = positions[pi + 1];
    vertices[vi + 2] = positions[pi + 2];

    vertices[vi + 3] = normals[pi];
    vertices[vi + 4] = normals[pi + 1];
    vertices[vi + 5] = normals[pi + 2];

    vertices[vi + 6] = uvs[ui];
    vertices[vi + 7] = uvs[ui + 1];

    vertices[vi + 8] = tangents[ti];
    vertices[vi + 9] = tangents[ti + 1];
    vertices[vi + 10] = tangents[ti + 2];
    vertices[vi + 11] = tangents[ti + 3];
  }

  return {
    vertices,
    indices,
    vertexCount,
    indexCount: indices.length,
  };
};

const mapTextureUris = (
  gltf: GltfDocument,
  resolvedImageUris: string[],
): LoadedImageMap => {
  const textures = gltf.textures ?? [];
  const textureUris = new Map<number, string>();
  const blobUris: string[] = [];

  for (let i = 0; i < resolvedImageUris.length; i++) {
    const uri = resolvedImageUris[i];
    if (uri.startsWith('blob:')) {
      blobUris.push(uri);
    }
  }

  for (let i = 0; i < textures.length; i++) {
    const texture = textures[i];
    const sourceIndex = texture.extensions?.KHR_texture_basisu?.source ?? texture.source;
    if (typeof sourceIndex === 'number') {
      const uri = resolvedImageUris[sourceIndex];
      if (uri) {
        textureUris.set(i, uri);
      }
    }
  }

  return {
    textureUris,
    dispose: () => {
      for (const uri of blobUris) {
        URL.revokeObjectURL(uri);
      }
    },
  };
};

const materialFromGltf = (
  material: GltfMaterial | undefined,
  textureUris: Map<number, string>,
  materialIndex: number,
): PbrMaterial => {
  const pbr = material?.pbrMetallicRoughness;
  const baseColor = pbr?.baseColorFactor ?? [1, 1, 1, 1];
  const emissive = material?.emissiveFactor ?? [0, 0, 0];
  const emissiveStrength = material?.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1;
  const clearcoatExtension = material?.extensions?.KHR_materials_clearcoat;
  const anisotropyExtension = material?.extensions?.KHR_materials_anisotropy;

  const baseColorTextureIndex = pbr?.baseColorTexture?.index;
  const ormTextureIndex = pbr?.metallicRoughnessTexture?.index;
  const aoTextureIndex = material?.occlusionTexture?.index;
  const normalTextureIndex = material?.normalTexture?.index;
  const anisotropyTextureIndex = anisotropyExtension?.anisotropyTexture?.index;
  const emissiveTextureIndex = material?.emissiveTexture?.index;

  const uvScale = material?.normalTexture?.extensions?.KHR_texture_transform?.scale;
  const uvOffset = material?.normalTexture?.extensions?.KHR_texture_transform?.offset;

  const out = createDefaultMaterial({
    name: material?.name ?? `gltf-material-${materialIndex}`,
    baseColor,
    metallic: pbr?.metallicFactor ?? 1,
    roughness: pbr?.roughnessFactor ?? 1,
    clearCoatFactor: clearcoatExtension?.clearcoatFactor ?? 0,
    clearCoatRoughness: clearcoatExtension?.clearcoatRoughnessFactor ?? 0,
    anisotropyStrength: anisotropyExtension?.anisotropyStrength ?? 0,
    anisotropyRotation: anisotropyExtension?.anisotropyRotation ?? 0,
    emissive,
    emissiveIntensity: emissiveStrength,
    twoSided: material?.doubleSided ?? false,
    transparent: material?.alphaMode === 'BLEND',
    uvScaleOffset: [
      uvScale?.[0] ?? 1,
      uvScale?.[1] ?? 1,
      uvOffset?.[0] ?? 0,
      uvOffset?.[1] ?? 0,
    ],
    textures: {},
    textureIds: {
      baseColor:
        typeof baseColorTextureIndex === 'number' && textureUris.has(baseColorTextureIndex)
          ? textureLibraryIdForTextureIndex(baseColorTextureIndex)
          : undefined,
      orm:
        typeof ormTextureIndex === 'number' && textureUris.has(ormTextureIndex)
          ? textureLibraryIdForTextureIndex(ormTextureIndex)
          : undefined,
      ao:
        typeof aoTextureIndex === 'number' && textureUris.has(aoTextureIndex)
          ? textureLibraryIdForTextureIndex(aoTextureIndex)
          : undefined,
      normal:
        typeof normalTextureIndex === 'number' && textureUris.has(normalTextureIndex)
          ? textureLibraryIdForTextureIndex(normalTextureIndex)
          : undefined,
      anisotropy:
        typeof anisotropyTextureIndex === 'number' && textureUris.has(anisotropyTextureIndex)
          ? textureLibraryIdForTextureIndex(anisotropyTextureIndex)
          : undefined,
      emissive:
        typeof emissiveTextureIndex === 'number' && textureUris.has(emissiveTextureIndex)
          ? textureLibraryIdForTextureIndex(emissiveTextureIndex)
          : undefined,
    },
  });

  return out;
};

const loadBuffers = async (
  gltf: GltfDocument,
  baseUrl: string | undefined,
  binChunk?: ArrayBuffer,
): Promise<ArrayBuffer[]> => {
  const buffers = gltf.buffers ?? [];
  const out: ArrayBuffer[] = [];

  for (let i = 0; i < buffers.length; i++) {
    const buffer = buffers[i];
    if (i === 0 && binChunk) {
      out.push(binChunk);
      continue;
    }

    if (!buffer.uri) {
      throw new Error(`glTF buffer ${i} is missing URI and has no GLB BIN chunk.`);
    }

    const resolved = resolveUri(buffer.uri, baseUrl);
    if (resolved.startsWith('data:')) {
      out.push(decodeDataUri(resolved));
    } else {
      const response = await fetch(resolved);
      if (!response.ok) {
        throw new Error(`Failed to fetch glTF buffer: ${resolved}`);
      }
      out.push(await response.arrayBuffer());
    }
  }

  return out;
};

const loadImages = async (
  gltf: GltfDocument,
  baseUrl: string | undefined,
  buffers: ArrayBuffer[],
): Promise<string[]> => {
  const images = gltf.images ?? [];
  const resolvedUris: string[] = new Array(images.length);

  for (let i = 0; i < images.length; i++) {
    const image = images[i];

    if (image.uri) {
      resolvedUris[i] = resolveUri(image.uri, baseUrl);
      continue;
    }

    if (typeof image.bufferView === 'number') {
      const view = readBufferViewRange(gltf, buffers, image.bufferView);
      const byteSlice = view.data.slice(view.byteOffset, view.byteOffset + view.byteLength);
      const mimeType = image.mimeType ?? 'application/octet-stream';
      resolvedUris[i] = URL.createObjectURL(new Blob([byteSlice], { type: mimeType }));
      continue;
    }

    throw new Error(`glTF image ${i} does not define uri or bufferView.`);
  }

  return resolvedUris;
};

const extractSceneMeshInstances = (
  gltf: GltfDocument,
  buffers: ArrayBuffer[],
  textureUris: Map<number, string>,
): SceneMeshInstance[] => {
  const meshes = gltf.meshes ?? [];
  const nodes = gltf.nodes ?? [];
  const scenes = gltf.scenes ?? [];

  const defaultSceneIndex = gltf.scene ?? 0;
  const defaultScene = scenes[defaultSceneIndex];
  const rootNodes = defaultScene?.nodes ?? nodes.map((_, index) => index);

  const sceneMeshInstances: SceneMeshInstance[] = [];

  const visitNode = (nodeIndex: number, parentMatrix: Mat4): void => {
    const node = nodes[nodeIndex];
    if (!node) {
      return;
    }

    const local = nodeLocalMatrix(node);
    const world = mat4Multiply(parentMatrix, local);

    if (typeof node.mesh === 'number') {
      const mesh = meshes[node.mesh];
      if (mesh) {
        for (const primitive of mesh.primitives) {
          const geometry = buildGeometry(gltf, buffers, primitive);
          const materialIndex = primitive.material ?? -1;
          const material =
            materialIndex >= 0
              ? materialFromGltf(gltf.materials?.[materialIndex], textureUris, materialIndex)
              : createDefaultMaterial({ name: mesh.name ?? node.name ?? 'gltf-default-material' });

          sceneMeshInstances.push({
            geometry,
            material,
            transform: world,
          });
        }
      }
    }

    for (const childIndex of node.children ?? []) {
      visitNode(childIndex, world);
    }
  };

  const identity = mat4Identity();
  for (const rootNode of rootNodes) {
    visitNode(rootNode, identity);
  }

  return sceneMeshInstances;
};

const loadGltfDocument = async (
  source: ArrayBuffer,
  baseUrl: string | undefined,
): Promise<GltfLoadResult> => {
  const decompressed = await gunzipIfNeeded(source);
  const parsed = parseGltfDocument(decompressed);
  if (isDracoCompressed(parsed.json)) {
    console.warn(
      'KHR_draco_mesh_compression is not supported by this renderer. Convert the model to plain glTF/GLB before loading.',
      baseUrl,
    );
    throw new Error('Draco-compressed glTF is not supported. Convert the model before loading.');
  }
  const buffers = await loadBuffers(parsed.json, baseUrl, parsed.binChunk);
  const images = await loadImages(parsed.json, baseUrl, buffers);
  const loadedImageMap = mapTextureUris(parsed.json, images);
  const textureLibrary: Record<string, string> = {};
  for (const [textureIndex, textureUri] of loadedImageMap.textureUris.entries()) {
    textureLibrary[textureLibraryIdForTextureIndex(textureIndex)] = textureUri;
  }

  const meshes = extractSceneMeshInstances(parsed.json, buffers, loadedImageMap.textureUris);

  return {
    meshes,
    textureLibrary,
    dispose: () => {
      loadedImageMap.dispose();
    },
  };
};

export const loadGltfSceneFromArrayBuffer = async (
  source: ArrayBuffer,
  options: { baseUrl?: string } = {},
): Promise<GltfLoadResult> => {
  return await loadGltfDocument(source, options.baseUrl);
};

export const loadGltfSceneFromUrl = async (url: string): Promise<GltfLoadResult> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch glTF asset: ${url}`);
  }
  const source = await response.arrayBuffer();
  return await loadGltfDocument(source, url);
};
