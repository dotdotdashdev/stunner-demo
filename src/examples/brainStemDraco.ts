import {
  loadAnimatedGltfSceneFromArrayBuffer,
  type AnimatedGltfLoadResult,
} from '@dotdotdash/stunner-core/renderer/mesh/AnimatedGltfLoader';
import {
  mat4Identity,
  mat4Multiply,
  mat4Translation,
  type Mat4,
  type RenderScene,
  type SceneMeshInstance,
} from '@dotdotdash/stunner-core/renderer/mesh/SceneTypes';
import type { RenderLight } from '@dotdotdash/stunner-core/renderer/lights/LightTypes';
import { decodeDracoGltfFromUrlToArrayBuffer } from '@dotdotdash/stunner-draco';

const BRAIN_STEM_DRACO_MODEL_URL = '/models/brain-stem/BrainStem.gltf';

const BRAIN_STEM_DRACO_SCENE_LIGHTS: RenderLight[] = [
  {
    id: 1,
    type: 'directional',
    direction: [-0.35, -0.9, -0.2],
    color: [1.0, 0.96, 0.9],
    intensity: 8.0,
    castsShadows: true,
    shadowIndex: 0,
  },
];

export type BrainStemDracoExampleOptions = {
  animationSpeed: number;
};

export const DEFAULT_BRAIN_STEM_DRACO_OPTIONS: BrainStemDracoExampleOptions = {
  animationSpeed: 1,
};

export type BrainStemDracoExampleController = {
  beforeFrame: (deltaTimeSeconds: number) => void;
  setOptions: (_options: BrainStemDracoExampleOptions) => void;
  dispose: () => void;
};

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

const transformPoint = (matrix: Mat4, x: number, y: number, z: number): [number, number, number] => {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
};

const getWorldBounds = (mesh: SceneMeshInstance): Bounds => {
  const transform = mesh.transform ?? mat4Identity();
  const stride = 12;
  const vertices = mesh.geometry.vertices;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < mesh.geometry.vertexCount; index += 1) {
    const base = index * stride;
    const point = transformPoint(transform, vertices[base], vertices[base + 1], vertices[base + 2]);
    minX = Math.min(minX, point[0]);
    maxX = Math.max(maxX, point[0]);
    minY = Math.min(minY, point[1]);
    maxY = Math.max(maxY, point[1]);
    minZ = Math.min(minZ, point[2]);
    maxZ = Math.max(maxZ, point[2]);
  }

  return { minX, maxX, minY, maxY, minZ, maxZ };
};

const getCombinedBounds = (meshes: SceneMeshInstance[]): Bounds | null => {
  if (meshes.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const mesh of meshes) {
    const bounds = getWorldBounds(mesh);
    minX = Math.min(minX, bounds.minX);
    maxX = Math.max(maxX, bounds.maxX);
    minY = Math.min(minY, bounds.minY);
    maxY = Math.max(maxY, bounds.maxY);
    minZ = Math.min(minZ, bounds.minZ);
    maxZ = Math.max(maxZ, bounds.maxZ);
  }

  return { minX, maxX, minY, maxY, minZ, maxZ };
};

const placeAtGroundCenter = (meshes: SceneMeshInstance[]): void => {
  const bounds = getCombinedBounds(meshes);
  if (!bounds) {
    return;
  }

  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
  const liftY = -bounds.minY;
  const offset = mat4Translation(-centerX, liftY, -centerZ);

  for (const mesh of meshes) {
    const baseTransform = mesh.transform ?? mat4Identity();
    mesh.transform = mat4Multiply(offset, baseTransform);
  }
};

export const startBrainStemDracoExample = (
  applyScene: (scene: RenderScene) => void,
  initialOptions?: Partial<BrainStemDracoExampleOptions>,
  onLoadingProgress?: (progress: number | null) => void,
): BrainStemDracoExampleController => {
  let disposed = false;
  let loadedResult: AnimatedGltfLoadResult | null = null;
  let options: BrainStemDracoExampleOptions = {
    ...DEFAULT_BRAIN_STEM_DRACO_OPTIONS,
    ...initialOptions,
  };

  const applyAnimationSpeed = (): void => {
    if (!loadedResult) {
      return;
    }
    loadedResult.controller.setPlaybackSpeed(Math.max(0, Math.min(2, options.animationSpeed)));
  };

  onLoadingProgress?.(0);

  void decodeDracoGltfFromUrlToArrayBuffer(BRAIN_STEM_DRACO_MODEL_URL)
    .then((decodedSource) => {
      return loadAnimatedGltfSceneFromArrayBuffer(decodedSource, {
        baseUrl: BRAIN_STEM_DRACO_MODEL_URL,
        loop: true,
        playbackSpeed: 1,
      });
    })
    .then((result) => {
      if (disposed) {
        result.dispose();
        return;
      }

      loadedResult = result;
      placeAtGroundCenter(result.meshes);

      const clipNames = result.controller.getClipNames();
      if (clipNames.length > 0) {
        result.controller.setClipByName(clipNames[0]);
      }
      applyAnimationSpeed();

      const scene: RenderScene = {
        meshes: result.meshes,
        textureLibrary: result.textureLibrary,
        lights: BRAIN_STEM_DRACO_SCENE_LIGHTS,
      };
      applyScene(scene);
      onLoadingProgress?.(null);
    })
    .catch((error: unknown) => {
      onLoadingProgress?.(null);
      console.warn('Brain-stem Draco example failed to load.', error);
    });

  return {
    beforeFrame: (deltaTimeSeconds: number) => {
      if (!loadedResult) {
        return;
      }

      loadedResult.controller.update(deltaTimeSeconds);
    },
    setOptions: (nextOptions: BrainStemDracoExampleOptions) => {
      options = {
        ...options,
        ...nextOptions,
      };
      applyAnimationSpeed();
    },
    dispose: () => {
      disposed = true;
      onLoadingProgress?.(null);
      if (!loadedResult) {
        return;
      }
      loadedResult.dispose();
      loadedResult = null;
    },
  };
};
