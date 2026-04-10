import { loadGltfSceneFromArrayBuffer } from '@stunner/core/renderer/mesh/GltfLoader';
import type { RenderScene } from '@stunner/core/renderer/mesh/SceneTypes';

const WANDERERS_MODEL_URL = '/models/wanderers/wanderers.glb';

type Bounds = {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
};

const clampProgress = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
};

const fetchArrayBufferWithProgress = async (
  url: string,
  onProgress?: (progress: number) => void,
): Promise<ArrayBuffer> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch GLB asset: ${url}`);
  }

  const contentLengthHeader = response.headers.get('content-length');
  const totalBytes = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : Number.NaN;
  const canTrackProgress = Boolean(response.body) && Number.isFinite(totalBytes) && totalBytes > 0;

  onProgress?.(0);

  if (!canTrackProgress) {
    const source = await response.arrayBuffer();
    onProgress?.(1);
    return source;
  }

  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (value) {
      chunks.push(value);
      loadedBytes += value.byteLength;
      onProgress?.(clampProgress(loadedBytes / totalBytes));
    }
  }

  const merged = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  onProgress?.(1);
  return merged.buffer;
};

const identityMatrix: number[] = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

const isWaterMaterial = (materialName: string | undefined): boolean => {
  const normalized = String(materialName ?? '').trim().toLowerCase();
  return normalized === 'mat.1' || normalized.includes('water');
};

const getMeshBounds = (mesh: RenderScene['meshes'][number]): Bounds => {
  const transform = mesh.transform ?? identityMatrix;
  const vertices = mesh.geometry.vertices;
  const stride = 12;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < mesh.geometry.vertexCount; index += 1) {
    const base = index * stride;
    const x = vertices[base + 0];
    const y = vertices[base + 1];
    const z = vertices[base + 2];
    const worldX = transform[0] * x + transform[4] * y + transform[8] * z + transform[12];
    const worldY = transform[1] * x + transform[5] * y + transform[9] * z + transform[13];
    const worldZ = transform[2] * x + transform[6] * y + transform[10] * z + transform[14];
    minX = Math.min(minX, worldX);
    minY = Math.min(minY, worldY);
    minZ = Math.min(minZ, worldZ);
    maxX = Math.max(maxX, worldX);
    maxY = Math.max(maxY, worldY);
    maxZ = Math.max(maxZ, worldZ);
  }

  return { minX, minY, minZ, maxX, maxY, maxZ };
};

const getCombinedBounds = (meshes: RenderScene['meshes']): Bounds | null => {
  if (meshes.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const mesh of meshes) {
    const bounds = getMeshBounds(mesh);
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    minZ = Math.min(minZ, bounds.minZ);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
    maxZ = Math.max(maxZ, bounds.maxZ);
  }

  return { minX, minY, minZ, maxX, maxY, maxZ };
};

export type WanderersExampleOptions = Record<string, never>;

export const DEFAULT_WANDERERS_OPTIONS: WanderersExampleOptions = {};

export type WanderersExampleController = {
  setOptions: (_options: WanderersExampleOptions) => void;
  dispose: () => void;
};

export const startWanderersExample = (
  applyScene: (scene: RenderScene) => void,
  _initialOptions?: Partial<WanderersExampleOptions>,
  onLoadingProgress?: (progress: number | null) => void,
): WanderersExampleController => {
  let disposed = false;
  let loadedDispose: (() => void) | null = null;

  void fetchArrayBufferWithProgress(WANDERERS_MODEL_URL, (progress) => {
    if (disposed) {
      return;
    }
    onLoadingProgress?.(progress);
  })
    .then((source) => {
      return loadGltfSceneFromArrayBuffer(source, { baseUrl: WANDERERS_MODEL_URL });
    })
    .then((result) => {
      if (disposed) {
        result.dispose();
        return;
      }

      const waterMeshes = result.meshes.filter((mesh) => isWaterMaterial(mesh.material.name));
      const waterBounds = getCombinedBounds(waterMeshes);

      for (const waterMesh of waterMeshes) {
        waterMesh.material.transparent = true;
        waterMesh.material.twoSided = true;
        waterMesh.material.uvScaleOffset = [16, 16, 0, 0];
        waterMesh.material.baseColor = [0.03, 0.34, 0.38, 0.58];
        waterMesh.material.metallic = 0.0;
        waterMesh.material.roughness = 0.08;
        waterMesh.material.clearCoatFactor = 1.75;
        waterMesh.material.clearCoatRoughness = 0.1;
        waterMesh.material.refractionStrength = 1.62;
        waterMesh.material.ior = 1.33;
        waterMesh.material.refractionSteps = 18;
        waterMesh.material.refractionDepthBias = 0.02;
        waterMesh.material.emissive = [0.01, 0.08, 0.1];
        waterMesh.material.emissiveIntensity = 0.25;
        waterMesh.material.castsShadows = false;
      }

      loadedDispose = result.dispose;
      const scene: RenderScene = {
        meshes: result.meshes,
        textureLibrary: result.textureLibrary,
        lights: [],
        reflectionProbes: waterBounds
          ? [
              {
                position: [
                  (waterBounds.minX + waterBounds.maxX) * 0.5,
                  (waterBounds.minY + waterBounds.maxY) * 0.5 + 0.45,
                  (waterBounds.minZ + waterBounds.maxZ) * 0.5,
                ],
                radius: Math.max(
                  6,
                  Math.hypot(waterBounds.maxX - waterBounds.minX, waterBounds.maxZ - waterBounds.minZ) * 0.55,
                ),
                strength: 1,
                tint: [1, 1, 1],
              },
            ]
          : undefined,
        planarReflections: waterBounds
          ? [
              {
                normal: [0, 1, 0],
                offset: -((waterBounds.minY + waterBounds.maxY) * 0.5),
                fadeStart: 0.01,
                fadeEnd: 2.2,
                strength: 1,
              },
            ]
          : undefined,
      };
      applyScene(scene);
      onLoadingProgress?.(null);
    })
    .catch((error: unknown) => {
      onLoadingProgress?.(null);
      console.warn('Wanderers example failed to load.', error);
    });

  return {
    setOptions: () => {},
    dispose: () => {
      disposed = true;
      onLoadingProgress?.(null);
      if (loadedDispose) {
        loadedDispose();
        loadedDispose = null;
      }
    },
  };
};
